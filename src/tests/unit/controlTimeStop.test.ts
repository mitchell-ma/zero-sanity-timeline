/**
 * Control status × time-stop interaction tests
 *
 * 1. Control events are NOT extended by time-stops (timer keeps ticking)
 * 2. Control swap events cannot start during any time-stop (including dodge)
 */

import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { SegmentType } from '../../consts/enums';
import {
  applyTimeStopExtension,
  validateTimeStopStarts,
  collectTimeStopRegions,
} from '../../controller/timeline/processTimeStop';
import { OPERATOR_COLUMNS } from '../../model/channels';

// ── Helpers ──────────────────────────────────────────────────────────────

let uidCounter = 0;
function uid() { return `test-${++uidCounter}`; }
beforeEach(() => { uidCounter = 0; });

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return {
    id: overrides.id ?? overrides.name ?? 'TEST',
    name: overrides.name ?? 'TEST',
    ownerId: 'op-1',
    segments: [{ properties: { duration: 120 } }],
    ...overrides,
  };
}

function makeControlEvent(startFrame: number, duration: number, ownerId = 'op-1'): TimelineEvent {
  return makeEvent({
    uid: uid(),
    id: NounType.CONTROL,
    name: NounType.CONTROL,
    columnId: OPERATOR_COLUMNS.INPUT,
    ownerId,
    startFrame,
    segments: [{ properties: { duration } }],
  });
}

function makeUltimateEvent(startFrame: number, animDuration: number): TimelineEvent {
  return makeEvent({
    uid: uid(),
    columnId: NounType.ULTIMATE,
    startFrame,
    segments: [
      { properties: { duration: animDuration, name: 'Animation', segmentTypes: [SegmentType.ANIMATION] } },
      { properties: { duration: 60, name: 'Lingering' } },
    ],
  });
}

function makeComboEvent(startFrame: number, animDuration: number): TimelineEvent {
  return makeEvent({
    uid: uid(),
    columnId: NounType.COMBO,
    startFrame,
    segments: [
      { properties: { duration: animDuration, name: 'Animation', segmentTypes: [SegmentType.ANIMATION] } },
      { properties: { duration: 30, name: 'Lingering' } },
    ],
  });
}

function makeDodgeEvent(startFrame: number, animDuration: number): TimelineEvent {
  return makeEvent({
    uid: uid(),
    columnId: OPERATOR_COLUMNS.INPUT,
    startFrame,
    segments: [{ properties: { duration: animDuration, segmentTypes: [SegmentType.ANIMATION] } }],
    isPerfectDodge: true,
  });
}

// ── Extension exemption ────────────────────────────────────────────────

describe('control events are NOT extended by time-stops', () => {
  it('control event duration unchanged when overlapping ultimate time-stop', () => {
    const ult = makeUltimateEvent(100, 30);
    const control = makeControlEvent(80, 200);
    const stops = collectTimeStopRegions([ult]);

    const [result] = applyTimeStopExtension([control], stops);
    expect(result.segments[0].properties.duration).toBe(200);
  });

  it('control event duration unchanged when overlapping combo time-stop', () => {
    const combo = makeComboEvent(50, 20);
    const control = makeControlEvent(40, 100);
    const stops = collectTimeStopRegions([combo]);

    const [result] = applyTimeStopExtension([control], stops);
    expect(result.segments[0].properties.duration).toBe(100);
  });

  it('control event duration unchanged when overlapping dodge time-stop', () => {
    const dodge = makeDodgeEvent(60, 15);
    const control = makeControlEvent(50, 80);
    const stops = collectTimeStopRegions([dodge]);

    const [result] = applyTimeStopExtension([control], stops);
    expect(result.segments[0].properties.duration).toBe(80);
  });

  it('non-control event IS extended (baseline comparison)', () => {
    const ult = makeUltimateEvent(100, 30);
    const battle = makeEvent({
      uid: uid(),
      columnId: NounType.BATTLE,
      startFrame: 80,
      segments: [{ properties: { duration: 200 } }],
    });
    const stops = collectTimeStopRegions([ult]);

    const [result] = applyTimeStopExtension([battle], stops);
    // Battle event starts at 80, duration 200 → covers 80-280
    // Ult time-stop at 100-130 pauses it for 30 frames → extended to 230
    expect(result.segments[0].properties.duration).toBe(230);
  });
});

// ── Validation: control swap cannot start during time-stop ─────────────

describe('control swap cannot start during any time-stop', () => {
  it('warns when control swap starts during ultimate time-stop', () => {
    const ult = makeUltimateEvent(100, 30);
    const control = makeControlEvent(110, 500, 'op-2');
    const stops = collectTimeStopRegions([ult]);

    const results = validateTimeStopStarts([ult, control], stops);
    const result = results.find(ev => ev.id === NounType.CONTROL)!;
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes('Control swap'))).toBe(true);
  });

  it('warns when control swap starts during combo time-stop', () => {
    const combo = makeComboEvent(200, 20);
    const control = makeControlEvent(210, 500, 'op-2');
    const stops = collectTimeStopRegions([combo]);

    const results = validateTimeStopStarts([combo, control], stops);
    const result = results.find(ev => ev.id === NounType.CONTROL)!;
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes('Control swap'))).toBe(true);
  });

  it('warns when control swap starts during dodge time-stop', () => {
    const dodge = makeDodgeEvent(50, 15);
    const control = makeControlEvent(55, 500, 'op-2');
    const stops = collectTimeStopRegions([dodge]);

    const results = validateTimeStopStarts([dodge, control], stops);
    const result = results.find(ev => ev.id === NounType.CONTROL)!;
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes('Control swap'))).toBe(true);
  });

  it('no warning when control swap starts outside time-stop', () => {
    const ult = makeUltimateEvent(100, 30);
    const control = makeControlEvent(130, 500, 'op-2');
    const stops = collectTimeStopRegions([ult]);

    const results = validateTimeStopStarts([ult, control], stops);
    const result = results.find(ev => ev.id === NounType.CONTROL)!;
    expect(result.warnings ?? []).toHaveLength(0);
  });

  it('no warning when control swap starts before time-stop', () => {
    const ult = makeUltimateEvent(100, 30);
    const control = makeControlEvent(50, 500, 'op-2');
    const stops = collectTimeStopRegions([ult]);

    const results = validateTimeStopStarts([ult, control], stops);
    const result = results.find(ev => ev.id === NounType.CONTROL)!;
    expect(result.warnings ?? []).toHaveLength(0);
  });
});
