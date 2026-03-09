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

// ── Estella Basic Attack ────────────────────────────────────────────────────

export class AudioNoise extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.AUDIO_NOISE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ESTELLA,
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

// ── Estella Battle Skill ──────────────────────────────────────────────────

export class Onomatopoeia extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.ONOMATOPOEIA;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ESTELLA,
      elementType: ElementType.CRYO,
      ...params,
    });
  }
}

// ── Estella Combo Skill ───────────────────────────────────────────────────

export class Distortion extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.DISTORTION;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ESTELLA,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Estella Ultimate ──────────────────────────────────────────────────────

export class Tremolo extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.TREMOLO;

  static readonly BASE_ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX
  static readonly POT2_COST_REDUCTION = 0.1;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = Tremolo.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 2
      ? baseCost * (1 - Tremolo.POT2_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.ESTELLA,
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
    const baseCost = Tremolo.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 2
      ? baseCost * (1 - Tremolo.POT2_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
