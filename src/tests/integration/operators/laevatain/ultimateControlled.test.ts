/**
 * @jest-environment jsdom
 */

/**
 * Laevatain Ultimate Controlled Activation — Integration Test
 *
 * Tests that Laevatain's ultimate (Twilight) requires the operator to be the
 * controlled operator. Exercises the activation clause through:
 * 1. Context menu availability (checkVariantAvailability)
 * 2. Placed event validation (validateVariantClauses)
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { SKILL_COLUMNS, OPERATOR_COLUMNS } from '../../../../model/channels';
import { CombatSkillType, ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../../../utils/timeline';
import { checkVariantAvailability, validateVariantClauses } from '../../../../controller/timeline/eventValidator';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_0 = 'slot-0'; // Laevatain
const SLOT_1 = 'slot-1'; // Akekuri

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function swapControlTo(app: ReturnType<typeof useApp>, slotId: string, atFrame: number) {
  act(() => {
    app.handleAddEvent(
      slotId, OPERATOR_COLUMNS.INPUT, atFrame,
      { id: CombatSkillType.CONTROL, name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - atFrame, name: 'Control' } }] },
    );
  });
}

describe('Laevatain ultimate controlled activation — integration through useApp', () => {
  describe('checkVariantAvailability (context menu)', () => {
    it('ultimate is available when Laevatain is the controlled operator (initial state)', () => {
      const { result } = renderHook(() => useApp());
      const r = checkVariantAvailability(
        'TWILIGHT', SLOT_0, [...result.current.allProcessedEvents], 5 * FPS,
        SKILL_COLUMNS.ULTIMATE, result.current.slots,
      );
      expect(r.disabled).toBe(false);
    });

    it('ultimate is disabled when another operator is controlled', () => {
      const { result } = renderHook(() => useApp());
      // Swap control to slot-1 at 3s
      swapControlTo(result.current, SLOT_1, 3 * FPS);

      const r = checkVariantAvailability(
        'TWILIGHT', SLOT_0, [...result.current.allProcessedEvents], 5 * FPS,
        SKILL_COLUMNS.ULTIMATE, result.current.slots,
      );
      expect(r.disabled).toBe(true);
      expect(r.reason).toMatch(/controlled/i);
    });

    it('ultimate is available before control swap but disabled after', () => {
      const { result } = renderHook(() => useApp());
      const swapFrame = 5 * FPS;
      swapControlTo(result.current, SLOT_1, swapFrame);

      // Before swap: Laevatain is controlled
      const before = checkVariantAvailability(
        'TWILIGHT', SLOT_0, [...result.current.allProcessedEvents], 3 * FPS,
        SKILL_COLUMNS.ULTIMATE, result.current.slots,
      );
      expect(before.disabled).toBe(false);

      // After swap: Laevatain is not controlled
      const after = checkVariantAvailability(
        'TWILIGHT', SLOT_0, [...result.current.allProcessedEvents], 7 * FPS,
        SKILL_COLUMNS.ULTIMATE, result.current.slots,
      );
      expect(after.disabled).toBe(true);
    });

    it('ultimate is available again after control swaps back', () => {
      const { result } = renderHook(() => useApp());
      // Swap to slot-1 at 3s, then back to slot-0 at 6s
      swapControlTo(result.current, SLOT_1, 3 * FPS);
      swapControlTo(result.current, SLOT_0, 6 * FPS);

      // During slot-1 control: disabled
      const during = checkVariantAvailability(
        'TWILIGHT', SLOT_0, [...result.current.allProcessedEvents], 4 * FPS,
        SKILL_COLUMNS.ULTIMATE, result.current.slots,
      );
      expect(during.disabled).toBe(true);

      // After swap back: available
      const after = checkVariantAvailability(
        'TWILIGHT', SLOT_0, [...result.current.allProcessedEvents], 8 * FPS,
        SKILL_COLUMNS.ULTIMATE, result.current.slots,
      );
      expect(after.disabled).toBe(false);
    });
  });

  describe('validateVariantClauses (placed event warnings)', () => {
    it('no warning when ultimate is placed while Laevatain is controlled', () => {
      const { result } = renderHook(() => useApp());
      const ultCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.ULTIMATE);

      act(() => {
        result.current.handleAddEvent(SLOT_0, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!);
      });

      const warnings = validateVariantClauses(
        [...result.current.allProcessedEvents], result.current.slots,
      );
      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === SKILL_COLUMNS.ULTIMATE,
      );
      expect(ultEvent).toBeDefined();
      expect(warnings.has(ultEvent!.uid)).toBe(false);
    });

    it('warning when ultimate is placed at a frame where Laevatain is not controlled', () => {
      const { result } = renderHook(() => useApp());
      // Swap control to slot-1 at 3s
      swapControlTo(result.current, SLOT_1, 3 * FPS);

      // Place ultimate in freeform mode (bypasses context menu check)
      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });
      const ultCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.ULTIMATE);
      act(() => {
        result.current.handleAddEvent(SLOT_0, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!);
      });

      const warnings = validateVariantClauses(
        [...result.current.allProcessedEvents], result.current.slots,
      );
      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === SKILL_COLUMNS.ULTIMATE,
      );
      expect(ultEvent).toBeDefined();
      expect(warnings.has(ultEvent!.uid)).toBe(true);
      expect(warnings.get(ultEvent!.uid)).toMatch(/controlled/i);
    });
  });
});
