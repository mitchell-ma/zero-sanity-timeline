export const FPS = 120;
export const TOTAL_SECONDS = 120;
export const TOTAL_FRAMES = FPS * TOTAL_SECONDS; // 14,400

// At zoom 1.0: 60px per second = 0.5px per frame
export const BASE_PX_PER_SECOND = 60;

export const TIME_AXIS_WIDTH = 68;
export const COL_WIDTH = 88;
export const HEADER_HEIGHT = 72;
export const APP_BAR_HEIGHT = 52;
export const CONTROLS_BAR_HEIGHT = 44;

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 20;

export function pxPerFrame(zoom) {
  return (zoom * BASE_PX_PER_SECOND) / FPS;
}

export function frameToPx(frame, zoom) {
  return frame * pxPerFrame(zoom);
}

export function pxToFrame(px, zoom) {
  return Math.max(0, Math.min(TOTAL_FRAMES, Math.round(px / pxPerFrame(zoom))));
}

export function timelineHeight(zoom) {
  return TOTAL_FRAMES * pxPerFrame(zoom);
}

export function frameToTimeLabel(frame) {
  const totalSec = frame / FPS;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function frameToDetailLabel(frame) {
  const totalSec = frame / FPS;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const frames = frame % FPS;
  if (frames === 0) return `${mins}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}.${String(frames).padStart(3, '0')}`;
}

export function framesToSeconds(frames) {
  return (frames / FPS).toFixed(2);
}

export function secondsToFrames(s) {
  return Math.round(parseFloat(s) * FPS);
}

export function getTickMarks(zoom) {
  const ticks = [];
  const secondPx = pxPerFrame(zoom) * FPS;

  if (secondPx < 6) {
    // Every 10s major, every 5s minor
    for (let s = 0; s <= TOTAL_SECONDS; s += 5) {
      ticks.push({ frame: s * FPS, major: s % 10 === 0 });
    }
  } else if (secondPx < 20) {
    // Every 5s major, every 1s minor
    for (let s = 0; s <= TOTAL_SECONDS; s++) {
      ticks.push({ frame: s * FPS, major: s % 5 === 0 });
    }
  } else if (secondPx < 80) {
    // Every 1s major, every 0.5s minor
    for (let s = 0; s <= TOTAL_SECONDS; s++) {
      ticks.push({ frame: s * FPS, major: true });
      if (s < TOTAL_SECONDS) {
        ticks.push({ frame: s * FPS + FPS / 2, major: false });
      }
    }
  } else {
    // High zoom: frame-level ticks
    const frameInterval = Math.max(1, Math.floor(FPS / Math.floor(secondPx / 10)));
    for (let f = 0; f <= TOTAL_FRAMES; f += frameInterval) {
      ticks.push({ frame: f, major: f % FPS === 0 });
    }
  }
  return ticks;
}
