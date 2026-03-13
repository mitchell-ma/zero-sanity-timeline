import { WeaponSkillType } from "../../consts/enums";
import { WeaponSkill } from "./weaponSkill";

// ── Attack Boost ──────────────────────────────────────────────────────────────

const ATTACK_BOOST_S: readonly number[] = [
  0.03, 0.054, 0.078, 0.102, 0.126, 0.15, 0.174, 0.198, 0.234,
];
const ATTACK_BOOST_M: readonly number[] = [
  0.04, 0.072, 0.104, 0.136, 0.168, 0.2, 0.232, 0.264, 0.312,
];
const ATTACK_BOOST_L: readonly number[] = [
  0.05, 0.09, 0.13, 0.17, 0.21, 0.25, 0.29, 0.33, 0.39,
];

export class AttackBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ATTACK_BOOST_S, level });
  }
  getValue(): number {
    return ATTACK_BOOST_S[this.level - 1] ?? 0;
  }
}
export class AttackBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ATTACK_BOOST_M, level });
  }
  getValue(): number {
    return ATTACK_BOOST_M[this.level - 1] ?? 0;
  }
}
export class AttackBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ATTACK_BOOST_L, level });
  }
  getValue(): number {
    return ATTACK_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Strength Boost ────────────────────────────────────────────────────────────

const STRENGTH_BOOST_S: readonly number[] = [
  12, 21, 31, 40, 50, 60, 69, 79, 93,
];
const STRENGTH_BOOST_M: readonly number[] = [
  16, 28, 41, 54, 67, 80, 92, 105, 124,
];
const STRENGTH_BOOST_L: readonly number[] = [
  20, 36, 52, 68, 84, 100, 116, 132, 156,
];

export class StrengthBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.STRENGTH_BOOST_S, level });
  }
  getValue(): number {
    return STRENGTH_BOOST_S[this.level - 1] ?? 0;
  }
}
export class StrengthBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.STRENGTH_BOOST_M, level });
  }
  getValue(): number {
    return STRENGTH_BOOST_M[this.level - 1] ?? 0;
  }
}
export class StrengthBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.STRENGTH_BOOST_L, level });
  }
  getValue(): number {
    return STRENGTH_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Agility Boost ─────────────────────────────────────────────────────────────

const AGILITY_BOOST_S: readonly number[] = [
  12, 21, 31, 40, 50, 60, 69, 79, 93,
];
const AGILITY_BOOST_M: readonly number[] = [
  16, 28, 41, 54, 67, 80, 92, 105, 124,
];
const AGILITY_BOOST_L: readonly number[] = [
  20, 36, 52, 68, 84, 100, 116, 132, 156,
];

export class AgilityBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.AGILITY_BOOST_S, level });
  }
  getValue(): number {
    return AGILITY_BOOST_S[this.level - 1] ?? 0;
  }
}
export class AgilityBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.AGILITY_BOOST_M, level });
  }
  getValue(): number {
    return AGILITY_BOOST_M[this.level - 1] ?? 0;
  }
}
export class AgilityBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.AGILITY_BOOST_L, level });
  }
  getValue(): number {
    return AGILITY_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Intellect Boost ───────────────────────────────────────────────────────────

const INTELLECT_BOOST_S: readonly number[] = [
  12, 21, 31, 40, 50, 60, 69, 79, 93,
];
const INTELLECT_BOOST_M: readonly number[] = [
  16, 28, 41, 54, 67, 80, 92, 105, 124,
];
const INTELLECT_BOOST_L: readonly number[] = [
  20, 36, 52, 68, 84, 100, 116, 132, 156,
];

export class IntellectBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.INTELLECT_BOOST_S, level });
  }
  getValue(): number {
    return INTELLECT_BOOST_S[this.level - 1] ?? 0;
  }
}
export class IntellectBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.INTELLECT_BOOST_M, level });
  }
  getValue(): number {
    return INTELLECT_BOOST_M[this.level - 1] ?? 0;
  }
}
export class IntellectBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.INTELLECT_BOOST_L, level });
  }
  getValue(): number {
    return INTELLECT_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Will Boost ────────────────────────────────────────────────────────────────

const WILL_BOOST_S: readonly number[] = [
  12, 21, 31, 40, 50, 60, 69, 79, 93,
];
const WILL_BOOST_M: readonly number[] = [
  16, 28, 41, 54, 67, 80, 92, 105, 124,
];
const WILL_BOOST_L: readonly number[] = [
  20, 36, 52, 68, 84, 100, 116, 132, 156,
];

export class WillBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.WILL_BOOST_S, level });
  }
  getValue(): number {
    return WILL_BOOST_S[this.level - 1] ?? 0;
  }
}
export class WillBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.WILL_BOOST_M, level });
  }
  getValue(): number {
    return WILL_BOOST_M[this.level - 1] ?? 0;
  }
}
export class WillBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.WILL_BOOST_L, level });
  }
  getValue(): number {
    return WILL_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Main Attribute Boost ──────────────────────────────────────────────────────

const MAIN_ATTRIBUTE_BOOST_S: readonly number[] = [
  10, 18, 26, 34, 42, 51, 59, 67, 79,
];
const MAIN_ATTRIBUTE_BOOST_M: readonly number[] = [
  16, 28, 41, 54, 67, 80, 92, 105, 124,
];
const MAIN_ATTRIBUTE_BOOST_L: readonly number[] = [
  17, 30, 44, 57, 71, 85, 98, 112, 132,
];

export class MainAttributeBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.MAIN_ATTRIBUTE_BOOST_S, level });
  }
  getValue(): number {
    return MAIN_ATTRIBUTE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class MainAttributeBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.MAIN_ATTRIBUTE_BOOST_M, level });
  }
  getValue(): number {
    return MAIN_ATTRIBUTE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class MainAttributeBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.MAIN_ATTRIBUTE_BOOST_L, level });
  }
  getValue(): number {
    return MAIN_ATTRIBUTE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Physical Damage Boost ─────────────────────────────────────────────────────

const PHYSICAL_DAMAGE_BOOST_S: readonly number[] = [
  0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26,
];
const PHYSICAL_DAMAGE_BOOST_M: readonly number[] = [
  0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467,
];
const PHYSICAL_DAMAGE_BOOST_L: readonly number[] = [
  0.0556, 0.10, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333,
];

export class PhysicalDamageBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.PHYSICAL_DAMAGE_BOOST_S, level });
  }
  getValue(): number {
    return PHYSICAL_DAMAGE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class PhysicalDamageBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.PHYSICAL_DAMAGE_BOOST_M, level });
  }
  getValue(): number {
    return PHYSICAL_DAMAGE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class PhysicalDamageBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.PHYSICAL_DAMAGE_BOOST_L, level });
  }
  getValue(): number {
    return PHYSICAL_DAMAGE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Heat Damage Boost ─────────────────────────────────────────────────────────

const HEAT_DAMAGE_BOOST_S: readonly number[] = [
  0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26,
];
const HEAT_DAMAGE_BOOST_M: readonly number[] = [
  0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467,
];
const HEAT_DAMAGE_BOOST_L: readonly number[] = [
  0.0556, 0.10, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333,
];

export class HeatDamageBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.HEAT_DAMAGE_BOOST_S, level });
  }
  getValue(): number {
    return HEAT_DAMAGE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class HeatDamageBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.HEAT_DAMAGE_BOOST_M, level });
  }
  getValue(): number {
    return HEAT_DAMAGE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class HeatDamageBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.HEAT_DAMAGE_BOOST_L, level });
  }
  getValue(): number {
    return HEAT_DAMAGE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Cryo Damage Boost ─────────────────────────────────────────────────────────

const CRYO_DAMAGE_BOOST_S: readonly number[] = [
  0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26,
];
const CRYO_DAMAGE_BOOST_M: readonly number[] = [
  0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467,
];
const CRYO_DAMAGE_BOOST_L: readonly number[] = [
  0.0556, 0.10, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333,
];

export class CryoDamageBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.CRYO_DAMAGE_BOOST_S, level });
  }
  getValue(): number {
    return CRYO_DAMAGE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class CryoDamageBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.CRYO_DAMAGE_BOOST_M, level });
  }
  getValue(): number {
    return CRYO_DAMAGE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class CryoDamageBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.CRYO_DAMAGE_BOOST_L, level });
  }
  getValue(): number {
    return CRYO_DAMAGE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Nature Damage Boost ───────────────────────────────────────────────────────

const NATURE_DAMAGE_BOOST_S: readonly number[] = [
  0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26,
];
const NATURE_DAMAGE_BOOST_M: readonly number[] = [
  0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467,
];
const NATURE_DAMAGE_BOOST_L: readonly number[] = [
  0.0556, 0.10, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333,
];

export class NatureDamageBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.NATURE_DAMAGE_BOOST_S, level });
  }
  getValue(): number {
    return NATURE_DAMAGE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class NatureDamageBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.NATURE_DAMAGE_BOOST_M, level });
  }
  getValue(): number {
    return NATURE_DAMAGE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class NatureDamageBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.NATURE_DAMAGE_BOOST_L, level });
  }
  getValue(): number {
    return NATURE_DAMAGE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Electric Damage Boost ─────────────────────────────────────────────────────

const ELECTRIC_DAMAGE_BOOST_S: readonly number[] = [
  0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26,
];
const ELECTRIC_DAMAGE_BOOST_M: readonly number[] = [
  0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467,
];
const ELECTRIC_DAMAGE_BOOST_L: readonly number[] = [
  0.0556, 0.10, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333,
];

export class ElectricDamageBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ELECTRIC_DAMAGE_BOOST_S, level });
  }
  getValue(): number {
    return ELECTRIC_DAMAGE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class ElectricDamageBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ELECTRIC_DAMAGE_BOOST_M, level });
  }
  getValue(): number {
    return ELECTRIC_DAMAGE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class ElectricDamageBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ELECTRIC_DAMAGE_BOOST_L, level });
  }
  getValue(): number {
    return ELECTRIC_DAMAGE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Ultimate Gain Efficiency Boost ────────────────────────────────────────────

const ULTIMATE_GAIN_EFFICIENCY_BOOST_S: readonly number[] = []; // No weapon uses this tier
const ULTIMATE_GAIN_EFFICIENCY_BOOST_M: readonly number[] = [
  0.0476, 0.0857, 0.1238, 0.1619, 0.20, 0.2381, 0.2762, 0.3143, 0.3714,
];
const ULTIMATE_GAIN_EFFICIENCY_BOOST_L: readonly number[] = [
  0.0595, 0.1071, 0.1548, 0.2024, 0.25, 0.2976, 0.3452, 0.3929, 0.4643,
];

export class UltimateGainEfficiencyBoostS extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.ULTIMATE_GAIN_EFFICIENCY_BOOST_S,
      level,
    });
  }
  getValue(): number {
    return ULTIMATE_GAIN_EFFICIENCY_BOOST_S[this.level - 1] ?? 0;
  }
}
export class UltimateGainEfficiencyBoostM extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.ULTIMATE_GAIN_EFFICIENCY_BOOST_M,
      level,
    });
  }
  getValue(): number {
    return ULTIMATE_GAIN_EFFICIENCY_BOOST_M[this.level - 1] ?? 0;
  }
}
export class UltimateGainEfficiencyBoostL extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.ULTIMATE_GAIN_EFFICIENCY_BOOST_L,
      level,
    });
  }
  getValue(): number {
    return ULTIMATE_GAIN_EFFICIENCY_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── HP Boost ──────────────────────────────────────────────────────────────────

const HP_BOOST_S: readonly number[] = []; // No weapon uses this tier
const HP_BOOST_M: readonly number[] = [
  0.08, 0.144, 0.208, 0.272, 0.336, 0.40, 0.464, 0.528, 0.624,
];
const HP_BOOST_L: readonly number[] = [
  0.10, 0.18, 0.26, 0.34, 0.42, 0.50, 0.58, 0.66, 0.78,
];

export class HpBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.HP_BOOST_S, level });
  }
  getValue(): number {
    return HP_BOOST_S[this.level - 1] ?? 0;
  }
}
export class HpBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.HP_BOOST_M, level });
  }
  getValue(): number {
    return HP_BOOST_M[this.level - 1] ?? 0;
  }
}
export class HpBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.HP_BOOST_L, level });
  }
  getValue(): number {
    return HP_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Arts Boost ────────────────────────────────────────────────────────────────

const ARTS_BOOST_S: readonly number[] = [
  0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26,
];
const ARTS_BOOST_M: readonly number[] = [
  0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467,
];
const ARTS_BOOST_L: readonly number[] = [
  0.0556, 0.1, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333,
];

export class ArtsBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ARTS_BOOST_S, level });
  }
  getValue(): number {
    return ARTS_BOOST_S[this.level - 1] ?? 0;
  }
}
export class ArtsBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ARTS_BOOST_M, level });
  }
  getValue(): number {
    return ARTS_BOOST_M[this.level - 1] ?? 0;
  }
}
export class ArtsBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ARTS_BOOST_L, level });
  }
  getValue(): number {
    return ARTS_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Arts Intensity Boost ──────────────────────────────────────────────────────

const ARTS_INTENSITY_BOOST_S: readonly number[] = []; // No weapon uses this tier
const ARTS_INTENSITY_BOOST_M: readonly number[] = [
  8, 14, 20, 27, 33, 40, 46, 52, 62,
];
const ARTS_INTENSITY_BOOST_L: readonly number[] = [
  10, 18, 26, 34, 42, 50, 58, 66, 78,
];

export class ArtsIntensityBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ARTS_INTENSITY_BOOST_S, level });
  }
  getValue(): number {
    return ARTS_INTENSITY_BOOST_S[this.level - 1] ?? 0;
  }
}
export class ArtsIntensityBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ARTS_INTENSITY_BOOST_M, level });
  }
  getValue(): number {
    return ARTS_INTENSITY_BOOST_M[this.level - 1] ?? 0;
  }
}
export class ArtsIntensityBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ARTS_INTENSITY_BOOST_L, level });
  }
  getValue(): number {
    return ARTS_INTENSITY_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Critical Rate Boost ───────────────────────────────────────────────────────

const CRITICAL_RATE_BOOST_S: readonly number[] = []; // No weapon uses this tier
const CRITICAL_RATE_BOOST_M: readonly number[] = []; // No weapon uses this tier
const CRITICAL_RATE_BOOST_L: readonly number[] = [
  0.025, 0.045, 0.065, 0.085, 0.105, 0.125, 0.145, 0.165, 0.195,
];

export class CriticalRateBoostS extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.CRITICAL_RATE_BOOST_S, level });
  }
  getValue(): number {
    return CRITICAL_RATE_BOOST_S[this.level - 1] ?? 0;
  }
}
export class CriticalRateBoostM extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.CRITICAL_RATE_BOOST_M, level });
  }
  getValue(): number {
    return CRITICAL_RATE_BOOST_M[this.level - 1] ?? 0;
  }
}
export class CriticalRateBoostL extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.CRITICAL_RATE_BOOST_L, level });
  }
  getValue(): number {
    return CRITICAL_RATE_BOOST_L[this.level - 1] ?? 0;
  }
}

// ── Treatment Efficiency Boost ────────────────────────────────────────────────

const TREATMENT_EFFICIENCY_BOOST_S: readonly number[] = []; // No weapon uses this tier
const TREATMENT_EFFICIENCY_BOOST_M: readonly number[] = [
  0.0476, 0.0857, 0.1238, 0.1619, 0.20, 0.2381, 0.2762, 0.3143, 0.3714,
];
const TREATMENT_EFFICIENCY_BOOST_L: readonly number[] = [
  0.0595, 0.1071, 0.1548, 0.2024, 0.25, 0.2976, 0.3452, 0.3929, 0.4643,
];

export class TreatmentEfficiencyBoostS extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.TREATMENT_EFFICIENCY_BOOST_S,
      level,
    });
  }
  getValue(): number {
    return TREATMENT_EFFICIENCY_BOOST_S[this.level - 1] ?? 0;
  }
}
export class TreatmentEfficiencyBoostM extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.TREATMENT_EFFICIENCY_BOOST_M,
      level,
    });
  }
  getValue(): number {
    return TREATMENT_EFFICIENCY_BOOST_M[this.level - 1] ?? 0;
  }
}
export class TreatmentEfficiencyBoostL extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.TREATMENT_EFFICIENCY_BOOST_L,
      level,
    });
  }
  getValue(): number {
    return TREATMENT_EFFICIENCY_BOOST_L[this.level - 1] ?? 0;
  }
}
