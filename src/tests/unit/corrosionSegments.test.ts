/**
 * Tests for corrosion segment building, resistance reduction ramping,
 * and corrosion merge semantics.
 *
 * Corrosion is an arts reaction (Nature element) that:
 *   - Has per-second segments, each with a resistance reduction effect
 *   - Ramps linearly from initial to maximum reduction over 10 seconds
 *   - Forced corrosion has no initial damage frame
 *   - Natural corrosion has an initial damage frame on the first segment
 *
 * Merge semantics:
 *   - Status 1 followed by Status 2: merges into Status 2 (higher wins)
 *   - Status 2 followed by Status 1: second is upgraded to Status 2
 */

import { attachReactionFrames } from '../../controller/timeline/processInfliction';
import { deriveReactions } from '../../controller/timeline/deriveReactions';
import { TimelineEvent } from '../../consts/viewTypes';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID, USER_ID } from '../../model/channels';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import { findStaggerInClauses } from '../../controller/timeline/clauseQueries';
import { StatusLevel } from '../../consts/types';
import { extendByTimeStops, TimeStopRegion } from '../../controller/timeline/processTimeStop';
import { DerivedEventController } from '../../controller/timeline/derivedEventController';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const FPS = 120;

/** Create a minimal infliction event on the enemy timeline. */
function infliction(
  uid: string,
  columnId: string,
  startFrame: number,
  durationSeconds = 10,
): TimelineEvent {
  return {
    uid,
    id: columnId,
    name: columnId,
    ownerId: ENEMY_OWNER_ID,
    columnId,
    startFrame,
    segments: [{ properties: { duration: Math.round(durationSeconds * FPS) } }],
    sourceOwnerId: 'slot-0',
  };
}

/** Create a corrosion reaction event directly (for unit testing attachReactionFrames). */
function corrosionEvent(
  uid: string,
  startFrame: number,
  durationFrames: number,
  opts?: Partial<TimelineEvent>,
): TimelineEvent {
  return {
    uid,
    id: REACTION_COLUMNS.CORROSION,
    name: REACTION_COLUMNS.CORROSION,
    ownerId: ENEMY_OWNER_ID,
    columnId: REACTION_COLUMNS.CORROSION,
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
    sourceOwnerId: 'slot-0',
    ...opts,
  };
}

describe('corrosion segments', () => {
  // ── Natural corrosion from infliction reactions ─────────────────────────

  it('natural corrosion from infliction reaction has 15s duration', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const reaction = result.find(ev => ev.uid.endsWith('-reaction'));

    expect(reaction).toBeDefined();
    expect(reaction!.columnId).toBe(REACTION_COLUMNS.CORROSION);
    // Corrosion duration from JSON config: 15s (1800 frames)
    expect(reaction!.segments[0].properties.duration).toBe(1800);
  });

  // ── Segment structure ──────────────────────────────────────────────────

  it('creates one segment per second of duration', () => {
    const ev = corrosionEvent('c1', 0, 15 * FPS); // 15 seconds
    const [result] = attachReactionFrames([ev]);

    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBe(15);
  });

  it('each segment is 1 second (120 frames)', () => {
    const ev = corrosionEvent('c1', 0, 10 * FPS);
    const [result] = attachReactionFrames([ev]);

    for (const seg of result.segments!) {
      expect(seg.properties.duration).toBe(FPS);
    }
  });

  it('first segment is named "Corrosion I", subsequent have no name', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    expect(segs[0].properties.name).toBe('Corrosion I');
    expect(segs[1].properties.name).toBeUndefined();
    expect(segs[2].properties.name).toBeUndefined();
    expect(segs[3].properties.name).toBeUndefined();
    expect(segs[4].properties.name).toBeUndefined();
  });

  it('first segment has visual label with roman numeral status level', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { stacks: 2 });
    const [result] = attachReactionFrames([ev]);

    expect(result.segments![0].properties.name).toBe('Corrosion II');
    // Other segments have no visual label
    expect(result.segments![1].properties.name).toBeUndefined();
    expect(result.segments![2].properties.name).toBeUndefined();
  });

  // ── Resistance reduction ramping ───────────────────────────────────────

  it('each segment carries statusLabel with resistance reduction', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS, { stacks: 1 });
    const [result] = attachReactionFrames([ev]);

    for (let i = 0; i < 5; i++) {
      const seg = result.segments![i];
      expect(seg.unknown?.statusLabel).toBeDefined();
      expect(seg.unknown?.statusLabel).toMatch(/^-[\d.]+ Res$/);
    }
  });

  it('reduction ramps from initial to maximum over 10 seconds (level 1)', () => {
    const ev = corrosionEvent('c1', 0, 15 * FPS, { stacks: 1 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    // Verify each segment matches the formula (level 1: initial 3.6, max 12, ramps over 10s)
    for (let i = 0; i < 15; i++) {
      const expected = getCorrosionBaseReduction(1 as StatusLevel, i + 1);
      expect(segs[i].unknown?.statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  it('reduction ramps correctly for level 2', () => {
    const ev = corrosionEvent('c1', 0, 12 * FPS, { stacks: 2 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    for (let i = 0; i < 12; i++) {
      const expected = getCorrosionBaseReduction(2 as StatusLevel, i + 1);
      expect(segs[i].unknown?.statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  it('reduction reaches maximum at 10 seconds and stays flat', () => {
    const ev = corrosionEvent('c1', 0, 15 * FPS, { stacks: 1 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    // At t=10, 11, 12... all should be max (12.0 for level 1)
    for (let i = 9; i < 15; i++) {
      expect(segs[i].unknown?.statusLabel).toBe('-12.0 Res');
    }
  });

  // ── Initial damage frame ─────────────────────────────────────────────

  it('natural corrosion has initial damage frame on first segment', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [result] = attachReactionFrames([ev]);

    expect(result.segments![0].frames).toBeDefined();
    expect(result.segments![0].frames!.length).toBe(1);
    expect(result.segments![0].frames![0].offsetFrame).toBe(0);
    expect(result.segments![0].frames![0].damageElement).toBeDefined();
  });

  it('natural corrosion has no frames on non-first segments', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [result] = attachReactionFrames([ev]);

    for (let i = 1; i < result.segments!.length; i++) {
      expect(result.segments![i].frames).toBeUndefined();
    }
  });

  // ── Forced corrosion ──────────────────────────────────────────────────

  it('forced corrosion has no frame markers (no initial damage)', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS, { isForced: true, forcedReaction: true });
    const [result] = attachReactionFrames([ev]);

    for (const seg of result.segments!) {
      expect(seg.frames).toBeUndefined();
    }
  });

  it('forced corrosion still has reduction segments', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS, { isForced: true, forcedReaction: true, stacks: 3 });
    const [result] = attachReactionFrames([ev]);

    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      const expected = getCorrosionBaseReduction(3 as StatusLevel, i + 1);
      expect(result.segments![i].unknown?.statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  // ── Status level capping ──────────────────────────────────────────────

  it('stacks > 4 caps status level at 4', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { stacks: 6 });
    const [result] = attachReactionFrames([ev]);

    // Should use level 4 values
    for (let i = 0; i < 3; i++) {
      const expected = getCorrosionBaseReduction(4 as StatusLevel, i + 1);
      expect(result.segments![i].unknown?.statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });
});


describe('corrosion arts intensity', () => {
  // ── Arts intensity scales reduction ───────────────────────────────────

  it('arts intensity increases both initial and maximum reduction', () => {
    const ai = 300; // multiplier = 1 + 2*300/(300+300) = 2.0
    const ev = corrosionEvent('c1', 0, 12 * FPS, { stacks: 1, artsIntensity: ai });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    const multiplier = getCorrosionReductionMultiplier(ai);
    expect(multiplier).toBe(2);

    // Level 1: base initial=3.6, max=12 → scaled: 7.2, 24
    // First segment (t=1): base = 3.6 + (12-3.6)*1/10 = 4.44 → scaled = 8.88
    const firstExpected = getCorrosionBaseReduction(1 as StatusLevel, 1) * multiplier;
    expect(segs[0].unknown?.statusLabel).toBe(`-${firstExpected.toFixed(1)} Res`);

    // At 10s+: base = 12.0 → scaled = 24.0
    const maxExpected = getCorrosionBaseReduction(1 as StatusLevel, 10) * multiplier;
    expect(segs[9].unknown?.statusLabel).toBe(`-${maxExpected.toFixed(1)} Res`);
    expect(segs[10].unknown?.statusLabel).toBe(`-${maxExpected.toFixed(1)} Res`);
    expect(segs[11].unknown?.statusLabel).toBe(`-${maxExpected.toFixed(1)} Res`);
  });

  it('zero arts intensity uses base reduction values', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { stacks: 1, artsIntensity: 0 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    // Multiplier at AI=0 is exactly 1.0
    for (let i = 0; i < 3; i++) {
      const expected = getCorrosionBaseReduction(1 as StatusLevel, i + 1);
      expect(segs[i].unknown?.statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  // ── Arts intensity does NOT affect initial damage ─────────────────────

  it('arts intensity does not affect the initial damage frame', () => {
    // Natural corrosion with high arts intensity
    const ev = corrosionEvent('c1', 0, 5 * FPS, { stacks: 1, artsIntensity: 600 });
    const [result] = attachReactionFrames([ev]);

    // First segment has an initial damage frame — it should be a plain
    // damage marker with no multiplier or scaling applied
    const frame = result.segments![0].frames![0];
    expect(frame.offsetFrame).toBe(0);
    expect(frame.damageElement).toBeDefined();
    // No multiplier, stagger, or other scaling on the frame itself
    expect(frame.statusLabel).toBeUndefined();
    expect(findStaggerInClauses(frame.clauses)).toBeUndefined();
  });

});

describe('corrosion time stop interaction', () => {
  /**
   * Helper to apply time-stop extension to a segmented event,
   * mirroring the pipeline's applyTimeStopExtension for enemy reactions.
   */
  function applyTimeStop(ev: TimelineEvent, stops: readonly TimeStopRegion[]): TimelineEvent {
    if (!ev.segments || ev.segments.length === 0 || stops.length === 0) return ev;

    let derivedOffset = 0;
    let changed = false;
    const newSegments = ev.segments.map((seg) => {
      const ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.properties.duration, stops);
      derivedOffset += ext;
      if (ext === seg.properties.duration) return seg;
      changed = true;
      return { ...seg, properties: { ...seg.properties, duration: ext } };
    });

    if (!changed) return ev;
    return { ...ev, segments: newSegments };
  }

  it('corrosion segments are extended by a time stop that overlaps them', () => {
    // 5s corrosion starting at 0, time stop at 2s lasting 1s (120 frames)
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 2 * FPS, durationFrames: FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // Total duration should be extended by 1s (the time stop)
    const totalDuration = result.segments!.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(totalDuration).toBe(6 * FPS);

    // The segment that overlaps the time stop should be extended
    // Segments: [0-120), [120-240), [240-360), [360-480), [480-600)
    // Time stop at 240-360 overlaps segment 2 (index 2, starting at 240)
    // Segment 2 starts at 240, base duration 120 → extended to 240 (paused during 240-360)
    expect(result.segments![0].properties.duration).toBe(FPS);      // 0-120, no overlap
    expect(result.segments![1].properties.duration).toBe(FPS);      // 120-240, no overlap
    expect(result.segments![2].properties.duration).toBe(2 * FPS);  // 240-480, extended by 120
    expect(result.segments![3].properties.duration).toBe(FPS);      // 480-600, no overlap
    expect(result.segments![4].properties.duration).toBe(FPS);      // 600-720, no overlap
  });

  it('reduction labels are preserved after time stop extension', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { stacks: 1 });
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: FPS, durationFrames: FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // statusLabel should be unchanged — reduction is game-time based, not real-time
    for (let i = 0; i < 3; i++) {
      const expected = getCorrosionBaseReduction(1 as StatusLevel, i + 1);
      expect(result.segments![i].unknown?.statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  it('segment count is preserved — time stop extends duration, does not add segments', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 0, durationFrames: 2 * FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    expect(result.segments!.length).toBe(5);
  });

  it('first segment is extended when time stop starts at the same frame', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    // Time stop of 1s starting at frame 0 — overlaps the entire first segment
    const stop: TimeStopRegion = { startFrame: 0, durationFrames: FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // First segment should be extended from 120 to 240 (paused for 120 frames)
    expect(result.segments![0].properties.duration).toBe(2 * FPS);
    expect(result.segments![1].properties.duration).toBe(FPS);
    expect(result.segments![2].properties.duration).toBe(FPS);
  });

  it('multiple time stops extend multiple segments', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [withSegs] = attachReactionFrames([ev]);

    // Two time stops: one at 1s, one at 3s (after first extension shifts things)
    const stops: TimeStopRegion[] = [
      { startFrame: FPS, durationFrames: FPS, eventUid: 'ult-1' },
      { startFrame: 4 * FPS, durationFrames: FPS, eventUid: 'combo-1' },
    ];
    const result = applyTimeStop(withSegs, stops);

    // Total should be extended by 2s (two 1s time stops)
    const totalDuration = result.segments!.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(totalDuration).toBe(7 * FPS);
  });

  it('time stop before corrosion start does not affect it', () => {
    // Corrosion starts at 5s, time stop is at 2s (before corrosion)
    const ev = corrosionEvent('c1', 5 * FPS, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 2 * FPS, durationFrames: FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // No segments should be extended
    for (const seg of result.segments!) {
      expect(seg.properties.duration).toBe(FPS);
    }
  });

  it('time stop after corrosion ends does not affect it', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 5 * FPS, durationFrames: FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    for (const seg of result.segments!) {
      expect(seg.properties.duration).toBe(FPS);
    }
  });

  it('initial damage frame on first segment is preserved after time stop', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 0, durationFrames: FPS, eventUid: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    expect(result.segments![0].frames).toBeDefined();
    expect(result.segments![0].frames!.length).toBe(1);
    expect(result.segments![0].frames![0].offsetFrame).toBe(0);
  });

  // ── Freeform corrosion (user-placed) ──────────────────────────────────

  it('freeform corrosion I gets segments with correct resistance shred via registerEvents', () => {
    const freeformCorrosion: TimelineEvent = {
      uid: 'freeform-corr-1',
      id: REACTION_COLUMNS.CORROSION,
      name: REACTION_COLUMNS.CORROSION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.CORROSION,
      startFrame: 0,
      segments: [{ properties: { duration: 5 * FPS } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      // No stacks — freeform events don't set this
    };

    const controller = new DerivedEventController();
    controller.createSkillEvent(freeformCorrosion, { checkCooldown: false });
    const registered = controller.getAllEvents();
    const result = registered.find(ev => ev.uid === 'freeform-corr-1')!;

    // Should have segments built
    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBe(5);

    // First segment should have resistance reduction for status level 1
    const seg0 = result.segments![0];
    const expectedReduction = getCorrosionBaseReduction(1 as StatusLevel, 1);
    expect(seg0.unknown?.statusLabel).toBe(`-${expectedReduction.toFixed(1)} Res`);

    // First segment should have the label "Corrosion I"
    expect(seg0.properties.name).toBe('Corrosion I');

    // First segment should have an initial damage frame
    expect(seg0.frames).toBeDefined();
    expect(seg0.frames!.length).toBe(1);
    expect(seg0.frames![0].offsetFrame).toBe(0);
  });
});
