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
import { NounType } from '../../dsl/semantics';
import { EventStatusType, SegmentType, StatusType, TimeDependency } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from './processTimeStop';
import { buildReactionSegment, buildCorrosionSegments, mergeReactions, attachReactionFrames } from './processInfliction';
import { OPERATOR_COLUMNS, REACTION_COLUMNS, REACTION_COLUMN_IDS, COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
import { TOTAL_FRAMES } from '../../utils/timeline';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import type { TriggerAssociation } from '../gameDataStore';
import type { SkillPointController } from '../slot/skillPointController';
import type { UltimateEnergyController } from './ultimateEnergyController';
import { collectNoGainWindowsForEvent } from './ultimateEnergyController';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { getAllOperatorStatuses } from '../gameDataStore';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { allocInputEvent } from './objectPool';
import type { ColumnHost, EventSource, AddOptions, ConsumeOptions } from './columns/eventColumn';
import { ColumnRegistry } from './columns/columnRegistry';
export type { EventSource } from './columns/eventColumn';

// ── Status stack limit cache (from operator status configs) ──────────────────

let _statusStackLimitCache: Map<string, number> | null = null;

export function getStatusStackLimit(statusId: string): number | undefined {
  if (!_statusStackLimitCache) {
    _statusStackLimitCache = new Map();
    for (const s of getAllOperatorStatuses()) {
      if (!s.stacks) continue;
      _statusStackLimitCache.set(s.id, s.maxStacks);
      if (s.name && s.name !== s.id) _statusStackLimitCache.set(s.name, s.maxStacks);
    }
  }
  return _statusStackLimitCache.get(statusId);
}

export class DerivedEventController implements ColumnHost {
  private stacks = new Map<string, TimelineEvent[]>();
  private registry = new ColumnRegistry(this);
  private registeredEvents: TimelineEvent[] = [];
  private stops: TimeStopRegion[] = [];
  private registeredStopIds = new Set<string>();
  private rawDurations = new Map<string, number>();
  private extendedIds = new Set<string>();
  private comboStops: { uid: string; startFrame: number; animDur: number }[] = [];
  readonly output: TimelineEvent[] = [];
  private idCounter = 0;
  private triggerAssociations: TriggerAssociation[];
  private slotWirings: SlotTriggerWiring[] = [];
  private spController: SkillPointController | null = null;
  private ueController: UltimateEnergyController | null = null;
  /** Event UIDs that consumed Link, mapped to their stack count at consumption time. */
  private linkConsumptions = new Map<string, number>();

  constructor(
    baseEvents?: TimelineEvent[],
    triggerAssociations?: TriggerAssociation[],
    slotWirings?: SlotTriggerWiring[],
    spController?: SkillPointController,
    ueController?: UltimateEnergyController,
  ) {
    this.triggerAssociations = triggerAssociations ?? [];
    this.slotWirings = slotWirings ?? [];
    this.spController = spController ?? null;
    this.ueController = ueController ?? null;
    if (baseEvents) {
      this.registeredEvents = baseEvents;
      for (const ev of baseEvents) {
        this.maybeRegisterStop(ev);
      }
    }
  }

  /**
   * Reset all internal state for the next pipeline run (singleton reuse).
   * Arrays are cleared in-place (.length = 0) so the same references are reused —
   * callers of getProcessedEvents() must copy the result if reference identity matters.
   */
  reset(
    triggerAssociations?: TriggerAssociation[],
    slotWirings?: SlotTriggerWiring[],
    spController?: SkillPointController,
    ueController?: UltimateEnergyController,
  ) {
    this.stacks.clear();
    this.registry.clear();
    this.registeredEvents.length = 0;
    this.stops.length = 0;
    this.registeredStopIds.clear();
    this.rawDurations.clear();
    this.extendedIds.clear();
    this.comboStops.length = 0;
    (this.output as TimelineEvent[]).length = 0;
    this.idCounter = 0;
    this.linkConsumptions.clear();
    this.triggerAssociations = triggerAssociations ?? [];
    this.slotWirings = slotWirings ?? [];
    this.spController = spController ?? null;
    this.ueController = ueController ?? null;
  }

  private key(columnId: string, ownerId: string) {
    return `${columnId}:${ownerId}`;
  }

  // ── Controlled operator seeding ──────────────────────────────────────────

  /**
   * Seed the initial CONTROLLED event for the first occupied operator slot.
   * Must be called before registerEvents so that user-placed swaps clamp
   * this seed during registration. No-op if no slots are occupied.
   */
  seedControlledOperator(firstOccupiedSlotId: string | undefined, operatorId?: string) {
    if (!firstOccupiedSlotId) return;
    const ev = allocInputEvent();
    ev.uid = `controlled-seed-${firstOccupiedSlotId}`;
    ev.id = NounType.CONTROL;
    ev.name = NounType.CONTROL;
    ev.ownerId = firstOccupiedSlotId;
    ev.columnId = OPERATOR_COLUMNS.INPUT;
    ev.startFrame = 0;
    ev.segments = [{ properties: { duration: TOTAL_FRAMES } }];
    ev.sourceOwnerId = operatorId ?? firstOccupiedSlotId;
    ev.sourceSkillName = NounType.CONTROL;
    this.registerEvents([ev]);
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
    // Dedup by UID — prevents double-registration when React strict mode
    // double-invokes pipeline useMemo with cached TriggerIndex singletons.
    const deduped = events.filter(ev => !this.registeredEvents.some(r => r.uid === ev.uid));
    if (deduped.length === 0) return;

    const startIdx = this.registeredEvents.length;

    // Pass 1: combo chaining, reaction segments, stop discovery
    for (let i = 0; i < deduped.length; i++) {
      let ev = deduped[i];

      // Combo chaining: truncate overlapping combo animations
      if (ev.columnId === NounType.COMBO && getAnimationDuration(ev) > 0) {
        ev = this.handleComboChaining(ev);
      }


      // Auto-build reaction segments for freeform reaction events
      if (REACTION_COLUMN_IDS.has(ev.columnId)) {
        if (ev.columnId === REACTION_COLUMNS.CORROSION) {
          const segs = buildCorrosionSegments(ev);
          if (segs) ev.segments = segs;
        } else {
          // For already-extended events (re-registered from queue), use raw game-time
          // duration so combustion ticks aren't inflated by time-stop extension.
          // Pass foreign stops so consumed durations are contracted to game-time.
          const raw = this.rawDurations.get(ev.uid);
          const fStops = this.foreignStopsFor(ev);
          const seg = buildReactionSegment(ev, raw, fStops);
          if (seg) ev.segments = [seg];
        }
      }

      // Controlled operator: clamp earlier CONTROL events on other owners
      if (ev.id === NounType.CONTROL && ev.columnId === OPERATOR_COLUMNS.INPUT) {
        for (let j = 0; j < this.registeredEvents.length; j++) {
          const prev = this.registeredEvents[j];
          if (prev.id !== NounType.CONTROL || prev.columnId !== OPERATOR_COLUMNS.INPUT) continue;
          if (prev.ownerId === ev.ownerId) continue;
          const prevEnd = prev.startFrame + computeSegmentsSpan(prev.segments);
          if (prevEnd <= ev.startFrame) continue;
          // Clamp: shorten to end at ev.startFrame
          this.registeredEvents[j] = {
            ...prev,
            segments: [{ properties: { ...prev.segments[0]?.properties, duration: ev.startFrame - prev.startFrame } }],
          };
        }
      }

      this.maybeRegisterStop(ev);
      this.registeredEvents.push(ev);
    }

    // Pass 2: per-event extension, frame positions, validation, and SP/UE notification
    for (let i = startIdx; i < this.registeredEvents.length; i++) {
      let ev = this.registeredEvents[i];
      if (this.stops.length > 0 && !this.extendedIds.has(ev.uid)) {
        ev = this.extendSingleEvent(ev);
      }
      ev = this.computeFramePositions(ev);
      ev = this.validateTimeStopStart(ev);
      this.registeredEvents[i] = ev;
      this.notifyResourceControllers(ev);
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
      if (ev.columnId !== NounType.COMBO) continue;
      const merged = mergedBySlot.get(ev.ownerId);
      const match = merged?.find(w => ev.startFrame >= w.startFrame && ev.startFrame < w.endFrame);
      if (match?.sourceColumnId != null && match.sourceColumnId !== ev.comboTriggerColumnId) {
        ev.comboTriggerColumnId = match.sourceColumnId;
      } else if (!match && ev.comboTriggerColumnId != null) {
        ev.comboTriggerColumnId = undefined;
      }
    }
  }

  /** Build a ValueResolutionContext with suppliedParameters for runtime VARY_BY resolution. */
  private buildUltimateEnergyValueContext(ev: TimelineEvent) {
    const resolved: Record<string, number> = {};
    const defs = ev.suppliedParameters?.VARY_BY;
    if (defs && ev.parameterValues) {
      for (const d of defs) {
        const raw = ev.parameterValues[d.id] ?? d.lowerRange;
        resolved[d.id] = raw - d.lowerRange;
      }
    }
    return { ...DEFAULT_VALUE_CONTEXT, suppliedParameters: resolved };
  }

  /**
   * Notify SP and UE controllers about resource effects on a newly registered event.
   * Called per-event after extension and frame position computation in pass 2.
   */
  private notifyResourceControllers(ev: TimelineEvent) {
    // ── SP notifications ──────────────────────────────────────────────────
    if (this.spController) {
      // Battle skill with SP cost → event-level cost + frame-level returns
      if (ev.columnId === NounType.BATTLE && ev.skillPointCost) {
        const firstFrame = ev.segments[0]?.frames?.[0];
        const gaugeGainFrame = firstFrame?.absoluteFrame ?? ev.startFrame;
        this.spController.addCost(ev.uid, ev.startFrame, ev.skillPointCost, ev.ownerId, gaugeGainFrame);

        // Frame-level SP recovery on battle skill frames
        for (const seg of ev.segments) {
          for (const f of seg.frames ?? []) {
            if (f.skillPointRecovery && f.skillPointRecovery > 0 && f.absoluteFrame != null) {
              this.spController.addRecovery(f.absoluteFrame, f.skillPointRecovery, ev.ownerId, ev.id);
            }
          }
        }
      }

      // SP recovery events (derived from deriveSPRecoveryEvents)
      if (ev.ownerId === COMMON_OWNER_ID && ev.columnId === COMMON_COLUMN_IDS.SKILL_POINTS) {
        this.spController.addSpRecoveryEvent(ev);
      }

      // Perfect dodge → SP recovery
      if (ev.columnId === OPERATOR_COLUMNS.INPUT && ev.isPerfectDodge) {
        this.spController.addRecovery(
          ev.startFrame, GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery,
          ev.ownerId, ev.id,
        );
      }
    }

    // ── UE notifications ──────────────────────────────────────────────────
    if (this.ueController) {
      // Combo skill → gauge gain from frames
      if (ev.columnId === NounType.COMBO) {
        for (const seg of ev.segments) {
          for (const f of seg.frames ?? []) {
            // Resolve UE gain: re-resolve raw ValueNode with suppliedParameters when available
            let selfGain = f.gaugeGain ?? 0;
            if (f.ultimateEnergyGainNode && ev.parameterValues) {
              const ctx = this.buildUltimateEnergyValueContext(ev);
              selfGain = resolveValueNode(f.ultimateEnergyGainNode, ctx);
            }
            const teamGain = f.teamGaugeGain ?? 0;
            if ((selfGain > 0 || teamGain > 0) && f.absoluteFrame != null) {
              this.ueController.addGaugeGain(f.absoluteFrame, ev.ownerId, selfGain, teamGain);
            }
          }
        }
      }

      // Battle skill → frame-level gaugeGain markers (not SP-based)
      if (ev.columnId === NounType.BATTLE) {
        for (const seg of ev.segments) {
          for (const f of seg.frames ?? []) {
            if (f.gaugeGain && f.gaugeGain > 0 && f.absoluteFrame != null) {
              this.ueController.addGaugeGain(f.absoluteFrame, ev.ownerId, f.gaugeGain, 0);
            }
          }
        }
      }

      // Ultimate event → consume + no-gain windows
      if (ev.columnId === NounType.ULTIMATE) {
        this.ueController.addConsume(ev.startFrame, ev.ownerId);
        const windows = collectNoGainWindowsForEvent(ev);
        for (const w of windows) {
          this.ueController.addNoGainWindow(w.start, w.end, ev.ownerId);
        }
      }
    }
  }

  /**
   * Compute absoluteFrame and derivedOffsetFrame on a single event's frame markers.
   * Called per-event during registration (inline, not as a bulk pass).
   */
  private computeFramePositions(ev: TimelineEvent): TimelineEvent {
    const fStops = this.foreignStopsFor(ev);

    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      const segStart = cumulativeOffset;
      const segAbsStart = ev.startFrame + segStart;

      // Bake absolute start frame onto each segment for view-layer positioning
      seg.absoluteStartFrame = segAbsStart;

      cumulativeOffset += seg.properties.duration;
      if (!seg.frames) continue;
      if (this.stops.length === 0) {
        for (const f of seg.frames) {
          f.derivedOffsetFrame = f.offsetFrame;
          f.absoluteFrame = segAbsStart + f.offsetFrame;
        }
      } else {
        for (const f of seg.frames) {
          const extOffset = extendByTimeStops(segAbsStart, f.offsetFrame, fStops);
          f.derivedOffsetFrame = extOffset;
          f.absoluteFrame = segAbsStart + extOffset;
        }
      }
    }
    return ev;
  }


  /**
   * Validate sibling overlap: events in the same column must not overlap.
   * Attaches warnings (read-only annotation, not bulk transformation).
   * Time-stop start validation is handled inline during registerEvents().
   */
  validateAll() {
    const byKey = new Map<string, TimelineEvent[]>();
    for (const ev of this.registeredEvents) {
      const k = `${ev.ownerId}:${ev.columnId}:${ev.id}`;
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
        if (!cur.nonOverlappableRange) continue;
        const curRange = computeSegmentsSpan(cur.segments);
        if (curRange > 0 && cur.startFrame + curRange > next.startFrame) {
          overlapIds.add(cur.uid);
          overlapIds.add(next.uid);
        }
      }
    }

    if (overlapIds.size > 0) {
      for (const ev of this.registeredEvents) {
        if (!overlapIds.has(ev.uid)) continue;
        ev.warnings = ev.warnings ? [...ev.warnings, 'Overlaps with another event in the same column'] : ['Overlaps with another event in the same column'];
      }
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
  setComboTriggerColumnId(eventUid: string, columnId: string) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid === eventUid) {
        // Mutate in-place so PROCESS_FRAME entries referencing this event see the update
        this.registeredEvents[i].comboTriggerColumnId = columnId;
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
  getComboStops(): readonly { uid: string; startFrame: number; animDur: number }[] {
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
          cond.object === event.id || cond.object === event.columnId
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

  // ── ColumnHost interface ────────────────────────────────────────────────

  /** Get all active (non-consumed) events for a column+owner at a frame. */
  activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    return this._activeEventsIn(columnId, ownerId, frame);
  }

  /** Count active events for a column+owner at a frame. */
  activeCount(columnId: string, ownerId: string, frame: number) {
    return this._activeEventsIn(columnId, ownerId, frame).length;
  }

  /** Extend a raw game-time duration by active time-stop regions. */
  extendDuration(startFrame: number, rawDuration: number, eventUid?: string) {
    return this._extendDuration(startFrame, rawDuration, eventUid);
  }

  /** Register a raw (pre-extension) duration for later re-extension. */
  trackRawDuration(uid: string, rawDuration: number) {
    this.rawDurations.set(uid, rawDuration);
  }

  /** Insert an event: extend duration, push to stacks + output, register stop if applicable. */
  pushEvent(event: TimelineEvent, rawDuration: number) {
    const extDur = this._extendDuration(event.startFrame, rawDuration, event.uid);
    setEventDuration(event, extDur);
    this.rawDurations.set(event.uid, rawDuration);
    const key = this.key(event.columnId, event.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(event);
    this.stacks.set(key, existing);
    this.output.push(event);
    if (this.maybeRegisterStop(event)) {
      this.reExtendQueueEvents();
    }
  }

  /** Insert an already-extended event directly (no duration extension). */
  pushEventDirect(event: TimelineEvent) {
    const key = this.key(event.columnId, event.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(event);
    this.stacks.set(key, existing);
    this.output.push(event);
  }

  /** Push an event to output only (e.g. consumed copies for freeform state tracking). */
  pushToOutput(event: TimelineEvent) {
    this.output.push(event);
  }

  /** Delegate creation to another column (cross-column side effects). */
  applyToColumn(columnId: string, ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {
    return this.registry.get(columnId).add(ownerId, frame, durationFrames, source, options);
  }

  /** Delegate consumption to another column. */
  consumeFromColumn(columnId: string, ownerId: string, frame: number,
    source: EventSource, options?: ConsumeOptions): number {
    return this.registry.get(columnId).consume(ownerId, frame, source, options);
  }

  /** Get foreign time-stop regions for reaction segment building. */
  foreignStopsFor(event: TimelineEvent): readonly TimeStopRegion[] {
    return isTimeStopEvent(event) ? this.stops.filter(s => s.eventUid !== event.uid) : this.stops;
  }

  // ── Domain Controllers ──────────────────────────────────────────────────

  /** Apply (create) an event on a column. Routes to the appropriate EventColumn. */
  applyEvent(
    columnId: string, ownerId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: AddOptions,
  ): boolean {
    return this.registry.get(columnId).add(ownerId, frame, durationFrames, source, options);
  }

  /** Consume events on a column. Routes to the appropriate EventColumn. */
  consumeEvent(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, options?: ConsumeOptions,
  ): number {
    return this.registry.get(columnId).consume(ownerId, frame, source, options);
  }

  /** Check if an event can be applied on a column. */
  canApplyEvent(columnId: string, ownerId: string, frame: number): boolean {
    return this.registry.get(columnId).canAdd(ownerId, frame);
  }

  /** Check if events can be consumed on a column. */
  canConsumeEvent(columnId: string, ownerId: string, frame: number): boolean {
    return this.registry.get(columnId).canConsume(ownerId, frame);
  }

  /** No-op — stagger is display-only. */
  createStagger(_columnId: string, _ownerId: string, _frame: number, _value: number, _source: EventSource) {}

  // ── Link consumption tracking ──────────────────────────────────────────

  /** Consume Link for a battle skill/ultimate. Records stack count against event UID. */
  consumeLink(eventUid: string, frame: number, source: EventSource): number {
    const linkColumnId = StatusType.LINK;
    const isLink = (ev: TimelineEvent) => ev.id === StatusType.LINK;
    const linkEvents = this._activeEventsIn(linkColumnId, COMMON_OWNER_ID, frame)
      .filter(isLink);
    if (linkEvents.length === 0) return 0;
    this.clampActiveFiltered(linkColumnId, COMMON_OWNER_ID, frame, source, EventStatusType.CONSUMED, isLink);
    const clampedStacks = Math.min(linkEvents.length, 4);
    this.linkConsumptions.set(eventUid, clampedStacks);
    return clampedStacks;
  }

  getLinkStacks(eventUid: string): number {
    return this.linkConsumptions.get(eventUid) ?? 0;
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
        const regIdx = this.registeredEvents.findIndex(e => e.uid === cs.uid);
        if (regIdx >= 0) {
          const reg = this.registeredEvents[regIdx];
          this.registeredEvents[regIdx] = {
            ...reg,
            segments: setAnimationSegmentDuration(reg.segments, truncated),
          };
        }
        // Update the stop region
        const stop = this.stops.find(s => s.eventUid === cs.uid);
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
    this.comboStops.push({ uid: ev.uid, startFrame: ev.startFrame, animDur });
    this.comboStops.sort((a, b) => a.startFrame - b.startFrame);

    if (changed) {
      ev.segments = setAnimationSegmentDuration(ev.segments, animDur);
    }
    return ev;
  }

  // ── Time-stop management ─────────────────────────────────────────────────

  private maybeRegisterStop(ev: TimelineEvent): boolean {
    if (!isTimeStopEvent(ev)) return false;
    if (this.registeredStopIds.has(ev.uid)) return false;
    this.registeredStopIds.add(ev.uid);
    this.stops.push({
      startFrame: ev.startFrame,
      durationFrames: getAnimationDuration(ev),
      eventUid: ev.uid,
    });
    this.stops.sort((a, b) => a.startFrame - b.startFrame);
    return true;
  }

  private _extendDuration(startFrame: number, rawDuration: number, eventUid?: string) {
    const foreign = eventUid && this.registeredStopIds.has(eventUid)
      ? this.stops.filter(s => s.eventUid !== eventUid)
      : this.stops;
    return extendByTimeStops(startFrame, rawDuration, foreign);
  }

  /**
   * Extend a single event's durations by foreign time-stops.
   * Handles segmented events, 3-phase events, and time-stop events.
   */
  private extendSingleEvent(ev: TimelineEvent): TimelineEvent {
    // Control status is not affected by time-stops — its timer keeps ticking
    if (ev.id === NounType.CONTROL) return ev;

    const isOwn = isTimeStopEvent(ev);
    const animDur = getAnimationDuration(ev);
    const foreignStops = isOwn
      ? this.stops.filter(s => s.eventUid !== ev.uid)
      : this.stops;
    if (foreignStops.length === 0) return ev;

    // ── Segmented events ───────────────────────────────────────────────
    if (ev.segments.length > 0) {
      let rawOffset = 0;
      let derivedOffset = 0;
      let changed = false;
      // Deep-clone segments (including frame markers) before mutating — the
      // source objects are shared with the raw state. Without cloning:
      //   - seg.properties.duration mutations compound across pipeline runs
      //   - f.derivedOffsetFrame / f.absoluteFrame mutations leak stale values
      //     to the raw state, causing frame diamonds to render at wrong positions
      //     between throttled drag ticks
      const segments = ev.segments.map(s => ({
        ...s,
        properties: { ...s.properties },
        ...(s.frames ? { frames: s.frames.map(f => ({ ...f })) } : {}),
      }));
      for (const seg of segments) {
        const rawSegStart = rawOffset;
        rawOffset += seg.properties.duration;

        if (seg.properties.timeDependency === TimeDependency.REAL_TIME || seg.properties.duration === 0) {
          derivedOffset += seg.properties.duration;
          continue;
        }

        if (isOwn && animDur > 0 && rawSegStart + seg.properties.duration <= animDur) {
          derivedOffset += seg.properties.duration;
          continue;
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
        if (ext !== seg.properties.duration) {
          changed = true;
          seg.properties.duration = ext;
        }
      }

      if (!changed) return ev;
      this.extendedIds.add(ev.uid);
      // Return a new event object — never mutate ev.segments in place, because
      // ev may reference validEvents[] which is reused across React strict-mode
      // double-invocations of useMemo. Mutating it compounds extensions.
      return { ...ev, segments };
    }

    // All events should have segments at this point
    return ev;
  }

  private reExtendQueueEvents() {
    this.stacks.forEach((events) => {
      for (const ev of events) {
        if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) continue;
        if (ev.eventStatus === EventStatusType.EXTENDED) continue;
        const raw = this.rawDurations.get(ev.uid);
        if (raw == null) continue;
        setEventDuration(ev, this._extendDuration(ev.startFrame, raw, ev.uid));
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
      if (stop.eventUid === ev.uid) continue;
      const stopEnd = stop.startFrame + stop.durationFrames;
      if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

      // Look up source event to determine stop type
      const source = this.registeredEvents.find(e => e.uid === stop.eventUid);
      if (!source) continue;

      // Control swap cannot occur during any time-stop (including dodge)
      if (ev.id === NounType.CONTROL) {
        warnings.push('Control swap cannot occur during time-stop');
        continue;
      }

      const sourceIsDodge = source.columnId === OPERATOR_COLUMNS.INPUT && !!source.isPerfectDodge;
      if (sourceIsDodge) continue;

      const sourceIsUltimate = source.columnId === NounType.ULTIMATE;
      if (ev.columnId === NounType.COMBO && sourceIsUltimate) {
        warnings.push('Combo skill cannot start during ultimate animation time-stop');
      }
      if (ev.columnId === NounType.ULTIMATE && sourceIsUltimate) {
        warnings.push("Ultimate cannot start during another ultimate's animation time-stop");
      }
    }
    if (warnings.length === 0) return ev;
    ev.warnings = ev.warnings ? [...ev.warnings, ...warnings] : warnings;
    return ev;
  }

  // ── Active event queries ─────────────────────────────────────────────────

  private _activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
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

  /** Public query: get active events at a frame for a column+owner. */
  getActiveEvents(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    return this._activeEventsIn(columnId, ownerId, frame);
  }

  /** Check if a given operator is the controlled operator at a given frame. */
  isControlledAt(ownerId: string, frame: number): boolean {
    return this._activeEventsIn(OPERATOR_COLUMNS.INPUT, ownerId, frame)
      .some((ev) => ev.id === NounType.CONTROL);
  }

  // ── Generic event insertion ──────────────────────────────────────────────

  addEvent(ev: TimelineEvent) {
    const rawDur = eventDuration(ev);
    if (rawDur > 0) {
      setEventDuration(ev, this._extendDuration(ev.startFrame, rawDur, ev.uid));
    }
    this.rawDurations.set(ev.uid, rawDur);
    const key = this.key(ev.columnId, ev.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(ev);
    this.stacks.set(key, existing);
    this.output.push(ev);
    if (this.maybeRegisterStop(ev)) {
      this.reExtendQueueEvents();
    }
  }

  /** Clamp the oldest active event in a column to make room for a new stack. */
  private resetOldest(columnId: string, ownerId: string, frame: number, source: EventSource) {
    const active = this._activeEventsIn(columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (active.length > 0) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.REFRESHED;
      oldest.eventStatusOwnerId = source.ownerId;
      oldest.eventStatusSkillName = source.skillName;
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
  /**
   * For each multi-skill activation window, clamp earlier combo cooldowns
   * so they end where the next combo starts. Called after windows are registered.
   */
  clampMultiSkillComboCooldowns() {
    // Find all multi-skill windows
    const windows = this.registeredEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && (ev.maxSkills ?? 1) > 1,
    );
    if (windows.length === 0) return;

    for (const win of windows) {
      const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
      // Find all combo events in this window, sorted by startFrame
      const combos = this.registeredEvents
        .filter((ev) =>
          ev.columnId === NounType.COMBO &&
          ev.ownerId === win.ownerId &&
          ev.startFrame >= win.startFrame &&
          ev.startFrame < winEnd,
        )
        .sort((a, b) => a.startFrame - b.startFrame);

      // Clamp each combo's cooldown to end at the next combo's start
      for (let i = 0; i < combos.length - 1; i++) {
        this.resetCooldown(combos[i].uid, combos[i + 1].startFrame);
      }
    }
  }

  resetCooldown(eventUid: string, resetFrame: number) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid !== eventUid) continue;
      const ev = this.registeredEvents[i];
      let preCooldownDur = 0;
      for (const s of ev.segments) {
        if (s.properties.name === 'Cooldown') {
          // IMMEDIATE_COOLDOWN starts at event offset 0, so don't subtract pre-cooldown duration
          const isImmediate = s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN);
          s.properties.duration = Math.max(0, resetFrame - ev.startFrame - (isImmediate ? 0 : preCooldownDur));
        } else {
          preCooldownDur += s.properties.duration;
        }
      }
      ev.nonOverlappableRange = computeSegmentsSpan(ev.segments);
      return;
    }
  }

  reduceCooldown(eventUid: string, newCooldownDuration: number) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid !== eventUid) continue;
      for (const s of this.registeredEvents[i].segments) {
        if (s.properties.name === 'Cooldown') {
          s.properties.duration = Math.max(0, newCooldownDuration);
        }
      }
      this.registeredEvents[i].nonOverlappableRange = computeSegmentsSpan(this.registeredEvents[i].segments);
      return;
    }
  }

  /** Replace all combo activation windows with a fresh set. */
  replaceComboWindows(freshWindows: TimelineEvent[]) {
    // Remove old windows
    this.registeredEvents = this.registeredEvents.filter(ev => ev.columnId !== COMBO_WINDOW_COLUMN_ID);
    // Register new ones
    for (const w of freshWindows) {
      this.registeredEvents.push(w);
      this.extendedIds.add(w.uid);
    }
  }

  /**
   * Clamp combo activation windows so they don't extend past the combo event's end.
   * Called after the queue run when CD resets may have shortened combo events.
   */
  clampComboWindowsToEventEnd() {
    const windows = this.registeredEvents.filter(ev => ev.columnId === COMBO_WINDOW_COLUMN_ID);
    for (const win of windows) {
      const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
      const combos = this.registeredEvents.filter(ev =>
        ev.columnId === NounType.COMBO &&
        ev.ownerId === win.ownerId &&
        ev.startFrame >= win.startFrame &&
        ev.startFrame < winEnd,
      );
      if (combos.length === 0) continue;
      // Use the earliest combo end that falls before the window end (the CD-reset combo)
      const comboEnds = combos.map(c => c.startFrame + computeSegmentsSpan(c.segments)).filter(e => e < winEnd);
      if (comboEnds.length === 0) continue;
      const clampEnd = Math.min(...comboEnds);
      if (win.segments.length > 0) {
        win.segments[0].properties.duration = Math.max(0, clampEnd - win.startFrame);
      }
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

  /** Clamp only active events matching a predicate in a column. */
  private clampActiveFiltered(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, status: EventStatusType, predicate: (ev: TimelineEvent) => boolean,
  ) {
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (!predicate(ev)) continue;
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
      if (!predicate(ev)) continue;
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
    s.properties.segmentTypes?.includes(SegmentType.ANIMATION) ? { ...s, properties: { ...s.properties, duration } } : s,
  );
}