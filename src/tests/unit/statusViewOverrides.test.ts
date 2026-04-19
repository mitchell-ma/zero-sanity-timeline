/**
 * Tests for statusViewController — stack-aware labels and visual truncations.
 *
 * Verifies:
 * - Multi-instance statuses (e.g. Melting Flame, instances=4) get arabic stack suffixes
 * - Single-instance statuses with RESET/NONE verb omit stack suffixes
 * - Visual truncation of overlapping same-type events
 * - Single events are never overridden
 *
 * Note: roman numerals are reserved for StatusLevel display (reactions);
 * stack-count suffixes use arabic digits.
 */

import { computeStatusViewOverrides } from '../../controller/timeline/eventPresentationController';
import { TimelineEvent, Column, MiniTimeline } from '../../consts/viewTypes';
import { TimelineSourceType } from '../../consts/enums';

/* eslint-disable @typescript-eslint/no-require-imports */
const MELTING_FLAME_ID: string = require('../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const SCORCHING_HEART_ID: string = require('../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json').properties.id;
const FOCUS_ID: string = require('../../model/game-data/operators/antal/statuses/status-focus.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const FPS = 120;

function statusEvent(uid: string, columnId: string, name: string, ownerEntityId: string, startFrame: number, durationFrames: number): TimelineEvent {
  return {
    uid,
    id: name,
    name,
    ownerEntityId,
    columnId,
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
  };
}

function statusColumn(ownerEntityId: string, microColumnIds: string[]): Column {
  return {
    key: `${ownerEntityId}-operator-status`,
    type: 'mini-timeline',
    source: TimelineSourceType.OPERATOR,
    ownerEntityId,
    columnId: 'operator-status',
    label: 'STATUS',
    color: '#fff',
    headerVariant: 'skill',
    derived: true,
    microColumns: microColumnIds.map((id) => ({ id, label: id, color: '#fff' })),
    microColumnAssignment: 'dynamic-split',
    matchColumnIds: microColumnIds,
  } as MiniTimeline;
}

describe('computeStatusViewOverrides', () => {
  describe('multi-instance statuses (Melting Flame, instances=4)', () => {
    const col = statusColumn('slot1', [MELTING_FLAME_ID]);

    it('adds arabic stack suffixes to overlapping events', () => {
      const events = [
        statusEvent('mf1', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 0, 10 * FPS),
        statusEvent('mf2', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 2 * FPS, 10 * FPS),
        statusEvent('mf3', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 4 * FPS, 10 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.get('mf1')?.label).toMatch(/\s1$/);
      expect(overrides.get('mf2')?.label).toMatch(/\s2$/);
      expect(overrides.get('mf3')?.label).toMatch(/\s3$/);
    });

    it('truncates earlier events where next starts', () => {
      const events = [
        statusEvent('mf1', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 0, 10 * FPS),
        statusEvent('mf2', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 3 * FPS, 10 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      // First event should be visually truncated to 3 seconds (where mf2 starts)
      expect(overrides.get('mf1')?.visualActivationDuration).toBe(3 * FPS);
      // Second event has no next, so no truncation
      expect(overrides.get('mf2')?.visualActivationDuration).toBeUndefined();
    });
  });

  describe('single-instance statuses with RESET (Scorching Heart)', () => {
    const col = statusColumn('slot1', [SCORCHING_HEART_ID]);

    it('omits stack suffixes for overlapping events', () => {
      const events = [
        statusEvent('sh1', SCORCHING_HEART_ID, SCORCHING_HEART_ID, 'slot1', 0, 20 * FPS),
        statusEvent('sh2', SCORCHING_HEART_ID, SCORCHING_HEART_ID, 'slot1', 5 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      // Labels should NOT contain stack-count suffixes
      const label1 = overrides.get('sh1')?.label ?? '';
      const label2 = overrides.get('sh2')?.label ?? '';
      expect(label1).not.toMatch(/\s\d+$/);
      expect(label2).not.toMatch(/\s\d+$/);
      // Both should have the same label (base name only)
      expect(label1).toBe(label2);
    });

    it('does not truncate single-instance overlapping events (independent rendering)', () => {
      const events = [
        statusEvent('sh1', SCORCHING_HEART_ID, SCORCHING_HEART_ID, 'slot1', 0, 20 * FPS),
        statusEvent('sh2', SCORCHING_HEART_ID, SCORCHING_HEART_ID, 'slot1', 5 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.get('sh1')?.visualActivationDuration).toBeUndefined();
    });
  });

  describe('single-instance statuses with RESET (Focus)', () => {
    const col = statusColumn('slot2', [FOCUS_ID]);

    it('omits stack suffixes', () => {
      const events = [
        statusEvent('f1', FOCUS_ID, FOCUS_ID, 'slot2', 0, 20 * FPS),
        statusEvent('f2', FOCUS_ID, FOCUS_ID, 'slot2', 10 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      const label1 = overrides.get('f1')?.label ?? '';
      const label2 = overrides.get('f2')?.label ?? '';
      expect(label1).not.toMatch(/\s\d+$/);
      expect(label1).toBe(label2);
    });
  });

  describe('single events are not overridden', () => {
    it('single stackable status event still gets a stack suffix', () => {
      const col = statusColumn('slot1', [MELTING_FLAME_ID]);
      const events = [
        statusEvent('mf1', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 0, 10 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.size).toBe(1);
      expect(overrides.get('mf1')?.label).toMatch(/\s1$/);
    });

    it('no overrides for a single RESET status event', () => {
      const col = statusColumn('slot1', [SCORCHING_HEART_ID]);
      const events = [
        statusEvent('sh1', SCORCHING_HEART_ID, SCORCHING_HEART_ID, 'slot1', 0, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.size).toBe(0);
    });
  });

  describe('non-overlapping multi-instance events still get numerals', () => {
    const col = statusColumn('slot1', [MELTING_FLAME_ID]);

    it('sequential non-overlapping events get position-based numerals', () => {
      const events = [
        statusEvent('mf1', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 0, 2 * FPS),
        statusEvent('mf2', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 5 * FPS, 2 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      // Both get "1" since they don't overlap (activeEarlier = 0 for both)
      expect(overrides.get('mf1')?.label).toMatch(/\s1$/);
      expect(overrides.get('mf2')?.label).toMatch(/\s1$/);
      // No truncation since they don't overlap
      expect(overrides.get('mf1')?.visualActivationDuration).toBeUndefined();
    });
  });

  describe('events from different owners are independent', () => {
    it('does not cross-contaminate between slots', () => {
      const col1 = statusColumn('slot1', [MELTING_FLAME_ID]);
      const col2 = statusColumn('slot2', [FOCUS_ID]);
      const events = [
        statusEvent('mf1', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 0, 10 * FPS),
        statusEvent('mf2', MELTING_FLAME_ID, MELTING_FLAME_ID, 'slot1', 2 * FPS, 10 * FPS),
        statusEvent('f1', FOCUS_ID, FOCUS_ID, 'slot2', 0, 20 * FPS),
        statusEvent('f2', FOCUS_ID, FOCUS_ID, 'slot2', 10 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col1, col2]);

      // Melting Flame: multi-instance → numerals
      expect(overrides.get('mf1')?.label).toMatch(/\s1$/);
      expect(overrides.get('mf2')?.label).toMatch(/\s2$/);
      // Focus: single-instance → no numerals
      const focusLabel = overrides.get('f1')?.label ?? '';
      expect(focusLabel).not.toMatch(/\s\d+$/);
    });
  });
});
