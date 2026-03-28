import { TimelineEvent, getAnimationDuration } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { CombatSkillType, TimeDependency } from '../../consts/enums';
import { OPERATOR_COLUMNS } from '../../model/channels';
import type { TimeStopRange } from './resourceTimeline';

// ── Time-stop region types ──────────────────────────────────────────────────

export interface TimeStopRegion {
  startFrame: number;
  durationFrames: number;
  eventUid: string;
}

export function isTimeStopEvent(ev: TimelineEvent): boolean {
  const anim = getAnimationDuration(ev);
  if (anim <= 0) return false;
  return ev.columnId === NounType.ULTIMATE || ev.columnId === NounType.COMBO_SKILL ||
    (ev.columnId === OPERATOR_COLUMNS.INPUT && !!ev.isPerfectDodge);
}

/** Collect all time-stop regions from combo/ultimate/dodge events. */
export function collectTimeStopRegions(events: TimelineEvent[]): readonly TimeStopRegion[] {
  const stops: TimeStopRegion[] = [];
  for (const ev of events) {
    if (!isTimeStopEvent(ev)) continue;
    stops.push({
      startFrame: ev.startFrame,
      durationFrames: getAnimationDuration(ev),
      eventUid: ev.uid,
    });
  }
  stops.sort((a, b) => a.startFrame - b.startFrame);
  return stops;
}

/** Extract time-stop ranges (startFrame, endFrame) from processed events. */
export function collectTimeStopRanges(events: ReadonlyArray<TimelineEvent>): TimeStopRange[] {
  const stops: TimeStopRange[] = [];
  for (const ev of events) {
    if (!isTimeStopEvent(ev)) continue;
    stops.push({ startFrame: ev.startFrame, endFrame: ev.startFrame + getAnimationDuration(ev) });
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
  return isTimeStopEvent(ev) ? stops.filter((s) => s.eventUid !== ev.uid) : stops;
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
 * Inverse of extendByTimeStops: given a real-time span starting at startFrame,
 * compute how many game-time frames elapsed (subtracting overlapping time-stop
 * durations). Used to convert consumed real-time durations back to game-time
 * for tick-count calculations.
 */
export function contractByTimeStops(
  startFrame: number,
  realDuration: number,
  stops: readonly TimeStopRegion[],
): number {
  if (realDuration <= 0 || stops.length === 0) return realDuration;
  const endFrame = startFrame + realDuration;
  let paused = 0;
  for (const s of stops) {
    const stopEnd = s.startFrame + s.durationFrames;
    if (stopEnd <= startFrame) continue;
    if (s.startFrame >= endFrame) break;
    paused += Math.min(stopEnd, endFrame) - Math.max(s.startFrame, startFrame);
  }
  return realDuration - paused;
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
    if (extended.has(ev.uid)) return ev;

    // Control status is not affected by time-stops — its timer keeps ticking
    if (ev.id === CombatSkillType.CONTROL) return ev;

    const isOwn = isTimeStopEvent(ev);
    const animDur = getAnimationDuration(ev);

    // Foreign stops = all stops except this event's own
    const foreignStops = isOwn
      ? stops.filter((s) => s.eventUid !== ev.uid)
      : stops;
    if (foreignStops.length === 0) return ev;

    // ── Sequenced events ─────────────────────────────────────────────────
    if (ev.segments.length > 0) {
      let rawOffset = 0;      // cumulative raw (base) offset — for animation boundary checks
      let derivedOffset = 0;  // cumulative derived offset — real start of next segment
      let changed = false;
      for (const seg of ev.segments) {
        const rawSegStart = rawOffset;
        rawOffset += seg.properties.duration;

        if (seg.properties.timeDependency === TimeDependency.REAL_TIME || seg.properties.duration === 0) {
          derivedOffset += seg.properties.duration;
          continue;
        }

        // For time-stop events, segments within animation are not extended
        if (isOwn && animDur > 0 && rawSegStart + seg.properties.duration <= animDur) {
          derivedOffset += seg.properties.duration;
          continue;
        }

        let ext: number;
        if (isOwn && animDur > 0 && rawSegStart < animDur) {
          // Segment straddles animation boundary — only extend post-anim portion
          const animPortion = animDur - rawSegStart;
          const postAnimPortion = seg.properties.duration - animPortion;
          ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
        } else {
          // Use derived offset for real start position, raw duration as base
          ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.properties.duration, foreignStops);
        }

        derivedOffset += ext;

        if (ext !== seg.properties.duration) {
          changed = true;
          seg.properties.duration = ext;
        }
      }

      if (!changed) return ev;
      extended.add(ev.uid);
      return ev;
    }

    // All events should have segments at this point
    return ev;
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
    for (const ev of events) {
      let cumulativeOffset = 0;
      for (const seg of ev.segments) {
        const segStart = cumulativeOffset;
        cumulativeOffset += seg.properties.duration;
        if (!seg.frames) continue;
        for (const f of seg.frames) {
          f.derivedOffsetFrame = f.offsetFrame;
          f.absoluteFrame = ev.startFrame + segStart + f.offsetFrame;
        }
      }
    }
    return events;
  }

  for (const ev of events) {
    const fStops = foreignStopsFor(ev, stops);
    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      const segStart = cumulativeOffset;
      cumulativeOffset += seg.properties.duration;
      if (!seg.frames) continue;
      const segAbsStart = ev.startFrame + segStart;
      for (const f of seg.frames) {
        const extOffset = extendByTimeStops(segAbsStart, f.offsetFrame, fStops);
        f.derivedOffsetFrame = extOffset;
        f.absoluteFrame = segAbsStart + extOffset;
      }
    }
  }
  return events;
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

  // Build a lookup from eventUid → event for time-stop source identification
  const evByUid = new Map<string, TimelineEvent>();
  for (const ev of events) evByUid.set(ev.uid, ev);

  return events.map((ev) => {
    const warnings: string[] = [];

    for (const stop of stops) {
      if (stop.eventUid === ev.uid) continue;
      const stopEnd = stop.startFrame + stop.durationFrames;
      if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

      // ev starts inside this time-stop region — check if allowed
      const source = evByUid.get(stop.eventUid);
      if (!source) continue;

      // Control swap cannot occur during any time-stop (including dodge)
      if (ev.id === CombatSkillType.CONTROL) {
        warnings.push(`Control swap cannot occur during time-stop`);
        continue;
      }

      const sourceIsUltimate = source.columnId === NounType.ULTIMATE;
      const sourceIsDodge = source.columnId === OPERATOR_COLUMNS.INPUT && !!source.isPerfectDodge;

      // All time-stops can start within dodge's time-stop
      if (sourceIsDodge) continue;

      // Combo cannot start during ultimate animation time-stop
      if (ev.columnId === NounType.COMBO_SKILL && sourceIsUltimate) {
        warnings.push(`Combo skill cannot start during ultimate animation time-stop`);
      }

      // Ultimate cannot start during another ultimate's animation time-stop
      if (ev.columnId === NounType.ULTIMATE && sourceIsUltimate) {
        warnings.push(`Ultimate cannot start during another ultimate's animation time-stop`);
      }

      // Combo can start within combo time-stops (chaining) and stagger — OK
      // Ultimate can start within combo and stagger and dodge — OK
      // Everything else within combo/stagger is OK
    }

    if (warnings.length === 0) return ev;
    ev.warnings = ev.warnings ? [...ev.warnings, ...warnings] : warnings;
    return ev;
  });
}
