import { TimelineEvent } from '../../consts/viewTypes';
import { TimeDependency } from '../../consts/enums';

// ── Time-stop region types ──────────────────────────────────────────────────

export interface TimeStopRegion {
  startFrame: number;
  durationFrames: number;
  eventId: string;
}

export function isTimeStopEvent(ev: TimelineEvent): boolean {
  const anim = ev.animationDuration ?? 0;
  if (anim <= 0) return false;
  return ev.columnId === 'ultimate' || ev.columnId === 'combo' ||
    (ev.columnId === 'dash' && !!ev.isPerfectDodge);
}

/** Collect all time-stop regions from combo/ultimate/dodge events. */
export function collectTimeStopRegions(events: TimelineEvent[]): readonly TimeStopRegion[] {
  const stops: TimeStopRegion[] = [];
  for (const ev of events) {
    if (!isTimeStopEvent(ev)) continue;
    stops.push({
      startFrame: ev.startFrame,
      durationFrames: ev.animationDuration!,
      eventId: ev.id,
    });
  }
  stops.sort((a, b) => a.startFrame - b.startFrame);
  return stops;
}

/**
 * Compute the absolute frame position of a frame within an event,
 * accounting for time-stop extension.
 *
 * segStartOffset is the cumulative offset of preceding (already extended)
 * segments. frameOffset is the frame's local offset within its segment,
 * extended by any time-stops it spans.
 */
export function absoluteFrame(
  eventStart: number,
  segStartOffset: number,
  frameOffset: number,
  foreignStops: readonly TimeStopRegion[],
): number {
  const segAbsStart = eventStart + segStartOffset;
  return segAbsStart + extendByTimeStops(segAbsStart, frameOffset, foreignStops);
}

/**
 * Compute foreign time-stop regions for an event (all stops except its own).
 */
export function foreignStopsFor(ev: TimelineEvent, stops: readonly TimeStopRegion[]): readonly TimeStopRegion[] {
  return isTimeStopEvent(ev) ? stops.filter((s) => s.eventId !== ev.id) : stops;
}

/**
 * Extend a base duration by any time-stop regions it overlaps with.
 *
 * Walks forward from `startFrame` for `baseDuration` frames, adding the
 * duration of any time-stop regions encountered (since the event's timer
 * is paused during those periods). Returns the extended real-time duration.
 */
export function extendByTimeStops(
  startFrame: number,
  baseDuration: number,
  stops: readonly TimeStopRegion[],
): number {
  if (baseDuration <= 0 || stops.length === 0) return baseDuration;
  let remaining = baseDuration;
  let cursor = startFrame;

  for (const s of stops) {
    const stopEnd = s.startFrame + s.durationFrames;
    if (stopEnd <= cursor) continue;
    if (s.startFrame >= cursor + remaining) break;

    if (s.startFrame > cursor) {
      const gap = s.startFrame - cursor;
      if (gap >= remaining) break;
      remaining -= gap;
      cursor = stopEnd;
    } else {
      cursor = stopEnd;
    }
  }

  return (cursor + remaining) - startFrame;
}

/**
 * Extends all event durations that overlap with foreign time-stop regions.
 * Events whose IDs are in `alreadyExtended` are skipped (prevents double extension).
 * Returns the updated events and adds newly extended IDs to the set.
 *
 * For time-stop events (combos/ultimates/dodges), the animation sub-phase
 * is itself the time-stop and is not extended. Only post-animation portions
 * of time-stop events are extended by OTHER time-stops.
 */
export function applyTimeStopExtension(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
  alreadyExtended?: Set<string>,
): TimelineEvent[] {
  if (stops.length === 0) return events;

  const extended = alreadyExtended ?? new Set<string>();

  const result = events.map((ev) => {
    if (extended.has(ev.id)) return ev;

    const isOwn = isTimeStopEvent(ev);
    const animDur = ev.animationDuration ?? 0;

    // Foreign stops = all stops except this event's own
    const foreignStops = isOwn
      ? stops.filter((s) => s.eventId !== ev.id)
      : stops;
    if (foreignStops.length === 0) return ev;

    // ── Sequenced events ─────────────────────────────────────────────────
    if (ev.segments && ev.segments.length > 0) {
      let rawOffset = 0;      // cumulative raw (base) offset — for animation boundary checks
      let derivedOffset = 0;  // cumulative derived offset — real start of next segment
      let changed = false;
      const newSegments = ev.segments.map((seg) => {
        const rawSegStart = rawOffset;
        rawOffset += seg.durationFrames;

        if (seg.timeDependency === TimeDependency.REAL_TIME || seg.durationFrames === 0) {
          derivedOffset += seg.durationFrames;
          return seg;
        }

        // For time-stop events, segments within animation are not extended
        if (isOwn && animDur > 0 && rawSegStart + seg.durationFrames <= animDur) {
          derivedOffset += seg.durationFrames;
          return seg;
        }

        let ext: number;
        if (isOwn && animDur > 0 && rawSegStart < animDur) {
          // Segment straddles animation boundary — only extend post-anim portion
          const animPortion = animDur - rawSegStart;
          const postAnimPortion = seg.durationFrames - animPortion;
          ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
        } else {
          // Use derived offset for real start position, raw duration as base
          ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.durationFrames, foreignStops);
        }

        derivedOffset += ext;

        if (ext === seg.durationFrames) return seg;
        changed = true;
        return { ...seg, durationFrames: ext };
      });

      if (!changed) return ev;
      extended.add(ev.id);
      return {
        ...ev,
        activationDuration: newSegments.reduce((sum, s) => sum + s.durationFrames, 0),
        segments: newSegments,
      };
    }

    // ── 3-phase events ───────────────────────────────────────────────────
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
      // Time-stop event: animation portion not extended, post-anim is
      if (ev.activationDuration > animDur) {
        const postAnim = ev.activationDuration - animDur;
        newActivation = animDur + extendByTimeStops(ev.startFrame + animDur, postAnim, foreignStops);
      }
      if (ev.activeDuration > 0) {
        newActive = extendByTimeStops(ev.startFrame + newActivation, ev.activeDuration, foreignStops);
      }
    }

    if (newActivation === ev.activationDuration && newActive === ev.activeDuration) return ev;
    extended.add(ev.id);
    return { ...ev, activationDuration: newActivation, activeDuration: newActive };
  });

  return result;
}

// ── Frame position resolution ─────────────────────────────────────────────
//
// Pre-computes `absoluteFrame` on every EventFrameMarker so consumers
// (damage table, resource graphs, view) never need time-stop knowledge.

export function resolveFramePositions(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  if (stops.length === 0) {
    // No time-stops: offsets unchanged, absoluteFrame = eventStart + cumulativeOffset + offsetFrame
    return events.map((ev) => {
      if (!ev.segments) return ev;
      let cumulativeOffset = 0;
      const newSegments = ev.segments.map((seg) => {
        const segStart = cumulativeOffset;
        cumulativeOffset += seg.durationFrames;
        if (!seg.frames) return seg;
        return {
          ...seg,
          frames: seg.frames.map((f) => ({
            ...f,
            derivedOffsetFrame: f.offsetFrame,
            absoluteFrame: ev.startFrame + segStart + f.offsetFrame,
          })),
        };
      });
      return { ...ev, segments: newSegments };
    });
  }

  return events.map((ev) => {
    if (!ev.segments) return ev;
    const fStops = foreignStopsFor(ev, stops);
    let cumulativeOffset = 0;
    const newSegments = ev.segments.map((seg) => {
      const segStart = cumulativeOffset;
      cumulativeOffset += seg.durationFrames;
      if (!seg.frames) return seg;
      const segAbsStart = ev.startFrame + segStart;
      return {
        ...seg,
        frames: seg.frames.map((f) => {
          const extOffset = extendByTimeStops(segAbsStart, f.offsetFrame, fStops);
          return {
            ...f,
            derivedOffsetFrame: extOffset,
            absoluteFrame: segAbsStart + extOffset,
          };
        }),
      };
    });
    return { ...ev, segments: newSegments };
  });
}

// ── Time-stop start validation ────────────────────────────────────────────
//
// Validates that events starting inside a time-stop period are allowed per
// the game rules defined in docs/specifications/time_stop.

export function validateTimeStopStarts(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  if (stops.length === 0) return events;

  // Build a lookup from eventId → event for time-stop source identification
  const evById = new Map<string, TimelineEvent>();
  for (const ev of events) evById.set(ev.id, ev);

  return events.map((ev) => {
    const warnings: string[] = [];

    for (const stop of stops) {
      if (stop.eventId === ev.id) continue;
      const stopEnd = stop.startFrame + stop.durationFrames;
      if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

      // ev starts inside this time-stop region — check if allowed
      const source = evById.get(stop.eventId);
      if (!source) continue;

      const sourceIsUltimate = source.columnId === 'ultimate';
      const sourceIsCombo = source.columnId === 'combo';
      const sourceIsDodge = source.columnId === 'dash' && !!source.isPerfectDodge;

      // All time-stops can start within dodge's time-stop
      if (sourceIsDodge) continue;

      // Combo cannot start during ultimate animation time-stop
      if (ev.columnId === 'combo' && sourceIsUltimate) {
        warnings.push(`Combo skill cannot start during ultimate animation time-stop`);
      }

      // Ultimate cannot start during another ultimate's animation time-stop
      if (ev.columnId === 'ultimate' && sourceIsUltimate) {
        warnings.push(`Ultimate cannot start during another ultimate's animation time-stop`);
      }

      // Combo can start within combo time-stops (chaining) and stagger — OK
      // Ultimate can start within combo and stagger and dodge — OK
      // Everything else within combo/stagger is OK
    }

    if (warnings.length === 0) return ev;
    return { ...ev, warnings: [...(ev.warnings ?? []), ...warnings] };
  });
}
