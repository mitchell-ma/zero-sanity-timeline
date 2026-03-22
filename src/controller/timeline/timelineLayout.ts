/**
 * Timeline layout builder — computes real-time layout positions and durations
 * for all events, expanding game-time durations that span time-stop regions.
 *
 * All event startFrame values are real-time. Time-stops are status regions
 * where game-time-dependent processes pause (durations stretch).
 */
import { TimelineEvent, getAnimationDuration, eventDuration } from '../../consts/viewTypes';
import { TimeDependency } from '../../consts/enums';
import {
  TOTAL_FRAMES,
} from '../../utils/timeline';
import { OPERATOR_COLUMNS, SKILL_COLUMNS } from '../../model/channels';

// ── Layout types ──────────────────────────────────────────────────────────────

/** Layout data for a single frame diamond within a segment. */
export interface FrameLayout {
  /** Real-time offset from the segment's real start (px-ready via durationToPx). */
  realOffset: number;
}

/** Layout data for a single segment. */
export interface SegmentLayout {
  /** Real-time offset from the event's real start. */
  realOffset: number;
  /** Real-time duration of this segment. */
  realDuration: number;
  /** Per-frame layout (parallel to source segment.frames). */
  frames?: FrameLayout[];
}

/** Layout data for 3-phase events (activation → active → cooldown). */
export interface PhaseLayout {
  realActivationDuration: number;
  /** Animation sub-phase within activation (real-time, 1:1). 0 if no animation. */
  realAnimationDuration: number;
  realActiveDuration: number;
  /** Cooldown is always real-time so this equals the raw frame count. */
  realCooldownDuration: number;
}

/** Layout data for a single event. */
export interface EventLayout {
  eventUid: string;
  /** Real-time frame at which this event starts (use with frameToPx). */
  realStartFrame: number;
  /** Total real-time duration of this event (use with durationToPx). */
  realTotalDuration: number;
  /** For sequenced events: per-segment real-time offsets and durations. */
  segments?: SegmentLayout[];
  /** For 3-phase events: per-phase real-time durations. */
  phases?: PhaseLayout;
  /**
   * For 3-phase events with frame diamonds (ultimates): frame layouts
   * indexed parallel to event.segments[0].frames. Offsets are relative to
   * the phase that contains them (activation post-anim or active).
   */
  phaseFrames?: FrameLayout[];
}

/** A time-stop region for overlay rendering. */
export interface TimeStopRegion {
  /** Real-time frame where this time-stop starts. */
  startFrame: number;
  /** Duration of the time-stop in frames. */
  durationFrames: number;
  ownerId: string;
  sourceColumnId: string;
}

/** Complete layout data for the entire timeline. */
export interface TimelineLayout {
  /** Per-event layout, keyed by event UID. */
  events: Map<string, EventLayout>;
  /** Time-stop overlay regions. */
  timeStopRegions: TimeStopRegion[];
  /** Total real-time frames (base timeline + all time-stop durations). */
  totalRealFrames: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface RawTimeStop {
  startFrame: number;
  durationFrames: number;
  eventUid: string;
  ownerId: string;
  sourceColumnId: string;
}

function collectRawStops(events: TimelineEvent[]): RawTimeStop[] {
  const stops: RawTimeStop[] = [];
  for (const ev of events) {
    const anim = getAnimationDuration(ev);
    if (anim <= 0) continue;
    const isTimeStop =
      ev.columnId === SKILL_COLUMNS.ULTIMATE ||
      ev.columnId === SKILL_COLUMNS.COMBO ||
      (ev.columnId === OPERATOR_COLUMNS.INPUT && ev.isPerfectDodge);
    if (!isTimeStop) continue;
    stops.push({
      startFrame: ev.startFrame,
      durationFrames: anim,
      eventUid: ev.uid,
      ownerId: ev.ownerId,
      sourceColumnId: ev.columnId,
    });
  }
  stops.sort((a, b) => a.startFrame - b.startFrame);
  return stops;
}

/**
 * Compute the real-time duration needed for `gameDur` game-time frames to
 * elapse, starting at real-time position `realStart`.
 *
 * Time-stops are real-time regions where game-time is frozen. We walk forward
 * from `realStart`, skipping over time-stop regions, until `gameDur` game-time
 * frames have elapsed.
 */
function realDurationForGameTime(realStart: number, gameDur: number, stops: readonly RawTimeStop[]): number {
  if (gameDur <= 0) return 0;
  let gameRemaining = gameDur;
  let cursor = realStart;

  for (const s of stops) {
    const stopStart = s.startFrame;
    const stopEnd = stopStart + s.durationFrames;

    if (stopEnd <= cursor) continue;       // stop ended before our position
    if (stopStart >= cursor + gameRemaining) break; // stop is after we'd finish

    if (stopStart > cursor) {
      // Game-time gap before this stop
      const gap = stopStart - cursor;
      if (gap >= gameRemaining) break;     // we finish before reaching this stop
      gameRemaining -= gap;
      cursor = stopEnd;                    // skip past the time-stop
    } else {
      // We start inside a time-stop — skip to its end
      cursor = stopEnd;
    }
  }

  return (cursor + gameRemaining) - realStart;
}

function isTimeStopEvent(ev: TimelineEvent): boolean {
  const anim = getAnimationDuration(ev);
  if (anim <= 0) return false;
  return ev.columnId === SKILL_COLUMNS.ULTIMATE || ev.columnId === SKILL_COLUMNS.COMBO ||
    (ev.columnId === OPERATOR_COLUMNS.INPUT && !!ev.isPerfectDodge);
}

/**
 * Compute the real-time offset from event start for an event-local frame offset.
 *
 * For time-stop events, the first `animDur` frames are real-time (animation),
 * then subsequent frames are game-time durations (paused during foreign time-stops).
 */
function computeRealOffset(
  eventStart: number,
  eventLocalOffset: number,
  animDur: number,
  isOwnTimeStop: boolean,
  foreignStops: readonly RawTimeStop[],
): number {
  if (!isOwnTimeStop || animDur <= 0) {
    // Non-time-stop: all frames use game-time durations from eventStart
    return realDurationForGameTime(eventStart, eventLocalOffset, foreignStops);
  }
  if (eventLocalOffset <= animDur) {
    // During animation: 1:1 real-time
    return eventLocalOffset;
  }
  // Post-animation: game-time resumes at real-time position eventStart + animDur
  const gameOffset = eventLocalOffset - animDur;
  return animDur + realDurationForGameTime(eventStart + animDur, gameOffset, foreignStops);
}

/**
 * Compute the real-time duration for a segment at a given event-local offset.
 */
function computeRealDuration(
  eventStart: number,
  eventLocalOffset: number,
  duration: number,
  animDur: number,
  isOwnTimeStop: boolean,
  timeDependency: TimeDependency | undefined,
  foreignStops: readonly RawTimeStop[],
): number {
  // Real-time segments (cooldowns) are unaffected by time-stops
  if (timeDependency === TimeDependency.REAL_TIME) return duration;

  if (!isOwnTimeStop || animDur <= 0) {
    const segRealStart = eventStart + eventLocalOffset;
    return realDurationForGameTime(segRealStart, duration, foreignStops);
  }

  const eventLocalEnd = eventLocalOffset + duration;

  if (eventLocalEnd <= animDur) {
    // Entirely within animation: 1:1 real-time
    return duration;
  }
  if (eventLocalOffset >= animDur) {
    // Entirely post-animation: game-time resumes at eventStart + eventLocalOffset
    const segRealStart = eventStart + eventLocalOffset;
    return realDurationForGameTime(segRealStart, duration, foreignStops);
  }
  // Straddles animation boundary
  const animPortion = animDur - eventLocalOffset;
  const gamePortion = duration - animPortion;
  return animPortion + realDurationForGameTime(eventStart + animDur, gamePortion, foreignStops);
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildTimelineLayout(events: TimelineEvent[]): TimelineLayout {
  const allStops = collectRawStops(events);
  const layoutMap = new Map<string, EventLayout>();

  for (const ev of events) {
    const isOwn = isTimeStopEvent(ev);
    const animDur = getAnimationDuration(ev);

    // Foreign stops = all stops except this event's own
    const foreignStops = isOwn
      ? allStops.filter((s) => s.eventUid !== ev.uid)
      : allStops;

    // In real-time model, startFrame is already real-time — no conversion needed.
    const realStart = ev.startFrame;

    if (ev.segments.length > 0) {
      // ── Sequenced event (basic attacks, combos with segments) ─────────
      const segments: SegmentLayout[] = [];
      let runningOffset = 0; // tracks end of previous segment for implicit offsets
      let maxEndFrame = 0;

      for (const seg of ev.segments) {
        // Use explicit offset if provided, otherwise start after previous segment
        const eventLocalOffset = seg.properties.offset != null ? seg.properties.offset : runningOffset;
        const segRealOffset = computeRealOffset(
          ev.startFrame, eventLocalOffset, animDur, isOwn, foreignStops,
        );
        const segRealDur = computeRealDuration(
          ev.startFrame, eventLocalOffset, seg.properties.duration,
          animDur, isOwn, seg.properties.timeDependency, foreignStops,
        );

        const frames: FrameLayout[] | undefined = seg.frames?.map((f) => {
          const frameEventLocal = eventLocalOffset + f.offsetFrame;
          const frameRealFromEvent = computeRealOffset(
            ev.startFrame, frameEventLocal, animDur, isOwn, foreignStops,
          );
          return { realOffset: frameRealFromEvent - segRealOffset };
        });

        segments.push({ realOffset: segRealOffset, realDuration: segRealDur, frames });
        const segEnd = eventLocalOffset + seg.properties.duration;
        if (segEnd > maxEndFrame) maxEndFrame = segEnd;
        // Only advance running offset when no explicit offset (contiguous chain)
        if (seg.properties.offset == null) runningOffset += seg.properties.duration;
        else runningOffset = segEnd;
      }

      const totalRealDur = computeRealOffset(
        ev.startFrame, maxEndFrame, animDur, isOwn, foreignStops,
      );

      layoutMap.set(ev.uid, {
        eventUid: ev.uid,
        realStartFrame: realStart,
        realTotalDuration: totalRealDur,
        segments,
      });
    } else {
      // ── 3-phase event (ultimates, statuses, battle skills) ────────────
      const totalDur = eventDuration(ev);
      const activationEnd = totalDur;
      const realActivation = computeRealDuration(
        ev.startFrame, 0, totalDur,
        animDur, isOwn, ev.timeDependency, foreignStops,
      );

      const realActive = 0;

      const realCooldown = 0;
      const realAnimation = animDur; // always real-time, 1:1

      // Frame diamonds for ultimates (stored in segments[2].frames for 3-segment ultimates, segments[0] for legacy)
      let phaseFrames: FrameLayout[] | undefined;
      const seg0Frames = ev.segments.length > 2 ? ev.segments[2]?.frames : ev.segments[0]?.frames;
      if (seg0Frames) {
        const hasActive = false;
        const hasAnimation = animDur > 0 && animDur <= totalDur;

        phaseFrames = seg0Frames.map((f) => {
          if (hasActive) {
            // Frames are in the active phase, offset from activeStart
            const eventLocalFrame = activationEnd + f.offsetFrame;
            const frameRealFromEvent = computeRealOffset(
              ev.startFrame, eventLocalFrame, animDur, isOwn, foreignStops,
            );
            // Offset relative to active phase start
            const activePhaseRealStart = computeRealOffset(
              ev.startFrame, activationEnd, animDur, isOwn, foreignStops,
            );
            return { realOffset: frameRealFromEvent - activePhaseRealStart };
          } else if (hasAnimation) {
            // Frames are in activation post-animation portion
            // offsetFrame is from ultimate start; subtract animation to get post-anim offset
            const eventLocalFrame = f.offsetFrame;
            const frameRealFromEvent = computeRealOffset(
              ev.startFrame, eventLocalFrame, animDur, isOwn, foreignStops,
            );
            // Offset relative to post-animation start (= realAnimation)
            return { realOffset: frameRealFromEvent - realAnimation };
          } else {
            // No animation: frames in activation, offset from startFrame
            const frameRealFromEvent = computeRealOffset(
              ev.startFrame, f.offsetFrame, animDur, isOwn, foreignStops,
            );
            return { realOffset: frameRealFromEvent };
          }
        });
      }

      layoutMap.set(ev.uid, {
        eventUid: ev.uid,
        realStartFrame: realStart,
        realTotalDuration: realActivation + realActive + realCooldown,
        phases: {
          realActivationDuration: realActivation,
          realAnimationDuration: realAnimation,
          realActiveDuration: realActive,
          realCooldownDuration: realCooldown,
        },
        phaseFrames,
      });
    }
  }

  // ── Time-stop overlay regions ───────────────────────────────────────────────
  const timeStopRegions: TimeStopRegion[] = allStops.map((s) => ({
    startFrame: s.startFrame,
    durationFrames: s.durationFrames,
    ownerId: s.ownerId,
    sourceColumnId: s.sourceColumnId,
  }));

  const totalRealFrames = TOTAL_FRAMES + allStops.reduce((sum, s) => sum + s.durationFrames, 0);

  return {
    events: layoutMap,
    timeStopRegions,
    totalRealFrames,
  };
}
