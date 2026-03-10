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

// ── Perlica Basic Attack ────────────────────────────────────────────────────

export class ProtocolAlphaBreach extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.PROTOCOL_ALPHA_BREACH;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.PERLICA,
      elementType: ElementType.ELECTRIC,
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

// ── Perlica Battle Skill ──────────────────────────────────────────────────

export class ProtocolOmegaStrike extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.PROTOCOL_OMEGA_STRIKE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.PERLICA,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }
}

// ── Perlica Combo Skill ───────────────────────────────────────────────────

export class InstantProtocolChain extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.INSTANT_PROTOCOL_CHAIN;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.PERLICA,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }
}

// ── Perlica Ultimate ──────────────────────────────────────────────────────

export class ProtocolEpsilon extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.PROTOCOL_EPSILON;

  static readonly BASE_ULTIMATE_ENERGY_COST = 68;
  static readonly POT2_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ProtocolEpsilon.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 2
      ? baseCost * (1 - ProtocolEpsilon.POT2_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.PERLICA,
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
    const baseCost = ProtocolEpsilon.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 2
      ? baseCost * (1 - ProtocolEpsilon.POT2_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
