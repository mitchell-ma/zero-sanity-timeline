/**
 * Unit tests for the free-function helpers extracted from
 * DerivedEventController.registerEvents during Phase 8 step 2.
 */
import {
  chainComboPredecessor,
  clampPriorControlEvents,
  computeFramePositions,
  setAnimationSegmentDuration,
  type ComboStopEntry,
} from '../../../controller/timeline/createSkillEvent';
import { TimelineEvent } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { SegmentType } from '../../../consts/enums';
import { OPERATOR_COLUMNS } from '../../../model/channels';
import { TimeStopRegion } from '../../../controller/timeline/processTimeStop';

function mkEvent(partial: Partial<TimelineEvent> & { uid: string; startFrame: number }): TimelineEvent {
  return {
    uid: partial.uid,
    id: partial.id ?? 'TEST',
    name: partial.name ?? 'TEST',
    ownerId: partial.ownerId ?? 'slot-1',
    columnId: partial.columnId ?? NounType.BATTLE,
    startFrame: partial.startFrame,
    segments: partial.segments ?? [{ properties: { duration: 60 } }],
    sourceOwnerId: partial.sourceOwnerId,
    sourceSkillName: partial.sourceSkillName,
  } as TimelineEvent;
}

describe('setAnimationSegmentDuration', () => {
  test('updates only the ANIMATION segment', () => {
    const segs = [
      { properties: { duration: 30, segmentTypes: [SegmentType.ANIMATION] } },
      { properties: { duration: 90, segmentTypes: [SegmentType.COOLDOWN] } },
    ];
    const out = setAnimationSegmentDuration(segs, 10);
    expect(out[0].properties.duration).toBe(10);
    expect(out[1].properties.duration).toBe(90);
    // Immutable
    expect(segs[0].properties.duration).toBe(30);
  });
});

describe('chainComboPredecessor', () => {
  test('passthrough for non-combo event', () => {
    const ev = mkEvent({ uid: 'a', startFrame: 0, columnId: NounType.BATTLE });
    const state = { comboStops: [] as ComboStopEntry[], registeredEvents: [], stops: [] as TimeStopRegion[] };
    const out = chainComboPredecessor(ev, state);
    expect(out).toBe(ev);
    expect(state.comboStops).toHaveLength(0);
  });

  test('tracks combo stop for combo with animation', () => {
    const ev = mkEvent({
      uid: 'c1',
      startFrame: 0,
      columnId: NounType.COMBO,
      segments: [{ properties: { duration: 60, segmentTypes: [SegmentType.ANIMATION] } }],
    });
    const state = { comboStops: [] as ComboStopEntry[], registeredEvents: [ev], stops: [] as TimeStopRegion[] };
    chainComboPredecessor(ev, state);
    expect(state.comboStops).toEqual([{ uid: 'c1', startFrame: 0, animDur: 60 }]);
  });

  test('truncates older combo when new combo starts inside its animation', () => {
    const older = mkEvent({
      uid: 'c1', startFrame: 0, columnId: NounType.COMBO,
      segments: [{ properties: { duration: 120, segmentTypes: [SegmentType.ANIMATION] } }],
    });
    const state = {
      comboStops: [{ uid: 'c1', startFrame: 0, animDur: 120 }],
      registeredEvents: [older],
      stops: [] as TimeStopRegion[],
    };
    const newer = mkEvent({
      uid: 'c2', startFrame: 40, columnId: NounType.COMBO,
      segments: [{ properties: { duration: 60, segmentTypes: [SegmentType.ANIMATION] } }],
    });
    chainComboPredecessor(newer, state);
    expect(state.comboStops.find(c => c.uid === 'c1')?.animDur).toBe(40);
    expect(state.registeredEvents[0].segments[0].properties.duration).toBe(40);
  });

  test('truncates new combo when older combo starts inside its animation', () => {
    const older = mkEvent({
      uid: 'c1', startFrame: 80, columnId: NounType.COMBO,
      segments: [{ properties: { duration: 60, segmentTypes: [SegmentType.ANIMATION] } }],
    });
    const state = {
      comboStops: [{ uid: 'c1', startFrame: 80, animDur: 60 }],
      registeredEvents: [older],
      stops: [] as TimeStopRegion[],
    };
    const newer = mkEvent({
      uid: 'c2', startFrame: 0, columnId: NounType.COMBO,
      segments: [{ properties: { duration: 120, segmentTypes: [SegmentType.ANIMATION] } }],
    });
    chainComboPredecessor(newer, state);
    expect(newer.segments[0].properties.duration).toBe(80);
  });
});

describe('clampPriorControlEvents', () => {
  test('clamps earlier CONTROL on different owner', () => {
    const prev = mkEvent({
      uid: 'p', startFrame: 0, id: NounType.CONTROL, columnId: OPERATOR_COLUMNS.INPUT,
      ownerId: 'slot-1', segments: [{ properties: { duration: 600 } }],
    });
    const registered = [prev];
    const ev = mkEvent({
      uid: 'n', startFrame: 100, id: NounType.CONTROL, columnId: OPERATOR_COLUMNS.INPUT,
      ownerId: 'slot-2',
    });
    clampPriorControlEvents(ev, registered);
    expect(registered[0].segments[0].properties.duration).toBe(100);
  });

  test('does not clamp same-owner CONTROL', () => {
    const prev = mkEvent({
      uid: 'p', startFrame: 0, id: NounType.CONTROL, columnId: OPERATOR_COLUMNS.INPUT,
      ownerId: 'slot-1', segments: [{ properties: { duration: 600 } }],
    });
    const registered = [prev];
    const ev = mkEvent({
      uid: 'n', startFrame: 100, id: NounType.CONTROL, columnId: OPERATOR_COLUMNS.INPUT,
      ownerId: 'slot-1',
    });
    clampPriorControlEvents(ev, registered);
    expect(registered[0].segments[0].properties.duration).toBe(600);
  });

  test('no-op for non-CONTROL events', () => {
    const prev = mkEvent({
      uid: 'p', startFrame: 0, id: NounType.CONTROL, columnId: OPERATOR_COLUMNS.INPUT,
      ownerId: 'slot-1', segments: [{ properties: { duration: 600 } }],
    });
    const registered = [prev];
    const ev = mkEvent({ uid: 'n', startFrame: 100 });
    clampPriorControlEvents(ev, registered);
    expect(registered[0].segments[0].properties.duration).toBe(600);
  });
});

describe('computeFramePositions', () => {
  test('sets absoluteStartFrame and absoluteFrame with no stops', () => {
    const ev = mkEvent({
      uid: 'e', startFrame: 100,
      segments: [
        { properties: { duration: 30 }, frames: [{ offsetFrame: 10 }, { offsetFrame: 20 }] },
        { properties: { duration: 60 }, frames: [{ offsetFrame: 5 }] },
      ],
    } as unknown as Partial<TimelineEvent> & { uid: string; startFrame: number });
    computeFramePositions(ev, []);
    expect(ev.segments[0].absoluteStartFrame).toBe(100);
    expect(ev.segments[0].frames![0].absoluteFrame).toBe(110);
    expect(ev.segments[0].frames![1].absoluteFrame).toBe(120);
    expect(ev.segments[1].absoluteStartFrame).toBe(130);
    expect(ev.segments[1].frames![0].absoluteFrame).toBe(135);
  });

  test('extends frame positions by a foreign time-stop', () => {
    const ev = mkEvent({
      uid: 'e', startFrame: 0,
      segments: [{ properties: { duration: 100 }, frames: [{ offsetFrame: 50 }] }],
    } as unknown as Partial<TimelineEvent> & { uid: string; startFrame: number });
    const stops: TimeStopRegion[] = [{ startFrame: 10, durationFrames: 20, eventUid: 'other' }];
    computeFramePositions(ev, stops);
    // Frame at offset 50 from segStart 0 gets extended through the [10,30] stop -> 70
    expect(ev.segments[0].frames![0].absoluteFrame).toBe(70);
    expect(ev.segments[0].frames![0].derivedOffsetFrame).toBe(70);
  });
});
