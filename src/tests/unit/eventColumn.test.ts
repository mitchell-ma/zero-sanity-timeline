/**
 * EventColumn — Unit Tests
 *
 * Tests the column stacking logic directly, including unlimited stacks (INFINITY).
 */

import { UNLIMITED_STACKS } from '../../consts/enums';
import { ConfigDrivenStatusColumn } from '../../controller/timeline/columns/configDrivenStatusColumn';
import { InflictionColumn } from '../../controller/timeline/columns/inflictionColumn';
import type { ColumnHost, EventSource } from '../../controller/timeline/columns/eventColumn';
import type { TimelineEvent } from '../../consts/viewTypes';
import type { TimeStopRegion } from '../../controller/timeline/processTimeStop';
import { INFLICTION_COLUMNS } from '../../model/channels';

// ── Mock ColumnHost ──────────────────────────────────────────────────────────

function makeHost(): ColumnHost & { events: TimelineEvent[] } {
  const events: TimelineEvent[] = [];
  return {
    events,
    activeEventsIn(columnId: string, ownerEntityId: string, frame: number) {
      return events.filter(ev =>
        ev.columnId === columnId &&
        ev.ownerEntityId === ownerEntityId &&
        ev.startFrame <= frame &&
        frame < ev.startFrame + (ev.segments?.[0]?.properties?.duration ?? 0),
      );
    },
    activeCount(columnId: string, ownerEntityId: string, frame: number) {
      return this.activeEventsIn(columnId, ownerEntityId, frame).length;
    },
    extendDuration(_start: number, raw: number) { return raw; },
    trackRawDuration() {},
    pushEvent(ev: TimelineEvent) {
      events.push(ev);
    },
    pushEventDirect(ev: TimelineEvent) { events.push(ev); },
    pushToOutput(ev: TimelineEvent) { events.push(ev); },
    applyToColumn() { return true; },
    foreignStopsFor(): readonly TimeStopRegion[] { return []; },
    getStops(): readonly TimeStopRegion[] { return []; },
    linkCausality() {},
  };
}

const SOURCE: EventSource = { ownerEntityId: 'op-1', skillName: 'TEST' };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UNLIMITED_STACKS constant', () => {
  it('is a large positive number', () => {
    expect(UNLIMITED_STACKS).toBeGreaterThan(0);
    expect(UNLIMITED_STACKS).toBe(99999);
  });
});

describe('ConfigDrivenStatusColumn — unlimited stacks', () => {
  it('accepts events when maxStacks is UNLIMITED_STACKS', () => {
    const host = makeHost();
    const col = new ConfigDrivenStatusColumn('TEST_STATUS', host);
    // Override maxStacks via options
    for (let i = 0; i < 10; i++) {
      const accepted = col.add('enemy', i * 100, 1200, SOURCE, {
        maxStacks: UNLIMITED_STACKS,
        uid: `test-${i}`,
      });
      expect(accepted).toBe(true);
    }
    expect(host.events.length).toBe(10);
  });

  it('canAdd returns true when maxStacks is large', () => {
    const host = makeHost();
    const col = new ConfigDrivenStatusColumn('TEST_STATUS', host);
    // Add many events
    for (let i = 0; i < 50; i++) {
      col.add('enemy', i, 1200, SOURCE, {
        maxStacks: UNLIMITED_STACKS,
        uid: `test-${i}`,
      });
    }
    expect(col.canAdd('enemy', 25)).toBe(true);
  });

  it('rejects events at capacity with NONE stacking and finite limit', () => {
    const host = makeHost();
    const col = new ConfigDrivenStatusColumn('TEST_STATUS', host);
    // Add 2 with limit 2
    col.add('enemy', 0, 1200, SOURCE, { maxStacks: 2, uid: 'a' });
    col.add('enemy', 0, 1200, SOURCE, { maxStacks: 2, uid: 'b' });
    const rejected = col.add('enemy', 0, 1200, SOURCE, { maxStacks: 2, uid: 'c' });
    expect(rejected).toBe(false);
    expect(host.events.length).toBe(2);
  });
});

describe('InflictionColumn — cross-element reaction causality', () => {
  it('builds reaction parents = [incoming, ...activeOther] with incoming as primary', () => {
    // Two pre-existing inflictions in a cross-element column + an incoming
    // infliction of a different element. The column should dispatch to the
    // reaction column with parents = [incomingUid, active1.uid, active2.uid].
    const applyCalls: Array<{ columnId: string; options: import('../../controller/timeline/columns/eventColumn').AddOptions | undefined }> = [];
    const linkCalls: Array<{ childUid: string; parents: readonly string[] }> = [];
    const events: TimelineEvent[] = [
      {
        uid: 'active-1', id: INFLICTION_COLUMNS.CRYO, name: INFLICTION_COLUMNS.CRYO,
        ownerEntityId: 'enemy', columnId: INFLICTION_COLUMNS.CRYO, startFrame: 0,
        segments: [{ properties: { duration: 1200 } }],
      } as TimelineEvent,
      {
        uid: 'active-2', id: INFLICTION_COLUMNS.CRYO, name: INFLICTION_COLUMNS.CRYO,
        ownerEntityId: 'enemy', columnId: INFLICTION_COLUMNS.CRYO, startFrame: 50,
        segments: [{ properties: { duration: 1200 } }],
      } as TimelineEvent,
    ];

    const host: ColumnHost = {
      activeEventsIn(columnId, ownerEntityId, frame) {
        return events.filter(ev =>
          ev.columnId === columnId && ev.ownerEntityId === ownerEntityId &&
          ev.startFrame <= frame && frame < ev.startFrame + (ev.segments?.[0]?.properties?.duration ?? 0),
        );
      },
      activeCount(columnId, ownerEntityId, frame) { return this.activeEventsIn(columnId, ownerEntityId, frame).length; },
      extendDuration(_s, r) { return r; },
      trackRawDuration() {},
      pushEvent(ev) { events.push(ev); },
      pushEventDirect(ev) { events.push(ev); },
      pushToOutput(ev) { events.push(ev); },
      applyToColumn(columnId, _o, _f, _d, _s, options) {
        applyCalls.push({ columnId, options });
        return true;
      },
      foreignStopsFor(): readonly TimeStopRegion[] { return []; },
      getStops(): readonly TimeStopRegion[] { return []; },
      linkCausality(childUid, parents) { linkCalls.push({ childUid, parents }); },
    };

    const col = new InflictionColumn(INFLICTION_COLUMNS.HEAT, host);
    col.add('enemy', 100, 1200, SOURCE, { uid: 'incoming-heat' });

    // Reaction dispatched to the reaction column
    expect(applyCalls.length).toBe(1);
    expect(applyCalls[0].options?.parents).toEqual(['incoming-heat', 'active-1', 'active-2']);
    // Primary parent = incoming (most recent); the consumed cross-element
    // inflictions follow.
    expect(applyCalls[0].options?.parents?.[0]).toBe('incoming-heat');
  });
});

describe('InflictionColumn — deque stacking', () => {
  it('evicts oldest when at max stacks (4)', () => {
    const host = makeHost();
    const col = new InflictionColumn(INFLICTION_COLUMNS.HEAT, host);
    for (let i = 0; i < 5; i++) {
      col.add('enemy', i * 10, 2400, SOURCE, { uid: `heat-${i}` });
    }
    // 5 added, but max is 4 — oldest should be consumed
    const active = host.activeEventsIn(INFLICTION_COLUMNS.HEAT, 'enemy', 40);
    expect(active.length).toBeLessThanOrEqual(4);
  });
});
