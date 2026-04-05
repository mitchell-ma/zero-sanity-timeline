/**
 * @jest-environment jsdom
 */

/**
 * Controlled Operator — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Initial state seeds CONTROL for the first operator
 * 2. User sets controlled operator via context menu ("Set as Controlled Operator")
 * 3. Verify processedEvents show correct clamping
 * 4. Verify DEC validation (isControlledAt) for context menu enablement
 * 5. Verify computeTimelinePresentation reflects control events in INPUT column
 *
 * Verification layers:
 *   Context menu: enabled/disabled state of "Set as Controlled Operator" item
 *   Controller: allProcessedEvents clamping, isControlledAt validation
 *   View: computeTimelinePresentation ColumnViewModel for INPUT column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType } from '../../../consts/enums';
import { OPERATOR_COLUMNS } from '../../../model/channels';
import { eventDuration } from '../../../consts/viewTypes';
import type { MiniTimeline, ContextMenuItem } from '../../../consts/viewTypes';
import { FPS, TOTAL_FRAMES } from '../../../utils/timeline';
import { getLastController } from '../../../controller/timeline/eventQueueController';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { buildContextMenu } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

const SLOT_0 = 'slot-0';
const SLOT_1 = 'slot-1';
const SLOT_2 = 'slot-2';

const CONTROL_LABEL = 'Set as Controlled Operator';

function getControlEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.id === NounType.CONTROL && ev.columnId === OPERATOR_COLUMNS.INPUT,
  );
}

/** Find any operator-owned column for a slot to use as a context menu target. */
function findAnyOperatorColumn(app: AppResult, slotId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === NounType.BASIC_ATTACK,
  );
}

/** Build context menu for a slot's column and find the "Set as Controlled Operator" item. */
function findControlMenuItem(app: AppResult, slotId: string, atFrame: number): ContextMenuItem | undefined {
  const col = findAnyOperatorColumn(app, slotId);
  if (!col) throw new Error(`No column found for ${slotId}`);
  const items = buildContextMenu(app, col, atFrame);
  if (!items) throw new Error(`Context menu returned null for ${slotId} at frame ${atFrame}`);
  return items.find(i => i.label === CONTROL_LABEL);
}

/** Extract the addEvent payload from the control menu item, asserting it exists and is enabled. */
function getControlPayload(app: AppResult, slotId: string, atFrame: number): AddEventPayload {
  const item = findControlMenuItem(app, slotId, atFrame);
  if (!item) throw new Error(`"${CONTROL_LABEL}" item not found for ${slotId} at frame ${atFrame}`);
  if (item.disabled) throw new Error(`"${CONTROL_LABEL}" item is disabled for ${slotId}: ${item.disabledReason}`);
  return item.actionPayload as AddEventPayload;
}

/** Get control events from the INPUT column's ColumnViewModel (view layer). */
function getControlEventsFromVM(app: AppResult) {
  const vms = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  const controlEvents = [];
  for (const [, vm] of Array.from(vms.entries())) {
    for (const ev of vm.events) {
      if (ev.id === NounType.CONTROL && ev.columnId === OPERATOR_COLUMNS.INPUT) {
        controlEvents.push(ev);
      }
    }
  }
  return controlEvents;
}

beforeEach(() => {
  localStorage.clear();
});

describe('Controlled Operator — integration through useApp', () => {
  it('seeds initial CONTROL for slot-0 on app load', () => {
    const { result } = renderHook(() => useApp());

    // Controller layer: verify seeded control event
    const controls = getControlEvents(result.current);
    expect(controls).toHaveLength(1);
    expect(controls[0].ownerId).toBe(SLOT_0);
    expect(controls[0].startFrame).toBe(0);
    expect(eventDuration(controls[0])).toBe(TOTAL_FRAMES);

    // Context menu layer: slot-0 is already controlled at frame 0
    const slot0Item = findControlMenuItem(result.current, SLOT_0, 0);
    expect(slot0Item).toBeDefined();
    expect(slot0Item!.disabled).toBe(true);

    // Context menu layer: slot-1 is NOT controlled, so the item should be enabled
    const slot1Item = findControlMenuItem(result.current, SLOT_1, 0);
    expect(slot1Item).toBeDefined();
    expect(slot1Item!.disabled).toBeFalsy();

    // View layer: verify INPUT column ViewModel contains the control event
    const vmControls = getControlEventsFromVM(result.current);
    expect(vmControls).toHaveLength(1);
    expect(vmControls[0].ownerId).toBe(SLOT_0);
  });

  it('user sets controlled operator on slot-1 at 5s — clamps slot-0', () => {
    const { result } = renderHook(() => useApp());
    const swapFrame = 5 * FPS;

    // Context menu layer: verify item is enabled before using it
    const payload = getControlPayload(result.current, SLOT_1, swapFrame);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: verify clamping
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

    // Context menu layer: slot-1 now disabled at swapFrame (already controlled)
    const slot1ItemAfter = findControlMenuItem(result.current, SLOT_1, swapFrame);
    expect(slot1ItemAfter).toBeDefined();
    expect(slot1ItemAfter!.disabled).toBe(true);

    // Context menu layer: slot-0 still disabled at frame 0 (still controlled there)
    const slot0ItemBefore = findControlMenuItem(result.current, SLOT_0, 0);
    expect(slot0ItemBefore).toBeDefined();
    expect(slot0ItemBefore!.disabled).toBe(true);

    // View layer: ColumnViewModel shows both control events
    const vmControls = getControlEventsFromVM(result.current);
    expect(vmControls).toHaveLength(2);
    expect(vmControls.find(ev => ev.ownerId === SLOT_0)).toBeDefined();
    expect(vmControls.find(ev => ev.ownerId === SLOT_1)).toBeDefined();
  });

  it('user adds slot-1 at 5s then slot-2 at 2.5s — all 3 clamped correctly', () => {
    const { result } = renderHook(() => useApp());
    const swapSlot1 = 5 * FPS;
    const swapSlot2 = Math.round(2.5 * FPS);

    // Context menu flow: set slot-1 at 5s
    const payload1 = getControlPayload(result.current, SLOT_1, swapSlot1);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Context menu flow: set slot-2 at 2.5s
    const payload2 = getControlPayload(result.current, SLOT_2, swapSlot2);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    // Controller layer: verify 3-way clamping
    const controls = getControlEvents(result.current);
    expect(controls).toHaveLength(3);

    const slot0 = controls.find((ev) => ev.ownerId === SLOT_0)!;
    const slot1 = controls.find((ev) => ev.ownerId === SLOT_1)!;
    const slot2 = controls.find((ev) => ev.ownerId === SLOT_2)!;

    expect(slot0).toBeDefined();
    expect(slot1).toBeDefined();
    expect(slot2).toBeDefined();

    // Slot-0: 0 → 2.5s (clamped by slot-2)
    expect(slot0.startFrame).toBe(0);
    expect(eventDuration(slot0)).toBe(swapSlot2);

    // Slot-2: 2.5s → 5s (clamped by slot-1)
    expect(slot2.startFrame).toBe(swapSlot2);
    expect(eventDuration(slot2)).toBe(swapSlot1 - swapSlot2);

    // Slot-1: 5s → end
    expect(slot1.startFrame).toBe(swapSlot1);
    expect(eventDuration(slot1)).toBe(TOTAL_FRAMES - swapSlot1);

    // View layer: all 3 events in ColumnViewModel
    const vmControls = getControlEventsFromVM(result.current);
    expect(vmControls).toHaveLength(3);
  });

  it('isControlledAt validation reflects current state', () => {
    const { result } = renderHook(() => useApp());
    const swapFrame = 5 * FPS;

    // Context menu flow: set slot-1 at 5s
    const payload = getControlPayload(result.current, SLOT_1, swapFrame);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: isControlledAt reflects the swap
    const dec = getLastController();

    // Before swap: slot-0 controlled
    expect(dec.isControlledAt(SLOT_0, 0)).toBe(true);
    expect(dec.isControlledAt(SLOT_1, 0)).toBe(false);

    // After swap: slot-1 controlled
    expect(dec.isControlledAt(SLOT_0, swapFrame)).toBe(false);
    expect(dec.isControlledAt(SLOT_1, swapFrame)).toBe(true);

    // Context menu layer: disabled states match isControlledAt
    const slot0AtStart = findControlMenuItem(result.current, SLOT_0, 0);
    expect(slot0AtStart!.disabled).toBe(true);

    const slot1AtStart = findControlMenuItem(result.current, SLOT_1, 0);
    expect(slot1AtStart!.disabled).toBeFalsy();

    const slot0AfterSwap = findControlMenuItem(result.current, SLOT_0, swapFrame);
    expect(slot0AfterSwap!.disabled).toBeFalsy();

    const slot1AfterSwap = findControlMenuItem(result.current, SLOT_1, swapFrame);
    expect(slot1AfterSwap!.disabled).toBe(true);
  });
});
