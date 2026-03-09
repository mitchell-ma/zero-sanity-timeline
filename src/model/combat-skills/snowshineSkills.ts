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
    _sequence: BasicAttackType,
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return 0; // Multiplier data not yet extracted
  }

  getFinisherAttackMultiplier(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return 0;
  }

  getDiveAttackMultiplier(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return 0;
  }
}

// ── Snowshine Battle Skill ──────────────────────────────────────────────────

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

export class FrigidSnowfield extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.FRIGID_SNOWFIELD;

  static readonly ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX

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
}
