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

// ── Rod Casting (Basic Attack) ────────────────────────────────────────────

const ROD_CASTING_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.18, 0.19, 0.21, 0.23, 0.25, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36, 0.39,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.21, 0.23,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.28, 0.30, 0.33, 0.36, 0.39, 0.41, 0.44, 0.47, 0.50, 0.53, 0.57, 0.62,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.28, 0.30, 0.33, 0.36, 0.39, 0.41, 0.44, 0.47, 0.50, 0.53, 0.57, 0.62,
  ],
  [BasicAttackType.SEQUENCE_5]: [
    0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24,
  ],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24,
  ],
};

export class RodCasting extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.ROD_CASTING;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ALESH,
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
    return ROD_CASTING_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROD_CASTING_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROD_CASTING_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Unconventional Lure (Battle Skill) ────────────────────────────────────

const UNCONVENTIONAL_LURE_DMG = [
  2.00, 2.20, 2.40, 2.60, 2.80, 3.00, 3.20, 3.40, 3.60, 3.85, 4.15, 4.50,
] as const;

export class UnconventionalLure extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.UNCONVENTIONAL_LURE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ALESH,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return UNCONVENTIONAL_LURE_DMG[level - 1];
  }
}

// ── Auger Angling (Combo Skill) ───────────────────────────────────────────

const AUGER_ANGLING_DMG = [
  1.33, 1.47, 1.60, 1.73, 1.87, 2.00, 2.13, 2.27, 2.40, 2.57, 2.77, 3.00,
] as const;

export class AugerAngling extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.AUGER_ANGLING;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ALESH,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return AUGER_ANGLING_DMG[level - 1];
  }
}

// ── One Monster Catch (Ultimate) ──────────────────────────────────────────

const ONE_MONSTER_CATCH_DMG = [
  4.36, 4.79, 5.23, 5.66, 6.10, 6.53, 6.97, 7.41, 7.84, 8.39, 9.04, 9.80,
] as const;

export class OneMonsterCatch extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.ONE_MONSTER_CATCH;

  static readonly BASE_ULTIMATE_ENERGY_COST = 85;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = OneMonsterCatch.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - OneMonsterCatch.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.ALESH,
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
    const baseCost = OneMonsterCatch.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - OneMonsterCatch.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return ONE_MONSTER_CATCH_DMG[level - 1];
  }
}
