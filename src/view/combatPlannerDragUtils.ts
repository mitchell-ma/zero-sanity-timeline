import { TimelineEvent, computeSegmentsSpan } from '../consts/viewTypes';
import { NounType } from '../dsl/semantics';
import { COMBO_WINDOW_COLUMN_ID } from '../model/channels';
import { wouldOverlapNonOverlappable, clampDeltaByOverlap } from '../controller/timeline/inputEventController';
import {
  clampDeltaByResourceZones,
  clampDeltaByComboWindow,
  type ResourceZone,
} from '../controller/timeline/eventValidator';
import { TOTAL_FRAMES } from '../utils/timeline';

export interface DragState {
  primaryId: string; // the event the user grabbed
  eventUids: string[];
  startMouseFrame: number; // mouse coordinate along the frame axis at drag start
  startFrames: Map<string, number>; // original startFrame per event
  monotonicBounds: Map<string, { min: number; max: number }>; // MF drag constraints captured at drag start
  lastAppliedDelta: number; // tracks the delta already applied to events (for incremental batch moves)
  resourceZonesSnapshot: Map<string, ResourceZone[]>; // Resource zones captured at drag start
  invalidAtDragStart: Set<string>; // events that were already in an invalid zone at drag start — allowed free movement until valid
  revalidated: Set<string>; // events that transitioned invalid→valid mid-drag — must not skip self-caused zones
  overlapInvalidAtDragStart: Set<string>; // events that were already overlapping siblings at drag start — allowed free movement until non-overlapping
  overlapRevalidated: Set<string>; // overlap-invalid events that reached a valid position mid-drag — must now respect overlap clamping
  comboRevalidated: Map<string, string>; // combo-invalid events that entered a window mid-drag — maps eventUid → windowUid
}

/**
 * Compute which dragged events are already in an invalid zone (resource or
 * combo). These events get free movement until they reach a valid position.
 */
export function computeInvalidSet(
  draggedEvents: TimelineEvent[],
  resourceZones: Map<string, ResourceZone[]>,
  allEvents: readonly TimelineEvent[],
) {
  const invalid = new Set<string>();
  for (const de of draggedEvents) {
    // Resource zone: check live zones (includes the event's own contribution)
    if (de.columnId === NounType.BATTLE_SKILL || de.columnId === NounType.ULTIMATE) {
      const zones = resourceZones.get(`${de.ownerId}:${de.columnId}`);
      if (zones?.some((z) => de.startFrame >= z.start && de.startFrame < z.end)) {
        invalid.add(de.uid);
      }
    }
    // Combo window: check if event is outside all combo windows
    if (de.columnId === NounType.COMBO_SKILL) {
      const windows = allEvents.filter(
        (w) => w.columnId === COMBO_WINDOW_COLUMN_ID && w.ownerId === de.ownerId,
      );
      const inWindow = windows.some((w) => {
        const duration = computeSegmentsSpan(w.segments);
        return de.startFrame >= w.startFrame && de.startFrame < w.startFrame + duration;
      });
      if (!inWindow && windows.length > 0) {
        invalid.add(de.uid);
      }
    }
  }
  return invalid;
}

/**
 * Compute which dragged events are already overlapping siblings at drag start.
 * These get free movement (through overlapping positions) until they reach
 * a non-overlapping position, then overlap clamping kicks in.
 */
export function computeOverlapInvalidSet(
  draggedEvents: TimelineEvent[],
  allEvents: TimelineEvent[],
) {
  const invalid = new Set<string>();
  for (const de of draggedEvents) {
    if (wouldOverlapNonOverlappable(allEvents, de, de.startFrame)) {
      invalid.add(de.uid);
    }
  }
  return invalid;
}

/**
 * Apply the full drag clamping pipeline: timeline bounds, monotonic bounds,
 * resource zones, combo windows, and overlap constraints.
 * Returns the clamped delta and the set of overlap-exempt events (if any).
 */
export function clampDragDelta(
  deltaFrames: number,
  dragState: DragState,
  events: TimelineEvent[],
  strict: boolean,
) {
  const { eventUids, startFrames, monotonicBounds } = dragState;

  // Pre-clamp delta by timeline bounds and monotonic (MF) bounds.
  let clampedDelta = deltaFrames;
  for (const eid of eventUids) {
    const orig = startFrames.get(eid) ?? 0;
    const timelineMin = -orig;
    const timelineMax = TOTAL_FRAMES - 1 - orig;
    clampedDelta = Math.max(timelineMin, Math.min(timelineMax, clampedDelta));
    const bounds = monotonicBounds.get(eid);
    if (bounds) {
      const minDelta = bounds.min - orig;
      const maxDelta = bounds.max - orig;
      clampedDelta = Math.max(minDelta, Math.min(maxDelta, clampedDelta));
    }
  }

  if (strict) {
    // Resource zone clamping: prevent battle/ultimate events from being dragged
    // into resource-insufficient zones. Uses snapshot from drag start.
    // Events that were already invalid at drag start get free movement until valid.
    const resZones = dragState.resourceZonesSnapshot;
    const invalidSet = dragState.invalidAtDragStart;
    const revalidated = dragState.revalidated;
    for (const eid of eventUids) {
      const orig = startFrames.get(eid) ?? 0;
      clampedDelta = clampDeltaByResourceZones(clampedDelta, eid, events, orig, resZones, invalidSet, revalidated);
    }

    // Overlap clamping: prevent events from overlapping siblings.
    // Events that were already overlapping at drag start get free movement
    // until they reach a non-overlapping position, then clamping kicks in.
    const overlapInvalid = dragState.overlapInvalidAtDragStart;
    const overlapReval = dragState.overlapRevalidated;
    const dragSet = new Set(eventUids);
    for (const eid of eventUids) {
      const orig = startFrames.get(eid) ?? 0;
      clampedDelta = clampDeltaByOverlap(clampedDelta, eid, events, orig, dragSet, undefined, overlapInvalid, overlapReval);
    }

    // Combo window clamping runs last — it has final authority.
    // Other validators (overlap, resource) may have pushed the position;
    // combo window brings it back within the activation window.
    const comboReval = dragState.comboRevalidated;
    for (const eid of eventUids) {
      const orig = startFrames.get(eid) ?? 0;
      clampedDelta = clampDeltaByComboWindow(clampedDelta, eid, events, orig, events, invalidSet, comboReval);
    }
  }

  // Events still overlap-invalid pass through validateMove's clampNonOverlappable
  // unclamped (the drag handler manages their free→clamped transition).
  // Revalidated events are already clamped by clampDeltaByOverlap above.
  const overlapExempt = strict && dragState.overlapInvalidAtDragStart.size > 0
    ? dragState.overlapInvalidAtDragStart
    : undefined;

  return { clampedDelta, overlapExempt };
}
