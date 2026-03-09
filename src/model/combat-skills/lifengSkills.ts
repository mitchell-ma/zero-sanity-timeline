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

// ── Lifeng Battle Skill ──────────────────────────────────────────────────

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
}

// ── Lifeng Combo Skill ───────────────────────────────────────────────────

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
}

// ── Lifeng Ultimate ──────────────────────────────────────────────────────

export class HeartOfTheUnmoving extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.HEART_OF_THE_UNMOVING;

  static readonly BASE_ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX
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
}
