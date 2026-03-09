import { SkillEventSequence } from "../../model/event-frames/skillEventSequence";
import { EventFrameMarker, EventSegmentData } from "../../consts/viewTypes";
import { FPS } from "../../utils/timeline";

/** Convert skill event sequences into view-layer segment data. */
export class SkillSegmentBuilder {
  /**
   * Build segments + total duration from an array of skill sequences.
   * Returns the data needed to create a multi-sequence TimelineEvent.
   *
   * For multi-sequence events (basic attacks), segments are labeled N1, N2, ..., Final Strike.
   * For single-sequence events (battle/combo skills), no label is added.
   * Custom labels can be provided via the `labels` option.
   */
  static buildSegments(
    sequences: readonly SkillEventSequence[],
    options?: { labels?: string[] },
  ): {
    totalDurationFrames: number;
    segments: EventSegmentData[];
  } {
    const isMulti = sequences.length > 1;
    const customLabels = options?.labels;
    let totalDurationFrames = 0;
    const segments: EventSegmentData[] = [];

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const durationFrames = Math.round(seq.getDurationSeconds() * FPS);
      const frames = seq.getFrames().map((f) => {
        const marker: EventFrameMarker = {
          offsetFrame: Math.round(f.getOffsetSeconds() * FPS),
          skillPointRecovery: f.getSkillPointRecovery(),
          stagger: f.getStagger(),
        };
        const apply = f.getApplyArtsInfliction();
        if (apply) marker.applyArtsInfliction = { element: apply.element, stacks: apply.stacks };
        const absorb = f.getAbsorbArtsInfliction();
        if (absorb) marker.absorbArtsInfliction = {
          element: absorb.element,
          stacks: absorb.stacks,
          exchangeStatus: absorb.exchangeStatus,
          ratio: absorb.ratio,
        };
        return marker;
      });

      const label = customLabels
        ? customLabels[i]
        : isMulti
          ? (i === sequences.length - 1 ? 'Final Strike' : `N${i + 1}`)
          : undefined;

      segments.push({
        durationFrames,
        label,
        frames: frames.length > 0 ? frames : undefined,
      });

      totalDurationFrames += durationFrames;
    }

    return { totalDurationFrames, segments };
  }
}

/** @deprecated Use SkillSegmentBuilder instead. */
export const BasicAttackController = SkillSegmentBuilder;
