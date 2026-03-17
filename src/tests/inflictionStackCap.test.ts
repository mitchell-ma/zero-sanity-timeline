/**
 * Tests for infliction deque stacking (max 4 concurrent stacks per element).
 *
 * Deque semantics:
 * - New infliction arrives: all active stacks are refreshed (extended)
 * - At cap (4): oldest active stack is evicted (clamped), new stack enters as 4th
 * - Consumption: FIFO order (oldest first)
 */

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
import { applySameElementRefresh, applyPhysicalInflictionRefresh } from '../controller/timeline/processInfliction';
// eslint-disable-next-line import/first
import { TimelineEvent } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import { EventStatusType } from '../consts/enums';
// eslint-disable-next-line import/first
import { INFLICTION_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, ENEMY_OWNER_ID } from '../model/channels';

const FPS = 120;

/** Create a minimal infliction event on the enemy timeline. */
function infliction(
  id: string,
  columnId: string,
  startFrame: number,
  durationFrames = 20 * FPS,
): TimelineEvent {
  return {
    id,
    name: columnId,
    ownerId: ENEMY_OWNER_ID,
    columnId,
    startFrame,
    activationDuration: durationFrames,
    activeDuration: 0,
    cooldownDuration: 0,
    sourceOwnerId: 'slot-0',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Arts infliction deque
// ═══════════════════════════════════════════════════════════════════════════════

describe('applySameElementRefresh — deque stacking', () => {
  const COL = INFLICTION_COLUMNS.HEAT;

  test('4 concurrent stacks are all kept', () => {
    const events = [
      infliction('h1', COL, 0),
      infliction('h2', COL, FPS),
      infliction('h3', COL, 2 * FPS),
      infliction('h4', COL, 3 * FPS),
    ];
    const result = applySameElementRefresh(events);
    const col = result.filter(ev => ev.columnId === COL);
    expect(col).toHaveLength(4);
  });

  test('5th stack evicts oldest — new stack is kept, oldest is clamped', () => {
    const events = [
      infliction('h1', COL, 0),
      infliction('h2', COL, FPS),
      infliction('h3', COL, 2 * FPS),
      infliction('h4', COL, 3 * FPS),
      infliction('h5', COL, 4 * FPS),
    ];
    const result = applySameElementRefresh(events);
    const col = result.filter(ev => ev.columnId === COL);
    // All 5 events remain — oldest is clamped, not removed
    expect(col).toHaveLength(5);
    // h5 (newest) is kept with full duration
    const h5 = col.find(ev => ev.id === 'h5')!;
    expect(h5.activationDuration).toBe(20 * FPS);
    // h1 (oldest) is evicted: clamped at h5's start frame
    const h1 = col.find(ev => ev.id === 'h1')!;
    expect(h1.activationDuration).toBe(4 * FPS);
    expect(h1.eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('5th stack refreshes remaining active durations', () => {
    const dur = 10 * FPS;
    const events = [
      infliction('h1', COL, 0, dur),
      infliction('h2', COL, FPS, dur),
      infliction('h3', COL, 2 * FPS, dur),
      infliction('h4', COL, 3 * FPS, dur),
      infliction('h5', COL, 9 * FPS, dur), // arrives at 9s, all 4 active
    ];
    const result = applySameElementRefresh(events);
    // h1 evicted at 9s. h2/h3/h4 refreshed to h5's end (19s)
    const h1 = result.find(ev => ev.id === 'h1')!;
    expect(h1.activationDuration).toBe(9 * FPS); // clamped at h5's start
    expect(h1.eventStatus).toBe(EventStatusType.CONSUMED);
    const h2 = result.find(ev => ev.id === 'h2')!;
    expect(h2.activationDuration).toBeGreaterThanOrEqual(19 * FPS - FPS); // extended to ~19s from start at 1s
  });

  test('6th and 7th stacks evict in FIFO order', () => {
    const events = [
      infliction('h1', COL, 0),
      infliction('h2', COL, FPS),
      infliction('h3', COL, 2 * FPS),
      infliction('h4', COL, 3 * FPS),
      infliction('h5', COL, 4 * FPS),  // evicts h1
      infliction('h6', COL, 5 * FPS),  // evicts h2
      infliction('h7', COL, 6 * FPS),  // evicts h3
    ];
    const result = applySameElementRefresh(events);
    // h1 evicted at 4s, h2 evicted at 5s, h3 evicted at 6s
    const h1 = result.find(ev => ev.id === 'h1')!;
    expect(h1.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(h1.activationDuration).toBe(4 * FPS);
    const h2 = result.find(ev => ev.id === 'h2')!;
    expect(h2.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(h2.activationDuration).toBe(4 * FPS); // from 1s to 5s
    const h3 = result.find(ev => ev.id === 'h3')!;
    expect(h3.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(h3.activationDuration).toBe(4 * FPS); // from 2s to 6s
    // h4, h5, h6, h7 are the active 4 at the end
    const h7 = result.find(ev => ev.id === 'h7')!;
    expect(h7.eventStatus).toBeUndefined();
  });

  test('new stack after one expires is kept (not capped)', () => {
    const dur = 2 * FPS;
    const events = [
      infliction('h1', COL, 0, dur),
      infliction('h2', COL, 10, dur),
      infliction('h3', COL, 20, dur),
      infliction('h4', COL, 30, dur),
      infliction('h5', COL, 3 * FPS, dur), // 3s — all 4 expired by ~2.25s
    ];
    const result = applySameElementRefresh(events);
    const col = result.filter(ev => ev.columnId === COL);
    expect(col).toHaveLength(5);
    // No evictions — h5 starts after all expire
    const h5 = col.find(ev => ev.id === 'h5')!;
    expect(h5.activationDuration).toBe(dur);
  });

  test('after 3 stacks expire, next infliction is only 1 active stack', () => {
    const shortDur = 2 * FPS;
    const events = [
      infliction('h1', COL, 0, shortDur),
      infliction('h2', COL, 10, shortDur),
      infliction('h3', COL, 20, shortDur),
      infliction('h4', COL, 5 * FPS, shortDur),
    ];
    const result = applySameElementRefresh(events);
    expect(result).toHaveLength(4);
    const h4 = result.find(ev => ev.id === 'h4')!;
    expect(h4.activationDuration).toBe(shortDur);
    // No evictions
    expect(result.every(ev => ev.eventStatus !== EventStatusType.CONSUMED)).toBe(true);
  });

  test('expired stacks do not extend to reach a later non-overlapping stack', () => {
    const shortDur = 2 * FPS;
    const events = [
      infliction('h1', COL, 0, shortDur),
      infliction('h2', COL, 10, shortDur),
      infliction('h3', COL, 20, shortDur),
      infliction('h4', COL, 5 * FPS, shortDur),
    ];
    const result = applySameElementRefresh(events);
    const h3 = result.find(ev => ev.id === 'h3')!;
    expect(h3.activationDuration).toBe(shortDur);
    expect(result.find(ev => ev.id === 'h1')!.startFrame + result.find(ev => ev.id === 'h1')!.activationDuration).toBeLessThanOrEqual(260);
  });

  test('cap resets after stacks expire — can accumulate 4 new stacks', () => {
    const shortDur = 2 * FPS;
    const longDur = 20 * FPS;
    const events = [
      infliction('a1', COL, 0, shortDur),
      infliction('a2', COL, 10, shortDur),
      infliction('a3', COL, 20, shortDur),
      infliction('a4', COL, 30, shortDur),
      infliction('b1', COL, 5 * FPS, longDur),
      infliction('b2', COL, 5 * FPS + 10, longDur),
      infliction('b3', COL, 5 * FPS + 20, longDur),
      infliction('b4', COL, 5 * FPS + 30, longDur),
    ];
    const result = applySameElementRefresh(events);
    // All 8 kept — no evictions needed (first batch expired before second)
    expect(result.filter(ev => ev.columnId === COL)).toHaveLength(8);
    expect(result.filter(ev => ev.eventStatus === EventStatusType.CONSUMED)).toHaveLength(0);
  });

  test('non-infliction events pass through unchanged', () => {
    const other: TimelineEvent = {
      id: 'other',
      name: 'someSkill',
      ownerId: 'slot-0',
      columnId: 'someColumn',
      startFrame: 0,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
    };
    const events = [
      other,
      infliction('h1', COL, 0),
      infliction('h2', COL, FPS),
      infliction('h3', COL, 2 * FPS),
      infliction('h4', COL, 3 * FPS),
      infliction('h5', COL, 4 * FPS),
    ];
    const result = applySameElementRefresh(events);
    expect(result.find(ev => ev.id === 'other')).toBeDefined();
    const otherResult = result.find(ev => ev.id === 'other')!;
    expect(otherResult.activationDuration).toBe(600);
  });

  test('different elements are capped independently', () => {
    const COL2 = INFLICTION_COLUMNS.CRYO;
    const events = [
      infliction('h1', COL, 0),
      infliction('h2', COL, FPS),
      infliction('h3', COL, 2 * FPS),
      infliction('h4', COL, 3 * FPS),
      infliction('h5', COL, 4 * FPS),
      infliction('c1', COL2, 0),
      infliction('c2', COL2, FPS),
      infliction('c3', COL2, 2 * FPS),
      infliction('c4', COL2, 3 * FPS),
      infliction('c5', COL2, 4 * FPS),
    ];
    const result = applySameElementRefresh(events);
    // h1 and c1 evicted; all others kept
    const heat = result.filter(ev => ev.columnId === COL);
    const cryo = result.filter(ev => ev.columnId === COL2);
    expect(heat).toHaveLength(5);
    expect(cryo).toHaveLength(5);
    expect(heat.find(ev => ev.id === 'h1')!.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(cryo.find(ev => ev.id === 'c1')!.eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('events inserted out of chronological order are processed by startFrame', () => {
    // Deliberately scramble insertion order — result should be identical
    // to chronological insertion
    const events = [
      infliction('h4', COL, 3 * FPS),
      infliction('h1', COL, 0),
      infliction('h5', COL, 4 * FPS),
      infliction('h3', COL, 2 * FPS),
      infliction('h2', COL, FPS),
    ];
    const result = applySameElementRefresh(events);
    // h1 is chronologically oldest → evicted when h5 arrives
    const h1 = result.find(ev => ev.id === 'h1')!;
    expect(h1.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(h1.activationDuration).toBe(4 * FPS);
    // h5 (newest) survives
    const h5 = result.find(ev => ev.id === 'h5')!;
    expect(h5.activationDuration).toBe(20 * FPS);
    // h2-h4 are the other 3 active stacks (not evicted)
    for (const id of ['h2', 'h3', 'h4']) {
      expect(result.find(ev => ev.id === id)!.eventStatus).not.toBe(EventStatusType.CONSUMED);
    }
  });

  test('at max stacks, newest always survives', () => {
    // Rapid fire: 8 stacks in quick succession
    const dur = 20 * FPS;
    const events = Array.from({ length: 8 }, (_, i) =>
      infliction(`h${i + 1}`, COL, i * 30, dur), // every 0.25s
    );
    const result = applySameElementRefresh(events);
    const col = result.filter(ev => ev.columnId === COL);
    // All 8 present (evicted ones are clamped, not removed)
    expect(col).toHaveLength(8);
    // Last 4 (h5-h8) should be active (not consumed)
    for (let i = 5; i <= 8; i++) {
      const ev = col.find(e => e.id === `h${i}`)!;
      expect(ev.eventStatus).not.toBe(EventStatusType.CONSUMED);
    }
    // First 4 (h1-h4) should be evicted
    for (let i = 1; i <= 4; i++) {
      const ev = col.find(e => e.id === `h${i}`)!;
      expect(ev.eventStatus).toBe(EventStatusType.CONSUMED);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Physical infliction (Vulnerable) deque
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyPhysicalInflictionRefresh — deque stacking', () => {
  const COL = PHYSICAL_INFLICTION_COLUMNS.VULNERABLE;

  test('4 concurrent vulnerable stacks are kept', () => {
    const events = [
      infliction('v1', COL, 0),
      infliction('v2', COL, FPS),
      infliction('v3', COL, 2 * FPS),
      infliction('v4', COL, 3 * FPS),
    ];
    const result = applyPhysicalInflictionRefresh(events);
    expect(result.filter(ev => ev.columnId === COL)).toHaveLength(4);
  });

  test('5th vulnerable stack evicts oldest and refreshes remaining', () => {
    const dur = 10 * FPS;
    const events = [
      infliction('v1', COL, 0, dur),
      infliction('v2', COL, FPS, dur),
      infliction('v3', COL, 2 * FPS, dur),
      infliction('v4', COL, 3 * FPS, dur),
      infliction('v5', COL, 9 * FPS, dur),
    ];
    const result = applyPhysicalInflictionRefresh(events);
    // v1 evicted at 9s, v5 kept
    const v1 = result.find(ev => ev.id === 'v1')!;
    expect(v1.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(v1.activationDuration).toBe(9 * FPS);
    const v5 = result.find(ev => ev.id === 'v5')!;
    expect(v5.activationDuration).toBe(dur);
    // v2 refreshed to v5's end (19s)
    const v2 = result.find(ev => ev.id === 'v2')!;
    expect(v2.activationDuration).toBeGreaterThanOrEqual(19 * FPS - FPS);
  });
});
