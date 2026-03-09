import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.DAPAN.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.DAPAN.BATTLE_SKILL.DAPAN_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.DAPAN.COMBO_SKILL.DAPAN_COMBO_SKILL;
const OP_ULT = skillsData.operators.DAPAN.ULTIMATE.DAPAN_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.DAPAN_BASIC_ATTACK_SEQUENCE_1;

export class DaPanBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.DAPAN_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.ROLLING_CUT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.DAPAN_BASIC_ATTACK_SEQUENCE_2;

export class DaPanBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.DAPAN_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.ROLLING_CUT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.DAPAN_BASIC_ATTACK_SEQUENCE_3;

export class DaPanBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.DAPAN_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.ROLLING_CUT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.DAPAN_BASIC_ATTACK_SEQUENCE_4;

export class DaPanBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.DAPAN_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.ROLLING_CUT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class DaPanBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.DAPAN_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.DAPAN_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.DAPAN_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FLIP_DA_WOK,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: DaPanBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class DaPanComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.DAPAN_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.DAPAN_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.DAPAN_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.MORE_SPICE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: DaPanComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_VULNERABILITY]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class DaPanUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.DAPAN_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.DAPAN_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.CHOP_N_DUNK,
      target: TargetType.SELF,
      sourceOperator: OperatorType.DA_PAN,
      duration: DaPanUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: DaPanUltimateEvent.ANIMATION_SECONDS,
      activationDuration: DaPanUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
