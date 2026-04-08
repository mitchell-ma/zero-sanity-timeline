import { SkillEventSequence } from "../../model/event-frames/skillEventSequence";
import { EventFrameType, SegmentType, TimeDependency } from "../../consts/enums";
import { EventFrameMarker, EventSegmentData } from "../../consts/viewTypes";
import { FPS } from "../../utils/timeline";
import { formatSegmentShortName } from "../../dsl/semanticsTranslation";
import { NounType } from "../../dsl/semantics";
import type { ValueResolutionContext } from "../calculation/valueResolver";
import { findSkillPointRecoveryInClauses, findStaggerInClauses } from "../timeline/clauseQueries";

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
    options?: { labels?: string[]; delayedHitLabel?: string; ctx?: ValueResolutionContext; useNumeralFallback?: boolean },
  ): {
    totalDurationFrames: number;
    segments: EventSegmentData[];
  } {
    const isMulti = sequences.length > 1;
    const customLabels = options?.labels;
    let totalDurationFrames = 0;
    const segments: EventSegmentData[] = [];

    // Sum SP recovery across all sequences — only granted on final strike.
    // Source of truth is the parsed clauses on each frame.
    let allSequenceTotalSP = 0;
    for (const seq of sequences) {
      for (const f of seq.getFrames()) {
        const clauses = f.getClauses();
        const sp = findSkillPointRecoveryInClauses(clauses, options?.ctx);
        if (sp) allSequenceTotalSP += sp;
      }
    }

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const durationFrames = Math.round(seq.getDurationSecondsWithContext(options?.ctx) * FPS);
      const seqFrames = seq.getFrames();

      const frames = seqFrames.map((f) => {
        const marker: EventFrameMarker = {
          offsetFrame: Math.round(f.getOffsetSeconds() * FPS),
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
        const deps = f.getDependencyTypes();
        if (deps.length > 0) marker.dependencyTypes = [...deps];
        const fts = f.getFrameTypes();
        if (fts.length > 0) marker.frameTypes = [...fts];
        const sp = (f as { getSuppliedParameters?: () => Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> | undefined }).getSuppliedParameters?.();
        if (sp) marker.suppliedParameters = sp;
        return marker;
      });

      // Populate SP recovery and stagger templates on the final strike frame.
      // FINAL_STRIKE frameType is derived from PERFORM FINAL_STRIKE in the JSON config.
      // The active SP value is carried by the parsed RECOVER SKILL_POINT clause
      // already attached to the final frame from JSON; templateFinalStrikeSP is
      // a separate display cache used by the input clamp logic when the basic
      // attack chain is truncated and a different frame becomes the new final.
      if (isMulti && !customLabels && i === sequences.length - 1 && frames.length > 0) {
        const finalFrame = frames[frames.length - 1];
        if (finalFrame.frameTypes?.includes(EventFrameType.FINAL_STRIKE)) {
          finalFrame.templateFinalStrikeSP = allSequenceTotalSP;
          finalFrame.templateFinalStrikeStagger = findStaggerInClauses(finalFrame.clauses) ?? 0;
        }
      }

      // Mark all frames in Finisher / Dive segments with the appropriate hit type
      const segLabel = customLabels?.[i];
      if (segLabel === NounType.FINISHER && frames.length > 0) {
        for (const f of frames) f.frameTypes = [EventFrameType.FINISHER];
      } else if (segLabel === NounType.DIVE && frames.length > 0) {
        for (const f of frames) f.frameTypes = [EventFrameType.DIVE];
      }

      const seqName = 'segmentName' in seq ? (seq as SkillEventSequence & { segmentName?: string }).segmentName : undefined;
      const label = seqName
        ?? customLabels?.[i]
        ?? (isMulti && options?.useNumeralFallback
          ? formatSegmentShortName(undefined, i)
          : undefined);

      // Drop frames beyond the segment duration — they belong in a separate segment in the JSON.
      // Preserve all frames for runtime-conditional-duration segments (re-resolved during queue processing).
      const hasRuntimeDur = 'hasRuntimeConditionalDuration' in seq && (seq as { hasRuntimeConditionalDuration: () => boolean }).hasRuntimeConditionalDuration();
      const inBound = hasRuntimeDur ? frames : frames.filter(f => f.offsetFrame <= durationFrames);

      const seqRecord = seq as SkillEventSequence & { segmentElement?: string; segmentTypes?: string[]; timeDependency?: string; clause?: EventSegmentData['clause']; suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> };
      const segData: EventSegmentData = {
        properties: {
          duration: durationFrames,
          name: label,
          ...(seqRecord.segmentElement ? { element: seqRecord.segmentElement } : {}),
          ...(seqRecord.timeDependency ? { timeDependency: seqRecord.timeDependency as TimeDependency } : {}),
          ...(seqRecord.segmentTypes ? { segmentTypes: seqRecord.segmentTypes as SegmentType[] } : {}),
          ...(seqRecord.suppliedParameters ? { suppliedParameters: seqRecord.suppliedParameters } : {}),
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
