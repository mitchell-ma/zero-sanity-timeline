import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { EventFrameType, SegmentType } from '../../consts/enums';
import { COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
import { TimeStopRegion, isTimeStopEvent, extendByTimeStops, foreignStopsFor } from './processTimeStop';
import { findClauseTriggerMatches } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import type { SlotTriggerWiring } from './eventQueueTypes';

export { COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
export type { SlotTriggerWiring } from './eventQueueTypes';

// ── Combo activation window derivation ──────────────────────────────────────

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
    if (ev.columnId !== NounType.COMBO_SKILL || !isTimeStopEvent(ev)) continue;
    if (!comboStopIdsBySlot.has(ev.ownerId)) comboStopIdsBySlot.set(ev.ownerId, new Set());
    comboStopIdsBySlot.get(ev.ownerId)!.add(ev.uid);
  }

  // Pre-index combo events per slot for cooldown checks
  const comboEventsBySlot = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.columnId !== NounType.COMBO_SKILL) continue;
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
        // Use computeSegmentsSpan which handles IMMEDIATE_COOLDOWN offset correctly
        const eventSpan = computeSegmentsSpan(ce.segments);
        let preCooldownDur = 0;
        for (const s of ce.segments) {
          if (s.properties.segmentTypes?.includes(SegmentType.COOLDOWN)) break;
          // IMMEDIATE_COOLDOWN starts at offset 0 — active segments don't push cooldown later
          if (s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)) break;
          preCooldownDur += s.properties.duration;
        }
        const hasCooldown = ce.segments.some(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN) || s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN));
        if (!hasCooldown) return false;
        const isImmediate = ce.segments.some(s => s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN));
        const cooldownStart = isImmediate ? ce.startFrame : ce.startFrame + preCooldownDur;
        const cooldownEnd = ce.startFrame + eventSpan;
        return triggerFrame > cooldownStart && triggerFrame < cooldownEnd;
      });
      if (onCooldown) return;
    }

    const info = getComboTriggerInfo(wiring.operatorId);
    const baseDuration = info?.windowFrames ?? 720;
    const ownComboStops = comboStopIdsBySlot.get(wiring.slotId);
    const windowStops = ownComboStops ? stops.filter((s) => !ownComboStops.has(s.eventUid)) : stops;
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
      const wiring = slotWirings.find(sw => sw.slotId === slotId)!;
      const triggerInfo = getComboTriggerInfo(wiring.operatorId);
      derived.push({
        uid: `combo-window-${slotId}-${i}`,
        id: COMBO_WINDOW_COLUMN_ID,
        name: COMBO_WINDOW_COLUMN_ID,
        ownerId: slotId,
        columnId: COMBO_WINDOW_COLUMN_ID,
        startFrame: w.startFrame,
        sourceOwnerId: w.sourceOwnerId,
        sourceSkillName: w.sourceSkillName,
        comboTriggerColumnId: w.sourceColumnId,
        maxSkills: triggerInfo?.maxSkills ?? 1,
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
    if (!columnIds.includes(ev.columnId) && !columnIds.includes(ev.id)) continue;
    const totalDuration = computeSegmentsSpan(ev.segments);
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
}

/**
 * For a sequenced event, compute the frame at which the final strike lands.
 * Searches for a frame marker with `frameTypes` containing FINAL_STRIKE.
 * Falls back to the last frame of the last segment with a warning if not found.
 * Returns null if the event has no segments or fewer than 2.
 *
 * When `stops` is provided, the hit offset within its segment is extended
 * by any overlapping time-stop regions, matching how `absoluteFrame()`
 * positions the actual hit.
 */
export function getFinalStrikeTriggerFrame(
  event: TimelineEvent,
  stops?: readonly TimeStopRegion[],
): number | null {
  const segs = event.segments;
  if (segs.length < 2) return null;

  // Search all segments for a frame with FINAL_STRIKE type
  let cumulativeOffset = 0;
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    if (seg.frames) {
      for (const frame of seg.frames) {
        if (frame.frameTypes?.includes(EventFrameType.FINAL_STRIKE)) {
          if (frame.absoluteFrame != null) return frame.absoluteFrame;
          const segAbsStart = event.startFrame + cumulativeOffset;
          if (stops && stops.length > 0) {
            const fStops = foreignStopsFor(event, stops);
            return segAbsStart + extendByTimeStops(segAbsStart, frame.offsetFrame, fStops);
          }
          return segAbsStart + frame.offsetFrame;
        }
      }
    }
    cumulativeOffset += seg.properties.duration;
  }

  // Fallback: last frame of last segment
  console.warn(`[getFinalStrikeTriggerFrame] No FINAL_STRIKE frame found for ${event.name ?? event.id} — falling back to last segment last frame`);
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
    if (ev.columnId !== NounType.COMBO_SKILL) return ev;

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
