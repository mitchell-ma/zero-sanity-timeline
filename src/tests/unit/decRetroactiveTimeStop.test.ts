/**
 * DerivedEventController — retroactive time-stop re-extension
 *
 * Regression tests for the per-segment `rawSegmentDurations` store + idempotent
 * `extendSingleEvent` path added during Phase 9a. When a later skill event
 * registers a new time-stop that overlaps an already-registered prior event,
 * that prior event's durations must be re-extended without double-counting,
 * even across repeated registrations.
 *
 * These test the internal invariants of `_maybeRegisterStop` → `extendSingleEvent`
 * by driving `createSkillEvent` directly and inspecting the resulting segments
 * on `getProcessedEvents()`.
 */

import { DerivedEventController } from '../../controller/timeline/derivedEventController';
import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { SegmentType } from '../../consts/enums';

function mkStatus(uid: string, startFrame: number, rawDuration: number): TimelineEvent {
  return {
    uid,
    id: 'TEST_STATUS',
    name: 'TEST_STATUS',
    ownerEntityId: 'slot-0',
    columnId: NounType.BATTLE,
    startFrame,
    segments: [
      { properties: { duration: rawDuration } },
    ],
    ownerSlotId: 'slot-0',
    sourceSkillName: 'TEST',
  } as TimelineEvent;
}

function mkUltimate(uid: string, startFrame: number, animDuration: number): TimelineEvent {
  return {
    uid,
    id: 'TEST_ULT',
    name: 'TEST_ULT',
    ownerEntityId: 'slot-0',
    columnId: NounType.ULTIMATE,
    startFrame,
    segments: [
      { properties: { duration: animDuration, segmentTypes: [SegmentType.ANIMATION] } },
      { properties: { duration: 60, segmentTypes: [SegmentType.ACTIVE] } },
    ],
    ownerSlotId: 'slot-0',
    sourceSkillName: 'TEST_ULT',
  } as TimelineEvent;
}

describe('DEC — retroactive time-stop re-extension', () => {
  let dec: DerivedEventController;

  beforeEach(() => {
    dec = new DerivedEventController();
    dec.reset();
  });

  test('prior event registered before a later stop gets re-extended once', () => {
    // Prior status spans frames 0..300 (raw). A later ultimate at frame 100
    // registers a 60-frame time-stop that overlaps it → the prior event's
    // segment duration should become 360.
    dec.createSkillEvent(mkStatus('s1', 0, 300), { checkCooldown: false });
    dec.createSkillEvent(mkUltimate('u1', 100, 60), { checkCooldown: false });

    const processed = dec.getProcessedEvents();
    const status = processed.find(e => e.uid === 's1')!;
    expect(status).toBeDefined();
    expect(status.segments[0].properties.duration).toBe(360);
  });

  test('extension is idempotent under multiple overlapping stops', () => {
    // Two later stops each add 60 frames. The prior event spanning them both
    // must extend to raw + 60 + 60 = 420, never more.
    dec.createSkillEvent(mkStatus('s1', 0, 300), { checkCooldown: false });
    dec.createSkillEvent(mkUltimate('u1', 50, 60), { checkCooldown: false });
    dec.createSkillEvent(mkUltimate('u2', 200, 60), { checkCooldown: false });

    const processed = dec.getProcessedEvents();
    const status = processed.find(e => e.uid === 's1')!;
    expect(status.segments[0].properties.duration).toBe(420);
  });

  test('prior event not overlapping the stop is untouched', () => {
    // Status at 0..50, stop at 200..260. No overlap → raw preserved.
    dec.createSkillEvent(mkStatus('s1', 0, 50), { checkCooldown: false });
    dec.createSkillEvent(mkUltimate('u1', 200, 60), { checkCooldown: false });

    const processed = dec.getProcessedEvents();
    const status = processed.find(e => e.uid === 's1')!;
    expect(status.segments[0].properties.duration).toBe(50);
  });

  test('pushEvent-inserted status participates in retroactive re-extension (post-merge)', () => {
    // Regression pin for the createSkillEvent/createQueueEvent merge: events
    // entering via pushEvent (statuses, inflictions) now capture per-segment
    // raw durations via the shared _ingest path and get re-extended when a
    // later skill event registers an overlapping time-stop. Before the merge
    // this path relied on reExtendQueueEvents (single-total rawDurations)
    // and was only triggered when the pushEvent event itself was a stop —
    // practically never for statuses/inflictions, leaving them stale.
    const statusEv = {
      uid: 'pushed-status',
      id: 'TEST_PUSHED',
      name: 'TEST_PUSHED',
      ownerEntityId: 'slot-0',
      columnId: NounType.STATUS,
      startFrame: 0,
      segments: [{ properties: { duration: 300 } }],
      ownerSlotId: 'slot-0',
      sourceSkillName: 'TEST',
    } as TimelineEvent;

    // Enter via the pushEvent path (the ColumnHost callback used by
    // configDrivenStatusColumn / inflictionColumn / physicalStatusColumn).
    dec.pushEvent(statusEv);

    // No stops yet — duration stays at raw.
    expect(statusEv.segments[0].properties.duration).toBe(300);

    // Register a time-stop that overlaps the pushed status.
    dec.createSkillEvent(mkUltimate('u1', 100, 60), { checkCooldown: false });

    // The pushed status should now be re-extended to 300 + 60 = 360.
    const processed = dec.getProcessedEvents();
    const status = processed.find(e => e.uid === 'pushed-status')!;
    expect(status).toBeDefined();
    expect(status.segments[0].properties.duration).toBe(360);
  });

  test('time-stop event itself does not extend by its own stop', () => {
    // Only one ultimate; its own time-stop must NOT re-extend its own segments.
    dec.createSkillEvent(mkUltimate('u1', 100, 60), { checkCooldown: false });

    const processed = dec.getProcessedEvents();
    const ult = processed.find(e => e.uid === 'u1')!;
    // Animation segment stays at 60 (its raw).
    expect(ult.segments[0].properties.duration).toBe(60);
  });
});
