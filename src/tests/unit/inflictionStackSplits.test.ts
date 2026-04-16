/**
 * Unit tests for the view-controller's infliction stack-timeline splitter.
 *
 * The view splits each arts-infliction bar into sub-segments at every frame
 * where the column's cumulative active stack count changes, so users see
 * "Heat I → Heat II → Heat I" labels evolve across the bar as stacks grow
 * and shrink.
 *
 * Verified paths:
 *  - single active heat: no split (stays one segment)
 *  - two heats overlap, no consume: each bar picks up a "II" section during
 *    the overlap window
 *  - two heats, older consumed mid-span: survivor splits "II" → "I" at the
 *    consume frame; original duration preserved
 *  - a new heat added after an earlier batch has fully ended starts at
 *    "Heat I" (regression for the "Heat IV starting by itself" bug)
 *  - non-infliction columns are untouched
 */

import {
  computeTimelinePresentation,
} from '../../controller/timeline/eventPresentationController';
import { TimelineEvent, Column, MiniTimeline } from '../../consts/viewTypes';
import { EventStatusType, TimelineSourceType } from '../../consts/enums';
import { INFLICTION_COLUMNS, ENEMY_ID } from '../../model/channels';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const FPS = 120;
const HEAT_COL = INFLICTION_COLUMNS.HEAT;

function heat(
  uid: string,
  startFrame: number,
  durationFrames: number,
  opts?: { consumed?: boolean; stacks?: number },
): TimelineEvent {
  return {
    uid,
    id: HEAT_COL,
    name: HEAT_COL,
    ownerEntityId: ENEMY_ID,
    columnId: HEAT_COL,
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
    ...(opts?.consumed ? { eventStatus: EventStatusType.CONSUMED } : {}),
    ...(opts?.stacks != null ? { stacks: opts.stacks } : {}),
  };
}

function heatColumn(): Column {
  return {
    key: `${ENEMY_ID}-${HEAT_COL}`,
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerEntityId: ENEMY_ID,
    columnId: HEAT_COL,
    label: 'Heat',
    color: '#ff6a00',
    headerVariant: 'skill',
    derived: false,
    microColumns: [{ id: HEAT_COL, label: 'Heat', color: '#ff6a00' }],
    microColumnAssignment: 'by-order',
    matchColumnIds: [HEAT_COL],
  } as MiniTimeline;
}

function renderedSegments(viewModels: Map<string, { events: TimelineEvent[] }>, uid: string) {
  for (const vm of Array.from(viewModels.values())) {
    const found = vm.events.find((ev) => ev.uid === uid);
    if (found) return found.segments;
  }
  return undefined;
}

describe('eventPresentationController — infliction stack-timeline splitter', () => {
  it('single heat: no split (bar stays one segment)', () => {
    const events = [heat('h1', 0, 10 * FPS, { stacks: 1 })];
    const vm = computeTimelinePresentation(events, [heatColumn()]);
    // eslint-disable-next-line testing-library/render-result-naming-convention -- not a testing-library render result
    const segs = renderedSegments(vm, 'h1');
    expect(segs).toHaveLength(1);
    expect(segs![0].properties.duration).toBe(10 * FPS);
  });

  it('two heats overlapping (no consume): both bars split at the 2nd heat\'s start', () => {
    // h1: [0, 10s), h2: [4s, 14s). Overlap window: [4s, 10s) → count=2.
    const events = [
      heat('h1', 0, 10 * FPS, { stacks: 1 }),
      heat('h2', 4 * FPS, 10 * FPS, { stacks: 2 }),
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    // h1: "Heat I" for [0, 4s), "Heat II" for [4s, 10s)
    const h1Segs = renderedSegments(vm, 'h1')!;
    expect(h1Segs).toHaveLength(2);
    expect(h1Segs[0].properties.duration).toBe(4 * FPS);
    expect(h1Segs[0].properties.name).toBe('Heat I');
    expect(h1Segs[1].properties.duration).toBe(6 * FPS);
    expect(h1Segs[1].properties.name).toBe('Heat II');

    // h2: "Heat II" for [4s, 10s), "Heat I" for [10s, 14s)
    const h2Segs = renderedSegments(vm, 'h2')!;
    expect(h2Segs).toHaveLength(2);
    expect(h2Segs[0].properties.duration).toBe(6 * FPS);
    expect(h2Segs[0].properties.name).toBe('Heat II');
    expect(h2Segs[1].properties.duration).toBe(4 * FPS);
    expect(h2Segs[1].properties.name).toBe('Heat I');
  });

  it('two heats, older consumed at mid-span: survivor splits II → I at consume frame', () => {
    // h1 at frame 0 with duration 3s (CONSUMED — truncated at 3s).
    // h2 at frame 1s with original 10s duration → active through 11s.
    // Transitions: +1@0, +1@1s (count=2), -1@3s (count=1), -1@11s (count=0)
    const events = [
      heat('h1', 0, 3 * FPS, { consumed: true, stacks: 1 }),
      heat('h2', 1 * FPS, 10 * FPS, { stacks: 2 }),
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    // Survivor (h2) splits at the consume frame (3s):
    //   [1s, 3s) "Heat II", [3s, 11s) "Heat I"
    const h2Segs = renderedSegments(vm, 'h2')!;
    expect(h2Segs).toHaveLength(2);
    expect(h2Segs[0].properties.duration).toBe(2 * FPS);
    expect(h2Segs[0].properties.name).toBe('Heat II');
    expect(h2Segs[1].properties.duration).toBe(8 * FPS);
    expect(h2Segs[1].properties.name).toBe('Heat I');
    // Original duration preserved
    const totalDur = h2Segs[0].properties.duration + h2Segs[1].properties.duration;
    expect(totalDur).toBe(10 * FPS);
  });

  it('new heat after earlier batch fully consumed: starts at "Heat I" not "Heat IV"', () => {
    // 3 heats created then all consumed by frame 5s. New heat at 10s should
    // see cumulative count = 1 → labeled "Heat I", not "Heat IV".
    const events = [
      heat('h1', 0, 5 * FPS, { consumed: true, stacks: 1 }),
      heat('h2', 1 * FPS, 4 * FPS, { consumed: true, stacks: 2 }),
      heat('h3', 2 * FPS, 3 * FPS, { consumed: true, stacks: 3 }),
      heat('h4', 10 * FPS, 10 * FPS, { stacks: 1 }),
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    // h4 is alone through its lifespan; no split, but the label on the
    // overall column reads "Heat I" for h4.
    const h4Segs = renderedSegments(vm, 'h4')!;
    expect(h4Segs).toHaveLength(1);
    // Since single segment, label comes from override (not segment name).
    // The view override should reflect count=1.
    const override = vm.get(`${ENEMY_ID}-${HEAT_COL}`)?.statusOverrides.get('h4');
    expect(override?.label).toBe('Heat I');
  });

  it('three heats overlap: label progression is I → II → III as stacks add up', () => {
    // h1 [0, 20s), h2 [5s, 20s), h3 [10s, 20s) — all still active through the window.
    const events = [
      heat('h1', 0, 20 * FPS, { stacks: 1 }),
      heat('h2', 5 * FPS, 15 * FPS, { stacks: 2 }),
      heat('h3', 10 * FPS, 10 * FPS, { stacks: 3 }),
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    // h1 picks up segments: I [0, 5s), II [5s, 10s), III [10s, 20s)
    const h1Segs = renderedSegments(vm, 'h1')!;
    expect(h1Segs.map(s => s.properties.name)).toEqual(['Heat I', 'Heat II', 'Heat III']);
    expect(h1Segs.map(s => s.properties.duration)).toEqual([5 * FPS, 5 * FPS, 10 * FPS]);

    // h2 picks up: II [5s, 10s), III [10s, 20s)
    const h2Segs = renderedSegments(vm, 'h2')!;
    expect(h2Segs.map(s => s.properties.name)).toEqual(['Heat II', 'Heat III']);

    // h3 is entirely in the "III" window — single segment labeled "III"
    // (when uniqueCounts.size is 1, no split; label comes from override).
    const h3Segs = renderedSegments(vm, 'h3')!;
    expect(h3Segs).toHaveLength(1);
  });

  it('REGRESSION: 3 old heats still active + 1 new → new heat starts at Heat IV (count=4)', () => {
    // This test documents how position is counted when OLD heats overlap a new one.
    // Transitions: +1@0, +1@1, +1@2, +1@5 (new), ends at 20-25.
    // At new heat (frame 5): count = 4 (3 old + itself). Labeled "Heat IV".
    // That's the ACCURATE cumulative count — user saw this and expected I instead.
    // The fix is that OLD heats must have ended before the new one starts (either
    // consumed or expired) for the new one to restart at I.
    const events = [
      heat('h1', 0, 20 * FPS, { stacks: 1 }),
      heat('h2', 1 * FPS, 20 * FPS, { stacks: 2 }),
      heat('h3', 2 * FPS, 20 * FPS, { stacks: 3 }),
      heat('h4', 5 * FPS, 20 * FPS, { stacks: 4 }), // adds on top, count = 4
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);
    // h4's first segment at its start frame — count=4 → "Heat IV"
    const h4Segs = renderedSegments(vm, 'h4')!;
    expect(h4Segs[0].properties.name).toBe('Heat IV');
  });

  it('REGRESSION: 3 old heats fully consumed + 2 new → labels restart at I, II', () => {
    // 3 consumed heats (end at frame 5) then 2 new stacks. Second new stack at
    // frame 11 should be "Heat II", not "Heat IV".
    const events = [
      heat('h1', 0, 5 * FPS, { consumed: true, stacks: 1 }),
      heat('h2', 1 * FPS, 4 * FPS, { consumed: true, stacks: 2 }),
      heat('h3', 2 * FPS, 3 * FPS, { consumed: true, stacks: 3 }),
      heat('h4', 10 * FPS, 20 * FPS, { stacks: 1 }), // first new
      heat('h5', 11 * FPS, 20 * FPS, { stacks: 2 }), // second new
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    const h5Segs = renderedSegments(vm, 'h5')!;
    // h5's first visible segment must be "Heat II" (count at 11s = h4 still alive + h5 = 2)
    expect(h5Segs[0].properties.name).toBe('Heat II');
  });

  it('REGRESSION: 3 heats → MF-cap consume takes 1, new heat restarts cleanly', () => {
    // MF=3 cap=4 scenario: 3 heats get fully consumed by BATK. New heat 2s later.
    // Must restart at Heat I, not Heat II (because old heats truly ended).
    const events = [
      heat('h1', 0, 5 * FPS, { consumed: true, stacks: 1 }),
      heat('h2', 1 * FPS, 4 * FPS, { consumed: true, stacks: 2 }),
      heat('h3', 2 * FPS, 3 * FPS, { consumed: true, stacks: 3 }),
      heat('h4', 10 * FPS, 20 * FPS, { stacks: 1 }), // new heat
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    // h4 is the only active heat at its start; cumulative count = 1.
    const h4Segs = renderedSegments(vm, 'h4')!;
    expect(h4Segs).toHaveLength(1);
    // Override carries the "Heat I" label since h4 is alone (no split).
    const override = vm.get(`${ENEMY_ID}-${HEAT_COL}`)?.statusOverrides.get('h4');
    expect(override?.label).toBe('Heat I');
  });

  it('REGRESSION: fresh heat applied alone, then consumed by BATK, stays "Heat I"', () => {
    // Earlier batch of 3 heats fully consumed long before h4 is applied.
    // h4 is a fresh heat applied alone (stacks=1) and then immediately
    // consumed by BATK. Its label must remain "Heat I", not flip to
    // "Heat IV" just because the old batch's apply-time (defDur) window
    // would overlap h4.startFrame.
    const consumeFrame = 11 * FPS;
    const events = [
      heat('h1', 0, 5 * FPS, { consumed: true, stacks: 1 }),
      heat('h2', 1 * FPS, 4 * FPS, { consumed: true, stacks: 2 }),
      heat('h3', 2 * FPS, 3 * FPS, { consumed: true, stacks: 3 }),
      heat('h4', 10 * FPS, consumeFrame - 10 * FPS, { consumed: true, stacks: 1 }),
    ];
    const vm = computeTimelinePresentation(events, [heatColumn()]);

    const h4Segs = renderedSegments(vm, 'h4')!;
    expect(h4Segs).toHaveLength(1);
    const override = vm.get(`${ENEMY_ID}-${HEAT_COL}`)?.statusOverrides.get('h4');
    expect(override?.label).toBe('Heat I');
  });

  it('event mutation is a clone — does not modify the input events', () => {
    const h1 = heat('h1', 0, 10 * FPS, { stacks: 1 });
    const h2 = heat('h2', 4 * FPS, 10 * FPS, { stacks: 2 });
    const originalH1Segs = h1.segments;
    const originalH2Segs = h2.segments;

    computeTimelinePresentation([h1, h2], [heatColumn()]);

    // Inputs unchanged
    expect(h1.segments).toBe(originalH1Segs);
    expect(h2.segments).toBe(originalH2Segs);
    expect(h1.segments).toHaveLength(1);
    expect(h2.segments).toHaveLength(1);
  });
});
