import { BasicAttackType, CombatSkillsType, OperatorType, TargetType, TimeInteractionType, TriggerConditionType } from "../../consts/enums";
import skillsData from "../game-data/skills.json";
import { BasicAttackEvent } from "./basicAttackEvent";
import { BasicSkillEvent } from "./basicSkillEvent";
import { ComboSkillEvent } from "./comboSkillEvent";
import { UltimateEvent } from "./ultimateEvent";

const AKEK_BASIC = skillsData.operators.AKEKURI.BASIC_ATTACK;
const AKEK_BATTLE = skillsData.operators.AKEKURI.BATTLE_SKILL.AKEKURI_BATTLE_SKILL;
const AKEK_COMBO = skillsData.operators.AKEKURI.COMBO_SKILL.AKEKURI_COMBO_SKILL;
const AKEK_ULT = skillsData.operators.AKEKURI.ULTIMATE.AKEKURI_ULTIMATE;

// ── Basic Attack: Sword of Aspiration ────────────────────────────────────────
//
// 4-sequence basic attack chain. Sequence 4 final tick grants 19 SP and 17 stagger.

const AKEK_SEQ_1 = AKEK_BASIC.AKEKURI_BASIC_ATTACK_SEQUENCE_1;
const AKEK_SEQ_2 = AKEK_BASIC.AKEKURI_BASIC_ATTACK_SEQUENCE_2;
const AKEK_SEQ_3 = AKEK_BASIC.AKEKURI_BASIC_ATTACK_SEQUENCE_3;
const AKEK_SEQ_4 = AKEK_BASIC.AKEKURI_BASIC_ATTACK_SEQUENCE_4;

export class AkekuriBasicAttackSequence1 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = AKEK_SEQ_1.AKEKURI_BASIC_ATTACK_SEQUENCE_1_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_1,
      name: CombatSkillsType.SWORD_OF_ASPIRATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AKEKURI,
      duration: AkekuriBasicAttackSequence1.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class AkekuriBasicAttackSequence2 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = AKEK_SEQ_2.AKEKURI_BASIC_ATTACK_SEQUENCE_2_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_2,
      name: CombatSkillsType.SWORD_OF_ASPIRATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AKEKURI,
      duration: AkekuriBasicAttackSequence2.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class AkekuriBasicAttackSequence3 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = AKEK_SEQ_3.AKEKURI_BASIC_ATTACK_SEQUENCE_3_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_3,
      name: CombatSkillsType.SWORD_OF_ASPIRATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AKEKURI,
      duration: AkekuriBasicAttackSequence3.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

export class AkekuriBasicAttackSequence4 extends BasicAttackEvent {
  static readonly DURATION_SECONDS = AKEK_SEQ_4.AKEKURI_BASIC_ATTACK_SEQUENCE_4_DURATION;

  constructor() {
    super({
      basicAttackType: BasicAttackType.SEQUENCE_4,
      name: CombatSkillsType.SWORD_OF_ASPIRATION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AKEKURI,
      duration: AkekuriBasicAttackSequence4.DURATION_SECONDS,
      cooldownSeconds: 0,
    });
  }
}

// ── Battle Skill: Burst of Passion ──────────────────────────────────────────
//
// 1.33s duration, 100 SP cost, 6.5 gauge gain.

export class AkekuriBattleSkillEvent extends BasicSkillEvent {
  static readonly DURATION_SECONDS = AKEK_BATTLE.AKEKURI_BATTLE_SKILL_DURATION;
  static readonly SP_COST = AKEK_BATTLE.AKEKURI_BATTLE_SKILL_SP_COST;
  static readonly GAUGE_GAIN = AKEK_BATTLE.AKEKURI_BATTLE_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.BURST_OF_PASSION,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AKEKURI,
      duration: AkekuriBattleSkillEvent.DURATION_SECONDS,
      cooldownSeconds: 0,
      skillPointCost: AkekuriBattleSkillEvent.SP_COST,
    });
  }
}

// ── Combo Skill: Flash and Dash ─────────────────────────────────────────────
//
// Triggered when enemy has Combustion. 1.27s duration, 15s cooldown, 10 gauge gain.

export class AkekuriComboSkillEvent extends ComboSkillEvent {
  static readonly DURATION_SECONDS = AKEK_COMBO.AKEKURI_COMBO_SKILL_DURATION;
  static readonly COOLDOWN_SECONDS = AKEK_COMBO.AKEKURI_COMBO_SKILL_COOLDOWN;
  static readonly GAUGE_GAIN = AKEK_COMBO.AKEKURI_COMBO_SKILL_GAUGE_GAIN;

  constructor() {
    super({
      name: CombatSkillsType.FLASH_AND_DASH,
      target: TargetType.ENEMY,
      sourceOperator: OperatorType.AKEKURI,
      duration: AkekuriComboSkillEvent.DURATION_SECONDS,
      cooldownSeconds: AkekuriComboSkillEvent.COOLDOWN_SECONDS,
      triggerConditions: new Set([TriggerConditionType.COMBUSTION]),
    });
  }
}

// ── Ultimate: Squad on Me ───────────────────────────────────────────────────
//
// Two phases:
// - Activation (4.3s): cast animation
//   - Animation (1.683s) plays within the activation window
// - Active (6s): enhanced combat state
// - Cooldown (28s): post-ultimate recovery

export class AkekuriUltimateEvent extends UltimateEvent {
  static readonly ANIMATION_SECONDS = AKEK_ULT.AKEKURI_ULTIMATE_ANIMATION_TIME;
  static readonly ACTIVATION_SECONDS = AKEK_ULT.AKEKURI_ULTIMATE_DURATION;
  static readonly ACTIVE_SECONDS = 6;
  static readonly COOLDOWN_SECONDS = 28;

  readonly activeSeconds: number;

  constructor(params?: {
    animationSeconds?: number;
    activationSeconds?: number;
    activeSeconds?: number;
    cooldownSeconds?: number;
  }) {
    const animation = params?.animationSeconds ?? AkekuriUltimateEvent.ANIMATION_SECONDS;
    const activation = params?.activationSeconds ?? AkekuriUltimateEvent.ACTIVATION_SECONDS;
    const active = params?.activeSeconds ?? AkekuriUltimateEvent.ACTIVE_SECONDS;
    const cooldown = params?.cooldownSeconds ?? AkekuriUltimateEvent.COOLDOWN_SECONDS;

    super({
      name: CombatSkillsType.SQUAD_ON_ME,
      target: TargetType.SELF,
      sourceOperator: OperatorType.AKEKURI,
      duration: activation + active,
      cooldownSeconds: cooldown,
      animationDuration: animation,
      activationDuration: activation,
      animationTimeInteraction: TimeInteractionType.TIME_STOP,
    });

    this.activeSeconds = active;
  }
}
