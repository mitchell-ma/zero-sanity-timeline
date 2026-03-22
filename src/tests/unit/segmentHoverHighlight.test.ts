/**
 * Tests for segment hover highlight logic — the hover marker should highlight
 * all segments whose frame range it overlaps with.
 *
 * Verifies:
 * - Hover within a segment's range highlights it
 * - Hover outside a segment's range does not highlight it
 * - Hover at exact boundary (start frame) highlights the segment
 * - Hover at exact end boundary (start + duration) does NOT highlight (exclusive end)
 * - Null/undefined hover frame highlights nothing
 * - Adjacent segments: only the one containing the hover frame is highlighted
 * - Zero-duration segments are never highlighted
 * - All segments (including passive/status) are highlighted by the hover line
 * - Combo activation windows are excluded from hover highlighting
 * - Label offset follows the hover line position within each segment
 * - Label offset is axis-aware (top for vertical, left for horizontal)
 * - hoverFrame recomputes correctly on scroll
 */

/** Pure reimplementation of the segment hover check from EventBlock. */
function isSegmentHovered(
  hoverFrame: number | null | undefined,
  segStartFrame: number,
  segDuration: number,
): boolean {
  if (hoverFrame == null) return false;
  return hoverFrame >= segStartFrame && hoverFrame < segStartFrame + segDuration;
}

/** Pure reimplementation of the frame diamond hover check from EventBlock. */
function isFrameHovered(
  hoverFrame: number | null | undefined,
  frameAbsReal: number,
  ppf: number,
): boolean {
  if (hoverFrame == null) return false;
  return Math.abs((hoverFrame - frameAbsReal) * ppf) <= 4;
}

describe('isSegmentHovered', () => {
  test('hover within segment range highlights it', () => {
    expect(isSegmentHovered(100, 60, 120)).toBe(true); // 60..180, hover at 100
  });

  test('hover before segment does not highlight', () => {
    expect(isSegmentHovered(50, 60, 120)).toBe(false);
  });

  test('hover after segment does not highlight', () => {
    expect(isSegmentHovered(200, 60, 120)).toBe(false);
  });

  test('hover at exact start boundary highlights', () => {
    expect(isSegmentHovered(60, 60, 120)).toBe(true);
  });

  test('hover at exact end boundary does NOT highlight (exclusive)', () => {
    expect(isSegmentHovered(180, 60, 120)).toBe(false);
  });

  test('null hover frame highlights nothing', () => {
    expect(isSegmentHovered(null, 60, 120)).toBe(false);
  });

  test('undefined hover frame highlights nothing', () => {
    expect(isSegmentHovered(undefined, 60, 120)).toBe(false);
  });

  test('zero-duration segment is never highlighted', () => {
    expect(isSegmentHovered(60, 60, 0)).toBe(false);
  });

  test('adjacent segments: only the containing one highlights', () => {
    // Segment A: 0..60, Segment B: 60..180, Segment C: 180..240
    const segments = [
      { start: 0, dur: 60 },
      { start: 60, dur: 120 },
      { start: 180, dur: 60 },
    ];
    const hoverFrame = 100;
    const results = segments.map(s => isSegmentHovered(hoverFrame, s.start, s.dur));
    expect(results).toEqual([false, true, false]);
  });

  test('hover at segment boundary highlights only the next segment', () => {
    // Segment A: 0..60, Segment B: 60..120
    expect(isSegmentHovered(60, 0, 60)).toBe(false);   // end of A (exclusive)
    expect(isSegmentHovered(60, 60, 60)).toBe(true);    // start of B (inclusive)
  });
});

describe('isFrameHovered', () => {
  test('frame exactly at hover position is highlighted', () => {
    expect(isFrameHovered(100, 100, 2.0)).toBe(true);
  });

  test('frame within 4px tolerance is highlighted', () => {
    // ppf=2.0, delta=1 frame → 2px < 4px threshold
    expect(isFrameHovered(100, 101, 2.0)).toBe(true);
  });

  test('frame outside 4px tolerance is not highlighted', () => {
    // ppf=2.0, delta=3 frames → 6px > 4px threshold
    expect(isFrameHovered(100, 103, 2.0)).toBe(false);
  });

  test('null hover frame highlights nothing', () => {
    expect(isFrameHovered(null, 100, 2.0)).toBe(false);
  });

  test('tolerance scales with zoom (ppf)', () => {
    // At ppf=1.0, 4 frames away → 4px → exactly at threshold
    expect(isFrameHovered(100, 104, 1.0)).toBe(true);
    // At ppf=1.0, 5 frames away → 5px → beyond threshold
    expect(isFrameHovered(100, 105, 1.0)).toBe(false);
  });
});

describe('multi-phase event hover highlighting', () => {
  // Simulates a standard 3-phase event: activation (0-60), active (60-120), cooldown (120-180)
  const phases = [
    { name: 'activation', start: 0, dur: 60 },
    { name: 'active', start: 60, dur: 60 },
    { name: 'cooldown', start: 120, dur: 60 },
  ];

  function hoveredPhases(hoverFrame: number | null) {
    return phases
      .filter(p => isSegmentHovered(hoverFrame, p.start, p.dur))
      .map(p => p.name);
  }

  test('hover in activation phase highlights only activation', () => {
    expect(hoveredPhases(30)).toEqual(['activation']);
  });

  test('hover in active phase highlights only active', () => {
    expect(hoveredPhases(90)).toEqual(['active']);
  });

  test('hover in cooldown phase highlights only cooldown', () => {
    expect(hoveredPhases(150)).toEqual(['cooldown']);
  });

  test('hover before event highlights nothing', () => {
    expect(hoveredPhases(-10)).toEqual([]);
  });

  test('hover after event highlights nothing', () => {
    expect(hoveredPhases(200)).toEqual([]);
  });

  test('null hover highlights nothing', () => {
    expect(hoveredPhases(null)).toEqual([]);
  });

  // Ultimate with animation sub-phases:
  // animation (0-20), statis (20-60), active (60-120), cooldown (120-180)
  const ultPhases = [
    { name: 'animation', start: 0, dur: 20 },
    { name: 'statis', start: 20, dur: 40 },
    { name: 'active', start: 60, dur: 60 },
    { name: 'cooldown', start: 120, dur: 60 },
  ];

  function hoveredUltPhases(hoverFrame: number | null) {
    return ultPhases
      .filter(p => isSegmentHovered(hoverFrame, p.start, p.dur))
      .map(p => p.name);
  }

  test('ultimate: hover in animation highlights only animation', () => {
    expect(hoveredUltPhases(10)).toEqual(['animation']);
  });

  test('ultimate: hover in statis highlights only statis', () => {
    expect(hoveredUltPhases(35)).toEqual(['statis']);
  });

  test('ultimate: hover at animation/statis boundary highlights statis', () => {
    expect(hoveredUltPhases(20)).toEqual(['statis']);
  });
});

// ── Hover label offset tests ──────────────────────────────────────────────────

const BASE_PX_PER_SECOND = 80;
const FPS = 30;
const TIMELINE_TOP_PAD = 12;

function durationToPx(frames: number, zoom: number): number {
  return frames * (zoom * BASE_PX_PER_SECOND) / FPS;
}

/** Pure reimplementation of the label offset helper from EventBlock. */
function hoverLabelStyle(
  hoverFrame: number | null | undefined,
  segStartFrame: number,
  zoom: number,
  framePos: 'top' | 'left',
): { top: number } | { left: number } | undefined {
  if (hoverFrame == null) return undefined;
  const px = durationToPx(hoverFrame - segStartFrame, zoom);
  return framePos === 'top' ? { top: px } : { left: px };
}

function pxPerFrame(zoom: number): number {
  return (zoom * BASE_PX_PER_SECOND) / FPS;
}

function pxToFrame(px: number, zoom: number): number {
  return Math.max(0, Math.floor((px - TIMELINE_TOP_PAD) / pxPerFrame(zoom)));
}

/** Pure reimplementation of scroll-based hoverFrame recomputation from CombatPlanner. */
function computeHoverFrameOnScroll(
  frameClient: number,
  scrollRectStart: number,
  scrollPos: number,
  bodyTop: number,
  zoom: number,
): { frame: number; clientY: number } | null {
  const relFrame = frameClient - scrollRectStart + scrollPos - bodyTop;
  if (relFrame <= 0) return null;
  const ppf = pxPerFrame(zoom);
  const snappedRel = Math.max(TIMELINE_TOP_PAD, TIMELINE_TOP_PAD + Math.round((relFrame - TIMELINE_TOP_PAD) / ppf) * ppf);
  const frame = pxToFrame(snappedRel, zoom);
  const clientY = snappedRel - scrollPos + scrollRectStart + bodyTop;
  return { frame, clientY };
}


describe('passive segment hover highlighting', () => {
  // Previously, passive segments had `!passive &&` gates preventing hover highlight.
  // Now all segments should be highlightable regardless of passive state.

  test('passive segment within range is highlighted', () => {
    expect(isSegmentHovered(120, 100, 60)).toBe(true);
  });

  test('passive segment outside range is not highlighted', () => {
    expect(isSegmentHovered(80, 100, 60)).toBe(false);
  });

  test('multiple passive segments: only intersected one is highlighted', () => {
    const segments = [
      { start: 0, dur: 30 },
      { start: 50, dur: 40 },
      { start: 100, dur: 60 },
    ];
    const hoverFrame = 55;
    const results = segments.map(s => isSegmentHovered(hoverFrame, s.start, s.dur));
    expect(results).toEqual([false, true, false]);
  });
});


describe('hoverLabelStyle', () => {
  const zoom = 1.0;

  test('returns undefined when hoverFrame is null', () => {
    expect(hoverLabelStyle(null, 0, zoom, 'top')).toBeUndefined();
  });

  test('returns top offset in vertical mode', () => {
    const style = hoverLabelStyle(100, 60, zoom, 'top');
    expect(style).toBeDefined();
    expect(style).toHaveProperty('top');
    expect(style).not.toHaveProperty('left');
  });

  test('returns left offset in horizontal mode', () => {
    const style = hoverLabelStyle(100, 60, zoom, 'left');
    expect(style).toBeDefined();
    expect(style).toHaveProperty('left');
    expect(style).not.toHaveProperty('top');
  });

  test('offset is zero when hover is at segment start', () => {
    const style = hoverLabelStyle(60, 60, zoom, 'top');
    expect(style).toEqual({ top: 0 });
  });

  test('offset increases as hover moves deeper into segment', () => {
    const styleA = hoverLabelStyle(70, 60, zoom, 'top') as { top: number };
    const styleB = hoverLabelStyle(90, 60, zoom, 'top') as { top: number };
    expect(styleB.top).toBeGreaterThan(styleA.top);
  });

  test('offset scales with zoom', () => {
    const styleZoom1 = hoverLabelStyle(90, 60, 1.0, 'top') as { top: number };
    const styleZoom2 = hoverLabelStyle(90, 60, 2.0, 'top') as { top: number };
    expect(styleZoom2.top).toBe(styleZoom1.top * 2);
  });

  test('label offset matches durationToPx for the frame delta', () => {
    const hoverFrame = 100;
    const segStart = 60;
    const style = hoverLabelStyle(hoverFrame, segStart, zoom, 'top') as { top: number };
    const expectedPx = durationToPx(hoverFrame - segStart, zoom);
    expect(style.top).toBe(expectedPx);
  });
});


describe('3-phase event label offsets', () => {
  const realStart = 0;
  const activationDur = 60;
  const activeDur = 60;
  const coolDur = 60;
  const zoom = 1.0;

  test('hover in activation: only activation label gets offset', () => {
    const hoverFrame = 30;
    const activationHover = isSegmentHovered(hoverFrame, realStart, activationDur);
    const activeHover = isSegmentHovered(hoverFrame, realStart + activationDur, activeDur);
    const coolHover = isSegmentHovered(hoverFrame, realStart + activationDur + activeDur, coolDur);

    expect(activationHover).toBe(true);
    expect(activeHover).toBe(false);
    expect(coolHover).toBe(false);

    const activationStyle = activationHover ? hoverLabelStyle(hoverFrame, realStart, zoom, 'top') : undefined;
    const activeStyle = activeHover ? hoverLabelStyle(hoverFrame, realStart + activationDur, zoom, 'top') : undefined;
    const coolStyle = coolHover ? hoverLabelStyle(hoverFrame, realStart + activationDur + activeDur, zoom, 'top') : undefined;

    expect(activationStyle).toBeDefined();
    expect(activeStyle).toBeUndefined();
    expect(coolStyle).toBeUndefined();
  });

  test('hover in active: only active label gets offset', () => {
    const hoverFrame = 90;
    expect(isSegmentHovered(hoverFrame, realStart, activationDur)).toBe(false);
    expect(isSegmentHovered(hoverFrame, realStart + activationDur, activeDur)).toBe(true);

    const activeStyle = hoverLabelStyle(hoverFrame, realStart + activationDur, zoom, 'top') as { top: number };
    expect(activeStyle).toEqual({ top: durationToPx(30, zoom) });
  });

  test('hover in cooldown: only cooldown label gets offset', () => {
    const hoverFrame = 150;
    expect(isSegmentHovered(hoverFrame, realStart + activationDur + activeDur, coolDur)).toBe(true);

    const coolStyle = hoverLabelStyle(hoverFrame, realStart + activationDur + activeDur, zoom, 'top') as { top: number };
    expect(coolStyle).toEqual({ top: durationToPx(30, zoom) });
  });
});


describe('ultimate sub-phase label offsets', () => {
  const realStart = 0;
  const animDur = 20;
  const activationDur = 60;
  const zoom = 1.0;

  test('hover in animation phase gets correct offset', () => {
    const hoverFrame = 10;
    expect(isSegmentHovered(hoverFrame, realStart, animDur)).toBe(true);
    const style = hoverLabelStyle(hoverFrame, realStart, zoom, 'top') as { top: number };
    expect(style).toEqual({ top: durationToPx(10, zoom) });
  });

  test('hover in statis phase gets correct offset', () => {
    const hoverFrame = 35;
    expect(isSegmentHovered(hoverFrame, realStart + animDur, activationDur - animDur)).toBe(true);
    const style = hoverLabelStyle(hoverFrame, realStart + animDur, zoom, 'top') as { top: number };
    expect(style).toEqual({ top: durationToPx(15, zoom) });
  });
});


describe('hoverFrame recomputation on scroll', () => {
  const zoom = 1.0;
  const scrollRectStart = 200;
  const bodyTop = 0;

  test('scroll changes frame at same mouse position', () => {
    const frameClient = 400;
    const resultA = computeHoverFrameOnScroll(frameClient, scrollRectStart, 0, bodyTop, zoom);
    const resultB = computeHoverFrameOnScroll(frameClient, scrollRectStart, 100, bodyTop, zoom);

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    expect(resultB!.frame).toBeGreaterThan(resultA!.frame);
  });

  test('scroll updates clientY (hover line screen position)', () => {
    const frameClient = 400;
    const resultA = computeHoverFrameOnScroll(frameClient, scrollRectStart, 0, bodyTop, zoom);
    const resultB = computeHoverFrameOnScroll(frameClient, scrollRectStart, 100, bodyTop, zoom);

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    expect(resultA!.clientY).not.toBe(resultB!.clientY);
  });

  test('relFrame <= 0 returns null', () => {
    const result = computeHoverFrameOnScroll(scrollRectStart, scrollRectStart, 0, bodyTop, zoom);
    expect(result).toBeNull();
  });

  test('same content position at different scroll offsets produces consistent snap', () => {
    const resultA = computeHoverFrameOnScroll(300, scrollRectStart, 50, bodyTop, zoom);
    const resultB = computeHoverFrameOnScroll(250, scrollRectStart, 100, bodyTop, zoom);
    expect(resultA!.frame).toBe(resultB!.frame);
  });
});


describe('combo activation window exclusion', () => {
  function shouldPassHoverFrame(isWindow: boolean, hoverFrame: number | null): number | null | undefined {
    return isWindow ? undefined : hoverFrame;
  }

  test('non-window event receives hoverFrame', () => {
    expect(shouldPassHoverFrame(false, 100)).toBe(100);
  });

  test('combo window event receives undefined', () => {
    expect(shouldPassHoverFrame(true, 100)).toBeUndefined();
  });

  test('non-window event with null hoverFrame passes null', () => {
    expect(shouldPassHoverFrame(false, null)).toBeNull();
  });
});
