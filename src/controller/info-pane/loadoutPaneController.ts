import { CombatSkillType, StatType, StatOwnerType, STAT_ATTRIBUTION } from '../../consts/enums';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { LoadoutProperties } from '../../view/InformationPane';
import { DataDrivenOperator } from '../../model/operators/dataDrivenOperator';
import { getOperatorConfig } from '../operators/operatorRegistry';
import {
  getWeapon, getGearPiece, getConsumable, getTactical,
  getGenericSkillStats, getNamedSkillPassiveStats,
  getGenericWeaponSkill, getNamedWeaponSkill,
  getWeaponEffectDefs, resolveDurationSeconds,
} from '../gameDataStore';
import { aggregateLoadoutStats, AggregatedStats } from '../calculation/loadoutAggregator';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { fmtN } from '../../utils/timeline';
import { NumberFormatType } from '../../consts/enums';
import { loadSettings } from '../../consts/settings';
import { getSkillMultiplier } from '../calculation/jsonMultiplierEngine';
import { getSkillTypeMap, getRawSkillTypeMap, getComboTriggerInfo, getOperatorSkill } from '../gameDataStore';
import { getUltimateEnergyCost, getUltimateEnergyCostForPotential } from '../operators/operatorRegistry';
import type { Potential } from '../../consts/types';
import type { SkillType } from '../../consts/viewTypes';
import { NounType, VerbType } from '../../dsl/semantics';
import { resolveEffectStat } from '../../model/enums/stats';
import type { Clause } from '../../dsl/semantics';
import type { MultiplierEntry } from './damageBreakdownController';
import type { StatSourceEntry } from '../calculation/loadoutAggregator';

// ── Stat display helpers (shared with view) ─────────────────────────────────

const PERCENT_STATS = new Set<StatType>([
  StatType.ATTACK_BONUS, StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS,
  StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.PHYSICAL_RESISTANCE, StatType.ARTS_RESISTANCE,
  StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
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

/** Format a stat value respecting user settings for decimal places and number format. */
export function formatStatValue(stat: StatType, value: number): string {
  const { decimalPlaces: dp, numberFormat: nf } = loadSettings();
  if (PERCENT_STATS.has(stat)) {
    return nf === NumberFormatType.DECIMAL ? value.toFixed(dp) : `${(value * 100).toFixed(dp)}%`;
  }
  return fmtN(value);
}

/** Format a raw number (non-stat) as a percentage or decimal, respecting settings. */
export function formatPct(value: number): string {
  const { decimalPlaces: dp, numberFormat: nf } = loadSettings();
  return nf === NumberFormatType.DECIMAL ? value.toFixed(dp) : `${(value * 100).toFixed(dp)}%`;
}

/** Format a flat number respecting decimal places setting. */
export function formatFlat(value: number): string {
  const { decimalPlaces: dp } = loadSettings();
  return value.toFixed(dp).replace(/\.?0+$/, '');
}

// ── Stat labels ────────────────────────────────────────────────────────────

const STAT_LABELS: Partial<Record<StatType, string>> = {
  [StatType.STRENGTH]: 'STR',
  [StatType.AGILITY]: 'AGI',
  [StatType.INTELLECT]: 'INT',
  [StatType.WILL]: 'WIL',
};

// ── Loadout tree builder ────────────────────────────────────────────────────

function makeEntry(label: string, formattedValue: string, source = '', subEntries?: MultiplierEntry[]): MultiplierEntry {
  return { label, value: 0, format: 'flat', source, formattedValue, cssClass: '', subEntries };
}

function buildSourceChildren(stat: StatType, sources?: StatSourceEntry[]): MultiplierEntry[] | undefined {
  if (!sources || sources.length === 0) return undefined;
  return sources
    .filter((s) => Math.abs(s.value) > 0.00001)
    .map((s) => makeEntry(s.source, formatStatValue(stat, s.value)));
}

/** Build MultiplierEntry tree from aggregated loadout stats for the breakdown tree display. */
export function buildLoadoutBreakdownEntries(agg: AggregatedStats): MultiplierEntry[] {
  const entries: MultiplierEntry[] = [];

  // HP
  const hpChildren: MultiplierEntry[] = [
    makeEntry('Base HP', formatFlat(agg.operatorBaseHp)),
  ];
  if (agg.hpFromStrength > 0) {
    hpChildren.push(makeEntry('STR', `+${formatFlat(agg.hpFromStrength)}`));
  }
  if (agg.hpBonus !== 0) {
    hpChildren.push(makeEntry('HP%', `${formatStatValue(StatType.HP_BONUS, agg.hpBonus)} → ${formatFlat(agg.hpPercentageBonus)}`,
      '', buildSourceChildren(StatType.HP_BONUS, agg.statSources[StatType.HP_BONUS])));
  }
  if (agg.flatHpBonuses !== 0) {
    hpChildren.push(makeEntry('Flat HP', `+${formatFlat(agg.flatHpBonuses)}`));
  }
  entries.push(makeEntry('HP', formatFlat(agg.effectiveHp), '', hpChildren));

  // ATK
  const baseAtkChildren: MultiplierEntry[] = [
    makeEntry('Operator', formatFlat(agg.operatorBaseAttack)),
    makeEntry('Weapon', formatFlat(agg.weaponBaseAttack)),
  ];
  const atkBonusChildren = buildSourceChildren(StatType.ATTACK_BONUS, agg.statSources[StatType.ATTACK_BONUS]);
  const mainAttrLabel = STAT_LABELS[agg.mainAttributeType] ?? String(agg.mainAttributeType);
  const secAttrLabel = STAT_LABELS[agg.secondaryAttributeType] ?? String(agg.secondaryAttributeType);
  const atkChildren: MultiplierEntry[] = [
    makeEntry('Base ATK', formatFlat(agg.baseAttack), '', baseAtkChildren),
    makeEntry('ATK%', `${formatStatValue(StatType.ATTACK_BONUS, agg.atkBonus)} → ${formatFlat(agg.atkPercentageBonus)}`, '', atkBonusChildren),
    ...(agg.flatAttackBonuses > 0 ? [makeEntry('Flat ATK', `+${formatFlat(agg.flatAttackBonuses)}`)] : []),
    makeEntry('Attribute Bonus', formatPct(agg.displayMainAttributeBonus + agg.displaySecondaryAttributeBonus), '', [
      makeEntry(`${mainAttrLabel} (Main)`, formatPct(agg.displayMainAttributeBonus)),
      makeEntry(`${secAttrLabel} (Secondary)`, formatPct(agg.displaySecondaryAttributeBonus)),
    ]),
  ];
  entries.push(makeEntry('ATK', formatFlat(agg.effectiveAttack), '', atkChildren));

  // DEF
  if (agg.totalDefense > 0) {
    const defSources = buildSourceChildren(StatType.BASE_DEFENSE, agg.statSources[StatType.BASE_DEFENSE]);
    entries.push(makeEntry('Defense', formatFlat(agg.totalDefense), '', defSources));
  } else {
    entries.push(makeEntry('Defense', '—'));
  }

  return entries;
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
  stats: LoadoutProperties,
): WeaponBreakdown | null {
  if (!loadout.weaponId) return null;
  const weaponPiece = getWeapon(loadout.weaponId);
  if (!weaponPiece) return null;

  const opConfig = getOperatorConfig(operatorId);
  const operatorModel = opConfig ? new DataDrivenOperator(opConfig, stats.operator.level) : null;
  const mainAttr = operatorModel?.mainAttributeType ?? StatType.STRENGTH;

  const levelValues = [stats.weapon.skill1Level, stats.weapon.skill2Level, stats.weapon.skill3Level];
  const skills: WeaponBreakdown['skills'] = [];
  const statContributions: WeaponStatContribution[] = [];
  const passiveStats: WeaponPassiveStat[] = [];

  for (let i = 0; i < weaponPiece.skills.length; i++) {
    const skillId = weaponPiece.skills[i];
    const level = levelValues[i] ?? 1;

    // Resolve display name from skill controller
    const genericSkill = getGenericWeaponSkill(skillId);
    const namedSkill = !genericSkill ? getNamedWeaponSkill(weaponPiece.id) : undefined;
    const displayName = namedSkill?.name ?? genericSkill?.name
      ?? skillId.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    skills.push({ name: displayName, maxLevel: 9, index: i });

    // Generic skill stats
    const genericResults = getGenericSkillStats(skillId, level);
    if (genericResults.length > 0) {
      for (const { stat, value } of genericResults) {
        const resolvedStat = stat === 'MAIN_ATTRIBUTE' ? mainAttr : stat as StatType;
        if (value !== 0) statContributions.push({ skillIndex: i, stat: resolvedStat, value });
      }
      continue;
    }

    // Named skill passive stats
    const namedResults = getNamedSkillPassiveStats(weaponPiece.id, level);
    for (const { stat, value } of namedResults) {
      if (value !== 0) passiveStats.push({ skillIndex: i, stat: stat as StatType, value });
    }
  }

  const baseAtk = weaponPiece.getBaseAttack(stats.weapon.level);

  // Named skill effects (from DSL JSON)
  const effects: WeaponEffectDisplay[] = [];
  const dslDefs = getWeaponEffectDefs(weaponPiece.name);
  if (dslDefs.length > 0) {
    for (let ei = 0; ei < dslDefs.length; ei++) {
      const def = dslDefs[ei];
      const maxStacks = def.stacks?.limit ? resolveValueNode(def.stacks.limit, DEFAULT_VALUE_CONTEXT) : 1;
      const durationSeconds = resolveDurationSeconds(def);

      // Secondary attribute bonus — check if the named skill has conditional stats
      let secondaryAttrBonus: WeaponEffectDisplay['secondaryAttrBonus'] = null;
      if (ei === 0 && operatorModel) {
        const namedSkill = getNamedWeaponSkill(weaponPiece.id);
        if (namedSkill) {
          // Check for conditional clause effects (non-passive) that grant element damage bonuses
          const conditionalEffects = namedSkill.clause
            .filter(c => c.conditions?.length > 0)
            .flatMap(c => c.effects);
          for (const ef of conditionalEffects) {
            const wv = ef.with?.multiplier ?? ef.with?.value;
            if ((wv as { value?: unknown })?.value != null && ef.object === NounType.STAT && ef.objectId === NounType.DAMAGE_BONUS) {
              // Skip — these are shown as triggered effect buffs, not secondary attr
            }
          }
        }
      }

      // Buff lines — extracted from clause effects (APPLY verb with stat object)
      const stackSuffix = maxStacks > 1 ? `/stack (max ${maxStacks})` : '';
      interface EffectClause { verb: string; object: string; objectId?: string; objectQualifier?: string; with?: { value?: { verb?: string; object?: string; value?: number; valueMin?: number; valueMax?: number } } }
      const clauseEffects: EffectClause[] = (def.clause ?? []).flatMap((c) => (c.effects ?? []) as unknown as EffectClause[])
        .filter((e) => e.verb === VerbType.APPLY && e.with?.value);
      const buffs: WeaponEffectBuff[] = clauseEffects.map((e) => {
        const stat = resolveEffectStat(e) ?? e.object;
        const wv = e.with!.value!;
        const isPercent = PERCENT_STATS.has(stat as StatType);
        const perStack = wv.verb === VerbType.VARY_BY && wv.object === 'STATUS_LEVEL';
        const valueStr = wv.valueMin != null && wv.valueMax != null
          ? (isPercent
            ? `${fmtN(wv.valueMin * 100)}–${fmtN(wv.valueMax * 100)}%`
            : `${wv.valueMin}–${wv.valueMax}`)
          : (isPercent ? `${fmtN((wv.value ?? 0) * 100)}%` : String(wv.value ?? 0));
        return { statLabel: stat as string, valueStr, perStack };
      });

      // Meta
      const cooldownSeconds = def.cooldownSeconds ?? 0;
      const metaParts = [
        maxStacks > 1 ? `${maxStacks} stacks` : '',
        cooldownSeconds > 0 ? `${cooldownSeconds}s CD` : '',
      ].filter(Boolean);
      const metaStr = [def.note, ...metaParts].filter(Boolean).join(' · ');

      effects.push({ label: def.name ?? def.description ?? '', description: def.description, durationSeconds, secondaryAttrBonus, buffs, stackSuffix, metaStr });
    }
  }

  return { name: weaponPiece.name, baseAtk, skills, statContributions, passiveStats, effects };
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
  stats: LoadoutProperties,
): GearBreakdown | null {
  const gearSlots: { id: string | null; ranksKey: 'armorRanks' | 'glovesRanks' | 'kit1Ranks' | 'kit2Ranks' }[] = [
    { id: loadout.armorId,  ranksKey: 'armorRanks' },
    { id: loadout.glovesId, ranksKey: 'glovesRanks' },
    { id: loadout.kit1Id,   ranksKey: 'kit1Ranks' },
    { id: loadout.kit2Id,   ranksKey: 'kit2Ranks' },
  ];

  const pieces: GearPieceData[] = [];
  for (const { id, ranksKey } of gearSlots) {
    if (!id) continue;
    const piece = getGearPiece(id);
    if (!piece) continue;
    const statKeys = piece.statKeys as StatType[];
    const ranks = stats.gear[ranksKey] ?? {};
    const resolvedStats = piece.getStatsPerLine(ranks);
    pieces.push({ name: piece.name, ranksKey, statKeys, ranks, resolvedStats });
  }

  if (pieces.length === 0) return null;

  const agg = aggregateLoadoutStats(operatorId, loadout, stats);

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

export interface TacticalDisplayData {
  name: string;
  modelMaxUses: number;
  currentMaxUses: number;
}

export function resolveTactical(
  loadout: OperatorLoadoutState,
  stats: LoadoutProperties,
): { foodName: string | null; tactical: TacticalDisplayData | null } {
  const food = loadout.consumableId ? getConsumable(loadout.consumableId) : undefined;
  const tac = loadout.tacticalId ? getTactical(loadout.tacticalId) : undefined;

  let tactical: TacticalDisplayData | null = null;
  if (tac) {
    tactical = {
      name: tac.name,
      modelMaxUses: tac.resolvedUsageLimit,
      currentMaxUses: stats.tacticalMaxUses ?? tac.resolvedUsageLimit,
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
  StatType.PHYSICAL_RESISTANCE, StatType.ARTS_RESISTANCE,
  StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
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
  stats: LoadoutProperties,
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

// ── Skill Detail Data ──────────────────────────────────────────────────────

export interface SkillMultiplierRow {
  level: number;
  value: number;
}

export interface SkillSegmentMultipliers {
  segmentIndex: number;
  segmentLabel?: string;
  rows: SkillMultiplierRow[];
}

export interface SkillMultiplierGrid {
  /** rows[potentialIndex][levelIndex] = multiplier */
  potentials: number[];
  levels: number[];
  values: number[][];
}

export interface SkillDetailData {
  skillId: string;
  skillName: string;
  description?: string;
  element?: string;
  /** Flat multiplier table (12 levels) for each segment — no potential variation */
  segments: SkillSegmentMultipliers[];
  /** Grid: rows = levels, columns = potentials that change multiplier */
  grid: SkillMultiplierGrid | null;
}

export interface ComboTriggerDisplay {
  description: string;
  windowSeconds: number;
}

export interface UltimateEnergyDisplay {
  baseCost: number;
  adjustedCost: number;
  gaugeGain?: number;
  teamGaugeGain?: number;
}

const SKILL_TYPE_TO_JSON_KEY: Record<SkillType, string> = {
  basic: CombatSkillType.BASIC_ATTACK,
  battle: CombatSkillType.BATTLE_SKILL,
  combo: CombatSkillType.COMBO_SKILL,
  ultimate: CombatSkillType.ULTIMATE,
};

/**
 * Resolve multiplier data for a skill, including per-segment tables
 * and a potential×level grid when potentials affect multipliers.
 */
export function resolveSkillDetail(
  operatorId: string,
  skillType: SkillType,
  potential: Potential,
): SkillDetailData | null {
  const typeMap = getSkillTypeMap(operatorId);
  const jsonKey = SKILL_TYPE_TO_JSON_KEY[skillType];
  const skillId = typeMap[jsonKey];
  if (!skillId) return null;

  // Build per-segment multiplier tables at current potential
  const segments: SkillSegmentMultipliers[] = [];
  let consecutiveEmpty = 0;
  for (let seg = 0; seg < 20; seg++) {
    const rows: SkillMultiplierRow[] = [];
    for (let lvl = 1; lvl <= 12; lvl++) {
      const val = getSkillMultiplier(operatorId, skillId, seg, lvl as 1, potential);
      if (val == null && lvl === 1) break;
      if (val != null) rows.push({ level: lvl, value: val });
    }
    if (rows.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
      continue;
    }
    consecutiveEmpty = 0;
    segments.push({ segmentIndex: seg, rows });
  }

  // Check if potentials affect multipliers — build a grid if so
  let grid: SkillMultiplierGrid | null = null;
  const potentialsWithDiff: number[] = [];
  const baseVals: number[] = [];
  for (let lvl = 1; lvl <= 12; lvl++) {
    baseVals.push(getSkillMultiplier(operatorId, skillId, 0, lvl as 1, 0) ?? 0);
  }
  for (let p = 1; p <= 5; p++) {
    const vals: number[] = [];
    let differs = false;
    for (let lvl = 1; lvl <= 12; lvl++) {
      const v = getSkillMultiplier(operatorId, skillId, 0, lvl as 1, p as Potential) ?? 0;
      vals.push(v);
      if (Math.abs(v - baseVals[lvl - 1]) > 0.0001) differs = true;
    }
    if (differs) potentialsWithDiff.push(p);
  }

  if (potentialsWithDiff.length > 0) {
    const allPots = [0, ...potentialsWithDiff];
    const levels = Array.from({ length: 12 }, (_, i) => i + 1);
    const values: number[][] = levels.map((lvl) =>
      allPots.map((p) => getSkillMultiplier(operatorId, skillId, 0, lvl as 1, p as Potential) ?? 0)
    );
    grid = { potentials: allPots, levels, values };
  }

  return { skillId, skillName: skillId, segments, grid, description: undefined, element: undefined };
}

/** A sub-skill variant (BATK, FINISHER, DIVE) with its own multiplier data and clauses. */
export interface SubSkillDetail {
  variantKey: string;
  variantLabel: string;
  skillId: string;
  skillName: string;
  description?: string;
  detail: SkillDetailData | null;
  clause: Clause;
}

const BATK_VARIANT_LABELS: Record<string, string> = {
  BATK: 'Normal Chain',
  FINISHER: 'Finisher',
  DIVE: 'Dive Attack',
};

/**
 * Resolve all sub-skill variants for a given skill type.
 * For BASIC_ATTACK, returns BATK/FINISHER/DIVE as separate entries.
 * For other skill types, returns a single entry.
 */
export function resolveSubSkills(operatorId: string, skillType: SkillType): SubSkillDetail[] {
  const rawMap = getRawSkillTypeMap(operatorId);
  const mapping = rawMap[skillType];
  if (!mapping) return [];

  if (typeof mapping === 'string') {
    const skill = getOperatorSkill(operatorId, mapping);
    return [{
      variantKey: skillType,
      variantLabel: '',
      skillId: mapping,
      skillName: skill?.name ?? mapping,
      description: skill?.description,
      detail: resolveSkillDetailForId(operatorId, mapping, 0),
      clause: (skill?.clause ?? []) as Clause,
    }];
  }

  // Object mapping: { BATK: id, FINISHER: id, DIVE: id }
  const entries: SubSkillDetail[] = [];
  const seenIds = new Set<string>();
  for (const [variant, skillId] of Object.entries(mapping as Record<string, string>)) {
    if (seenIds.has(skillId)) continue;
    seenIds.add(skillId);
    const skill = getOperatorSkill(operatorId, skillId);
    if (!skill) continue;
    entries.push({
      variantKey: variant,
      variantLabel: BATK_VARIANT_LABELS[variant] ?? variant,
      skillId,
      skillName: skill.name ?? skillId,
      description: skill.description,
      detail: resolveSkillDetailForId(operatorId, skillId, 0),
      clause: (skill.clause ?? []) as Clause,
    });
  }
  return entries;
}

/** Resolve multiplier data for a specific skill ID (not skill type). */
function resolveSkillDetailForId(operatorId: string, skillId: string, potential: Potential): SkillDetailData | null {
  const segments: SkillSegmentMultipliers[] = [];
  let consecutiveEmpty = 0;
  for (let seg = 0; seg < 20; seg++) {
    const rows: SkillMultiplierRow[] = [];
    for (let lvl = 1; lvl <= 12; lvl++) {
      const val = getSkillMultiplier(operatorId, skillId, seg, lvl as 1, potential);
      if (val == null && lvl === 1) break;
      if (val != null) rows.push({ level: lvl, value: val });
    }
    if (rows.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
      continue;
    }
    consecutiveEmpty = 0;
    segments.push({ segmentIndex: seg, rows });
  }
  if (segments.length === 0) return null;
  return { skillId, skillName: skillId, segments, grid: null, description: undefined, element: undefined };
}

/** Resolve the clause data for a skill type (top-level clause, not per-segment). */
export function resolveSkillClause(operatorId: string, skillType: SkillType): Clause {
  const typeMap = getSkillTypeMap(operatorId);
  const skillId = typeMap[skillType];
  if (!skillId) return [];
  const skill = getOperatorSkill(operatorId, skillId);
  return (skill?.clause ?? []) as Clause;
}

/**
 * Resolve combo trigger display data for an operator.
 */
export function resolveComboTrigger(operatorId: string): ComboTriggerDisplay | null {
  const info = getComboTriggerInfo(operatorId);
  if (!info) return null;
  return {
    description: info.description,
    windowSeconds: info.windowFrames / 120,
  };
}

/**
 * Resolve ultimate energy display data.
 */
export function resolveUltimateEnergy(
  operatorId: string,
  potential: Potential,
  gaugeGain?: number,
  teamGaugeGain?: number,
): UltimateEnergyDisplay {
  const baseCost = getUltimateEnergyCost(operatorId);
  const adjustedCost = getUltimateEnergyCostForPotential(operatorId, potential) ?? baseCost;
  return {
    baseCost,
    adjustedCost,
    gaugeGain,
    teamGaugeGain,
  };
}
