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

// ── Yvonne Basic Attack ────────────────────────────────────────────────────

export class ExuberantTrigger extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.EXUBERANT_TRIGGER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
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

// ── Yvonne Battle Skill ──────────────────────────────────────────────────

export class BrrBrrBomb extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.BRR_BRR_BOMB;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Yvonne Combo Skill ───────────────────────────────────────────────────

export class Flashfreezer extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FLASHFREEZER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Yvonne Ultimate ──────────────────────────────────────────────────────

export class CryoblastingPistolier extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.CRYOBLASTING_PISTOLIER;

  static readonly ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.YVONNE,
      elementType: ElementType.CRYO,
      ultimateEnergyCost: CryoblastingPistolier.ULTIMATE_ENERGY_COST,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return CryoblastingPistolier.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
