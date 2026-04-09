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

  add(ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {

    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `reaction-${this.columnId}-${genEventUid()}`;
    ev.id = this.columnId;
    ev.name = this.columnId;
    ev.ownerId = ownerId;
    ev.columnId = this.columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    ev.stacks = options?.stacks;
    ev.forcedReaction = options?.forcedReaction;

    const rawDur = durationFrames;
    setEventDuration(ev, this.host.extendDuration(ev.startFrame, rawDur));

    // ── Merge / refresh against active reactions ─────────────────────────
    const active = this.host.activeEventsIn(this.columnId, ownerId, frame)
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
        prev.eventStatusOwnerId = source.ownerId;
        prev.eventStatusSkillName = source.skillName;

        const prevStacks = prev.stacks ?? 1;
        const remainingOldDuration = prevEnd - ev.startFrame;

        // Corrosion-specific: carry forward reduction floor from elapsed damage
        if (prev.artsIntensity != null || prev.reductionFloor != null) {
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
        ev.stacks = Math.max(prevStacks, ev.stacks ?? 1);
      } else {
        // RESET/REFRESH: clamp older if new extends past
        const newEnd = ev.startFrame + eventDuration(ev);
        if (newEnd >= prevEnd) {
          setEventDuration(prev, ev.startFrame - prev.startFrame);
          prev.eventStatus = EventStatusType.REFRESHED;
          prev.eventStatusOwnerId = source.ownerId;
          prev.eventStatusSkillName = source.skillName;
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

  consume(ownerId: string, frame: number, source: EventSource,
    _options?: ConsumeOptions): number {
    const active = this.host.activeEventsIn(this.columnId, ownerId, frame);
    for (const ev of active) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return active.length;
  }

  canAdd(): boolean { return true; }

  canConsume(ownerId: string, frame: number): boolean {
    return this.host.activeCount(this.columnId, ownerId, frame) > 0;
  }
}
