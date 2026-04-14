/**
 * applyCardOverrides — Unit Test
 *
 * Verifies that the view controller correctly patches serialized skill/status
 * card data with runtime overrides (frame offset drags, segment duration resizes)
 * without mutating the original data.
 */

import { applyCardOverrides } from '../../controller/info-pane/eventPaneController';
import type { EventOverride } from '../../consts/overrideTypes';
import { FPS } from '../../utils/timeline';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCardData(segments: { duration: number; frames?: { offset: number }[] }[]): Record<string, unknown> {
  return {
    properties: { name: 'Test Skill' },
    segments: segments.map((s) => ({
      properties: { duration: { value: s.duration, unit: 'SECOND' } },
      frames: s.frames?.map((f) => ({
        properties: { offset: { value: f.offset, unit: 'SECOND' } },
        clause: [],
      })),
    })),
  };
}

type CardSegment = { properties: { duration: { value: number; unit: string } }; frames?: { properties: { offset: { value: number; unit: string } } }[] };

function getSegments(data: Record<string, unknown>): CardSegment[] {
  return data.segments as CardSegment[];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('applyCardOverrides', () => {
  it('returns original data when override has no segments', () => {
    const data = makeCardData([{ duration: 7, frames: [{ offset: 3 }] }]);
    const entry: EventOverride = {};
    const result = applyCardOverrides(data, entry);
    expect(result).toBe(data); // same reference
  });

  it('patches frame offset from override', () => {
    const data = makeCardData([{ duration: 7, frames: [{ offset: 3 }, { offset: 5 }] }]);
    const newOffsetFrames = 4 * FPS; // 4s in frames
    const entry: EventOverride = {
      segments: { 0: { frames: { 1: { offsetFrame: newOffsetFrames } } } },
    };

    const result = applyCardOverrides(data, entry);
    const segs = getSegments(result);

    // Patched frame should have new offset in seconds
    expect(segs[0].frames![1].properties.offset.value).toBeCloseTo(4, 6);
    // Unpatched frame should be unchanged
    expect(segs[0].frames![0].properties.offset.value).toBe(3);
  });

  it('patches segment duration from override', () => {
    const data = makeCardData([{ duration: 7 }, { duration: 3 }]);
    const newDurationFrames = 10 * FPS; // 10s in frames
    const entry: EventOverride = {
      segments: { 0: { duration: newDurationFrames } },
    };

    const result = applyCardOverrides(data, entry);
    const segs = getSegments(result);

    expect(segs[0].properties.duration.value).toBeCloseTo(10, 6);
    // Unpatched segment unchanged
    expect(segs[1].properties.duration.value).toBe(3);
  });

  it('patches both duration and frame offset in same segment', () => {
    const data = makeCardData([{ duration: 7, frames: [{ offset: 5 }] }]);
    const entry: EventOverride = {
      segments: {
        0: {
          duration: 8 * FPS,
          frames: { 0: { offsetFrame: 6 * FPS } },
        },
      },
    };

    const result = applyCardOverrides(data, entry);
    const segs = getSegments(result);

    expect(segs[0].properties.duration.value).toBeCloseTo(8, 6);
    expect(segs[0].frames![0].properties.offset.value).toBeCloseTo(6, 6);
  });

  it('does not mutate original data', () => {
    const data = makeCardData([{ duration: 7, frames: [{ offset: 3 }] }]);
    const origSegs = getSegments(data);
    const origOffset = origSegs[0].frames![0].properties.offset.value;
    const origDuration = origSegs[0].properties.duration.value;

    const entry: EventOverride = {
      segments: {
        0: {
          duration: 10 * FPS,
          frames: { 0: { offsetFrame: 5 * FPS } },
        },
      },
    };

    applyCardOverrides(data, entry);

    // Original must be untouched
    expect(origSegs[0].frames![0].properties.offset.value).toBe(origOffset);
    expect(origSegs[0].properties.duration.value).toBe(origDuration);
  });

  it('skips override for segment index out of range', () => {
    const data = makeCardData([{ duration: 7 }]);
    const entry: EventOverride = {
      segments: { 5: { duration: 100 } },
    };

    const result = applyCardOverrides(data, entry);
    // No matching segment → returned unchanged
    expect(result).toBe(data);
  });

  it('skips frame override when frame has no offset property', () => {
    const data: Record<string, unknown> = {
      segments: [{
        properties: { duration: { value: 7, unit: 'SECOND' } },
        frames: [{ clause: [] }], // no properties.offset
      }],
    };
    const entry: EventOverride = {
      segments: { 0: { frames: { 0: { offsetFrame: 100 } } } },
    };

    const result = applyCardOverrides(data, entry);
    expect(result).toBe(data);
  });

  it('handles crit-only frame override (no offsetFrame)', () => {
    const data = makeCardData([{ duration: 7, frames: [{ offset: 3 }] }]);
    const entry: EventOverride = {
      segments: { 0: { frames: { 0: { isCritical: true } } } },
    };

    const result = applyCardOverrides(data, entry);
    // No offsetFrame override → no patching needed
    expect(result).toBe(data);
  });
});
