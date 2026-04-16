/**
 * @jest-environment jsdom
 */
import { computeStatusViewOverrides } from '../../controller/timeline/eventPresentationController';
import { FPS } from '../../utils/timeline';
import type { TimelineEvent, Column } from '../../consts/viewTypes';

const WATERSPOUT_ID = 'WATERSPOUT';
const ENEMY_ID = 'enemy';

function makeWaterspoutEvent(uid: string, startFrame: number): TimelineEvent {
  return {
    uid,
    id: WATERSPOUT_ID,
    name: WATERSPOUT_ID,
    ownerEntityId: ENEMY_ID,
    columnId: WATERSPOUT_ID,
    startFrame,
    segments: [{ properties: { duration: 3 * FPS } }],
  } as TimelineEvent;
}

function makeEnemyStatusColumn(): Column {
  return {
    key: 'enemy-status',
    type: 'mini-timeline',
    ownerEntityId: ENEMY_ID,
    columnId: 'enemy-status',
    microColumns: [{ columnId: WATERSPOUT_ID }],
    matchColumnIds: [WATERSPOUT_ID],
  } as unknown as Column;
}

describe('Waterspout visual clamping', () => {
  it('overlapping waterspouts are NOT visually clamped (frames would be hidden)', () => {
    const ev1 = makeWaterspoutEvent('ws-1', 0);
    const ev2 = makeWaterspoutEvent('ws-2', 1 * FPS);
    const col = makeEnemyStatusColumn();

    const overrides = computeStatusViewOverrides([ev1, ev2], [col]);

    const o1 = overrides.get('ws-1');
    const o2 = overrides.get('ws-2');
    expect(o1).toBeDefined();
    expect(o2).toBeDefined();
    // Neither should have visualActivationDuration set (no clamping)
    expect(o1!.visualActivationDuration).toBeUndefined();
    expect(o2!.visualActivationDuration).toBeUndefined();
  });

  it('non-overlapping waterspouts have no clamping (no overlap to resolve)', () => {
    const ev1 = makeWaterspoutEvent('ws-1', 0);
    const ev2 = makeWaterspoutEvent('ws-2', 5 * FPS);
    const col = makeEnemyStatusColumn();

    const overrides = computeStatusViewOverrides([ev1, ev2], [col]);

    const o1 = overrides.get('ws-1');
    expect(o1).toBeDefined();
    expect(o1!.visualActivationDuration).toBeUndefined();
  });
});
