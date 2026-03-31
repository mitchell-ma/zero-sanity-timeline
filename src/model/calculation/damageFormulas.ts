import {
  CombatSkillType,
  CritMode,
  ElementType,
  EnemyTierType,
  StatType,
  PhysicalStatusType,
} from "../../consts/enums";
import { StatusLevel, TalentLevel } from "../../consts/types";
import { Enemy } from "../enemies/enemy";

// ── Attack ──────────────────────────────────────────────────────────────────

/**
 * Combined attack value.
 *
 * Attack = (OperatorATK + WeaponATK) × (1 + ATK_BONUS) + flatBonuses
 *
 * `flatBonuses` covers any additional flat ATK from gear effects, buffs, etc.
 */
export function getTotalAttack(
  operatorBaseAttack: number,
  weaponBaseAttack: number,
  attackBonusPercent: number,
  flatBonuses: number,
): number {
  return (operatorBaseAttack + weaponBaseAttack) * (1 + attackBonusPercent) + flatBonuses;
}

// ── Attribute Bonus ─────────────────────────────────────────────────────────

/**
 * AttributeBonus = 1 + 0.005 × mainAttribute + 0.002 × secondaryAttribute
 *
 * Main/secondary attributes are determined by the operator's class
 * (e.g. Laevatain: main = INTELLECT, secondary = STRENGTH).
 */
export function getAttributeBonus(
  mainAttribute: number,
  secondaryAttribute: number,
): number {
  return 1 + 0.005 * mainAttribute + 0.002 * secondaryAttribute;
}

// ── Damage Bonus (Multiplier Group) ─────────────────────────────────────────

/**
 * MultiplierGroup = 1 + ∑DamageBonuses
 *
 * Damage bonuses are additive within this group:
 * - Element damage bonus (e.g. HEAT_DAMAGE_BONUS)
 * - Skill type damage bonus (e.g. BASIC_ATTACK_DAMAGE_BONUS)
 * - Stagger damage bonus (DMG Bonus vs. Staggered — only when target is staggered)
 * - Generic bonuses (SKILL_DAMAGE_BONUS, ARTS_DAMAGE_BONUS)
 */
export function getDamageBonus(
  elementDamageBonus: number,
  skillTypeDamageBonus: number,
  skillDamageBonus: number,
  artsDamageBonus: number,
  staggerDamageBonus: number = 0,
): number {
  return 1 + elementDamageBonus + skillTypeDamageBonus + skillDamageBonus + artsDamageBonus + staggerDamageBonus;
}

/** Map an element to its corresponding damage bonus stat. */
export function getElementDamageBonusStat(element: ElementType): StatType {
  const map: Record<ElementType, StatType> = {
    [ElementType.NONE]: StatType.PHYSICAL_DAMAGE_BONUS,
    [ElementType.PHYSICAL]: StatType.PHYSICAL_DAMAGE_BONUS,
    [ElementType.HEAT]: StatType.HEAT_DAMAGE_BONUS,
    [ElementType.ELECTRIC]: StatType.ELECTRIC_DAMAGE_BONUS,
    [ElementType.CRYO]: StatType.CRYO_DAMAGE_BONUS,
    [ElementType.NATURE]: StatType.NATURE_DAMAGE_BONUS,
    [ElementType.ARTS]: StatType.PHYSICAL_DAMAGE_BONUS,
  };
  return map[element];
}

/** Map a combat skill type to its corresponding damage bonus stat. */
export function getSkillTypeDamageBonusStat(skillType: CombatSkillType): StatType {
  const map: Record<CombatSkillType, StatType> = {
    [CombatSkillType.BASIC_ATTACK]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.BATK]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.FINAL_STRIKE]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.NORMAL]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.BATTLE_SKILL]: StatType.BATTLE_SKILL_DAMAGE_BONUS,
    [CombatSkillType.COMBO_SKILL]: StatType.COMBO_SKILL_DAMAGE_BONUS,
    [CombatSkillType.ULTIMATE]: StatType.ULTIMATE_DAMAGE_BONUS,
    [CombatSkillType.ULTIMATE_SKILL]: StatType.ULTIMATE_DAMAGE_BONUS,
    [CombatSkillType.DASH]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.FINISHER]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.DIVE]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.CONTROL]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
  };
  return map[skillType];
}

// ── Critical Hit ────────────────────────────────────────────────────────────

/**
 * CriticalMultiplier = 1 + critDamage  (if crit)
 *                    = 1               (if not crit)
 *
 * Base crit rate: 5%, base crit damage: 50%.
 */
export function getCritMultiplier(isCrit: boolean, critDamage: number): number {
  return isCrit ? 1 + critDamage : 1;
}

/** Expected crit multiplier for average calculations. */
export function getExpectedCritMultiplier(critRate: number, critDamage: number): number {
  const clampedRate = Math.min(Math.max(critRate, 0), 1);
  return 1 + clampedRate * critDamage;
}

// ── Defense ─────────────────────────────────────────────────────────────────

/**
 * DefenseMultiplier:
 *   if DEF >= 0: 100 / (DEF + 100)
 *   if DEF <  0: 2 - 0.99^(-DEF)
 *
 * Default enemy DEF = 100.
 */
export function getDefenseMultiplier(def: number): number {
  if (def >= 0) {
    return 100 / (def + 100);
  }
  return 2 - Math.pow(0.99, -def);
}

export function getEnemyDef(enemy: Enemy): number {
  return enemy.getDef();
}

// ── Resistance ──────────────────────────────────────────────────────────────

/**
 * ResistanceMultiplier = enemy's elemental resistance value.
 *
 * Enemy resistances are stored as multipliers directly (1.0 = no resist,
 * 0.8 = 20% resist, 1.2 = 20% weakness). The multiplier is used as-is.
 */
export function getResistanceMultiplier(enemy: Enemy, element: ElementType): number {
  return enemy.getResistance(element);
}

// ── Stagger ─────────────────────────────────────────────────────────────────

/** StaggerMultiplier = 1.3 if enemy is staggered, 1.0 otherwise. */
export function getStaggerMultiplier(isStaggered: boolean): number {
  return isStaggered ? 1.3 : 1.0;
}

// ── Finisher ────────────────────────────────────────────────────────────────

/** FinisherMultiplier based on enemy tier. */
export function getFinisherMultiplier(enemyTier: EnemyTierType, isFinisher: boolean): number {
  if (!isFinisher) return 1.0;
  const map: Record<EnemyTierType, number> = {
    [EnemyTierType.COMMON]: 1.0,
    [EnemyTierType.ADVANCED]: 1.25,
    [EnemyTierType.ELITE]: 1.5,
    [EnemyTierType.ALPHA]: 1.5,
    [EnemyTierType.BOSS]: 1.75,
  };
  return map[enemyTier];
}

// ── Amp ─────────────────────────────────────────────────────────────────────

/** AmpMultiplier = 1 + ∑ampBonuses (additive stacking). */
export function getAmpMultiplier(ampBonuses: number): number {
  return 1 + ampBonuses;
}

// ── Weaken ──────────────────────────────────────────────────────────────────

/** WeakenMultiplier = ∏(1 − weakenEffect) (multiplicative stacking). */
export function getWeakenMultiplier(weakenEffects: number[]): number {
  let result = 1;
  for (const effect of weakenEffects) {
    result *= (1 - effect);
  }
  return result;
}

// ── Susceptibility ──────────────────────────────────────────────────────────

/** SusceptibilityMultiplier = 1 + ∑susceptibilityEffects (additive). */
export function getSusceptibilityMultiplier(susceptibilityEffects: number): number {
  return 1 + susceptibilityEffects;
}

// ── Increased DMG Taken ─────────────────────────────────────────────────────

/** IncreasedDMGTakenMultiplier = 1 + ∑fragility (additive). */
export function getFragilityMultiplier(fragility: number): number {
  return 1 + fragility;
}

// ── DMG Reduction ───────────────────────────────────────────────────────────

/** DMGReductionMultiplier = ∏(1 − dmgReductionEffect) (multiplicative). */
export function getDmgReductionMultiplier(dmgReductionEffects: number[]): number {
  let result = 1;
  for (const effect of dmgReductionEffects) {
    result *= (1 - effect);
  }
  return result;
}

// ── Protection ──────────────────────────────────────────────────────────────

/** ProtectionMultiplier = 1 − max(protectionEffects). Takes only the strongest. */
export function getProtectionMultiplier(protectionEffects: number[]): number {
  if (protectionEffects.length === 0) return 1;
  return 1 - Math.max(...protectionEffects);
}

// ── Link ────────────────────────────────────────────────────────────────────

/** LinkMultiplier = 1 + linkBonus if link attack, 1 otherwise. */
export function getLinkMultiplier(linkBonus: number, isLinkAttack: boolean): number {
  return isLinkAttack ? 1 + linkBonus : 1;
}

// ── Arts Intensity ──────────────────────────────────────────────────────────

/**
 * ArtsIntensityMultiplier = 1 + artsIntensity / 100
 *
 * Applies to arts reaction / arts burst / status effect damage.
 * Each point of Arts Intensity = 1% more damage for elemental effects.
 */
export function getArtsIntensityMultiplier(artsIntensity: number): number {
  return 1 + artsIntensity / 100;
}

// ── Status Effect / Arts Reaction Damage ────────────────────────────────────

/**
 * Physical status base multipliers (percentage of ATK):
 * - Lift / Knock Down / Shatter: 120% (fixed)
 * - Crush: 300% / 450% / 600% / 750% (scales with Vulnerable stacks consumed)
 * - Breach: 50% + 50% per Vulnerable stack
 */

const CRUSH_MULTIPLIER: Record<number, number> = {
  1: 3.0,
  2: 4.5,
  3: 6.0,
  4: 7.5,
};

export function getPhysicalStatusBaseMultiplier(
  statusType: PhysicalStatusType,
  vulnerableStacks: number,
): number {
  switch (statusType) {
    case PhysicalStatusType.LIFT:
    case PhysicalStatusType.KNOCK_DOWN:
      return 1.2;
    case PhysicalStatusType.CRUSH:
      return CRUSH_MULTIPLIER[Math.min(vulnerableStacks, 4)] ?? CRUSH_MULTIPLIER[1];
    case PhysicalStatusType.BREACH:
      return 0.5 + 0.5 * vulnerableStacks;
  }
}

/**
 * Physical status base stagger values.
 * Lift / Knock Down: 10
 */
const PHYSICAL_STATUS_BASE_STAGGER: Partial<Record<PhysicalStatusType, number>> = {
  [PhysicalStatusType.LIFT]: 10,
  [PhysicalStatusType.KNOCK_DOWN]: 10,
};

/**
 * Stagger dealt by a physical status, scaled by Arts Intensity.
 *
 * Stagger = BaseStagger × (1 + ArtsIntensity / 200)
 */
export function getPhysicalStatusStagger(
  statusType: PhysicalStatusType,
  artsIntensity: number,
): number {
  const base = PHYSICAL_STATUS_BASE_STAGGER[statusType] ?? 0;
  return base * (1 + artsIntensity / 200);
}

/**
 * Arts Burst base multiplier: 160% (fixed, regardless of infliction count).
 */
export function getArtsBurstBaseMultiplier(): number {
  return 1.6;
}

/**
 * Arts Reaction base multiplier: 80% + 80% per infliction stack.
 */
export function getArtsReactionBaseMultiplier(stacks: number): number {
  return 0.8 + 0.8 * stacks;
}

/**
 * Shatter base multiplier: 120% + 120% per stack.
 */
export function getShatterBaseMultiplier(stacks: StatusLevel): number {
  return 1.2 + 1.2 * stacks;
}

/**
 * Combustion DoT multiplier per tick: 12% + 12% per stack.
 */
export function getCombustionDotMultiplier(stacks: StatusLevel): number {
  return 0.12 + 0.12 * stacks;
}

// ── Corrosion ──────────────────────────────────────────────────────────────

/**
 * Corrosion initial Nature DMG multiplier (percentage of ATK).
 * Only applies to naturally triggered corrosion, NOT forced reactions.
 *
 * Stacks  |  1    |  2    |  3    |  4
 * Multiplier    | 160%  | 240%  | 320%  | 400%
 */
export function getCorrosionInitialMultiplier(stacks: StatusLevel): number {
  return 0.8 + 0.8 * stacks;
}

/**
 * Corrosion resistance reduction table by stacks.
 * Returns { initial, max } reduction values (flat, not percentage).
 *
 * Stacks   |  1       |  2       |  3      |  4
 * Initial  |  3.6     |  4.8     |  6      |  7.2
 * Maximum  | 12       | 16       | 20      | 24
 */
const CORROSION_REDUCTION: Record<StatusLevel, { initial: number; max: number }> = {
  1: { initial: 3.6, max: 12 },
  2: { initial: 4.8, max: 16 },
  3: { initial: 6, max: 20 },
  4: { initial: 7.2, max: 24 },
};

/**
 * Base corrosion resistance reduction at a given elapsed time.
 * Linearly interpolates from initial to max over 10 seconds, then stays at max.
 */
export function getCorrosionBaseReduction(stacks: StatusLevel, elapsedSeconds: number): number {
  const { initial, max } = CORROSION_REDUCTION[stacks];
  if (elapsedSeconds >= 10) return max;
  if (elapsedSeconds <= 0) return initial;
  return initial + (max - initial) * (elapsedSeconds / 10);
}

/**
 * Arts Intensity scaling for corrosion resistance reduction.
 *
 * CorrosionReduction = BaseCorrosionEffect × (1 + 2×ArtsIntensity / (ArtsIntensity + 300))
 */
export function getCorrosionReductionMultiplier(artsIntensity: number): number {
  return 1 + (2 * artsIntensity) / (artsIntensity + 300);
}

/**
 * Final corrosion resistance reduction at a given time, scaled by Arts Intensity.
 * This value is subtracted from enemy resistance to all damage types.
 */
export function getCorrosionReduction(
  stacks: StatusLevel,
  elapsedSeconds: number,
  artsIntensity: number,
): number {
  return getCorrosionBaseReduction(stacks, elapsedSeconds)
    * getCorrosionReductionMultiplier(artsIntensity);
}

// ── Scorching Heart (Ignored Resistance) ────────────────────────────────────

/**
 * Heat Resistance points ignored by Laevatain's Scorching Heart talent.
 * E0 (talent 0–1): 10, E1 (talent 2): 15, E3 (talent 3): 20.
 */
const SCORCHING_HEART_IGNORED: Record<TalentLevel, number> = {
  0: 10,
  1: 10,
  2: 15,
  3: 20,
};

export function getScorchingHeartIgnoredResistance(talentLevel: TalentLevel): number {
  return SCORCHING_HEART_IGNORED[talentLevel];
}

// ── Hidden Level Multiplier ─────────────────────────────────────────────────

/**
 * Physical status hidden multiplier = 1 + (operatorLevel − 139) / 2
 * (Can be negative at low levels — this is intentional per the formula.)
 */
export function getPhysicalStatusHiddenMultiplier(operatorLevel: number): number {
  return 1 + (operatorLevel - 139) / 2;
}

/**
 * Hidden multiplier for arts bursts and arts reactions.
 * HiddenMultiplier = 1 + (operatorLevel − 1) / 196
 */
export function getArtsHiddenMultiplier(operatorLevel: number): number {
  return 1 + (operatorLevel - 1) / 196;
}

/**
 * Hidden multiplier for physical statuses.
 * HiddenMultiplier = 1 + (operatorLevel − 1) / 392
 */
export function getPhysicalHiddenMultiplier(operatorLevel: number): number {
  return 1 + (operatorLevel - 1) / 392;
}

// ── Composite Damage Formula ────────────────────────────────────────────────

/** A labeled source contributing to a composite multiplier. */
export interface MultiplierSource {
  label: string;
  value: number;
  /** Category for grouping in the breakdown tree (e.g. 'Physical', 'Arts', 'Weapon', 'Talent'). */
  category?: string;
}

/** Sub-component values for multipliers that aggregate multiple sources. */
export interface DamageSubComponents {
  // Attack sub-components
  operatorBaseAttack: number;
  weaponBaseAttack: number;
  atkBonusPct: number;
  flatAtkBonuses: number;
  // Attribute sub-components
  mainAttrType: StatType;
  mainAttrValue: number;
  secondaryAttrType: StatType;
  secondaryAttrValue: number;
  // Damage Bonus sub-components (additive)
  element: ElementType;
  elementDmgBonus: number;
  allElementDmgBonuses: Partial<Record<ElementType, number>>;
  skillTypeDmgBonus: number;
  skillDmgBonus: number;
  artsDmgBonus: number;
  staggerDmgBonus: number;
  // Critical sub-components
  critRate: number;
  critDamage: number;
  critMode: CritMode;
  isCrit?: boolean;
  /** Crit expectation model snapshot for this frame (EXPECTED mode with crit-dependent statuses). */
  critSnapshot?: import('../../controller/calculation/critExpectationModel').CritFrameSnapshot;
  // Resistance sub-components
  baseResistance: number;
  corrosionReduction: number;
  ignoredResistance: number;
  // Fragility sub-components
  fragilityBonus: number;
  fragilitySources: MultiplierSource[];
  /** Per-element fragility sources for full breakdown. */
  allFragilitySources: Partial<Record<ElementType, MultiplierSource[]>>;
  // Susceptibility sub-components
  susceptibilitySources: MultiplierSource[];
  /** Per-element susceptibility sources for full breakdown. */
  allSusceptibilitySources: Partial<Record<ElementType, MultiplierSource[]>>;
  // Amp sub-components
  ampSources: MultiplierSource[];
  /** Per-element Amp sources for full breakdown. */
  allAmpSources: Partial<Record<ElementType, MultiplierSource[]>>;
  // Weaken sub-components
  weakenEffects: number[];
  // DMG Reduction sub-components
  dmgReductionEffects: number[];
  // Protection sub-components
  protectionEffects: number[];
  /** Raw segment multiplier before dividing by frame count (for display). */
  segmentMultiplier?: number;
  /** Number of frames the segment multiplier is spread across. */
  segmentFrameCount?: number;
  /** True when the multiplier is a per-tick value (e.g. ramping skills), not segment ÷ frames. */
  isPerTickMultiplier?: boolean;
  /** Per-stat source breakdown from loadout aggregation. */
  statSources?: Partial<Record<StatType, { source: string; value: number }[]>>;
  /** Which StatType was used for the skill type DMG bonus (for source lookup). */
  skillTypeDmgBonusStat?: StatType;
}

export interface DamageParams {
  /** Total computed attack (after all bonuses). */
  attack: number;
  /** Skill multiplier (e.g. 1.5 = 150% ATK). */
  baseMultiplier: number;
  /** Attribute bonus from main + secondary attributes. */
  attributeBonus: number;
  /** 1 + ∑DamageBonuses (element + skill type + generic). */
  multiplierGroup: number;
  /** Crit multiplier (1 or 1 + critDmg). */
  critMultiplier: number;
  /** 1 + ∑ampBonuses. */
  ampMultiplier: number;
  /** 1.3 if staggered, 1 otherwise. */
  staggerMultiplier: number;
  /** Finisher multiplier based on enemy tier. */
  finisherMultiplier: number;
  /** 1 + linkBonus or 1. */
  linkMultiplier: number;
  /** ∏(1 − weaken). */
  weakenMultiplier: number;
  /** 1 + ∑susceptibility. */
  susceptibilityMultiplier: number;
  /** 1 + ∑fragility. */
  fragilityMultiplier: number;
  /** ∏(1 − dmgReduction). */
  dmgReductionMultiplier: number;
  /** 1 − max(protection). */
  protectionMultiplier: number;
  /** 100 / (DEF + 100) or 2 − 0.99^(−DEF). */
  defenseMultiplier: number;
  /** Enemy elemental resistance multiplier. */
  resistanceMultiplier: number;
  /** Operator talent special multiplier (e.g. Last Rite T2, Avywenna P5). Default 1. */
  specialMultiplier?: number;
  /** Individual sub-component values for breakdown display. */
  sub?: DamageSubComponents;
}

/**
 * Full damage formula:
 *
 * Damage = Attack × BaseMultiplier × AttributeBonus × MultiplierGroup
 *        × CritMultiplier × AmpMultiplier × StaggerMultiplier
 *        × FinisherMultiplier × LinkMultiplier × WeakenMultiplier
 *        × SusceptibilityMultiplier × IncreasedDMGTakenMultiplier
 *        × DMGReductionMultiplier × ProtectionMultiplier
 *        × DefenseMultiplier × ResistanceMultiplier
 */
export function calculateDamage(params: DamageParams): number {
  const effectiveAttack = Math.round(params.attack * params.attributeBonus * 10) / 10;
  return (
    effectiveAttack *
    params.baseMultiplier *
    params.multiplierGroup *
    params.critMultiplier *
    params.ampMultiplier *
    params.staggerMultiplier *
    params.finisherMultiplier *
    params.linkMultiplier *
    params.weakenMultiplier *
    params.susceptibilityMultiplier *
    params.fragilityMultiplier *
    params.dmgReductionMultiplier *
    params.protectionMultiplier *
    params.defenseMultiplier *
    params.resistanceMultiplier *
    (params.specialMultiplier ?? 1)
  );
}

/**
 * Status effect damage (arts reactions, physical statuses).
 *
 * StatusDamage = Attack × StatusBaseMultiplier × ArtsIntensityMultiplier
 *             × HiddenMultiplier × DefenseMultiplier × ResistanceMultiplier
 *             × SusceptibilityMultiplier × WeakenMultiplier
 *             × IncreasedDMGTakenMultiplier × DMGReductionMultiplier
 */
export interface StatusDamageParams {
  attack: number;
  statusBaseMultiplier: number;
  artsIntensityMultiplier: number;
  hiddenMultiplier: number;
  defenseMultiplier: number;
  resistanceMultiplier: number;
  susceptibilityMultiplier: number;
  weakenMultiplier: number;
  fragilityMultiplier: number;
  dmgReductionMultiplier: number;
}

export function calculateStatusDamage(params: StatusDamageParams): number {
  return (
    params.attack *
    params.statusBaseMultiplier *
    params.artsIntensityMultiplier *
    params.hiddenMultiplier *
    params.defenseMultiplier *
    params.resistanceMultiplier *
    params.susceptibilityMultiplier *
    params.weakenMultiplier *
    params.fragilityMultiplier *
    params.dmgReductionMultiplier
  );
}
