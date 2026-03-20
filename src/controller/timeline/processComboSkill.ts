import { TimelineEvent, computeSegmentsSpan, getAnimationDuration } from '../../consts/viewTypes';
import { CombatSkillsType, SegmentType } from '../../consts/enums';
import { SKILL_COLUMNS } from '../../model/channels';
import { TimeStopRegion, isTimeStopEvent, extendByTimeStops, foreignStopsFor } from './processTimeStop';
import { findClauseTriggerMatches } from './statusDerivationEngine';
import { getComboTriggerClause, getComboTriggerInfo } from '../../model/event-frames/operatorJsonLoader';

// ── Combo time-stop chaining ─────────────────────────────────────────────────

/**
 * Combo time-stop chaining: combo time-stops are special — other combos can
 * be triggered within a combo's time-stop region. A combo's time-stop covers
 * the game-frame range [startFrame, startFrame + animationDuration). When
 * another combo's startFrame falls within that range, the earlier combo's
 * time-stop is cut short at the interruption point.
 *
 * Effective animDur = B.startFrame - A.startFrame (truncated band width).
 * The game frames [A.startFrame, B.startFrame) become a "frozen range" in
 * the layout — they collapse to zero real-time width, with A's truncated
 * time-stop band filling that space. The two bands render adjacent (no gap).
 */
export function applyComboChaining(events: TimelineEvent[]): TimelineEvent[] {
  const comboStops: { id: string; startFrame: number; animDur: number }[] = [];
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    const anim = getAnimationDuration(ev);
    if (anim <= 0) continue;
    comboStops.push({ id: ev.id, startFrame: ev.startFrame, animDur: anim });
  }
  if (comboStops.length <= 1) return events;

  comboStops.sort((a, b) => a.startFrame - b.startFrame);

  const overrides = new Map<string, number>();
  for (let i = 0; i < comboStops.length; i++) {
    const a = comboStops[i];
    const effectiveAnimDur = overrides.get(a.id) ?? a.animDur;
    const coveredEnd = a.startFrame + effectiveAnimDur;

    for (let j = i + 1; j < comboStops.length; j++) {
      const b = comboStops[j];
      if (b.startFrame >= coveredEnd) break;

      // B starts within A's time-stop band (real-time overlap) — truncate
      // A's animation at B's start.
      overrides.set(a.id, b.startFrame - a.startFrame);
      break;
    }
  }

  if (overrides.size === 0) return events;
  return events.map((ev) => {
    const truncatedAnim = overrides.get(ev.id);
    if (truncatedAnim == null) return ev;
    const newSegments = ev.segments.map(s =>
      s.metadata?.segmentType === SegmentType.ANIMATION ? { ...s, properties: { ...s.properties, duration: truncatedAnim } } : s,
    );
    return { ...ev, segments: newSegments };
  });
}

// ── Potential-based effects ──────────────────────────────────────────────────

/** Map of ultimate skill names → combo cooldown reset at potential threshold. */
const ULTIMATE_RESETS_COMBO: Record<string, number> = {
  [CombatSkillsType.WOLVEN_FURY]: 5, // Wulfgard P5: Natural Predator
};

/**
 * Applies potential-gated effects that modify operator events:
 * - Combo cooldown reset on ultimate cast (e.g. Wulfgard P5)
 */
export function applyPotentialEffects(events: TimelineEvent[]): TimelineEvent[] {
  const ultimates = events.filter(
    (ev) => ev.columnId === SKILL_COLUMNS.ULTIMATE && ULTIMATE_RESETS_COMBO[ev.name] != null
      && (ev.operatorPotential ?? 0) >= ULTIMATE_RESETS_COMBO[ev.name],
  );
  if (ultimates.length === 0) return events;

  const modified = new Map<string, TimelineEvent>();
  for (const ult of ultimates) {
    const ultFrame = ult.startFrame;
    for (const ev of events) {
      if (ev.ownerId !== ult.ownerId || ev.columnId !== SKILL_COLUMNS.COMBO) continue;
      // With segments, compute pre-cooldown and total duration
      let preCooldownDur = 0;
      let totalDur = 0;
      for (const s of ev.segments) {
        totalDur += s.properties.duration;
        if (s.properties.name !== 'Cooldown') preCooldownDur += s.properties.duration;
      }
      const activeEnd = ev.startFrame + preCooldownDur;
      const cooldownEnd = ev.startFrame + totalDur;
      // If the combo is in its cooldown phase when the ultimate is cast, reset it
      if (ultFrame >= activeEnd && ultFrame < cooldownEnd) {
        modified.set(ev.id, {
          ...ev,
          segments: ev.segments.map(s => {
            if (s.properties.name !== 'Cooldown') return s;
            const cooldownRemaining = Math.max(0, ultFrame - ev.startFrame - preCooldownDur);
            return { ...s, properties: { ...s.properties, duration: cooldownRemaining } };
          }),
        });
      }
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}

// ── Combo activation window derivation ──────────────────────────────────────

/** Column ID for derived combo activation window events. */
export const COMBO_WINDOW_COLUMN_ID = 'comboActivationWindow';

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  operatorId: string;
}

/**
 * Derive combo activation window events from processed events + operator trigger capabilities.
 * Each window becomes a single-segment derived TimelineEvent.
 */
export function deriveComboActivationWindows(
  events: TimelineEvent[],
  slotWirings: SlotTriggerWiring[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  // Intermediate accumulator: slotId → unsorted windows
  const windowsBySlot = new Map<string, { startFrame: number; endFrame: number; sourceEventId: string; sourceOwnerId?: string; sourceSkillName?: string; sourceColumnId?: string }[]>();

  // Build slotId → index for event ownership lookup
  const slotIdToIndex = new Map<string, number>();
  for (let i = 0; i < slotWirings.length; i++) {
    slotIdToIndex.set(slotWirings[i].slotId, i);
  }

  // Build set of combo time-stop event IDs per slot, so a slot's own combo
  // time stops don't extend its combo activation window duration.
  const comboStopIdsBySlot = new Map<string, Set<string>>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO || !isTimeStopEvent(ev)) continue;
    if (!comboStopIdsBySlot.has(ev.ownerId)) comboStopIdsBySlot.set(ev.ownerId, new Set());
    comboStopIdsBySlot.get(ev.ownerId)!.add(ev.id);
  }

  // Pre-index combo events per slot for cooldown checks
  const comboEventsBySlot = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    if (!comboEventsBySlot.has(ev.ownerId)) comboEventsBySlot.set(ev.ownerId, []);
    comboEventsBySlot.get(ev.ownerId)!.push(ev);
  }

  const addWindowDirect = (
    wiring: SlotTriggerWiring,
    triggerFrame: number,
    sourceOwnerId: string,
    sourceSkillName: string,
    originOwnerId?: string,
  ) => {
    // Skip self-trigger: don't let an operator's own action trigger their combo.
    if (originOwnerId === wiring.slotId) return;

    // Skip if combo skill is on cooldown at trigger time.
    const slotCombos = comboEventsBySlot.get(wiring.slotId);
    if (slotCombos) {
      const onCooldown = slotCombos.some((ce) => {
        let preCooldownDur = 0;
        let totalDur = 0;
        for (const s of ce.segments) {
          totalDur += s.properties.duration;
          if (s.properties.name !== 'Cooldown') preCooldownDur += s.properties.duration;
        }
        const cooldownStart = ce.startFrame + preCooldownDur;
        const cooldownEnd = ce.startFrame + totalDur;
        return triggerFrame > cooldownStart && triggerFrame < cooldownEnd;
      });
      if (onCooldown) return;
    }

    const info = getComboTriggerInfo(wiring.operatorId);
    const baseDuration = info?.windowFrames ?? 720;
    const ownComboStops = comboStopIdsBySlot.get(wiring.slotId);
    const windowStops = ownComboStops ? stops.filter((s) => !ownComboStops.has(s.eventId)) : stops;
    const extendedDuration = extendByTimeStops(triggerFrame, baseDuration, windowStops);

    if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
    windowsBySlot.get(wiring.slotId)!.push({
      startFrame: triggerFrame,
      endFrame: triggerFrame + extendedDuration,
      sourceEventId: `trigger-${wiring.slotId}-${triggerFrame}`,
      sourceOwnerId,
      sourceSkillName,
      sourceColumnId: sourceSkillName,
    });
  };

  // Evaluate onTriggerClause from skills JSON via verb-handler registry.
  for (const wiring of slotWirings) {
    const clause = getComboTriggerClause(wiring.operatorId);
    if (!clause?.length) continue;
    const matches = findClauseTriggerMatches(clause, events, wiring.slotId, stops);
    for (const match of matches) {
      addWindowDirect(wiring, match.frame, match.sourceOwnerId, match.sourceSkillName, match.originOwnerId);
    }
  }

  // Sort, merge, and convert to TimelineEvents
  const derived: TimelineEvent[] = [];
  windowsBySlot.forEach((wins, slotId) => {
    wins.sort((a, b) => a.startFrame - b.startFrame);
    // Merge overlapping
    const merged: typeof wins = [];
    for (const w of wins) {
      const prev = merged.length > 0 ? merged[merged.length - 1] : null;
      if (prev && w.startFrame <= prev.endFrame) {
        prev.endFrame = Math.max(prev.endFrame, w.endFrame);
      } else {
        merged.push({ ...w });
      }
    }
    for (let i = 0; i < merged.length; i++) {
      const w = merged[i];
      const duration = w.endFrame - w.startFrame;
      derived.push({
        id: `combo-window-${slotId}-${i}`,
        name: COMBO_WINDOW_COLUMN_ID,
        ownerId: slotId,
        columnId: COMBO_WINDOW_COLUMN_ID,
        startFrame: w.startFrame,
        sourceOwnerId: w.sourceOwnerId,
        sourceSkillName: w.sourceSkillName,
        comboTriggerColumnId: w.sourceColumnId,
        segments: [{ properties: { duration } }],
      });
    }
  });

  return derived;
}

/**
 * Check if any event whose columnId is in `columnIds` is active at `frame`.
 * An event is "active" if frame falls within [startFrame, startFrame + totalDuration).
 */
export function hasActiveEventInColumns(events: TimelineEvent[], columnIds: string[], frame: number): boolean {
  for (const ev of events) {
    if (!columnIds.includes(ev.columnId) && !columnIds.includes(ev.name)) continue;
    const totalDuration = computeSegmentsSpan(ev.segments);
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
}

/**
 * For a sequenced event, compute the frame at which the final strike's last
 * hit lands.  Returns null if the event has no segments or fewer than 2.
 *
 * When `stops` is provided, the last hit's offset within its segment is
 * extended by any overlapping time-stop regions, matching how
 * `deriveFrameInflictions` / `absoluteFrame()` position the actual hit.
 */
export function getFinalStrikeTriggerFrame(
  event: TimelineEvent,
  stops?: readonly TimeStopRegion[],
): number | null {
  const segs = event.segments;
  if (segs.length < 2) return null;

  let offsetFrames = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    offsetFrames += segs[i].properties.duration;
  }

  const lastSeg = segs[segs.length - 1];
  const frames = lastSeg.frames;
  if (frames && frames.length > 0) {
    const lastFrame = frames[frames.length - 1];
    if (lastFrame.absoluteFrame != null) return lastFrame.absoluteFrame;
  }
  const lastHitOffset = frames && frames.length > 0
    ? frames[frames.length - 1].offsetFrame
    : 0;

  const segAbsStart = event.startFrame + offsetFrames;
  if (stops && stops.length > 0) {
    const fStops = foreignStopsFor(event, stops);
    return segAbsStart + extendByTimeStops(segAbsStart, lastHitOffset, fStops);
  }
  return segAbsStart + lastHitOffset;
}

/**
 * Update comboTriggerColumnId on combo events to match their containing
 * activation window. Runs before infliction derivation, so it uses Phase 1
 * interactions (including derived-type triggers that would normally be
 * deferred to Phase 2) to determine the source element.
 */
export function resolveComboTriggerColumns(
  events: TimelineEvent[],
  slotWirings: SlotTriggerWiring[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  if (slotWirings.length === 0) return events;

  // Build combo windows per slot via findClauseTriggerMatches
  type WindowInfo = { startFrame: number; endFrame: number; sourceColumnId?: string };
  const windowsBySlot = new Map<string, WindowInfo[]>();

  for (const wiring of slotWirings) {
    const clause = getComboTriggerClause(wiring.operatorId);
    if (!clause?.length) continue;
    const info = getComboTriggerInfo(wiring.operatorId);
    const baseDuration = info?.windowFrames ?? 720;
    const matches = findClauseTriggerMatches(clause, events, wiring.slotId, stops);
    for (const match of matches) {
      const extDuration = extendByTimeStops(match.frame, baseDuration, stops);
      if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
      windowsBySlot.get(wiring.slotId)!.push({
        startFrame: match.frame,
        endFrame: match.frame + extDuration,
        sourceColumnId: match.sourceColumnId,
      });
    }
  }

  // Pre-merge windows per slot (avoid re-sorting in the per-event loop)
  const mergedBySlot = new Map<string, WindowInfo[]>();
  windowsBySlot.forEach((wins, slotId) => {
    wins.sort((a: WindowInfo, b: WindowInfo) => a.startFrame - b.startFrame);
    const merged: WindowInfo[] = [];
    for (const w of wins) {
      const prev = merged.length > 0 ? merged[merged.length - 1] : null;
      if (prev && w.startFrame <= prev.endFrame) {
        prev.endFrame = Math.max(prev.endFrame, w.endFrame);
      } else {
        merged.push({ ...w });
      }
    }
    mergedBySlot.set(slotId, merged);
  });

  // Resolve combo events: update or clear comboTriggerColumnId
  let changed = false;
  const result = events.map((ev) => {
    if (ev.columnId !== SKILL_COLUMNS.COMBO) return ev;

    const merged = mergedBySlot.get(ev.ownerId);
    const match = merged?.find(
      (w) => ev.startFrame >= w.startFrame && ev.startFrame < w.endFrame,
    );

    if (match?.sourceColumnId != null) {
      // Combo is in a valid window — update trigger column if it changed
      if (match.sourceColumnId !== ev.comboTriggerColumnId) {
        changed = true;
        return { ...ev, comboTriggerColumnId: match.sourceColumnId };
      }
    } else if (ev.comboTriggerColumnId != null) {
      // Combo is outside all windows — clear trigger column so no inflictions derive
      changed = true;
      return { ...ev, comboTriggerColumnId: undefined };
    }
    return ev;
  });
  return changed ? result : events;
}

/** Get the end frame of a combo activation window event. */
export function comboWindowEndFrame(ev: TimelineEvent): number {
  return ev.startFrame + computeSegmentsSpan(ev.segments);
}
