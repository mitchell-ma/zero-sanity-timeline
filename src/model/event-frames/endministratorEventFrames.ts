import { SkillEventFrame, FrameArtsInfliction } from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";
import skillsData from "../game-data/skills.json";

const OP = skillsData.operators.ENDMINISTRATOR;

class EndministratorSkillEventFrame extends SkillEventFrame {
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

class EndministratorSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly EndministratorSkillEventFrame[];

  constructor(seqData: Record<string, any>, prefix: string) {
    super();
    this._durationSeconds = seqData[`${prefix}_DURATION`];
    const tickCount: number = seqData[`${prefix}_TICKS`];
    const frames: EndministratorSkillEventFrame[] = [];
    for (let i = 1; i <= tickCount; i++) {
      const tick = seqData[`${prefix}_TICK_${i}`];
      if (tick) frames.push(new EndministratorSkillEventFrame(tick));
    }
    this._frames = frames;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly EndministratorSkillEventFrame[] { return this._frames; }
}

// ── Basic Attack ────────────────────────────────────────────────────────────
export const ENDMINISTRATOR_BASIC_ATTACK_SEQUENCES: readonly SkillEventSequence[] = [1, 2, 3, 4, 5]
  .map((n) => {
    const key = `ENDMINISTRATOR_BASIC_ATTACK_SEQUENCE_${n}`;
    return new EndministratorSkillEventSequence(
      (OP.BASIC_ATTACK as Record<string, any>)[key],
      key,
    );
  })
  .filter((seq) => seq.getDurationSeconds() > 0);

// ── Battle Skill ────────────────────────────────────────────────────────────
export const ENDMINISTRATOR_BATTLE_SKILL_SEQUENCE: SkillEventSequence = new EndministratorSkillEventSequence(
  OP.BATTLE_SKILL.ENDMINISTRATOR_BATTLE_SKILL,
  'ENDMINISTRATOR_BATTLE_SKILL',
);

// ── Combo Skill ─────────────────────────────────────────────────────────────
export const ENDMINISTRATOR_COMBO_SKILL_SEQUENCE: SkillEventSequence = new EndministratorSkillEventSequence(
  OP.COMBO_SKILL.ENDMINISTRATOR_COMBO_SKILL,
  'ENDMINISTRATOR_COMBO_SKILL',
);
