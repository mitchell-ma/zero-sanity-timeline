/**
 * ReactionColumn — MERGE reactions (corrosion carries reduction floor, others refresh).
 * Config-driven: interaction type from JSON config determines merge vs refresh behavior.
 */

import { EventStatusType, StackInteractionType } from '../../../consts/enums';
import { REACTION_COLUMNS } from '../../../model/channels';
import type { StatusLevel } from '../../../consts/types';
import { eventDuration, setEventDuration } from '../../../consts/viewTypes';
import { FPS } from '../../../utils/timeline';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../../model/calculation/damageFormulas';
import { buildReactionSegment, buildCorrosionSegments } from '../processInfliction';
import { getStatusById } from '../../gameDataStore';
import { allocDerivedEvent } from '../objectPool';
import { genEventUid } from '../inputEventController';
import type { EventColumn, ColumnHost, EventSource, AddOptions, ConsumeOptions } from './eventColumn';

export class ReactionColumn implements EventColumn {
  readonly columnId: string;
  private host: ColumnHost;
  private interactionType: string;

  constructor(columnId: string, host: ColumnHost) {
    this.columnId = columnId;
    this.host = host;
    const config = getStatusById(columnId);
    this.interactionType = config?.stacks?.interactionType as string ?? StackInteractionType.MERGE;
  }

  add(ownerEntityId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {

    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `reaction-${this.columnId}-${genEventUid()}`;
    ev.id = this.columnId;
    ev.name = this.columnId;
    ev.ownerEntityId = ownerEntityId;
    ev.columnId = this.columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceEntityId = source.ownerEntityId;
    ev.sourceSkillId = source.skillName;
    ev.statusLevel = options?.statusLevel;
    ev.isForced = options?.isForced;
    if (options?.event) Object.assign(ev, options.event);

    const rawDur = durationFrames;
    setEventDuration(ev, this.host.extendDuration(ev.startFrame, rawDur));

    // ── Merge / refresh against active reactions ─────────────────────────
    const active = this.host.activeEventsIn(this.columnId, ownerEntityId, frame)
      .filter(r =>
        r.eventStatus !== EventStatusType.CONSUMED &&
        r.eventStatus !== EventStatusType.REFRESHED
      );

    if (active.length > 0) {
      const prev = active[active.length - 1];
      const prevEnd = prev.startFrame + eventDuration(prev);

      if (this.interactionType === StackInteractionType.MERGE) {
        // MERGE: max stacks, max duration, carry stats (corrosion carries reduction floor)
        setEventDuration(prev, ev.startFrame - prev.startFrame);
        prev.eventStatus = EventStatusType.REFRESHED;
        if (source.sourceEventUid) this.host.linkTransition(prev.uid, source.sourceEventUid);
        // Fire any pending APPLY STAT reversals whose scheduled frame is past
        // the clamp. Without this, the previous corrosion's already-fired
        // segment APPLYs (e.g. its current max-hold +0.12 with reverse
        // scheduled at the original end frame) would leak into the merged
        // event's lifetime and double-stack on the resistance accumulator.
        this.host.clampStatReversalsForColumn(this.columnId, ownerEntityId, ev.startFrame);

        const prevStacks = prev.statusLevel ?? 1;
        const remainingOldDuration = prevEnd - ev.startFrame;

        // Corrosion-specific: carry forward the previous corrosion's current
        // reduction value as the new event's reductionFloor. Every segment's
        // reduction = max(floor, segment_natural_value), so the merged event
        // never dips below where the previous one had already ramped to.
        // Applies to all corrosion merges — even when the previous corrosion
        // has no prior reductionFloor or artsIntensity (a fresh corrosion
        // ramping naturally).
        if (this.columnId === REACTION_COLUMNS.CORROSION) {
          const elapsedSeconds = (ev.startFrame - prev.startFrame) / FPS;
          const oldReductionFloor = prev.reductionFloor ?? 0;
          const oldArtsIntensity = prev.artsIntensity ?? 0;
          const oldBaseReduction = getCorrosionBaseReduction(
            Math.min(prevStacks, 4) as StatusLevel,
            elapsedSeconds,
          ) * getCorrosionReductionMultiplier(oldArtsIntensity);
          ev.reductionFloor = Math.max(oldReductionFloor, oldBaseReduction);
        }

        setEventDuration(ev, Math.max(remainingOldDuration, eventDuration(ev)));
        ev.statusLevel = Math.max(prevStacks, ev.statusLevel ?? 1) as StatusLevel;
      } else {
        // RESET/REFRESH: clamp older if new extends past
        const newEnd = ev.startFrame + eventDuration(ev);
        if (newEnd >= prevEnd) {
          setEventDuration(prev, ev.startFrame - prev.startFrame);
          prev.eventStatus = EventStatusType.REFRESHED;
          if (source.sourceEventUid) this.host.linkTransition(prev.uid, source.sourceEventUid);
        }
      }
    }

    // ── Build reaction segments ──────────────────────────────────────────
    const hasPerSecondSegments = this.interactionType === StackInteractionType.MERGE
      && (ev.reductionFloor != null || ev.artsIntensity != null || this.columnId === REACTION_COLUMNS.CORROSION);
    if (hasPerSecondSegments) {
      const segs = buildCorrosionSegments(ev);
      if (segs) ev.segments = segs;
    } else {
      const fStops = this.host.foreignStopsFor(ev);
      const seg = buildReactionSegment(ev, rawDur, fStops);
      if (seg) ev.segments = [seg];
    }

    this.host.trackRawDuration(ev.uid, rawDur);
    this.host.pushEventDirect(ev);
    if (options?.parents && options.parents.length > 0) {
      this.host.linkCausality(ev.uid, options.parents);
    }
    return true;
  }

  consume(ownerEntityId: string, frame: number, source: EventSource,
    _options?: ConsumeOptions): number {
    const active = this.host.activeEventsIn(this.columnId, ownerEntityId, frame);
    for (const ev of active) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      if (source.sourceEventUid) this.host.linkTransition(ev.uid, source.sourceEventUid);
    }
    return active.length;
  }

  canAdd(): boolean { return true; }

  canConsume(ownerEntityId: string, frame: number): boolean {
    return this.host.activeCount(this.columnId, ownerEntityId, frame) > 0;
  }
}
