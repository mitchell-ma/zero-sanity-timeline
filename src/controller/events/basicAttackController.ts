import { SkillEventSequence } from "../../model/event-frames/skillEventSequence";
import { EventSegmentData } from "../../consts/viewTypes";
import { FPS } from "../../utils/timeline";

/** Convert skill event sequences into view-layer segment data for a basic attack event. */
export class BasicAttackController {
  /**
   * Build segments + total duration from an array of skill sequences.
   * Returns the data needed to create a multi-sequence TimelineEvent.
   */
  static buildSegments(sequences: readonly SkillEventSequence[]): {
    totalDurationFrames: number;
    segments: EventSegmentData[];
  } {
    let totalDurationFrames = 0;
    const segments: EventSegmentData[] = [];

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const durationFrames = Math.round(seq.getDurationSeconds() * FPS);
      const frames = seq.getFrames().map((f) => ({
        offsetFrame: Math.round(f.getOffsetSeconds() * FPS),
        skillPointRecovery: f.getSkillPointRecovery(),
        stagger: f.getStagger(),
      }));

      segments.push({
        durationFrames,
        label: i === sequences.length - 1 ? 'Final Strike' : `N${i + 1}`,
        frames: frames.length > 0 ? frames : undefined,
      });

      totalDurationFrames += durationFrames;
    }

    return { totalDurationFrames, segments };
  }
}
