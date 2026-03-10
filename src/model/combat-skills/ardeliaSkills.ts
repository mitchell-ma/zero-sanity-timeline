import {
  BasicAttackType,
  CombatSkillsType,
  ElementType,
  OperatorType,
} from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { Potential, SkillLevel } from "../../consts/types";
import { BasicAttack } from "./basicAttack";
import { BasicSkill } from "./basicSkill";
import { ComboSkill } from "./comboSkill";
import { Ultimate } from "./ultimate";

// ── Rocky Whispers (Basic Attack) ────────────────────────────────────────────

const ROCKY_WHISPERS_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.64, 0.68, 0.72, 0.77, 0.83, 0.9,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.53, 0.58, 0.63, 0.68, 0.74, 0.79, 0.84, 0.89, 0.95, 1.01, 1.09, 1.18,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24,
  ],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.28, 1.36, 1.44, 1.54, 1.66, 1.8,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24,
  ],
};

export class RockyWhispers extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.ROCKY_WHISPERS;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARDELIA,
      elementType: ElementType.NATURE,
      basicAttackType: BasicAttackType.SEQUENCE_1,
      ...params,
    });
  }

  getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROCKY_WHISPERS_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROCKY_WHISPERS_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return ROCKY_WHISPERS_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Dolly Rush (Battle Skill) ─────────────────────────────────────────────────

const DOLLY_RUSH_DMG = [
  1.42, 1.56, 1.71, 1.85, 1.99, 2.13, 2.28, 2.42, 2.56, 2.74, 2.95, 3.2,
] as const;
const DOLLY_RUSH_SUSCEPTIBILITY = [
  0.12, 0.12, 0.12, 0.13, 0.13, 0.13, 0.14, 0.14, 0.16, 0.17, 0.18, 0.2,
] as const;

export class DollyRush extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.DOLLY_RUSH;
  static readonly SP_COST = 100;
  static readonly STAGGER = 10;
  static readonly DURATION_SECONDS = 30;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARDELIA,
      elementType: ElementType.NATURE,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return DOLLY_RUSH_DMG[level - 1];
  }

  getSusceptibility(level: SkillLevel): number {
    return DOLLY_RUSH_SUSCEPTIBILITY[level - 1];
  }
}

// ── Eruption Column (Combo Skill) ─────────────────────────────────────────────

const ARDELIA_COMBO = skillsData.operators.ARDELIA.COMBO_SKILL.ARDELIA_COMBO_SKILL;

const ERUPTION_COLUMN_COOLDOWN = [
  18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 17,
] as const;
const ERUPTION_COLUMN_DMG = [
  0.45, 0.49, 0.54, 0.58, 0.62, 0.67, 0.71, 0.76, 0.8, 0.86, 0.93, 1.0,
] as const;
const ERUPTION_COLUMN_EXPLOSION_DMG = [
  1.11, 1.22, 1.33, 1.44, 1.55, 1.67, 1.78, 1.89, 2.0, 2.14, 2.3, 2.5,
] as const;

export class EruptionColumn extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.ERUPTION_COLUMN;
  static readonly DURATION_SECONDS = ARDELIA_COMBO.ARDELIA_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_BASE = ARDELIA_COMBO.ARDELIA_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = ARDELIA_COMBO.ARDELIA_COMBO_SKILL_GAUGE_GAIN;
  static readonly STAGGER = 10;
  static readonly CORRODE_DURATION_SECONDS = 7;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARDELIA,
      elementType: ElementType.NATURE,
      ...params,
    });
  }

  getCooldownSeconds(level: SkillLevel): number {
    return ERUPTION_COLUMN_COOLDOWN[level - 1];
  }

  getDmgMultiplier(level: SkillLevel): number {
    return ERUPTION_COLUMN_DMG[level - 1];
  }

  getExplosionDmgMultiplier(level: SkillLevel): number {
    return ERUPTION_COLUMN_EXPLOSION_DMG[level - 1];
  }
}

// ── Wooly Party (Ultimate) ────────────────────────────────────────────────────

const WOOLY_PARTY_DMG = [
  0.73, 0.81, 0.88, 0.95, 1.03, 1.1, 1.17, 1.25, 1.32, 1.41, 1.52, 1.65,
] as const;
const WOOLY_PARTY_STAGGER = [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3] as const;

const ARDELIA_ULT = skillsData.operators.ARDELIA.ULTIMATE.ARDELIA_ULTIMATE;

export class WoolyParty extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.WOOLY_PARTY;
  static readonly ULTIMATE_ENERGY_COST = ARDELIA_ULT.ARDELIA_ULTIMATE_ENERGY_COST;
  static readonly DURATION_SECONDS = ARDELIA_ULT.ARDELIA_ULTIMATE_DURATION;
  static readonly ANIMATION_SECONDS = ARDELIA_ULT.ARDELIA_ULTIMATE_ANIMATION_TIME;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ARDELIA,
      elementType: ElementType.NATURE,
      ultimateEnergyCost: WoolyParty.ULTIMATE_ENERGY_COST,
      duration: WoolyParty.DURATION_SECONDS,
      animationDuration: WoolyParty.ANIMATION_SECONDS,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return WoolyParty.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return WoolyParty.DURATION_SECONDS;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return WOOLY_PARTY_DMG[level - 1];
  }

  getStagger(level: SkillLevel): number {
    return WOOLY_PARTY_STAGGER[level - 1];
  }
}
