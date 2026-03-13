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

// ── Avywenna Basic Attack ────────────────────────────────────────────────────

const THUNDERLANCE_BLITZ_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.17, 0.18, 0.20, 0.21, 0.23, 0.25, 0.26, 0.28, 0.30, 0.32, 0.34, 0.37,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.22, 0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.37, 0.39, 0.41, 0.45, 0.48,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.21, 0.23, 0.25, 0.27, 0.29, 0.31, 0.33, 0.35, 0.37, 0.39, 0.43, 0.46,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68,
  ],
  [BasicAttackType.SEQUENCE_5]: [
    0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.96, 1.04, 1.13,
  ],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.96, 1.04, 1.13,
  ],
};

export class ThunderlanceBlitz extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.THUNDERLANCE_BLITZ;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.AVYWENNA,
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
    return THUNDERLANCE_BLITZ_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return THUNDERLANCE_BLITZ_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return THUNDERLANCE_BLITZ_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Avywenna Battle Skill ──────────────────────────────────────────────────

const THUNDERLANCE_INTERDICTION_DMG = [
  0.67, 0.73, 0.80, 0.87, 0.93, 1.00, 1.07, 1.13, 1.20, 1.28, 1.38, 1.50,
] as const;

export class ThunderlanceInterdiction extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.THUNDERLANCE_INTERDICTION;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.AVYWENNA,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return THUNDERLANCE_INTERDICTION_DMG[level - 1];
  }
}

// ── Avywenna Combo Skill ───────────────────────────────────────────────────

const THUNDERLANCE_STRIKE_DMG = [
  1.69, 1.86, 2.03, 2.19, 2.36, 2.53, 2.70, 2.87, 3.04, 3.25, 3.50, 3.80,
] as const;

export class ThunderlanceStrike extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.THUNDERLANCE_STRIKE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.AVYWENNA,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return THUNDERLANCE_STRIKE_DMG[level - 1];
  }
}

// ── Avywenna Ultimate ──────────────────────────────────────────────────────

const THUNDERLANCE_FINAL_SHOCK_DMG = [
  4.22, 4.64, 5.07, 5.49, 5.91, 6.33, 6.75, 7.18, 7.60, 8.13, 8.76, 9.50,
] as const;

export class ThunderlanceFinalShock extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.THUNDERLANCE_FINAL_SHOCK;

  static readonly BASE_ULTIMATE_ENERGY_COST = 85;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ThunderlanceFinalShock.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ThunderlanceFinalShock.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.AVYWENNA,
      elementType: ElementType.ELECTRIC,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = ThunderlanceFinalShock.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ThunderlanceFinalShock.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return THUNDERLANCE_FINAL_SHOCK_DMG[level - 1];
  }
}
