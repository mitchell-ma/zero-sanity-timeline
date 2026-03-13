import { ElementType, StatusType, TargetType } from "../../consts/enums";
import { SkillEventFrame, FrameArtsInfliction, FrameApplyStatus, FrameForcedReaction, FrameReactionConsumption } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.ARDELIA;

/** Dolly Rush susceptibility duration in frames (30s at 120fps). */
const DOLLY_RUSH_DURATION_FRAMES = 3600;

/** Per-level susceptibility bonus applied by Dolly Rush (Physical + Arts). */
const DOLLY_RUSH_SUSCEPTIBILITY = [
  0.12, 0.12, 0.12, 0.13, 0.13, 0.13, 0.14, 0.14, 0.16, 0.17, 0.18, 0.2,
] as const;

class ArdeliaSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _applyForcedReaction: FrameForcedReaction | null;
  private readonly _consumeReaction: FrameReactionConsumption | null;
  private readonly _damageElement: string | null;

  constructor(tickData: Record<string, any>, opts?: { damageElement?: string; consumeReaction?: FrameReactionConsumption }) {
    super();
    this._offsetSeconds = tickData.OFFSET_SECONDS;
    this._skillPointRecovery = tickData.SKILL_POINT_RECOVERY;
    this._stagger = tickData.STAGGER;
    this._damageElement = opts?.damageElement ?? null;
    this._consumeReaction = opts?.consumeReaction ?? null;

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
  getConsumeReaction(): FrameReactionConsumption | null { return this._consumeReaction; }
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
      if (tick) frames.push(new ArdeliaSkillEventFrame(tick, { damageElement }));
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
// Dolly Rush: first hit consumes Corrosion on the enemy and conditionally
// applies Physical + Arts Susceptibility.
class ArdeliaBattleSkillSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly ArdeliaSkillEventFrame[];

  constructor() {
    super();
    const seqData = OP.BATTLE_SKILL.ARDELIA_BATTLE_SKILL as Record<string, any>;
    const prefix = 'ARDELIA_BATTLE_SKILL';
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: ArdeliaSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) {
        // First tick: consume Corrosion → apply Susceptibility
        const consumeReaction: FrameReactionConsumption | undefined = i === 1
          ? {
              columnId: 'corrosion',
              applyStatus: {
                target: TargetType.ENEMY,
                status: StatusType.SUSCEPTIBILITY,
                stacks: 1,
                durationFrames: DOLLY_RUSH_DURATION_FRAMES,
                susceptibility: {
                  [ElementType.PHYSICAL]: DOLLY_RUSH_SUSCEPTIBILITY,
                  [ElementType.HEAT]: DOLLY_RUSH_SUSCEPTIBILITY,
                  [ElementType.ELECTRIC]: DOLLY_RUSH_SUSCEPTIBILITY,
                  [ElementType.CRYO]: DOLLY_RUSH_SUSCEPTIBILITY,
                  [ElementType.NATURE]: DOLLY_RUSH_SUSCEPTIBILITY,
                },
                eventName: 'Dolly Rush',
              },
            }
          : undefined;
        frames.push(new ArdeliaSkillEventFrame(tick, {
          damageElement: ElementType.NATURE,
          ...(consumeReaction && { consumeReaction }),
        }));
      }
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly ArdeliaSkillEventFrame[] { return this._frames; }
}

export const ARDELIA_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new ArdeliaBattleSkillSequence();

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
