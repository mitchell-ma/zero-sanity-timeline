import { SkillEventFrame } from "./skillEventFrame";

/** A sequence within a skill, containing ordered damage frames. */
export abstract class SkillEventSequence {
  /** Duration of this sequence in seconds. */
  abstract getDurationSeconds(): number;

  /** All damage frames in this sequence (ordered by offset). */
  abstract getFrames(): readonly SkillEventFrame[];

  /** Number of damage frames in this sequence. */
  getFrameCount(): number { return this.getFrames().length; }

  /** Get a specific frame by index (0-based). */
  getFrame(index: number): SkillEventFrame | undefined { return this.getFrames()[index]; }

  /** Total skill points recovered across all frames in this sequence. */
  getTotalSkillPointRecovery(): number {
    return this.getFrames().reduce((sum, f) => sum + f.getSkillPointRecovery(), 0);
  }

  /** Total stagger damage across all frames in this sequence. */
  getTotalStagger(): number {
    return this.getFrames().reduce((sum, f) => sum + f.getStagger(), 0);
  }

  /** Offset of the first damage frame, or 0 if no frames. */
  getFirstHitOffsetSeconds(): number {
    const frames = this.getFrames();
    return frames.length > 0 ? frames[0].getOffsetSeconds() : 0;
  }

  /** Offset of the last damage frame, or 0 if no frames. */
  getLastHitOffsetSeconds(): number {
    const frames = this.getFrames();
    return frames.length > 0 ? frames[frames.length - 1].getOffsetSeconds() : 0;
  }
}
