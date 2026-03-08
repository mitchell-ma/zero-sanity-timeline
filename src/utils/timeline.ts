export const FPS = 120;
export const TOTAL_SECONDS = 120;
export const TOTAL_FRAMES = FPS * TOTAL_SECONDS; // 14,400

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

export function frameToTimeLabel(frame: number): string {
  const totalSec = frame / FPS;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function frameToTimeLabelPrecise(frame: number): string {
  const totalSec = frame / FPS;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const secsStr = secs.toFixed(2).padStart(5, '0');
  return `${mins}:${secsStr}`;
}

export function frameToDetailLabel(frame: number): string {
  const totalSec = frame / FPS;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const frames = frame % FPS;
  if (frames === 0) return `${mins}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}.${String(frames).padStart(3, '0')}`;
}

export function framesToSeconds(frames: number): string {
  return (frames / FPS).toFixed(2);
}

export function secondsToFrames(s: string | number): number {
  return Math.round(parseFloat(String(s)) * FPS);
}

export function getTickMarks(zoom: number): TickMark[] {
  const ticks: TickMark[] = [];
  const secondPx = pxPerFrame(zoom) * FPS;

  if (secondPx < 6) {
    for (let s = 0; s <= TOTAL_SECONDS; s += 5) {
      ticks.push({ frame: s * FPS, major: s % 10 === 0 });
    }
  } else if (secondPx < 20) {
    for (let s = 0; s <= TOTAL_SECONDS; s++) {
      ticks.push({ frame: s * FPS, major: s % 5 === 0 });
    }
  } else if (secondPx < 80) {
    for (let s = 0; s <= TOTAL_SECONDS; s++) {
      ticks.push({ frame: s * FPS, major: true });
      if (s < TOTAL_SECONDS) {
        ticks.push({ frame: s * FPS + FPS / 2, major: false });
      }
    }
  } else {
    const frameInterval = Math.max(1, Math.floor(FPS / Math.floor(secondPx / 10)));
    for (let f = 0; f <= TOTAL_FRAMES; f += frameInterval) {
      ticks.push({ frame: f, major: f % FPS === 0 });
    }
  }
  return ticks;
}
