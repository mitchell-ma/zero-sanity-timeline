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

// ── Soaring Break (Basic Attack) ─────────────────────────────────────────

const SOARING_BREAK_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36, 0.39, 0.42, 0.45,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.24, 0.26, 0.29, 0.31, 0.34, 0.36, 0.38, 0.41, 0.43, 0.46, 0.50, 0.54,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.27, 0.29, 0.32, 0.35, 0.38, 0.40, 0.43, 0.46, 0.48, 0.52, 0.56, 0.60,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68,
  ],
  [BasicAttackType.SEQUENCE_5]: [
    0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.77, 0.83, 0.90,
  ],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.77, 0.83, 0.90,
  ],
};

export class SoaringBreak extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SOARING_BREAK;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CHEN_QIANYU,
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
    return SOARING_BREAK_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SOARING_BREAK_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SOARING_BREAK_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Ascending Strike (Battle Skill) ──────────────────────────────────────

const ASCENDING_STRIKE_DMG = [
  1.69, 1.86, 2.03, 2.19, 2.36, 2.53, 2.70, 2.87, 3.04, 3.25, 3.50, 3.80,
] as const;

export class AscendingStrike extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.ASCENDING_STRIKE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CHEN_QIANYU,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return ASCENDING_STRIKE_DMG[level - 1];
  }
}

// ── Soar to the Stars (Combo Skill) ──────────────────────────────────────

const SOAR_TO_THE_STARS_DMG = [
  1.20, 1.32, 1.44, 1.56, 1.68, 1.80, 1.92, 2.04, 2.16, 2.31, 2.49, 2.70,
] as const;

export class SoarToTheStars extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.SOAR_TO_THE_STARS;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CHEN_QIANYU,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return SOAR_TO_THE_STARS_DMG[level - 1];
  }
}

// ── Blade Gale (Ultimate) ────────────────────────────────────────────────

const BLADE_GALE_DMG = [
  4.55, 5.00, 5.45, 5.91, 6.36, 6.82, 7.27, 7.73, 8.18, 8.75, 9.43, 10.23,
] as const;

export class BladeGale extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.BLADE_GALE;

  static readonly BASE_ULTIMATE_ENERGY_COST = 59.5;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = BladeGale.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - BladeGale.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.CHEN_QIANYU,
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
    const baseCost = BladeGale.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - BladeGale.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return BLADE_GALE_DMG[level - 1];
  }
}
