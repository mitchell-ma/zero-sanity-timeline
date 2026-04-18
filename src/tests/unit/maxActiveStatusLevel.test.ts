/**
 * `maxActiveStatusLevel` — timeline-query helper used by the runtime
 * resolver for `STATUS_LEVEL of <STATUS> of ENEMY/OPERATOR` ValueStatus
 * nodes. Returns the highest `statusLevel` across events matching
 * ownerEntityId + columnId that are active at the given frame; returns 0
 * when no matching event is found.
 */

import { maxActiveStatusLevel } from '../../controller/timeline/timelineQueries';
import type { TimelineEvent } from '../../consts/viewTypes';

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    uid: 'ev-test',
    id: 'TEST',
    name: 'TEST',
    ownerEntityId: 'enemy',
    columnId: 'ELECTRIFICATION',
    startFrame: 0,
    segments: [{ properties: { duration: 600 } }],
    ...overrides,
  } as TimelineEvent;
}

describe('maxActiveStatusLevel', () => {
  it('returns 0 when no events match', () => {
    expect(maxActiveStatusLevel([], 100, 'enemy', 'ELECTRIFICATION')).toBe(0);
  });

  it('returns 0 when events match columnId but belong to another owner', () => {
    const evs = [makeEvent({ ownerEntityId: 'slot-0', statusLevel: 3 })];
    expect(maxActiveStatusLevel(evs, 100, 'enemy', 'ELECTRIFICATION')).toBe(0);
  });

  it('returns 0 when events match owner but not columnId', () => {
    const evs = [makeEvent({ columnId: 'COMBUSTION', statusLevel: 3 })];
    expect(maxActiveStatusLevel(evs, 100, 'enemy', 'ELECTRIFICATION')).toBe(0);
  });

  it('returns statusLevel of the single matching active event', () => {
    const evs = [makeEvent({ statusLevel: 2 })];
    expect(maxActiveStatusLevel(evs, 100, 'enemy', 'ELECTRIFICATION')).toBe(2);
  });

  it('returns max statusLevel when multiple matching events are active at the frame', () => {
    const evs = [
      makeEvent({ uid: 'a', statusLevel: 1, startFrame: 0 }),
      makeEvent({ uid: 'b', statusLevel: 3, startFrame: 10 }),
      makeEvent({ uid: 'c', statusLevel: 2, startFrame: 20 }),
    ];
    expect(maxActiveStatusLevel(evs, 100, 'enemy', 'ELECTRIFICATION')).toBe(3);
  });

  it('ignores events that have ended before the query frame', () => {
    const evs = [
      // ended at frame 60
      makeEvent({ uid: 'old', statusLevel: 4, startFrame: 0, segments: [{ properties: { duration: 60 } }] }),
      // active through 700
      makeEvent({ uid: 'now', statusLevel: 1, startFrame: 100 }),
    ];
    expect(maxActiveStatusLevel(evs, 500, 'enemy', 'ELECTRIFICATION')).toBe(1);
  });

  it('ignores events that have not started yet at the query frame', () => {
    const evs = [
      // starts at 200 — not active at frame 100
      makeEvent({ uid: 'future', statusLevel: 4, startFrame: 200 }),
    ];
    expect(maxActiveStatusLevel(evs, 100, 'enemy', 'ELECTRIFICATION')).toBe(0);
  });

  it('treats missing statusLevel as 0 (not 1) — only explicit levels contribute', () => {
    const evs = [makeEvent({ statusLevel: undefined })];
    expect(maxActiveStatusLevel(evs, 100, 'enemy', 'ELECTRIFICATION')).toBe(0);
  });
});
