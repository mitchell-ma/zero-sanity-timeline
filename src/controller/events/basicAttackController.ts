import { SkillEventSequence } from "../../model/event-frames/skillEventSequence";
import { CombatSkillType, EventFrameType, SegmentType, TimeDependency } from "../../consts/enums";
import { EventFrameMarker, EventSegmentData } from "../../consts/viewTypes";
import { FPS } from "../../utils/timeline";
import { formatSegmentShortName } from "../../dsl/semanticsTranslation";
import type { ValueResolutionContext } from "../calculation/valueResolver";

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
    options?: { labels?: string[]; gaugeGain?: number; teamGaugeGain?: number; gaugeGainByEnemies?: Record<number, number>; delayedHitLabel?: string; ctx?: ValueResolutionContext; useNumeralFallback?: boolean },
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
      const durationFrames = Math.round(seq.getDurationSecondsWithContext(options?.ctx) * FPS);
      const seqFrames = seq.getFrames();

      const frames = seqFrames.map((f) => {
        const marker: EventFrameMarker = {
          offsetFrame: Math.round(f.getOffsetSeconds() * FPS),
          skillPointRecovery: 0,
          stagger: f.getStagger(),
        };
        const dmgEl = f.getDamageElement();
        if (dmgEl) marker.damageElement = dmgEl;
        if (f.getDuplicateTriggerSource()) marker.duplicateTriggerSource = true;
        const clauses = f.getClauses();
        if (clauses.length > 0) {
          marker.clauses = clauses;
          const ct = f.getClauseType();
          if (ct) marker.clauseType = ct;
        }
        const dd = f.getDealDamage();
        if (dd) marker.dealDamage = dd;
        const gg = f.getGaugeGain();
        if (gg) marker.gaugeGain = gg;
        const deps = f.getDependencyTypes();
        if (deps.length > 0) marker.dependencyTypes = [...deps];
        const fts = f.getFrameTypes();
        if (fts.length > 0) marker.frameTypes = [...fts];
        return marker;
      });

      // Populate SP recovery and stagger templates on the final strike frame.
      // FINAL_STRIKE frameType is derived from PERFORM FINAL_STRIKE in the JSON config.
      if (isMulti && !customLabels && i === sequences.length - 1 && frames.length > 0) {
        const finalFrame = frames[frames.length - 1];
        if (finalFrame.frameTypes?.includes(EventFrameType.FINAL_STRIKE)) {
          finalFrame.skillPointRecovery = allSequenceTotalSP;
          finalFrame.templateFinalStrikeSP = allSequenceTotalSP;
          finalFrame.templateFinalStrikeStagger = finalFrame.stagger ?? 0;
        }
      }

      // Mark all frames in Finisher / Dive segments with the appropriate hit type
      const segLabel = customLabels?.[i];
      if (segLabel === CombatSkillType.FINISHER && frames.length > 0) {
        for (const f of frames) f.frameTypes = [EventFrameType.FINISHER];
      } else if (segLabel === CombatSkillType.DIVE && frames.length > 0) {
        for (const f of frames) f.frameTypes = [EventFrameType.DIVE];
      }

      // Assign gauge gain to the first frame of the first segment
      if (i === 0 && frames.length > 0) {
        if (options?.gaugeGain) frames[0].gaugeGain = options.gaugeGain;
        if (options?.teamGaugeGain) frames[0].teamGaugeGain = options.teamGaugeGain;
        if (options?.gaugeGainByEnemies) frames[0].gaugeGainByEnemies = options.gaugeGainByEnemies;
      }

      const seqName = 'segmentName' in seq ? (seq as SkillEventSequence & { segmentName?: string }).segmentName : undefined;
      const label = seqName
        ?? customLabels?.[i]
        ?? (isMulti && options?.useNumeralFallback
          ? formatSegmentShortName(undefined, i)
          : undefined);

      // Drop frames beyond the segment duration — they belong in a separate segment in the JSON.
      const inBound = frames.filter(f => f.offsetFrame <= durationFrames);

      const seqRecord = seq as SkillEventSequence & { segmentElement?: string; segmentTypes?: string[]; timeDependency?: string; clause?: EventSegmentData['clause'] };
      const segData: EventSegmentData = {
        properties: {
          duration: durationFrames,
          name: label,
          ...(seqRecord.segmentElement ? { element: seqRecord.segmentElement } : {}),
          ...(seqRecord.timeDependency ? { timeDependency: seqRecord.timeDependency as TimeDependency } : {}),
          ...(seqRecord.segmentTypes ? { segmentTypes: seqRecord.segmentTypes as SegmentType[] } : {}),
        },
        frames: inBound.length > 0 ? inBound : undefined,
        ...(seqRecord.clause ? { clause: seqRecord.clause } : {}),
      };
      segments.push(segData);
      totalDurationFrames += durationFrames;
    }

    return { totalDurationFrames, segments };
  }
}
