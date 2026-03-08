import {
  BasicAttackType,
  CombatSkillsType,
  ElementType,
  OperatorType,
} from "../enums";
import { Potential, SkillLevel } from "../operators/baseOperator";
import { BasicAttack } from "./basicAttack";
import { BasicSkill } from "./basicSkill";
import { ComboSkill } from "./comboSkill";
import { Ultimate } from "./ultimate";

// ── Flaming Cinders (Basic Attack) ───────────────────────────────────────────

const TWILIGHT_ENHANCED_FLAMING_CINDERS_SEQ: Record<
  | BasicAttackType.SEQUENCE_1
  | BasicAttackType.SEQUENCE_2
  | BasicAttackType.SEQUENCE_3
  | BasicAttackType.SEQUENCE_4
  | BasicAttackType.SEQUENCE_5
  | BasicAttackType.FINAL_STRIKE,
  readonly number[]
> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.65, 0.71, 0.78, 0.84, 0.91, 0.97, 1.04, 1.1, 1.17, 1.25, 1.34, 1.46,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.81, 0.89, 0.97, 1.05, 1.13, 1.22, 1.3, 1.38, 1.46, 1.56, 1.68, 1.82,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.81, 0.89, 0.97, 1.05, 1.13, 1.22, 1.3, 1.38, 1.46, 1.56, 1.68, 1.82,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    1.15, 1.27, 1.39, 1.5, 1.62, 1.73, 1.85, 1.96, 2.08, 2.22, 2.4, 2.6,
  ],
  [BasicAttackType.SEQUENCE_5]: [
    2.03, 2.23, 2.43, 2.63, 2.84, 3.04, 3.24, 3.44, 3.65, 3.9, 4.2, 4.56,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    2.03, 2.23, 2.43, 2.63, 2.84, 3.04, 3.24, 3.44, 3.65, 3.9, 4.2, 4.56,
  ],
};

const FLAMING_CINDERS_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.16, 0.18, 0.19, 0.21, 0.22, 0.24, 0.26, 0.27, 0.29, 0.31, 0.33, 0.36,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.24, 0.26, 0.29, 0.31, 0.34, 0.36, 0.38, 0.41, 0.43, 0.46, 0.5, 0.54,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.25, 0.28, 0.3, 0.33, 0.35, 0.38, 0.4, 0.43, 0.45, 0.48, 0.52, 0.56,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.39, 0.43, 0.47, 0.51, 0.55, 0.59, 0.62, 0.66, 0.7, 0.75, 0.81, 0.88,
  ],
  [BasicAttackType.SEQUENCE_5]: [
    0.53, 0.58, 0.64, 0.69, 0.74, 0.8, 0.85, 0.9, 0.95, 1.02, 1.1, 1.19,
  ],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.28, 1.36, 1.44, 1.54, 1.66, 1.8,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.53, 0.58, 0.64, 0.69, 0.74, 0.8, 0.85, 0.9, 0.95, 1.02, 1.1, 1.19,
  ],
};

export class FlamingCinders extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.FLAMING_CINDERS;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAEVATAIN,
      elementType: ElementType.HEAT,
      basicAttackType: BasicAttackType.SEQUENCE_1,
      ...params,
    });
  }

  getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return FLAMING_CINDERS_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return FLAMING_CINDERS_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return FLAMING_CINDERS_SEQ[BasicAttackType.DIVE][level - 1];
  }

  /** P5: Enhanced BATK SEQ 1 multiplier during Twilight (×1.2 at P5). */
  getEnhancedSeq1Multiplier(level: SkillLevel, potential: Potential): number {
    const base =
      TWILIGHT_ENHANCED_FLAMING_CINDERS_SEQ[BasicAttackType.SEQUENCE_1][
        level - 1
      ];
    return potential >= 5 ? base * 1.2 : base;
  }

  /** P5: Enhanced BATK SEQ 2 multiplier during Twilight (×1.2 at P5). */
  getEnhancedSeq2Multiplier(level: SkillLevel, potential: Potential): number {
    const base =
      TWILIGHT_ENHANCED_FLAMING_CINDERS_SEQ[BasicAttackType.SEQUENCE_2][
        level - 1
      ];
    return potential >= 5 ? base * 1.2 : base;
  }

  /** P5: Enhanced BATK SEQ 3 multiplier during Twilight (×1.2 at P5). */
  getEnhancedSeq3Multiplier(level: SkillLevel, potential: Potential): number {
    const base =
      TWILIGHT_ENHANCED_FLAMING_CINDERS_SEQ[BasicAttackType.SEQUENCE_3][
        level - 1
      ];
    return potential >= 5 ? base * 1.2 : base;
  }

  /** P5: Enhanced BATK SEQ 4 multiplier during Twilight (×1.2 at P5). */
  getEnhancedSeq4Multiplier(level: SkillLevel, potential: Potential): number {
    const base =
      TWILIGHT_ENHANCED_FLAMING_CINDERS_SEQ[BasicAttackType.SEQUENCE_4][
        level - 1
      ];
    return potential >= 5 ? base * 1.2 : base;
  }

  /** P5: Enhanced BATK SEQ 5 / Final Strike multiplier during Twilight (×1.2 at P5). */
  getEnhancedSeq5Multiplier(level: SkillLevel, potential: Potential): number {
    const base =
      TWILIGHT_ENHANCED_FLAMING_CINDERS_SEQ[BasicAttackType.SEQUENCE_5][
        level - 1
      ];
    return potential >= 5 ? base * 1.2 : base;
  }
}

// ── Smouldering Fire (Battle Skill) ──────────────────────────────────────────

const SMOULDERING_FIRE_BASE_EXPLOSION_DMG = [
  0.62, 0.68, 0.75, 0.81, 0.87, 0.93, 0.99, 1.06, 1.12, 1.2, 1.29, 1.4,
] as const;
const SMOULDERING_FIRE_DMG_OVER_TIME_PER_SEQ = [
  0.06, 0.07, 0.08, 0.08, 0.09, 0.09, 0.1, 0.11, 0.11, 0.12, 0.13, 0.14,
] as const;
const SMOULDERING_FIRE_ADDITIONAL_ATK_DMG = [
  3.42, 3.76, 4.1, 4.45, 4.79, 5.13, 5.47, 5.81, 6.16, 6.58, 7.1, 7.7,
] as const;
const SMOULDERING_FIRE_ULT_BATK_SEQ1_DMG = [
  1.47, 1.61, 1.76, 1.91, 2.05, 2.2, 2.35, 2.49, 2.64, 2.82, 3.04, 3.3,
] as const;
const SMOULDERING_FIRE_ULT_BATK_SEQ2_DMG = [
  1.64, 1.81, 1.97, 2.14, 2.3, 2.47, 2.63, 2.79, 2.96, 3.16, 3.41, 3.7,
] as const;
const SMOULDERING_FIRE_ULT_ADDITIONAL_ATK_DMG = [
  4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
] as const;

export class SmoulderingFire extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.SMOULDERING_FIRE;
  static readonly SP_COST = 100;
  static readonly BASE_EXPLOSION_STAGGER = 10;
  static readonly ADDITIONAL_ATK_STAGGER = 10;
  static readonly BASE_COMBUSTION_DURATION_SECONDS = 5;
  static readonly ADDITIONAL_ATK_ULT_ENERGY_GAIN = 100;
  static readonly ULT_BATK_SEQ1_STAGGER = 10;
  static readonly ULT_BATK_SEQ2_STAGGER = 10;
  static readonly ULT_ADDITIONAL_ATK_STAGGER = 10;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAEVATAIN,
      elementType: ElementType.HEAT,
      ...params,
    });
  }

  getBaseExplosionDmgMultiplier(level: SkillLevel): number {
    return SMOULDERING_FIRE_BASE_EXPLOSION_DMG[level - 1];
  }

  getDmgOverTimeMultiplierPerSeq(level: SkillLevel): number {
    return SMOULDERING_FIRE_DMG_OVER_TIME_PER_SEQ[level - 1];
  }

  /** P1: Additional ATK multiplier ×1.2. */
  getAdditionalAtkDmgMultiplier(
    level: SkillLevel,
    potential: Potential,
  ): number {
    const base = SMOULDERING_FIRE_ADDITIONAL_ATK_DMG[level - 1];
    return potential >= 1 ? base * 1.2 : base;
  }

  /** P1: Returns 20 SP on hit; 0 without P1. */
  getAdditionalAtkSpReturnOnHit(potential: Potential): number {
    return potential >= 1 ? 20 : 0;
  }

  /** P3: Combustion duration ×1.5. */
  getCombustionDurationSeconds(potential: Potential): number {
    const base = SmoulderingFire.BASE_COMBUSTION_DURATION_SECONDS;
    return potential >= 3 ? base * 1.5 : base;
  }

  /** P3: Combustion DMG ×1.5. */
  getCombustionDmgMultiplier(potential: Potential): number {
    return potential >= 3 ? 1.5 : 1.0;
  }

  getUltBatkSeq1Multiplier(level: SkillLevel): number {
    return SMOULDERING_FIRE_ULT_BATK_SEQ1_DMG[level - 1];
  }

  getUltBatkSeq2Multiplier(level: SkillLevel): number {
    return SMOULDERING_FIRE_ULT_BATK_SEQ2_DMG[level - 1];
  }

  getUltAdditionalAtkMultiplier(level: SkillLevel): number {
    return SMOULDERING_FIRE_ULT_ADDITIONAL_ATK_DMG[level - 1];
  }
}

// ── Seethe (Combo Skill) ─────────────────────────────────────────────────────

const SEETHE_COOLDOWN = [
  10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9,
] as const;
const SEETHE_DMG = [
  2.4, 2.64, 2.88, 3.12, 3.36, 3.6, 3.84, 4.08, 4.32, 4.62, 4.98, 5.4,
] as const;

export class Seethe extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.SEETHE;
  static readonly STAGGER = 10;
  static readonly ULT_ENERGY_GAIN_1_ENEMY = 25;
  static readonly ULT_ENERGY_GAIN_2_ENEMIES = 30;
  static readonly ULT_ENERGY_GAIN_3_ENEMIES = 35;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAEVATAIN,
      elementType: ElementType.HEAT,
      ...params,
    });
  }

  getCooldownSeconds(level: SkillLevel): number {
    return SEETHE_COOLDOWN[level - 1];
  }

  getDmgMultiplier(level: SkillLevel): number {
    return SEETHE_DMG[level - 1];
  }

  getUltEnergyGain(enemiesHit: 1 | 2 | 3): number {
    if (enemiesHit === 1) return Seethe.ULT_ENERGY_GAIN_1_ENEMY;
    if (enemiesHit === 2) return Seethe.ULT_ENERGY_GAIN_2_ENEMIES;
    return Seethe.ULT_ENERGY_GAIN_3_ENEMIES;
  }
}

// ── Twilight (Ultimate) ───────────────────────────────────────────────────────

export class Twilight extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.TWILIGHT;
  static readonly ULTIMATE_ENERGY_COST = 300;
  static readonly DURATION_SECONDS = 15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAEVATAIN,
      elementType: ElementType.HEAT,
      ultimateEnergyCost: Twilight.ULTIMATE_ENERGY_COST,
      duration: Twilight.DURATION_SECONDS,
      ...params,
    });
  }

  /** P4: Energy cost reduced by 15%. */
  getUltimateEnergyCost(_level: SkillLevel, potential: Potential): number {
    return potential >= 4
      ? Math.floor(Twilight.ULTIMATE_ENERGY_COST * 0.85)
      : Twilight.ULTIMATE_ENERGY_COST;
  }

  /** P5: Each enemy killed extends duration by 1s, up to 7 kills. */
  getDuration(
    _level: SkillLevel,
    potential: Potential,
    enemiesKilled: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 = 0,
  ): number {
    return (
      Twilight.DURATION_SECONDS +
      this.getKillExtensionSeconds(potential) * enemiesKilled
    );
  }

  /** P5: Duration extension per enemy kill during ultimate. */
  getKillExtensionSeconds(_potential: Potential): number {
    return _potential >= 5 ? 1 : 0;
  }

  /** P5: Maximum total duration extension from kills. */
  getMaxKillExtensionSeconds(_potential: Potential): number {
    return _potential >= 5 ? 7 : 0;
  }
}
