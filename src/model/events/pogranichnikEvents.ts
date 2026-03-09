import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.POGRANICHNK.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.POGRANICHNK.BATTLE_SKILL.POGRANICHNK_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.POGRANICHNK.COMBO_SKILL.POGRANICHNK_COMBO_SKILL;
const OP_ULT = skillsData.operators.POGRANICHNK.ULTIMATE.POGRANICHNK_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.POGRANICHNK_BASIC_ATTACK_SEQUENCE_1;

export class PogranichnikBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.POGRANICHNK_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.ALL_OUT_OFFENSIVE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.POGRANICHNK_BASIC_ATTACK_SEQUENCE_2;

export class PogranichnikBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.POGRANICHNK_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.ALL_OUT_OFFENSIVE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.POGRANICHNK_BASIC_ATTACK_SEQUENCE_3;

export class PogranichnikBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.POGRANICHNK_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.ALL_OUT_OFFENSIVE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.POGRANICHNK_BASIC_ATTACK_SEQUENCE_4;

export class PogranichnikBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.POGRANICHNK_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.ALL_OUT_OFFENSIVE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.POGRANICHNK_BASIC_ATTACK_SEQUENCE_5;

export class PogranichnikBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.POGRANICHNK_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.ALL_OUT_OFFENSIVE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class PogranichnikBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.POGRANICHNK_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.POGRANICHNK_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.POGRANICHNK_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.THE_PULVERIZING_FRONT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: PogranichnikBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class PogranichnikComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.POGRANICHNK_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.POGRANICHNK_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.POGRANICHNK_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FULL_MOON_SLASH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: PogranichnikComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_PHYSICAL_STATUS]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class PogranichnikUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.POGRANICHNK_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.POGRANICHNK_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.SHIELDGUARD_BANNER,
      target: TargetType.SELF,
      sourceOperator: OperatorType.POGRANICHNIK,
      duration: PogranichnikUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: PogranichnikUltimateEvent.ANIMATION_SECONDS,
      activationDuration: PogranichnikUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
