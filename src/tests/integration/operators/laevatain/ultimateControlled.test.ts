/**
 * @jest-environment jsdom
 */

/**
 * Laevatain Ultimate Controlled Activation — Integration Test
 *
 * Tests that Laevatain's ultimate (Twilight) requires the operator to be the
 * controlled operator. Exercises the activation clause through:
 * 1. Context menu availability (checkVariantAvailability)
 * 2. Context menu variant enabled/disabled state for the ultimate column
 * 3. Placed event validation (validateVariantClauses)
 * 4. View-layer computeTimelinePresentation for INPUT column
 *
 * Verification layers:
 *   Context menu: "Set as Controlled Operator" flow + ultimate variant enabled/disabled
 *   Controller: allProcessedEvents, checkVariantAvailability, validateVariantClauses
 *   View: computeTimelinePresentation ColumnViewModel for INPUT column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { OPERATOR_COLUMNS } from '../../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { checkVariantAvailability, validateVariantClauses } from '../../../../controller/timeline/eventValidator';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import type { MiniTimeline, ContextMenuItem } from '../../../../consts/viewTypes';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const TWILIGHT_ID: string = require('../../../../model/game-data/operators/laevatain/skills/ultimate-twilight.json').properties.id;
const TWILIGHT_NAME: string = require('../../../../model/game-data/operators/laevatain/skills/ultimate-twilight.json').properties.name;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_0 = 'slot-0'; // Laevatain
const SLOT_1 = 'slot-1'; // Akekuri

const CONTROL_LABEL = 'Set as Controlled Operator';

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

/** Swap control to a slot via context menu flow. */
function swapControlTo(app: AppResult, slotId: string, atFrame: number) {
  const payload = getControlPayload(app, slotId, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Find the "Twilight" variant menu item in the ultimate column's context menu. */
function findTwilightMenuItem(app: AppResult, atFrame: number): ContextMenuItem | undefined {
  const ultCol = findColumn(app, SLOT_0, NounType.ULTIMATE);
  if (!ultCol) throw new Error('No ultimate column found for slot-0');
  const items = buildContextMenu(app, ultCol, atFrame);
  if (!items) throw new Error(`Context menu returned null for ultimate column at frame ${atFrame}`);
  return items.find(i => i.label === TWILIGHT_NAME);
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

describe('Laevatain ultimate controlled activation — integration through useApp', () => {
  describe('checkVariantAvailability (context menu)', () => {
    it('ultimate is available when Laevatain is the controlled operator (initial state)', () => {
      const { result } = renderHook(() => useApp());
      act(() => { setUltimateEnergyToMax(result.current, SLOT_0, 0); });
      const r = checkVariantAvailability(
        TWILIGHT_ID, SLOT_0, [...result.current.allProcessedEvents], 5 * FPS,
        NounType.ULTIMATE, result.current.slots,
      );
      expect(r.disabled).toBe(false);

      // Context menu layer: Twilight variant should be enabled
      const twilightItem = findTwilightMenuItem(result.current, 5 * FPS);
      expect(twilightItem).toBeDefined();
      expect(twilightItem!.disabled).toBeFalsy();
    });

    it('ultimate is disabled when another operator is controlled', () => {
      const { result } = renderHook(() => useApp());
      // Swap control to slot-1 at 3s via context menu
      swapControlTo(result.current, SLOT_1, 3 * FPS);

      const r = checkVariantAvailability(
        TWILIGHT_ID, SLOT_0, [...result.current.allProcessedEvents], 5 * FPS,
        NounType.ULTIMATE, result.current.slots,
      );
      expect(r.disabled).toBe(true);
      expect(r.reason).toMatch(/controlled/i);

      // Context menu layer: Twilight variant should be disabled
      const twilightItem = findTwilightMenuItem(result.current, 5 * FPS);
      expect(twilightItem).toBeDefined();
      expect(twilightItem!.disabled).toBe(true);
    });

    it('ultimate is available before control swap but disabled after', () => {
      const { result } = renderHook(() => useApp());
      act(() => { setUltimateEnergyToMax(result.current, SLOT_0, 0); });
      const swapFrame = 5 * FPS;
      swapControlTo(result.current, SLOT_1, swapFrame);

      // Before swap: Laevatain is controlled
      const before = checkVariantAvailability(
        TWILIGHT_ID, SLOT_0, [...result.current.allProcessedEvents], 3 * FPS,
        NounType.ULTIMATE, result.current.slots,
      );
      expect(before.disabled).toBe(false);

      // After swap: Laevatain is not controlled
      const after = checkVariantAvailability(
        TWILIGHT_ID, SLOT_0, [...result.current.allProcessedEvents], 7 * FPS,
        NounType.ULTIMATE, result.current.slots,
      );
      expect(after.disabled).toBe(true);

      // Context menu layer: variant enabled before swap, disabled after
      const twilightBefore = findTwilightMenuItem(result.current, 3 * FPS);
      expect(twilightBefore).toBeDefined();
      expect(twilightBefore!.disabled).toBeFalsy();

      const twilightAfter = findTwilightMenuItem(result.current, 7 * FPS);
      expect(twilightAfter).toBeDefined();
      expect(twilightAfter!.disabled).toBe(true);
    });

    it('ultimate is available again after control swaps back', () => {
      const { result } = renderHook(() => useApp());
      act(() => { setUltimateEnergyToMax(result.current, SLOT_0, 0); });
      // Swap to slot-1 at 3s, then back to slot-0 at 6s
      swapControlTo(result.current, SLOT_1, 3 * FPS);
      swapControlTo(result.current, SLOT_0, 6 * FPS);

      // During slot-1 control: disabled
      const during = checkVariantAvailability(
        TWILIGHT_ID, SLOT_0, [...result.current.allProcessedEvents], 4 * FPS,
        NounType.ULTIMATE, result.current.slots,
      );
      expect(during.disabled).toBe(true);

      // After swap back: available
      const after = checkVariantAvailability(
        TWILIGHT_ID, SLOT_0, [...result.current.allProcessedEvents], 8 * FPS,
        NounType.ULTIMATE, result.current.slots,
      );
      expect(after.disabled).toBe(false);

      // Context menu layer: variant disabled during, enabled after swap back
      const twilightDuring = findTwilightMenuItem(result.current, 4 * FPS);
      expect(twilightDuring).toBeDefined();
      expect(twilightDuring!.disabled).toBe(true);

      const twilightAfter = findTwilightMenuItem(result.current, 8 * FPS);
      expect(twilightAfter).toBeDefined();
      expect(twilightAfter!.disabled).toBeFalsy();
    });
  });

  describe('validateVariantClauses (placed event warnings)', () => {
    it('no warning when ultimate is placed while Laevatain is controlled', () => {
      const { result } = renderHook(() => useApp());
      act(() => { setUltimateEnergyToMax(result.current, SLOT_0, 0); });

      // Place ultimate via context menu
      const ultCol = findColumn(result.current, SLOT_0, NounType.ULTIMATE);
      expect(ultCol).toBeDefined();
      const payload = getMenuPayload(result.current, ultCol!, 5 * FPS, TWILIGHT_NAME);

      act(() => {
        result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
      });

      const warnings = validateVariantClauses(
        [...result.current.allProcessedEvents], result.current.slots,
      );
      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === NounType.ULTIMATE,
      );
      expect(ultEvent).toBeDefined();
      expect(warnings.has(ultEvent!.uid)).toBe(false);

      // View layer: verify control events appear in INPUT column
      const vmControls = getControlEventsFromVM(result.current);
      expect(vmControls.length).toBeGreaterThanOrEqual(1);
      expect(vmControls.find(ev => ev.ownerId === SLOT_0)).toBeDefined();
    });

    it('warning when ultimate is placed at a frame where Laevatain is not controlled', () => {
      const { result } = renderHook(() => useApp());
      act(() => { setUltimateEnergyToMax(result.current, SLOT_0, 0); });
      // Swap control to slot-1 at 3s via context menu
      swapControlTo(result.current, SLOT_1, 3 * FPS);

      // Place ultimate in freeform mode (bypasses context menu check)
      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });
      const ultCol = findColumn(result.current, SLOT_0, NounType.ULTIMATE);
      expect(ultCol).toBeDefined();
      const payload = getMenuPayload(result.current, ultCol!, 5 * FPS, TWILIGHT_NAME);

      act(() => {
        result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
      });

      const warnings = validateVariantClauses(
        [...result.current.allProcessedEvents], result.current.slots,
      );
      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === NounType.ULTIMATE,
      );
      expect(ultEvent).toBeDefined();
      expect(warnings.has(ultEvent!.uid)).toBe(true);
      expect(warnings.get(ultEvent!.uid)).toMatch(/controlled/i);

      // View layer: verify both control events in INPUT column ViewModel
      const vmControls = getControlEventsFromVM(result.current);
      expect(vmControls).toHaveLength(2);
      expect(vmControls.find(ev => ev.ownerId === SLOT_0)).toBeDefined();
      expect(vmControls.find(ev => ev.ownerId === SLOT_1)).toBeDefined();
    });
  });
});
