import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.ESTELLA.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.ESTELLA.BATTLE_SKILL.ESTELLA_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.ESTELLA.COMBO_SKILL.ESTELLA_COMBO_SKILL;
const OP_ULT = skillsData.operators.ESTELLA.ULTIMATE.ESTELLA_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.ESTELLA_BASIC_ATTACK_SEQUENCE_1;

export class EstellaBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.ESTELLA_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.AUDIO_NOISE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.ESTELLA_BASIC_ATTACK_SEQUENCE_2;

export class EstellaBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.ESTELLA_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.AUDIO_NOISE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.ESTELLA_BASIC_ATTACK_SEQUENCE_3;

export class EstellaBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.ESTELLA_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.AUDIO_NOISE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.ESTELLA_BASIC_ATTACK_SEQUENCE_4;

export class EstellaBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.ESTELLA_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.AUDIO_NOISE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class EstellaBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.ESTELLA_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.ESTELLA_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.ESTELLA_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.ONOMATOPOEIA,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: EstellaBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class EstellaComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.ESTELLA_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.ESTELLA_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.ESTELLA_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.DISTORTION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: EstellaComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.SOLIDIFICATION]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class EstellaUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.ESTELLA_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.ESTELLA_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.TREMOLO,
      target: TargetType.SELF,
      sourceOperator: OperatorType.ESTELLA,
      duration: EstellaUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: EstellaUltimateEvent.ANIMATION_SECONDS,
      activationDuration: EstellaUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
