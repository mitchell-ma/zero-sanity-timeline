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

// ── Snowshine Basic Attack ────────────────────────────────────────────────────

const HYPOTHERMIC_ASSAULT_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24],
  [BasicAttackType.SEQUENCE_2]: [0.59, 0.64, 0.70, 0.76, 0.82, 0.88, 0.94, 0.99, 1.05, 1.13, 1.21, 1.32],
  [BasicAttackType.SEQUENCE_3]: [1.00, 1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.93, 2.08, 2.25],
  [BasicAttackType.SEQUENCE_4]: [],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [1.00, 1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.93, 2.08, 2.25],
};

export class HypothermicAssault extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.HYPOTHERMIC_ASSAULT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.SNOWSHINE,
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
    return HYPOTHERMIC_ASSAULT_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return HYPOTHERMIC_ASSAULT_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return HYPOTHERMIC_ASSAULT_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Snowshine Battle Skill ──────────────────────────────────────────────────

const SATURATED_DEFENSE_DMG = [2.00, 2.20, 2.40, 2.60, 2.80, 3.00, 3.20, 3.40, 3.60, 3.85, 4.15, 4.50] as const;

export class SaturatedDefense extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.SATURATED_DEFENSE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.SNOWSHINE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return SATURATED_DEFENSE_DMG[level - 1];
  }
}

// ── Snowshine Combo Skill ───────────────────────────────────────────────────

export class PolarRescue extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.POLAR_RESCUE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.SNOWSHINE,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Snowshine Ultimate ──────────────────────────────────────────────────────

const FRIGID_SNOWFIELD_DMG = [2.00, 2.20, 2.40, 2.60, 2.80, 3.00, 3.20, 3.40, 3.60, 3.85, 4.15, 4.50] as const;

export class FrigidSnowfield extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.FRIGID_SNOWFIELD;

  static readonly ULTIMATE_ENERGY_COST = 80;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.SNOWSHINE,
      elementType: ElementType.CRYO,
      ultimateEnergyCost: FrigidSnowfield.ULTIMATE_ENERGY_COST,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return FrigidSnowfield.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return FRIGID_SNOWFIELD_DMG[level - 1];
  }
}
