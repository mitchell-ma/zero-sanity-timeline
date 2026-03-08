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

// ── Rapid Fire Akimbo (Basic Attack) ─────────────────────────────────────────

const RAPID_FIRE_AKIMBO_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [
    0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68,
  ],
  [BasicAttackType.SEQUENCE_2]: [
    0.35, 0.39, 0.42, 0.46, 0.49, 0.53, 0.56, 0.6, 0.63, 0.67, 0.73, 0.79,
  ],
  [BasicAttackType.SEQUENCE_3]: [
    0.56, 0.61, 0.67, 0.72, 0.78, 0.83, 0.89, 0.94, 1.0, 1.07, 1.15, 1.25,
  ],
  [BasicAttackType.SEQUENCE_4]: [
    0.68, 0.74, 0.81, 0.88, 0.95, 1.01, 1.08, 1.15, 1.22, 1.3, 1.4, 1.52,
  ],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [
    4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0,
  ],
  [BasicAttackType.DIVE]: [
    0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.28, 1.36, 1.44, 1.54, 1.66, 1.8,
  ],
  [BasicAttackType.FINAL_STRIKE]: [
    0.68, 0.74, 0.81, 0.88, 0.95, 1.01, 1.08, 1.15, 1.22, 1.3, 1.4, 1.52,
  ],
};

export class RapidFireAkimbo extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.RAPID_FIRE_AKIMBO;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.WULFGARD,
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
    return RAPID_FIRE_AKIMBO_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return RAPID_FIRE_AKIMBO_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return RAPID_FIRE_AKIMBO_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Thermite Tracers (Battle Skill) ──────────────────────────────────────────

const THERMITE_TRACERS_DMG = [
  1.02, 1.12, 1.22, 1.33, 1.43, 1.53, 1.63, 1.74, 1.84, 1.96, 2.12, 2.3,
] as const;
const THERMITE_TRACERS_ADDITIONAL_DMG = [
  3.78, 4.15, 4.53, 4.91, 5.29, 5.66, 6.04, 6.42, 6.8, 7.27, 7.84, 8.5,
] as const;

export class ThermiteTracers extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.THERMITE_TRACERS;
  static readonly SP_COST = 100;
  static readonly STAGGER = 5;
  static readonly ADDITIONAL_STAGGER = 5;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.WULFGARD,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return THERMITE_TRACERS_DMG[level - 1];
  }

  getAdditionalAtkDmgMultiplier(level: SkillLevel): number {
    return THERMITE_TRACERS_ADDITIONAL_DMG[level - 1];
  }
}

// ── Frag Grenade·β (Combo Skill) ─────────────────────────────────────────────

const FRAG_GRENADE_BETA_COOLDOWN = [
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 19,
] as const;
const FRAG_GRENADE_BETA_DMG = [
  0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.96, 1.02, 1.08, 1.16, 1.25, 1.35,
] as const;

export class FragGrenadeBeta extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.FRAG_GRENADE_BETA;
  static readonly STAGGER = 10;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.WULFGARD,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }

  getCooldownSeconds(level: SkillLevel): number {
    return FRAG_GRENADE_BETA_COOLDOWN[level - 1];
  }

  getDmgMultiplier(level: SkillLevel): number {
    return FRAG_GRENADE_BETA_DMG[level - 1];
  }
}

// ── Wolven Fury (Ultimate) ────────────────────────────────────────────────────

const WOLVEN_FURY_DMG_PER_SEQ = [
  0.32, 0.35, 0.38, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.66, 0.72,
] as const;

export class WolvenFury extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.WOLVEN_FURY;
  static readonly ULTIMATE_ENERGY_COST = 90;
  static readonly STAGGER = 15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.WULFGARD,
      elementType: ElementType.PHYSICAL,
      ultimateEnergyCost: WolvenFury.ULTIMATE_ENERGY_COST,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return WolvenFury.ULTIMATE_ENERGY_COST;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplierPerSeq(level: SkillLevel): number {
    return WOLVEN_FURY_DMG_PER_SEQ[level - 1];
  }
}
