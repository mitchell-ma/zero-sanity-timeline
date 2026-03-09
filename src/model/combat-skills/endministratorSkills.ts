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

// ── Endministrator Basic Attack ────────────────────────────────────────────────────

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

// ── Endministrator Battle Skill ──────────────────────────────────────────────────

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
}

// ── Endministrator Combo Skill ───────────────────────────────────────────────────

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
}

// ── Endministrator Ultimate ──────────────────────────────────────────────────────

export class BombardmentSequence extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.BOMBARDMENT_SEQUENCE;

  static readonly ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX

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
}
