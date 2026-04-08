import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { EventFrameType } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, foreignStopsFor } from './processTimeStop';
import { findClauseTriggerMatches } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import type { SlotTriggerWiring } from './eventQueueTypes';

export { COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
export type { SlotTriggerWiring } from './eventQueueTypes';

// Phase 8 step 6e: `deriveComboActivationWindows` (batch window derivation)
// was deleted. All combo window emission now flows through
// `DerivedEventController.openComboWindow` called from pass 3 of
// `registerEvents`. `resolveComboTriggerColumns` below is retained only
// because its unit tests (comboTriggerResolution.test.ts) still import it;
// it is no longer on any production code path.

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
  getControlledSlotAtFrame?: (frame: number) => string,
): TimelineEvent[] {
  if (slotWirings.length === 0) return events;

  // Build combo windows per slot via findClauseTriggerMatches
  type WindowInfo = { startFrame: number; endFrame: number; sourceColumnId?: string; triggerStacks?: number };
  const windowsBySlot = new Map<string, WindowInfo[]>();

  for (const wiring of slotWirings) {
    const clause = getComboTriggerClause(wiring.operatorId);
    if (!clause?.length) continue;
    const info = getComboTriggerInfo(wiring.operatorId);
    const baseDuration = info?.windowFrames ?? 720;
    const matches = findClauseTriggerMatches(clause, events, wiring.slotId, stops, getControlledSlotAtFrame);
    for (const match of matches) {
      const extDuration = extendByTimeStops(match.frame, baseDuration, stops);
      if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
      windowsBySlot.get(wiring.slotId)!.push({
        startFrame: match.frame,
        endFrame: match.frame + extDuration,
        sourceColumnId: match.sourceColumnId,
        triggerStacks: match.triggerStacks,
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
    if (ev.columnId !== NounType.COMBO) return ev;

    const merged = mergedBySlot.get(ev.ownerId);
    const match = merged?.find(
      (w) => ev.startFrame >= w.startFrame && ev.startFrame < w.endFrame,
    );

    if (match?.sourceColumnId != null) {
      // Combo is in a valid window — update trigger column and stacks if changed
      if (match.sourceColumnId !== ev.comboTriggerColumnId || match.triggerStacks !== ev.triggerStacks) {
        changed = true;
        return { ...ev, comboTriggerColumnId: match.sourceColumnId, triggerStacks: match.triggerStacks };
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
