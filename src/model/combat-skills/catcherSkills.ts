import {
  BasicAttackType,
  CombatSkillsType,
  ElementType,
  OperatorType,
  TriggerConditionType,
} from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";
import { BasicAttack } from "./basicAttack";
import { BasicSkill } from "./basicSkill";
import { ComboSkill } from "./comboSkill";
import { Ultimate } from "./ultimate";

// ── Catcher Basic Attack ────────────────────────────────────────────────────

export class RigidInterdictionBasic extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.RIGID_INTERDICTION_BASIC;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CATCHER,
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

// ── Catcher Battle Skill ──────────────────────────────────────────────────

export class RigidInterdiction extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.RIGID_INTERDICTION;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CATCHER,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  get publishesTriggers(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_VULNERABILITY];
  }
}

// ── Catcher Combo Skill ───────────────────────────────────────────────────

export class TimelySuppression extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.TIMELY_SUPPRESSION;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CATCHER,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Catcher Ultimate ──────────────────────────────────────────────────────

export class TextbookAssault extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.TEXTBOOK_ASSAULT;

  static readonly BASE_ULTIMATE_ENERGY_COST = 72;
  static readonly POT4_COST_REDUCTION = 0.1;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = TextbookAssault.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - TextbookAssault.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.CATCHER,
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
    const baseCost = TextbookAssault.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - TextbookAssault.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
