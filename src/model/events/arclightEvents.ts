import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.ARCLIGHT.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.ARCLIGHT.BATTLE_SKILL.ARCLIGHT_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.ARCLIGHT.COMBO_SKILL.ARCLIGHT_COMBO_SKILL;
const OP_ULT = skillsData.operators.ARCLIGHT.ULTIMATE.ARCLIGHT_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.ARCLIGHT_BASIC_ATTACK_SEQUENCE_1;

export class ArclightBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.ARCLIGHT_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.SEEK_AND_HUNT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.ARCLIGHT_BASIC_ATTACK_SEQUENCE_2;

export class ArclightBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.ARCLIGHT_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.SEEK_AND_HUNT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.ARCLIGHT_BASIC_ATTACK_SEQUENCE_3;

export class ArclightBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.ARCLIGHT_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.SEEK_AND_HUNT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.ARCLIGHT_BASIC_ATTACK_SEQUENCE_4;

export class ArclightBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.ARCLIGHT_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.SEEK_AND_HUNT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.ARCLIGHT_BASIC_ATTACK_SEQUENCE_5;

export class ArclightBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.ARCLIGHT_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.SEEK_AND_HUNT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class ArclightBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.ARCLIGHT_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.ARCLIGHT_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.ARCLIGHT_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.TEMPESTUOUS_ARC,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: ArclightBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class ArclightComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.ARCLIGHT_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.ARCLIGHT_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.ARCLIGHT_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.PEAL_OF_THUNDER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: ArclightComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.ELECTRIFICATION]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class ArclightUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.ARCLIGHT_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.ARCLIGHT_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.EXPLODING_BLITZ,
      target: TargetType.SELF,
      sourceOperator: OperatorType.ARCLIGHT,
      duration: ArclightUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: ArclightUltimateEvent.ANIMATION_SECONDS,
      activationDuration: ArclightUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
