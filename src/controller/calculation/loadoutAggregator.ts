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

import { GearSetType, StatType, WeaponSkillType } from '../../consts/enums';
import type { SkillLevel } from '../../consts/types';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { LoadoutProperties } from '../../view/InformationPane';
import { DataDrivenOperator } from '../../model/operators/dataDrivenOperator';
import { getOperatorConfig } from '../operators/operatorRegistry';
import {
  getWeapon,
  getGearPiece,
  getGenericSkillStats,
  getNamedSkillPassiveStats,
  getConsumableEntry,
  getTacticalEntry,
} from '../gameDataController';

// ── Result type ─────────────────────────────────────────────────────────

export interface StatSourceEntry {
  source: string;
  value: number;
}

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
  /** Unrounded main attribute bonus for display. */
  displayMainAttributeBonus: number;
  /** Unrounded secondary attribute bonus for display. */
  displaySecondaryAttributeBonus: number;
  /** All stats merged from all sources (excludes base ATK and flat ATK bonuses). */
  stats: Record<StatType, number>;
  /** Per-stat breakdown of where each contribution came from. */
  statSources: Partial<Record<StatType, StatSourceEntry[]>>;
  /** The operator's main attribute type (for attribute bonus calc). */
  mainAttributeType: StatType;
  /** The operator's secondary attribute type. */
  secondaryAttributeType: StatType;
  /** Operator element. */
  element: import('../../consts/enums').ElementType;
  /** Whether a gear set effect is active (3+ pieces of same type). */
  gearSetActive: boolean;
  /** Which gear effect type is active, if any. */
  gearSetType: GearSetType | null;
  /** Human-readable description of the active gear set effect, if any. */
  gearSetDescription: string | null;
}

// ── Attribute → bonus stat mapping ──────────────────────────────────────

/** Maps flat attribute stat types to their percentage bonus counterparts. */
const ATTR_TO_BONUS: Partial<Record<StatType, StatType>> = {
  [StatType.STRENGTH]: StatType.STRENGTH_BONUS,
  [StatType.AGILITY]: StatType.AGILITY_BONUS,
  [StatType.INTELLECT]: StatType.INTELLECT_BONUS,
  [StatType.WILL]: StatType.WILL_BONUS,
};

// ── Weapon skill → stat mapping ─────────────────────────────────────────

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

/** Maps a clause effect object name to a StatType, resolving MAIN_ATTRIBUTE. */
function resolveClauseStatType(object: string, mainAttr: StatType): StatType | null {
  if (object === 'MAIN_ATTRIBUTE') return mainAttr;
  // Check if it's a valid StatType
  if (Object.values(StatType).includes(object as StatType)) return object as StatType;
  return null;
}


// ── Main aggregation ────────────────────────────────────────────────────

/**
 * Aggregate all loadout sources into final operator stats.
 *
 * This is the smart controller function that pulls numbers from dumb models
 * and combines them for the dumb view.
 */
export function aggregateLoadoutStats(
  operatorId: string,
  loadout: OperatorLoadoutState,
  loadoutProperties: LoadoutProperties,
): AggregatedStats | null {
  const config = getOperatorConfig(operatorId);
  if (!config) return null;

  // 1. Create operator model and apply user's loadout state
  const model = new DataDrivenOperator(config, loadoutProperties.operator.level);
  model.potential = loadoutProperties.operator.potential as 0 | 1 | 2 | 3 | 4 | 5;
  model.talentOneLevel = loadoutProperties.operator.talentOneLevel;
  model.talentTwoLevel = loadoutProperties.operator.talentTwoLevel;
  model.attributeIncreaseLevel = loadoutProperties.operator.attributeIncreaseLevel ?? 4;
  model.basicAttackLevel = loadoutProperties.skills.basicAttackLevel as SkillLevel;
  model.battleSkillLevel = loadoutProperties.skills.battleSkillLevel as SkillLevel;
  model.comboSkillLevel = loadoutProperties.skills.comboSkillLevel as SkillLevel;
  model.ultimateLevel = loadoutProperties.skills.ultimateLevel as SkillLevel;

  const operatorBaseAttack = model.getBaseAttack();
  const stats: Record<StatType, number> = { ...model.stats };
  const statSources: Partial<Record<StatType, StatSourceEntry[]>> = {};
  let flatAttackBonuses = 0;

  // Helper: track a source contribution for a stat
  function trackSource(stat: StatType, source: string, value: number): void {
    if (value === 0) return;
    if (!statSources[stat]) statSources[stat] = [];
    statSources[stat]!.push({ source, value });
  }

  // 1. Record operator base stats
  for (const [key, value] of Object.entries(model.stats)) {
    if ((value as number) !== 0) trackSource(key as StatType, 'Operator', value as number);
  }

  // 1b. Apply potential stat bonuses
  const potentialStats = model.getPotentialStats();
  for (const [key, value] of Object.entries(potentialStats)) {
    stats[key as StatType] += value as number;
    trackSource(key as StatType, 'Potential', value as number);
  }

  // 1c. Apply attribute increase
  const attrIncreaseValue = model.getAttributeIncrease();
  if (attrIncreaseValue > 0) {
    stats[model.attributeIncreaseAttribute] += attrIncreaseValue;
    trackSource(model.attributeIncreaseAttribute, 'Attr Increase', attrIncreaseValue);
  }

  // Helper: add a stat value, routing flat ATK to the separate counter
  function addStat(stat: StatType, value: number, source?: string): void {
    if (stat === StatType.BASE_ATTACK) {
      flatAttackBonuses += value;
    } else {
      stats[stat] += value;
    }
    if (source && value !== 0) trackSource(stat, source, value);
  }

  // 2. Weapon — via gameDataController
  let weaponBaseAttack = 0;
  if (loadout.weaponId) {
    const weaponPiece = getWeapon(loadout.weaponId);
    if (weaponPiece) {
      weaponBaseAttack = weaponPiece.getBaseAttack(loadoutProperties.weapon.level);

      // Apply weapon skill stat boosts from generic + named skills
      const skillLevels = [
        loadoutProperties.weapon.skill1Level,
        loadoutProperties.weapon.skill2Level,
        loadoutProperties.weapon.skill3Level,
      ];
      for (let i = 0; i < weaponPiece.skills.length; i++) {
        const skillId = weaponPiece.skills[i];
        const level = skillLevels[i] ?? 1;

        // Try generic skill stats (e.g. INTELLECT_BOOST_L → INTELLECT value)
        const genericResults = getGenericSkillStats(skillId, level);
        if (genericResults.length > 0) {
          for (const { stat, value } of genericResults) {
            const statType = resolveClauseStatType(stat, model.mainAttributeType);
            if (statType != null) {
              stats[statType] += value;
              trackSource(statType, 'Weapon Skill', value);
            }
          }
          continue;
        }

        // Named skill — get passive stats from weapon skill controller
        const namedStats = getNamedSkillPassiveStats(weaponPiece.id, level);
        for (const { stat, value } of namedStats) {
          const resolvedStat = resolveClauseStatType(stat, model.mainAttributeType);
          if (resolvedStat != null) {
            addStat(resolvedStat, value, 'Weapon Passive');
          }
        }
      }
    }
  }

  // 3. Gear pieces — collect stats and count effect types for set bonus
  const gearPieces: { id: string | null; ranksKey: keyof typeof loadoutProperties.gear }[] = [
    { id: loadout.armorId,  ranksKey: 'armorRanks' },
    { id: loadout.glovesId, ranksKey: 'glovesRanks' },
    { id: loadout.kit1Id,   ranksKey: 'kit1Ranks' },
    { id: loadout.kit2Id,   ranksKey: 'kit2Ranks' },
  ];
  const effectCounts = new Map<string, number>();

  for (const piece of gearPieces) {
    if (!piece.id) continue;
    const gearPiece = getGearPiece(piece.id);
    if (!gearPiece) continue;
    const lineRanks = loadoutProperties.gear[piece.ranksKey] ?? {};
    const gearStats = gearPiece.getStatsPerLine(lineRanks);
    for (const [key, value] of Object.entries(gearStats)) {
      addStat(key as StatType, value as number, 'Gear');
    }
    // Count gear set for set bonus
    effectCounts.set(
      gearPiece.gearSet,
      (effectCounts.get(gearPiece.gearSet) ?? 0) + 1,
    );
  }

  // 4. Gear set effect — activate passive stats if 3+ pieces of same effect type
  let gearSetActive = false;
  let gearSetType: GearSetType | null = null;
  let gearSetDescription: string | null = null;
  effectCounts.forEach((count, effectType) => {
    if (count >= 3 && effectType !== 'NONE') {
      gearSetActive = true;
      gearSetType = effectType as GearSetType;
      const entry = getGearSetEffects(effectType as GearSetType);
      if (entry) {
        gearSetDescription = entry.label;
        for (const [key, value] of Object.entries(entry.passiveStats)) {
          addStat(key as StatType, value as number, 'Gear Set');
        }
      }
    }
  });

  // 5. Consumable (food buff)
  if (loadout.consumableId) {
    const entry = getConsumableEntry(loadout.consumableId);
    if (entry) {
      const consumable = entry.create();
      for (const [key, value] of Object.entries(consumable.stats)) {
        addStat(key as StatType, value as number, 'Food');
      }
    }
  }

  // 6. Tactical
  if (loadout.tacticalId) {
    const entry = getTacticalEntry(loadout.tacticalId);
    if (entry) {
      const tactical = entry.create();
      for (const [key, value] of Object.entries(tactical.stats)) {
        addStat(key as StatType, value as number, 'Tactical');
      }
    }
  }

  const baseAttack = operatorBaseAttack + weaponBaseAttack;
  const atkBonus = stats[StatType.ATTACK_BONUS];
  const atkPercentageBonus = baseAttack * atkBonus;
  const totalAttack = baseAttack * (1 + atkBonus) + flatAttackBonuses;
  // Apply percentage bonuses to flat attributes before computing attribute bonus.
  // The game floors the effective attribute value before computing the ATK bonus.
  const mainAttrBonusStat = ATTR_TO_BONUS[model.mainAttributeType];
  const effectiveMainAttr = Math.floor(stats[model.mainAttributeType] * (1 + (mainAttrBonusStat ? stats[mainAttrBonusStat] : 0)));
  const secAttrBonusStat = ATTR_TO_BONUS[model.secondaryAttributeType];
  const effectiveSecAttr = Math.floor(stats[model.secondaryAttributeType] * (1 + (secAttrBonusStat ? stats[secAttrBonusStat] : 0)));
  const mainAttributeBonus = 0.005 * effectiveMainAttr;
  const secondaryAttributeBonus = 0.002 * effectiveSecAttr;
  // Unrounded values for info pane display (show true stat contribution before game rounding).
  const rawMainAttr = stats[model.mainAttributeType] * (1 + (mainAttrBonusStat ? stats[mainAttrBonusStat] : 0));
  const rawSecAttr = stats[model.secondaryAttributeType] * (1 + (secAttrBonusStat ? stats[secAttrBonusStat] : 0));
  const displayMainAttributeBonus = 0.005 * rawMainAttr;
  const displaySecondaryAttributeBonus = 0.002 * rawSecAttr;
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
    displayMainAttributeBonus,
    displaySecondaryAttributeBonus,
    stats,
    statSources,
    mainAttributeType: model.mainAttributeType,
    secondaryAttributeType: model.secondaryAttributeType,
    element: model.element,
    gearSetActive,
    gearSetType,
    gearSetDescription,
  };
}
