import { StatusType } from "../../consts/enums";

/** Arts infliction applied by a frame tick. */
export interface FrameArtsInfliction {
  element: string;       // e.g. "HEAT", "CRYO"
  stacks: number;
}

/** Arts infliction absorbed by a frame tick (e.g. Scorching Heart). */
export interface FrameArtsAbsorption {
  element: string;       // e.g. "HEAT"
  stacks: number;        // max stacks absorbed
  exchangeStatus: StatusType;  // what the absorbed stacks convert into
  ratio: string;         // e.g. "1:1"
}

/** Forced arts reaction applied by a frame tick (bypasses infliction stacks). */
export interface FrameForcedReaction {
  reaction: StatusType;  // e.g. COMBUSTION
  statusLevel: number;   // reaction intensity level
}

/** A single damage tick within a skill sequence. */
export abstract class SkillEventFrame {
  /** Offset in seconds from the start of the parent sequence. */
  abstract getOffsetSeconds(): number;

  /** Skill points recovered on this frame. */
  abstract getSkillPointRecovery(): number;

  /** Stagger damage dealt on this frame. */
  abstract getStagger(): number;

  /** Arts infliction applied by this frame, or null. */
  getApplyArtsInfliction(): FrameArtsInfliction | null { return null; }

  /** Arts infliction absorbed by this frame, or null. */
  getAbsorbArtsInfliction(): FrameArtsAbsorption | null { return null; }

  /** Forced arts reaction applied by this frame, or null. */
  getApplyForcedReaction(): FrameForcedReaction | null { return null; }

  /** Whether this frame grants any skill points. */
  hasSkillPointRecovery(): boolean { return this.getSkillPointRecovery() > 0; }

  /** Whether this frame deals stagger damage. */
  hasStagger(): boolean { return this.getStagger() > 0; }
}
