import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.CATCHER.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.CATCHER.BATTLE_SKILL.CATCHER_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.CATCHER.COMBO_SKILL.CATCHER_COMBO_SKILL;
const OP_ULT = skillsData.operators.CATCHER.ULTIMATE.CATCHER_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.CATCHER_BASIC_ATTACK_SEQUENCE_1;

export class CatcherBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.CATCHER_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.RIGID_INTERDICTION_BASIC,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.CATCHER_BASIC_ATTACK_SEQUENCE_2;

export class CatcherBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.CATCHER_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.RIGID_INTERDICTION_BASIC,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.CATCHER_BASIC_ATTACK_SEQUENCE_3;

export class CatcherBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.CATCHER_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.RIGID_INTERDICTION_BASIC,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.CATCHER_BASIC_ATTACK_SEQUENCE_4;

export class CatcherBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.CATCHER_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.RIGID_INTERDICTION_BASIC,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class CatcherBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.CATCHER_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.CATCHER_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.CATCHER_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.RIGID_INTERDICTION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: CatcherBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class CatcherComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.CATCHER_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.CATCHER_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.CATCHER_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.TIMELY_SUPPRESSION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: CatcherComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.HP_BELOW_THRESHOLD]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class CatcherUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.CATCHER_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.CATCHER_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.TEXTBOOK_ASSAULT,
      target: TargetType.SELF,
      sourceOperator: OperatorType.CATCHER,
      duration: CatcherUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: CatcherUltimateEvent.ANIMATION_SECONDS,
      activationDuration: CatcherUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
