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

// ── Audio Noise (Basic Attack) ───────────────────────────────────────────────

const AUDIO_NOISE_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.25, 0.28, 0.30, 0.33, 0.35, 0.38, 0.40, 0.43, 0.45, 0.48, 0.52, 0.56],
  [BasicAttackType.SEQUENCE_2]: [0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68],
  [BasicAttackType.SEQUENCE_3]: [0.35, 0.39, 0.42, 0.46, 0.49, 0.53, 0.56, 0.60, 0.63, 0.67, 0.73, 0.79],
  [BasicAttackType.SEQUENCE_4]: [0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.77, 0.83, 0.90],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.40, 0.44, 0.48, 0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.77, 0.83, 0.90],
};

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
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return AUDIO_NOISE_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return AUDIO_NOISE_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return AUDIO_NOISE_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Onomatopoeia (Battle Skill) ──────────────────────────────────────────────

const ONOMATOPOEIA_DMG = [
  1.56, 1.71, 1.87, 2.02, 2.18, 2.34, 2.49, 2.65, 2.80, 3.00, 3.23, 3.50,
] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return ONOMATOPOEIA_DMG[level - 1];
  }
}

// ── Distortion (Combo Skill) ─────────────────────────────────────────────────

const DISTORTION_DMG = [
  1.60, 1.76, 1.92, 2.08, 2.24, 2.40, 2.56, 2.72, 2.88, 3.08, 3.32, 3.60,
] as const;

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

  getDmgMultiplier(level: SkillLevel): number {
    return DISTORTION_DMG[level - 1];
  }
}

// ── Tremolo (Ultimate) ───────────────────────────────────────────────────────

const TREMOLO_DMG = [
  4.89, 5.38, 5.86, 6.35, 6.84, 7.33, 7.82, 8.31, 8.80, 9.41, 10.14, 11.00,
] as const;

export class Tremolo extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.TREMOLO;

  static readonly BASE_ULTIMATE_ENERGY_COST = 63;
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

  getDmgMultiplier(level: SkillLevel): number {
    return TREMOLO_DMG[level - 1];
  }
}
