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

// ── Gilberta Basic Attack ────────────────────────────────────────────────────

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
    _sequence: BasicAttackType,
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return 0; // Multiplier data not yet extracted
  }

  getFinisherAttackMultiplier(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return 0;
  }

  getDiveAttackMultiplier(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return 0;
  }
}

// ── Gilberta Battle Skill ──────────────────────────────────────────────────

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
}

// ── Gilberta Combo Skill ───────────────────────────────────────────────────

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
}

// ── Gilberta Ultimate ──────────────────────────────────────────────────────

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
}
