import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.LASTRITE.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.LASTRITE.BATTLE_SKILL.LASTRITE_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.LASTRITE.COMBO_SKILL.LASTRITE_COMBO_SKILL;
const OP_ULT = skillsData.operators.LASTRITE.ULTIMATE.LASTRITE_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.LASTRITE_BASIC_ATTACK_SEQUENCE_1;

export class LastRiteBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.LASTRITE_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.DANCE_OF_RIME,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.LASTRITE_BASIC_ATTACK_SEQUENCE_2;

export class LastRiteBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.LASTRITE_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.DANCE_OF_RIME,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.LASTRITE_BASIC_ATTACK_SEQUENCE_3;

export class LastRiteBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.LASTRITE_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.DANCE_OF_RIME,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.LASTRITE_BASIC_ATTACK_SEQUENCE_4;

export class LastRiteBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.LASTRITE_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.DANCE_OF_RIME,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class LastRiteBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.LASTRITE_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.LASTRITE_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.LASTRITE_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.ESOTERIC_LEGACY,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: LastRiteBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class LastRiteComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.LASTRITE_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.LASTRITE_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.LASTRITE_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.WINTERS_DEVOURER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: LastRiteComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class LastRiteUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.LASTRITE_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.LASTRITE_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.VIGIL_SERVICES,
      target: TargetType.SELF,
      sourceOperator: OperatorType.LAST_RITE,
      duration: LastRiteUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: LastRiteUltimateEvent.ANIMATION_SECONDS,
      activationDuration: LastRiteUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
