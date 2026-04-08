/**
 * Compute absoluteFrame and derivedOffsetFrame on each frame marker of ev,
 * plus absoluteStartFrame per segment. Extends via time-stop regions
 * (excluding ev's own stop, if any).
 */
import { TimelineEvent } from '../../../consts/viewTypes';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from '../processTimeStop';

export function computeFramePositions(
  ev: TimelineEvent,
  stops: readonly TimeStopRegion[],
): TimelineEvent {
  const fStops = isTimeStopEvent(ev) ? stops.filter(s => s.eventUid !== ev.uid) : stops;

  let cumulativeOffset = 0;
  for (const seg of ev.segments) {
    const segStart = cumulativeOffset;
    const segAbsStart = ev.startFrame + segStart;

    seg.absoluteStartFrame = segAbsStart;

    cumulativeOffset += seg.properties.duration;
    if (!seg.frames) continue;
    if (stops.length === 0) {
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
