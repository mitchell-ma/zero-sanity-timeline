import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.ARDELIA.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.ARDELIA.BATTLE_SKILL.ARDELIA_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.ARDELIA.COMBO_SKILL.ARDELIA_COMBO_SKILL;
const OP_ULT = skillsData.operators.ARDELIA.ULTIMATE.ARDELIA_ULTIMATE;

// ── Basic Attack: Rocky Whispers ────────────────────────────────────────────

const SEQ_1 = OP_BASIC.ARDELIA_BASIC_ATTACK_SEQUENCE_1;

export class ArdeliaBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.ARDELIA_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.ROCKY_WHISPERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.ARDELIA_BASIC_ATTACK_SEQUENCE_2;

export class ArdeliaBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.ARDELIA_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.ROCKY_WHISPERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.ARDELIA_BASIC_ATTACK_SEQUENCE_3;

export class ArdeliaBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.ARDELIA_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.ROCKY_WHISPERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.ARDELIA_BASIC_ATTACK_SEQUENCE_4;

export class ArdeliaBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.ARDELIA_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.ROCKY_WHISPERS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill: Dolly Rush ────────────────────────────────────────────────

export class ArdeliaBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.ARDELIA_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.ARDELIA_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.ARDELIA_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.DOLLY_RUSH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: ArdeliaBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill: Eruption Column ────────────────────────────────────────────

export class ArdeliaComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.ARDELIA_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.ARDELIA_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.ARDELIA_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.ERUPTION_COLUMN,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: ArdeliaComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.CORROSION]),
    });
  }
}

// ── Ultimate: Wooly Party ───────────────────────────────────────────────────

export class ArdeliaUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.ARDELIA_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.ARDELIA_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.WOOLY_PARTY,
      target: TargetType.SELF,
      sourceOperator: OperatorType.ARDELIA,
      duration: ArdeliaUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: ArdeliaUltimateEvent.ANIMATION_SECONDS,
      activationDuration: ArdeliaUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
