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

// ── Alesh Basic Attack ────────────────────────────────────────────────────

export class RodCasting extends BasicAttack {
  static readonly SKILL_NAME = CombatSkillsType.ROD_CASTING;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ALESH,
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

// ── Alesh Battle Skill ──────────────────────────────────────────────────

export class UnconventionalLure extends BasicSkill {
  static readonly SKILL_NAME = CombatSkillsType.UNCONVENTIONAL_LURE;
  static readonly SP_COST = 100;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ALESH,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Alesh Combo Skill ───────────────────────────────────────────────────

export class AugerAngling extends ComboSkill {
  static readonly SKILL_NAME = CombatSkillsType.AUGER_ANGLING;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    super({
      operatorType: OperatorType.ALESH,
      elementType: ElementType.PHYSICAL,
      ...params,
    });
  }
}

// ── Alesh Ultimate ──────────────────────────────────────────────────────

export class OneMonsterCatch extends Ultimate {
  static readonly SKILL_NAME = CombatSkillsType.ONE_MONSTER_CATCH;

  static readonly BASE_ULTIMATE_ENERGY_COST = 0; // from GAUGE_MAX
  static readonly POT4_COST_REDUCTION = 0.15;

  constructor(
    params: { level?: SkillLevel; operatorPotential?: Potential } = {},
  ) {
    const pot = params.operatorPotential ?? 0;
    const baseCost = OneMonsterCatch.BASE_ULTIMATE_ENERGY_COST || 0;
    const cost = pot >= 4
      ? baseCost * (1 - OneMonsterCatch.POT4_COST_REDUCTION)
      : baseCost;
    super({
      operatorType: OperatorType.ALESH,
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
    const baseCost = OneMonsterCatch.BASE_ULTIMATE_ENERGY_COST || 0;
    return operatorPotential >= 4
      ? baseCost * (1 - OneMonsterCatch.POT4_COST_REDUCTION)
      : baseCost;
  }

  getDuration(_level: SkillLevel, _operatorPotential: Potential): number {
    return 0;
  }
}
