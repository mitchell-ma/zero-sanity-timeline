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

// ── Destructive Sequence (Basic Attack) ──────────────────────────────────────

const DESTRUCTIVE_SEQUENCE_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.23, 0.25, 0.27, 0.29, 0.32, 0.34, 0.36, 0.39, 0.41, 0.44, 0.47, 0.51],
  [BasicAttackType.SEQUENCE_2]: [0.27, 0.30, 0.32, 0.35, 0.38, 0.41, 0.43, 0.46, 0.49, 0.52, 0.56, 0.61],
  [BasicAttackType.SEQUENCE_3]: [0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.63, 0.68],
  [BasicAttackType.SEQUENCE_4]: [0.35, 0.38, 0.41, 0.45, 0.48, 0.52, 0.55, 0.59, 0.62, 0.67, 0.72, 0.78],
  [BasicAttackType.SEQUENCE_5]: [0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.77, 0.83, 0.90],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.77, 0.83, 0.90],
};

export class DestructiveSequence extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.DESTRUCTIVE_SEQUENCE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ENDMINISTRATOR,
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
    return DESTRUCTIVE_SEQUENCE_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return DESTRUCTIVE_SEQUENCE_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return DESTRUCTIVE_SEQUENCE_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Constructive Sequence (Battle Skill) ─────────────────────────────────────

const CONSTRUCTIVE_SEQUENCE_DMG = [
  1.56, 1.71, 1.87, 2.02, 2.18, 2.34, 2.49, 2.65, 2.80, 3.00, 3.23, 3.50,
] as const;

export class ConstructiveSequence extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.CONSTRUCTIVE_SEQUENCE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ENDMINISTRATOR,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return CONSTRUCTIVE_SEQUENCE_DMG[level - 1];
  }
}

// ── Sealing Sequence (Combo Skill) ───────────────────────────────────────────

const SEALING_SEQUENCE_DMG = [
  1.78, 1.96, 2.13, 2.31, 2.49, 2.67, 2.84, 3.02, 3.20, 3.42, 3.69, 4.00,
] as const;

export class SealingSequence extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.SEALING_SEQUENCE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ENDMINISTRATOR,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return SEALING_SEQUENCE_DMG[level - 1];
  }
}

// ── Bombardment Sequence (Ultimate) ──────────────────────────────────────────

const BOMBARDMENT_SEQUENCE_DMG = [
  3.56, 3.91, 4.27, 4.62, 4.98, 5.33, 5.69, 6.04, 6.40, 6.84, 7.38, 8.00,
] as const;

export class BombardmentSequence extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.BOMBARDMENT_SEQUENCE;

  static readonly ULTIMATE_ENERGY_COST = 80;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ENDMINISTRATOR,
      elementType: ElementType.PHYSICAL,
      ultimateEnergyCost: BombardmentSequence.ULTIMATE_ENERGY_COST,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return BombardmentSequence.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return BOMBARDMENT_SEQUENCE_DMG[level - 1];
  }
}
