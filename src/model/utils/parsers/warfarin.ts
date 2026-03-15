import { StatType } from '../../enums/stats';

/**
 * Warfarin API attribute type IDs.
 * Source: https://api.warfarin.wiki/v1/en/operators/{slug}
 */
export enum WarfarinAttributeType {
  Level = 0,
  MaxHp = 1,
  Atk = 2,
  Def = 3,
  PhysicalDamageTakenScalar = 4,
  FireDamageTakenScalar = 5,
  PulseDamageTakenScalar = 6,
  CrystDamageTakenScalar = 7,
  Weight = 8,
  CriticalRate = 9,
  CriticalDamageIncrease = 10,
  Hatred = 11,
  NormalAttackRange = 12,
  MoveSpeedScalar = 13,
  TurnRateScalar = 14,
  AttackRate = 15,
  SkillCooldownScalar = 16,
  NormalAttackDamageIncrease = 17,
  HpRecoveryPerSec = 18,
  HpRecoveryPerSecByMaxHpRatio = 19,
  MaxPoise = 20,
  PoiseRecTime = 21,
  MaxUltimateSp = 22,
  DamageTakenScalarWithPoise = 23,
  PoiseDamageTakenScalar = 24,
  PoiseProtectTime = 25,
  PoiseDamageOutputScalar = 26,
  BreakingAttackDamageTakenScalar = 27,
  UltimateSkillDamageIncrease = 28,
  HealOutputIncrease = 29,
  HealTakenIncrease = 30,
  PoiseRecTimeScalar = 31,
  NormalSkillDamageIncrease = 32,
  ComboSkillDamageIncrease = 33,
  KnockDownTimeAddition = 34,
  FireBurstDamageIncrease = 35,
  PulseBurstDamageIncrease = 36,
  CrystBurstDamageIncrease = 37,
  NaturalBurstDamageIncrease = 38,
  Str = 39,
  Agi = 40,
  Wisd = 41,
  Will = 42,
  LifeSteal = 43,
  UltimateSpGainScalar = 44,
  AtbCostAddition = 45,
  SkillCooldownAddition = 46,
  ComboSkillCooldownScalar = 47,
  NaturalDamageTakenScalar = 48,
  IgniteDamageScalar = 49,
  PhysicalDamageIncrease = 50,
  FireDamageIncrease = 51,
  PulseDamageIncrease = 52,
  CrystDamageIncrease = 53,
  NaturalDamageIncrease = 54,
  EtherDamageIncrease = 55,
  FireAbnormalDamageIncrease = 56,
  PulseAbnormalDamageIncrease = 57,
  CrystAbnormalDamageIncrease = 58,
  NaturalAbnormalDamageIncrease = 59,
  EtherDamageTakenScalar = 60,
  DamageToBrokenUnitIncrease = 61,
  WeaknessDmgScalar = 62,
  ShelterDmgScalar = 63,
  PhysicalEnhancedDmgIncrease = 64,
  FireEnhancedDmgIncrease = 65,
  PulseEnhancedDmgIncrease = 66,
  CrystEnhancedDmgIncrease = 67,
  NaturalEnhancedDmgIncrease = 68,
  EtherEnhancedDmgIncrease = 69,
  PhysicalVulnerableDmgIncrease = 70,
  FireVulnerableDmgIncrease = 71,
  PulseVulnerableDmgIncrease = 72,
  CrystVulnerableDmgIncrease = 73,
  NaturalVulnerableDmgIncrease = 74,
  EtherVulnerableDmgIncrease = 75,
  AtkIncreaseFactorFromStr = 76,
  AtkIncreaseFactorFromAgi = 77,
  AtkIncreaseFactorFromWisd = 78,
  AtkIncreaseFactorFromWill = 79,
  PhysicalDmgResistScalar = 80,
  NaturalDmgResistScalar = 81,
  CrystDmgResistScalar = 82,
  PulseDmgResistScalar = 83,
  FireDmgResistScalar = 84,
  EtherDmgResistScalar = 85,
  SlowActionSpeedScalar = 86,
  PhysicalAndSpellInflictionEnhance = 87,
  ShieldOutputIncrease = 88,
  ShieldTakenIncrease = 89,
  Enum = 90,
}

/**
 * Maps Warfarin attributeType IDs → StatType.
 * `null` = no equivalent in our model (unmapped).
 */
export const WARFARIN_TO_STAT: Record<WarfarinAttributeType, StatType | null> = {
  // ── Meta (not stats) ────────────────────────────────────────────────────────
  [WarfarinAttributeType.Level]: null,
  [WarfarinAttributeType.Enum]: null,

  // ── Base attributes ─────────────────────────────────────────────────────────
  [WarfarinAttributeType.MaxHp]: StatType.BASE_HP,
  [WarfarinAttributeType.Atk]: StatType.BASE_ATTACK,
  [WarfarinAttributeType.Def]: StatType.BASE_DEFENSE,
  [WarfarinAttributeType.Str]: StatType.STRENGTH,
  [WarfarinAttributeType.Agi]: StatType.AGILITY,
  [WarfarinAttributeType.Wisd]: StatType.INTELLECT,
  [WarfarinAttributeType.Will]: StatType.WILL,
  [WarfarinAttributeType.Weight]: StatType.WEIGHT,
  [WarfarinAttributeType.NormalAttackRange]: StatType.ATTACK_RANGE,

  // ── Combat stats ────────────────────────────────────────────────────────────
  [WarfarinAttributeType.CriticalRate]: StatType.CRITICAL_RATE,
  [WarfarinAttributeType.CriticalDamageIncrease]: StatType.CRITICAL_DAMAGE,
  [WarfarinAttributeType.PhysicalAndSpellInflictionEnhance]: StatType.ARTS_INTENSITY, // TODO: verify — "infliction enhance" ≈ arts intensity?

  // ── Resistance (DamageTakenScalar) ──────────────────────────────────────────
  // These are incoming damage multipliers; we map them to resistance stats.
  // DmgResistScalar (80–85) may be a separate modifier layer — left unmapped.
  [WarfarinAttributeType.PhysicalDamageTakenScalar]: StatType.PHYSICAL_RESISTANCE,
  [WarfarinAttributeType.FireDamageTakenScalar]: StatType.HEAT_RESISTANCE,
  [WarfarinAttributeType.PulseDamageTakenScalar]: StatType.ELECTRIC_RESISTANCE,
  [WarfarinAttributeType.CrystDamageTakenScalar]: StatType.CRYO_RESISTANCE,
  [WarfarinAttributeType.NaturalDamageTakenScalar]: StatType.NATURE_RESISTANCE,
  [WarfarinAttributeType.EtherDamageTakenScalar]: StatType.AETHER_RESISTANCE,

  // ── Damage bonus ────────────────────────────────────────────────────────────
  [WarfarinAttributeType.PhysicalDamageIncrease]: StatType.PHYSICAL_DAMAGE_BONUS,
  [WarfarinAttributeType.FireDamageIncrease]: StatType.HEAT_DAMAGE_BONUS,
  [WarfarinAttributeType.PulseDamageIncrease]: StatType.ELECTRIC_DAMAGE_BONUS,
  [WarfarinAttributeType.CrystDamageIncrease]: StatType.CRYO_DAMAGE_BONUS,
  [WarfarinAttributeType.NaturalDamageIncrease]: StatType.NATURE_DAMAGE_BONUS,

  // ── Skill damage bonus ──────────────────────────────────────────────────────
  [WarfarinAttributeType.NormalAttackDamageIncrease]: StatType.BASIC_ATTACK_DAMAGE_BONUS,
  [WarfarinAttributeType.NormalSkillDamageIncrease]: StatType.BATTLE_SKILL_DAMAGE_BONUS,
  [WarfarinAttributeType.ComboSkillDamageIncrease]: StatType.COMBO_SKILL_DAMAGE_BONUS,
  [WarfarinAttributeType.UltimateSkillDamageIncrease]: StatType.ULTIMATE_DAMAGE_BONUS,

  // ── Stagger (poise) ────────────────────────────────────────────────────────
  [WarfarinAttributeType.MaxPoise]: StatType.STAGGER_HP,
  [WarfarinAttributeType.PoiseRecTime]: StatType.STAGGER_RECOVERY,
  [WarfarinAttributeType.PoiseDamageOutputScalar]: StatType.STAGGER_EFFICIENCY_BONUS,
  [WarfarinAttributeType.DamageToBrokenUnitIncrease]: StatType.STAGGER_DAMAGE_BONUS,

  // ── Healing / support ───────────────────────────────────────────────────────
  [WarfarinAttributeType.HealOutputIncrease]: StatType.TREATMENT_BONUS,
  [WarfarinAttributeType.HealTakenIncrease]: StatType.TREATMENT_RECEIVED_BONUS,

  // ── SP / cooldown ───────────────────────────────────────────────────────────
  [WarfarinAttributeType.UltimateSpGainScalar]: StatType.ULTIMATE_GAIN_EFFICIENCY,
  [WarfarinAttributeType.ComboSkillCooldownScalar]: StatType.COMBO_SKILL_COOLDOWN_REDUCTION,

  // ── Unmapped: movement / aggro / misc ───────────────────────────────────────
  [WarfarinAttributeType.Hatred]: null,
  [WarfarinAttributeType.MoveSpeedScalar]: null,
  [WarfarinAttributeType.TurnRateScalar]: null,
  [WarfarinAttributeType.AttackRate]: null,
  [WarfarinAttributeType.SkillCooldownScalar]: null, // general skill CD (we only have combo CD)
  [WarfarinAttributeType.SkillCooldownAddition]: null,
  [WarfarinAttributeType.AtbCostAddition]: null, // SP cost modifier
  [WarfarinAttributeType.SlowActionSpeedScalar]: null,

  // ── Unmapped: HP recovery ───────────────────────────────────────────────────
  [WarfarinAttributeType.HpRecoveryPerSec]: null,
  [WarfarinAttributeType.HpRecoveryPerSecByMaxHpRatio]: null,

  // ── Unmapped: SP / ultimate ─────────────────────────────────────────────────
  [WarfarinAttributeType.MaxUltimateSp]: null,

  // ── Unmapped: stagger (poise) extras ────────────────────────────────────────
  [WarfarinAttributeType.DamageTakenScalarWithPoise]: null,
  [WarfarinAttributeType.PoiseDamageTakenScalar]: null,
  [WarfarinAttributeType.PoiseProtectTime]: null,
  [WarfarinAttributeType.PoiseRecTimeScalar]: null,
  [WarfarinAttributeType.BreakingAttackDamageTakenScalar]: null,
  [WarfarinAttributeType.KnockDownTimeAddition]: null,

  // ── Unmapped: arts reaction (burst) damage ──────────────────────────────────
  [WarfarinAttributeType.FireBurstDamageIncrease]: null,
  [WarfarinAttributeType.PulseBurstDamageIncrease]: null,
  [WarfarinAttributeType.CrystBurstDamageIncrease]: null,
  [WarfarinAttributeType.NaturalBurstDamageIncrease]: null,

  // ── Unmapped: DoT / ignite ──────────────────────────────────────────────────
  [WarfarinAttributeType.IgniteDamageScalar]: null,

  // ── Unmapped: ether damage bonus (no AETHER_DAMAGE_BONUS in model) ──────────
  [WarfarinAttributeType.EtherDamageIncrease]: null,

  // ── Unmapped: abnormal (arts anomaly) damage ────────────────────────────────
  [WarfarinAttributeType.FireAbnormalDamageIncrease]: null,
  [WarfarinAttributeType.PulseAbnormalDamageIncrease]: null,
  [WarfarinAttributeType.CrystAbnormalDamageIncrease]: null,
  [WarfarinAttributeType.NaturalAbnormalDamageIncrease]: null,

  // ── Unmapped: weakness / shelter damage ─────────────────────────────────────
  [WarfarinAttributeType.WeaknessDmgScalar]: null,
  [WarfarinAttributeType.ShelterDmgScalar]: null,

  // ── Unmapped: enhanced (susceptibility) damage ──────────────────────────────
  [WarfarinAttributeType.PhysicalEnhancedDmgIncrease]: null,
  [WarfarinAttributeType.FireEnhancedDmgIncrease]: null,
  [WarfarinAttributeType.PulseEnhancedDmgIncrease]: null,
  [WarfarinAttributeType.CrystEnhancedDmgIncrease]: null,
  [WarfarinAttributeType.NaturalEnhancedDmgIncrease]: null,
  [WarfarinAttributeType.EtherEnhancedDmgIncrease]: null,

  // ── Unmapped: vulnerable damage ─────────────────────────────────────────────
  [WarfarinAttributeType.PhysicalVulnerableDmgIncrease]: null,
  [WarfarinAttributeType.FireVulnerableDmgIncrease]: null,
  [WarfarinAttributeType.PulseVulnerableDmgIncrease]: null,
  [WarfarinAttributeType.CrystVulnerableDmgIncrease]: null,
  [WarfarinAttributeType.NaturalVulnerableDmgIncrease]: null,
  [WarfarinAttributeType.EtherVulnerableDmgIncrease]: null,

  // ── Unmapped: atk scaling factors ───────────────────────────────────────────
  [WarfarinAttributeType.AtkIncreaseFactorFromStr]: null,
  [WarfarinAttributeType.AtkIncreaseFactorFromAgi]: null,
  [WarfarinAttributeType.AtkIncreaseFactorFromWisd]: null,
  [WarfarinAttributeType.AtkIncreaseFactorFromWill]: null,

  // ── Unmapped: DmgResistScalar (secondary resistance layer?) ─────────────────
  [WarfarinAttributeType.PhysicalDmgResistScalar]: null,
  [WarfarinAttributeType.NaturalDmgResistScalar]: null,
  [WarfarinAttributeType.CrystDmgResistScalar]: null,
  [WarfarinAttributeType.PulseDmgResistScalar]: null,
  [WarfarinAttributeType.FireDmgResistScalar]: null,
  [WarfarinAttributeType.EtherDmgResistScalar]: null,

  // ── Unmapped: lifesteal / shield ────────────────────────────────────────────
  [WarfarinAttributeType.LifeSteal]: null,
  [WarfarinAttributeType.ShieldOutputIncrease]: null,
  [WarfarinAttributeType.ShieldTakenIncrease]: null,
};

/** Convert a Warfarin attributeType ID to StatType, or null if unmapped. */
export function warfarinToStat(attributeType: number): StatType | null {
  return WARFARIN_TO_STAT[attributeType as WarfarinAttributeType] ?? null;
}
