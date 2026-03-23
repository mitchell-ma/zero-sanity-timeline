/**
 * @jest-environment jsdom
 */

/**
 * Controlled Operator — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Initial state seeds CONTROL for the first operator
 * 2. User adds CONTROL events via handleAddEvent (same path as right-click → "Set as Controlled Operator")
 * 3. Verify processedEvents show correct clamping
 * 4. Verify DEC validation (isControlledAt) for context menu enablement
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { CombatSkillType } from '../../consts/enums';
import { OPERATOR_COLUMNS } from '../../model/channels';
import { eventDuration } from '../../consts/viewTypes';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getLastController } from '../../controller/timeline/eventQueueController';

const SLOT_0 = 'slot-0';
const SLOT_1 = 'slot-1';
const SLOT_2 = 'slot-2';

function getControlEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.id === CombatSkillType.CONTROL && ev.columnId === OPERATOR_COLUMNS.INPUT,
  );
}

describe('Controlled Operator — integration through useApp', () => {
  it('seeds initial CONTROL for slot-0 on app load', () => {
    const { result } = renderHook(() => useApp());

    const controls = getControlEvents(result.current);
    expect(controls).toHaveLength(1);
    expect(controls[0].ownerId).toBe(SLOT_0);
    expect(controls[0].startFrame).toBe(0);
    expect(eventDuration(controls[0])).toBe(TOTAL_FRAMES);
  });

  it('user sets controlled operator on slot-1 at 5s — clamps slot-0', () => {
    const { result } = renderHook(() => useApp());
    const swapFrame = 5 * FPS;

    act(() => {
      result.current.handleAddEvent(
        SLOT_1, OPERATOR_COLUMNS.INPUT, swapFrame,
        { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - swapFrame, name: 'Control' } }] },
      );
    });

    const controls = getControlEvents(result.current);
    expect(controls).toHaveLength(2);

    const slot0 = controls.find((ev) => ev.ownerId === SLOT_0)!;
    const slot1 = controls.find((ev) => ev.ownerId === SLOT_1)!;

    expect(slot0).toBeDefined();
    expect(slot1).toBeDefined();

    // Slot-0 clamped at 5s
    expect(slot0.startFrame).toBe(0);
    expect(eventDuration(slot0)).toBe(swapFrame);

    // Slot-1 from 5s to end
    expect(slot1.startFrame).toBe(swapFrame);
    expect(eventDuration(slot1)).toBe(TOTAL_FRAMES - swapFrame);
  });

  it('user adds Akekuri at 5s then Antal at 2.5s — all 3 clamped correctly', () => {
    const { result } = renderHook(() => useApp());
    const swapAkekuri = 5 * FPS;
    const swapAntal = Math.round(2.5 * FPS);

    // User places Akekuri first, then Antal — non-chronological placement order
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, OPERATOR_COLUMNS.INPUT, swapAkekuri,
        { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - swapAkekuri, name: 'Control' } }] },
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_2, OPERATOR_COLUMNS.INPUT, swapAntal,
        { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - swapAntal, name: 'Control' } }] },
      );
    });

    const controls = getControlEvents(result.current);
    expect(controls).toHaveLength(3);

    const slot0 = controls.find((ev) => ev.ownerId === SLOT_0)!;
    const slot1 = controls.find((ev) => ev.ownerId === SLOT_1)!;
    const slot2 = controls.find((ev) => ev.ownerId === SLOT_2)!;

    expect(slot0).toBeDefined();
    expect(slot1).toBeDefined();
    expect(slot2).toBeDefined();

    // Slot-0: 0 → 2.5s (clamped by Antal)
    expect(slot0.startFrame).toBe(0);
    expect(eventDuration(slot0)).toBe(swapAntal);

    // Slot-2 (Antal): 2.5s → 5s (clamped by Akekuri)
    expect(slot2.startFrame).toBe(swapAntal);
    expect(eventDuration(slot2)).toBe(swapAkekuri - swapAntal);

    // Slot-1 (Akekuri): 5s → end
    expect(slot1.startFrame).toBe(swapAkekuri);
    expect(eventDuration(slot1)).toBe(TOTAL_FRAMES - swapAkekuri);
  });

  it('isControlledAt validation reflects current state', () => {
    const { result } = renderHook(() => useApp());
    const swapFrame = 5 * FPS;

    act(() => {
      result.current.handleAddEvent(
        SLOT_1, OPERATOR_COLUMNS.INPUT, swapFrame,
        { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - swapFrame, name: 'Control' } }] },
      );
    });

    const dec = getLastController();

    // Before swap: slot-0 controlled
    expect(dec.isControlledAt(SLOT_0, 0)).toBe(true);
    expect(dec.isControlledAt(SLOT_1, 0)).toBe(false);

    // After swap: slot-1 controlled
    expect(dec.isControlledAt(SLOT_0, swapFrame)).toBe(false);
    expect(dec.isControlledAt(SLOT_1, swapFrame)).toBe(true);
  });
});
