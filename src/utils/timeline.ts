import { TimeDependency } from '../consts/enums';

export const FPS = 120;
export const TOTAL_SECONDS = 900;
export const TOTAL_FRAMES = FPS * TOTAL_SECONDS; // 108,000 (15 minutes)

// At zoom 1.0: 60px per second = 0.5px per frame
export const BASE_PX_PER_SECOND = 60;

export const TIME_AXIS_WIDTH = 68;
export const COL_WIDTH = 25;
export const LOADOUT_ROW_HEIGHT = 140;
export const HEADER_HEIGHT = 72;
export const APP_BAR_HEIGHT = 52;
export const CONTROLS_BAR_HEIGHT = 44;

export const TIMELINE_TOP_PAD = 16;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 20;

export interface TickMark {
  frame: number;
  major: boolean;
}

export function pxPerFrame(zoom: number): number {
  return (zoom * BASE_PX_PER_SECOND) / FPS;
}

export function frameToPx(frame: number, zoom: number): number {
  return TIMELINE_TOP_PAD + frame * pxPerFrame(zoom);
}

export function durationToPx(frames: number, zoom: number): number {
  return frames * pxPerFrame(zoom);
}

export function pxToFrame(px: number, zoom: number): number {
  return Math.max(0, Math.min(TOTAL_FRAMES, Math.floor((px - TIMELINE_TOP_PAD) / pxPerFrame(zoom))));
}

export function timelineHeight(zoom: number): number {
  return TIMELINE_TOP_PAD + TOTAL_FRAMES * pxPerFrame(zoom);
}

// ── Time dilation ─────────────────────────────────────────────────────────────

export interface TimeDilationZone {
  /** Game-time start frame. */
  startFrame: number;
  /** Game-time duration (frames). May be 0 for pure insertion zones (time-stops). */
  durationFrames: number;
  /** Visual stretch factor (e.g. ~1.709 for perfect dodge). */
  dilation: number;
  /** Extra real-time frames inserted after this zone (for time-stops where game-time freezes). */
  insertedFrames?: number;
  /** Operator slot ID that owns this time-stop (for filtering in combo window rendering). */
  ownerId?: string;
  /** Column that produced this time-stop (e.g. 'ultimate', 'combo', 'dash'). */
  sourceColumnId?: string;
}

/**
 * Convert a game-time frame to a pixel position, accounting for time dilation zones.
 * Zones must be sorted by startFrame and non-overlapping.
 */
export function frameToPxDilated(frame: number, zoom: number, zones: readonly TimeDilationZone[]): number {
  const ppf = pxPerFrame(zoom);
  let px = TIMELINE_TOP_PAD;
  let lastFrame = 0;

  for (const z of zones) {
    if (frame <= z.startFrame) break;
    // Normal region before this zone
    const normalEnd = Math.min(frame, z.startFrame);
    px += (normalEnd - lastFrame) * ppf;
    lastFrame = normalEnd;

    if (frame <= z.startFrame) break;

    // Dilated region
    if (z.durationFrames > 0) {
      const zoneEnd = z.startFrame + z.durationFrames;
      const dilatedEnd = Math.min(frame, zoneEnd);
      px += (dilatedEnd - z.startFrame) * ppf * z.dilation;
      lastFrame = dilatedEnd;
    }

    // Insertion (added when frame is past the zone boundary)
    if (z.insertedFrames && frame > z.startFrame + z.durationFrames) {
      px += z.insertedFrames * ppf;
    }
  }

  // Remaining normal region after all zones
  if (frame > lastFrame) {
    px += (frame - lastFrame) * ppf;
  }

  return px;
}

/**
 * Convert a game-time duration to pixel height at a specific start frame,
 * accounting for time dilation zones the duration spans.
 *
 * REAL_TIME segments are unaffected by dilation — their pixel height is always
 * proportional to their frame count regardless of overlapping dilation zones.
 */
export function durationToPxDilated(
  startFrame: number, durationFrames: number, zoom: number,
  zones: readonly TimeDilationZone[],
  timeDependency: TimeDependency = TimeDependency.GAME_TIME,
): number {
  if (timeDependency === TimeDependency.REAL_TIME) {
    return durationFrames * pxPerFrame(zoom);
  }
  return frameToPxDilated(startFrame + durationFrames, zoom, zones) - frameToPxDilated(startFrame, zoom, zones);
}

/** Total dilated timeline height. */
export function timelineHeightDilated(zoom: number, zones: readonly TimeDilationZone[]): number {
  return frameToPxDilated(TOTAL_FRAMES, zoom, zones);
}

/** Convert pixel position back to game-time frame, accounting for dilation. */
export function pxToFrameDilated(px: number, zoom: number, zones: readonly TimeDilationZone[]): number {
  const ppf = pxPerFrame(zoom);
  let remainingPx = px - TIMELINE_TOP_PAD;
  let frame = 0;

  for (const z of zones) {
    // Normal region before this zone
    const normalPx = (z.startFrame - frame) * ppf;
    if (remainingPx <= normalPx) {
      return Math.max(0, Math.min(TOTAL_FRAMES, Math.floor(frame + remainingPx / ppf)));
    }
    remainingPx -= normalPx;
    frame = z.startFrame;

    // Dilated region
    if (z.durationFrames > 0) {
      const dilatedPx = z.durationFrames * ppf * z.dilation;
      if (remainingPx <= dilatedPx) {
        return Math.max(0, Math.min(TOTAL_FRAMES, Math.floor(frame + remainingPx / (ppf * z.dilation))));
      }
      remainingPx -= dilatedPx;
      frame = z.startFrame + z.durationFrames;
    }

    // Insertion — game-time is frozen here
    if (z.insertedFrames) {
      const insertionPx = z.insertedFrames * ppf;
      if (remainingPx <= insertionPx) {
        return Math.max(0, Math.min(TOTAL_FRAMES, frame)); // frozen at zone end
      }
      remainingPx -= insertionPx;
    }
  }

  // Remaining normal region
  return Math.max(0, Math.min(TOTAL_FRAMES, Math.floor(frame + remainingPx / ppf)));
}

/**
 * Convert pixel position to a real-time frame (wall-clock), accounting for dilation.
 * Unlike pxToFrameDilated (which returns game-frame and freezes inside time-stops),
 * this returns a continuously advancing real-frame that includes time-stop durations.
 */
export function pxToRealFrame(px: number, zoom: number, zones: readonly TimeDilationZone[]): number {
  const ppf = pxPerFrame(zoom);
  let remainingPx = px - TIMELINE_TOP_PAD;
  let gameFrame = 0;
  let timeStopAcc = 0;

  for (const z of zones) {
    // Normal region before this zone
    const normalPx = (z.startFrame - gameFrame) * ppf;
    if (remainingPx <= normalPx) {
      return Math.max(0, gameFrame + remainingPx / ppf + timeStopAcc);
    }
    remainingPx -= normalPx;
    gameFrame = z.startFrame;

    // Dilated region
    if (z.durationFrames > 0) {
      const dilatedPx = z.durationFrames * ppf * z.dilation;
      if (remainingPx <= dilatedPx) {
        const gfAdvance = remainingPx / (ppf * z.dilation);
        return Math.max(0, gameFrame + gfAdvance + timeStopAcc);
      }
      remainingPx -= dilatedPx;
      gameFrame = z.startFrame + z.durationFrames;
    }

    // Insertion — time-stop: game-frame frozen, real-time advances
    if (z.insertedFrames) {
      const insertionPx = z.insertedFrames * ppf;
      if (remainingPx <= insertionPx) {
        const stopAdvance = remainingPx / ppf;
        return Math.max(0, gameFrame + timeStopAcc + stopAdvance);
      }
      remainingPx -= insertionPx;
      timeStopAcc += z.insertedFrames;
    }
  }

  // Remaining normal region
  return Math.max(0, gameFrame + remainingPx / ppf + timeStopAcc);
}

/** Convert TimeMap time-stops into TimeDilationZone insertion zones. */
export function timeStopsToZones(timeMap: TimeMap): TimeDilationZone[] {
  if (timeMap.isEmpty()) return [];
  return timeMap.stops.map((s) => ({
    startFrame: s.gameFrame,
    durationFrames: 0,
    dilation: 1,
    insertedFrames: s.durationFrames,
    ownerId: s.ownerId,
    sourceColumnId: s.sourceColumnId,
  }));
}

export function frameToTimeLabel(frame: number): string {
  const totalSec = frame / FPS;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function frameToTimeLabelPrecise(frame: number): string {
  const totalSec = frame / FPS;
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secs = totalSec % 60;
  const secsStr = secs.toFixed(2).padStart(5, '0');
  return `${mins}:${secsStr}s`;
}

export function frameToDetailLabel(frame: number): string {
  const totalSec = frame / FPS;
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secsRaw = (totalSec % 60).toFixed(2);
  const secs = secsRaw.indexOf('.') < 2 ? secsRaw.padStart(5, '0') : secsRaw;
  const frames = frame % FPS;
  if (frames === 0) return `${mins}:${secs}s`;
  return `${mins}:${secs}s F${String(frames).padStart(3, '0')}`;
}

export function framesToSeconds(frames: number): string {
  return (frames / FPS).toFixed(2);
}

export function secondsToFrames(s: string | number): number {
  return Math.round(parseFloat(String(s)) * FPS);
}

/**
 * Compute the game-time absolute frame for a frame within a time-stopped event
 * (combo/ultimate). During the animation portion game time is frozen, so offsets
 * within that window map to the event's startFrame.
 */
export function absoluteGameFrame(
  eventStart: number,
  localOffset: number,
  animationDuration: number | undefined,
): number {
  const anim = animationDuration ?? 0;
  return eventStart + Math.max(0, localOffset - anim);
}

/**
 * Get tick marks within a visible frame range.
 * Pass startFrame/endFrame to limit output (virtualization for large timelines).
 */
export function getTickMarks(zoom: number, startFrame = 0, endFrame = TOTAL_FRAMES, totalFrames = TOTAL_FRAMES): TickMark[] {
  const ticks: TickMark[] = [];
  const secondPx = pxPerFrame(zoom) * FPS;
  const totalSec = totalFrames / FPS;

  if (secondPx < 6) {
    const step = 5;
    const s0 = Math.max(0, Math.floor((startFrame / FPS) / step) * step);
    const s1 = Math.min(totalSec, Math.ceil(endFrame / FPS));
    for (let s = s0; s <= s1; s += step) {
      ticks.push({ frame: s * FPS, major: s % 10 === 0 });
    }
  } else if (secondPx < 20) {
    const s0 = Math.max(0, Math.floor(startFrame / FPS));
    const s1 = Math.min(totalSec, Math.ceil(endFrame / FPS));
    for (let s = s0; s <= s1; s++) {
      ticks.push({ frame: s * FPS, major: s % 5 === 0 });
    }
  } else if (secondPx < 80) {
    const s0 = Math.max(0, Math.floor(startFrame / FPS));
    const s1 = Math.min(totalSec, Math.ceil(endFrame / FPS));
    for (let s = s0; s <= s1; s++) {
      ticks.push({ frame: s * FPS, major: true });
      if (s < totalSec) {
        const half = s * FPS + FPS / 2;
        if (half >= startFrame && half <= endFrame) {
          ticks.push({ frame: half, major: false });
        }
      }
    }
  } else {
    const frameInterval = Math.max(1, Math.floor(FPS / Math.floor(secondPx / 10)));
    const f0 = Math.max(0, Math.floor(startFrame / frameInterval) * frameInterval);
    const f1 = Math.min(totalFrames, endFrame);
    for (let f = f0; f <= f1; f += frameInterval) {
      ticks.push({ frame: f, major: f % FPS === 0 });
    }
  }
  return ticks;
}

/** Compute the visible frame range from scroll position and viewport height. */
export function getVisibleFrameRange(scrollTop: number, viewportHeight: number, zoom: number, buffer = 2000): { startFrame: number; endFrame: number } {
  const ppf = pxPerFrame(zoom);
  const startFrame = Math.max(0, Math.floor((scrollTop - TIMELINE_TOP_PAD - buffer) / ppf));
  const endFrame = Math.min(TOTAL_FRAMES, Math.ceil((scrollTop + viewportHeight + buffer - TIMELINE_TOP_PAD) / ppf));
  return { startFrame, endFrame };
}

// ── Time Map (game-time vs real-time) ─────────────────────────────────────────

/** A time-stop region where game-time freezes but real-time advances. */
export interface TimeStop {
  /** Game-frame at which the time-stop begins. */
  gameFrame: number;
  /** Duration in frames of the time-stop (real-time only, game-time frozen). */
  durationFrames: number;
  /** Operator that caused this time-stop. */
  ownerId: string;
  /** Column that produced this time-stop (e.g. 'ultimate', 'combo', 'dash'). */
  sourceColumnId: string;
}

/**
 * Maps between game-time and real-time coordinates.
 *
 * Time-stops (e.g. ultimate animations) insert extra real-time frames where
 * game-time is frozen. The TimeMap tracks these insertions and provides
 * conversion between the two time spaces.
 */
export class TimeMap {
  readonly stops: readonly TimeStop[];
  /** Total extra real-frames inserted by all time-stops. */
  readonly totalExtraFrames: number;

  constructor(stops: TimeStop[]) {
    // Sort by game-frame; merge overlapping stops at the same frame
    const sorted = stops.slice().sort((a, b) => a.gameFrame - b.gameFrame);
    const merged: TimeStop[] = [];
    for (const s of sorted) {
      const last = merged.length > 0 ? merged[merged.length - 1] : null;
      if (last && last.gameFrame === s.gameFrame) {
        // Multiple time-stops at same game-frame: sum their durations
        merged[merged.length - 1] = { ...last, durationFrames: last.durationFrames + s.durationFrames };
      } else {
        merged.push(s);
      }
    }
    this.stops = merged;
    let total = 0;
    for (const s of merged) total += s.durationFrames;
    this.totalExtraFrames = total;
  }

  /** True if there are no time-stops. */
  isEmpty(): boolean { return this.stops.length === 0; }

  /**
   * Cumulative time-stop frames inserted strictly before game-frame `gf`.
   * Time-stops at `gf` itself are NOT included (the stop hasn't started yet).
   */
  accumulatedBefore(gf: number): number {
    let acc = 0;
    for (const s of this.stops) {
      if (s.gameFrame >= gf) break;
      acc += s.durationFrames;
    }
    return acc;
  }

  /**
   * Cumulative time-stop frames inserted at or before game-frame `gf`.
   * Time-stops at `gf` ARE included (the stop has completed).
   */
  accumulatedThrough(gf: number): number {
    let acc = 0;
    for (const s of this.stops) {
      if (s.gameFrame > gf) break;
      acc += s.durationFrames;
    }
    return acc;
  }

  /**
   * Convert game-frame to real-frame for visual positioning.
   * The real-frame is offset by all time-stops that occur before this game-frame.
   */
  gameToReal(gf: number): number {
    return gf + this.accumulatedBefore(gf);
  }

  /**
   * Convert real-frame back to game-frame.
   * If the real-frame falls within a time-stop region, returns the game-frame
   * at which the time-stop occurs (game-time is frozen).
   */
  realToGame(rf: number): number {
    let acc = 0;
    for (const s of this.stops) {
      const realStart = s.gameFrame + acc;
      const realEnd = realStart + s.durationFrames;
      if (rf < realStart) return rf - acc;
      if (rf < realEnd) return s.gameFrame; // inside time-stop: frozen
      acc += s.durationFrames;
    }
    return rf - acc;
  }

  /**
   * Compute the real-frame duration of a game-frame range.
   * If time-stops fall within [startGF, startGF + durationGF), the result
   * is larger than durationGF.
   */
  gameRangeToRealDuration(startGF: number, durationGF: number): number {
    return this.gameToReal(startGF + durationGF) - this.gameToReal(startGF);
  }

  /** Total real frames in the timeline (game frames + all time-stop frames). */
  totalRealFrames(): number {
    return TOTAL_FRAMES + this.totalExtraFrames;
  }

  /**
   * Get time-stop regions for overlay rendering.
   * Each region has its game-frame position and the real-frame start/duration.
   */
  getStopRegions(): { gameFrame: number; realFrameStart: number; durationFrames: number; ownerId: string }[] {
    const regions: { gameFrame: number; realFrameStart: number; durationFrames: number; ownerId: string }[] = [];
    let acc = 0;
    for (const s of this.stops) {
      regions.push({
        gameFrame: s.gameFrame,
        realFrameStart: s.gameFrame + acc,
        durationFrames: s.durationFrames,
        ownerId: s.ownerId,
      });
      acc += s.durationFrames;
    }
    return regions;
  }

  /** Convert game-frame to a real-time label string (M:SS format). */
  realTimeLabel(gameFrame: number): string {
    const realFrame = this.gameToReal(gameFrame);
    return frameToTimeLabel(realFrame);
  }
}

/** Empty singleton for when there are no time-stops. */
export const EMPTY_TIME_MAP = new TimeMap([]);

/** Build a TimeMap from timeline events (extracts time-stops from ultimates, perfect dodges, and combo skills). */
export function buildTimeMap(events: { startFrame: number; columnId: string; ownerId: string; animationDuration?: number; isPerfectDodge?: boolean }[]): TimeMap {
  const stops: TimeStop[] = [];
  for (const ev of events) {
    const isUltTimeStop = ev.columnId === 'ultimate' && ev.animationDuration && ev.animationDuration > 0;
    const isDodgeTimeStop = ev.columnId === 'dash' && ev.isPerfectDodge && ev.animationDuration && ev.animationDuration > 0;
    const isComboTimeStop = ev.columnId === 'combo' && ev.animationDuration && ev.animationDuration > 0;
    if ((isUltTimeStop || isDodgeTimeStop || isComboTimeStop) && ev.animationDuration) {
      stops.push({
        gameFrame: ev.startFrame,
        durationFrames: ev.animationDuration,
        ownerId: ev.ownerId,
        sourceColumnId: ev.columnId,
      });
    }
  }
  if (stops.length === 0) return EMPTY_TIME_MAP;
  return new TimeMap(stops);
}
