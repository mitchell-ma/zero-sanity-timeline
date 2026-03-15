import { WeaponSkillType } from "../../consts/enums";
import { WeaponSkill } from "./weaponSkill";
import { getSkillValues } from "../game-data/weaponGameData";

// ── Helper ───────────────────────────────────────────────────────────────────

/** Get skill values from game data, with hardcoded fallback for tiers with no weapon source. */
function sv(skillType: string, statKey: string, fallback: readonly number[] = []): readonly number[] {
  const values = getSkillValues(skillType, statKey);
  return values.length > 0 ? values : fallback;
}

// ── Attack Boost ──────────────────────────────────────────────────────────────

const ATTACK_BOOST_S = sv("ATTACK_BOOST_S", "ATTACK_BONUS");
const ATTACK_BOOST_M = sv("ATTACK_BOOST_M", "ATTACK_BONUS");
const ATTACK_BOOST_L = sv("ATTACK_BOOST_L", "ATTACK_BONUS");

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

const STRENGTH_BOOST_S = sv("STRENGTH_BOOST_S", "STRENGTH");
const STRENGTH_BOOST_M = sv("STRENGTH_BOOST_M", "STRENGTH");
const STRENGTH_BOOST_L = sv("STRENGTH_BOOST_L", "STRENGTH");

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

const AGILITY_BOOST_S = sv("AGILITY_BOOST_S", "AGILITY");
const AGILITY_BOOST_M = sv("AGILITY_BOOST_M", "AGILITY");
const AGILITY_BOOST_L = sv("AGILITY_BOOST_L", "AGILITY");

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

const INTELLECT_BOOST_S = sv("INTELLECT_BOOST_S", "INTELLECT");
const INTELLECT_BOOST_M = sv("INTELLECT_BOOST_M", "INTELLECT");
const INTELLECT_BOOST_L = sv("INTELLECT_BOOST_L", "INTELLECT");

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

const WILL_BOOST_S = sv("WILL_BOOST_S", "WILL");
const WILL_BOOST_M = sv("WILL_BOOST_M", "WILL");
const WILL_BOOST_L = sv("WILL_BOOST_L", "WILL");

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

const MAIN_ATTRIBUTE_BOOST_S = sv("MAIN_ATTRIBUTE_BOOST_S", "MAIN_ATTRIBUTE");
const MAIN_ATTRIBUTE_BOOST_M = sv("MAIN_ATTRIBUTE_BOOST_M", "MAIN_ATTRIBUTE",
  [16, 28, 41, 54, 67, 80, 92, 105, 124]);
const MAIN_ATTRIBUTE_BOOST_L = sv("MAIN_ATTRIBUTE_BOOST_L", "MAIN_ATTRIBUTE");

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

const PHYSICAL_DAMAGE_BOOST_S = sv("PHYSICAL_DAMAGE_BOOST_S", "PHYSICAL_DAMAGE_BONUS");
const PHYSICAL_DAMAGE_BOOST_M = sv("PHYSICAL_DAMAGE_BOOST_M", "PHYSICAL_DAMAGE_BONUS");
const PHYSICAL_DAMAGE_BOOST_L = sv("PHYSICAL_DAMAGE_BOOST_L", "PHYSICAL_DAMAGE_BONUS");

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

const HEAT_DAMAGE_BOOST_S = sv("HEAT_DAMAGE_BOOST_S", "HEAT_DAMAGE_BONUS",
  [0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26]);
const HEAT_DAMAGE_BOOST_M = sv("HEAT_DAMAGE_BOOST_M", "HEAT_DAMAGE_BONUS");
const HEAT_DAMAGE_BOOST_L = sv("HEAT_DAMAGE_BOOST_L", "HEAT_DAMAGE_BONUS");

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

const CRYO_DAMAGE_BOOST_S = sv("CRYO_DAMAGE_BOOST_S", "CRYO_DAMAGE_BONUS",
  [0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26]);
const CRYO_DAMAGE_BOOST_M = sv("CRYO_DAMAGE_BOOST_M", "CRYO_DAMAGE_BONUS");
const CRYO_DAMAGE_BOOST_L = sv("CRYO_DAMAGE_BOOST_L", "CRYO_DAMAGE_BONUS");

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

const NATURE_DAMAGE_BOOST_S = sv("NATURE_DAMAGE_BOOST_S", "NATURE_DAMAGE_BONUS",
  [0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26]);
const NATURE_DAMAGE_BOOST_M = sv("NATURE_DAMAGE_BOOST_M", "NATURE_DAMAGE_BONUS",
  [0.0444, 0.08, 0.1156, 0.1511, 0.1867, 0.2222, 0.2578, 0.2933, 0.3467]);
const NATURE_DAMAGE_BOOST_L = sv("NATURE_DAMAGE_BOOST_L", "NATURE_DAMAGE_BONUS");

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

const ELECTRIC_DAMAGE_BOOST_S = sv("ELECTRIC_DAMAGE_BOOST_S", "ELECTRIC_DAMAGE_BONUS",
  [0.0333, 0.06, 0.0867, 0.1133, 0.14, 0.1667, 0.1933, 0.22, 0.26]);
const ELECTRIC_DAMAGE_BOOST_M = sv("ELECTRIC_DAMAGE_BOOST_M", "ELECTRIC_DAMAGE_BONUS");
const ELECTRIC_DAMAGE_BOOST_L = sv("ELECTRIC_DAMAGE_BOOST_L", "ELECTRIC_DAMAGE_BONUS",
  [0.0556, 0.10, 0.1444, 0.1889, 0.2333, 0.2778, 0.3222, 0.3667, 0.4333]);

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
const ULTIMATE_GAIN_EFFICIENCY_BOOST_M = sv("ULTIMATE_GAIN_EFFICIENCY_BOOST_M", "ULTIMATE_GAIN_EFFICIENCY");
const ULTIMATE_GAIN_EFFICIENCY_BOOST_L = sv("ULTIMATE_GAIN_EFFICIENCY_BOOST_L", "ULTIMATE_GAIN_EFFICIENCY");

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

const HP_BOOST_S = sv("HP_BOOST_S", "HP_BONUS");
const HP_BOOST_M = sv("HP_BOOST_M", "HP_BONUS");
const HP_BOOST_L = sv("HP_BOOST_L", "HP_BONUS");

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

const ARTS_BOOST_S = sv("ARTS_BOOST_S", "ARTS_DAMAGE_BONUS");
const ARTS_BOOST_M = sv("ARTS_BOOST_M", "ARTS_DAMAGE_BONUS");
const ARTS_BOOST_L = sv("ARTS_BOOST_L", "ARTS_DAMAGE_BONUS");

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
const ARTS_INTENSITY_BOOST_M = sv("ARTS_INTENSITY_BOOST_M", "ARTS_INTENSITY");
const ARTS_INTENSITY_BOOST_L = sv("ARTS_INTENSITY_BOOST_L", "ARTS_INTENSITY");

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
const CRITICAL_RATE_BOOST_L = sv("CRITICAL_RATE_BOOST_L", "CRITICAL_RATE");

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
const TREATMENT_EFFICIENCY_BOOST_M = sv("TREATMENT_EFFICIENCY_BOOST_M", "heal");
const TREATMENT_EFFICIENCY_BOOST_L = sv("TREATMENT_EFFICIENCY_BOOST_L", "heal",
  [0.0595, 0.1071, 0.1548, 0.2024, 0.25, 0.2976, 0.3452, 0.3929, 0.4643]);

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
