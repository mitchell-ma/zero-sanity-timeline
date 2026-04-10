/**
 * @jest-environment jsdom
 */

/**
 * SP Consumption — Integration Tests
 *
 * Tests that battle skills correctly consume SP through the full pipeline:
 * useApp → context menu → handleAddEvent → processCombatSimulation → SP tracking
 *
 * Verifies all three layers:
 * 1. Context menu: battle skill menu item is available and enabled
 * 2. Controller: SP consumption history records the correct cost
 * 3. View: computeTimelinePresentation includes the event in the battle skill column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { buildMergedOperatorJson, getBattleSkillSpCost } from '../../../controller/gameDataStore';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;

const SLOT_AKEKURI = 'slot-1';

describe('SP Consumption — integration through useApp', () => {
  it('Akekuri battle skill consumes the expected SP', () => {
    const { result } = renderHook(() => useApp());

    // Derive expected SP cost from game data
    const akekuriJson = buildMergedOperatorJson(AKEKURI_ID)!;
    expect(akekuriJson).toBeDefined();
    const expectedSpCost = getBattleSkillSpCost(akekuriJson);
    expect(expectedSpCost).toBeGreaterThan(0);

    // ── Context menu layer ──────────────────────────────────────────────
    // Find the battle skill column
    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    // Build context menu at 5s — verify the add-event item is available
    const atFrame = 5 * FPS;
    const menuItems = buildContextMenu(result.current, battleCol!, atFrame);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.length).toBeGreaterThan(0);

    // Extract payload (asserts item exists and is enabled)
    const payload = getMenuPayload(result.current, battleCol!, atFrame);
    expect(payload.defaultSkill).toBeDefined();

    // Verify the column definition carries the SP cost
    expect(battleCol!.defaultEvent!.skillPointCost).toBe(expectedSpCost);

    // ── Controller layer ────────────────────────────────────────────────
    // Add the battle skill via the context menu payload
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId,
        payload.columnId,
        payload.atFrame,
        payload.defaultSkill,
      );
    });

    // Verify the battle skill event exists in processed events
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(battleEvents[0].skillPointCost).toBe(expectedSpCost);

    // Verify SP consumption history records the cost
    const consumption = result.current.spConsumptionHistory.find(
      (r) => r.eventUid === battleEvents[0].uid,
    );
    expect(consumption).toBeDefined();
    expect(consumption!.naturalConsumed + consumption!.returnedConsumed).toBe(expectedSpCost);

    // ── View layer ──────────────────────────────────────────────────────
    // Verify the event appears in the battle skill column's ColumnViewModel
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(battleCol!.key);
    expect(vm).toBeDefined();

    const battleEventsInVM = vm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE,
    );
    expect(battleEventsInVM).toHaveLength(1);
    expect(battleEventsInVM[0].uid).toBe(battleEvents[0].uid);
  });
});
