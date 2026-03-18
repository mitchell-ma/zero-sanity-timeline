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
