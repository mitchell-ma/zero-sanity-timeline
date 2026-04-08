import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { EventFrameType } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, foreignStopsFor } from './processTimeStop';

export { COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
export type { SlotTriggerWiring } from './eventQueueTypes';

// Phase 8 step 6: batch combo window derivation was deleted. All combo
// window emission flows through `DerivedEventController.openComboWindow`
// invoked from pass 3 of `createSkillEvent`.

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

/** Get the end frame of a combo activation window event. */
export function comboWindowEndFrame(ev: TimelineEvent): number {
  return ev.startFrame + computeSegmentsSpan(ev.segments);
}
