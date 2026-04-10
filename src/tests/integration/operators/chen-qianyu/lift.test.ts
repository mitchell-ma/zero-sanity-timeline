/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu Lift — Integration Tests
 *
 * Tests the Vulnerable → Lift physical status mechanic through the full useApp pipeline.
 * Chen Qianyu's battle skill (Ascending Strike) applies LIFT, which:
 *   1. Always adds 1 Vulnerable infliction stack.
 *   2. Only creates the Lift status if enemy already had Vulnerable OR isForced.
 *
 * Three-layer verification:
 *   1. Context menu: column exists and add-event menu item is available
 *   2. Controller: allProcessedEvents contain expected infliction/status events
 *   3. View: computeTimelinePresentation produces ColumnViewModels with correct Lift events
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Chen Qianyu must be swapped in via handleSwapOperator.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  PHYSICAL_INFLICTION_COLUMNS,
  PHYSICAL_STATUS_COLUMNS,
  PHYSICAL_STATUS_COLUMN_IDS,
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../../model/channels';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  return view;
}

function addViaContextMenu(app: AppResult, slotId: string, columnId: string, atFrame: number, variantLabel?: string) {
  const col = findColumn(app, slotId, columnId);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame, variantLabel);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

describe('Chen Qianyu — Vulnerable → Lift physical status', () => {
  it('first battle skill applies Vulnerable only; second adds 2nd stack and triggers Lift', () => {
    const { result } = setupChen();

    // ── Context menu: verify battle skill column exists and menu is available ──
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    expect(battleCol!.defaultEvent).toBeDefined();

    const menuItems = buildContextMenu(result.current, battleCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // ── First battle skill at t=2s via context menu ──
    act(() => {
      addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS);
    });

    // Controller layer: Enemy should have exactly 1 Vulnerable infliction
    const vulnAfterFirst = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(vulnAfterFirst).toHaveLength(1);

    // Controller layer: Enemy should have NO physical statuses (Lift, Knock Down, Crush, Breach)
    const physStatusAfterFirst = result.current.allProcessedEvents.filter(
      (ev) => PHYSICAL_STATUS_COLUMN_IDS.has(ev.columnId) && ev.ownerEntityId === ENEMY_ID,
    );
    expect(physStatusAfterFirst).toHaveLength(0);

    // ── Second battle skill while Vulnerable is still active via context menu ──
    act(() => {
      addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS);
    });

    // Controller layer: Enemy should now have 2 Vulnerable infliction stacks
    const vulnAfterSecond = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(vulnAfterSecond).toHaveLength(2);

    // Controller layer: Enemy should now have Lift status
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(liftEvents).toHaveLength(1);

    // ── View layer: computeTimelinePresentation shows Lift in enemy status column ──
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const enemyStatusVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyStatusVM).toBeDefined();

    // Vulnerable infliction events in the view model
    const vulnVMEvents = enemyStatusVM!.events.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnVMEvents).toHaveLength(2);

    // Lift status event in the view model
    const liftVMEvents = enemyStatusVM!.events.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );
    expect(liftVMEvents).toHaveLength(1);
  });
});
