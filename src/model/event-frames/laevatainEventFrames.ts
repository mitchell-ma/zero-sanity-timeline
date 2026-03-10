import { BasicAttackType, ElementType, StatusType, TargetType } from "../../consts/enums";
import { BasicAttackEventFrame } from "./basicAttackEventFrame";
import { BasicSkillEventFrame } from "./basicSkillEventFrame";
import { ComboSkillEventFrame } from "./comboSkillEventFrame";
import { CombatSkillEventFrame } from "./combatSkillEventFrame";
import { SkillEventFrame, FrameArtsInfliction, FrameArtsAbsorption, FrameArtsConsumption, FrameForcedReaction, FrameApplyStatus } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const LAEV = skillsData.operators.LAEVATAIN;

// ── Concrete SkillEventFrame / SkillEventSequence for Laevatain ───────────────────────

class LaevatainSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _absorbArtsInfliction: FrameArtsAbsorption | null;
  private readonly _consumeArtsInfliction: FrameArtsConsumption | null;
  private readonly _applyForcedReaction: FrameForcedReaction | null;
  private readonly _applyStatus: FrameApplyStatus | null;

  constructor(tickData: Record<string, any>) {
    super();
    this._offsetSeconds = tickData.OFFSET_SECONDS;
    this._skillPointRecovery = tickData.SKILL_POINT_RECOVERY;
    this._stagger = tickData.STAGGER;

    // Parse APPLY_ARTS_INFLICTION
    const apply = tickData.APPLY_ARTS_INFLICTION;
    if (apply) {
      const element = Object.keys(apply)[0];
      this._applyArtsInfliction = { element, stacks: apply[element].STACKS };
    } else {
      this._applyArtsInfliction = null;
    }

    // Parse ABSORB_ARTS_INFLICTION
    const absorb = tickData.ABSORB_ARTS_INFLICTION;
    if (absorb) {
      const element = Object.keys(absorb)[0];
      const entry = absorb[element];
      this._absorbArtsInfliction = {
        element,
        stacks: entry.STACKS,
        exchangeStatus: entry.CONVERSION.EXCHANGE as StatusType,
        ratio: entry.CONVERSION.RATIO,
      };
    } else {
      this._absorbArtsInfliction = null;
    }

    // Parse CONSUME_ARTS_INFLICTION (removes infliction stacks without exchange)
    const consume = tickData.CONSUME_ARTS_INFLICTION;
    if (consume) {
      const element = Object.keys(consume)[0];
      this._consumeArtsInfliction = { element, stacks: consume[element].STACKS };
    } else {
      this._consumeArtsInfliction = null;
    }

    // Parse APPLY_FORCED_REACTION (e.g. forced Combustion from magma_0)
    const forced = tickData.APPLY_FORCED_REACTION;
    this._applyForcedReaction = forced
      ? { reaction: forced.REACTION as StatusType, statusLevel: forced.STATUS_LEVEL }
      : null;

    // Parse GRANT_STATUS (e.g. battle skill grants Melting Flame on self)
    const grant = tickData.GRANT_STATUS;
    this._applyStatus = grant
      ? { target: TargetType.SELF, status: grant.STATUS as StatusType, stacks: grant.STACKS, durationFrames: 0 }
      : null;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
  getAbsorbArtsInfliction(): FrameArtsAbsorption | null { return this._absorbArtsInfliction; }
  getConsumeArtsInfliction(): FrameArtsConsumption | null { return this._consumeArtsInfliction; }
  getApplyForcedReaction(): FrameForcedReaction | null { return this._applyForcedReaction; }
  getApplyStatus(): FrameApplyStatus | null { return this._applyStatus; }
}

class LaevatainSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly LaevatainSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: LaevatainSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new LaevatainSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly LaevatainSkillEventFrame[] { return this._frames; }
}

// ── Flaming Cinders (Basic Attack) ──────────────────────────────────────────
//
// 5-sequence basic attack chain. Each sequence has its own duration and ticks.

export const LAEVATAIN_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4, 5].map(
  (n) => {
    const key = `LAEVATAIN_BASIC_ATTACK_SEQUENCE_${n}`;
    return new LaevatainSkillEventSequence(
      (LAEV.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  },
);

// ── Enhanced Basic Attack ───────────────────────────────────────────────────
//
// 4-sequence enhanced basic attack (available during Twilight ultimate).

export const LAEVATAIN_ENHANCED_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4].map(
  (n) => {
    const key = `LAEVATAIN_ENHANCED_BASIC_ATTACK_SEQUENCE_${n}`;
    return new LaevatainSkillEventSequence(
      (LAEV.ENHANCED_BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  },
);

// Legacy frame classes (for existing frame pipeline)

export class FlamingCindersFrame extends BasicAttackEventFrame {
  constructor(params: { sequence: BasicAttackType; offsetFrame?: number }) {
    super(params);
  }
}

export class TwilightEnhancedFlamingCindersFrame extends BasicAttackEventFrame {
  constructor(params: {
    sequence:
      | BasicAttackType.SEQUENCE_1
      | BasicAttackType.SEQUENCE_2
      | BasicAttackType.SEQUENCE_3
      | BasicAttackType.SEQUENCE_4
      | BasicAttackType.SEQUENCE_5
      | BasicAttackType.FINAL_STRIKE;
    offsetFrame?: number;
  }) {
    super(params);
  }
}

// ── Finisher Attack ──────────────────────────────────────────────────────────

/**
 * Finisher attack frame for Laevatain's basic attack chain.
 * Consumes all heat infliction stacks from the enemy target and grants
 * MeltingFlameStatus at a 1:1 exchange ratio (max 4 stacks).
 */
export class FinisherAttackEventFrame extends CombatSkillEventFrame {
  consumedStacks: number;
  grantedMeltingFlameStacks: number;

  constructor(params: {
    offsetFrame?: number;
    hitDelayFrames?: number;
    consumedStacks?: number;
  }) {
    super({
      offsetFrame: params.offsetFrame,
      hitDelayFrames: params.hitDelayFrames,
      element: ElementType.HEAT,
    });
    this.consumedStacks = params.consumedStacks ?? 0;
    this.grantedMeltingFlameStacks = Math.min(this.consumedStacks, 4);
  }
}

// ── Smouldering Fire (Battle Skill) ─────────────────────────────────────────

export const LAEVATAIN_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new LaevatainSkillEventSequence(
  LAEV.BATTLE_SKILL.LAEVATAIN_BATTLE_SKILL,
  'LAEVATAIN_BATTLE_SKILL',
);

export const LAEVATAIN_ENHANCED_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new LaevatainSkillEventSequence(
  LAEV.ENHANCED_BATTLE_SKILL.LAEVATAIN_ENHANCED_BATTLE_SKILL,
  'LAEVATAIN_ENHANCED_BATTLE_SKILL',
);

export const LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new LaevatainSkillEventSequence(
  LAEV.ENHANCED_EMPOWERED_BATTLE_SKILL.LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL,
  'LAEVATAIN_ENHANCED_EMPOWERED_BATTLE_SKILL',
);

export const LAEVATAIN_EMPOWERED_BATTLE_SKILL_SEQUENCES: readonly SkillEventSequence[] = [
  new LaevatainSkillEventSequence(
    (LAEV.EMPOWERED_BATTLE_SKILL as Record<string, any>).LAEVATAIN_EMPOWERED_BATTLE_SKILL_EXPLOSION,
    'LAEVATAIN_EMPOWERED_BATTLE_SKILL_EXPLOSION',
  ),
  new LaevatainSkillEventSequence(
    (LAEV.EMPOWERED_BATTLE_SKILL as Record<string, any>).LAEVATAIN_EMPOWERED_BATTLE_SKILL_ADDITIONAL_ATTACK,
    'LAEVATAIN_EMPOWERED_BATTLE_SKILL_ADDITIONAL_ATTACK',
  ),
];

export class SmoulderingFireExplosionFrame extends BasicSkillEventFrame {}
export class SmoulderingFireDotFrame extends BasicSkillEventFrame {}
export class SmoulderingFireAdditionalAtkFrame extends BasicSkillEventFrame {}
export class SmoulderingFireUltBatkSeq1Frame extends BasicSkillEventFrame {}
export class SmoulderingFireUltBatkSeq2Frame extends BasicSkillEventFrame {}
export class SmoulderingFireUltAdditionalAtkFrame extends BasicSkillEventFrame {}

// ── Seethe (Combo Skill) ────────────────────────────────────────────────────

export const LAEVATAIN_COMBO_SKILL_SEQUENCE: SkillEventSequence = new LaevatainSkillEventSequence(
  LAEV.COMBO_SKILL.LAEVATAIN_COMBO_SKILL,
  'LAEVATAIN_COMBO_SKILL',
);

export class SeetheFrame extends ComboSkillEventFrame {}
