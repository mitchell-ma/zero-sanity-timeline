import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.AVYWENNA.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.AVYWENNA.BATTLE_SKILL.AVYWENNA_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.AVYWENNA.COMBO_SKILL.AVYWENNA_COMBO_SKILL;
const OP_ULT = skillsData.operators.AVYWENNA.ULTIMATE.AVYWENNA_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.AVYWENNA_BASIC_ATTACK_SEQUENCE_1;

export class AvywennaBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.AVYWENNA_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.THUNDERLANCE_BLITZ,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.AVYWENNA_BASIC_ATTACK_SEQUENCE_2;

export class AvywennaBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.AVYWENNA_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.THUNDERLANCE_BLITZ,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.AVYWENNA_BASIC_ATTACK_SEQUENCE_3;

export class AvywennaBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.AVYWENNA_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.THUNDERLANCE_BLITZ,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.AVYWENNA_BASIC_ATTACK_SEQUENCE_4;

export class AvywennaBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.AVYWENNA_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.THUNDERLANCE_BLITZ,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.AVYWENNA_BASIC_ATTACK_SEQUENCE_5;

export class AvywennaBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.AVYWENNA_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.THUNDERLANCE_BLITZ,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class AvywennaBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.AVYWENNA_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.AVYWENNA_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.AVYWENNA_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.THUNDERLANCE_INTERDICTION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: AvywennaBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class AvywennaComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.AVYWENNA_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.AVYWENNA_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.AVYWENNA_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.THUNDERLANCE_STRIKE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: AvywennaComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.FINAL_STRIKE]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class AvywennaUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.AVYWENNA_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.AVYWENNA_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.THUNDERLANCE_FINAL_SHOCK,
      target: TargetType.SELF,
      sourceOperator: OperatorType.AVYWENNA,
      duration: AvywennaUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: AvywennaUltimateEvent.ANIMATION_SECONDS,
      activationDuration: AvywennaUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
