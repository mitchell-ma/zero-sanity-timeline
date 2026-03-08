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

// ── Exchange Current (Basic Attack) ──────────────────────────────────────────

const EXCHANGE_CURRENT_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.23, 0.25, 0.28, 0.3, 0.32, 0.35, 0.37, 0.39, 0.41, 0.44, 0.48, 0.52,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.28, 0.31, 0.34, 0.36, 0.39, 0.42, 0.45, 0.48, 0.5, 0.54, 0.58, 0.63,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.34, 0.37, 0.41, 0.44, 0.48, 0.51, 0.54, 0.58, 0.61, 0.65, 0.71, 0.77,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.51, 0.56, 0.61, 0.66, 0.71, 0.77, 0.82, 0.87, 0.92, 0.98, 1.06, 1.15,
  ],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.28, 1.36, 1.44, 1.54, 1.66, 1.8,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.51, 0.56, 0.61, 0.66, 0.71, 0.77, 0.82, 0.87, 0.92, 0.98, 1.06, 1.15,
  ],
};

export class ExchangeCurrent extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.EXCHANGE_CURRENT;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ANTAL,
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
    return EXCHANGE_CURRENT_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return EXCHANGE_CURRENT_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return EXCHANGE_CURRENT_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Specified Research Subject (Battle Skill) ─────────────────────────────────

const SPECIFIED_RESEARCH_DMG = [
  0.89, 0.98, 1.07, 1.16, 1.24, 1.33, 1.42, 1.51, 1.6, 1.71, 1.85, 2.0,
] as const;
const SPECIFIED_RESEARCH_SUSCEPTIBILITY = [
  0.05, 0.05, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.08, 0.09, 0.09, 0.1,
] as const;

export class SpecifiedResearchSubject extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.SPECIFIED_RESEARCH_SUBJECT;
  static readonly SP_COST = 100;
  static readonly DURATION_SECONDS = 60;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ANTAL,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return SPECIFIED_RESEARCH_DMG[level - 1];
  }

  getElectricSusceptibility(level: SkillLevel): number {
    return SPECIFIED_RESEARCH_SUSCEPTIBILITY[level - 1];
  }

  getHeatSusceptibility(level: SkillLevel): number {
    return SPECIFIED_RESEARCH_SUSCEPTIBILITY[level - 1];
  }
}

// ── EMP Test Site (Combo Skill) ───────────────────────────────────────────────

const EMP_TEST_SITE_COOLDOWN = [
  25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 24,
] as const;
const EMP_TEST_SITE_DMG = [
  1.51, 1.66, 1.81, 1.96, 2.11, 2.27, 2.42, 2.57, 2.72, 2.91, 3.13, 3.4,
] as const;

export class EmpTestSite extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.EMP_TEST_SITE;
  static readonly STAGGER = 10;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ANTAL,
      elementType: ElementType.ELECTRIC,
      ...params,
    });
  }

  getCooldownSeconds(level: SkillLevel): number {
    return EMP_TEST_SITE_COOLDOWN[level - 1];
  }

  getDmgMultiplier(level: SkillLevel): number {
    return EMP_TEST_SITE_DMG[level - 1];
  }
}

// ── Overclocked Moment (Ultimate) ─────────────────────────────────────────────

const OVERCLOCKED_MOMENT_AMP = [
  0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.2,
] as const;

export class OverclockedMoment extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.OVERCLOCKED_MOMENT;
  static readonly ULTIMATE_ENERGY_COST = 100;
  static readonly DURATION_SECONDS = 12;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ANTAL,
      elementType: ElementType.ELECTRIC,
      ultimateEnergyCost: OverclockedMoment.ULTIMATE_ENERGY_COST,
      duration: OverclockedMoment.DURATION_SECONDS,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return OverclockedMoment.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return OverclockedMoment.DURATION_SECONDS;
  }

  getElectricAmp(level: SkillLevel): number {
    return OVERCLOCKED_MOMENT_AMP[level - 1];
  }

  getHeatAmp(level: SkillLevel): number {
    return OVERCLOCKED_MOMENT_AMP[level - 1];
  }
}
