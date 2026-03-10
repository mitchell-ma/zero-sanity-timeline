import { SkillEventFrame, FrameArtsInfliction } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.ARCLIGHT;

class ArclightSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;

  constructor(tickData: Record<string, any>) {
    super();
    this._offsetSeconds = tickData.OFFSET_SECONDS;
    this._skillPointRecovery = tickData.SKILL_POINT_RECOVERY;
    this._stagger = tickData.STAGGER;

    const apply = tickData.APPLY_ARTS_INFLICTION;
    if (apply) {
      const element = Object.keys(apply)[0];
      this._applyArtsInfliction = { element, stacks: apply[element].STACKS };
    } else {
      this._applyArtsInfliction = null;
    }
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
}

class ArclightSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly ArclightSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: ArclightSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new ArclightSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly ArclightSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const ARCLIGHT_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4, 5]
  .map((n) => {
    const key = `ARCLIGHT_BASIC_ATTACK_SEQUENCE_${n}`;
    return new ArclightSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
export const ARCLIGHT_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new ArclightSkillEventSequence(
  OP.BATTLE_SKILL.ARCLIGHT_BATTLE_SKILL,
  'ARCLIGHT_BATTLE_SKILL',
);

// ── Combo Skill ─────────────────────────────────────────────────────────────
export const ARCLIGHT_COMBO_SKILL_SEQUENCE: SkillEventSequence = new ArclightSkillEventSequence(
  OP.COMBO_SKILL.ARCLIGHT_COMBO_SKILL,
  'ARCLIGHT_COMBO_SKILL',
);

// ── Ultimate ────────────────────────────────────────────────────────────────
// Arclight's ultimate has a delayed explosion (tick 2 at 3.9s) beyond the
// 2.57s activation duration. Split into main sequence + explosion sequence.

const ARCLIGHT_ULT = OP.ULTIMATE.ARCLIGHT_ULTIMATE;
const ARCLIGHT_ULT_DUR = ARCLIGHT_ULT.ARCLIGHT_ULTIMATE_DURATION;

/** Main dash — ticks within duration */
class ArclightUltimateMainSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly ArclightSkillEventFrame[];
  constructor() {
    super();
    this._durationSeconds = ARCLIGHT_ULT_DUR;
    const frames: ArclightSkillEventFrame[] = [];
    const ticks = ARCLIGHT_ULT.ARCLIGHT_ULTIMATE_TICKS;
    for (let i = 1; i <= ticks; i++) {
      const tick = ARCLIGHT_ULT[`ARCLIGHT_ULTIMATE_TICK_${i}` as keyof typeof ARCLIGHT_ULT] as Record<string, any>;
      if (tick && (tick as any).OFFSET_SECONDS <= ARCLIGHT_ULT_DUR) {
        frames.push(new ArclightSkillEventFrame(tick));
      }
    }
    this._frames = frames;
  }
  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly ArclightSkillEventFrame[] { return this._frames; }
}

/** Explosion — delayed hit after main dash */
class ArclightExplosionSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly ArclightSkillEventFrame[];
  constructor() {
    super();
    const delayedTicks: { tick: Record<string, any>; offset: number }[] = [];
    const ticks = ARCLIGHT_ULT.ARCLIGHT_ULTIMATE_TICKS;
    for (let i = 1; i <= ticks; i++) {
      const tick = ARCLIGHT_ULT[`ARCLIGHT_ULTIMATE_TICK_${i}` as keyof typeof ARCLIGHT_ULT] as Record<string, any>;
      if (tick && (tick as any).OFFSET_SECONDS > ARCLIGHT_ULT_DUR) {
        delayedTicks.push({ tick, offset: (tick as any).OFFSET_SECONDS - ARCLIGHT_ULT_DUR });
      }
    }
    const maxOffset = delayedTicks.length > 0 ? Math.max(...delayedTicks.map((d) => d.offset)) : 0;
    this._durationSeconds = maxOffset + 0.1;
    this._frames = delayedTicks.map((d) => new ArclightSkillEventFrame({ ...d.tick, OFFSET_SECONDS: d.offset }));
  }
  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly ArclightSkillEventFrame[] { return this._frames; }
}

export const ARCLIGHT_ULTIMATE_SEQUENCE: SkillEventSequence = new ArclightUltimateMainSequence();
export const ARCLIGHT_EXPLOSION_SEQUENCE: SkillEventSequence = new ArclightExplosionSequence();
