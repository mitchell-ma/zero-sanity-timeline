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
import { CombatSkillType, EventStatusType, SegmentType, StackInteractionType, StatusType, TimeDependency } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from './processTimeStop';
import { buildReactionSegment, buildCorrosionSegments, mergeReactions, attachReactionFrames } from './processInfliction';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, OPERATOR_COLUMNS, REACTION_COLUMNS, REACTION_COLUMN_IDS, REACTION_DURATION, SKILL_COLUMNS } from '../../model/channels';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { StatusLevel } from '../../consts/types';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import { MAX_INFLICTION_STACKS } from './eventQueueTypes';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo, getTeamStatusColumnId } from '../gameDataStore';
import type { TriggerAssociation } from '../gameDataStore';
import type { SkillPointController } from '../slot/skillPointController';
import type { UltimateEnergyController } from './ultimateEnergyController';
import { collectNoGainWindowsForEvent } from './ultimateEnergyController';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { genEventUid } from './inputEventController';
import { getAllOperatorStatuses } from '../gameDataStore';
import { allocInputEvent, allocDerivedEvent } from './objectPool';
import { getStatusStackingMode } from './eventPresentationController';

/** Source metadata for event mutations. */
interface EventSource {
  ownerId: string;
  skillName: string;
}

// ── Status stack limit cache (from operator status configs) ──────────────────

let _statusStackLimitCache: Map<string, number> | null = null;

export function getStatusStackLimit(statusId: string): number | undefined {
  if (!_statusStackLimitCache) {
    _statusStackLimitCache = new Map();
    for (const s of getAllOperatorStatuses()) {
      if (!s.stacks) continue;
      _statusStackLimitCache.set(s.id, s.maxStacks);
      // Also index by kebab-case column ID and display name for freeform event lookup
      const kebab = s.id.toLowerCase().replace(/_/g, '-');
      if (kebab !== s.id) _statusStackLimitCache.set(kebab, s.maxStacks);
      if (s.name && s.name !== s.id) _statusStackLimitCache.set(s.name, s.maxStacks);
    }
  }
  return _statusStackLimitCache.get(statusId);
}

export class DerivedEventController {
  private stacks = new Map<string, TimelineEvent[]>();
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
   * Reset all internal state for reuse without deallocating containers.
   * Call this instead of creating a new DerivedEventController each pipeline run.
   */
  reset(
    triggerAssociations?: TriggerAssociation[],
    slotWirings?: SlotTriggerWiring[],
    spController?: SkillPointController,
    ueController?: UltimateEnergyController,
  ) {
    this.stacks.clear();
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
    ev.id = CombatSkillType.CONTROL;
    ev.name = CombatSkillType.CONTROL;
    ev.ownerId = firstOccupiedSlotId;
    ev.columnId = OPERATOR_COLUMNS.INPUT;
    ev.startFrame = 0;
    ev.segments = [{ properties: { duration: TOTAL_FRAMES } }];
    ev.sourceOwnerId = operatorId ?? firstOccupiedSlotId;
    ev.sourceSkillName = CombatSkillType.CONTROL;
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
      if (ev.id === CombatSkillType.CONTROL && ev.columnId === OPERATOR_COLUMNS.INPUT) {
        for (let j = 0; j < this.registeredEvents.length; j++) {
          const prev = this.registeredEvents[j];
          if (prev.id !== CombatSkillType.CONTROL || prev.columnId !== OPERATOR_COLUMNS.INPUT) continue;
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

      // Status events: apply stacking interaction for freeform events only.
      // Queue-derived events (already extended) were processed by createStatus.
      if (!this.extendedIds.has(ev.uid) && ev.id) {
        const stackingMode = getStatusStackingMode(ev.id);
        if (stackingMode) {
          const maxStacks = getStatusStackLimit(ev.id);
          const activeCount = maxStacks != null
            ? this.activeEventsIn(ev.columnId, ev.ownerId, ev.startFrame).length
            : 0;
          const source = { ownerId: ev.sourceOwnerId ?? ev.ownerId, skillName: ev.sourceSkillName ?? 'Freeform' };

          // MERGE: always subsume all active instances
          if (stackingMode === StackInteractionType.MERGE) {
            const active = this.activeEventsIn(ev.columnId, ev.ownerId, ev.startFrame);
            for (const act of active) {
              setEventDuration(act, ev.startFrame - act.startFrame);
              act.eventStatus = EventStatusType.CONSUMED;
              act.eventStatusOwnerId = source.ownerId;
              act.eventStatusSkillName = source.skillName;
            }
          }

          // At capacity: RESET clamps oldest, NONE skips the event
          if (maxStacks != null && activeCount >= maxStacks) {
            if (stackingMode === StackInteractionType.RESET) {
              this.resetOldest(ev.columnId, ev.ownerId, ev.startFrame, source);
            } else if (stackingMode === StackInteractionType.NONE) {
              continue; // skip — at capacity with no overflow behavior
            }
          }
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
      if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
      const merged = mergedBySlot.get(ev.ownerId);
      const match = merged?.find(w => ev.startFrame >= w.startFrame && ev.startFrame < w.endFrame);
      if (match?.sourceColumnId != null && match.sourceColumnId !== ev.comboTriggerColumnId) {
        ev.comboTriggerColumnId = match.sourceColumnId;
      } else if (!match && ev.comboTriggerColumnId != null) {
        ev.comboTriggerColumnId = undefined;
      }
    }
  }

  /**
   * Notify SP and UE controllers about resource effects on a newly registered event.
   * Called per-event after extension and frame position computation in pass 2.
   */
  private notifyResourceControllers(ev: TimelineEvent) {
    // ── SP notifications ──────────────────────────────────────────────────
    if (this.spController) {
      // Battle skill with SP cost → event-level cost + frame-level returns
      if (ev.columnId === SKILL_COLUMNS.BATTLE && ev.skillPointCost) {
        const firstFrame = ev.segments[0]?.frames?.[0];
        const gaugeGainFrame = firstFrame?.absoluteFrame ?? ev.startFrame;
        this.spController.addCost(ev.uid, ev.startFrame, ev.skillPointCost, ev.ownerId, gaugeGainFrame);

        // Frame-level SP recovery on battle skill frames
        for (const seg of ev.segments) {
          for (const f of seg.frames ?? []) {
            if (f.skillPointRecovery && f.skillPointRecovery > 0 && f.absoluteFrame != null) {
              this.spController.addRecovery(f.absoluteFrame, f.skillPointRecovery, ev.ownerId, ev.name);
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
          ev.ownerId, ev.name,
        );
      }
    }

    // ── UE notifications ──────────────────────────────────────────────────
    if (this.ueController) {
      // Combo skill → gauge gain from frames
      if (ev.columnId === SKILL_COLUMNS.COMBO) {
        for (const seg of ev.segments) {
          for (const f of seg.frames ?? []) {
            const selfGain = f.gaugeGain ?? 0;
            const teamGain = f.teamGaugeGain ?? 0;
            if ((selfGain > 0 || teamGain > 0) && f.absoluteFrame != null) {
              this.ueController.addGaugeGain(f.absoluteFrame, ev.ownerId, selfGain, teamGain);
            }
          }
        }
      }

      // Battle skill → frame-level gaugeGain markers (not SP-based)
      if (ev.columnId === SKILL_COLUMNS.BATTLE) {
        for (const seg of ev.segments) {
          for (const f of seg.frames ?? []) {
            if (f.gaugeGain && f.gaugeGain > 0 && f.absoluteFrame != null) {
              this.ueController.addGaugeGain(f.absoluteFrame, ev.ownerId, f.gaugeGain, 0);
            }
          }
        }
      }

      // Ultimate event → consume + no-gain windows
      if (ev.columnId === SKILL_COLUMNS.ULTIMATE) {
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
    let hasFrames = false;
    for (const seg of ev.segments) {
      if (seg.frames && seg.frames.length > 0) { hasFrames = true; break; }
    }
    if (!hasFrames) return ev;

    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      const segStart = cumulativeOffset;
      cumulativeOffset += seg.properties.duration;
      if (!seg.frames) continue;
      const segAbsStart = ev.startFrame + segStart;
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
    options?: { uid?: string },
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
            uid: `${options?.uid ?? columnId}-reaction`,
            stacks: otherActive.length,
          });
          // Emit a consumed copy of the incoming infliction so freeform raw
          // events can be replaced with their reacted state.
          const consumed = allocDerivedEvent();
          consumed.uid = options?.uid ?? `${columnId}-${genEventUid()}`;
          consumed.id = columnId;
          consumed.name = columnId;
          consumed.ownerId = ownerId;
          consumed.columnId = columnId;
          consumed.startFrame = frame;
          consumed.segments = [{ properties: { duration: 0 } }];
          consumed.sourceOwnerId = source.ownerId;
          consumed.sourceSkillName = source.skillName;
          consumed.eventStatus = EventStatusType.CONSUMED;
          consumed.eventStatusOwnerId = source.ownerId;
          consumed.eventStatusSkillName = source.skillName;
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
    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `${columnId}-${genEventUid()}`;
    ev.id = columnId;
    ev.name = columnId;
    ev.ownerId = ownerId;
    ev.columnId = columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: extendedDuration } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    if (isArtsBurst) ev.isArtsBurst = true;
    this.rawDurations.set(ev.uid, rawDur);
    existing.push(ev);
    this.stacks.set(key, existing);
    this.output.push(ev);

    // Record the stack position at creation time so it survives consumed-event filtering
    const activeAfterCreation = this.activeEventsIn(columnId, ownerId, frame);
    ev.stacks = activeAfterCreation.length;

    // Extend co-active inflictions to match the new one's end
    const newEnd = frame + extendedDuration;
    const remainingActive = activeAfterCreation;
    for (const act of remainingActive) {
      if (act.uid === ev.uid) continue;
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
    options?: { stacks?: number; forcedReaction?: boolean; uid?: string },
  ) {
    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `reaction-${columnId}-${genEventUid()}`;
    ev.id = columnId;
    ev.name = columnId;
    ev.ownerId = ownerId;
    ev.columnId = columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    ev.stacks = options?.stacks;
    ev.forcedReaction = options?.forcedReaction;

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

        const prevStacks = prev.stacks ?? 1;
        const remainingOldDuration = prevEnd - ev.startFrame;

        const elapsedSeconds = (ev.startFrame - prev.startFrame) / FPS;
        const oldReductionFloor = prev.reductionFloor ?? 0;
        const oldArtsIntensity = prev.artsIntensity ?? 0;
        const oldBaseReduction = getCorrosionBaseReduction(
          Math.min(prevStacks, 4) as StatusLevel,
          elapsedSeconds,
        ) * getCorrosionReductionMultiplier(oldArtsIntensity);

        setEventDuration(ev, Math.max(remainingOldDuration, eventDuration(ev)));
        ev.stacks = Math.max(prevStacks, ev.stacks ?? 1);
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
      const fStops = this.foreignStopsFor(ev);
      const seg = buildReactionSegment(ev, rawDur, fStops);
      if (seg) ev.segments = [seg];
    }

    this.rawDurations.set(ev.uid, rawDur);
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
    options?: { statusId?: string; stackingMode?: string; uid?: string; maxStacks?: number; event?: Partial<TimelineEvent> },
  ): boolean {
    const statusId = options?.statusId ?? columnId;

    // MERGE: subsume all active instances into the new one (always, not just at capacity)
    if (options?.stackingMode === StackInteractionType.MERGE) {
      const active = this.activeEventsIn(columnId, ownerId, frame);
      for (const act of active) {
        setEventDuration(act, frame - act.startFrame);
        act.eventStatus = EventStatusType.CONSUMED;
        act.eventStatusOwnerId = source.ownerId;
        act.eventStatusSkillName = source.skillName;
      }
    }

    // Enforce stack limit — RESET clamps oldest when at capacity
    const maxStacks = options?.maxStacks ?? getStatusStackLimit(statusId);
    if (maxStacks != null) {
      const active = this.activeCount(columnId, ownerId, frame);
      if (active >= maxStacks) {
        if (options?.stackingMode === StackInteractionType.RESET) {
          this.resetOldest(columnId, ownerId, frame, source);
        } else {
          return false;
        }
      }
    }

    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `${statusId.toLowerCase()}-${genEventUid()}`;
    ev.id = statusId;
    ev.name = statusId;
    ev.ownerId = ownerId;
    ev.columnId = columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    if (options?.event) Object.assign(ev, options.event);

    this.addEvent(ev);
    return true;
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
   * Consume the N oldest active events in a column (e.g. CONSUME THIS EVENT with stacks count).
   */
  consumeOldest(
    columnId: string, ownerId: string, frame: number,
    count: number, source: EventSource,
  ): number {
    const allActive = this.activeEventsIn(columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    const toConsume = allActive.slice(0, count);
    for (const ev of toConsume) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return toConsume.length;
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

  // ── Link consumption tracking ──────────────────────────────────────────

  /**
   * Try to consume Link for a battle skill or ultimate event.
   * If Link is active, consumes it and records the stack count against the event UID.
   * Returns the number of stacks consumed (0 if none).
   */
  consumeLink(eventUid: string, frame: number, source: EventSource): number {
    const linkColumnId = getTeamStatusColumnId(StatusType.LINK) ?? StatusType.LINK;
    const isLink = (ev: TimelineEvent) => ev.id === StatusType.LINK;
    const linkEvents = this.activeEventsIn(linkColumnId, COMMON_OWNER_ID, frame)
      .filter(isLink);
    if (linkEvents.length === 0) return 0;
    this.clampActiveFiltered(linkColumnId, COMMON_OWNER_ID, frame, source, EventStatusType.CONSUMED, isLink);
    const clampedStacks = Math.min(linkEvents.length, 4);
    this.linkConsumptions.set(eventUid, clampedStacks);
    return clampedStacks;
  }

  /** Get the Link stack count consumed by an event (0 if none). */
  getLinkStacks(eventUid: string): number {
    return this.linkConsumptions.get(eventUid) ?? 0;
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

  private extendDuration(startFrame: number, rawDuration: number, eventUid?: string) {
    const foreign = eventUid && this.registeredStopIds.has(eventUid)
      ? this.stops.filter(s => s.eventUid !== eventUid)
      : this.stops;
    return extendByTimeStops(startFrame, rawDuration, foreign);
  }

  private foreignStopsFor(ev: TimelineEvent): readonly TimeStopRegion[] {
    return isTimeStopEvent(ev) ? this.stops.filter(s => s.eventUid !== ev.uid) : this.stops;
  }

  /**
   * Extend a single event's durations by foreign time-stops.
   * Handles segmented events, 3-phase events, and time-stop events.
   */
  private extendSingleEvent(ev: TimelineEvent): TimelineEvent {
    // Control status is not affected by time-stops — its timer keeps ticking
    if (ev.id === CombatSkillType.CONTROL) return ev;

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
      for (const seg of ev.segments) {
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
      return ev;
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
        setEventDuration(ev, this.extendDuration(ev.startFrame, raw, ev.uid));
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
      if (ev.id === CombatSkillType.CONTROL) {
        warnings.push('Control swap cannot occur during time-stop');
        continue;
      }

      const sourceIsDodge = source.columnId === OPERATOR_COLUMNS.INPUT && !!source.isPerfectDodge;
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
    ev.warnings = ev.warnings ? [...ev.warnings, ...warnings] : warnings;
    return ev;
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

  /** Check if a given operator is the controlled operator at a given frame. */
  isControlledAt(ownerId: string, frame: number): boolean {
    return this.activeEventsIn(OPERATOR_COLUMNS.INPUT, ownerId, frame)
      .some((ev) => ev.id === CombatSkillType.CONTROL);
  }

  // ── Generic event insertion ──────────────────────────────────────────────

  addEvent(ev: TimelineEvent) {
    const rawDur = eventDuration(ev);
    if (rawDur > 0) {
      setEventDuration(ev, this.extendDuration(ev.startFrame, rawDur, ev.uid));
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
    const active = this.activeEventsIn(columnId, ownerId, frame)
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
  resetCooldown(eventUid: string, resetFrame: number) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid !== eventUid) continue;
      const ev = this.registeredEvents[i];
      let preCooldownDur = 0;
      for (const s of ev.segments) {
        if (s.properties.name === 'Cooldown') {
          s.properties.duration = Math.max(0, resetFrame - ev.startFrame - preCooldownDur);
        } else {
          preCooldownDur += s.properties.duration;
        }
      }
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