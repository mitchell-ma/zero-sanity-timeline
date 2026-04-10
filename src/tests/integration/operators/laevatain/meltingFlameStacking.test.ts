/**
 * @jest-environment jsdom
 */

/**
 * Melting Flame Stacking — Integration Test
 *
 * Tests that freeform-added Melting Flame events do not trigger overlap warnings.
 * MF has a stacking limit of 4, so overlapping MF events are expected and valid.
 *
 * Events are added through the context menu flow (right-click → select item).
 *
 * Verifies all three layers:
 * 1. Context menu: MF menu items are available and enabled in the status column
 * 2. Controller: allProcessedEvents MF event counts, eventStatus, warnings
 * 3. View: computeTimelinePresentation includes MF events in the status column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EnhancementType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MELTING_FLAME_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const SLOT_LAEVATAIN = 'slot-0';

/** Ref container from renderHook — always read .current for latest state. */
type AppRef = { current: AppResult };

/**
 * Build the context menu for the operator-status column and find the addEvent
 * item whose payload targets the MF micro-column.
 */
function getMfMenuPayload(app: AppResult, atFrame: number): AddEventPayload {
  const statusCol = findColumn(app, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
  expect(statusCol).toBeDefined();

  const menuItems = buildContextMenu(app, statusCol!, atFrame);
  expect(menuItems).not.toBeNull();
  expect(menuItems!.length).toBeGreaterThan(0);

  const item = menuItems!.find(
    (i) => i.actionId === 'addEvent' && (i.actionPayload as AddEventPayload)?.columnId === MELTING_FLAME_ID,
  );
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();

  return item!.actionPayload as AddEventPayload;
}

/**
 * Add MF stacks via context menu at 1-second intervals starting at `startSecond`.
 * Caller must set FREEFORM interaction mode before calling.
 * Takes `result` ref so each iteration reads the latest hook state.
 */
function addMfStacks(ref: AppRef, count: number, startSecond: number) {
  for (let i = 0; i < count; i++) {
    const atFrame = (startSecond + i) * FPS;
    const payload = getMfMenuPayload(ref.current, atFrame);
    act(() => {
      ref.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }
}

/** Add an empowered battle skill for Laevatain via context menu flow. */
function addEmpoweredBattleSkill(ref: AppRef, atSecond: number) {
  const col = findColumn(ref.current, SLOT_LAEVATAIN, NounType.BATTLE);
  expect(col).toBeDefined();
  const empoweredVariant = col!.eventVariants?.find(
    (v) => v.enhancementType === EnhancementType.EMPOWERED,
  );
  expect(empoweredVariant).toBeDefined();
  const atFrame = atSecond * FPS;
  const payload = getMenuPayload(ref.current, col!, atFrame, empoweredVariant!.displayName);
  act(() => {
    ref.current.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function getMfEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
  );
}

describe('Melting Flame stacking — freeform add', () => {
  it('two overlapping MF events have no overlap warnings', () => {
    const { result } = renderHook(() => useApp());

    // ── Context menu layer ──────────────────────────────────────────────
    // Set freeform mode (status column context menus require it)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Verify MF menu item exists and is enabled in operator status column
    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, statusCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    const mfItem = menuItems!.find(
      (i) => i.actionId === 'addEvent' && (i.actionPayload as AddEventPayload)?.columnId === MELTING_FLAME_ID,
    );
    expect(mfItem).toBeDefined();
    expect(mfItem!.disabled).toBeFalsy();

    // ── Controller layer ────────────────────────────────────────────────
    // Add first MF at 2s via context menu
    addMfStacks(result, 1, 2);

    // Add second MF at 3s (1 second later — overlapping with first)
    addMfStacks(result, 1, 3);

    const mfEvents = getMfEvents(result.current);
    expect(mfEvents).toHaveLength(2);

    // Neither event should have overlap warnings
    for (const ev of mfEvents) {
      expect(ev.warnings ?? []).not.toContainEqual(
        expect.stringContaining('Overlaps'),
      );
    }

    // ── View layer ──────────────────────────────────────────────────────
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();

    // MF events appear in the status column view model
    const mfVmEvents = vm!.events.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(mfVmEvents).toHaveLength(2);
  });

  it('fifth MF stack is rejected — max stacks is 4', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add 5 MF events, 1 second apart via context menu
    addMfStacks(result, 5, 2);

    const mfEvents = getMfEvents(result.current);
    // Only 4 should exist — the 5th is rejected by stack limit
    expect(mfEvents).toHaveLength(4);
  });

  it('empowered battle skill consumes freeform-added MF stacks', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add 4 MF stacks via freeform context menu, 1 second apart
    addMfStacks(result, 4, 2);

    // Verify 4 MF stacks exist and are not consumed
    const mfBefore = getMfEvents(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfBefore).toHaveLength(4);

    // ── Context menu layer: empowered battle skill ──────────────────────
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const battleMenu = buildContextMenu(result.current, battleCol!, 10 * FPS);
    expect(battleMenu).not.toBeNull();

    // Verify empowered variant is available
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();
    const empoweredItem = battleMenu!.find(
      (i) => i.actionId === 'addEvent' && i.label === empoweredVariant!.displayName,
    );
    expect(empoweredItem).toBeDefined();
    expect(empoweredItem!.disabled).toBeFalsy();

    // Add empowered BS after all 4 MF stacks
    addEmpoweredBattleSkill(result, 10);

    // All 4 freeform MF stacks should be consumed
    const mfAfter = getMfEvents(result.current);
    const consumed = mfAfter.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(4);
  });

  it('undo after empowered BS restores 4 unconsumed MF stacks', async () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add 4 MF stacks via freeform context menu, 1 second apart
    addMfStacks(result, 4, 2);

    // Add empowered battle skill via context menu
    addEmpoweredBattleSkill(result, 10);

    // Verify MF stacks are consumed
    const consumedBefore = getMfEvents(result.current).filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedBefore).toHaveLength(4);

    // Allow microtask (undo history push) to complete, then undo
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    act(() => {
      result.current.undo();
    });

    // Verify empowered BS was undone
    const battleAfterUndo = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battleAfterUndo).toHaveLength(0);

    const mfAfterUndo = getMfEvents(result.current);
    expect(mfAfterUndo).toHaveLength(4);
    const unconsumed = mfAfterUndo.filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(unconsumed).toHaveLength(4);

    // None should have overlap warnings
    for (const ev of mfAfterUndo) {
      expect(ev.warnings ?? []).not.toContainEqual(
        expect.stringContaining('Overlaps'),
      );
    }
  });
});
