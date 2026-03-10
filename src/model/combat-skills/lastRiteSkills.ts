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

// ── Last Rite Basic Attack ────────────────────────────────────────────────────

export class DanceOfRime extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.DANCE_OF_RIME;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAST_RITE,
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

// ── Last Rite Battle Skill ──────────────────────────────────────────────────

export class EsotericLegacy extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.ESOTERIC_LEGACY;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAST_RITE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Last Rite Combo Skill ───────────────────────────────────────────────────

export class WintersDevourer extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.WINTERS_DEVOURER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAST_RITE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Last Rite Ultimate ──────────────────────────────────────────────────────

export class VigilServices extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.VIGIL_SERVICES;

  static readonly BASE_ULTIMATE_ENERGY_COST = 240;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = VigilServices.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - VigilServices.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.LAST_RITE,
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
    const baseCost = VigilServices.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - VigilServices.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
