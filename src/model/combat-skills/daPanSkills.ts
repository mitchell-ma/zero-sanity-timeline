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

// ── ROLLING CUT! (Basic Attack) ──────────────────────────────────────────

const ROLLING_CUT_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.28, 0.31, 0.34, 0.37, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.63,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.34, 0.37, 0.40, 0.44, 0.47, 0.50, 0.54, 0.57, 0.60, 0.64, 0.70, 0.75,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.97, 1.04, 1.13,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.96, 1.03, 1.09, 1.16, 1.25, 1.36,
  ],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.96, 1.03, 1.09, 1.16, 1.25, 1.36,
  ],
};

export class RollingCut extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.ROLLING_CUT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.DA_PAN,
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
    return ROLLING_CUT_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROLLING_CUT_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROLLING_CUT_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── FLIP DA WOK! (Battle Skill) ──────────────────────────────────────────

const FLIP_DA_WOK_DMG = [
  1.33, 1.47, 1.60, 1.73, 1.86, 2.00, 2.13, 2.26, 2.40, 2.56, 2.76, 3.00,
] as const;

export class FlipDaWok extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.FLIP_DA_WOK;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.DA_PAN,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return FLIP_DA_WOK_DMG[level - 1];
  }
}

// ── MORE SPICE! (Combo Skill) ────────────────────────────────────────────

const MORE_SPICE_DMG = [
  2.89, 3.18, 3.47, 3.75, 4.04, 4.33, 4.62, 4.91, 5.20, 5.56, 5.99, 6.50,
] as const;

export class MoreSpice extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.MORE_SPICE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.DA_PAN,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return MORE_SPICE_DMG[level - 1];
  }
}

// ── CHOP N DUNK! (Ultimate) ──────────────────────────────────────────────

const CHOP_N_DUNK_DMG = [
  1.78, 1.96, 2.13, 2.31, 2.49, 2.67, 2.84, 3.02, 3.20, 3.42, 3.69, 4.00,
] as const;

export class ChopNDunk extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.CHOP_N_DUNK;

  static readonly BASE_ULTIMATE_ENERGY_COST = 76.5;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ChopNDunk.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ChopNDunk.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.DA_PAN,
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
    const baseCost = ChopNDunk.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ChopNDunk.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return CHOP_N_DUNK_DMG[level - 1];
  }
}
