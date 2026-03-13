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

// ── Pogranichnik Basic Attack ────────────────────────────────────────────────────

const ALL_OUT_OFFENSIVE_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.23, 0.25, 0.28, 0.30, 0.32, 0.35, 0.37, 0.39, 0.41, 0.44, 0.48, 0.52],
  [BasicAttackType.SEQUENCE_2]: [0.28, 0.31, 0.34, 0.36, 0.39, 0.42, 0.45, 0.48, 0.50, 0.54, 0.58, 0.63],
  [BasicAttackType.SEQUENCE_3]: [0.33, 0.36, 0.40, 0.43, 0.46, 0.50, 0.53, 0.56, 0.59, 0.64, 0.68, 0.74],
  [BasicAttackType.SEQUENCE_4]: [0.38, 0.42, 0.46, 0.50, 0.53, 0.57, 0.61, 0.65, 0.69, 0.73, 0.79, 0.86],
  [BasicAttackType.SEQUENCE_5]: [0.43, 0.47, 0.52, 0.56, 0.60, 0.65, 0.69, 0.73, 0.77, 0.83, 0.89, 0.97],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.43, 0.47, 0.52, 0.56, 0.60, 0.65, 0.69, 0.73, 0.77, 0.83, 0.89, 0.97],
};

export class AllOutOffensive extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.ALL_OUT_OFFENSIVE;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.POGRANICHNIK,
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
    return ALL_OUT_OFFENSIVE_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ALL_OUT_OFFENSIVE_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ALL_OUT_OFFENSIVE_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Pogranichnik Battle Skill ──────────────────────────────────────────────────

const PULVERIZING_FRONT_DMG = [1.92, 2.10, 2.30, 2.48, 2.68, 2.86, 3.06, 3.25, 3.44, 3.68, 3.96, 4.30] as const;

export class ThePulverizingFront extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.THE_PULVERIZING_FRONT;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.POGRANICHNIK,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return PULVERIZING_FRONT_DMG[level - 1];
  }
}

// ── Pogranichnik Combo Skill ───────────────────────────────────────────────────

const FULL_MOON_SLASH_DMG = [1.62, 1.78, 1.94, 2.11, 2.27, 2.43, 2.59, 2.75, 2.92, 3.12, 3.36, 3.66] as const;

export class FullMoonSlash extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FULL_MOON_SLASH;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.POGRANICHNIK,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return FULL_MOON_SLASH_DMG[level - 1];
  }
}

// ── Pogranichnik Ultimate ──────────────────────────────────────────────────────

const SHIELDGUARD_BANNER_DMG = [1.33, 1.47, 1.60, 1.73, 1.86, 2.00, 2.13, 2.26, 2.40, 2.56, 2.76, 3.00] as const;

export class ShieldguardBanner extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.SHIELDGUARD_BANNER;

  static readonly BASE_ULTIMATE_ENERGY_COST = 90; // from ENERGY_COST
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = ShieldguardBanner.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - ShieldguardBanner.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.POGRANICHNIK,
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
    const baseCost = ShieldguardBanner.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - ShieldguardBanner.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return SHIELDGUARD_BANNER_DMG[level - 1];
  }
}
