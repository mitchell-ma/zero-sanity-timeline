import { StatusType, TargetType } from "../../consts/enums";
import { SkillEventFrame, FrameArtsInfliction, FrameApplyStatus } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const AKEK = skillsData.operators.AKEKURI;

// ── Concrete SkillEventFrame / SkillEventSequence for Akekuri ────────────────

class AkekuriSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _applyStatus: FrameApplyStatus | null;

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

    // Parse GRANT_STATUS (e.g. ultimate grants Squad Buff on self)
    const grant = tickData.GRANT_STATUS;
    this._applyStatus = grant
      ? { target: TargetType.SELF, status: grant.STATUS as StatusType, stacks: grant.STACKS, durationFrames: 0 }
      : null;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
  getApplyStatus(): FrameApplyStatus | null { return this._applyStatus; }
}

class AkekuriSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly AkekuriSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: AkekuriSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new AkekuriSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly AkekuriSkillEventFrame[] { return this._frames; }
}

// ── Sword of Aspiration (Basic Attack) ───────────────────────────────────────
//
// 4-sequence basic attack chain (sequence 5 is empty/unused).

export const AKEKURI_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4]
  .map((n) => {
    const key = `AKEKURI_BASIC_ATTACK_SEQUENCE_${n}`;
    return new AkekuriSkillEventSequence(
      (AKEK.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Burst of Passion (Battle Skill) ─────────────────────────────────────────

export const AKEKURI_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new AkekuriSkillEventSequence(
  AKEK.BATTLE_SKILL.AKEKURI_BATTLE_SKILL,
  'AKEKURI_BATTLE_SKILL',
);

// ── Flash and Dash (Combo Skill) ────────────────────────────────────────────

export const AKEKURI_COMBO_SKILL_SEQUENCE: SkillEventSequence = new AkekuriSkillEventSequence(
  AKEK.COMBO_SKILL.AKEKURI_COMBO_SKILL,
  'AKEKURI_COMBO_SKILL',
);

// ── Squad on Me (Ultimate) ──────────────────────────────────────────────────

export const AKEKURI_ULTIMATE_SEQUENCE: SkillEventSequence = new AkekuriSkillEventSequence(
  AKEK.ULTIMATE.AKEKURI_ULTIMATE,
  'AKEKURI_ULTIMATE',
);
