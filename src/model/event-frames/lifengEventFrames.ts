import { SkillEventFrame, FrameArtsInfliction } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.LIFENG;

class LifengSkillEventFrame extends SkillEventFrame {
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

class LifengSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly LifengSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: LifengSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new LifengSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly LifengSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const LIFENG_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4]
  .map((n) => {
    const key = `LIFENG_BASIC_ATTACK_SEQUENCE_${n}`;
    return new LifengSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
export const LIFENG_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new LifengSkillEventSequence(
  OP.BATTLE_SKILL.LIFENG_BATTLE_SKILL,
  'LIFENG_BATTLE_SKILL',
);

// ── Combo Skill ─────────────────────────────────────────────────────────────
export const LIFENG_COMBO_SKILL_SEQUENCE: SkillEventSequence = new LifengSkillEventSequence(
  OP.COMBO_SKILL.LIFENG_COMBO_SKILL,
  'LIFENG_COMBO_SKILL',
);

// ── Ultimate ────────────────────────────────────────────────────────────────
// Lifeng's ultimate has a delayed Vajra Impact hit (tick 2 at 4.13s) beyond the
// 2.2s activation duration. Split into main sequence + delayed hit sequence.

const LIFENG_ULT = OP.ULTIMATE.LIFENG_ULTIMATE;
const LIFENG_ULT_DUR = LIFENG_ULT.LIFENG_ULTIMATE_DURATION;

/** Main activation — ticks within duration */
class LifengUltimateMainSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly LifengSkillEventFrame[];
  constructor() {
    super();
    this._durationSeconds = LIFENG_ULT_DUR;
    const frames: LifengSkillEventFrame[] = [];
    const ticks = LIFENG_ULT.LIFENG_ULTIMATE_TICKS;
    for (let i = 1; i <= ticks; i++) {
      const tick = LIFENG_ULT[`LIFENG_ULTIMATE_TICK_${i}` as keyof typeof LIFENG_ULT] as Record<string, any>;
      if (tick && (tick as any).OFFSET_SECONDS <= LIFENG_ULT_DUR) {
        frames.push(new LifengSkillEventFrame(tick));
      }
    }
    this._frames = frames;
  }
  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly LifengSkillEventFrame[] { return this._frames; }
}

/** Vajra Impact — delayed hit after main activation */
class LifengVajraImpactSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly LifengSkillEventFrame[];
  constructor() {
    super();
    const delayedTicks: { tick: Record<string, any>; offset: number }[] = [];
    const ticks = LIFENG_ULT.LIFENG_ULTIMATE_TICKS;
    for (let i = 1; i <= ticks; i++) {
      const tick = LIFENG_ULT[`LIFENG_ULTIMATE_TICK_${i}` as keyof typeof LIFENG_ULT] as Record<string, any>;
      if (tick && (tick as any).OFFSET_SECONDS > LIFENG_ULT_DUR) {
        delayedTicks.push({ tick, offset: (tick as any).OFFSET_SECONDS - LIFENG_ULT_DUR });
      }
    }
    const maxOffset = delayedTicks.length > 0 ? Math.max(...delayedTicks.map((d) => d.offset)) : 0;
    this._durationSeconds = maxOffset + 0.1; // small buffer past last tick
    this._frames = delayedTicks.map((d) => new LifengSkillEventFrame({ ...d.tick, OFFSET_SECONDS: d.offset }));
  }
  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly LifengSkillEventFrame[] { return this._frames; }
}

export const LIFENG_ULTIMATE_SEQUENCE: SkillEventSequence = new LifengUltimateMainSequence();
export const LIFENG_VAJRA_IMPACT_SEQUENCE: SkillEventSequence = new LifengVajraImpactSequence();
