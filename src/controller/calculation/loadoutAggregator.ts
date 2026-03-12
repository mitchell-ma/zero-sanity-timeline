/**
 * Loadout aggregator — controller that combines all loadout sources into
 * final operator stats for damage calculation.
 *
 * Sources:
 *   1. Operator base stats (by level)
 *   2. Weapon base ATK (by level)
 *   3. Weapon skill stat boosts (by skill level)
 *   4. Gear piece stats (by rank) — armor, gloves, kit1, kit2
 *   5. Gear set effect passive stats (if 3+ pieces share the same effect type)
 *   6. Consumable stats (food buff)
 *   7. Tactical stats
 */

import { GearEffectType, StatType, WeaponSkillType } from '../../consts/enums';
import { Weapon } from '../../model/weapons/weapon';
import { Gear } from '../../model/gears/gear';
import {
  GearEffect,
  AicHeavy,
  AicLight,
  ArmoredMsgr,
  RovingMsgr,
  MordvoltInsulation,
  MordvoltResistant,
  AburreyLegacy,
  Catastrophe,
  Swordmancer,
  Lynx,
  Aethertech,
  Bonekrusha,
  PulserLabs,
  Frontiers,
  HotWork,
  MiSecurity,
  Type50Yinglung,
  TideSurge,
  EternalXiranite,
} from '../../model/gears/gearEffects';
import { Consumable } from '../../model/consumables/consumable';
import { Tactical } from '../../model/consumables/tactical';
import { WeaponSkill } from '../../model/weapon-skills/weaponSkill';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { LoadoutStats } from '../../view/InformationPane';
import { MODEL_FACTORIES } from '../operators/operatorRegistry';
import {
  WEAPONS,
  ARMORS,
  GLOVES,
  KITS,
  CONSUMABLES,
  TACTICALS,
} from '../../utils/loadoutRegistry';

// ── Result type ─────────────────────────────────────────────────────────────

export interface AggregatedStats {
  /** Operator base ATK from level table. */
  operatorBaseAttack: number;
  /** Weapon base ATK from level table. 0 if no weapon equipped. */
  weaponBaseAttack: number;
  /** Flat ATK bonuses from gear effects, consumables, tacticals. */
  flatAttackBonuses: number;
  /** Total base ATK (operator + weapon). */
  baseAttack: number;
  /** Total ATK bonus percentage (sum of all ATK% sources). */
  atkBonus: number;
  /** Flat ATK gained from percentage bonus (baseATK * atkBonus). */
  atkPercentageBonus: number;
  /** Total ATK before attribute bonus: (base) * (1 + ATK%) + flat. */
  totalAttack: number;
  /** Attribute bonus multiplier: 1 + mainAttrBonus + secAttrBonus. */
  attributeBonus: number;
  /** Effective ATK: totalAttack * attributeBonus. */
  effectiveAttack: number;
  /** Attribute bonus from main attribute (0.005 * mainAttr). */
  mainAttributeBonus: number;
  /** Attribute bonus from secondary attribute (0.002 * secAttr). */
  secondaryAttributeBonus: number;
  /** All stats merged from all sources (excludes base ATK and flat ATK bonuses). */
  stats: Record<StatType, number>;
  /** The operator's main attribute type (for attribute bonus calc). */
  mainAttributeType: StatType;
  /** The operator's secondary attribute type. */
  secondaryAttributeType: StatType;
  /** Operator element. */
  element: import('../../consts/enums').ElementType;
  /** Whether a gear set effect is active (3+ pieces of same type). */
  gearSetActive: boolean;
  /** Which gear effect type is active, if any. */
  gearSetType: GearEffectType | null;
  /** Human-readable description of the active gear set effect, if any. */
  gearSetDescription: string | null;
}

// ── Attribute → bonus stat mapping ──────────────────────────────────────────

/** Maps flat attribute stat types to their percentage bonus counterparts. */
const ATTR_TO_BONUS: Partial<Record<StatType, StatType>> = {
  [StatType.STRENGTH]: StatType.STRENGTH_BONUS,
  [StatType.AGILITY]: StatType.AGILITY_BONUS,
  [StatType.INTELLECT]: StatType.INTELLECT_BONUS,
  [StatType.WILL]: StatType.WILL_BONUS,
};

// ── Weapon skill → stat mapping ─────────────────────────────────────────────

/** Maps a weapon skill type to the StatType it modifies.
 *  Returns null for named/unique skills that don't have a simple stat mapping. */
export function weaponSkillStat(
  type: WeaponSkillType,
  mainAttr: StatType,
): StatType | null {
  const base = type.replace(/_[SML]$/, '');
  switch (base) {
    case 'ATTACK_BOOST':              return StatType.ATTACK_BONUS;
    case 'STRENGTH_BOOST':            return StatType.STRENGTH;
    case 'AGILITY_BOOST':             return StatType.AGILITY;
    case 'INTELLECT_BOOST':           return StatType.INTELLECT;
    case 'WILL_BOOST':                return StatType.WILL;
    case 'MAIN_ATTRIBUTE_BOOST':      return mainAttr;
    case 'PHYSICAL_DAMAGE_BOOST':     return StatType.PHYSICAL_DAMAGE_BONUS;
    case 'HEAT_DAMAGE_BOOST':         return StatType.HEAT_DAMAGE_BONUS;
    case 'CRYO_DAMAGE_BOOST':         return StatType.CRYO_DAMAGE_BONUS;
    case 'NATURE_DAMAGE_BOOST':       return StatType.NATURE_DAMAGE_BONUS;
    case 'ELECTRIC_DAMAGE_BOOST':     return StatType.ELECTRIC_DAMAGE_BONUS;
    case 'ULTIMATE_GAIN_EFFICIENCY_BOOST': return StatType.ULTIMATE_GAIN_EFFICIENCY;
    case 'HP_BOOST':                  return StatType.HP_BONUS;
    case 'ARTS_BOOST':                return StatType.ARTS_DAMAGE_BONUS;
    case 'ARTS_INTENSITY_BOOST':      return StatType.ARTS_INTENSITY;
    case 'CRITICAL_RATE_BOOST':       return StatType.CRITICAL_RATE;
    case 'TREATMENT_EFFICIENCY_BOOST': return StatType.TREATMENT_BONUS;
    default:                          return null; // Named/unique skills
  }
}

function applyWeaponSkill(
  skill: WeaponSkill,
  stats: Record<StatType, number>,
  mainAttr: StatType,
): void {
  const stat = weaponSkillStat(skill.weaponSkillType, mainAttr);
  if (stat != null) {
    stats[stat] += skill.getValue();
  }
}

// ── Gear effect factory ─────────────────────────────────────────────────────

const GEAR_EFFECT_FACTORIES: Partial<Record<GearEffectType, () => GearEffect>> = {
  [GearEffectType.AIC_HEAVY]:           () => new AicHeavy(),
  [GearEffectType.AIC_LIGHT]:           () => new AicLight(),
  [GearEffectType.ARMORED_MSGR]:        () => new ArmoredMsgr(),
  [GearEffectType.ROVING_MSGR]:         () => new RovingMsgr(),
  [GearEffectType.MORDVOLT_INSULATION]: () => new MordvoltInsulation(),
  [GearEffectType.MORDVOLT_RESISTANT]:  () => new MordvoltResistant(),
  [GearEffectType.ABURREY_LEGACY]:      () => new AburreyLegacy(),
  [GearEffectType.CATASTROPHE]:         () => new Catastrophe(),
  [GearEffectType.SWORDMANCER]:         () => new Swordmancer(),
  [GearEffectType.LYNX]:                () => new Lynx(),
  [GearEffectType.AETHERTECH]:          () => new Aethertech(),
  [GearEffectType.BONEKRUSHA]:          () => new Bonekrusha(),
  [GearEffectType.PULSER_LABS]:         () => new PulserLabs(),
  [GearEffectType.FRONTIERS]:           () => new Frontiers(),
  [GearEffectType.HOT_WORK]:            () => new HotWork(),
  [GearEffectType.MI_SECURITY]:         () => new MiSecurity(),
  [GearEffectType.TYPE_50_YINGLUNG]:    () => new Type50Yinglung(),
  [GearEffectType.TIDE_SURGE]:          () => new TideSurge(),
  [GearEffectType.ETERNAL_XIRANITE]:    () => new EternalXiranite(),
};

// ── Main aggregation ────────────────────────────────────────────────────────

/**
 * Aggregate all loadout sources into final operator stats.
 *
 * This is the smart controller function that pulls numbers from dumb models
 * and combines them for the dumb view.
 */
export function aggregateLoadoutStats(
  operatorId: string,
  loadout: OperatorLoadoutState,
  loadoutStats: LoadoutStats,
): AggregatedStats | null {
  const factory = MODEL_FACTORIES[operatorId];
  if (!factory) return null;

  // 1. Create operator model at the user's configured level
  const model = factory(loadoutStats.operatorLevel);
  const operatorBaseAttack = model.getBaseAttack();
  const stats: Record<StatType, number> = { ...model.stats };
  let flatAttackBonuses = 0;

  // 1b. Apply potential stat bonuses
  const potentialStats = model.getPotentialStats(loadoutStats.potential);
  for (const [key, value] of Object.entries(potentialStats)) {
    stats[key as StatType] += value as number;
  }

  // 1c. Apply attribute increase
  const attrIncreaseValue = model.getAttributeIncrease(loadoutStats.attributeIncreaseLevel ?? 4);
  if (attrIncreaseValue > 0) {
    stats[model.attributeIncreaseAttribute] += attrIncreaseValue;
  }

  // Helper: add a stat value, routing flat ATK to the separate counter
  function addStat(stat: StatType, value: number): void {
    if (stat === StatType.ATTACK) {
      flatAttackBonuses += value;
    } else {
      stats[stat] += value;
    }
  }

  // 2. Weapon
  let weaponBaseAttack = 0;
  if (loadout.weaponName) {
    const weaponEntry = WEAPONS.find((w) => w.name === loadout.weaponName);
    if (weaponEntry) {
      const weapon: Weapon = weaponEntry.create();
      weapon.level = loadoutStats.weaponLevel;
      weaponBaseAttack = weapon.getBaseAttack();

      // Apply weapon skill stat boosts and passive stats
      const allSkills: { skill: WeaponSkill; levelKey: number }[] = [
        { skill: weapon.weaponSkillOne, levelKey: loadoutStats.weaponSkill1Level },
        { skill: weapon.weaponSkillTwo, levelKey: loadoutStats.weaponSkill2Level },
      ];
      if (weapon.weaponSkillThree) {
        allSkills.push({ skill: weapon.weaponSkillThree, levelKey: loadoutStats.weaponSkill3Level });
      }
      for (const { skill, levelKey } of allSkills) {
        skill.level = levelKey;
        applyWeaponSkill(skill, stats, model.mainAttributeType);
        // Apply passive (always-active) stats from named skills
        const passiveStats = skill.getPassiveStats();
        for (const [key, value] of Object.entries(passiveStats)) {
          addStat(key as StatType, value as number);
        }
        // Handle secondary attribute bonus for skills that grant it (e.g. Flow: Unbridled Edge)
        if ('getElementDmgBonus' in skill) {
          const secAttrBonus = (skill as any).getValue();
          if (secAttrBonus > 0) {
            const secBonusStat = ATTR_TO_BONUS[model.secondaryAttributeType];
            if (secBonusStat) {
              stats[secBonusStat] += secAttrBonus;
            }
          }
        }
      }
    }
  }

  // 3. Gear pieces — collect stats and count effect types for set bonus
  const gearPieces: { name: string | null; registry: typeof ARMORS; ranksKey: 'armorRanks' | 'glovesRanks' | 'kit1Ranks' | 'kit2Ranks' }[] = [
    { name: loadout.armorName,  registry: ARMORS, ranksKey: 'armorRanks' },
    { name: loadout.glovesName, registry: GLOVES, ranksKey: 'glovesRanks' },
    { name: loadout.kit1Name,   registry: KITS,   ranksKey: 'kit1Ranks' },
    { name: loadout.kit2Name,   registry: KITS,   ranksKey: 'kit2Ranks' },
  ];
  const effectCounts = new Map<GearEffectType, number>();

  for (const piece of gearPieces) {
    const name = piece.name;
    if (!name) continue;
    const entry = piece.registry.find((g) => g.name === name);
    if (!entry) continue;
    const gear: Gear = entry.create();
    gear.rank = 4; // default rank for fallback
    const lineRanks = loadoutStats[piece.ranksKey] ?? {};
    const gearStats = gear.getStatsPerLine(lineRanks);
    for (const [key, value] of Object.entries(gearStats)) {
      addStat(key as StatType, value as number);
    }
    // Count gear effect type
    effectCounts.set(
      gear.gearEffectType,
      (effectCounts.get(gear.gearEffectType) ?? 0) + 1,
    );
  }

  // 4. Gear set effect — activate passive stats if 3+ pieces of same effect type
  let gearSetActive = false;
  let gearSetType: GearEffectType | null = null;
  let gearSetDescription: string | null = null;
  effectCounts.forEach((count, effectType) => {
    if (count >= 3 && effectType !== GearEffectType.NONE) {
      gearSetActive = true;
      gearSetType = effectType;
      const effectFactory = GEAR_EFFECT_FACTORIES[effectType];
      if (effectFactory) {
        const effect = effectFactory();
        gearSetDescription = effect.description;
        for (const [key, value] of Object.entries(effect.passiveStats)) {
          addStat(key as StatType, value as number);
        }
      }
    }
  });

  // 5. Consumable (food buff)
  if (loadout.consumableName) {
    const entry = CONSUMABLES.find((c) => c.name === loadout.consumableName);
    if (entry) {
      const consumable: Consumable = entry.create();
      for (const [key, value] of Object.entries(consumable.stats)) {
        addStat(key as StatType, value as number);
      }
    }
  }

  // 6. Tactical
  if (loadout.tacticalName) {
    const entry = TACTICALS.find((t) => t.name === loadout.tacticalName);
    if (entry) {
      const tactical: Tactical = entry.create();
      for (const [key, value] of Object.entries(tactical.stats)) {
        addStat(key as StatType, value as number);
      }
    }
  }

  const baseAttack = operatorBaseAttack + weaponBaseAttack;
  const atkBonus = stats[StatType.ATTACK_BONUS];
  const atkPercentageBonus = baseAttack * atkBonus;
  const totalAttack = baseAttack * (1 + atkBonus) + flatAttackBonuses;
  // Apply percentage bonuses to flat attributes before computing attribute bonus
  const mainAttrBonusStat = ATTR_TO_BONUS[model.mainAttributeType];
  const effectiveMainAttr = Math.floor(stats[model.mainAttributeType] * (1 + (mainAttrBonusStat ? stats[mainAttrBonusStat] : 0)));
  const secAttrBonusStat = ATTR_TO_BONUS[model.secondaryAttributeType];
  const effectiveSecAttr = Math.floor(stats[model.secondaryAttributeType] * (1 + (secAttrBonusStat ? stats[secAttrBonusStat] : 0)));
  const mainAttributeBonus = 0.005 * effectiveMainAttr;
  const secondaryAttributeBonus = 0.002 * effectiveSecAttr;
  const attributeBonus = 1 + mainAttributeBonus + secondaryAttributeBonus;
  const effectiveAttack = totalAttack * attributeBonus;

  return {
    operatorBaseAttack,
    weaponBaseAttack,
    flatAttackBonuses,
    baseAttack,
    atkBonus,
    atkPercentageBonus,
    totalAttack,
    attributeBonus,
    effectiveAttack,
    mainAttributeBonus,
    secondaryAttributeBonus,
    stats,
    mainAttributeType: model.mainAttributeType,
    secondaryAttributeType: model.secondaryAttributeType,
    element: model.element,
    gearSetActive,
    gearSetType,
    gearSetDescription,
  };
}
