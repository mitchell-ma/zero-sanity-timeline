/**
 * @jest-environment jsdom
 */

/**
 * Control status × time-stop — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Control events are NOT extended by time-stops (duration stays raw)
 * 2. Control swap placed during time-stop gets a validation warning
 * 3. Control events can be dragged freely through ultimate animation zones
 * 4. Control events can be dragged past dodge events (no overlap clamping)
 *
 * Verification layers:
 *   Context menu: "Set as Controlled Operator" flow, skill variant availability
 *   Controller: allProcessedEvents clamping, time-stop extension immunity
 *   View: computeTimelinePresentation ColumnViewModel for INPUT column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { OPERATOR_COLUMNS } from '../../../model/channels';
import { eventDuration, getAnimationDuration } from '../../../consts/viewTypes';
import type { MiniTimeline, ContextMenuItem } from '../../../consts/viewTypes';
import { FPS, TOTAL_FRAMES } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

const SLOT_0 = 'slot-0';
const SLOT_1 = 'slot-1';

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
      c.ownerEntityId === slotId &&
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

describe('Control status × time-stop — integration through useApp', () => {
  describe('control events are NOT extended by time-stops', () => {
    it('control event duration unchanged when combo time-stop overlaps', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      // Context menu layer: place combo via context menu flow
      const comboCol = findColumn(result.current, SLOT_0, NounType.COMBO);
      expect(comboCol).toBeDefined();

      const comboPayload = getMenuPayload(result.current, comboCol!, 0);
      act(() => {
        result.current.handleAddEvent(comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill);
      });

      // Verify combo has animation duration (i.e. creates a time-stop)
      const comboEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerEntityId === SLOT_0 && ev.columnId === NounType.COMBO,
      )!;
      const animDur = getAnimationDuration(comboEvent);
      expect(animDur).toBeGreaterThan(0);

      // Context menu layer: set slot-1 as controlled operator at frame 0
      const controlPayload = getControlPayload(result.current, SLOT_1, 0);
      act(() => {
        result.current.handleAddEvent(
          controlPayload.ownerEntityId, controlPayload.columnId, controlPayload.atFrame, controlPayload.defaultSkill,
        );
      });

      // Controller layer: slot-1 control event should NOT be extended by the combo time-stop
      const slot1Control = getControlEvents(result.current).find(
        (ev) => ev.ownerEntityId === SLOT_1,
      )!;
      expect(slot1Control).toBeDefined();
      expect(eventDuration(slot1Control)).toBe(TOTAL_FRAMES);

      // View layer: verify control events in ColumnViewModel
      const vmControls = getControlEventsFromVM(result.current);
      const vmSlot1 = vmControls.find(ev => ev.ownerEntityId === SLOT_1);
      expect(vmSlot1).toBeDefined();
      expect(eventDuration(vmSlot1!)).toBe(TOTAL_FRAMES);
    });

    it('control event duration unchanged when ultimate time-stop overlaps', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const ultCol = findColumn(result.current, SLOT_0, NounType.ULTIMATE);
      if (!ultCol?.defaultEvent) return; // skip if no ultimate column

      // Context menu layer: place ultimate via context menu flow at 2s
      const ultFrame = 2 * FPS;
      const ultPayload = getMenuPayload(result.current, ultCol, ultFrame);
      act(() => {
        result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
      });

      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerEntityId === SLOT_0 && ev.columnId === NounType.ULTIMATE,
      )!;
      const ultAnim = getAnimationDuration(ultEvent);
      expect(ultAnim).toBeGreaterThan(0);

      // Context menu layer: set slot-1 as controlled operator at 1s (before ult, but overlaps ult time-stop)
      const swapFrame = 1 * FPS;
      const controlPayload = getControlPayload(result.current, SLOT_1, swapFrame);
      act(() => {
        result.current.handleAddEvent(
          controlPayload.ownerEntityId, controlPayload.columnId, controlPayload.atFrame, controlPayload.defaultSkill,
        );
      });

      // Controller layer: control event should NOT be extended
      const rawDuration = TOTAL_FRAMES - swapFrame;
      const slot1Control = getControlEvents(result.current).find(
        (ev) => ev.ownerEntityId === SLOT_1,
      )!;
      expect(slot1Control).toBeDefined();
      expect(eventDuration(slot1Control)).toBe(rawDuration);
    });
  });

  describe('control swap during time-stop gets warning', () => {
    it('warns when control swap placed during combo time-stop', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      // Context menu layer: place combo via context menu flow
      const comboCol = findColumn(result.current, SLOT_0, NounType.COMBO);
      expect(comboCol).toBeDefined();

      const comboPayload = getMenuPayload(result.current, comboCol!, 0);
      act(() => {
        result.current.handleAddEvent(comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill);
      });

      const comboEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerEntityId === SLOT_0 && ev.columnId === NounType.COMBO,
      )!;
      const animDur = getAnimationDuration(comboEvent);
      expect(animDur).toBeGreaterThan(0);

      // Context menu layer: verify the control item is disabled during time-stop
      const swapFrame = Math.floor(animDur / 2);
      expect(swapFrame).toBeGreaterThan(0);

      const controlItem = findControlMenuItem(result.current, SLOT_1, swapFrame);
      expect(controlItem).toBeDefined();
      expect(controlItem!.disabled).toBe(true);
      expect(controlItem!.disabledReason).toMatch(/time-stop/i);

      // In freeform mode, the user can still place the event using the disabled item's payload
      const controlPayload = controlItem!.actionPayload as AddEventPayload;
      act(() => {
        result.current.handleAddEvent(
          controlPayload.ownerEntityId, controlPayload.columnId, swapFrame, controlPayload.defaultSkill,
        );
      });

      // Controller layer: the control event should have a time-stop warning
      const slot1Control = result.current.allProcessedEvents.find(
        (ev) => ev.id === NounType.CONTROL && ev.ownerEntityId === SLOT_1,
      )!;
      expect(slot1Control).toBeDefined();
      expect(slot1Control.warnings).toBeDefined();
      expect(slot1Control.warnings!.some((w) => w.includes('Control swap'))).toBe(true);
    });
  });

  describe('control events drag freely past time-stop regions', () => {
    it('control event can be moved into ultimate animation zone', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const ultCol = findColumn(result.current, SLOT_0, NounType.ULTIMATE);
      if (!ultCol?.defaultEvent) return;

      // Context menu layer: place ultimate via context menu flow at 3s
      const ultFrame = 3 * FPS;
      const ultPayload = getMenuPayload(result.current, ultCol, ultFrame);
      act(() => {
        result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
      });

      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerEntityId === SLOT_0 && ev.columnId === NounType.ULTIMATE,
      )!;
      const ultAnim = getAnimationDuration(ultEvent);
      expect(ultAnim).toBeGreaterThan(0);

      // Context menu layer: set slot-1 as controlled operator at 1s (before the ult)
      const initialFrame = 1 * FPS;
      const controlPayload = getControlPayload(result.current, SLOT_1, initialFrame);
      act(() => {
        result.current.handleAddEvent(
          controlPayload.ownerEntityId, controlPayload.columnId, controlPayload.atFrame, controlPayload.defaultSkill,
        );
      });

      // Find the raw control event uid
      const slot1Control = result.current.allProcessedEvents.find(
        (ev) => ev.id === NounType.CONTROL && ev.ownerEntityId === SLOT_1
          && !ev.uid.startsWith('controlled-seed-'),
      )!;
      expect(slot1Control).toBeDefined();
      expect(slot1Control.startFrame).toBe(initialFrame);

      // Move control event INTO the ultimate animation zone
      const targetFrame = ultFrame + Math.floor(ultAnim / 2);
      const delta = targetFrame - initialFrame;
      act(() => {
        result.current.handleMoveEvents([slot1Control.uid], delta);
      });

      // Controller layer: control event should be at the target frame (not clamped away)
      const movedControl = result.current.allProcessedEvents.find(
        (ev) => ev.uid === slot1Control.uid,
      )!;
      expect(movedControl).toBeDefined();
      expect(movedControl.startFrame).toBe(targetFrame);
    });

    it('control event can be moved past dodge event on same column', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const inputCol = findColumn(result.current, SLOT_1, OPERATOR_COLUMNS.INPUT);
      expect(inputCol).toBeDefined();

      // Context menu layer: place a dodge on slot-1's input column at 3s via context menu
      const dodgeFrame = 3 * FPS;
      const dodgePayload = getMenuPayload(result.current, inputCol!, dodgeFrame, 'Dodge');
      act(() => {
        result.current.handleAddEvent(dodgePayload.ownerEntityId, dodgePayload.columnId, dodgePayload.atFrame, dodgePayload.defaultSkill);
      });

      // Context menu layer: set slot-1 as controlled operator at 1s (before the dodge)
      const initialFrame = 1 * FPS;
      const controlPayload = getControlPayload(result.current, SLOT_1, initialFrame);
      act(() => {
        result.current.handleAddEvent(
          controlPayload.ownerEntityId, controlPayload.columnId, controlPayload.atFrame, controlPayload.defaultSkill,
        );
      });

      const slot1Control = result.current.allProcessedEvents.find(
        (ev) => ev.id === NounType.CONTROL && ev.ownerEntityId === SLOT_1
          && !ev.uid.startsWith('controlled-seed-'),
      )!;
      expect(slot1Control).toBeDefined();

      // Move control event past the dodge to 5s
      const targetFrame = 5 * FPS;
      const delta = targetFrame - initialFrame;
      act(() => {
        result.current.handleMoveEvents([slot1Control.uid], delta);
      });

      // Controller layer: control event should be at 5s (not blocked by the dodge)
      const movedControl = result.current.allProcessedEvents.find(
        (ev) => ev.uid === slot1Control.uid,
      )!;
      expect(movedControl).toBeDefined();
      expect(movedControl.startFrame).toBe(targetFrame);
    });
  });
});
