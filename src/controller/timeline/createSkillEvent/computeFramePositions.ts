/**
 * Extend segment durations from raw values (via time-stop regions) and
 * compute absoluteFrame / derivedOffsetFrame on each frame marker.
 *
 * Merges the former `extendSingleEvent` (DEC-private, read raw durations
 * and mutate segment.properties.duration in place) with the former
 * `computeFramePositions` (set absoluteStartFrame / absoluteFrame /
 * derivedOffsetFrame per frame marker). Both always ran together — a
 * single pass is cleaner and avoids duplicate stop-filtering.
 *
 * Idempotent: always starts from `rawDurations` so re-running with an
 * updated stops list produces correct results.
 */
import { NounType } from '../../../dsl/semantics';
import { TimeDependency } from '../../../consts/enums';
import { TimelineEvent, getAnimationDuration } from '../../../consts/viewTypes';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from '../processTimeStop';

export function computeFramePositions(
  ev: TimelineEvent,
  stops: readonly TimeStopRegion[],
  rawDurations?: readonly number[],
): TimelineEvent {
  // Control status is not affected by time-stops
  if (ev.id === NounType.CONTROL) return ev;
  if (ev.segments.length === 0) return ev;

  const isOwn = isTimeStopEvent(ev);
  const foreignStops = isOwn ? stops.filter(s => s.eventUid !== ev.uid) : stops;
  const animDur = rawDurations ? getAnimationDuration(ev) : 0;

  // Phase 1: extend segment durations from raw values
  if (rawDurations) {
    if (foreignStops.length === 0) {
      // Restore raw durations (idempotent reset)
      for (let i = 0; i < ev.segments.length; i++) {
        ev.segments[i].properties.duration = rawDurations[i];
      }
    } else {
      let rawOffset = 0;
      let derivedOffset = 0;
      for (let i = 0; i < ev.segments.length; i++) {
        const seg = ev.segments[i];
        const rawDur = rawDurations[i];
        const rawSegStart = rawOffset;
        rawOffset += rawDur;

        if (seg.properties.timeDependency === TimeDependency.REAL_TIME || rawDur === 0) {
          seg.properties.duration = rawDur;
          derivedOffset += rawDur;
          continue;
        }

        if (isOwn && animDur > 0 && rawSegStart + rawDur <= animDur) {
          seg.properties.duration = rawDur;
          derivedOffset += rawDur;
          continue;
        }

        let ext: number;
        if (isOwn && animDur > 0 && rawSegStart < animDur) {
          const animPortion = animDur - rawSegStart;
          const postAnimPortion = rawDur - animPortion;
          ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
        } else {
          ext = extendByTimeStops(ev.startFrame + derivedOffset, rawDur, foreignStops);
        }

        seg.properties.duration = ext;
        derivedOffset += ext;
      }
    }
  }

  // Phase 2: compute frame positions from the (now-extended) segment durations
  let cumulativeOffset = 0;
  for (const seg of ev.segments) {
    const segAbsStart = ev.startFrame + cumulativeOffset;
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
        const extOffset = extendByTimeStops(segAbsStart, f.offsetFrame, foreignStops);
        f.derivedOffsetFrame = extOffset;
        f.absoluteFrame = segAbsStart + extOffset;
      }
    }
  }
  return ev;
}
