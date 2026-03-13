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

// ── Beam Cohesion Arts (Basic Attack) ────────────────────────────────────────

const BEAM_COHESION_ARTS_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68],
  [BasicAttackType.SEQUENCE_2]: [0.36, 0.40, 0.43, 0.47, 0.50, 0.54, 0.58, 0.61, 0.65, 0.69, 0.75, 0.81],
  [BasicAttackType.SEQUENCE_3]: [0.41, 0.45, 0.49, 0.53, 0.57, 0.61, 0.65, 0.69, 0.73, 0.78, 0.84, 0.91],
  [BasicAttackType.SEQUENCE_4]: [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.96, 1.04, 1.12],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.96, 1.04, 1.12],
};

export class BeamCohesionArts extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.BEAM_COHESION_ARTS;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.GILBERTA,
      elementType: ElementType.NATURE,
      basicAttackType: BasicAttackType.SEQUENCE_1,
      ...params,
    });
  }

  getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return BEAM_COHESION_ARTS_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return BEAM_COHESION_ARTS_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return BEAM_COHESION_ARTS_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Gravity Mode (Battle Skill) ──────────────────────────────────────────────

const GRAVITY_MODE_DMG = [
  0.97, 1.07, 1.17, 1.26, 1.36, 1.46, 1.56, 1.65, 1.75, 1.87, 2.02, 2.19,
] as const;

export class GravityMode extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.GRAVITY_MODE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.GILBERTA,
      elementType: ElementType.NATURE,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return GRAVITY_MODE_DMG[level - 1];
  }
}

// ── Matrix Displacement (Combo Skill) ────────────────────────────────────────

const MATRIX_DISPLACEMENT_DMG = [
  1.40, 1.54, 1.68, 1.82, 1.96, 2.10, 2.24, 2.38, 2.52, 2.70, 2.91, 3.15,
] as const;

export class MatrixDisplacement extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.MATRIX_DISPLACEMENT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.GILBERTA,
      elementType: ElementType.NATURE,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return MATRIX_DISPLACEMENT_DMG[level - 1];
  }
}

// ── Gravity Field (Ultimate) ─────────────────────────────────────────────────

const GRAVITY_FIELD_DMG = [
  3.33, 3.67, 4.00, 4.33, 4.67, 5.00, 5.34, 5.67, 6.00, 6.42, 6.92, 7.50,
] as const;

export class GravityField extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.GRAVITY_FIELD;

  static readonly BASE_ULTIMATE_ENERGY_COST = 90;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = GravityField.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - GravityField.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.GILBERTA,
      elementType: ElementType.NATURE,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = GravityField.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - GravityField.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return GRAVITY_FIELD_DMG[level - 1];
  }
}
