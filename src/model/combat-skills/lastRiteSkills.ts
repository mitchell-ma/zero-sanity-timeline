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

// ── Dance of Rime (Basic Attack) ─────────────────────────────────────────────

const DANCE_OF_RIME_SEQ: Record<BasicAttackType, readonly number[]> = {
  [BasicAttackType.SEQUENCE_1]: [0.30, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.68],
  [BasicAttackType.SEQUENCE_2]: [0.55, 0.61, 0.66, 0.72, 0.77, 0.83, 0.88, 0.94, 0.99, 1.06, 1.14, 1.24],
  [BasicAttackType.SEQUENCE_3]: [0.68, 0.75, 0.82, 0.88, 0.95, 1.02, 1.09, 1.16, 1.22, 1.31, 1.41, 1.53],
  [BasicAttackType.SEQUENCE_4]: [0.90, 0.99, 1.08, 1.17, 1.26, 1.35, 1.44, 1.53, 1.62, 1.73, 1.87, 2.03],
  [BasicAttackType.SEQUENCE_5]: [],
  [BasicAttackType.FINISHER]: [4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.7, 8.3, 9.0],
  [BasicAttackType.DIVE]: [0.8, 0.88, 0.96, 1.04, 1.12, 1.20, 1.28, 1.36, 1.44, 1.54, 1.66, 1.80],
  [BasicAttackType.FINAL_STRIKE]: [0.90, 0.99, 1.08, 1.17, 1.26, 1.35, 1.44, 1.53, 1.62, 1.73, 1.87, 2.03],
};

export class DanceOfRime extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.DANCE_OF_RIME;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAST_RITE,
      elementType: ElementType.CRYO,
      basicAttackType: BasicAttackType.SEQUENCE_1,
      ...params,
    });
  }

  getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return DANCE_OF_RIME_SEQ[sequence][level - 1] ?? 0;
  }

  getFinisherAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return DANCE_OF_RIME_SEQ[BasicAttackType.FINISHER][level - 1];
  }

  getDiveAttackMultiplier(
    level: SkillLevel,
    _operatorPotential: Potential,
  ): number {
    return DANCE_OF_RIME_SEQ[BasicAttackType.DIVE][level - 1];
  }
}

// ── Esoteric Legacy (Battle Skill) ───────────────────────────────────────────

const ESOTERIC_LEGACY_DMG = [
  1.42, 1.56, 1.71, 1.85, 1.99, 2.13, 2.28, 2.42, 2.56, 2.74, 2.95, 3.20,
] as const;

export class EsotericLegacy extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.ESOTERIC_LEGACY;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAST_RITE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return ESOTERIC_LEGACY_DMG[level - 1];
  }
}

// ── Winter's Devourer (Combo Skill) ──────────────────────────────────────────

const WINTERS_DEVOURER_DMG = [
  0.71, 0.78, 0.85, 0.92, 0.99, 1.07, 1.14, 1.21, 1.28, 1.37, 1.47, 1.60,
] as const;

export class WintersDevourer extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.WINTERS_DEVOURER;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.LAST_RITE,
      elementType: ElementType.CRYO,
      ...params,
    });
  }

  getDmgMultiplier(level: SkillLevel): number {
    return WINTERS_DEVOURER_DMG[level - 1];
  }
}

// ── Vigil Services (Ultimate) ────────────────────────────────────────────────

const VIGIL_SERVICES_DMG = [
  3.56, 3.91, 4.27, 4.62, 4.98, 5.33, 5.69, 6.04, 6.40, 6.84, 7.38, 8.00,
] as const;

export class VigilServices extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.VIGIL_SERVICES;

  static readonly BASE_ULTIMATE_ENERGY_COST = 240;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = VigilServices.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - VigilServices.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.LAST_RITE,
      elementType: ElementType.CRYO,
      ultimateEnergyCost: cost,
      duration: 0,
      ...params,
    });
  }

  getUltimateEnergyCost(
    _level: SkillLevel,
    operatorPotential: Potential,
  ): number {
    const baseCost = VigilServices.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - VigilServices.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }

  getDmgMultiplier(level: SkillLevel): number {
    return VIGIL_SERVICES_DMG[level - 1];
  }
}
