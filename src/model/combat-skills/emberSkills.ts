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

// ── Sword Art of Assault (Basic Attack) ──────────────────────────────────

const SWORD_ART_OF_ASSAULT_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.38, 0.42, 0.46, 0.50, 0.54, 0.57, 0.61, 0.65, 0.69, 0.74, 0.79, 0.86,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.54, 0.59, 0.64, 0.70, 0.75, 0.80, 0.86, 0.91, 0.96, 1.03, 1.11, 1.20,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.66, 0.73, 0.80, 0.86, 0.93, 0.99, 1.06, 1.13, 1.19, 1.28, 1.38, 1.49,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.82, 0.90, 0.98, 1.06, 1.14, 1.22, 1.31, 1.39, 1.47, 1.57, 1.69, 1.84,
  ],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.82, 0.90, 0.98, 1.06, 1.14, 1.22, 1.31, 1.39, 1.47, 1.57, 1.69, 1.84,
  ],
};

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
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SWORD_ART_OF_ASSAULT_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SWORD_ART_OF_ASSAULT_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SWORD_ART_OF_ASSAULT_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Forward March (Battle Skill) ─────────────────────────────────────────

const FORWARD_MARCH_DMG = [
  1.73, 1.91, 2.08, 2.25, 2.43, 2.60, 2.77, 2.95, 3.12, 3.34, 3.60, 3.90,
] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return FORWARD_MARCH_DMG[level - 1];
  }
}

// ── Frontline Support (Combo Skill) ──────────────────────────────────────

const FRONTLINE_SUPPORT_DMG = [
  1.02, 1.12, 1.22, 1.33, 1.43, 1.53, 1.63, 1.73, 1.84, 1.96, 2.12, 2.30,
] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return FRONTLINE_SUPPORT_DMG[level - 1];
  }
}

// ── Re-Ignited Oath (Ultimate) ───────────────────────────────────────────

const RE_IGNITED_OATH_DMG = [
  2.89, 3.18, 3.47, 3.76, 4.04, 4.33, 4.62, 4.91, 5.20, 5.56, 5.99, 6.50,
] as const;

export class ReIgnitedOath extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.RE_IGNITED_OATH;

  static readonly BASE_ULTIMATE_ENERGY_COST = 100;
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

  getDmgMultiplier(level: SkillLevel): number {
    return RE_IGNITED_OATH_DMG[level - 1];
  }
}
