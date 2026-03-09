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

// ── Sword of Aspiration (Basic Attack) ───────────────────────────────────────

const SWORD_OF_ASPIRATION_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.32, 0.34, 0.36, 0.39, 0.42, 0.45,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.28, 0.3, 0.33, 0.36, 0.39, 0.41, 0.44, 0.47, 0.5, 0.53, 0.57, 0.62,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.33, 0.36, 0.39, 0.42, 0.46, 0.49, 0.52, 0.55, 0.59, 0.63, 0.67, 0.73,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.5, 0.54, 0.59, 0.64, 0.69, 0.74, 0.79, 0.84, 0.89, 0.95, 1.03, 1.11,
  ],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.28, 1.36, 1.44, 1.54, 1.66, 1.8,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.5, 0.54, 0.59, 0.64, 0.69, 0.74, 0.79, 0.84, 0.89, 0.95, 1.03, 1.11,
  ],
};

export class SwordOfAspiration extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SWORD_OF_ASPIRATION;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.AKEKURI,
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
    return SWORD_OF_ASPIRATION_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SWORD_OF_ASPIRATION_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return SWORD_OF_ASPIRATION_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Burst of Passion (Battle Skill) ──────────────────────────────────────────

const BURST_OF_PASSION_DMG = [
  1.42, 1.56, 1.71, 1.85, 1.99, 2.13, 2.28, 2.42, 2.56, 2.74, 2.95, 3.2,
] as const;

export class BurstOfPassion extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.BURST_OF_PASSION;
  static readonly SP_COST = 100;
  static readonly STAGGER = 10;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.AKEKURI,
      elementType: ElementType.HEAT,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return BURST_OF_PASSION_DMG[level - 1];
  }
}

// ── Flash and Dash (Combo Skill) ──────────────────────────────────────────────

const FLASH_AND_DASH_COOLDOWN = [
  10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9,
] as const;
const FLASH_AND_DASH_DMG = [
  0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.28, 1.36, 1.44, 1.54, 1.66, 1.8,
] as const;

export class FlashAndDash extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FLASH_AND_DASH;
  static readonly STAGGER_PER_SEQ = 5;
  static readonly BASE_SP_RECOVERY_PER_SEQ = 7.5;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.AKEKURI,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getCooldownSeconds(level: SkillLevel): number {
    return FLASH_AND_DASH_COOLDOWN[level - 1];
  }

  getDmgMultiplierPerSeq(level: SkillLevel): number {
    return FLASH_AND_DASH_DMG[level - 1];
  }

  /**
   * Cheer of Victory (Talent 2) — SP Recovery per sequence, scaled by Intellect.
   * E1 (talentLevel 1): +1% per 10 INT, max +50%
   * E2+ (talentLevel 2–3): +1.5% per 10 INT, max +75%
   * talentLevel 0: no bonus.
   */
  getSpRecoveryPerSeq(talentTwoLevel: number, intellect: number): number {
    const base = FlashAndDash.BASE_SP_RECOVERY_PER_SEQ;
    if (talentTwoLevel <= 0) return base;
    const ratePerTenInt = talentTwoLevel >= 2 ? 0.015 : 0.01;
    const maxBonus = talentTwoLevel >= 2 ? 0.75 : 0.5;
    const bonus = Math.min(Math.floor(intellect / 10) * ratePerTenInt, maxBonus);
    return base * (1 + bonus);
  }
}

// ── SQUAD! ON ME! (Ultimate) ──────────────────────────────────────────────────

const SQUAD_ON_ME_SP_RECOVERY = [
  58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80,
] as const;

export class SquadOnMe extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.SQUAD_ON_ME;
  static readonly BASE_ULTIMATE_ENERGY_COST = 120;
  /** Potential 4 threshold — at potential >= 4, energy cost is reduced by 10%. */
  static readonly POT4_COST_REDUCTION = 0.10;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const cost = pot >= 4
      ? SquadOnMe.BASE_ULTIMATE_ENERGY_COST * (1 - SquadOnMe.POT4_COST_REDUCTION)
      : SquadOnMe.BASE_ULTIMATE_ENERGY_COST;
    super({
      operatorType: OperatorType.AKEKURI,
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
    return operatorPotential >= 4
      ? SquadOnMe.BASE_ULTIMATE_ENERGY_COST * (1 - SquadOnMe.POT4_COST_REDUCTION)
      : SquadOnMe.BASE_ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getSpRecovery(level: SkillLevel): number {
    return SQUAD_ON_ME_SP_RECOVERY[level - 1];
  }
}
