import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.EMBER.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.EMBER.BATTLE_SKILL.EMBER_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.EMBER.COMBO_SKILL.EMBER_COMBO_SKILL;
const OP_ULT = skillsData.operators.EMBER.ULTIMATE.EMBER_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.EMBER_BASIC_ATTACK_SEQUENCE_1;

export class EmberBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.EMBER_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.SWORD_ART_OF_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.EMBER,
      duration: EmberBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.EMBER_BASIC_ATTACK_SEQUENCE_2;

export class EmberBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.EMBER_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.SWORD_ART_OF_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.EMBER,
      duration: EmberBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.EMBER_BASIC_ATTACK_SEQUENCE_3;

export class EmberBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.EMBER_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.SWORD_ART_OF_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.EMBER,
      duration: EmberBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.EMBER_BASIC_ATTACK_SEQUENCE_4;

export class EmberBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.EMBER_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.SWORD_ART_OF_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.EMBER,
      duration: EmberBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class EmberBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.EMBER_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.EMBER_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.EMBER_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FORWARD_MARCH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.EMBER,
      duration: EmberBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: EmberBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class EmberComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.EMBER_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.EMBER_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.EMBER_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FRONTLINE_SUPPORT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.EMBER,
      duration: EmberComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: EmberComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.HP_BELOW_THRESHOLD]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class EmberUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.EMBER_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.EMBER_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.RE_IGNITED_OATH,
      target: TargetType.SELF,
      sourceOperator: OperatorType.EMBER,
      duration: EmberUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: EmberUltimateEvent.ANIMATION_SECONDS,
      activationDuration: EmberUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
