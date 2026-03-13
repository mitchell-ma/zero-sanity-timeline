import {
  BasicAttackType,
  CombatSkillsType,
  ElementType,
  OperatorType,
  TriggerConditionType,
} from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";
import { BasicAttack } from "./basicAttack";
import { BasicSkill } from "./basicSkill";
import { ComboSkill } from "./comboSkill";
import { Ultimate } from "./ultimate";

// ── Xaihi Basic Attack ────────────────────────────────────────────────────

const XAIHI_BASIC_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.15, 0.17, 0.18, 0.20, 0.21, 0.23, 0.24, 0.26, 0.27, 0.29, 0.31, 0.34],
  [BasicAttackType.SEQUENCE_2]: [0.16, 0.18, 0.19, 0.21, 0.22, 0.24, 0.26, 0.27, 0.29, 0.31, 0.33, 0.36],
  [BasicAttackType.SEQUENCE_3]: [0.21, 0.23, 0.25, 0.27, 0.29, 0.32, 0.34, 0.36, 0.38, 0.40, 0.44, 0.47],
  [BasicAttackType.SEQUENCE_4]: [0.33, 0.36, 0.40, 0.43, 0.46, 0.50, 0.53, 0.56, 0.59, 0.64, 0.68, 0.74],
  [BasicAttackType.SEQUENCE_5]: [0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24],
};

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
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return XAIHI_BASIC_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return XAIHI_BASIC_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return XAIHI_BASIC_SEQ[BasicAttackType.DIVE][level - 1];
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

  get publishesTriggers(): TriggerConditionType[] {
    return [TriggerConditionType.HP_TREATMENT];
  }
}

// ── Xaihi Combo Skill ───────────────────────────────────────────────────

const STRESS_TESTING_DMG = [2.00, 2.20, 2.40, 2.60, 2.80, 3.00, 3.20, 3.40, 3.60, 3.85, 4.15, 4.50] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return STRESS_TESTING_DMG[level - 1];
  }
}

// ── Xaihi Ultimate ──────────────────────────────────────────────────────

export class StackOverflow extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.STACK_OVERFLOW;

  static readonly BASE_ULTIMATE_ENERGY_COST = 72;
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
