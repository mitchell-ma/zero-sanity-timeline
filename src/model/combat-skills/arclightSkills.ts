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

// ── Arclight Basic Attack ────────────────────────────────────────────────────

export class SeekAndHunt extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SEEK_AND_HUNT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARCLIGHT,
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

// ── Arclight Battle Skill ──────────────────────────────────────────────────

export class TempestuousArc extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.TEMPESTUOUS_ARC;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARCLIGHT,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }
}

// ── Arclight Combo Skill ───────────────────────────────────────────────────

export class PealOfThunder extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.PEAL_OF_THUNDER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARCLIGHT,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Arclight Ultimate ──────────────────────────────────────────────────────

export class ExplodingBlitz extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.EXPLODING_BLITZ;

  static readonly BASE_ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ExplodingBlitz.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ExplodingBlitz.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.ARCLIGHT,
      elementType: ElementType.ELECTRIC,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = ExplodingBlitz.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ExplodingBlitz.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
