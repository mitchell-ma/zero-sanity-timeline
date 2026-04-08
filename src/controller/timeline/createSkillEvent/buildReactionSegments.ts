/**
 * Build reaction segments for freeform reaction events (corrosion/combustion).
 * Passthrough for non-reaction events.
 */
import { TimelineEvent } from '../../../consts/viewTypes';
import { TimeStopRegion } from '../processTimeStop';
import { buildReactionSegment, buildCorrosionSegments } from '../processInfliction';
import { REACTION_COLUMNS, REACTION_COLUMN_IDS } from '../../../model/channels';

export interface BuildReactionSegmentsState {
  rawDurations: Map<string, number>;
  foreignStops: readonly TimeStopRegion[];
}

export function buildReactionSegments(
  ev: TimelineEvent,
  state: BuildReactionSegmentsState,
): TimelineEvent {
  if (!REACTION_COLUMN_IDS.has(ev.columnId)) return ev;
  if (ev.columnId === REACTION_COLUMNS.CORROSION) {
    const segs = buildCorrosionSegments(ev);
    if (segs) ev.segments = segs;
  } else {
    const raw = state.rawDurations.get(ev.uid);
    const seg = buildReactionSegment(ev, raw, state.foreignStops);
    if (seg) ev.segments = [seg];
  }
  return ev;
}
