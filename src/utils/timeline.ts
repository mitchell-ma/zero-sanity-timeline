export const FPS = 120;

/** Decimal precision for numeric display in info panes. Change this to control all formatted numbers. */
export const DISPLAY_PRECISION = 4;

/** Format a number to up to DISPLAY_PRECISION decimal places, trimming trailing zeros. */
export const fmtN = (v: number) => v.toFixed(DISPLAY_PRECISION).replace(/\.?0+$/, '');
export const TOTAL_SECONDS = 900;
export const TOTAL_FRAMES = FPS * TOTAL_SECONDS; // 108,000 (15 minutes)

// At zoom 1.0: 60px per second = 0.5px per frame
export const BASE_PX_PER_SECOND = 60;

export const TIME_AXIS_WIDTH = 68;
export const COL_WIDTH = 25;
export const LOADOUT_ROW_HEIGHT = 140;
export const HEADER_HEIGHT = 72;
export const HEADER_HEIGHT_VERTICAL = 40;
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

export function pxToFrame(px: number, zoom: number, maxFrame = TOTAL_FRAMES): number {
  return Math.max(0, Math.min(maxFrame, Math.floor((px - TIMELINE_TOP_PAD) / pxPerFrame(zoom))));
}

export function timelineHeight(zoom: number, totalFrames = TOTAL_FRAMES): number {
  return TIMELINE_TOP_PAD + totalFrames * pxPerFrame(zoom);
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
 * Get tick marks within a visible frame range.
 * Pass startFrame/endFrame to limit output (virtualization for large timelines).
 */
// "Nice" second intervals for major (labeled) ticks, ascending
const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];
// Minimum pixel spacing between minor gridlines
const MIN_MINOR_PX = 40;
// Divisors of FPS (120) in descending order — used to snap frame intervals so they always hit second boundaries
const FPS_DIVISORS = [120, 60, 40, 30, 24, 20, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

export function getTickMarks(zoom: number, startFrame = 0, endFrame = TOTAL_FRAMES, totalFrames = TOTAL_FRAMES): TickMark[] {
  const ticks: TickMark[] = [];
  const secondPx = pxPerFrame(zoom) * FPS;
  const totalSec = totalFrames / FPS;

  // Frame-level ticks when very zoomed in (≥160px/sec)
  if (secondPx >= 160) {
    const rawInterval = Math.max(1, Math.floor(FPS / Math.floor(secondPx / 10)));
    // Snap to the largest divisor of FPS ≤ rawInterval so ticks always land on second boundaries
    let frameInterval = 1;
    for (const d of FPS_DIVISORS) {
      if (d <= rawInterval) { frameInterval = d; break; }
    }
    const f0 = Math.max(0, Math.floor(startFrame / frameInterval) * frameInterval);
    const f1 = Math.min(totalFrames, endFrame);
    for (let f = f0; f <= f1; f += frameInterval) {
      ticks.push({ frame: f, major: f % FPS === 0 });
    }
    return ticks;
  }

  // ── Determine major step: at least 8 labels per ~800px of viewport ────
  const maxMajorPx = 800 / 8;
  const maxMajorStep = Math.max(1, Math.floor(maxMajorPx / secondPx));
  let majorStep = NICE_STEPS[0];
  for (let i = NICE_STEPS.length - 1; i >= 0; i--) {
    if (NICE_STEPS[i] <= maxMajorStep) { majorStep = NICE_STEPS[i]; break; }
  }

  // ── Determine minor step: largest nice step that fits MIN_MINOR_PX ────
  // Minor step must evenly divide major step so s % majorStep === 0 hits correctly
  // Cap at 3 minor ticks per major to keep labels frequent relative to gridlines
  let minorStep = majorStep;
  for (let i = NICE_STEPS.length - 1; i >= 0; i--) {
    if (NICE_STEPS[i] * secondPx >= MIN_MINOR_PX && NICE_STEPS[i] < majorStep
      && majorStep % NICE_STEPS[i] === 0 && majorStep / NICE_STEPS[i] <= 3) {
      minorStep = NICE_STEPS[i];
      break;
    }
  }
  // If minor ticks would appear but ratio is too high, increase label frequency instead
  if (minorStep === majorStep) {
    // Check if a smaller minor step exists that's too dense for current majorStep
    // If so, reduce majorStep to allow a good minor/major ratio
    for (let i = NICE_STEPS.length - 1; i >= 0; i--) {
      if (NICE_STEPS[i] * secondPx >= MIN_MINOR_PX && NICE_STEPS[i] < majorStep) {
        // Found a viable minor step — find a majorStep that's ≤ 3x this minor
        const candidateMinor = NICE_STEPS[i];
        for (const ms of NICE_STEPS) {
          if (ms > candidateMinor && ms <= candidateMinor * 3 && ms % candidateMinor === 0) {
            majorStep = ms;
            minorStep = candidateMinor;
            break;
          }
        }
        break;
      }
    }
  }

  // Generate ticks
  const s0 = Math.max(0, Math.floor((startFrame / FPS) / minorStep) * minorStep);
  const s1 = Math.min(totalSec, Math.ceil(endFrame / FPS));
  for (let s = s0; s <= s1; s += minorStep) {
    ticks.push({ frame: s * FPS, major: s % majorStep === 0 });
  }

  // Add half-second minor ticks when zoomed in enough
  if (secondPx >= 60 && minorStep === 1) {
    for (let s = s0; s < s1; s++) {
      const half = s * FPS + FPS / 2;
      if (half >= startFrame && half <= endFrame) {
        ticks.push({ frame: half, major: false });
      }
    }
    ticks.sort((a, b) => a.frame - b.frame);
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

