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

// ── Fluorite Basic Attack ────────────────────────────────────────────────────

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

// ── Fluorite Battle Skill ──────────────────────────────────────────────────

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
}

// ── Fluorite Combo Skill ───────────────────────────────────────────────────

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
}

// ── Fluorite Ultimate ──────────────────────────────────────────────────────

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
}
