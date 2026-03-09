import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.PERLICA.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.PERLICA.BATTLE_SKILL.PERLICA_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.PERLICA.COMBO_SKILL.PERLICA_COMBO_SKILL;
const OP_ULT = skillsData.operators.PERLICA.ULTIMATE.PERLICA_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.PERLICA_BASIC_ATTACK_SEQUENCE_1;

export class PerlicaBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.PERLICA_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.PROTOCOL_ALPHA_BREACH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.PERLICA_BASIC_ATTACK_SEQUENCE_2;

export class PerlicaBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.PERLICA_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.PROTOCOL_ALPHA_BREACH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.PERLICA_BASIC_ATTACK_SEQUENCE_3;

export class PerlicaBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.PERLICA_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.PROTOCOL_ALPHA_BREACH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.PERLICA_BASIC_ATTACK_SEQUENCE_4;

export class PerlicaBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.PERLICA_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.PROTOCOL_ALPHA_BREACH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class PerlicaBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.PERLICA_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.PERLICA_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.PERLICA_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.PROTOCOL_OMEGA_STRIKE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: PerlicaBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class PerlicaComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.PERLICA_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.PERLICA_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.PERLICA_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.INSTANT_PROTOCOL_CHAIN,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: PerlicaComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.FINAL_STRIKE]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class PerlicaUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.PERLICA_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.PERLICA_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.PROTOCOL_EPSILON,
      target: TargetType.SELF,
      sourceOperator: OperatorType.PERLICA,
      duration: PerlicaUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: PerlicaUltimateEvent.ANIMATION_SECONDS,
      activationDuration: PerlicaUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
