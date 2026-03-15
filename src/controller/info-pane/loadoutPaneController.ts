import { StatType, WeaponSkillType, StatOwnerType, STAT_ATTRIBUTION } from '../../consts/enums';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { LoadoutStats } from '../../view/InformationPane';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../../utils/loadoutRegistry';
import { Gear } from '../../model/gears/gear';
import { DataDrivenOperator } from '../../model/operators/dataDrivenOperator';
import { getOperatorConfig } from '../operators/operatorRegistry';
import { interpolateAttack } from '../../model/weapons/weapon';
import { aggregateLoadoutStats, weaponSkillStat, AggregatedStats } from '../calculation/loadoutAggregator';
import { getWeaponEffects } from '../../consts/weaponSkillEffects';

// ── Stat display helpers (shared with view) ─────────────────────────────────

const PERCENT_STATS = new Set<StatType>([
  StatType.ATTACK_BONUS, StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS,
  StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.PHYSICAL_RESISTANCE, StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
  StatType.CRYO_RESISTANCE, StatType.NATURE_RESISTANCE, StatType.AETHER_RESISTANCE,
  StatType.TREATMENT_BONUS, StatType.TREATMENT_RECEIVED_BONUS,
  StatType.COMBO_SKILL_COOLDOWN_REDUCTION, StatType.ULTIMATE_GAIN_EFFICIENCY,
  StatType.STAGGER_EFFICIENCY_BONUS,
  StatType.PHYSICAL_DAMAGE_BONUS, StatType.HEAT_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS,
  StatType.CRYO_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS,
  StatType.BASIC_ATTACK_DAMAGE_BONUS, StatType.BATTLE_SKILL_DAMAGE_BONUS,
  StatType.COMBO_SKILL_DAMAGE_BONUS, StatType.ULTIMATE_DAMAGE_BONUS,
  StatType.STAGGER_DAMAGE_BONUS,
  StatType.FINAL_DAMAGE_REDUCTION, StatType.SKILL_DAMAGE_BONUS, StatType.ARTS_DAMAGE_BONUS,
  StatType.HP_BONUS,
]);

export function formatStatValue(stat: StatType, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${(value * 100).toFixed(2)}%`;
  return value.toFixed(2);
}

// ── Weapon Breakdown ────────────────────────────────────────────────────────

export interface WeaponStatContribution {
  skillIndex: number;
  stat: StatType;
  value: number;
}

export interface WeaponPassiveStat {
  skillIndex: number;
  stat: StatType;
  value: number;
}

export interface WeaponEffectBuff {
  statLabel: string;
  valueStr: string;
  perStack: boolean;
}

export interface WeaponEffectDisplay {
  label: string;
  description?: string;
  durationSeconds: number;
  secondaryAttrBonus: { label: string; value: number } | null;
  buffs: WeaponEffectBuff[];
  stackSuffix: string;
  metaStr: string;
}

export interface WeaponBreakdown {
  name: string;
  baseAtk: number;
  skills: { name: string; maxLevel: number; index: number }[];
  statContributions: WeaponStatContribution[];
  passiveStats: WeaponPassiveStat[];
  effects: WeaponEffectDisplay[];
}

export function resolveWeaponBreakdown(
  operatorId: string,
  loadout: OperatorLoadoutState,
  stats: LoadoutStats,
): WeaponBreakdown | null {
  const weaponEntry = loadout.weaponName !== null
    ? WEAPONS.find((w) => w.name === loadout.weaponName) ?? null
    : null;
  if (!weaponEntry) return null;

  const wpn = weaponEntry.create();
  const opConfig = getOperatorConfig(operatorId);
  const operatorModel = opConfig ? new DataDrivenOperator(opConfig, stats.operatorLevel) : null;
  const mainAttr = operatorModel?.mainAttributeType ?? StatType.STRENGTH;

  const allSkills = [wpn.weaponSkillOne, wpn.weaponSkillTwo, wpn.weaponSkillThree];
  const levelValues = [stats.weaponSkill1Level, stats.weaponSkill2Level, stats.weaponSkill3Level];

  const skills: WeaponBreakdown['skills'] = [];
  const statContributions: WeaponStatContribution[] = [];
  const passiveStats: WeaponPassiveStat[] = [];

  for (let i = 0; i < allSkills.length; i++) {
    const sk = allSkills[i];
    if (!sk) continue;

    const skillName = sk.weaponSkillType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    skills.push({ name: skillName, maxLevel: 9, index: i });

    sk.level = levelValues[i];
    const stat = weaponSkillStat(sk.weaponSkillType as WeaponSkillType, mainAttr);
    if (stat != null) {
      const value = sk.getValue();
      if (value !== 0) {
        statContributions.push({ skillIndex: i, stat, value });
      }
    } else {
      const passive = sk.getPassiveStats();
      for (const [key, value] of Object.entries(passive)) {
        if ((value as number) !== 0) {
          passiveStats.push({ skillIndex: i, stat: key as StatType, value: value as number });
        }
      }
    }
  }

  const baseAtk = interpolateAttack(wpn.baseAttack, stats.weaponLevel);

  // Named skill effects
  const effects: WeaponEffectDisplay[] = [];
  const weaponEffects = getWeaponEffects(weaponEntry.name);
  if (weaponEffects) {
    const sk3 = wpn.weaponSkillThree;
    const effectGroups = sk3?.getNamedEffectGroups?.() ?? null;

    for (let ei = 0; ei < weaponEffects.effects.length; ei++) {
      const eff = weaponEffects.effects[ei];
      const group = effectGroups?.[ei] ?? null;

      // Secondary attribute bonus
      let secondaryAttrBonus: WeaponEffectDisplay['secondaryAttrBonus'] = null;
      if (ei === 0 && sk3 && 'getElementDmgBonus' in sk3 && operatorModel) {
        const secBonus = sk3.getValue();
        if (secBonus > 0) {
          secondaryAttrBonus = {
            label: operatorModel.secondaryAttributeType as string,
            value: secBonus,
          };
        }
      }

      // Buff lines
      const stackSuffix = eff.maxStacks > 1 ? `/stack (max ${eff.maxStacks})` : '';
      const buffs: WeaponEffectBuff[] = eff.buffs.map((b, bi) => {
        const isPercent = PERCENT_STATS.has(b.stat as StatType);
        const modelStat = group?.stats[bi];
        let valueStr: string;
        if (modelStat && modelStat.value !== 0) {
          valueStr = isPercent
            ? `${(modelStat.value * 100).toFixed(2)}%`
            : modelStat.value.toFixed(2);
        } else {
          valueStr = isPercent
            ? `${(b.valueMin * 100).toFixed(2)}–${(b.valueMax * 100).toFixed(2)}%`
            : `${b.valueMin}–${b.valueMax}`;
        }
        return {
          statLabel: b.stat as string,
          valueStr,
          perStack: !!b.perStack,
        };
      });

      // Meta
      const metaParts = [
        eff.maxStacks > 1 ? `${eff.maxStacks} stacks` : '',
        eff.cooldownSeconds > 0 ? `${eff.cooldownSeconds}s CD` : '',
      ].filter(Boolean);
      const metaStr = [eff.note, ...metaParts].filter(Boolean).join(' · ');

      effects.push({
        label: eff.label,
        description: eff.description,
        durationSeconds: eff.durationSeconds,
        secondaryAttrBonus,
        buffs,
        stackSuffix,
        metaStr,
      });
    }
  }

  return { name: weaponEntry.name, baseAtk, skills, statContributions, passiveStats, effects };
}

// ── Gear Breakdown ──────────────────────────────────────────────────────────

export interface GearPieceData {
  name: string;
  ranksKey: string;
  statKeys: StatType[];
  ranks: Record<string, number>;
  resolvedStats: Record<string, number>;
}

export interface GearBreakdown {
  setActive: boolean;
  setName: string | null;
  setDescription: string | null;
  pieces: GearPieceData[];
}

export function resolveGearBreakdown(
  operatorId: string,
  loadout: OperatorLoadoutState,
  stats: LoadoutStats,
): GearBreakdown | null {
  const armor  = loadout.armorName  !== null ? ARMORS.find((a) => a.name === loadout.armorName) ?? null : null;
  const gloves = loadout.glovesName !== null ? GLOVES.find((g) => g.name === loadout.glovesName) ?? null : null;
  const kit1   = loadout.kit1Name   !== null ? KITS.find((k) => k.name === loadout.kit1Name) ?? null : null;
  const kit2   = loadout.kit2Name   !== null ? KITS.find((k) => k.name === loadout.kit2Name) ?? null : null;

  if (!armor && !gloves && !kit1 && !kit2) return null;

  const agg = aggregateLoadoutStats(operatorId, loadout, stats);

  const entries = [
    { entry: armor,  ranksKey: 'armorRanks' as const },
    { entry: gloves, ranksKey: 'glovesRanks' as const },
    { entry: kit1,   ranksKey: 'kit1Ranks' as const },
    { entry: kit2,   ranksKey: 'kit2Ranks' as const },
  ];

  const pieces: GearPieceData[] = [];
  for (const { entry, ranksKey } of entries) {
    if (!entry) continue;
    const gear: Gear = entry.create();
    gear.rank = 4;
    const statKeys = gear.getStatKeys();
    const ranks = stats[ranksKey] ?? {};
    const resolvedStats = gear.getStatsPerLine(ranks);
    pieces.push({ name: entry.name, ranksKey, statKeys, ranks, resolvedStats });
  }

  return {
    setActive: !!agg?.gearSetActive,
    setName: agg?.gearSetType?.replace(/_/g, ' ') ?? null,
    setDescription: agg?.gearSetDescription ?? null,
    pieces,
  };
}

// ── Gear Bonus Summary ──────────────────────────────────────────────────────

export interface GearBonusStat {
  stat: StatType;
  value: number;
}

export interface GearBonusSummary {
  stats: GearBonusStat[];
  totalDefense: number;
}

/**
 * Compute total gear stat contributions across all equipped pieces.
 * Sums per-line-rank resolved stats from each gear piece, including defense.
 */
export function resolveGearBonusSummary(
  gearBreakdown: GearBreakdown | null,
): GearBonusSummary | null {
  if (!gearBreakdown || gearBreakdown.pieces.length === 0) return null;

  const totals = new Map<StatType, number>();
  let totalDefense = 0;

  for (const piece of gearBreakdown.pieces) {
    for (const [key, value] of Object.entries(piece.resolvedStats)) {
      const stat = key as StatType;
      if (stat === StatType.BASE_DEFENSE) {
        totalDefense += value as number;
      } else {
        totals.set(stat, (totals.get(stat) ?? 0) + (value as number));
      }
    }
  }

  const stats: GearBonusStat[] = [];
  totals.forEach((value, stat) => {
    if (value !== 0) stats.push({ stat, value });
  });

  if (stats.length === 0 && totalDefense === 0) return null;
  return { stats, totalDefense };
}

// ── Tactical Breakdown ──────────────────────────────────────────────────────

export interface TacticalData {
  name: string;
  modelMaxUses: number;
  currentMaxUses: number;
}

export function resolveTactical(
  loadout: OperatorLoadoutState,
  stats: LoadoutStats,
): { foodName: string | null; tactical: TacticalData | null } {
  const food = loadout.consumableName !== null
    ? CONSUMABLES.find((c) => c.name === loadout.consumableName) ?? null
    : null;
  const tac = loadout.tacticalName !== null
    ? TACTICALS.find((t) => t.name === loadout.tacticalName) ?? null
    : null;

  let tactical: TacticalData | null = null;
  if (tac) {
    const tacInstance = tac.create();
    const modelMax = tacInstance.maxUses;
    tactical = {
      name: tac.name,
      modelMaxUses: modelMax,
      currentMaxUses: stats.tacticalMaxUses ?? modelMax,
    };
  }

  return { foodName: food?.name ?? null, tactical };
}

// ── Aggregated Stats ────────────────────────────────────────────────────────

/** Maps flat attribute stats to their percentage bonus counterparts. */
const FLAT_ATTR_TO_BONUS: Partial<Record<StatType, StatType>> = {
  [StatType.STRENGTH]: StatType.STRENGTH_BONUS,
  [StatType.AGILITY]: StatType.AGILITY_BONUS,
  [StatType.INTELLECT]: StatType.INTELLECT_BONUS,
  [StatType.WILL]: StatType.WILL_BONUS,
};

export interface AttributeStatDisplay {
  stat: StatType;
  value: number;
  isZero: boolean;
}

export interface OtherStatDisplay {
  stat: StatType;
  /** Raw value (before UGE +1 offset). */
  raw: number;
  /** Display value (UGE gets +1). */
  value: number;
  isZero: boolean;
}

/** Stat display groups matching in-game layout. */
const STAT_ATTRIBUTES: StatType[] = [
  StatType.STRENGTH, StatType.AGILITY, StatType.INTELLECT, StatType.WILL,
  StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS, StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
];

const STAT_OTHER: StatType[] = [
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.TREATMENT_BONUS, StatType.TREATMENT_RECEIVED_BONUS,
  StatType.COMBO_SKILL_COOLDOWN_REDUCTION, StatType.ULTIMATE_GAIN_EFFICIENCY,
  StatType.STAGGER_EFFICIENCY_BONUS, StatType.STAGGER_DAMAGE_BONUS,
  StatType.PHYSICAL_DAMAGE_BONUS, StatType.HEAT_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS,
  StatType.CRYO_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS, StatType.ARTS_DAMAGE_BONUS,
  StatType.BASIC_ATTACK_DAMAGE_BONUS, StatType.BATTLE_SKILL_DAMAGE_BONUS,
  StatType.COMBO_SKILL_DAMAGE_BONUS, StatType.ULTIMATE_DAMAGE_BONUS,
  StatType.SKILL_DAMAGE_BONUS,
  StatType.FINAL_DAMAGE_REDUCTION,
  StatType.PHYSICAL_RESISTANCE, StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
  StatType.CRYO_RESISTANCE, StatType.NATURE_RESISTANCE, StatType.AETHER_RESISTANCE,
];

/** Filter a stat list to only those matching the given target (includes ALL). */
function filterStatsByTarget(stats: StatType[], target: StatOwnerType): StatType[] {
  return stats.filter((s) => STAT_ATTRIBUTION[s].includes(target));
}

export interface AggregatedStatsDisplay {
  agg: AggregatedStats;
  attributes: AttributeStatDisplay[];
  otherStats: OtherStatDisplay[];
}

export function resolveAggregatedStats(
  operatorId: string,
  loadout: OperatorLoadoutState,
  stats: LoadoutStats,
  target: StatOwnerType = StatOwnerType.OPERATOR,
): AggregatedStatsDisplay | null {
  const agg = aggregateLoadoutStats(operatorId, loadout, stats);
  if (!agg) return null;

  const filteredAttributes = filterStatsByTarget(STAT_ATTRIBUTES, target);
  const filteredOther = filterStatsByTarget(STAT_OTHER, target);

  const attributes: AttributeStatDisplay[] = filteredAttributes.map((stat) => {
    let value = agg.stats[stat];
    const bonusStat = FLAT_ATTR_TO_BONUS[stat];
    if (bonusStat) {
      value = value * (1 + agg.stats[bonusStat]);
    }
    return { stat, value, isZero: value === 0 };
  });

  const otherStats: OtherStatDisplay[] = filteredOther.map((stat) => {
    const raw = agg.stats[stat];
    const value = stat === StatType.ULTIMATE_GAIN_EFFICIENCY ? raw + 1 : raw;
    return { stat, raw, value, isZero: raw === 0 };
  });

  return { agg, attributes, otherStats };
}
