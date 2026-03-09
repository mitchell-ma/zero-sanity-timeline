import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.XAIHI.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.XAIHI.BATTLE_SKILL.XAIHI_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.XAIHI.COMBO_SKILL.XAIHI_COMBO_SKILL;
const OP_ULT = skillsData.operators.XAIHI.ULTIMATE.XAIHI_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.XAIHI_BASIC_ATTACK_SEQUENCE_1;

export class XaihiBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.XAIHI_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.XAIHI_BASIC_ATTACK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.XAIHI_BASIC_ATTACK_SEQUENCE_2;

export class XaihiBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.XAIHI_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.XAIHI_BASIC_ATTACK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.XAIHI_BASIC_ATTACK_SEQUENCE_3;

export class XaihiBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.XAIHI_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.XAIHI_BASIC_ATTACK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.XAIHI_BASIC_ATTACK_SEQUENCE_4;

export class XaihiBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.XAIHI_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.XAIHI_BASIC_ATTACK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.XAIHI_BASIC_ATTACK_SEQUENCE_5;

export class XaihiBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.XAIHI_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.XAIHI_BASIC_ATTACK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class XaihiBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.XAIHI_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.XAIHI_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.XAIHI_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.DISTRIBUTED_DOS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: XaihiBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class XaihiComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.XAIHI_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.XAIHI_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.XAIHI_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.STRESS_TESTING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: XaihiComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.HP_TREATMENT_EXCEEDS_MAX]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class XaihiUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.XAIHI_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.XAIHI_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.STACK_OVERFLOW,
      target: TargetType.SELF,
      sourceOperator: OperatorType.XAIHI,
      duration: XaihiUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: XaihiUltimateEvent.ANIMATION_SECONDS,
      activationDuration: XaihiUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
