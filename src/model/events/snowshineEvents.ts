import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.SNOWSHINE.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.SNOWSHINE.BATTLE_SKILL.SNOWSHINE_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.SNOWSHINE.COMBO_SKILL.SNOWSHINE_COMBO_SKILL;
const OP_ULT = skillsData.operators.SNOWSHINE.ULTIMATE.SNOWSHINE_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.SNOWSHINE_BASIC_ATTACK_SEQUENCE_1;

export class SnowshineBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.SNOWSHINE_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.HYPOTHERMIC_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.SNOWSHINE,
      duration: SnowshineBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.SNOWSHINE_BASIC_ATTACK_SEQUENCE_2;

export class SnowshineBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.SNOWSHINE_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.HYPOTHERMIC_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.SNOWSHINE,
      duration: SnowshineBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.SNOWSHINE_BASIC_ATTACK_SEQUENCE_3;

export class SnowshineBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.SNOWSHINE_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.HYPOTHERMIC_ASSAULT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.SNOWSHINE,
      duration: SnowshineBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class SnowshineBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.SNOWSHINE_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.SNOWSHINE_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.SNOWSHINE_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.SATURATED_DEFENSE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.SNOWSHINE,
      duration: SnowshineBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: SnowshineBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class SnowshineComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.SNOWSHINE_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.SNOWSHINE_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.SNOWSHINE_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.POLAR_RESCUE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.SNOWSHINE,
      duration: SnowshineComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: SnowshineComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.HP_BELOW_THRESHOLD]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class SnowshineUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.SNOWSHINE_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.SNOWSHINE_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.FRIGID_SNOWFIELD,
      target: TargetType.SELF,
      sourceOperator: OperatorType.SNOWSHINE,
      duration: SnowshineUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: SnowshineUltimateEvent.ANIMATION_SECONDS,
      activationDuration: SnowshineUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
