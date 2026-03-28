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
    activeEventsIn(columnId: string, ownerId: string, frame: number) {
      return events.filter(ev =>
        ev.columnId === columnId &&
        ev.ownerId === ownerId &&
        ev.startFrame <= frame &&
        frame < ev.startFrame + (ev.segments?.[0]?.properties?.duration ?? 0),
      );
    },
    activeCount(columnId: string, ownerId: string, frame: number) {
      return this.activeEventsIn(columnId, ownerId, frame).length;
    },
    extendDuration(_start: number, raw: number) { return raw; },
    trackRawDuration() {},
    pushEvent(ev: TimelineEvent, rawDur: number) {
      ev.segments = [{ properties: { duration: rawDur } }];
      events.push(ev);
    },
    pushEventDirect(ev: TimelineEvent) { events.push(ev); },
    pushToOutput(ev: TimelineEvent) { events.push(ev); },
    applyToColumn() { return true; },
    consumeFromColumn() { return 0; },
    foreignStopsFor(): readonly TimeStopRegion[] { return []; },
    getStops(): readonly TimeStopRegion[] { return []; },
  };
}

const SOURCE: EventSource = { ownerId: 'op-1', skillName: 'TEST' };

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
