import {
  CombatSkillType,
  ElementType,
  EnemyStatType,
  EnemyTierType,
  StatType,
  StatusType,
} from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { Operator } from "../operators/operator";
import { Weapon } from "../weapons/weapon";
import { Enemy } from "../enemies/enemy";

// ── Attack ──────────────────────────────────────────────────────────────────

/** Total operator base attack = operator ATK + weapon ATK. */
export function getOperatorBaseAttack(operator: Operator): number {
  return operator.getBaseAttack();
}

export function getWeaponBaseAttack(weapon: Weapon): number {
  return weapon.getBaseAttack();
}

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
 * - Generic bonuses (SKILL_DAMAGE_BONUS, ARTS_DAMAGE_BONUS)
 */
export function getDamageBonus(
  elementDamageBonus: number,
  skillTypeDamageBonus: number,
  skillDamageBonus: number,
  artsDamageBonus: number,
): number {
  return 1 + elementDamageBonus + skillTypeDamageBonus + skillDamageBonus + artsDamageBonus;
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
  };
  return map[element];
}

/** Map a combat skill type to its corresponding damage bonus stat. */
export function getSkillTypeDamageBonusStat(skillType: CombatSkillType): StatType {
  const map: Record<CombatSkillType, StatType> = {
    [CombatSkillType.BASIC_ATTACK]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
    [CombatSkillType.BATTLE_SKILL]: StatType.BATTLE_SKILL_DAMAGE_BONUS,
    [CombatSkillType.COMBO_SKILL]: StatType.COMBO_SKILL_DAMAGE_BONUS,
    [CombatSkillType.ULTIMATE]: StatType.ULTIMATE_DAMAGE_BONUS,
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

/** IncreasedDMGTakenMultiplier = 1 + ∑increasedDmgTaken (additive). */
export function getIncreasedDmgTakenMultiplier(increasedDmgTaken: number): number {
  return 1 + increasedDmgTaken;
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
 * - Lift / Knock Down: 120%
 * - Crush: 150% + 150% per Vulnerable stack
 * - Breach: 50% + 50% per Vulnerable stack
 */
export function getPhysicalStatusBaseMultiplier(
  statusType: StatusType.LIFT | StatusType.KNOCK_DOWN | StatusType.CRUSH | StatusType.BREACH,
  vulnerableStacks: number,
): number {
  switch (statusType) {
    case StatusType.LIFT:
    case StatusType.KNOCK_DOWN:
      return 1.2;
    case StatusType.CRUSH:
      return 1.5 + 1.5 * vulnerableStacks;
    case StatusType.BREACH:
      return 0.5 + 0.5 * vulnerableStacks;
  }
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
export function getArtsReactionBaseMultiplier(inflictionStacks: number): number {
  return 0.8 + 0.8 * inflictionStacks;
}

/**
 * Shatter base multiplier: 120% + 120% per status level.
 */
export function getShatterBaseMultiplier(statusLevel: StatusLevel): number {
  return 1.2 + 1.2 * statusLevel;
}

/**
 * Combustion DoT multiplier per tick: 12% + 12% per status level.
 */
export function getCombustionDotMultiplier(statusLevel: StatusLevel): number {
  return 0.12 + 0.12 * statusLevel;
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
 * Arts burst/reaction hidden multiplier = 1 + (operatorLevel − 119) / 6
 */
export function getArtsHiddenMultiplier(operatorLevel: number): number {
  return 1 + (operatorLevel - 119) / 6;
}

// ── Composite Damage Formula ────────────────────────────────────────────────

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
  /** 1 + ∑increasedDmgTaken. */
  increasedDmgTakenMultiplier: number;
  /** ∏(1 − dmgReduction). */
  dmgReductionMultiplier: number;
  /** 1 − max(protection). */
  protectionMultiplier: number;
  /** 100 / (DEF + 100) or 2 − 0.99^(−DEF). */
  defenseMultiplier: number;
  /** Enemy elemental resistance multiplier. */
  resistanceMultiplier: number;
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
  return (
    params.attack *
    params.baseMultiplier *
    params.attributeBonus *
    params.multiplierGroup *
    params.critMultiplier *
    params.ampMultiplier *
    params.staggerMultiplier *
    params.finisherMultiplier *
    params.linkMultiplier *
    params.weakenMultiplier *
    params.susceptibilityMultiplier *
    params.increasedDmgTakenMultiplier *
    params.dmgReductionMultiplier *
    params.protectionMultiplier *
    params.defenseMultiplier *
    params.resistanceMultiplier
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
  increasedDmgTakenMultiplier: number;
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
    params.increasedDmgTakenMultiplier *
    params.dmgReductionMultiplier
  );
}
