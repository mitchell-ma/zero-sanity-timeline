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

// ── Chen Qianyu Basic Attack ────────────────────────────────────────────────────

export class SoaringBreak extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.SOARING_BREAK;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CHEN_QIANYU,
      elementType: ElementType.PHYSICAL,
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

// ── Chen Qianyu Battle Skill ──────────────────────────────────────────────────

export class AscendingStrike extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.ASCENDING_STRIKE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CHEN_QIANYU,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Chen Qianyu Combo Skill ───────────────────────────────────────────────────

export class SoarToTheStars extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.SOAR_TO_THE_STARS;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.CHEN_QIANYU,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Chen Qianyu Ultimate ──────────────────────────────────────────────────────

export class BladeGale extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.BLADE_GALE;

  static readonly BASE_ULTIMATE_ENERGY_COST = 59.5;
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = BladeGale.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - BladeGale.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.CHEN_QIANYU,
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
    const baseCost = BladeGale.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - BladeGale.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
