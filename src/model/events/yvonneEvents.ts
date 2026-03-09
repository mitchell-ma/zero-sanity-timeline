import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.YVONNE.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.YVONNE.BATTLE_SKILL.YVONNE_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.YVONNE.COMBO_SKILL.YVONNE_COMBO_SKILL;
const OP_ULT = skillsData.operators.YVONNE.ULTIMATE.YVONNE_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.YVONNE_BASIC_ATTACK_SEQUENCE_1;

export class YvonneBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.YVONNE_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.EXUBERANT_TRIGGER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.YVONNE_BASIC_ATTACK_SEQUENCE_2;

export class YvonneBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.YVONNE_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.EXUBERANT_TRIGGER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.YVONNE_BASIC_ATTACK_SEQUENCE_3;

export class YvonneBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.YVONNE_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.EXUBERANT_TRIGGER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.YVONNE_BASIC_ATTACK_SEQUENCE_4;

export class YvonneBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.YVONNE_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.EXUBERANT_TRIGGER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_5 = OP_BASIC.YVONNE_BASIC_ATTACK_SEQUENCE_5;

export class YvonneBasicAttackSequence5 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_5.YVONNE_BASIC_ATTACK_SEQUENCE_5_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_5,
      name: CombatSkillsType.EXUBERANT_TRIGGER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneBasicAttackSequence5.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class YvonneBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.YVONNE_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.YVONNE_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.YVONNE_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.BRR_BRR_BOMB,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: YvonneBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class YvonneComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.YVONNE_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.YVONNE_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.YVONNE_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FLASHFREEZER,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: YvonneComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.FINAL_STRIKE]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class YvonneUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.YVONNE_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.YVONNE_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.CRYOBLASTING_PISTOLIER,
      target: TargetType.SELF,
      sourceOperator: OperatorType.YVONNE,
      duration: YvonneUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: YvonneUltimateEvent.ANIMATION_SECONDS,
      activationDuration: YvonneUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
