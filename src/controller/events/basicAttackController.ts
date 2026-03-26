import { SkillEventSequence } from "../../model/event-frames/skillEventSequence";
import { EventFrameType, SegmentType, TimeDependency } from "../../consts/enums";
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
    options?: { labels?: string[]; gaugeGain?: number; teamGaugeGain?: number; gaugeGainByEnemies?: Record<number, number>; delayedHitLabel?: string; ctx?: ValueResolutionContext },
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
          stacks: forced.stacks,
          ...(forced.durationFrames != null && { durationFrames: forced.durationFrames }),
        };
        const statuses = f.getApplyStatuses();
        if (statuses.length > 0) {
          const mapStatus = (s: typeof statuses[number]) => ({
            target: s.target, status: s.status, stacks: s.stacks, durationFrames: s.durationFrames,
            ...(s.susceptibility && { susceptibility: s.susceptibility }),
            ...(s.stackingInteraction && { stackingInteraction: s.stackingInteraction }),
            ...(s.potentialMin != null && { potentialMin: s.potentialMin }),
            ...(s.potentialMax != null && { potentialMax: s.potentialMax }),
            ...(s.segments && { segments: s.segments }),
            ...(s.eventName && { eventName: s.eventName }),
          });
          marker.applyStatus = mapStatus(statuses[0]);
          if (statuses.length > 1) marker.applyStatuses = statuses.map(mapStatus);
        }
        const consumeReaction = f.getConsumeReaction();
        if (consumeReaction) marker.consumeReaction = { columnId: consumeReaction.columnId, ...(consumeReaction.applyStatus && { applyStatus: { target: consumeReaction.applyStatus.target, status: consumeReaction.applyStatus.status, stacks: consumeReaction.applyStatus.stacks, durationFrames: consumeReaction.applyStatus.durationFrames, ...(consumeReaction.applyStatus.susceptibility && { susceptibility: consumeReaction.applyStatus.susceptibility }), ...(consumeReaction.applyStatus.eventName && { eventName: consumeReaction.applyStatus.eventName }) } }) };
        const consumeStatus = f.getConsumeStatus();
        if (consumeStatus) marker.consumeStatus = consumeStatus;
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

      // Mark the last frame of the final sequence as a final strike (basic attacks only)
      // SP recovery is granted only on the final strike
      if (isMulti && !customLabels && i === sequences.length - 1 && frames.length > 0) {
        const finalFrame = frames[frames.length - 1];
        if (!finalFrame.frameTypes?.includes(EventFrameType.FINAL_STRIKE)) {
          finalFrame.frameTypes = [EventFrameType.FINAL_STRIKE];
        }
        finalFrame.skillPointRecovery = allSequenceTotalSP;
        finalFrame.templateFinalStrikeSP = allSequenceTotalSP;
        finalFrame.templateFinalStrikeStagger = finalFrame.stagger ?? 0;
      }

      // Mark all frames in Finisher / Dive segments with the appropriate hit type
      const segLabel = customLabels?.[i];
      if (segLabel === 'Finisher' && frames.length > 0) {
        for (const f of frames) f.frameTypes = [EventFrameType.FINISHER];
      } else if (segLabel === 'Dive' && frames.length > 0) {
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
        ?? (customLabels
          ? customLabels[i]
          : isMulti
            ? formatSegmentShortName(undefined, i)
            : undefined);

      // Split out-of-bound frames into an implied trailing segment.
      // Some skills (e.g. delayed explosions) have frames beyond the segment duration.
      const inBound = frames.filter(f => f.offsetFrame <= durationFrames);
      const outOfBound = frames.filter(f => f.offsetFrame > durationFrames);

      const seqRecord = seq as SkillEventSequence & { segmentTypes?: string[]; timeDependency?: string; clause?: EventSegmentData['clause'] };
      const segData: EventSegmentData = {
        properties: {
          duration: durationFrames,
          name: label,
          ...(seqRecord.timeDependency ? { timeDependency: seqRecord.timeDependency as TimeDependency } : {}),
          ...(seqRecord.segmentTypes ? { segmentTypes: seqRecord.segmentTypes as SegmentType[] } : {}),
        },
        frames: inBound.length > 0 ? inBound : undefined,
        ...(seqRecord.clause ? { clause: seqRecord.clause } : {}),
      };
      segments.push(segData);
      totalDurationFrames += durationFrames;

      if (outOfBound.length > 0) {
        // Re-base offsets relative to the new segment's start (= end of the parent segment)
        const rebased = outOfBound.map(f => ({ ...f, offsetFrame: f.offsetFrame - durationFrames }));
        const impliedDuration = Math.max(...rebased.map(f => f.offsetFrame)) + 1;
        const seqDelayLabel = 'delayedHitLabel' in seq ? (seq as SkillEventSequence & { delayedHitLabel?: string }).delayedHitLabel : undefined;
        segments.push({
          properties: { duration: impliedDuration, name: seqDelayLabel ?? options?.delayedHitLabel ?? 'Delay' },
          frames: rebased,
        });
        totalDurationFrames += impliedDuration;
      }
    }

    return { totalDurationFrames, segments };
  }
}
