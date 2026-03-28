/**
 * @jest-environment jsdom
 */

/**
 * Status Column Layout — Integration Test
 *
 * Verifies that status events in Laevatain's operator status column are
 * assigned to distinct visual micro-columns that all fit within the column.
 *
 * Laevatain starts with 2 permanent talent events (Scorching Heart, Re-Ignition).
 * Adding Melting Flame and Scorching Heart Effect produces 4 distinct visual
 * columns, all constrained within the status column (leftFrac + widthFrac ≤ 1).
 *
 * Events are added through the context menu flow (right-click → select item).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../model/channels';
import { findColumn, buildContextMenu, type AddEventPayload } from '../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MELTING_FLAME_ID: string = require('../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SH_EFFECT_COLUMN: string = require('../../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SH_TALENT_COLUMN: string = require('../../../model/game-data/operators/laevatain/talents/talent-scorching-heart.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RE_IGNITION_COLUMN: string = require('../../../model/game-data/operators/laevatain/talents/talent-re-ignition-talent.json').properties.id;
const SLOT_LAEVATAIN = 'slot-0';

/**
 * Build the context menu for the operator-status column and find the addEvent
 * item whose payload targets the given micro-column ID.
 */
function getStatusMenuPayload(app: ReturnType<typeof useApp>, microColumnId: string, atFrame: number): AddEventPayload {
  const statusCol = findColumn(app, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
  expect(statusCol).toBeDefined();

  const menuItems = buildContextMenu(app, statusCol!, atFrame);
  expect(menuItems).not.toBeNull();
  expect(menuItems!.length).toBeGreaterThan(0);

  const item = menuItems!.find(
    (i) => i.actionId === 'addEvent' && (i.actionPayload as AddEventPayload)?.columnId === microColumnId,
  );
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();

  return item!.actionPayload as AddEventPayload;
}

describe('Status column layout — micro-column positioning', () => {
  it('Laevatain starts with 2 permanent talent events in operator status', () => {
    const { result } = renderHook(() => useApp());

    const statusEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN &&
        (ev.columnId === SH_TALENT_COLUMN || ev.columnId === RE_IGNITION_COLUMN),
    );
    expect(statusEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('context menu for operator-status column lists micro-column items', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, statusCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    // Should have addEvent items for each micro-column (at least MF and SH Effect)
    const addItems = menuItems!.filter((i) => i.actionId === 'addEvent');
    expect(addItems.length).toBeGreaterThanOrEqual(2);

    // Verify the expected micro-columns are present
    const columnIds = addItems.map((i) => (i.actionPayload as AddEventPayload).columnId);
    expect(columnIds).toContain(MELTING_FLAME_ID);
    expect(columnIds).toContain(SH_EFFECT_COLUMN);
  });

  it('4 distinct visual columns when MF and SH Effect are added via context menu', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add Melting Flame at 2s via context menu
    const mfPayload = getStatusMenuPayload(result.current, MELTING_FLAME_ID, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        mfPayload.ownerId, mfPayload.columnId, mfPayload.atFrame, mfPayload.defaultSkill,
      );
    });

    // Add Scorching Heart Effect at 3s via context menu
    const shPayload = getStatusMenuPayload(result.current, SH_EFFECT_COLUMN, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        shPayload.ownerId, shPayload.columnId, shPayload.atFrame, shPayload.defaultSkill,
      );
    });

    // Compute presentation model
    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID)!;
    expect(statusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol.key);
    expect(vm).toBeDefined();

    // All status events for this column should have micro-positions
    const statusEvents = vm!.events.filter((ev) => ev.ownerId === SLOT_LAEVATAIN);
    expect(statusEvents.length).toBeGreaterThanOrEqual(4);

    // Collect unique slot positions (leftFrac values)
    const uniqueSlots = new Set(
      statusEvents.map((ev) => vm!.microPositions.get(ev.uid)?.leftFrac),
    );
    // At least 4 distinct visual columns
    expect(uniqueSlots.size).toBeGreaterThanOrEqual(4);

    // Every event must be fully within the column (0 ≤ leftFrac + widthFrac ≤ 1)
    for (const ev of statusEvents) {
      const mp = vm!.microPositions.get(ev.uid);
      expect(mp).toBeDefined();
      expect(mp!.leftFrac).toBeGreaterThanOrEqual(0);
      expect(mp!.leftFrac + mp!.widthFrac).toBeLessThanOrEqual(1);
    }
  });
});
