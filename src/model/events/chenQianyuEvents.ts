import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.CHENQIANYU.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.CHENQIANYU.BATTLE_SKILL.CHENQIANYU_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.CHENQIANYU.COMBO_SKILL.CHENQIANYU_COMBO_SKILL;
const OP_ULT = skillsData.operators.CHENQIANYU.ULTIMATE.CHENQIANYU_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.CHENQIANYU_BASIC_ATTACK_SEQUENCE_1;

export class ChenQianyuBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.CHENQIANYU_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.SOARING_BREAK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.CHENQIANYU_BASIC_ATTACK_SEQUENCE_2;

export class ChenQianyuBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.CHENQIANYU_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.SOARING_BREAK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.CHENQIANYU_BASIC_ATTACK_SEQUENCE_3;

export class ChenQianyuBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.CHENQIANYU_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.SOARING_BREAK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.CHENQIANYU_BASIC_ATTACK_SEQUENCE_4;

export class ChenQianyuBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.CHENQIANYU_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.SOARING_BREAK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.CHENQIANYU_BASIC_ATTACK_SEQUENCE_5;

export class ChenQianyuBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.CHENQIANYU_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.SOARING_BREAK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class ChenQianyuBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.CHENQIANYU_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.CHENQIANYU_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.CHENQIANYU_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.ASCENDING_STRIKE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: ChenQianyuBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class ChenQianyuComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.CHENQIANYU_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.CHENQIANYU_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.CHENQIANYU_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.SOAR_TO_THE_STARS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: ChenQianyuComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_VULNERABILITY]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class ChenQianyuUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.CHENQIANYU_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.CHENQIANYU_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.BLADE_GALE,
      target: TargetType.SELF,
      sourceOperator: OperatorType.CHEN_QIANYU,
      duration: ChenQianyuUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: ChenQianyuUltimateEvent.ANIMATION_SECONDS,
      activationDuration: ChenQianyuUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
