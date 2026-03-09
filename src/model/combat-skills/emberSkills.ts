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

// ── Ember Basic Attack ────────────────────────────────────────────────────

export class SwordArtOfAssault extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SWORD_ART_OF_ASSAULT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.EMBER,
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

// ── Ember Battle Skill ──────────────────────────────────────────────────

export class ForwardMarch extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.FORWARD_MARCH;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.EMBER,
      elementType: ElementType.HEAT,
      ...params,
    });
  }
}

// ── Ember Combo Skill ───────────────────────────────────────────────────

export class FrontlineSupport extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FRONTLINE_SUPPORT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.EMBER,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Ember Ultimate ──────────────────────────────────────────────────────

export class ReIgnitedOath extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.RE_IGNITED_OATH;

  static readonly BASE_ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ReIgnitedOath.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ReIgnitedOath.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.EMBER,
      elementType: ElementType.HEAT,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = ReIgnitedOath.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ReIgnitedOath.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
