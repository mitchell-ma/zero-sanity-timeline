import { StatusType, TargetType } from "../../consts/enums";
import { SkillEventFrame, FrameArtsInfliction, FrameApplyStatus } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.AVYWENNA;

class AvywennaSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _applyStatus: FrameApplyStatus | null;
  private readonly _consumeStatus: string | null;

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

    // Parse GRANT_STATUS (e.g. final strike grants Thunderlance on self)
    const grant = tickData.GRANT_STATUS;
    this._applyStatus = grant
      ? { target: TargetType.SELF, status: grant.STATUS as StatusType, stacks: grant.STACKS, durationFrames: 0 }
      : null;

    // Parse CONSUME_STATUS (e.g. ultimate consumes Thunderlances)
    const consume = tickData.CONSUME_STATUS;
    this._consumeStatus = consume ? consume.STATUS : null;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
  getApplyStatus(): FrameApplyStatus | null { return this._applyStatus; }
  getConsumeStatus(): string | null { return this._consumeStatus; }
}

class AvywennaSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly AvywennaSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: AvywennaSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new AvywennaSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly AvywennaSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const AVYWENNA_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4, 5]
  .map((n) => {
    const key = `AVYWENNA_BASIC_ATTACK_SEQUENCE_${n}`;
    return new AvywennaSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
export const AVYWENNA_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new AvywennaSkillEventSequence(
  OP.BATTLE_SKILL.AVYWENNA_BATTLE_SKILL,
  'AVYWENNA_BATTLE_SKILL',
);

// ── Combo Skill ─────────────────────────────────────────────────────────────
export const AVYWENNA_COMBO_SKILL_SEQUENCE: SkillEventSequence = new AvywennaSkillEventSequence(
  OP.COMBO_SKILL.AVYWENNA_COMBO_SKILL,
  'AVYWENNA_COMBO_SKILL',
);

// ── Ultimate ────────────────────────────────────────────────────────────────
export const AVYWENNA_ULTIMATE_SEQUENCE: SkillEventSequence = new AvywennaSkillEventSequence(
  OP.ULTIMATE.AVYWENNA_ULTIMATE,
  'AVYWENNA_ULTIMATE',
);
