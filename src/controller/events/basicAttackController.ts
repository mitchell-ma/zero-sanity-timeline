import { SkillEventSequence } from "../../model/event-frames/skillEventSequence";
import { HitType } from "../../consts/enums";
import { EventFrameMarker, EventSegmentData } from "../../consts/viewTypes";
import { FPS } from "../../utils/timeline";

/** Convert skill event sequences into view-layer segment data. */
export class SkillSegmentBuilder {
  /**
   * Build segments + total duration from an array of skill sequences.
   * Returns the data needed to create a multi-sequence TimelineEvent.
   *
   * For multi-sequence events (basic attacks), segments are labeled N1, N2, ..., N5.
   * For single-sequence events (battle/combo skills), no label is added.
   * Custom labels can be provided via the `labels` option.
   */
  static buildSegments(
    sequences: readonly SkillEventSequence[],
    options?: { labels?: string[]; gaugeGain?: number; teamGaugeGain?: number },
  ): {
    totalDurationFrames: number;
    segments: EventSegmentData[];
  } {
    const isMulti = sequences.length > 1;
    const customLabels = options?.labels;
    let totalDurationFrames = 0;
    const segments: EventSegmentData[] = [];

    // Sum SP recovery across all sequences — only granted on final strike
    const allSequenceTotalSP = sequences.reduce((sum, seq) =>
      sum + seq.getFrames().reduce((s, f) => s + f.getSkillPointRecovery(), 0), 0);

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const durationFrames = Math.round(seq.getDurationSeconds() * FPS);
      const seqFrames = seq.getFrames();

      const frames = seqFrames.map((f) => {
        const marker: EventFrameMarker = {
          offsetFrame: Math.round(f.getOffsetSeconds() * FPS),
          skillPointRecovery: 0,
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
        const consume = f.getConsumeArtsInfliction();
        if (consume) marker.consumeArtsInfliction = { element: consume.element, stacks: consume.stacks };
        const forced = f.getApplyForcedReaction();
        if (forced) marker.applyForcedReaction = {
          reaction: forced.reaction,
          statusLevel: forced.statusLevel,
          ...(forced.durationFrames != null && { durationFrames: forced.durationFrames }),
        };
        const status = f.getApplyStatus();
        if (status) marker.applyStatus = { target: status.target, status: status.status, stacks: status.stacks, durationFrames: status.durationFrames, ...(status.susceptibility && { susceptibility: status.susceptibility }), ...(status.eventName && { eventName: status.eventName }) };
        const consumeStatus = f.getConsumeStatus();
        if (consumeStatus) marker.consumeStatus = consumeStatus;
        const dmgEl = f.getDamageElement();
        if (dmgEl) marker.damageElement = dmgEl;
        if (f.getDuplicatesSourceInfliction()) marker.duplicatesSourceInfliction = true;
        return marker;
      });

      // Mark the last frame of the final sequence as a final strike (basic attacks only)
      // SP recovery is granted only on the final strike
      if (isMulti && !customLabels && i === sequences.length - 1 && frames.length > 0) {
        const finalFrame = frames[frames.length - 1];
        finalFrame.hitType = HitType.FINAL_STRIKE;
        finalFrame.skillPointRecovery = allSequenceTotalSP;
        finalFrame.templateFinalStrikeSP = allSequenceTotalSP;
        finalFrame.templateFinalStrikeStagger = finalFrame.stagger ?? 0;
      }

      // Assign gauge gain to the first frame of the first segment
      if (i === 0 && frames.length > 0) {
        if (options?.gaugeGain) frames[0].gaugeGain = options.gaugeGain;
        if (options?.teamGaugeGain) frames[0].teamGaugeGain = options.teamGaugeGain;
      }

      const label = customLabels
        ? customLabels[i]
        : isMulti
          ? `${i + 1}`
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
