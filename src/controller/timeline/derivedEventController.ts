/**
 * DerivedEventController — owns all derived events with domain controller methods.
 *
 * Owns the full event lifecycle: registration (with
 * combo chaining and time-stop discovery), duration extension, potential effects,
 * combo trigger resolution, frame position caching, and validation.
 *
 * Domain controllers handle creation/consumption logic:
 * - createInfliction: deque stacking (cap 4), cross-element reaction trigger
 * - createReaction: corrosion merge (max stats, extend duration), non-corrosion refresh
 * - createStatus: stacking behavior (RESET, MERGE), exchange cap, time-stop extension
 * - consumeInfliction: absorb oldest N active
 * - consumeReaction: clamp active reaction
 * - consumeStatus: clamp active in column
 *
 * No external bulk passes — all processing is internal to DerivedEventController methods.
 */
import { TimelineEvent, EventSegmentData, computeSegmentsSpan, getAnimationDuration, eventDuration, setEventDuration } from '../../consts/viewTypes';
import { EventStatusType, SegmentType, TimeDependency } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from './processTimeStop';
import { buildReactionSegment, buildCorrosionSegments, mergeReactions, attachReactionFrames } from './processInfliction';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, REACTION_COLUMNS, REACTION_COLUMN_IDS, REACTION_DURATION, SKILL_COLUMNS } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { StatusLevel } from '../../consts/types';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import { MAX_INFLICTION_STACKS } from './eventQueueTypes';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../../model/event-frames/operatorJsonLoader';
import type { TriggerAssociation } from '../gameDataController';

/** Source metadata for event mutations. */
interface EventSource {
  ownerId: string;
  skillName: string;
}

export class DerivedEventController {
  private stacks = new Map<string, TimelineEvent[]>();
  private registeredEvents: TimelineEvent[] = [];
  private stops: TimeStopRegion[] = [];
  private registeredStopIds = new Set<string>();
  private rawDurations = new Map<string, number>();
  private extendedIds = new Set<string>();
  private comboStops: { id: string; startFrame: number; animDur: number }[] = [];
  readonly output: TimelineEvent[] = [];
  private idCounter = 0;
  private triggerAssociations: TriggerAssociation[];
  private slotWirings: SlotTriggerWiring[] = [];

  constructor(baseEvents?: TimelineEvent[], triggerAssociations?: TriggerAssociation[], slotWirings?: SlotTriggerWiring[]) {
    this.triggerAssociations = triggerAssociations ?? [];
    this.slotWirings = slotWirings ?? [];
    if (baseEvents) {
      this.registeredEvents = baseEvents;
      for (const ev of baseEvents) {
        this.maybeRegisterStop(ev);
      }
    }
  }

  private key(columnId: string, ownerId: string) {
    return `${columnId}:${ownerId}`;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register events with inline combo chaining, time-stop discovery, and
   * time-stop extension. Two internal passes per batch:
   *   1. Combo chaining + reaction segments + stop discovery + push
   *   2. Extend newly-registered events by the now-complete stops list
   * No separate extendAll() call needed.
   */
  registerEvents(events: TimelineEvent[]) {
    const startIdx = this.registeredEvents.length;

    // Pass 1: combo chaining, reaction segments, stop discovery
    for (let i = 0; i < events.length; i++) {
      let ev = events[i];

      // Combo chaining: truncate overlapping combo animations
      if (ev.columnId === SKILL_COLUMNS.COMBO && getAnimationDuration(ev) > 0) {
        ev = this.handleComboChaining(ev);
      }

      // Auto-build reaction segments for freeform reaction events
      if (REACTION_COLUMN_IDS.has(ev.columnId)) {
        if (ev.columnId === REACTION_COLUMNS.CORROSION) {
          const segs = buildCorrosionSegments(ev);
          if (segs) ev = { ...ev, segments: segs };
        } else {
          const seg = buildReactionSegment(ev);
          if (seg) ev = { ...ev, segments: [seg] };
        }
      }

      this.maybeRegisterStop(ev);
      this.registeredEvents.push(ev);
    }

    // Pass 2: per-event extension, frame positions, and validation
    for (let i = startIdx; i < this.registeredEvents.length; i++) {
      let ev = this.registeredEvents[i];
      if (this.stops.length > 0 && !this.extendedIds.has(ev.id)) {
        ev = this.extendSingleEvent(ev);
      }
      ev = this.computeFramePositions(ev);
      ev = this.validateTimeStopStart(ev);
      this.registeredEvents[i] = ev;
    }

    // Pass 3: resolve combo trigger columns (needs full event list + stops)
    if (this.slotWirings.length > 0) {
      this.resolveComboTriggersInline();
    }
  }

  /**
   * Resolve combo trigger columns inline during registration.
   * For each slot wiring, evaluate trigger clauses against all registered events,
   * then set comboTriggerColumnId on combo events that fall within trigger windows.
   */
  private resolveComboTriggersInline() {
    type WindowInfo = { startFrame: number; endFrame: number; sourceColumnId?: string };
    const mergedBySlot = new Map<string, WindowInfo[]>();

    for (const wiring of this.slotWirings) {
      const clause = getComboTriggerClause(wiring.operatorId);
      if (!clause?.length) continue;
      const info = getComboTriggerInfo(wiring.operatorId);
      const baseDuration = info?.windowFrames ?? 720;
      const matches = findClauseTriggerMatches(clause, this.registeredEvents, wiring.slotId, this.stops);
      const windows: WindowInfo[] = [];
      for (const match of matches) {
        const extDuration = extendByTimeStops(match.frame, baseDuration, this.stops);
        windows.push({ startFrame: match.frame, endFrame: match.frame + extDuration, sourceColumnId: match.sourceColumnId });
      }
      // Merge overlapping windows
      windows.sort((a, b) => a.startFrame - b.startFrame);
      const merged: WindowInfo[] = [];
      for (const w of windows) {
        const prev = merged.length > 0 ? merged[merged.length - 1] : null;
        if (prev && w.startFrame <= prev.endFrame) {
          prev.endFrame = Math.max(prev.endFrame, w.endFrame);
        } else {
          merged.push({ ...w });
        }
      }
      mergedBySlot.set(wiring.slotId, merged);
    }

    if (mergedBySlot.size === 0) return;

    // Update combo events that fall within trigger windows
    for (let i = 0; i < this.registeredEvents.length; i++) {
      const ev = this.registeredEvents[i];
      if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
      const merged = mergedBySlot.get(ev.ownerId);
      const match = merged?.find(w => ev.startFrame >= w.startFrame && ev.startFrame < w.endFrame);
      if (match?.sourceColumnId != null && match.sourceColumnId !== ev.comboTriggerColumnId) {
        this.registeredEvents[i] = { ...ev, comboTriggerColumnId: match.sourceColumnId };
      } else if (!match && ev.comboTriggerColumnId != null) {
        this.registeredEvents[i] = { ...ev, comboTriggerColumnId: undefined };
      }
    }
  }

  /**
   * Compute absoluteFrame and derivedOffsetFrame on a single event's frame markers.
   * Called per-event during registration (inline, not as a bulk pass).
   */
  private computeFramePositions(ev: TimelineEvent): TimelineEvent {
    const fStops = this.foreignStopsFor(ev);
    let hasFrames = false;
    for (const seg of ev.segments) {
      if (seg.frames && seg.frames.length > 0) { hasFrames = true; break; }
    }
    if (!hasFrames) return ev;

    let cumulativeOffset = 0;
    const newSegments = ev.segments.map(seg => {
      const segStart = cumulativeOffset;
      cumulativeOffset += seg.properties.duration;
      if (!seg.frames) return seg;
      const segAbsStart = ev.startFrame + segStart;
      if (this.stops.length === 0) {
        return {
          ...seg,
          frames: seg.frames.map(f => ({
            ...f,
            derivedOffsetFrame: f.offsetFrame,
            absoluteFrame: segAbsStart + f.offsetFrame,
          })),
        };
      }
      return {
        ...seg,
        frames: seg.frames.map(f => {
          const extOffset = extendByTimeStops(segAbsStart, f.offsetFrame, fStops);
          return { ...f, derivedOffsetFrame: extOffset, absoluteFrame: segAbsStart + extOffset };
        }),
      };
    });
    return { ...ev, segments: newSegments };
  }


  /**
   * Validate sibling overlap: events in the same column must not overlap.
   * Attaches warnings (read-only annotation, not bulk transformation).
   * Time-stop start validation is handled inline during registerEvents().
   */
  validateAll() {
    const byKey = new Map<string, TimelineEvent[]>();
    for (const ev of this.registeredEvents) {
      const k = `${ev.ownerId}:${ev.columnId}:${ev.name}`;
      const arr = byKey.get(k) ?? [];
      arr.push(ev);
      byKey.set(k, arr);
    }

    const overlapIds = new Set<string>();
    for (const group of Array.from(byKey.values())) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);
      for (let i = 0; i < sorted.length - 1; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];
        const curRange = computeSegmentsSpan(cur.segments);
        if (curRange > 0 && cur.startFrame + curRange > next.startFrame) {
          overlapIds.add(cur.id);
          overlapIds.add(next.id);
        }
      }
    }

    if (overlapIds.size > 0) {
      this.registeredEvents = this.registeredEvents.map(ev => {
        if (!overlapIds.has(ev.id)) return ev;
        return { ...ev, warnings: [...(ev.warnings ?? []), 'Overlaps with another event in the same column'] };
      });
    }
  }

  /** Get all registered events (extended, with transforms applied). */
  getRegisteredEvents(): TimelineEvent[] {
    return this.registeredEvents;
  }

  /** Get slot wirings (for combo window derivation). */
  getSlotWirings(): SlotTriggerWiring[] {
    return this.slotWirings;
  }

  /** Get discovered time-stop regions. */
  getStops(): readonly TimeStopRegion[] {
    return this.stops;
  }

  /** Update comboTriggerColumnId on a registered combo event (deferred resolution). */
  setComboTriggerColumnId(eventId: string, columnId: string) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].id === eventId) {
        this.registeredEvents[i] = { ...this.registeredEvents[i], comboTriggerColumnId: columnId };
        return;
      }
    }
  }

  /**
   * Get all registered events with reactions merged and reaction frames attached.
   * This is the final output for the view layer — replaces external mergeReactions + attachReactionFrames calls.
   */
  getProcessedEvents(): TimelineEvent[] {
    return attachReactionFrames(mergeReactions(this.registeredEvents));
  }

  /** Get all events (registered + queue-created). */
  getAllEvents(): TimelineEvent[] {
    return [...this.registeredEvents, ...this.output];
  }

  /** Get combo chaining state (debug). */
  getComboStops(): readonly { id: string; startFrame: number; animDur: number }[] {
    return this.comboStops;
  }

  /** Get queue-created events (debug). */
  getQueueOutput(): readonly TimelineEvent[] {
    return this.output;
  }

  /**
   * Check which trigger associations match a given event.
   * Returns associations whose triggerClause conditions could be satisfied
   * by the event's column/name/owner. Actual condition evaluation deferred to Phase 2.
   */
  checkTriggerAssociations(event: TimelineEvent): TriggerAssociation[] {
    if (this.triggerAssociations.length === 0) return [];
    return this.triggerAssociations.filter(assoc =>
      assoc.triggerClause.some(clause =>
        clause.conditions.some(cond =>
          cond.object === event.name || cond.object === event.columnId
        )
      )
    );
  }

  /** Get the base (pre-time-stop) activation duration for an event, or undefined if not extended. */
  getBaseDuration(eventId: string): number | undefined {
    return this.rawDurations.get(eventId);
  }

  /** Merge raw durations from another controller (e.g. queue controller into main state). */
  mergeRawDurations(other: DerivedEventController) {
    other.rawDurations.forEach((dur, id) => {
      if (!this.rawDurations.has(id)) this.rawDurations.set(id, dur);
    });
  }

  /** Mark queue-created event IDs as extended (they're already in timeline-time). */
  markExtended(ids: string[]) {
    for (const id of ids) this.extendedIds.add(id);
  }

  /** Replace the registered events array (e.g. after late combo trigger resolution). */
  replaceEvents(events: TimelineEvent[]) {
    this.registeredEvents = events;
  }

  // ── Domain Controllers ──────────────────────────────────────────────────

  /**
   * Create an infliction event. Handles deque stacking (cap 4),
   * cross-element reaction triggers, and duration extension.
   */
  createInfliction(
    columnId: string, ownerId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: { id?: string },
  ) {
    // Cross-element reaction check: if another element's infliction is active,
    // consume it and create a reaction instead.
    if (INFLICTION_COLUMN_IDS.has(columnId)) {
      const otherActive: TimelineEvent[] = [];
      for (const otherCol of Array.from(INFLICTION_COLUMN_IDS)) {
        if (otherCol === columnId) continue;
        for (const ev of this.activeEventsIn(otherCol, ownerId, frame)) {
          otherActive.push(ev);
        }
      }

      if (otherActive.length > 0) {
        const reactionColumnId = INFLICTION_TO_REACTION[columnId];
        if (reactionColumnId) {
          for (const consumed of otherActive) {
            setEventDuration(consumed, frame - consumed.startFrame);
            consumed.eventStatus = EventStatusType.CONSUMED;
            consumed.eventStatusOwnerId = source.ownerId;
            consumed.eventStatusSkillName = source.skillName;
          }
          this.createReaction(reactionColumnId, ENEMY_OWNER_ID, frame, REACTION_DURATION, source, {
            id: `${options?.id ?? columnId}-reaction`,
            inflictionStacks: otherActive.length,
          });
          // Emit a consumed copy of the incoming infliction so freeform raw
          // events can be replaced with their reacted state.
          const consumed: TimelineEvent = {
            id: options?.id ?? `${columnId}-q-${this.idCounter++}`,
            name: columnId,
            ownerId,
            columnId,
            startFrame: frame,
            segments: [{ properties: { duration: 0 } }],
            sourceOwnerId: source.ownerId,
            sourceSkillName: source.skillName,
            eventStatus: EventStatusType.CONSUMED,
            eventStatusOwnerId: source.ownerId,
            eventStatusSkillName: source.skillName,
          };
          this.output.push(consumed);
          return;
        }
      }
    }

    // Deque stacking: evict oldest if at max stacks
    const key = this.key(columnId, ownerId);
    const existing = this.stacks.get(key) ?? [];
    const active = this.activeEventsIn(columnId, ownerId, frame);

    // Arts Burst: same-element arts infliction stacking (not cross-element, not physical)
    const isArtsBurst = INFLICTION_COLUMN_IDS.has(columnId) && active.length > 0;

    if (active.length >= MAX_INFLICTION_STACKS) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.CONSUMED;
      oldest.eventStatusOwnerId = source.ownerId;
      oldest.eventStatusSkillName = source.skillName;
    }

    const rawDur = durationFrames;
    const extendedDuration = this.extendDuration(frame, rawDur);
    const ev: TimelineEvent = {
      id: options?.id ?? `${columnId}-q-${this.idCounter++}`,
      name: columnId,
      ownerId,
      columnId,
      startFrame: frame,
      segments: [{ properties: { duration: extendedDuration } }],
      sourceOwnerId: source.ownerId,
      sourceSkillName: source.skillName,
      ...(isArtsBurst && { isArtsBurst: true }),
    };
    this.rawDurations.set(ev.id, rawDur);
    existing.push(ev);
    this.stacks.set(key, existing);
    this.output.push(ev);

    // Extend co-active inflictions to match the new one's end
    const newEnd = frame + extendedDuration;
    const remainingActive = this.activeEventsIn(columnId, ownerId, frame);
    for (const act of remainingActive) {
      if (act.id === ev.id) continue;
      const actEnd = act.startFrame + eventDuration(act);
      if (newEnd > actEnd) {
        setEventDuration(act, newEnd - act.startFrame);
        act.eventStatus = EventStatusType.EXTENDED;
        act.eventStatusOwnerId = source.ownerId;
        act.eventStatusSkillName = source.skillName;
      }
    }
  }

  /**
   * Create a reaction event with inline merge/corrosion logic.
   * Corrosion: max stats, extend duration if new is longer.
   * Non-corrosion: refresh (clamp older) if new extends further.
   */
  createReaction(
    columnId: string, ownerId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: { statusLevel?: number; inflictionStacks?: number; forcedReaction?: boolean; id?: string },
  ) {
    const ev: TimelineEvent = {
      id: options?.id ?? `reaction-${columnId}-${this.idCounter++}`,
      name: columnId,
      ownerId,
      columnId,
      startFrame: frame,
      segments: [{ properties: { duration: durationFrames } }],
      sourceOwnerId: source.ownerId,
      sourceSkillName: source.skillName,
      statusLevel: options?.statusLevel,
      inflictionStacks: options?.inflictionStacks,
      forcedReaction: options?.forcedReaction,
    };

    const rawDur = durationFrames;
    setEventDuration(ev, this.extendDuration(ev.startFrame, rawDur));
    const key = this.key(ev.columnId, ev.ownerId);
    const existing = this.stacks.get(key) ?? [];
    const active = existing.filter(r =>
      r.eventStatus !== EventStatusType.CONSUMED &&
      r.eventStatus !== EventStatusType.REFRESHED &&
      r.startFrame <= ev.startFrame && ev.startFrame < r.startFrame + eventDuration(r)
    );

    if (active.length > 0) {
      const prev = active[active.length - 1];
      const prevEnd = prev.startFrame + eventDuration(prev);

      if (ev.columnId === REACTION_COLUMNS.CORROSION) {
        setEventDuration(prev, ev.startFrame - prev.startFrame);
        prev.eventStatus = EventStatusType.REFRESHED;
        prev.eventStatusOwnerId = source.ownerId;
        prev.eventStatusSkillName = source.skillName;

        const prevStatusLevel = prev.statusLevel ?? 1;
        const prevStacks = prev.inflictionStacks ?? 1;
        const remainingOldDuration = prevEnd - ev.startFrame;

        const elapsedSeconds = (ev.startFrame - prev.startFrame) / FPS;
        const oldReductionFloor = prev.reductionFloor ?? 0;
        const oldArtsIntensity = prev.artsIntensity ?? 0;
        const oldBaseReduction = getCorrosionBaseReduction(
          Math.min(prevStatusLevel, 4) as StatusLevel,
          elapsedSeconds,
        ) * getCorrosionReductionMultiplier(oldArtsIntensity);

        setEventDuration(ev, Math.max(remainingOldDuration, eventDuration(ev)));
        ev.statusLevel = Math.max(prevStatusLevel, ev.statusLevel ?? 1);
        ev.inflictionStacks = Math.max(prevStacks, ev.inflictionStacks ?? 1);
        ev.reductionFloor = Math.max(oldReductionFloor, oldBaseReduction);
      } else {
        const newEnd = ev.startFrame + eventDuration(ev);
        if (newEnd >= prevEnd) {
          setEventDuration(prev, ev.startFrame - prev.startFrame);
          prev.eventStatus = EventStatusType.REFRESHED;
          prev.eventStatusOwnerId = source.ownerId;
          prev.eventStatusSkillName = source.skillName;
        }
      }
    }

    // Rebuild segments for reaction events (corrosion gets per-second segments, others get a single segment)
    if (ev.columnId === REACTION_COLUMNS.CORROSION) {
      const segs = buildCorrosionSegments(ev);
      if (segs) ev.segments = segs;
    } else {
      const seg = buildReactionSegment(ev);
      if (seg) ev.segments = [seg];
    }

    this.rawDurations.set(ev.id, rawDur);
    existing.push(ev);
    this.stacks.set(key, existing);
    this.output.push(ev);
  }

  /**
   * Create a status event with stacking behavior.
   * stackingMode: 'RESET' clears existing, 'MERGE' subsumes older, undefined = add alongside.
   */
  createStatus(
    columnId: string, ownerId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: { statusName?: string; stackingMode?: string; id?: string; maxStacks?: number; event?: Partial<TimelineEvent> },
  ) {
    const statusName = options?.statusName ?? columnId;

    if (options?.stackingMode === 'RESET') {
      this.resetStatus(columnId, ownerId, frame, source);
    }

    // For exchange statuses, check max stacks
    if (options?.maxStacks != null) {
      const active = this.activeCount(columnId, ownerId, frame);
      if (active >= options.maxStacks) return;
    }

    const ev: TimelineEvent = {
      id: options?.id ?? `${statusName.toLowerCase()}-q-${this.idCounter++}`,
      name: statusName,
      ownerId,
      columnId,
      startFrame: frame,
      segments: [{ properties: { duration: durationFrames } }],
      sourceOwnerId: source.ownerId,
      sourceSkillName: source.skillName,
      ...options?.event,
    };

    if (options?.stackingMode === 'MERGE') {
      // Subsume older: clamp all active, keep the new one
      const active = this.activeEventsIn(columnId, ownerId, frame);
      for (const act of active) {
        setEventDuration(act, frame - act.startFrame);
        act.eventStatus = EventStatusType.CONSUMED;
        act.eventStatusOwnerId = source.ownerId;
        act.eventStatusSkillName = source.skillName;
      }
    }

    this.addEvent(ev);
  }

  /** Create a stagger event (display-only / no-op for now). */
  createStagger(_columnId: string, _ownerId: string, _frame: number, _value: number, _source: EventSource) {
    // No-op — stagger is display-only
  }

  /**
   * Consume (absorb) oldest N active inflictions in a column.
   * Returns the number consumed.
   */
  consumeInfliction(
    columnId: string, ownerId: string, frame: number,
    count: number, source: EventSource,
  ) {
    const allActive = this.activeEventsIn(columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    const toAbsorb = allActive.slice(0, count);
    for (const ev of toAbsorb) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return toAbsorb.length;
  }

  /**
   * Consume (clamp) all active reactions in a column.
   */
  consumeReaction(
    columnId: string, ownerId: string, frame: number,
    source: EventSource,
  ) {
    this.clampActive(columnId, ownerId, frame, source, EventStatusType.CONSUMED);
  }

  /**
   * Consume (clamp) all active statuses in a column.
   */
  consumeStatus(
    columnId: string, ownerId: string, frame: number,
    source: EventSource,
  ) {
    this.clampActive(columnId, ownerId, frame, source, EventStatusType.CONSUMED);
  }

  // ── canDo checks for ALL loop semantics ───────────────────────────────

  /** Check if an infliction can be applied (deque always accepts, evicts oldest). */
  canApplyInfliction(_columnId: string, _ownerId: string, _frame: number) {
    return true; // deque always accepts
  }

  /** Check if a status can be applied (respects exchange max stacks). */
  canApplyStatus(columnId: string, ownerId: string, frame: number, maxStacks?: number) {
    if (maxStacks == null) return true;
    return this.activeCount(columnId, ownerId, frame) < maxStacks;
  }

  /** Check if a reaction can be applied. */
  canApplyReaction(_columnId: string, _ownerId: string, _frame: number) {
    return true; // reactions merge, always "applicable"
  }

  /** Check if there are active inflictions to consume. */
  canConsumeInfliction(columnId: string, ownerId: string, frame: number) {
    return this.activeCount(columnId, ownerId, frame) > 0;
  }

  /** Check if there are active reactions to consume. */
  canConsumeReaction(columnId: string, ownerId: string, frame: number) {
    return this.activeCount(columnId, ownerId, frame) > 0;
  }

  /** Check if there are active statuses to consume. */
  canConsumeStatus(columnId: string, ownerId: string, frame: number) {
    return this.activeCount(columnId, ownerId, frame) > 0;
  }

  // ── Combo chaining ────────────────────────────────────────────────────────

  /**
   * Incremental combo chaining: truncate overlapping combo animations.
   * When a new combo is registered, its time-stop may overlap with existing
   * combo time-stops. Truncations are applied in both directions.
   */
  private handleComboChaining(ev: TimelineEvent): TimelineEvent {
    let animDur = getAnimationDuration(ev);
    const evEnd = ev.startFrame + animDur;
    let changed = false;

    // Check if ev starts within an existing combo's stop → truncate the older combo
    for (const cs of this.comboStops) {
      const csEnd = cs.startFrame + cs.animDur;
      if (ev.startFrame > cs.startFrame && ev.startFrame < csEnd) {
        const truncated = ev.startFrame - cs.startFrame;
        cs.animDur = truncated;
        // Update the registered event
        const regIdx = this.registeredEvents.findIndex(e => e.id === cs.id);
        if (regIdx >= 0) {
          const reg = this.registeredEvents[regIdx];
          this.registeredEvents[regIdx] = {
            ...reg,
            segments: setAnimationSegmentDuration(reg.segments, truncated),
          };
        }
        // Update the stop region
        const stop = this.stops.find(s => s.eventId === cs.id);
        if (stop) stop.durationFrames = truncated;
      }
    }

    // Check if any existing combo starts within ev's stop → truncate ev
    for (const cs of this.comboStops) {
      if (cs.startFrame > ev.startFrame && cs.startFrame < evEnd) {
        const truncated = cs.startFrame - ev.startFrame;
        animDur = truncated;
        changed = true;
        break;
      }
    }

    // Track for future chaining
    this.comboStops.push({ id: ev.id, startFrame: ev.startFrame, animDur });
    this.comboStops.sort((a, b) => a.startFrame - b.startFrame);

    if (changed) {
      return {
        ...ev,
        segments: setAnimationSegmentDuration(ev.segments, animDur),
      };
    }
    return ev;
  }

  // ── Time-stop management ─────────────────────────────────────────────────

  private maybeRegisterStop(ev: TimelineEvent): boolean {
    if (!isTimeStopEvent(ev)) return false;
    if (this.registeredStopIds.has(ev.id)) return false;
    this.registeredStopIds.add(ev.id);
    this.stops.push({
      startFrame: ev.startFrame,
      durationFrames: getAnimationDuration(ev),
      eventId: ev.id,
    });
    this.stops.sort((a, b) => a.startFrame - b.startFrame);
    return true;
  }

  private extendDuration(startFrame: number, rawDuration: number, eventId?: string) {
    const foreign = eventId && this.registeredStopIds.has(eventId)
      ? this.stops.filter(s => s.eventId !== eventId)
      : this.stops;
    return extendByTimeStops(startFrame, rawDuration, foreign);
  }

  private foreignStopsFor(ev: TimelineEvent): readonly TimeStopRegion[] {
    return isTimeStopEvent(ev) ? this.stops.filter(s => s.eventId !== ev.id) : this.stops;
  }

  /**
   * Extend a single event's durations by foreign time-stops.
   * Handles segmented events, 3-phase events, and time-stop events.
   */
  private extendSingleEvent(ev: TimelineEvent): TimelineEvent {
    const isOwn = isTimeStopEvent(ev);
    const animDur = getAnimationDuration(ev);
    const foreignStops = isOwn
      ? this.stops.filter(s => s.eventId !== ev.id)
      : this.stops;
    if (foreignStops.length === 0) return ev;

    // ── Segmented events ───────────────────────────────────────────────
    if (ev.segments.length > 0) {
      let rawOffset = 0;
      let derivedOffset = 0;
      let changed = false;
      const newSegments = ev.segments.map(seg => {
        const rawSegStart = rawOffset;
        rawOffset += seg.properties.duration;

        if (seg.properties.timeDependency === TimeDependency.REAL_TIME || seg.properties.duration === 0) {
          derivedOffset += seg.properties.duration;
          return seg;
        }

        if (isOwn && animDur > 0 && rawSegStart + seg.properties.duration <= animDur) {
          derivedOffset += seg.properties.duration;
          return seg;
        }

        let ext: number;
        if (isOwn && animDur > 0 && rawSegStart < animDur) {
          const animPortion = animDur - rawSegStart;
          const postAnimPortion = seg.properties.duration - animPortion;
          ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
        } else {
          ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.properties.duration, foreignStops);
        }

        derivedOffset += ext;
        if (ext === seg.properties.duration) return seg;
        changed = true;
        return { ...seg, properties: { ...seg.properties, duration: ext } };
      });

      if (!changed) return ev;
      this.extendedIds.add(ev.id);
      return { ...ev, segments: newSegments };
    }

    // All events should have segments at this point
    return ev;
  }

  private reExtendQueueEvents() {
    this.stacks.forEach((events) => {
      for (const ev of events) {
        if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) continue;
        if (ev.eventStatus === EventStatusType.EXTENDED) continue;
        const raw = this.rawDurations.get(ev.id);
        if (raw == null) continue;
        setEventDuration(ev, this.extendDuration(ev.startFrame, raw, ev.id));
      }
    });
  }

  /**
   * Per-event time-stop start validation. Checks if an event starts inside
   * a time-stop region and attaches warnings. Called inline during registration.
   */
  private validateTimeStopStart(ev: TimelineEvent): TimelineEvent {
    if (this.stops.length === 0) return ev;
    const warnings: string[] = [];
    for (const stop of this.stops) {
      if (stop.eventId === ev.id) continue;
      const stopEnd = stop.startFrame + stop.durationFrames;
      if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

      // Look up source event to determine stop type
      const source = this.registeredEvents.find(e => e.id === stop.eventId);
      if (!source) continue;

      const sourceIsDodge = source.columnId === 'dash' && !!source.isPerfectDodge;
      if (sourceIsDodge) continue;

      const sourceIsUltimate = source.columnId === SKILL_COLUMNS.ULTIMATE;
      if (ev.columnId === SKILL_COLUMNS.COMBO && sourceIsUltimate) {
        warnings.push('Combo skill cannot start during ultimate animation time-stop');
      }
      if (ev.columnId === SKILL_COLUMNS.ULTIMATE && sourceIsUltimate) {
        warnings.push("Ultimate cannot start during another ultimate's animation time-stop");
      }
    }
    if (warnings.length === 0) return ev;
    return { ...ev, warnings: [...(ev.warnings ?? []), ...warnings] };
  }

  // ── Active event queries ─────────────────────────────────────────────────

  private activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    const result: TimelineEvent[] = [];
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + eventDuration(ev)) result.push(ev);
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + eventDuration(ev)) result.push(ev);
    }
    return result;
  }

  activeCount(columnId: string, ownerId: string, frame: number) {
    return this.activeEventsIn(columnId, ownerId, frame).length;
  }

  /** Public query: get active events at a frame for a column+owner. */
  getActiveEvents(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    return this.activeEventsIn(columnId, ownerId, frame);
  }

  // ── Generic event insertion ──────────────────────────────────────────────

  addEvent(ev: TimelineEvent) {
    const rawDur = eventDuration(ev);
    if (rawDur > 0) {
      setEventDuration(ev, this.extendDuration(ev.startFrame, rawDur, ev.id));
    }
    this.rawDurations.set(ev.id, rawDur);
    const key = this.key(ev.columnId, ev.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(ev);
    this.stacks.set(key, existing);
    this.output.push(ev);
    if (this.maybeRegisterStop(ev)) {
      this.reExtendQueueEvents();
    }
  }

  /** Clamp all active events in a column — set status and truncate duration. */
  resetStatus(columnId: string, ownerId: string, frame: number, source: EventSource) {
    this.clampActive(columnId, ownerId, frame, source, EventStatusType.REFRESHED);
  }

  /**
   * Reset a skill event's cooldown segment at a given frame.
   * Truncates the Cooldown segment so the event ends at resetFrame.
   */
  resetCooldown(eventId: string, resetFrame: number) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].id !== eventId) continue;
      const ev = this.registeredEvents[i];
      let preCooldownDur = 0;
      const newSegments = ev.segments.map(s => {
        if (s.properties.name === 'Cooldown') {
          const cooldownRemaining = Math.max(0, resetFrame - ev.startFrame - preCooldownDur);
          return { ...s, properties: { ...s.properties, duration: cooldownRemaining } };
        }
        preCooldownDur += s.properties.duration;
        return s;
      });
      this.registeredEvents[i] = { ...ev, segments: newSegments };
      return;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Clamp all active events at frame in a column: truncate duration and set status. */
  private clampActive(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, status: EventStatusType,
  ) {
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
  }
}

/** Set the ANIMATION segment's durationFrames, returning updated segments. */
function setAnimationSegmentDuration(segments: EventSegmentData[], duration: number): EventSegmentData[] {
  return segments.map(s =>
    s.metadata?.segmentType === SegmentType.ANIMATION ? { ...s, properties: { ...s.properties, duration } } : s,
  );
}