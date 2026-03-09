import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.ALESH.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.ALESH.BATTLE_SKILL.ALESH_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.ALESH.COMBO_SKILL.ALESH_COMBO_SKILL;
const OP_ULT = skillsData.operators.ALESH.ULTIMATE.ALESH_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.ALESH_BASIC_ATTACK_SEQUENCE_1;

export class AleshBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.ALESH_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.ROD_CASTING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.ALESH_BASIC_ATTACK_SEQUENCE_2;

export class AleshBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.ALESH_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.ROD_CASTING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.ALESH_BASIC_ATTACK_SEQUENCE_3;

export class AleshBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.ALESH_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.ROD_CASTING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.ALESH_BASIC_ATTACK_SEQUENCE_4;

export class AleshBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.ALESH_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.ROD_CASTING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.ALESH_BASIC_ATTACK_SEQUENCE_5;

export class AleshBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.ALESH_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.ROD_CASTING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class AleshBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.ALESH_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.ALESH_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.ALESH_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.UNCONVENTIONAL_LURE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: AleshBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class AleshComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.ALESH_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.ALESH_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.ALESH_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.AUGER_ANGLING,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ALESH,
      duration: AleshComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: AleshComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class AleshUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.ALESH_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.ALESH_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.ONE_MONSTER_CATCH,
      target: TargetType.SELF,
      sourceOperator: OperatorType.ALESH,
      duration: AleshUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: AleshUltimateEvent.ANIMATION_SECONDS,
      activationDuration: AleshUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
