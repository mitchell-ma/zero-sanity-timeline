import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.LIFENG.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.LIFENG.BATTLE_SKILL.LIFENG_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.LIFENG.COMBO_SKILL.LIFENG_COMBO_SKILL;
const OP_ULT = skillsData.operators.LIFENG.ULTIMATE.LIFENG_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.LIFENG_BASIC_ATTACK_SEQUENCE_1;

export class LifengBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.LIFENG_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.RUINATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.LIFENG_BASIC_ATTACK_SEQUENCE_2;

export class LifengBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.LIFENG_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.RUINATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.LIFENG_BASIC_ATTACK_SEQUENCE_3;

export class LifengBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.LIFENG_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.RUINATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.LIFENG_BASIC_ATTACK_SEQUENCE_4;

export class LifengBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.LIFENG_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.RUINATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class LifengBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.LIFENG_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.LIFENG_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.LIFENG_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.TURBID_AVATAR,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: LifengBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class LifengComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.LIFENG_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.LIFENG_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.LIFENG_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.ASPECT_OF_WRATH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: LifengComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.FINAL_STRIKE]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class LifengUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.LIFENG_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.LIFENG_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.HEART_OF_THE_UNMOVING,
      target: TargetType.SELF,
      sourceOperator: OperatorType.LIFENG,
      duration: LifengUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: LifengUltimateEvent.ANIMATION_SECONDS,
      activationDuration: LifengUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
