/** A single damage tick within a skill sequence. */
export abstract class SkillEventFrame {
  /** Offset in seconds from the start of the parent sequence. */
  abstract getOffsetSeconds(): number;

  /** Skill points recovered on this frame. */
  abstract getSkillPointRecovery(): number;

  /** Stagger damage dealt on this frame. */
  abstract getStagger(): number;

  /** Whether this frame grants any skill points. */
  hasSkillPointRecovery(): boolean { return this.getSkillPointRecovery() > 0; }

  /** Whether this frame deals stagger damage. */
  hasStagger(): boolean { return this.getStagger() > 0; }
}
