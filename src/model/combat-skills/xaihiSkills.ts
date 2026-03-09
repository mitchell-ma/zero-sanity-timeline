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

// ── Xaihi Basic Attack ────────────────────────────────────────────────────

export class XaihiBasicAttack extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.XAIHI_BASIC_ATTACK;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.XAIHI,
      elementType: ElementType.CRYO,
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

// ── Xaihi Battle Skill ──────────────────────────────────────────────────

export class DistributedDos extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.DISTRIBUTED_DOS;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.XAIHI,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Xaihi Combo Skill ───────────────────────────────────────────────────

export class StressTesting extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.STRESS_TESTING;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.XAIHI,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Xaihi Ultimate ──────────────────────────────────────────────────────

export class StackOverflow extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.STACK_OVERFLOW;

  static readonly BASE_ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX
  static readonly POT2_COST_REDUCTION = 0.1;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = StackOverflow.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 2
      ? baseCost * (1 - StackOverflow.POT2_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.XAIHI,
      elementType: ElementType.CRYO,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = StackOverflow.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 2
      ? baseCost * (1 - StackOverflow.POT2_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
