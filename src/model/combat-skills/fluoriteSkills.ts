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

// ── Signature Gun Kata (Basic Attack) ────────────────────────────────────────

const SIGNATURE_GUN_KATA_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.25, 0.28, 0.30, 0.33, 0.35, 0.38, 0.40, 0.43, 0.45, 0.48, 0.52, 0.56],
  [BasicAttackType.SEQUENCE_2]: [0.33, 0.36, 0.39, 0.42, 0.46, 0.49, 0.52, 0.55, 0.59, 0.63, 0.67, 0.73],
  [BasicAttackType.SEQUENCE_3]: [0.26, 0.28, 0.31, 0.33, 0.36, 0.38, 0.41, 0.43, 0.46, 0.49, 0.53, 0.57],
  [BasicAttackType.SEQUENCE_4]: [0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.96, 1.02, 1.08, 1.16, 1.25, 1.35],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.96, 1.02, 1.08, 1.16, 1.25, 1.35],
};

export class SignatureGunKata extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SIGNATURE_GUN_KATA;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.FLUORITE,
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
    return SIGNATURE_GUN_KATA_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SIGNATURE_GUN_KATA_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SIGNATURE_GUN_KATA_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Tiny Surprise (Battle Skill) ─────────────────────────────────────────────

const TINY_SURPRISE_DMG = [
  1.87, 2.06, 2.24, 2.43, 2.62, 2.80, 2.99, 3.18, 3.36, 3.60, 3.88, 4.20,
] as const;

export class TinySurprise extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.TINY_SURPRISE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.FLUORITE,
      elementType: ElementType.NATURE,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return TINY_SURPRISE_DMG[level - 1];
  }
}

// ── Free Giveaway (Combo Skill) ──────────────────────────────────────────────

const FREE_GIVEAWAY_DMG = [
  1.69, 1.86, 2.03, 2.20, 2.37, 2.54, 2.70, 2.87, 3.04, 3.25, 3.51, 3.80,
] as const;

export class FreeGiveaway extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FREE_GIVEAWAY;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.FLUORITE,
      elementType: ElementType.NATURE,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return FREE_GIVEAWAY_DMG[level - 1];
  }
}

// ── Apex Prankster (Ultimate) ────────────────────────────────────────────────

const APEX_PRANKSTER_DMG = [
  1.11, 1.22, 1.33, 1.44, 1.56, 1.67, 1.78, 1.89, 2.00, 2.14, 2.31, 2.50,
] as const;

export class ApexPrankster extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.APEX_PRANKSTER;

  static readonly BASE_ULTIMATE_ENERGY_COST = 72;
  static readonly POT4_COST_REDUCTION = 0.1;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ApexPrankster.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ApexPrankster.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.FLUORITE,
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
    const baseCost = ApexPrankster.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ApexPrankster.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return APEX_PRANKSTER_DMG[level - 1];
  }
}
