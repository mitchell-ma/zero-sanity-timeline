import { ElementType, StatusType } from "../../consts/enums";
import { SkillEventFrame, FrameArtsInfliction, FrameForcedReaction } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.ARDELIA;

class ArdeliaSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _applyForcedReaction: FrameForcedReaction | null;
  private readonly _damageElement: string | null;

  constructor(tickData: Record<string, any>, damageElement?: string) {
    super();
    this._offsetSeconds = tickData.OFFSET_SECONDS;
    this._skillPointRecovery = tickData.SKILL_POINT_RECOVERY;
    this._stagger = tickData.STAGGER;
    this._damageElement = damageElement ?? null;

    const infliction = tickData.APPLY_ARTS_INFLICTION;
    if (infliction) {
      const [element, data] = Object.entries(infliction)[0] as [string, any];
      this._applyArtsInfliction = { element, stacks: data.STACKS };
    } else {
      this._applyArtsInfliction = null;
    }

    const forced = tickData.APPLY_FORCED_REACTION;
    this._applyForcedReaction = forced
      ? {
          reaction: forced.REACTION as StatusType,
          statusLevel: forced.STATUS_LEVEL,
          ...(forced.DURATION_SECONDS != null && { durationFrames: Math.round(forced.DURATION_SECONDS * 120) }),
        }
      : null;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
  getApplyForcedReaction(): FrameForcedReaction | null { return this._applyForcedReaction; }
  getDamageElement(): string | null { return this._damageElement; }
}

class ArdeliaSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly ArdeliaSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string, damageElement?: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: ArdeliaSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new ArdeliaSkillEventFrame(tick, damageElement));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly ArdeliaSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const ARDELIA_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4, 5]
  .map((n) => {
    const key = `ARDELIA_BASIC_ATTACK_SEQUENCE_${n}`;
    return new ArdeliaSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
      ElementType.NATURE,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
export const ARDELIA_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new ArdeliaSkillEventSequence(
  OP.BATTLE_SKILL.ARDELIA_BATTLE_SKILL,
  'ARDELIA_BATTLE_SKILL',
  ElementType.NATURE,
);

// ── Combo Skill ─────────────────────────────────────────────────────────────
export const ARDELIA_COMBO_SKILL_SEQUENCE: SkillEventSequence = new ArdeliaSkillEventSequence(
  OP.COMBO_SKILL.ARDELIA_COMBO_SKILL,
  'ARDELIA_COMBO_SKILL',
  ElementType.NATURE,
);

export const ARDELIA_COMBO_SKILL_EXPLOSION_SEQUENCE: SkillEventSequence = new ArdeliaSkillEventSequence(
  OP.COMBO_SKILL.ARDELIA_COMBO_SKILL_EXPLOSION,
  'ARDELIA_COMBO_SKILL_EXPLOSION',
  ElementType.NATURE,
);

// ── Ultimate ────────────────────────────────────────────────────────────────
export const ARDELIA_ULTIMATE_SEQUENCE: SkillEventSequence = new ArdeliaSkillEventSequence(
  OP.ULTIMATE.ARDELIA_ULTIMATE,
  'ARDELIA_ULTIMATE',
  ElementType.NATURE,
);
