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

// ── Seek and Hunt (Basic Attack) ─────────────────────────────────────────

const SEEK_AND_HUNT_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.21, 0.23,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.13, 0.14, 0.15, 0.16, 0.18, 0.19, 0.20, 0.21, 0.23, 0.24, 0.26, 0.28,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.26, 0.29, 0.31, 0.34, 0.36, 0.39, 0.42, 0.44, 0.47, 0.50, 0.54, 0.59,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.36, 0.40, 0.43, 0.47, 0.50, 0.54, 0.58, 0.61, 0.65, 0.69, 0.75, 0.81,
  ],
  [BasicAttackType.SEQUENCE_5]: [
    0.48, 0.52, 0.57, 0.62, 0.67, 0.71, 0.76, 0.81, 0.86, 0.91, 0.99, 1.07,
  ],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.48, 0.52, 0.57, 0.62, 0.67, 0.71, 0.76, 0.81, 0.86, 0.91, 0.99, 1.07,
  ],
};

export class SeekAndHunt extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SEEK_AND_HUNT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARCLIGHT,
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
    return SEEK_AND_HUNT_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SEEK_AND_HUNT_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SEEK_AND_HUNT_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Tempestuous Arc (Battle Skill) ───────────────────────────────────────

const TEMPESTUOUS_ARC_DMG = [
  0.90, 1.00, 1.08, 1.18, 1.26, 1.36, 1.44, 1.54, 1.62, 1.74, 1.86, 2.02,
] as const;

export class TempestuousArc extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.TEMPESTUOUS_ARC;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARCLIGHT,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return TEMPESTUOUS_ARC_DMG[level - 1];
  }
}

// ── Peal of Thunder (Combo Skill) ────────────────────────────────────────

const PEAL_OF_THUNDER_DMG = [
  1.55, 1.71, 1.86, 2.02, 2.18, 2.33, 2.49, 2.64, 2.80, 2.99, 3.22, 3.50,
] as const;

export class PealOfThunder extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.PEAL_OF_THUNDER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARCLIGHT,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return PEAL_OF_THUNDER_DMG[level - 1];
  }
}

// ── Exploding Blitz (Ultimate) ───────────────────────────────────────────

const EXPLODING_BLITZ_DMG = [
  4.00, 4.40, 4.80, 5.20, 5.60, 6.01, 6.40, 6.80, 7.20, 7.70, 8.30, 9.00,
] as const;

export class ExplodingBlitz extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.EXPLODING_BLITZ;

  static readonly BASE_ULTIMATE_ENERGY_COST = 76.5;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ExplodingBlitz.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ExplodingBlitz.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.ARCLIGHT,
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
    const baseCost = ExplodingBlitz.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ExplodingBlitz.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return EXPLODING_BLITZ_DMG[level - 1];
  }
}
