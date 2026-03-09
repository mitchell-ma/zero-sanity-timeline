import { SkillEventFrame, FrameArtsInfliction } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.DAPAN;

class DaPanSkillEventFrame extends SkillEventFrame {
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

class DaPanSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly DaPanSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: DaPanSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new DaPanSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly DaPanSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const DAPAN_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4]
  .map((n) => {
    const key = `DAPAN_BASIC_ATTACK_SEQUENCE_${n}`;
    return new DaPanSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
export const DAPAN_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new DaPanSkillEventSequence(
  OP.BATTLE_SKILL.DAPAN_BATTLE_SKILL,
  'DAPAN_BATTLE_SKILL',
);

// ── Combo Skill ─────────────────────────────────────────────────────────────
export const DAPAN_COMBO_SKILL_SEQUENCE: SkillEventSequence = new DaPanSkillEventSequence(
  OP.COMBO_SKILL.DAPAN_COMBO_SKILL,
  'DAPAN_COMBO_SKILL',
);
