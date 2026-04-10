/**
 * Timeline layout builder — computes real-time layout positions and durations
 * for all events, expanding game-time durations that span time-stop regions.
 *
 * All event startFrame values are real-time. Time-stops are status regions
 * where game-time-dependent processes pause (durations stretch).
 */
import { TimelineEvent, getAnimationDuration, eventDuration } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { SegmentType } from '../../consts/enums';
import {
  TOTAL_FRAMES,
} from '../../utils/timeline';
import { OPERATOR_COLUMNS } from '../../model/channels';

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
  ownerEntityId: string;
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
  ownerEntityId: string;
  sourceColumnId: string;
}

function collectRawStops(events: TimelineEvent[]): RawTimeStop[] {
  const stops: RawTimeStop[] = [];
  for (const ev of events) {
    const anim = getAnimationDuration(ev);
    if (anim <= 0) continue;
    const isTimeStop =
      ev.columnId === NounType.ULTIMATE ||
      ev.columnId === NounType.COMBO ||
      (ev.columnId === OPERATOR_COLUMNS.INPUT && ev.isPerfectDodge);
    if (!isTimeStop) continue;
    stops.push({
      startFrame: ev.startFrame,
      durationFrames: anim,
      eventUid: ev.uid,
      ownerEntityId: ev.ownerEntityId,
      sourceColumnId: ev.columnId,
    });
  }
  stops.sort((a, b) => a.startFrame - b.startFrame);
  return stops;
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildTimelineLayout(events: TimelineEvent[]): TimelineLayout {
  const allStops = collectRawStops(events);
  const layoutMap = new Map<string, EventLayout>();

  for (const ev of events) {
    // Pipeline already computed all real-time durations (segment extension,
    // derivedOffsetFrame, etc.). Layout just presents pipeline output.
    const realStart = ev.startFrame;

    if (ev.segments.length > 0) {
      // ── Sequenced event (basic attacks, combos with segments) ─────────
      const segments: SegmentLayout[] = [];
      let runningOffset = 0; // tracks end of previous segment for implicit offsets
      let maxEndFrame = 0;

      for (const seg of ev.segments) {
        // Segment durations and offsets are already extended by the pipeline
        // (processTimeStop.ts mutates seg.properties.duration in-place).
        // Layout just uses them directly — no re-expansion needed.
        const eventLocalOffset = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
          ? 0
          : seg.properties.offset != null ? seg.properties.offset : runningOffset;
        const segRealOffset = eventLocalOffset;
        const segRealDur = seg.properties.duration;

        const frames: FrameLayout[] | undefined = seg.frames?.map((f) => {
          // derivedOffsetFrame is already time-stop-adjusted by the pipeline;
          // fall back to raw offsetFrame when not set.
          const frameRealLocal = f.derivedOffsetFrame ?? f.offsetFrame;
          return { realOffset: frameRealLocal };
        });

        segments.push({ realOffset: segRealOffset, realDuration: segRealDur, frames });
        const segEnd = eventLocalOffset + seg.properties.duration;
        if (segEnd > maxEndFrame) maxEndFrame = segEnd;
        if (seg.properties.offset == null) runningOffset += seg.properties.duration;
        else runningOffset = segEnd;
      }

      // maxEndFrame is already pipeline-extended, use directly
      const totalRealDur = maxEndFrame;

      layoutMap.set(ev.uid, {
        eventUid: ev.uid,
        realStartFrame: realStart,
        realTotalDuration: totalRealDur,
        segments,
      });
    } else {
      // ── 3-phase event (ultimates, statuses, battle skills) ────────────
      // Pipeline already extended durations. Layout just presents them.
      const totalDur = eventDuration(ev);
      const realAnimation = getAnimationDuration(ev);

      // Frame diamonds — derivedOffsetFrame already time-stop-adjusted by pipeline
      let phaseFrames: FrameLayout[] | undefined;
      const frameSeg = ev.segments.length > 2 ? ev.segments[2] : ev.segments[0];
      if (frameSeg?.frames) {
        phaseFrames = frameSeg.frames.map((f) => ({
          realOffset: f.derivedOffsetFrame ?? f.offsetFrame,
        }));
      }

      layoutMap.set(ev.uid, {
        eventUid: ev.uid,
        realStartFrame: realStart,
        realTotalDuration: totalDur,
        phases: {
          realActivationDuration: totalDur,
          realAnimationDuration: realAnimation,
          realActiveDuration: 0,
          realCooldownDuration: 0,
        },
        phaseFrames,
      });
    }
  }

  // ── Time-stop overlay regions ───────────────────────────────────────────────
  const timeStopRegions: TimeStopRegion[] = allStops.map((s) => ({
    startFrame: s.startFrame,
    durationFrames: s.durationFrames,
    ownerEntityId: s.ownerEntityId,
    sourceColumnId: s.sourceColumnId,
  }));

  const totalRealFrames = TOTAL_FRAMES + allStops.reduce((sum, s) => sum + s.durationFrames, 0);

  return {
    events: layoutMap,
    timeStopRegions,
    totalRealFrames,
  };
}
