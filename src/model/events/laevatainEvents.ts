import { BasicAttackType, CombatSkillsType, CombatSkillType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import { LaevatainEnhancementSource, LaevatainEmpowermentSource } from "../operators/laevatainEnums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const LAEV_BASIC = skillsData.operators.LAEVATAIN.BASIC_ATTACK;
const LAEV_COMBO = skillsData.operators.LAEVATAIN.COMBO_SKILL.LAEVATAIN_COMBO_SKILL;
const LAEV_BATTLE = skillsData.operators.LAEVATAIN.BATTLE_SKILL.LAEVATAIN_BATTLE_SKILL;
const LAEV_ENHANCED_BATTLE = skillsData.operators.LAEVATAIN.ENHANCED_BATTLE_SKILL.LAEVATAIN_ENHANCED_BATTLE_SKILL;
const LAEV_ENHANCED_EMPOWERED_BATTLE = skillsData.operators.LAEVATAIN.ENHANCED_EMPOWERED_BATTLE_SKILL.LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL;
const LAEV_EMPOWERED_BATTLE = skillsData.operators.LAEVATAIN.EMPOWERED_BATTLE_SKILL;

// ── Basic Attack: Flaming Cinders ───────────────────────────────────────────
//
// 5-sequence basic attack chain. Each sequence has a duration and damage ticks.
// Sequence 5 final tick grants 20 SP and 18 stagger.

const LAEV_SEQ_1 = LAEV_BASIC.LAEVATAIN_BASIC_ATTACK_SEQUENCE_1;
const LAEV_SEQ_2 = LAEV_BASIC.LAEVATAIN_BASIC_ATTACK_SEQUENCE_2;
const LAEV_SEQ_3 = LAEV_BASIC.LAEVATAIN_BASIC_ATTACK_SEQUENCE_3;
const LAEV_SEQ_4 = LAEV_BASIC.LAEVATAIN_BASIC_ATTACK_SEQUENCE_4;
const LAEV_SEQ_5 = LAEV_BASIC.LAEVATAIN_BASIC_ATTACK_SEQUENCE_5;

export class LaevatainBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = LAEV_SEQ_1.LAEVATAIN_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.FLAMING_CINDERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class LaevatainBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = LAEV_SEQ_2.LAEVATAIN_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.FLAMING_CINDERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class LaevatainBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = LAEV_SEQ_3.LAEVATAIN_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.FLAMING_CINDERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class LaevatainBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = LAEV_SEQ_4.LAEVATAIN_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.FLAMING_CINDERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class LaevatainBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = LAEV_SEQ_5.LAEVATAIN_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.FLAMING_CINDERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Combo Skill: Seethe ────────────────────────────────────────────────────
//
// Triggered when enemy has Combustion. 1.37s duration, 10s cooldown.
// Gauge gain scales with enemies hit: 25/30/35 for 1/2/3 enemies.

export class LaevatainComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = LAEV_COMBO.LAEVATAIN_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = LAEV_COMBO.LAEVATAIN_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = LAEV_COMBO.LAEVATAIN_COMBO_SKILL_GAUGE_GAIN_HIT_1_ENEMY;

  constructor() {
    super({
      name: CombatSkillsType.SEETHE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: LaevatainComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.COMBUSTION]),
    });
  }
}

// ── Battle Skill: Smouldering Fire ──────────────────────────────────────────
//
// Laevatain's battle skill has 4 variants:
//
// - BattleSkillEvent:                   Base version (no prerequisites)
// - EnhancedBattleSkillEvent:           Enhanced by ultimate (Twilight) — skill behaviour
//                                       is changed while ultimate is active.
//                                       Requires: ultimate active.
// - EmpoweredBattleSkillEvent:          Empowered by existing statuses (Melting Flame stacks) —
//                                       skill behaviour is changed by active status effects.
//                                       Requires: Melting Flame stacks at max (4/4).
// - EnhancedEmpoweredBattleSkillEvent:  Both enhanced (ultimate active) and empowered
//                                       (Melting Flame stacks at max).
//                                       Requires: ultimate active AND Melting Flame at max.

/** Base Smouldering Fire. */
export class LaevatainBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = LAEV_BATTLE.LAEVATAIN_BATTLE_SKILL_DURATION;
  static readonly SP_COST = LAEV_BATTLE.LAEVATAIN_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = LAEV_BATTLE.LAEVATAIN_BATTLE_SKILL_GAUGE_GAIN;
  readonly enhancementSource = null;
  readonly empowermentSource = null;

  constructor() {
    super({
      name: CombatSkillsType.SMOULDERING_FIRE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: LaevatainBattleSkillEvent.SP_COST,
    });
  }
}

/** Enhanced by ultimate (Twilight) — skill behaviour is changed while ultimate is active. */
export class LaevatainEnhancedBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = LAEV_ENHANCED_BATTLE.LAEVATAIN_ENHANCED_BATTLE_SKILL_DURATION;
  static readonly SP_COST = LAEV_ENHANCED_BATTLE.LAEVATAIN_ENHANCED_BATTLE_SKILL_SP_COST;
  readonly enhancementSource = LaevatainEnhancementSource.TWILIGHT;
  readonly empowermentSource = null;

  constructor() {
    super({
      name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainEnhancedBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: LaevatainEnhancedBattleSkillEvent.SP_COST,
    });
  }
}

/** Empowered by existing statuses (Melting Flame stacks) — skill behaviour is changed by active status effects. */
export class LaevatainEmpoweredBattleSkillEvent extends BasicSkillEvent {
  static readonly EXPLOSION_DURATION_SECONDS = LAEV_EMPOWERED_BATTLE.LAEVATAIN_EMPOWERED_BATTLE_SKILL_EXPLOSION.LAEVATAIN_EMPOWERED_BATTLE_SKILL_EXPLOSION_DURATION;
  static readonly ADDITIONAL_ATTACK_DURATION_SECONDS = LAEV_EMPOWERED_BATTLE.LAEVATAIN_EMPOWERED_BATTLE_SKILL_ADDITIONAL_ATTACK.LAEVATAIN_EMPOWERED_BATTLE_SKILL_ADDITIONAL_ATTACK_DURATION;
  static readonly DURATION_SECONDS = LaevatainEmpoweredBattleSkillEvent.EXPLOSION_DURATION_SECONDS + LaevatainEmpoweredBattleSkillEvent.ADDITIONAL_ATTACK_DURATION_SECONDS;
  static readonly SP_COST = LAEV_EMPOWERED_BATTLE.LAEVATAIN_EMPOWERED_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = LAEV_EMPOWERED_BATTLE.LAEVATAIN_EMPOWERED_BATTLE_SKILL_GAUGE_GAIN;
  readonly enhancementSource = null;
  readonly empowermentSource = LaevatainEmpowermentSource.MELTING_FLAME;

  constructor() {
    super({
      name: CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainEmpoweredBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: LaevatainEmpoweredBattleSkillEvent.SP_COST,
    });
  }
}

/** Both enhanced (ultimate active) and empowered (Melting Flame stacks at max). */
export class LaevatainEnhancedEmpoweredBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = LAEV_ENHANCED_EMPOWERED_BATTLE.LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_DURATION;
  static readonly SP_COST = LAEV_ENHANCED_EMPOWERED_BATTLE.LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_SP_COST;
  readonly enhancementSource = LaevatainEnhancementSource.TWILIGHT;
  readonly empowermentSource = LaevatainEmpowermentSource.MELTING_FLAME;

  constructor() {
    super({
      name: CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: LaevatainEnhancedEmpoweredBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: LaevatainEnhancedEmpoweredBattleSkillEvent.SP_COST,
    });
  }
}

// ── Ultimate: Twilight ──────────────────────────────────────────────────────
//
// Three phases:
// - Activation (2.37s): TimeLock — no other events can start on any timeline
//   - Animation (2.07s) plays within the activation window
// - Active (15s): enhanced skill behaviour available
// - Cooldown (10s): post-ultimate recovery

const LAEV_ULT = skillsData.operators.LAEVATAIN.ULTIMATE.LAEVATAIN_ULTIMATE;

export class LaevatainUltimateEvent extends UltimateEvent {
  /** Duration of the animation in seconds (from skills.json). */
  static readonly ANIMATION_SECONDS = LAEV_ULT.LAEVATAIN_ULTIMATE_ANIMATION_TIME;
  /** Duration of the activation phase in seconds (from skills.json). */
  static readonly ACTIVATION_SECONDS = LAEV_ULT.LAEVATAIN_ULTIMATE_DURATION;
  /** Duration of the active phase in seconds. */
  static readonly ACTIVE_SECONDS = 15;
  /** Cooldown duration in seconds. */
  static readonly COOLDOWN_SECONDS = 10;

  /** Active phase duration in seconds. */
  readonly activeSeconds: number;

  constructor(params?: {
    animationSeconds?: number;
    activationSeconds?: number;
    activeSeconds?: number;
    cooldownSeconds?: number;
  }) {
    const animation = params?.animationSeconds ?? LaevatainUltimateEvent.ANIMATION_SECONDS;
    const activation = params?.activationSeconds ?? LaevatainUltimateEvent.ACTIVATION_SECONDS;
    const active = params?.activeSeconds ?? LaevatainUltimateEvent.ACTIVE_SECONDS;
    const cooldown = params?.cooldownSeconds ?? LaevatainUltimateEvent.COOLDOWN_SECONDS;

    super({
      name: CombatSkillsType.TWILIGHT,
      target: TargetType.SELF,
      sourceOperator: OperatorType.LAEVATAIN,
      duration: activation + active,
      cooldownSeconds: cooldown,
      animationDuration: animation,
      activationDuration: activation,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
      empowerSkillTarget: CombatSkillType.BATTLE_SKILL,
    });

    this.activeSeconds = active;
  }
}
