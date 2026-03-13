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

// ── Catcher Basic Attack ────────────────────────────────────────────────────

const CATCHER_BASIC_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.35, 0.39, 0.42, 0.46, 0.49, 0.53, 0.56, 0.60, 0.63, 0.67, 0.73, 0.79],
  [BasicAttackType.SEQUENCE_2]: [0.39, 0.42, 0.46, 0.50, 0.54, 0.58, 0.62, 0.65, 0.69, 0.74, 0.80, 0.87],
  [BasicAttackType.SEQUENCE_3]: [0.54, 0.59, 0.65, 0.70, 0.76, 0.81, 0.86, 0.92, 0.97, 1.04, 1.12, 1.22],
  [BasicAttackType.SEQUENCE_4]: [0.71, 0.78, 0.85, 0.92, 0.99, 1.07, 1.14, 1.21, 1.28, 1.37, 1.47, 1.60],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.71, 0.78, 0.85, 0.92, 0.99, 1.07, 1.14, 1.21, 1.28, 1.37, 1.47, 1.60],
};

export class RigidInterdictionBasic extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.RIGID_INTERDICTION_BASIC;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CATCHER,
      elementType: ElementType.PHYSICAL,
      basicAttackType: BasicAttackType.SEQUENCE_1,
      ...params,
    });
  }

  getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return CATCHER_BASIC_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return CATCHER_BASIC_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return CATCHER_BASIC_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Catcher Battle Skill ──────────────────────────────────────────────────

const RIGID_INTERDICTION_DMG = [1.78, 1.96, 2.13, 2.31, 2.49, 2.67, 2.85, 3.02, 3.20, 3.42, 3.69, 4.00] as const;

export class RigidInterdiction extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.RIGID_INTERDICTION;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CATCHER,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  get publishesTriggers(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_VULNERABILITY];
  }

  getDmgMultiplier(level: SkillLevel): number {
    return RIGID_INTERDICTION_DMG[level - 1];
  }
}

// ── Catcher Combo Skill ───────────────────────────────────────────────────

const TIMELY_SUPPRESSION_DMG = [1.00, 1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.93, 2.08, 2.25] as const;

export class TimelySuppression extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.TIMELY_SUPPRESSION;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CATCHER,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return TIMELY_SUPPRESSION_DMG[level - 1];
  }
}

// ── Catcher Ultimate ──────────────────────────────────────────────────────

const TEXTBOOK_ASSAULT_DMG = [1.78, 1.96, 2.13, 2.31, 2.49, 2.67, 2.84, 3.02, 3.20, 3.42, 3.69, 4.00] as const;

export class TextbookAssault extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.TEXTBOOK_ASSAULT;

  static readonly BASE_ULTIMATE_ENERGY_COST = 72;
  static readonly POT4_COST_REDUCTION = 0.1;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = TextbookAssault.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - TextbookAssault.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.CATCHER,
      elementType: ElementType.PHYSICAL,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = TextbookAssault.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - TextbookAssault.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return TEXTBOOK_ASSAULT_DMG[level - 1];
  }
}
