/**
 * Tests for statusViewController — stack-aware labels and visual truncations.
 *
 * Verifies:
 * - Multi-instance statuses (e.g. Melting Flame, instances=4) get roman numeral suffixes
 * - Single-instance statuses with RESET/NONE verb omit roman numerals
 * - Visual truncation of overlapping same-type events
 * - Single events are never overridden
 */

import { computeStatusViewOverrides } from '../../controller/timeline/eventPresentationController';
import { TimelineEvent, Column, MiniTimeline } from '../../consts/viewTypes';
import { TimelineSourceType } from '../../consts/enums';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const FPS = 120;

function statusEvent(uid: string, columnId: string, name: string, ownerId: string, startFrame: number, durationFrames: number): TimelineEvent {
  return {
    uid,
    id: name,
    name,
    ownerId,
    columnId,
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
  };
}

function statusColumn(ownerId: string, microColumnIds: string[]): Column {
  return {
    key: `${ownerId}-operator-status`,
    type: 'mini-timeline',
    source: TimelineSourceType.OPERATOR,
    ownerId,
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
    const col = statusColumn('slot1', ['melting-flame', 'MELTING_FLAME']);

    it('adds roman numeral suffixes to overlapping events', () => {
      const events = [
        statusEvent('mf1', 'melting-flame', 'MELTING_FLAME', 'slot1', 0, 10 * FPS),
        statusEvent('mf2', 'melting-flame', 'MELTING_FLAME', 'slot1', 2 * FPS, 10 * FPS),
        statusEvent('mf3', 'melting-flame', 'MELTING_FLAME', 'slot1', 4 * FPS, 10 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.get('mf1')?.label).toContain('I');
      expect(overrides.get('mf2')?.label).toContain('II');
      expect(overrides.get('mf3')?.label).toContain('III');
    });

    it('truncates earlier events where next starts', () => {
      const events = [
        statusEvent('mf1', 'melting-flame', 'MELTING_FLAME', 'slot1', 0, 10 * FPS),
        statusEvent('mf2', 'melting-flame', 'MELTING_FLAME', 'slot1', 3 * FPS, 10 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      // First event should be visually truncated to 3 seconds (where mf2 starts)
      expect(overrides.get('mf1')?.visualActivationDuration).toBe(3 * FPS);
      // Second event has no next, so no truncation
      expect(overrides.get('mf2')?.visualActivationDuration).toBeUndefined();
    });
  });

  describe('single-instance statuses with RESET (Scorching Heart)', () => {
    const col = statusColumn('slot1', ['scorching-heart-effect', 'SCORCHING_HEART_EFFECT']);

    it('omits roman numeral suffixes for overlapping events', () => {
      const events = [
        statusEvent('sh1', 'scorching-heart-effect', 'SCORCHING_HEART_EFFECT', 'slot1', 0, 20 * FPS),
        statusEvent('sh2', 'scorching-heart-effect', 'SCORCHING_HEART_EFFECT', 'slot1', 5 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      // Labels should NOT contain roman numerals
      const label1 = overrides.get('sh1')?.label ?? '';
      const label2 = overrides.get('sh2')?.label ?? '';
      expect(label1).not.toMatch(/\sI+$/);
      expect(label2).not.toMatch(/\sI+$/);
      // Both should have the same label (base name only)
      expect(label1).toBe(label2);
    });

    it('still truncates overlapping events visually', () => {
      const events = [
        statusEvent('sh1', 'scorching-heart-effect', 'SCORCHING_HEART_EFFECT', 'slot1', 0, 20 * FPS),
        statusEvent('sh2', 'scorching-heart-effect', 'SCORCHING_HEART_EFFECT', 'slot1', 5 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.get('sh1')?.visualActivationDuration).toBe(5 * FPS);
    });
  });

  describe('single-instance statuses with RESET (Focus)', () => {
    const col = statusColumn('slot2', ['focus', 'FOCUS']);

    it('omits roman numeral suffixes', () => {
      const events = [
        statusEvent('f1', 'focus', 'FOCUS', 'slot2', 0, 20 * FPS),
        statusEvent('f2', 'focus', 'FOCUS', 'slot2', 10 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      const label1 = overrides.get('f1')?.label ?? '';
      const label2 = overrides.get('f2')?.label ?? '';
      expect(label1).not.toMatch(/\sI+$/);
      expect(label1).toBe(label2);
    });
  });

  describe('single events are not overridden', () => {
    it('single stackable status event still gets roman numeral', () => {
      const col = statusColumn('slot1', ['melting-flame', 'MELTING_FLAME']);
      const events = [
        statusEvent('mf1', 'melting-flame', 'MELTING_FLAME', 'slot1', 0, 10 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.size).toBe(1);
      expect(overrides.get('mf1')?.label).toMatch(/I$/);
    });

    it('no overrides for a single RESET status event', () => {
      const col = statusColumn('slot1', ['scorching-heart-effect', 'SCORCHING_HEART_EFFECT']);
      const events = [
        statusEvent('sh1', 'scorching-heart-effect', 'SCORCHING_HEART_EFFECT', 'slot1', 0, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      expect(overrides.size).toBe(0);
    });
  });

  describe('non-overlapping multi-instance events still get numerals', () => {
    const col = statusColumn('slot1', ['melting-flame', 'MELTING_FLAME']);

    it('sequential non-overlapping events get position-based numerals', () => {
      const events = [
        statusEvent('mf1', 'melting-flame', 'MELTING_FLAME', 'slot1', 0, 2 * FPS),
        statusEvent('mf2', 'melting-flame', 'MELTING_FLAME', 'slot1', 5 * FPS, 2 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col]);

      // Both get "I" since they don't overlap (activeEarlier = 0 for both)
      expect(overrides.get('mf1')?.label).toContain('I');
      expect(overrides.get('mf2')?.label).toContain('I');
      // No truncation since they don't overlap
      expect(overrides.get('mf1')?.visualActivationDuration).toBeUndefined();
    });
  });

  describe('events from different owners are independent', () => {
    it('does not cross-contaminate between slots', () => {
      const col1 = statusColumn('slot1', ['melting-flame', 'MELTING_FLAME']);
      const col2 = statusColumn('slot2', ['focus', 'FOCUS']);
      const events = [
        statusEvent('mf1', 'melting-flame', 'MELTING_FLAME', 'slot1', 0, 10 * FPS),
        statusEvent('mf2', 'melting-flame', 'MELTING_FLAME', 'slot1', 2 * FPS, 10 * FPS),
        statusEvent('f1', 'focus', 'FOCUS', 'slot2', 0, 20 * FPS),
        statusEvent('f2', 'focus', 'FOCUS', 'slot2', 10 * FPS, 20 * FPS),
      ];
      const overrides = computeStatusViewOverrides(events, [col1, col2]);

      // Melting Flame: multi-instance → numerals
      expect(overrides.get('mf1')?.label).toContain('I');
      expect(overrides.get('mf2')?.label).toContain('II');
      // Focus: single-instance → no numerals
      const focusLabel = overrides.get('f1')?.label ?? '';
      expect(focusLabel).not.toMatch(/\sI+$/);
    });
  });
});
