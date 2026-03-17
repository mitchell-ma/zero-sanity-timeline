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

// Mock modules that use require.context (not available in Jest)
jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
}));
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { attachReactionFrames } from '../controller/timeline/processInfliction';
// eslint-disable-next-line import/first
import { deriveReactions } from '../controller/timeline/deriveReactions';
// eslint-disable-next-line import/first
import { mergeReactions } from '../controller/timeline/processInflictions';
// eslint-disable-next-line import/first
import { TimelineEvent } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import { EventStatusType } from '../consts/enums';
// eslint-disable-next-line import/first
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID } from '../model/channels';
// eslint-disable-next-line import/first
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../model/calculation/damageFormulas';
// eslint-disable-next-line import/first
import { StatusLevel } from '../consts/types';
// eslint-disable-next-line import/first
import { extendByTimeStops, TimeStopRegion } from '../controller/timeline/processInflictions';

const FPS = 120;

/** Create a minimal infliction event on the enemy timeline. */
function infliction(
  id: string,
  columnId: string,
  startFrame: number,
  durationSeconds = 10,
): TimelineEvent {
  return {
    id,
    name: columnId,
    ownerId: ENEMY_OWNER_ID,
    columnId,
    startFrame,
    activationDuration: Math.round(durationSeconds * FPS),
    activeDuration: 0,
    cooldownDuration: 0,
    sourceOwnerId: 'slot-0',
  };
}

/** Create a corrosion reaction event directly (for unit testing attachReactionFrames). */
function corrosionEvent(
  id: string,
  startFrame: number,
  durationFrames: number,
  opts?: Partial<TimelineEvent>,
): TimelineEvent {
  return {
    id,
    name: REACTION_COLUMNS.CORROSION,
    ownerId: ENEMY_OWNER_ID,
    columnId: REACTION_COLUMNS.CORROSION,
    startFrame,
    activationDuration: durationFrames,
    activeDuration: 0,
    cooldownDuration: 0,
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
    const reaction = result.find(ev => ev.id.endsWith('-reaction'));

    expect(reaction).toBeDefined();
    expect(reaction!.columnId).toBe(REACTION_COLUMNS.CORROSION);
    // Default reaction duration is 20s (2400 frames)
    expect(reaction!.activationDuration).toBe(2400);
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
      expect(seg.durationFrames).toBe(FPS);
    }
  });

  it('first segment is named "Corrosion 1", subsequent are "Tick N"', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    expect(segs[0].name).toBe('Corrosion 1');
    expect(segs[1].name).toBe('Tick 1');
    expect(segs[2].name).toBe('Tick 2');
    expect(segs[3].name).toBe('Tick 3');
    expect(segs[4].name).toBe('Tick 4');
  });

  it('first segment has visual label with roman numeral status level', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { inflictionStacks: 2 });
    const [result] = attachReactionFrames([ev]);

    expect(result.segments![0].label).toBe('Corrosion (II)');
    // Other segments have no visual label
    expect(result.segments![1].label).toBeUndefined();
    expect(result.segments![2].label).toBeUndefined();
  });

  // ── Resistance reduction ramping ───────────────────────────────────────

  it('each segment carries statusLabel with resistance reduction', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS, { inflictionStacks: 1 });
    const [result] = attachReactionFrames([ev]);

    for (let i = 0; i < 5; i++) {
      const seg = result.segments![i];
      expect(seg.statusLabel).toBeDefined();
      expect(seg.statusLabel).toMatch(/^-[\d.]+ Res$/);
    }
  });

  it('reduction ramps from initial to maximum over 10 seconds (level 1)', () => {
    const ev = corrosionEvent('c1', 0, 15 * FPS, { inflictionStacks: 1 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    // Verify each segment matches the formula (level 1: initial 3.6, max 12, ramps over 10s)
    for (let i = 0; i < 15; i++) {
      const expected = getCorrosionBaseReduction(1 as StatusLevel, i + 1);
      expect(segs[i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  it('reduction ramps correctly for level 2', () => {
    const ev = corrosionEvent('c1', 0, 12 * FPS, { inflictionStacks: 2 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    for (let i = 0; i < 12; i++) {
      const expected = getCorrosionBaseReduction(2 as StatusLevel, i + 1);
      expect(segs[i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  it('reduction reaches maximum at 10 seconds and stays flat', () => {
    const ev = corrosionEvent('c1', 0, 15 * FPS, { inflictionStacks: 1 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    // At t=10, 11, 12... all should be max (12.0 for level 1)
    for (let i = 9; i < 15; i++) {
      expect(segs[i].statusLabel).toBe('-12.0 Res');
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
    const ev = corrosionEvent('c1', 0, 5 * FPS, { isForced: true, forcedReaction: true, inflictionStacks: 3 });
    const [result] = attachReactionFrames([ev]);

    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      const expected = getCorrosionBaseReduction(3 as StatusLevel, i + 1);
      expect(result.segments![i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  // ── Status level capping ──────────────────────────────────────────────

  it('inflictionStacks > 4 caps status level at 4', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { inflictionStacks: 6 });
    const [result] = attachReactionFrames([ev]);

    // Should use level 4 values
    for (let i = 0; i < 3; i++) {
      const expected = getCorrosionBaseReduction(4 as StatusLevel, i + 1);
      expect(result.segments![i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });
});

describe('corrosion merge semantics', () => {
  // ── Status 1 → Status 2: result is Status 2 ──────────────────────────

  it('status 1 corrosion followed by status 2 merges into status 2', () => {
    const c1 = corrosionEvent('c1', 0, 20 * FPS, { statusLevel: 1, inflictionStacks: 1 });
    const c2 = corrosionEvent('c2', 5 * FPS, 20 * FPS, { statusLevel: 2, inflictionStacks: 2 });

    const result = mergeReactions([c1, c2]);
    const merged = result.find(ev => ev.id === 'c2')!;
    const clamped = result.find(ev => ev.id === 'c1')!;

    // c1 is clamped at the merge point (5s)
    expect(clamped.activationDuration).toBe(5 * FPS);
    expect(clamped.eventStatus).toBe(EventStatusType.REFRESHED);

    // c2 inherits max statusLevel = 2
    expect(merged.statusLevel).toBe(2);
  });

  // ── Status 2 → Status 1: second is upgraded to Status 2 ──────────────

  it('status 2 corrosion followed by status 1 upgrades second to status 2', () => {
    const c1 = corrosionEvent('c1', 0, 20 * FPS, { statusLevel: 2, inflictionStacks: 2 });
    const c2 = corrosionEvent('c2', 5 * FPS, 20 * FPS, { statusLevel: 1, inflictionStacks: 1 });

    const result = mergeReactions([c1, c2]);
    const merged = result.find(ev => ev.id === 'c2')!;
    const clamped = result.find(ev => ev.id === 'c1')!;

    // c1 is clamped at the merge point
    expect(clamped.activationDuration).toBe(5 * FPS);
    expect(clamped.eventStatus).toBe(EventStatusType.REFRESHED);

    // c2 is upgraded to status level 2 (max of both)
    expect(merged.statusLevel).toBe(2);
  });

  // ── Duration inheritance ──────────────────────────────────────────────

  it('short second corrosion inherits remaining duration from first', () => {
    // c1: 10s duration, c2 arrives at 5s with only 1s duration
    // c1 remaining = 10s - 5s = 5s > c2's 1s → c2 becomes 5s
    const c1 = corrosionEvent('c1', 0, 10 * FPS, { statusLevel: 1 });
    const c2 = corrosionEvent('c2', 5 * FPS, 1 * FPS, { statusLevel: 1 });

    const result = mergeReactions([c1, c2]);
    const merged = result.find(ev => ev.id === 'c2')!;
    const clamped = result.find(ev => ev.id === 'c1')!;

    // c1 clamped at merge point (5s)
    expect(clamped.activationDuration).toBe(5 * FPS);
    expect(clamped.eventStatus).toBe(EventStatusType.REFRESHED);

    // c2 inherits the remaining 5s duration
    expect(merged.activationDuration).toBe(5 * FPS);
  });

  it('newer corrosion keeps its own duration if longer than remaining old', () => {
    // c1: starts at 0, lasts 10s (ends at 1200)
    // c2: starts at 5s (600), lasts 20s (ends at 3000)
    // c1 remaining at merge = 1200 - 600 = 600 (5s) < c2's 2400 (20s)
    const c1 = corrosionEvent('c1', 0, 10 * FPS, { statusLevel: 1 });
    const c2 = corrosionEvent('c2', 5 * FPS, 20 * FPS, { statusLevel: 1 });

    const result = mergeReactions([c1, c2]);
    const merged = result.find(ev => ev.id === 'c2')!;

    // c2 keeps its own duration (20s = 2400 frames)
    expect(merged.activationDuration).toBe(20 * FPS);
  });

  // ── Segments reflect merged status level ──────────────────────────────

  it('merged corrosion segments use the upgraded status level with floor', () => {
    const c1 = corrosionEvent('c1', 0, 20 * FPS, { statusLevel: 1, inflictionStacks: 1 });
    const c2 = corrosionEvent('c2', 5 * FPS, 20 * FPS, { statusLevel: 2, inflictionStacks: 2 });

    const merged = mergeReactions([c1, c2]);
    const withSegments = attachReactionFrames(merged);
    const c2Result = withSegments.find(ev => ev.id === 'c2')!;

    // c1's reduction at 5s becomes the floor for c2
    const floor = getCorrosionBaseReduction(1 as StatusLevel, 5);
    expect(c2Result.segments).toBeDefined();
    for (let i = 0; i < c2Result.segments!.length; i++) {
      const base = getCorrosionBaseReduction(2 as StatusLevel, i + 1);
      const expected = Math.max(floor, base);
      expect(c2Result.segments![i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  // ── Level 4 → Level 1: upgraded level 1 takes on level 4 stats ─────

  it('level 4 corrosion merged by level 1 gives level 1 the level 4 stats', () => {
    // c1: level 4, 15s duration starting at 0
    // c2: level 1, 1s duration arriving at 5s
    // c2 should be upgraded to level 4 and inherit remaining 10s duration
    const c1 = corrosionEvent('c1', 0, 15 * FPS, { statusLevel: 4, inflictionStacks: 4 });
    const c2 = corrosionEvent('c2', 5 * FPS, 1 * FPS, { statusLevel: 1, inflictionStacks: 1 });

    const result = mergeReactions([c1, c2]);
    const merged = result.find(ev => ev.id === 'c2')!;
    const clamped = result.find(ev => ev.id === 'c1')!;

    // c1 clamped at 5s
    expect(clamped.activationDuration).toBe(5 * FPS);
    expect(clamped.eventStatus).toBe(EventStatusType.REFRESHED);

    // c2 takes on level 4 stats
    expect(merged.statusLevel).toBe(4);
    expect(merged.inflictionStacks).toBe(4);
    // c2 inherits remaining 10s (longer than its own 1s)
    expect(merged.activationDuration).toBe(10 * FPS);

    // Segments should use level 4 reduction values floored by c1's value at 5s
    const floor = getCorrosionBaseReduction(4 as StatusLevel, 5);
    const withSegments = attachReactionFrames([merged]);
    const segs = withSegments[0].segments!;
    expect(segs.length).toBe(10);
    for (let i = 0; i < segs.length; i++) {
      const base = getCorrosionBaseReduction(4 as StatusLevel, i + 1);
      const expected = Math.max(floor, base);
      expect(segs[i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  // ── Initial damage frame preserved through merge ────────────────────

  it('natural corrosion merged into first still has initial damage frame', () => {
    const c1 = corrosionEvent('c1', 0, 10 * FPS, { statusLevel: 1 });
    const c2 = corrosionEvent('c2', 5 * FPS, 10 * FPS, { statusLevel: 2 });

    const merged = mergeReactions([c1, c2]);
    const withSegments = attachReactionFrames(merged);
    const c2Result = withSegments.find(ev => ev.id === 'c2')!;

    // c2 is a natural corrosion — first segment should have initial damage frame
    expect(c2Result.segments![0].frames).toBeDefined();
    expect(c2Result.segments![0].frames!.length).toBe(1);
    expect(c2Result.segments![0].frames![0].offsetFrame).toBe(0);
    expect(c2Result.segments![0].frames![0].damageElement).toBeDefined();

    // Non-first segments have no frames
    for (let i = 1; i < c2Result.segments!.length; i++) {
      expect(c2Result.segments![i].frames).toBeUndefined();
    }
  });

  it('forced corrosion merged into first has no initial damage frame', () => {
    const c1 = corrosionEvent('c1', 0, 10 * FPS, { statusLevel: 1 });
    const c2 = corrosionEvent('c2', 5 * FPS, 10 * FPS, {
      statusLevel: 2,
      isForced: true,
      forcedReaction: true,
    });

    const merged = mergeReactions([c1, c2]);
    const withSegments = attachReactionFrames(merged);
    const c2Result = withSegments.find(ev => ev.id === 'c2')!;

    // c2 is forced — no segments should have frames
    for (const seg of c2Result.segments!) {
      expect(seg.frames).toBeUndefined();
    }
  });

  // ── Reduction floor inheritance ─────────────────────────────────────

  it('fully ramped level 1 merged by level 4 starts at 12 and ramps to 24', () => {
    // Level 1 corrosion: initial 3.6, max 12.0, fully ramped at 10s+
    // Level 4 corrosion arrives at 12s (level 1 is fully ramped to 12.0)
    // Level 4: initial 7.2, max 24.0
    // The merged level 4 should start at 12.0 (inherited floor) not 7.2
    const c1 = corrosionEvent('c1', 0, 20 * FPS, { statusLevel: 1, inflictionStacks: 1 });
    const c2 = corrosionEvent('c2', 12 * FPS, 15 * FPS, { statusLevel: 4, inflictionStacks: 4 });

    const merged = mergeReactions([c1, c2]);
    const c2Merged = merged.find(ev => ev.id === 'c2')!;

    // Verify the reduction floor was set
    expect(c2Merged.reductionFloor).toBe(12);

    // Build segments and verify the reduction values
    const withSegments = attachReactionFrames([c2Merged]);
    const segs = withSegments[0].segments!;

    // Level 4 ramp: initial=7.2, max=24, over 10s
    // With floor=12, early segments are floored at 12.0
    // At second 1: base = 7.2 + (24-7.2)*1/10 = 8.88 → max(12, 8.88) = 12.0
    // At second 3: base = 7.2 + (24-7.2)*3/10 = 12.24 → max(12, 12.24) = 12.24
    // At second 10+: base = 24.0 → max(12, 24) = 24.0
    expect(segs[0].statusLabel).toBe('-12.0 Res');  // floored
    expect(segs[1].statusLabel).toBe('-12.0 Res');  // floored

    // Eventually catches up and surpasses the floor
    const lastSeg = segs[segs.length - 1];
    expect(lastSeg.statusLabel).toBe('-24.0 Res');  // at max

    // All segments should be monotonically non-decreasing
    for (let i = 1; i < segs.length; i++) {
      const prev = parseFloat(segs[i - 1].statusLabel!.replace(/[^\d.]/g, ''));
      const curr = parseFloat(segs[i].statusLabel!.replace(/[^\d.]/g, ''));
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  // ── Non-overlapping corrosions don't merge ────────────────────────────

  it('non-overlapping corrosions remain independent', () => {
    const c1 = corrosionEvent('c1', 0, 5 * FPS, { statusLevel: 1 });
    const c2 = corrosionEvent('c2', 10 * FPS, 5 * FPS, { statusLevel: 2 });

    const result = mergeReactions([c1, c2]);

    // Both should be unchanged
    const r1 = result.find(ev => ev.id === 'c1')!;
    const r2 = result.find(ev => ev.id === 'c2')!;
    expect(r1.activationDuration).toBe(5 * FPS);
    expect(r1.statusLevel).toBe(1);
    expect(r2.activationDuration).toBe(5 * FPS);
    expect(r2.statusLevel).toBe(2);
    expect(r1.eventStatus).toBeUndefined();
    expect(r2.eventStatus).toBeUndefined();
  });
});

describe('corrosion arts intensity', () => {
  // ── Arts intensity scales reduction ───────────────────────────────────

  it('arts intensity increases both initial and maximum reduction', () => {
    const ai = 300; // multiplier = 1 + 2*300/(300+300) = 2.0
    const ev = corrosionEvent('c1', 0, 12 * FPS, { inflictionStacks: 1, artsIntensity: ai });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    const multiplier = getCorrosionReductionMultiplier(ai);
    expect(multiplier).toBe(2);

    // Level 1: base initial=3.6, max=12 → scaled: 7.2, 24
    // First segment (t=1): base = 3.6 + (12-3.6)*1/10 = 4.44 → scaled = 8.88
    const firstExpected = getCorrosionBaseReduction(1 as StatusLevel, 1) * multiplier;
    expect(segs[0].statusLabel).toBe(`-${firstExpected.toFixed(1)} Res`);

    // At 10s+: base = 12.0 → scaled = 24.0
    const maxExpected = getCorrosionBaseReduction(1 as StatusLevel, 10) * multiplier;
    expect(segs[9].statusLabel).toBe(`-${maxExpected.toFixed(1)} Res`);
    expect(segs[10].statusLabel).toBe(`-${maxExpected.toFixed(1)} Res`);
    expect(segs[11].statusLabel).toBe(`-${maxExpected.toFixed(1)} Res`);
  });

  it('zero arts intensity uses base reduction values', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { inflictionStacks: 1, artsIntensity: 0 });
    const [result] = attachReactionFrames([ev]);
    const segs = result.segments!;

    // Multiplier at AI=0 is exactly 1.0
    for (let i = 0; i < 3; i++) {
      const expected = getCorrosionBaseReduction(1 as StatusLevel, i + 1);
      expect(segs[i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  // ── Arts intensity does NOT affect initial damage ─────────────────────

  it('arts intensity does not affect the initial damage frame', () => {
    // Natural corrosion with high arts intensity
    const ev = corrosionEvent('c1', 0, 5 * FPS, { inflictionStacks: 1, artsIntensity: 600 });
    const [result] = attachReactionFrames([ev]);

    // First segment has an initial damage frame — it should be a plain
    // damage marker with no multiplier or scaling applied
    const frame = result.segments![0].frames![0];
    expect(frame.offsetFrame).toBe(0);
    expect(frame.damageElement).toBeDefined();
    // No multiplier, stagger, or other scaling on the frame itself
    expect(frame.statusLabel).toBeUndefined();
    expect(frame.stagger).toBeUndefined();
  });

  // ── Merging corrosions with different arts intensities ────────────────

  it('merge inherits higher scaled reduction as floor', () => {
    // c1: level 1, arts intensity 300 (multiplier=2), fully ramped
    // Base max at level 1 = 12.0, scaled = 24.0
    // c2: level 1, arts intensity 0 (multiplier=1), arrives at 12s
    // c2's own max at level 1 = 12.0 (unscaled)
    // Floor from c1 = 24.0, so c2 should be floored at 24.0
    const c1 = corrosionEvent('c1', 0, 20 * FPS, {
      statusLevel: 1, inflictionStacks: 1, artsIntensity: 300,
    });
    const c2 = corrosionEvent('c2', 12 * FPS, 15 * FPS, {
      statusLevel: 1, inflictionStacks: 1, artsIntensity: 0,
    });

    const merged = mergeReactions([c1, c2]);
    const c2Merged = merged.find(ev => ev.id === 'c2')!;

    // Floor should be c1's scaled max: 12 * 2 = 24
    expect(c2Merged.reductionFloor).toBe(24);

    const withSegments = attachReactionFrames([c2Merged]);
    const segs = withSegments[0].segments!;

    // c2 has AI=0, so its own max is 12. But floor is 24 → all segments at 24.0
    for (const seg of segs) {
      expect(seg.statusLabel).toBe('-24.0 Res');
    }
  });

  it('merge from low-AI into high-AI uses the higher scaled value', () => {
    // c1: level 1, arts intensity 0 (multiplier=1), fully ramped → max=12
    // c2: level 1, arts intensity 300 (multiplier=2), arrives at 12s
    // c2's own scaled max = 12 * 2 = 24
    // Floor from c1 = 12.0
    // c2's scaled ramp starts above the floor, so floor has no effect on max
    const c1 = corrosionEvent('c1', 0, 20 * FPS, {
      statusLevel: 1, inflictionStacks: 1, artsIntensity: 0,
    });
    const c2 = corrosionEvent('c2', 12 * FPS, 15 * FPS, {
      statusLevel: 1, inflictionStacks: 1, artsIntensity: 300,
    });

    const merged = mergeReactions([c1, c2]);
    const c2Merged = merged.find(ev => ev.id === 'c2')!;

    // Floor from c1 = 12 (AI=0, fully ramped level 1)
    expect(c2Merged.reductionFloor).toBe(12);

    const withSegments = attachReactionFrames([c2Merged]);
    const segs = withSegments[0].segments!;

    // c2 has AI=300 (multiplier=2), level 1
    // At t=1: base=4.44, scaled=8.88 → max(12, 8.88) = 12.0 (floored)
    expect(segs[0].statusLabel).toBe('-12.0 Res');

    // At t=10+: base=12, scaled=24 → max(12, 24) = 24.0
    const lastSeg = segs[segs.length - 1];
    expect(lastSeg.statusLabel).toBe('-24.0 Res');
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
      const ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.durationFrames, stops);
      derivedOffset += ext;
      if (ext === seg.durationFrames) return seg;
      changed = true;
      return { ...seg, durationFrames: ext };
    });

    if (!changed) return ev;
    const totalDuration = newSegments.reduce((sum, s) => sum + s.durationFrames, 0);
    return { ...ev, activationDuration: totalDuration, segments: newSegments };
  }

  it('corrosion segments are extended by a time stop that overlaps them', () => {
    // 5s corrosion starting at 0, time stop at 2s lasting 1s (120 frames)
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 2 * FPS, durationFrames: FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // Total duration should be extended by 1s (the time stop)
    const totalDuration = result.segments!.reduce((sum, s) => sum + s.durationFrames, 0);
    expect(totalDuration).toBe(6 * FPS);

    // The segment that overlaps the time stop should be extended
    // Segments: [0-120), [120-240), [240-360), [360-480), [480-600)
    // Time stop at 240-360 overlaps segment 2 (index 2, starting at 240)
    // Segment 2 starts at 240, base duration 120 → extended to 240 (paused during 240-360)
    expect(result.segments![0].durationFrames).toBe(FPS);      // 0-120, no overlap
    expect(result.segments![1].durationFrames).toBe(FPS);      // 120-240, no overlap
    expect(result.segments![2].durationFrames).toBe(2 * FPS);  // 240-480, extended by 120
    expect(result.segments![3].durationFrames).toBe(FPS);      // 480-600, no overlap
    expect(result.segments![4].durationFrames).toBe(FPS);      // 600-720, no overlap
  });

  it('reduction labels are preserved after time stop extension', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS, { inflictionStacks: 1 });
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: FPS, durationFrames: FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // statusLabel should be unchanged — reduction is game-time based, not real-time
    for (let i = 0; i < 3; i++) {
      const expected = getCorrosionBaseReduction(1 as StatusLevel, i + 1);
      expect(result.segments![i].statusLabel).toBe(`-${expected.toFixed(1)} Res`);
    }
  });

  it('segment count is preserved — time stop extends duration, does not add segments', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 0, durationFrames: 2 * FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    expect(result.segments!.length).toBe(5);
  });

  it('first segment is extended when time stop starts at the same frame', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    // Time stop of 1s starting at frame 0 — overlaps the entire first segment
    const stop: TimeStopRegion = { startFrame: 0, durationFrames: FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // First segment should be extended from 120 to 240 (paused for 120 frames)
    expect(result.segments![0].durationFrames).toBe(2 * FPS);
    expect(result.segments![1].durationFrames).toBe(FPS);
    expect(result.segments![2].durationFrames).toBe(FPS);
  });

  it('multiple time stops extend multiple segments', () => {
    const ev = corrosionEvent('c1', 0, 5 * FPS);
    const [withSegs] = attachReactionFrames([ev]);

    // Two time stops: one at 1s, one at 3s (after first extension shifts things)
    const stops: TimeStopRegion[] = [
      { startFrame: FPS, durationFrames: FPS, eventId: 'ult-1' },
      { startFrame: 4 * FPS, durationFrames: FPS, eventId: 'combo-1' },
    ];
    const result = applyTimeStop(withSegs, stops);

    // Total should be extended by 2s (two 1s time stops)
    const totalDuration = result.segments!.reduce((sum, s) => sum + s.durationFrames, 0);
    expect(totalDuration).toBe(7 * FPS);
  });

  it('time stop before corrosion start does not affect it', () => {
    // Corrosion starts at 5s, time stop is at 2s (before corrosion)
    const ev = corrosionEvent('c1', 5 * FPS, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 2 * FPS, durationFrames: FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    // No segments should be extended
    for (const seg of result.segments!) {
      expect(seg.durationFrames).toBe(FPS);
    }
  });

  it('time stop after corrosion ends does not affect it', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 5 * FPS, durationFrames: FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    for (const seg of result.segments!) {
      expect(seg.durationFrames).toBe(FPS);
    }
  });

  it('initial damage frame on first segment is preserved after time stop', () => {
    const ev = corrosionEvent('c1', 0, 3 * FPS);
    const [withSegs] = attachReactionFrames([ev]);
    const stop: TimeStopRegion = { startFrame: 0, durationFrames: FPS, eventId: 'ult-1' };
    const result = applyTimeStop(withSegs, [stop]);

    expect(result.segments![0].frames).toBeDefined();
    expect(result.segments![0].frames!.length).toBe(1);
    expect(result.segments![0].frames![0].offsetFrame).toBe(0);
  });
});
