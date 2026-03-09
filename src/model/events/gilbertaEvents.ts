import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const OP_BASIC = skillsData.operators.GILBERTA.BASIC_ATTACK;
const OP_BATTLE = skillsData.operators.GILBERTA.BATTLE_SKILL.GILBERTA_BATTLE_SKILL;
const OP_COMBO = skillsData.operators.GILBERTA.COMBO_SKILL.GILBERTA_COMBO_SKILL;
const OP_ULT = skillsData.operators.GILBERTA.ULTIMATE.GILBERTA_ULTIMATE;

// ── Basic Attack ────────────────────────────────────────────────────────────

const SEQ_1 = OP_BASIC.GILBERTA_BASIC_ATTACK_SEQUENCE_1;

export class GilbertaBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_1.GILBERTA_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.BEAM_COHESION_ARTS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_2 = OP_BASIC.GILBERTA_BASIC_ATTACK_SEQUENCE_2;

export class GilbertaBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_2.GILBERTA_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.BEAM_COHESION_ARTS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_3 = OP_BASIC.GILBERTA_BASIC_ATTACK_SEQUENCE_3;

export class GilbertaBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_3.GILBERTA_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.BEAM_COHESION_ARTS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

const SEQ_4 = OP_BASIC.GILBERTA_BASIC_ATTACK_SEQUENCE_4;

export class GilbertaBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = SEQ_4.GILBERTA_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.BEAM_COHESION_ARTS,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill ────────────────────────────────────────────────────────────

export class GilbertaBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = OP_BATTLE.GILBERTA_BATTLE_SKILL_DURATION;
  static readonly SP_COST = OP_BATTLE.GILBERTA_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = OP_BATTLE.GILBERTA_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.GRAVITY_MODE,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: GilbertaBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill ─────────────────────────────────────────────────────────────

export class GilbertaComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = OP_COMBO.GILBERTA_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = OP_COMBO.GILBERTA_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = OP_COMBO.GILBERTA_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.MATRIX_DISPLACEMENT,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: GilbertaComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS]),
    });
  }
}

// ── Ultimate ────────────────────────────────────────────────────────────────

export class GilbertaUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = OP_ULT.GILBERTA_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = OP_ULT.GILBERTA_ULTIMATE_DURATION;

  constructor() {
    super({
      name: CombatSkillsType.GRAVITY_FIELD,
      target: TargetType.SELF,
      sourceOperator: OperatorType.GILBERTA,
      duration: GilbertaUltimateEvent.ACTIVATION_SECONDS,
      cooldownSeconds: 0,
      animationDuration: GilbertaUltimateEvent.ANIMATION_SECONDS,
      activationDuration: GilbertaUltimateEvent.ACTIVATION_SECONDS,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });
  }
}
