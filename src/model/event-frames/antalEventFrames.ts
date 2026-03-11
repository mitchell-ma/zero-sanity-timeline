import { StatusType, TargetType } from "../../consts/enums";
import { FrameApplyStatus, FrameArtsInfliction, SkillEventFrame } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.ANTAL;

/** Duration of Focus status in frames (60s at 120fps). */
const FOCUS_DURATION_FRAMES = 7200;

/** Per-level susceptibility bonus applied by Focus (same for electric & heat). */
const FOCUS_SUSCEPTIBILITY = [
  0.05, 0.05, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.08, 0.09, 0.09, 0.10,
] as const;

class AntalSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyStatus: FrameApplyStatus | null;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _duplicatesSourceInfliction: boolean;

  constructor(tickData: Record<string, any>, opts?: { applyStatus?: FrameApplyStatus; duplicatesSourceInfliction?: boolean }) {
    super();
    this._offsetSeconds = tickData.OFFSET_SECONDS;
    this._skillPointRecovery = tickData.SKILL_POINT_RECOVERY;
    this._stagger = tickData.STAGGER;
    this._applyStatus = opts?.applyStatus ?? null;
    this._duplicatesSourceInfliction = opts?.duplicatesSourceInfliction ?? false;

    // Parse APPLY_ARTS_INFLICTION
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
  getApplyStatus(): FrameApplyStatus | null { return this._applyStatus; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
  getDuplicatesSourceInfliction(): boolean { return this._duplicatesSourceInfliction; }
}

class AntalSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly AntalSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: AntalSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new AntalSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly AntalSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const ANTAL_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4, 5]
  .map((n) => {
    const key = `ANTAL_BASIC_ATTACK_SEQUENCE_${n}`;
    return new AntalSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
// Battle skill applies Focus to the enemy on the first hit
class AntalBattleSkillSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly AntalSkillEventFrame[];

  constructor() {
    super();
    const seqData = OP.BATTLE_SKILL.ANTAL_BATTLE_SKILL as Record<string, any>;
    const prefix = 'ANTAL_BATTLE_SKILL';
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: AntalSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) {
        // First tick applies Focus to the enemy
        const applyStatus = i === 1
          ? {
              target: TargetType.ENEMY, status: StatusType.SUSCEPTIBILITY, stacks: 1,
              durationFrames: FOCUS_DURATION_FRAMES,
              susceptibility: { electric: FOCUS_SUSCEPTIBILITY, heat: FOCUS_SUSCEPTIBILITY },
              eventName: StatusType.FOCUS,
            }
          : undefined;
        frames.push(new AntalSkillEventFrame(tick, applyStatus ? { applyStatus } : undefined));
      }
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly AntalSkillEventFrame[] { return this._frames; }
}

export const ANTAL_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new AntalBattleSkillSequence();

// ── Combo Skill ─────────────────────────────────────────────────────────────
// Antal's combo duplicates the source infliction that triggered it
class AntalComboSkillSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly AntalSkillEventFrame[];

  constructor() {
    super();
    const seqData = OP.COMBO_SKILL.ANTAL_COMBO_SKILL as Record<string, any>;
    const prefix = 'ANTAL_COMBO_SKILL';
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: AntalSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new AntalSkillEventFrame(tick, { duplicatesSourceInfliction: true }));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly AntalSkillEventFrame[] { return this._frames; }
}

export const ANTAL_COMBO_SKILL_SEQUENCE: SkillEventSequence = new AntalComboSkillSequence();
