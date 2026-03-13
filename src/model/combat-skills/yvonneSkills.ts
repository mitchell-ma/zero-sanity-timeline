import {
  BasicAttackType,
  CombatSkillsType,
  ElementType,
  OperatorType,
} from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";
import { BasicAttack } from "./basicAttack";
import { BasicSkill } from "./basicSkill";
import { ComboSkill } from "./comboSkill";
import { Ultimate } from "./ultimate";

// ── Yvonne Basic Attack ────────────────────────────────────────────────────

const EXUBERANT_TRIGGER_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.24, 0.26, 0.28, 0.31, 0.33, 0.35, 0.38, 0.40, 0.42, 0.45, 0.49, 0.53],
  [BasicAttackType.SEQUENCE_2]: [0.25, 0.28, 0.30, 0.33, 0.35, 0.38, 0.40, 0.43, 0.45, 0.48, 0.52, 0.56],
  [BasicAttackType.SEQUENCE_3]: [0.32, 0.35, 0.38, 0.41, 0.44, 0.47, 0.50, 0.54, 0.57, 0.61, 0.65, 0.71],
  [BasicAttackType.SEQUENCE_4]: [0.41, 0.45, 0.49, 0.53, 0.58, 0.62, 0.66, 0.70, 0.74, 0.79, 0.85, 0.92],
  [BasicAttackType.SEQUENCE_5]: [0.56, 0.62, 0.67, 0.73, 0.79, 0.84, 0.90, 0.96, 1.01, 1.08, 1.17, 1.26],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.56, 0.62, 0.67, 0.73, 0.79, 0.84, 0.90, 0.96, 1.01, 1.08, 1.17, 1.26],
};

// Enhanced basic attack multipliers during Cryoblasting Pistolier (ultimate)
const ENHANCED_EXUBERANT_TRIGGER_SEQ: Record<
  | BasicAttackType.SEQUENCE_1
  | BasicAttackType.SEQUENCE_2
  | BasicAttackType.SEQUENCE_3
  | BasicAttackType.SEQUENCE_4
  | BasicAttackType.SEQUENCE_5
  | BasicAttackType.FINAL_STRIKE,
  readonly number[]
> = {
  [BasicAttackType.SEQUENCE_1]: [0.44, 0.49, 0.53, 0.57, 0.62, 0.66, 0.71, 0.75, 0.79, 0.85, 0.91, 0.99],
  [BasicAttackType.SEQUENCE_2]: [0.47, 0.52, 0.57, 0.61, 0.66, 0.71, 0.75, 0.80, 0.85, 0.91, 0.98, 1.06],
  [BasicAttackType.SEQUENCE_3]: [0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.96, 1.02, 1.08, 1.15, 1.24, 1.35],
  [BasicAttackType.SEQUENCE_4]: [0.77, 0.85, 0.93, 1.00, 1.08, 1.16, 1.24, 1.32, 1.40, 1.49, 1.61, 1.75],
  [BasicAttackType.SEQUENCE_5]: [1.06, 1.17, 1.27, 1.38, 1.49, 1.59, 1.70, 1.81, 1.91, 2.04, 2.21, 2.39],
  [BasicAttackType.FINAL_STRIKE]: [1.06, 1.17, 1.27, 1.38, 1.49, 1.59, 1.70, 1.81, 1.91, 2.04, 2.21, 2.39],
};

export class ExuberantTrigger extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.EXUBERANT_TRIGGER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      basicAttackType: BasicAttackType.SEQUENCE_1,
      ...params,
    });
  }

  getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return EXUBERANT_TRIGGER_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return EXUBERANT_TRIGGER_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return EXUBERANT_TRIGGER_SEQ[BasicAttackType.DIVE][level - 1];
  }

  getEnhancedSeq1Multiplier(level: SkillLevel, potential: Potential): number {
    const base = ENHANCED_EXUBERANT_TRIGGER_SEQ[BasicAttackType.SEQUENCE_1][level - 1];
    return potential >= 5 ? base * 1.1 : base;
  }

  getEnhancedSeq2Multiplier(level: SkillLevel, potential: Potential): number {
    const base = ENHANCED_EXUBERANT_TRIGGER_SEQ[BasicAttackType.SEQUENCE_2][level - 1];
    return potential >= 5 ? base * 1.1 : base;
  }

  getEnhancedSeq3Multiplier(level: SkillLevel, potential: Potential): number {
    const base = ENHANCED_EXUBERANT_TRIGGER_SEQ[BasicAttackType.SEQUENCE_3][level - 1];
    return potential >= 5 ? base * 1.1 : base;
  }

  getEnhancedSeq4Multiplier(level: SkillLevel, potential: Potential): number {
    const base = ENHANCED_EXUBERANT_TRIGGER_SEQ[BasicAttackType.SEQUENCE_4][level - 1];
    return potential >= 5 ? base * 1.1 : base;
  }

  getEnhancedSeq5Multiplier(level: SkillLevel, potential: Potential): number {
    const base = ENHANCED_EXUBERANT_TRIGGER_SEQ[BasicAttackType.SEQUENCE_5][level - 1];
    return potential >= 5 ? base * 1.1 : base;
  }
}

// ── Yvonne Battle Skill ──────────────────────────────────────────────────

const BRR_BRR_BOMB_DMG = [1.11, 1.22, 1.33, 1.44, 1.55, 1.67, 1.78, 1.89, 2.00, 2.14, 2.30, 2.50] as const;

export class BrrBrrBomb extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.BRR_BRR_BOMB;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return BRR_BRR_BOMB_DMG[level - 1];
  }
}

// ── Yvonne Combo Skill ───────────────────────────────────────────────────

const FLASHFREEZER_DMG = [0.89, 0.98, 1.07, 1.16, 1.25, 1.34, 1.42, 1.51, 1.60, 1.71, 1.85, 2.00] as const;

export class Flashfreezer extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FLASHFREEZER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return FLASHFREEZER_DMG[level - 1];
  }
}

// ── Yvonne Ultimate ──────────────────────────────────────────────────────

const CRYOBLASTING_PISTOLIER_DMG = [1.33, 1.47, 1.60, 1.73, 1.86, 2.00, 2.13, 2.26, 2.40, 2.56, 2.76, 3.00] as const;

export class CryoblastingPistolier extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.CRYOBLASTING_PISTOLIER;

  static readonly ULTIMATE_ENERGY_COST = 200;
  static readonly DURATION_SECONDS = 7;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      ultimateEnergyCost: CryoblastingPistolier.ULTIMATE_ENERGY_COST,
      duration: CryoblastingPistolier.DURATION_SECONDS,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return CryoblastingPistolier.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return CryoblastingPistolier.DURATION_SECONDS;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return CRYOBLASTING_PISTOLIER_DMG[level - 1];
  }
}
