import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.FLUORITE.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.FLUORITE.BATTLE_SKILL.FLUORITE_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.FLUORITE.COMBO_SKILL.FLUORITE_COMBO_SKILL;
const OP_ULT = skillsData.operators.FLUORITE.ULTIMATE.FLUORITE_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.FLUORITE_BASIC_ATTACK_SEQUENCE_1;

export class FluoriteBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.FLUORITE_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.SIGNATURE_GUN_KATA,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.FLUORITE_BASIC_ATTACK_SEQUENCE_2;

export class FluoriteBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.FLUORITE_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.SIGNATURE_GUN_KATA,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.FLUORITE_BASIC_ATTACK_SEQUENCE_3;

export class FluoriteBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.FLUORITE_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.SIGNATURE_GUN_KATA,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.FLUORITE_BASIC_ATTACK_SEQUENCE_4;

export class FluoriteBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.FLUORITE_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.SIGNATURE_GUN_KATA,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class FluoriteBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.FLUORITE_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.FLUORITE_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.FLUORITE_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.TINY_SURPRISE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: FluoriteBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class FluoriteComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.FLUORITE_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.FLUORITE_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.FLUORITE_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FREE_GIVEAWAY,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: FluoriteComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class FluoriteUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.FLUORITE_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.FLUORITE_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.APEX_PRANKSTER,
      target: TargetType.SELF,
      sourceOperator: OperatorType.FLUORITE,
      duration: FluoriteUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: FluoriteUltimateEvent.ANIMATION_SECONDS,
      activationDuration: FluoriteUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
