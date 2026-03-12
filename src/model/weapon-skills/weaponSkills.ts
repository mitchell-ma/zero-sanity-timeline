import { WeaponSkillType } from "../../consts/enums";
import { WeaponSkill } from "./weaponSkill";

// ── Attack Boost ──────────────────────────────────────────────────────────────

const ATTACK_BOOST_S: readonly number[] = [];
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

const STRENGTH_BOOST_S: readonly number[] = [];
const STRENGTH_BOOST_M: readonly number[] = [];
const STRENGTH_BOOST_L: readonly number[] = [];

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

const AGILITY_BOOST_S: readonly number[] = [];
const AGILITY_BOOST_M: readonly number[] = [
  16, 28, 41, 54, 67, 80, 92, 105, 124,
];
const AGILITY_BOOST_L: readonly number[] = [];

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

const INTELLECT_BOOST_S: readonly number[] = [];
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

const WILL_BOOST_S: readonly number[] = [];
const WILL_BOOST_M: readonly number[] = [];
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
const MAIN_ATTRIBUTE_BOOST_M: readonly number[] = [];
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

const PHYSICAL_DAMAGE_BOOST_S: readonly number[] = [];
const PHYSICAL_DAMAGE_BOOST_M: readonly number[] = [];
const PHYSICAL_DAMAGE_BOOST_L: readonly number[] = [];

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

const HEAT_DAMAGE_BOOST_S: readonly number[] = [];
const HEAT_DAMAGE_BOOST_M: readonly number[] = [];
const HEAT_DAMAGE_BOOST_L: readonly number[] = [];

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

const CRYO_DAMAGE_BOOST_S: readonly number[] = [];
const CRYO_DAMAGE_BOOST_M: readonly number[] = [];
const CRYO_DAMAGE_BOOST_L: readonly number[] = [];

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

const NATURE_DAMAGE_BOOST_S: readonly number[] = [];
const NATURE_DAMAGE_BOOST_M: readonly number[] = [];
const NATURE_DAMAGE_BOOST_L: readonly number[] = [];

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

const ELECTRIC_DAMAGE_BOOST_S: readonly number[] = [];
const ELECTRIC_DAMAGE_BOOST_M: readonly number[] = [];
const ELECTRIC_DAMAGE_BOOST_L: readonly number[] = [];

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

const ULTIMATE_GAIN_EFFICIENCY_BOOST_S: readonly number[] = [];
const ULTIMATE_GAIN_EFFICIENCY_BOOST_M: readonly number[] = [];
const ULTIMATE_GAIN_EFFICIENCY_BOOST_L: readonly number[] = [];

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

const HP_BOOST_S: readonly number[] = [];
const HP_BOOST_M: readonly number[] = [];
const HP_BOOST_L: readonly number[] = [];

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

const ARTS_BOOST_S: readonly number[] = [];
const ARTS_BOOST_M: readonly number[] = [];
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

const ARTS_INTENSITY_BOOST_S: readonly number[] = [];
const ARTS_INTENSITY_BOOST_M: readonly number[] = [];
const ARTS_INTENSITY_BOOST_L: readonly number[] = [];

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

const CRITICAL_RATE_BOOST_S: readonly number[] = [];
const CRITICAL_RATE_BOOST_M: readonly number[] = [];
const CRITICAL_RATE_BOOST_L: readonly number[] = [];

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

const TREATMENT_EFFICIENCY_BOOST_S: readonly number[] = [];
const TREATMENT_EFFICIENCY_BOOST_M: readonly number[] = [];
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
