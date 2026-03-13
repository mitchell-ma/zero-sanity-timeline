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

// ── Lifeng Basic Attack ────────────────────────────────────────────────────

const RUINATION_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.24, 0.27, 0.29, 0.32, 0.34, 0.36, 0.39, 0.41, 0.44, 0.47, 0.50, 0.55],
  [BasicAttackType.SEQUENCE_2]: [0.29, 0.32, 0.35, 0.38, 0.41, 0.44, 0.47, 0.49, 0.52, 0.56, 0.60, 0.65],
  [BasicAttackType.SEQUENCE_3]: [0.35, 0.39, 0.42, 0.46, 0.49, 0.53, 0.56, 0.60, 0.63, 0.67, 0.73, 0.79],
  [BasicAttackType.SEQUENCE_4]: [0.68, 0.74, 0.81, 0.88, 0.95, 1.01, 1.08, 1.15, 1.22, 1.30, 1.40, 1.52],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.68, 0.74, 0.81, 0.88, 0.95, 1.01, 1.08, 1.15, 1.22, 1.30, 1.40, 1.52],
};

export class Ruination extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.RUINATION;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LIFENG,
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
    return RUINATION_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return RUINATION_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return RUINATION_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Lifeng Battle Skill ──────────────────────────────────────────────────

const TURBID_AVATAR_DMG = [1.19, 1.31, 1.43, 1.55, 1.67, 1.78, 1.90, 2.02, 2.14, 2.29, 2.47, 2.68] as const;

export class TurbidAvatar extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.TURBID_AVATAR;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LIFENG,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return TURBID_AVATAR_DMG[level - 1];
  }
}

// ── Lifeng Combo Skill ───────────────────────────────────────────────────

const ASPECT_OF_WRATH_DMG = [1.67, 1.83, 2.00, 2.17, 2.33, 2.50, 2.67, 2.83, 3.00, 3.21, 3.46, 3.75] as const;

export class AspectOfWrath extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.ASPECT_OF_WRATH;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LIFENG,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return ASPECT_OF_WRATH_DMG[level - 1];
  }
}

// ── Lifeng Ultimate ──────────────────────────────────────────────────────

const HEART_OF_THE_UNMOVING_DMG = [2.67, 2.94, 3.20, 3.47, 3.74, 4.00, 4.27, 4.54, 4.80, 5.14, 5.54, 6.00] as const;

export class HeartOfTheUnmoving extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.HEART_OF_THE_UNMOVING;

  static readonly BASE_ULTIMATE_ENERGY_COST = 90;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = HeartOfTheUnmoving.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - HeartOfTheUnmoving.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.LIFENG,
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
    const baseCost = HeartOfTheUnmoving.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - HeartOfTheUnmoving.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return HEART_OF_THE_UNMOVING_DMG[level - 1];
  }
}
