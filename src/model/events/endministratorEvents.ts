import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.ENDMINISTRATOR.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.ENDMINISTRATOR.BATTLE_SKILL.ENDMINISTRATOR_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.ENDMINISTRATOR.COMBO_SKILL.ENDMINISTRATOR_COMBO_SKILL;
const OP_ULT = skillsData.operators.ENDMINISTRATOR.ULTIMATE.ENDMINISTRATOR_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_1;

export class EndministratorBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.DESTRUCTIVE_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_2;

export class EndministratorBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.DESTRUCTIVE_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_3;

export class EndministratorBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.DESTRUCTIVE_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_4;

export class EndministratorBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.DESTRUCTIVE_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_5;

export class EndministratorBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.DESTRUCTIVE_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class EndministratorBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.ENDMINISTRATOR_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.ENDMINISTRATOR_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.ENDMINISTRATOR_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.CONSTRUCTIVE_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: EndministratorBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class EndministratorComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.ENDMINISTRATOR_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.ENDMINISTRATOR_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.ENDMINISTRATOR_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.SEALING_SEQUENCE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: EndministratorComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.CAST_COMBO_SKILL]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class EndministratorUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.ENDMINISTRATOR_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.ENDMINISTRATOR_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.BOMBARDMENT_SEQUENCE,
      target: TargetType.SELF,
      sourceOperator: OperatorType.ENDMINISTRATOR,
      duration: EndministratorUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: EndministratorUltimateEvent.ANIMATION_SECONDS,
      activationDuration: EndministratorUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
