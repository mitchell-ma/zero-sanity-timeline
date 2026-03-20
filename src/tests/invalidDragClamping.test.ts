/**
 * Invalid-state drag clamping tests
 *
 * Validates that events which become invalid (e.g. landed in a resource
 * insufficiency zone or outside a combo window due to other events being
 * added/moved) can be dragged freely until they reach a valid position,
 * at which point clamping re-engages and prevents re-entering invalid zones.
 */

jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => null,
  getSkillIds: () => new Set(),
  getAllOperatorIds: () => [],
  getSkillTypeMap: () => ({}),
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
}));
jest.mock('../model/game-data/weaponGearEffectLoader', () => ({
  getWeaponEffectDefs: () => [],
  getGearEffectDefs: () => [],
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
import { TimelineEvent } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import { clampDeltaByResourceZones, clampDeltaByComboWindow } from '../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { clampDeltaByOverlap } from '../controller/timeline/inputEventController';
// eslint-disable-next-line import/first
import type { ResourceZone } from '../controller/timeline/skillPointTimeline';
// eslint-disable-next-line import/first
import { SKILL_COLUMNS } from '../model/channels';
// eslint-disable-next-line import/first
import { COMBO_WINDOW_COLUMN_ID } from '../controller/timeline/processComboSkill';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
  return {
    name: 'TEST',
    ownerId: 'op-1',
    segments: [{ properties: { duration: 60 } }],
    ...overrides,
  };
}

function makeZones(...ranges: [number, number][]): Map<string, ResourceZone[]> {
  const zones = ranges.map(([start, end]) => ({ start, end }));
  return new Map([['op-1:battle', zones]]);
}

// ── Resource zone: normal behaviour (no invalid set) ─────────────────────

describe('clampDeltaByResourceZones — normal clamping', () => {
  const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50 })];
  // Zone at [100, 200)
  const zones = makeZones([100, 200]);

  test('blocks dragging down into a zone', () => {
    // startFrame=50, delta=120 → target=170 (inside zone) → clamp to 99
    const result = clampDeltaByResourceZones(120, 'e1', events, 50, zones);
    expect(50 + result).toBe(99);
  });

  test('blocks dragging up into a zone', () => {
    // startFrame=250, delta=-80 → target=170 (inside zone) → clamp to 200
    const ev = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 250 })];
    const result = clampDeltaByResourceZones(-80, 'e1', ev, 250, zones);
    expect(250 + result).toBe(200);
  });

  test('skips self-caused zone (startFrame inside zone)', () => {
    // startFrame=150 is inside [100,200), so the zone is skipped
    const result = clampDeltaByResourceZones(10, 'e1', events, 150, zones);
    expect(result).toBe(10);
  });
});

// ── Resource zone: invalid at drag start ─────────────────────────────────

describe('clampDeltaByResourceZones — invalid at drag start', () => {
  // Event starts at frame 150 inside zone [100, 200)
  const startFrame = 150;
  const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame })];
  const zones = makeZones([100, 200]);

  test('allows free movement while target stays in a zone', () => {
    const invalidSet = new Set(['e1']);
    const revalidated = new Set<string>();

    // target=120, still inside zone → free movement
    const result = clampDeltaByResourceZones(-30, 'e1', events, startFrame, zones, invalidSet, revalidated);
    expect(result).toBe(-30);
    expect(invalidSet.has('e1')).toBe(true);
    expect(revalidated.has('e1')).toBe(false);
  });

  test('transitions to revalidated when target exits zone (downward)', () => {
    const invalidSet = new Set(['e1']);
    const revalidated = new Set<string>();

    // target=210, outside zone → transition
    const result = clampDeltaByResourceZones(60, 'e1', events, startFrame, zones, invalidSet, revalidated);
    expect(result).toBe(60);
    expect(invalidSet.has('e1')).toBe(false);
    expect(revalidated.has('e1')).toBe(true);
  });

  test('transitions to revalidated when target exits zone (upward)', () => {
    const invalidSet = new Set(['e1']);
    const revalidated = new Set<string>();

    // target=80, outside zone → transition
    const result = clampDeltaByResourceZones(-70, 'e1', events, startFrame, zones, invalidSet, revalidated);
    expect(result).toBe(-70);
    expect(invalidSet.has('e1')).toBe(false);
    expect(revalidated.has('e1')).toBe(true);
  });

  test('allows free movement through multiple zones', () => {
    const multiZones = makeZones([100, 200], [300, 400]);
    const invalidSet = new Set(['e1']);
    const revalidated = new Set<string>();

    // target=350, inside second zone → still free
    const result = clampDeltaByResourceZones(200, 'e1', events, startFrame, multiZones, invalidSet, revalidated);
    expect(result).toBe(200);
    expect(invalidSet.has('e1')).toBe(true);
  });
});

// ── Resource zone: revalidated (post-transition) ─────────────────────────

describe('clampDeltaByResourceZones — revalidated prevents re-entry', () => {
  // Event originally at frame 150 (inside zone [100, 200)).
  // It has been dragged to a valid position and revalidated.
  const startFrame = 150;
  const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame })];
  const zones = makeZones([100, 200]);

  test('blocks re-entry from below (dragging up into zone)', () => {
    const revalidated = new Set(['e1']);

    // Event was moved down past zone end. Now dragging back up.
    // startFrame=150, delta=45 → target=195 (inside zone)
    // Nearest boundary: zone.end=200 (dist=5) vs zone.start-1=99 (dist=96)
    // → clamp to zone.end=200
    const result = clampDeltaByResourceZones(45, 'e1', events, startFrame, zones, undefined, revalidated);
    expect(startFrame + result).toBe(200);
  });

  test('blocks re-entry from above (dragging down into zone)', () => {
    const revalidated = new Set(['e1']);

    // Event was moved up past zone start. Now dragging back down.
    // startFrame=150, delta=-45 → target=105 (inside zone)
    // Nearest boundary: zone.start-1=99 (dist=6) vs zone.end=200 (dist=95)
    // → clamp to zone.start-1=99
    const result = clampDeltaByResourceZones(-45, 'e1', events, startFrame, zones, undefined, revalidated);
    expect(startFrame + result).toBe(99);
  });

  test('does not skip the self-caused zone', () => {
    const revalidated = new Set(['e1']);

    // Without revalidated, startFrame=150 inside [100,200) would be skipped.
    // With revalidated, it must block. delta=0 → target=150 inside zone.
    const result = clampDeltaByResourceZones(0, 'e1', events, startFrame, zones, undefined, revalidated);
    // Should clamp to nearest boundary (zone.end=200 or zone.start-1=99)
    const finalFrame = startFrame + result;
    expect(finalFrame < 100 || finalFrame >= 200).toBe(true);
  });

  test('allows movement in valid territory', () => {
    const revalidated = new Set(['e1']);

    // target=250, outside all zones → no clamping
    const result = clampDeltaByResourceZones(100, 'e1', events, startFrame, zones, undefined, revalidated);
    expect(result).toBe(100);
  });
});

// ── Full drag lifecycle: invalid → free → revalidated → clamped ──────────

describe('clampDeltaByResourceZones — full drag lifecycle', () => {
  const startFrame = 150;
  const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame })];
  const zones = makeZones([100, 200]);
  const invalidSet = new Set(['e1']);
  const revalidated = new Set<string>();

  test('step 1: free movement while in zone', () => {
    const result = clampDeltaByResourceZones(-20, 'e1', events, startFrame, zones, invalidSet, revalidated);
    expect(result).toBe(-20); // target=130, still in zone
    expect(invalidSet.has('e1')).toBe(true);
  });

  test('step 2: transition when exiting zone', () => {
    const result = clampDeltaByResourceZones(60, 'e1', events, startFrame, zones, invalidSet, revalidated);
    expect(result).toBe(60); // target=210, outside zone
    expect(invalidSet.has('e1')).toBe(false);
    expect(revalidated.has('e1')).toBe(true);
  });

  test('step 3: blocked from re-entering zone', () => {
    const result = clampDeltaByResourceZones(45, 'e1', events, startFrame, zones, invalidSet, revalidated);
    const finalFrame = startFrame + result;
    // Must not land inside [100, 200)
    expect(finalFrame < 100 || finalFrame >= 200).toBe(true);
  });

  test('step 4: free in valid territory', () => {
    const result = clampDeltaByResourceZones(80, 'e1', events, startFrame, zones, invalidSet, revalidated);
    expect(result).toBe(80); // target=230, valid
  });
});

// ── Combo window: invalid at drag start ──────────────────────────────────

describe('clampDeltaByComboWindow — invalid at drag start', () => {
  // Combo event at frame 50, outside all windows.
  // Window at [100, 200).
  const startFrame = 50;
  const comboEvent = makeEvent({ id: 'c1', columnId: SKILL_COLUMNS.COMBO, startFrame });
  const events = [comboEvent];
  const windowEvent = makeEvent({
    id: 'w1',
    columnId: COMBO_WINDOW_COLUMN_ID,
    startFrame: 100,
    ownerId: 'op-1',
    segments: [{ properties: { duration: 100 } }],
  });
  const processedEvents = [comboEvent, windowEvent];

  test('allows free movement while outside all windows', () => {
    const invalidSet = new Set(['c1']);

    // target=80, still outside window → free
    const result = clampDeltaByComboWindow(30, 'c1', events, startFrame, processedEvents, invalidSet);
    expect(result).toBe(30);
    expect(invalidSet.has('c1')).toBe(true);
  });

  test('transitions when entering a window', () => {
    const invalidSet = new Set(['c1']);

    // target=120, inside window [100, 200) → transition
    const result = clampDeltaByComboWindow(70, 'c1', events, startFrame, processedEvents, invalidSet);
    expect(result).toBe(70);
    expect(invalidSet.has('c1')).toBe(false);
  });

  test('clamps within window after transition (target-based fallback)', () => {
    // After transition, invalidSet no longer has c1.
    // startFrame=50 is outside all windows, so origWindow lookup fails.
    // Fallback checks target position — if target is in window, clamp within it.
    const invalidSet = new Set<string>();

    // target=210, outside window → target-based fallback finds no window
    const result1 = clampDeltaByComboWindow(160, 'c1', events, startFrame, processedEvents, invalidSet);
    // Should clamp to window end - 1 = 199
    expect(startFrame + result1).toBe(199);

    // target=120, inside window → target-based fallback finds window, allows
    const result2 = clampDeltaByComboWindow(70, 'c1', events, startFrame, processedEvents, invalidSet);
    expect(result2).toBe(70);
  });
});

// ── Combo window: normal clamping ────────────────────────────────────────

describe('clampDeltaByComboWindow — normal clamping', () => {
  const startFrame = 150;
  const comboEvent = makeEvent({ id: 'c1', columnId: SKILL_COLUMNS.COMBO, startFrame });
  const events = [comboEvent];
  const windowEvent = makeEvent({
    id: 'w1',
    columnId: COMBO_WINDOW_COLUMN_ID,
    startFrame: 100,
    ownerId: 'op-1',
    segments: [{ properties: { duration: 100 } }],
  });
  const processedEvents = [comboEvent, windowEvent];

  test('clamps at window start', () => {
    // target=80, below window → clamp to 100
    const result = clampDeltaByComboWindow(-70, 'c1', events, startFrame, processedEvents);
    expect(startFrame + result).toBe(100);
  });

  test('clamps at window end', () => {
    // target=210, above window → clamp to 199
    const result = clampDeltaByComboWindow(60, 'c1', events, startFrame, processedEvents);
    expect(startFrame + result).toBe(199);
  });

  test('allows movement within window', () => {
    const result = clampDeltaByComboWindow(-20, 'c1', events, startFrame, processedEvents);
    expect(result).toBe(-20);
  });

  test('non-combo events pass through', () => {
    const battleEvent = makeEvent({ id: 'b1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 150 });
    const result = clampDeltaByComboWindow(200, 'b1', [battleEvent], 150, processedEvents);
    expect(result).toBe(200);
  });
});

// ── Overlap: normal clamping ─────────────────────────────────────────────

describe('clampDeltaByOverlap — normal clamping', () => {
  // Event e1 at frame 50 (range 60), sibling e2 at frame 200 (range 60)
  const events = [
    makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 200, nonOverlappableRange: 60 }),
  ];
  const dragSet = new Set(['e1']);

  test('blocks dragging forward into sibling', () => {
    // e1 at 50 with range 60, dragging delta=160 → target=210, would overlap e2 [200,260)
    // Should clamp to 200-60=140
    const result = clampDeltaByOverlap(160, 'e1', events, 50, dragSet);
    expect(50 + result).toBe(140);
  });

  test('blocks dragging backward into sibling', () => {
    // e2 at 200, dragging delta=-160 → target=40, would overlap e1 [50,110)
    // Should clamp to 110
    const result = clampDeltaByOverlap(-160, 'e2', events, 200, new Set(['e2']));
    expect(200 + result).toBe(110);
  });

  test('allows movement that does not overlap', () => {
    const result = clampDeltaByOverlap(30, 'e1', events, 50, dragSet);
    expect(result).toBe(30);
  });

  test('events in different columns are not blocked', () => {
    const mixedEvents = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
      makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 60, nonOverlappableRange: 60 }),
    ];
    const result = clampDeltaByOverlap(20, 'e1', mixedEvents, 50, new Set(['e1']));
    expect(result).toBe(20);
  });
});

// ── Overlap: invalid at drag start ───────────────────────────────────────

describe('clampDeltaByOverlap — invalid at drag start', () => {
  // e1 at frame 100 overlaps e2 at frame 120 (both range 60)
  const events = [
    makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 100, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 120, nonOverlappableRange: 60 }),
  ];
  const dragSet = new Set(['e1']);

  test('allows free movement while still overlapping', () => {
    const overlapInvalid = new Set(['e1']);
    const overlapReval = new Set<string>();
    // target=130, still overlaps e2 [120,180) → free movement
    const result = clampDeltaByOverlap(30, 'e1', events, 100, dragSet, undefined, overlapInvalid, overlapReval);
    expect(result).toBe(30);
    expect(overlapInvalid.has('e1')).toBe(true);
  });

  test('transitions to revalidated when reaching non-overlapping position', () => {
    const overlapInvalid = new Set(['e1']);
    const overlapReval = new Set<string>();
    // target=50, does NOT overlap e2 [120,180) → transition
    const result = clampDeltaByOverlap(-50, 'e1', events, 100, dragSet, undefined, overlapInvalid, overlapReval);
    expect(result).toBe(-50);
    expect(overlapInvalid.has('e1')).toBe(false);
    expect(overlapReval.has('e1')).toBe(true);
  });

  test('after revalidation, blocks dragging back into overlap', () => {
    const overlapInvalid = new Set<string>();
    const overlapReval = new Set(['e1']);
    // e1 now at frame 50 (after previous move), try to drag forward delta=80 → target=130
    // That overlaps e2 [120,180) → should clamp to 120-60=60
    const result = clampDeltaByOverlap(80, 'e1', events, 50, dragSet, undefined, overlapInvalid, overlapReval);
    expect(50 + result).toBe(60);
  });
});

// ── Overlap: full lifecycle ──────────────────────────────────────────────

describe('clampDeltaByOverlap — full lifecycle', () => {
  // e1 at frame 150 overlaps e2 at frame 140 (both range 60)
  const events = [
    makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 150, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 140, nonOverlappableRange: 60 }),
  ];
  const dragSet = new Set(['e1']);
  const overlapInvalid = new Set(['e1']);
  const overlapReval = new Set<string>();

  test('step 1: free movement while overlapping', () => {
    // Move e1 to 160 (still overlaps e2)
    const result = clampDeltaByOverlap(10, 'e1', events, 150, dragSet, undefined, overlapInvalid, overlapReval);
    expect(result).toBe(10);
    expect(overlapInvalid.has('e1')).toBe(true);
  });

  test('step 2: transition when reaching valid position', () => {
    // Move e1 to 210 (past e2's range [140,200))
    const result = clampDeltaByOverlap(60, 'e1', events, 150, dragSet, undefined, overlapInvalid, overlapReval);
    expect(result).toBe(60);
    expect(overlapInvalid.has('e1')).toBe(false);
    expect(overlapReval.has('e1')).toBe(true);
  });

  test('step 3: clamped after revalidation', () => {
    // From 210 (after step 2), try to move back to 160 → overlaps e2 [140,200)
    // Should clamp: moving backward, nearest edge after e2 is 200
    const result = clampDeltaByOverlap(-50, 'e1', events, 210, dragSet, undefined, overlapInvalid, overlapReval);
    expect(210 + result).toBe(200);
  });
});

// ── Overlap: edge cases ──────────────────────────────────────────────────

describe('clampDeltaByOverlap — edge cases', () => {
  test('zero-range events pass through', () => {
    const events = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 0 }),
      makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 60, nonOverlappableRange: 60 }),
    ];
    const result = clampDeltaByOverlap(20, 'e1', events, 50, new Set(['e1']));
    expect(result).toBe(20);
  });

  test('unknown event ID passes through', () => {
    const events = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
    ];
    const result = clampDeltaByOverlap(100, 'e-unknown', events, 50, new Set(['e-unknown']));
    expect(result).toBe(100);
  });

  test('different owners do not block each other', () => {
    const events = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, ownerId: 'op-1', nonOverlappableRange: 60 }),
      makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 80, ownerId: 'op-2', nonOverlappableRange: 60 }),
    ];
    // e1 moving to 80 would overlap e2 if same owner, but different owners → no block
    const result = clampDeltaByOverlap(30, 'e1', events, 50, new Set(['e1']));
    expect(result).toBe(30);
  });

  test('batch-dragged siblings are excluded from blocking', () => {
    const events = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
      makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 200, nonOverlappableRange: 60 }),
    ];
    // Both e1 and e2 are being dragged together — e2 should not block e1
    const dragSet = new Set(['e1', 'e2']);
    const result = clampDeltaByOverlap(160, 'e1', events, 50, dragSet);
    expect(result).toBe(160);
  });

  test('edge-exact placement does not overlap', () => {
    // e1 range=60 at 50, e2 starts at 200. Moving e1 to exactly 140 → end at 200, no overlap
    const events = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
      makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 200, nonOverlappableRange: 60 }),
    ];
    const result = clampDeltaByOverlap(90, 'e1', events, 50, new Set(['e1']));
    expect(result).toBe(90);
    expect(50 + result).toBe(140); // end at 200, exactly touching but not overlapping
  });

  test('no siblings means no clamping', () => {
    const events = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
    ];
    const result = clampDeltaByOverlap(500, 'e1', events, 50, new Set(['e1']));
    expect(result).toBe(500);
  });
});

// ── Overlap: multiple siblings ───────────────────────────────────────────

describe('clampDeltaByOverlap — multiple siblings', () => {
  // e1 at 50 (range 60), e2 at 200 (range 60), e3 at 400 (range 60)
  const events = [
    makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 50, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 200, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e3', columnId: SKILL_COLUMNS.BATTLE, startFrame: 400, nonOverlappableRange: 60 }),
  ];
  const dragSet = new Set(['e1']);

  test('clamps to nearest sibling when dragging forward', () => {
    // e1 at 50, delta=180 → target=230 overlaps e2 [200,260), clamp to 200-60=140
    const result = clampDeltaByOverlap(180, 'e1', events, 50, dragSet);
    expect(50 + result).toBe(140);
  });

  test('allows positioning between siblings', () => {
    // e1 at 50, delta=80 → target=130, between e1's original and e2 → no overlap
    const result = clampDeltaByOverlap(80, 'e1', events, 50, dragSet);
    expect(result).toBe(80);
  });

  test('invalid at drag start: free movement through multiple overlapping siblings', () => {
    // e1 overlapping e2 at drag start, should be free to move even past e3
    const overlappingEvents = [
      makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 210, nonOverlappableRange: 60 }),
      makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 200, nonOverlappableRange: 60 }),
      makeEvent({ id: 'e3', columnId: SKILL_COLUMNS.BATTLE, startFrame: 400, nonOverlappableRange: 60 }),
    ];
    const overlapInvalid = new Set(['e1']);
    const overlapReval = new Set<string>();
    // Move e1 from 210 to 420 — overlaps e3 [400,460) — still free (invalid state)
    const result = clampDeltaByOverlap(210, 'e1', overlappingEvents, 210, new Set(['e1']), undefined, overlapInvalid, overlapReval);
    expect(result).toBe(210);
    expect(overlapInvalid.has('e1')).toBe(true);
  });
});

// ── Overlap: revalidated clamping in both directions ─────────────────────

describe('clampDeltaByOverlap — revalidated bidirectional clamping', () => {
  // e1 between two siblings: e2 at [100,160), e3 at [300,360)
  // e1 (range 60) at 200, revalidated — should be clamped by both sides
  const events = [
    makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 200, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e2', columnId: SKILL_COLUMNS.BATTLE, startFrame: 100, nonOverlappableRange: 60 }),
    makeEvent({ id: 'e3', columnId: SKILL_COLUMNS.BATTLE, startFrame: 300, nonOverlappableRange: 60 }),
  ];
  const dragSet = new Set(['e1']);
  const overlapInvalid = new Set<string>();
  const overlapReval = new Set(['e1']);

  test('clamps forward to e3 boundary', () => {
    // e1 at 200 (range 60), delta=60 → target=260, end=320 overlaps e3 [300,360)
    // clamp to 300-60=240
    const result = clampDeltaByOverlap(60, 'e1', events, 200, dragSet, undefined, overlapInvalid, overlapReval);
    expect(200 + result).toBe(240);
  });

  test('clamps backward to e2 boundary', () => {
    // e1 at 200, delta=-60 → target=140, overlaps e2 [100,160)
    // clamp to 160
    const result = clampDeltaByOverlap(-60, 'e1', events, 200, dragSet, undefined, overlapInvalid, overlapReval);
    expect(200 + result).toBe(160);
  });

  test('allows movement within gap between siblings', () => {
    // e1 at 200 (range 60), delta=20 → target=220, end=280 < e3.start=300 → OK
    const result = clampDeltaByOverlap(20, 'e1', events, 200, dragSet, undefined, overlapInvalid, overlapReval);
    expect(result).toBe(20);
  });
});
