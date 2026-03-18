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
import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { CombatSkillsType, EventStatusType, TimeDependency } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from './processTimeStop';
import { REACTION_DURATION, buildReactionSegment, buildCorrosionSegments } from './processInfliction';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, REACTION_COLUMNS, SKILL_COLUMNS } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { StatusLevel } from '../../consts/types';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import { MAX_INFLICTION_STACKS } from './eventQueueTypes';
import { resolveComboTriggerColumns } from './processComboSkill';
import type { SlotTriggerWiring } from './processComboSkill';

// ── Potential-effect constants ───────────────────────────────────────────────

/** Map of ultimate skill names → combo cooldown reset at potential threshold. */
const ULTIMATE_RESETS_COMBO: Record<string, number> = {
  [CombatSkillsType.WOLVEN_FURY]: 5, // Wulfgard P5: Natural Predator
};

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

  constructor(baseEvents?: TimelineEvent[]) {
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
   * Register events with inline combo chaining and time-stop discovery.
   * Call `extendAll()` after registration to extend durations.
   */
  registerEvents(events: TimelineEvent[]) {
    for (let i = 0; i < events.length; i++) {
      let ev = events[i];

      // Combo chaining: truncate overlapping combo animations
      if (ev.columnId === SKILL_COLUMNS.COMBO && (ev.animationDuration ?? 0) > 0) {
        ev = this.handleComboChaining(ev);
      }

      this.maybeRegisterStop(ev);
      this.registeredEvents.push(ev);
    }
  }

  /**
   * Extend all not-yet-extended registered events by foreign time-stops.
   * Each event is extended individually using the shared stops array.
   */
  extendAll() {
    if (this.stops.length === 0) return;
    this.registeredEvents = this.registeredEvents.map(ev => {
      if (this.extendedIds.has(ev.id)) return ev;
      return this.extendSingleEvent(ev);
    });
  }

  /**
   * Apply potential-gated effects that modify operator events:
   * - Combo cooldown reset on ultimate cast (e.g. Wulfgard P5)
   */
  applyPotentialEffects() {
    const ultimates = this.registeredEvents.filter(
      ev => ev.columnId === SKILL_COLUMNS.ULTIMATE && ULTIMATE_RESETS_COMBO[ev.name] != null
        && (ev.operatorPotential ?? 0) >= ULTIMATE_RESETS_COMBO[ev.name],
    );
    if (ultimates.length === 0) return;

    const modified = new Map<string, TimelineEvent>();
    for (const ult of ultimates) {
      const ultFrame = ult.startFrame;
      for (const ev of this.registeredEvents) {
        if (ev.ownerId !== ult.ownerId || ev.columnId !== SKILL_COLUMNS.COMBO) continue;
        const activeEnd = ev.startFrame + ev.activationDuration + ev.activeDuration;
        const cooldownEnd = activeEnd + ev.cooldownDuration;
        if (ultFrame >= activeEnd && ultFrame < cooldownEnd) {
          modified.set(ev.id, { ...ev, cooldownDuration: Math.max(0, ultFrame - activeEnd) });
        }
      }
    }

    if (modified.size > 0) {
      this.registeredEvents = this.registeredEvents.map(ev => modified.get(ev.id) ?? ev);
    }
  }

  /**
   * Resolve combo trigger columns on combo events using operator trigger
   * capabilities and current stops.
   */
  resolveComboTriggers(slotWirings: SlotTriggerWiring[]) {
    if (slotWirings.length === 0) return;
    this.registeredEvents = resolveComboTriggerColumns(
      this.registeredEvents, slotWirings, this.stops,
    );
  }

  /**
   * Cache absoluteFrame and derivedOffsetFrame on all frame markers.
   * Replaces the post-queue resolveFramePositions pass.
   */
  cacheFramePositions() {
    this.registeredEvents = this.registeredEvents.map(ev => {
      if (!ev.segments) return ev;
      const fStops = this.foreignStopsFor(ev);
      let cumulativeOffset = 0;
      const newSegments = ev.segments.map(seg => {
        const segStart = cumulativeOffset;
        cumulativeOffset += seg.durationFrames;
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
    });
  }

  /**
   * Validate that events starting inside time-stop regions are allowed.
   * Attaches warnings to events that violate game rules.
   */
  validateAll() {
    if (this.stops.length === 0) return;

    const evById = new Map<string, TimelineEvent>();
    for (const ev of this.registeredEvents) evById.set(ev.id, ev);

    this.registeredEvents = this.registeredEvents.map(ev => {
      const warnings: string[] = [];

      for (const stop of this.stops) {
        if (stop.eventId === ev.id) continue;
        const stopEnd = stop.startFrame + stop.durationFrames;
        if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

        const source = evById.get(stop.eventId);
        if (!source) continue;

        const sourceIsUltimate = source.columnId === SKILL_COLUMNS.ULTIMATE;
        const sourceIsDodge = source.columnId === 'dash' && !!source.isPerfectDodge;
        if (sourceIsDodge) continue;

        if (ev.columnId === SKILL_COLUMNS.COMBO && sourceIsUltimate) {
          warnings.push('Combo skill cannot start during ultimate animation time-stop');
        }
        if (ev.columnId === SKILL_COLUMNS.ULTIMATE && sourceIsUltimate) {
          warnings.push("Ultimate cannot start during another ultimate's animation time-stop");
        }
      }

      if (warnings.length === 0) return ev;
      return { ...ev, warnings: [...(ev.warnings ?? []), ...warnings] };
    });
  }

  /** Get all registered events (extended, with transforms applied). */
  getRegisteredEvents(): TimelineEvent[] {
    return this.registeredEvents;
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
      this.stacks.forEach((events, key) => {
        const colId = key.split(':')[0];
        if (colId === columnId) return;
        if (!INFLICTION_COLUMN_IDS.has(colId)) return;
        for (const ev of events) {
          if (ev.eventStatus === EventStatusType.CONSUMED) continue;
          const end = ev.startFrame + ev.activationDuration;
          if (ev.startFrame <= frame && frame < end) {
            otherActive.push(ev);
          }
        }
      });

      if (otherActive.length > 0) {
        const reactionColumnId = INFLICTION_TO_REACTION[columnId];
        if (reactionColumnId) {
          for (const consumed of otherActive) {
            consumed.activationDuration = frame - consumed.startFrame;
            consumed.eventStatus = EventStatusType.CONSUMED;
            consumed.eventStatusOwnerId = source.ownerId;
            consumed.eventStatusSkillName = source.skillName;
          }
          this.createReaction(reactionColumnId, ENEMY_OWNER_ID, frame, REACTION_DURATION, source, {
            id: `${options?.id ?? columnId}-reaction`,
            inflictionStacks: otherActive.length,
          });
          return;
        }
      }
    }

    // Deque stacking: evict oldest if at max stacks
    const key = this.key(columnId, ownerId);
    const existing = this.stacks.get(key) ?? [];
    const active = this.activeEventsIn(columnId, ownerId, frame);

    if (active.length >= MAX_INFLICTION_STACKS) {
      const oldest = active[0];
      oldest.activationDuration = frame - oldest.startFrame;
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
      activationDuration: extendedDuration,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: source.ownerId,
      sourceSkillName: source.skillName,
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
      const actEnd = act.startFrame + act.activationDuration;
      if (newEnd > actEnd) {
        act.activationDuration = newEnd - act.startFrame;
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
      activationDuration: durationFrames,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: source.ownerId,
      sourceSkillName: source.skillName,
      statusLevel: options?.statusLevel,
      inflictionStacks: options?.inflictionStacks,
      forcedReaction: options?.forcedReaction,
    };

    const rawDur = ev.activationDuration;
    ev.activationDuration = this.extendDuration(ev.startFrame, rawDur);

    const key = this.key(ev.columnId, ev.ownerId);
    const existing = this.stacks.get(key) ?? [];
    const active = existing.filter(r =>
      r.eventStatus !== EventStatusType.CONSUMED &&
      r.eventStatus !== EventStatusType.REFRESHED &&
      r.startFrame <= ev.startFrame && ev.startFrame < r.startFrame + r.activationDuration
    );

    if (active.length > 0) {
      const prev = active[active.length - 1];
      const prevEnd = prev.startFrame + prev.activationDuration;

      if (ev.columnId === REACTION_COLUMNS.CORROSION) {
        prev.activationDuration = ev.startFrame - prev.startFrame;
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

        ev.activationDuration = Math.max(remainingOldDuration, ev.activationDuration);
        ev.statusLevel = Math.max(prevStatusLevel, ev.statusLevel ?? 1);
        ev.inflictionStacks = Math.max(prevStacks, ev.inflictionStacks ?? 1);
        ev.reductionFloor = Math.max(oldReductionFloor, oldBaseReduction);
      } else {
        const newEnd = ev.startFrame + ev.activationDuration;
        if (newEnd >= prevEnd) {
          prev.activationDuration = ev.startFrame - prev.startFrame;
          prev.eventStatus = EventStatusType.REFRESHED;
          prev.eventStatusOwnerId = source.ownerId;
          prev.eventStatusSkillName = source.skillName;
        }
      }
    }

    if (!ev.segments) {
      if (ev.columnId === REACTION_COLUMNS.CORROSION) {
        const segs = buildCorrosionSegments(ev);
        if (segs) ev.segments = segs;
      } else {
        const seg = buildReactionSegment(ev);
        if (seg) ev.segments = [seg];
      }
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
      activationDuration: durationFrames,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: source.ownerId,
      sourceSkillName: source.skillName,
      ...options?.event,
    };

    if (options?.stackingMode === 'MERGE') {
      // Subsume older: clamp all active, keep the new one
      const active = this.activeEventsIn(columnId, ownerId, frame);
      for (const act of active) {
        act.activationDuration = frame - act.startFrame;
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
      ev.activationDuration = frame - ev.startFrame;
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
    let animDur = ev.animationDuration!;
    let activationDur = ev.activationDuration;
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
            animationDuration: truncated,
            activationDuration: Math.min(reg.activationDuration, truncated),
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
        activationDur = Math.min(activationDur, truncated);
        changed = true;
        break;
      }
    }

    // Track for future chaining
    this.comboStops.push({ id: ev.id, startFrame: ev.startFrame, animDur });
    this.comboStops.sort((a, b) => a.startFrame - b.startFrame);

    if (changed) {
      return { ...ev, animationDuration: animDur, activationDuration: activationDur };
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
      durationFrames: ev.animationDuration!,
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
    const animDur = ev.animationDuration ?? 0;
    const foreignStops = isOwn
      ? this.stops.filter(s => s.eventId !== ev.id)
      : this.stops;
    if (foreignStops.length === 0) return ev;

    // ── Segmented events ───────────────────────────────────────────────
    if (ev.segments && ev.segments.length > 0) {
      let rawOffset = 0;
      let derivedOffset = 0;
      let changed = false;
      const newSegments = ev.segments.map(seg => {
        const rawSegStart = rawOffset;
        rawOffset += seg.durationFrames;

        if (seg.timeDependency === TimeDependency.REAL_TIME || seg.durationFrames === 0) {
          derivedOffset += seg.durationFrames;
          return seg;
        }

        if (isOwn && animDur > 0 && rawSegStart + seg.durationFrames <= animDur) {
          derivedOffset += seg.durationFrames;
          return seg;
        }

        let ext: number;
        if (isOwn && animDur > 0 && rawSegStart < animDur) {
          const animPortion = animDur - rawSegStart;
          const postAnimPortion = seg.durationFrames - animPortion;
          ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
        } else {
          ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.durationFrames, foreignStops);
        }

        derivedOffset += ext;
        if (ext === seg.durationFrames) return seg;
        changed = true;
        return { ...seg, durationFrames: ext };
      });

      if (!changed) return ev;
      this.extendedIds.add(ev.id);
      return { ...ev, activationDuration: computeSegmentsSpan(newSegments), segments: newSegments };
    }

    // ── 3-phase events ─────────────────────────────────────────────────
    if (ev.timeDependency === TimeDependency.REAL_TIME) return ev;

    let newActivation = ev.activationDuration;
    let newActive = ev.activeDuration;

    if (!isOwn || animDur <= 0) {
      if (ev.activationDuration > 0) {
        newActivation = extendByTimeStops(ev.startFrame, ev.activationDuration, foreignStops);
      }
      if (ev.activeDuration > 0) {
        newActive = extendByTimeStops(ev.startFrame + newActivation, ev.activeDuration, foreignStops);
      }
    } else {
      if (ev.activationDuration > animDur) {
        const postAnim = ev.activationDuration - animDur;
        newActivation = animDur + extendByTimeStops(ev.startFrame + animDur, postAnim, foreignStops);
      }
      if (ev.activeDuration > 0) {
        newActive = extendByTimeStops(ev.startFrame + newActivation, ev.activeDuration, foreignStops);
      }
    }

    if (newActivation === ev.activationDuration && newActive === ev.activeDuration) return ev;
    this.extendedIds.add(ev.id);
    return { ...ev, activationDuration: newActivation, activeDuration: newActive };
  }

  private reExtendQueueEvents() {
    this.stacks.forEach((events) => {
      for (const ev of events) {
        if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) continue;
        if (ev.eventStatus === EventStatusType.EXTENDED) continue;
        const raw = this.rawDurations.get(ev.id);
        if (raw == null) continue;
        ev.activationDuration = this.extendDuration(ev.startFrame, raw, ev.id);
      }
    });
  }

  // ── Active event queries ─────────────────────────────────────────────────

  private activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    const result: TimelineEvent[] = [];
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration) result.push(ev);
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration) result.push(ev);
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
    const rawDur = ev.activationDuration;
    if (rawDur > 0) {
      ev.activationDuration = this.extendDuration(ev.startFrame, rawDur, ev.id);
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

  // ── Private helpers ────────────────────────────────────────────────────

  /** Clamp all active events at frame in a column: truncate duration and set status. */
  private clampActive(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, status: EventStatusType,
  ) {
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + ev.activationDuration;
      if (ev.startFrame <= frame && frame < end) {
        ev.activationDuration = frame - ev.startFrame;
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + ev.activationDuration;
      if (ev.startFrame <= frame && frame < end) {
        ev.activationDuration = frame - ev.startFrame;
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
  }
}