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

const PROTOCOL_ALPHA_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.25, 0.28, 0.31, 0.33, 0.36, 0.38, 0.41, 0.43, 0.46, 0.49, 0.53, 0.57],
  [BasicAttackType.SEQUENCE_2]: [0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68],
  [BasicAttackType.SEQUENCE_3]: [0.37, 0.41, 0.45, 0.48, 0.52, 0.56, 0.59, 0.63, 0.67, 0.71, 0.77, 0.84],
  [BasicAttackType.SEQUENCE_4]: [0.57, 0.62, 0.68, 0.73, 0.79, 0.85, 0.90, 0.96, 1.02, 1.09, 1.17, 1.27],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.57, 0.62, 0.68, 0.73, 0.79, 0.85, 0.90, 0.96, 1.02, 1.09, 1.17, 1.27],
};

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
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return PROTOCOL_ALPHA_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return PROTOCOL_ALPHA_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return PROTOCOL_ALPHA_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Perlica Battle Skill ──────────────────────────────────────────────────

const PROTOCOL_OMEGA_DMG = [1.78, 1.96, 2.13, 2.31, 2.49, 2.67, 2.85, 3.02, 3.20, 3.42, 3.69, 4.00] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return PROTOCOL_OMEGA_DMG[level - 1];
  }
}

// ── Perlica Combo Skill ───────────────────────────────────────────────────

const INSTANT_PROTOCOL_DMG = [0.80, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return INSTANT_PROTOCOL_DMG[level - 1];
  }
}

// ── Perlica Ultimate ──────────────────────────────────────────────────────

const PROTOCOL_EPSILON_DMG = [4.45, 4.89, 5.34, 5.78, 6.22, 6.67, 7.11, 7.56, 8.00, 8.56, 9.23, 10.00] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return PROTOCOL_EPSILON_DMG[level - 1];
  }
}
