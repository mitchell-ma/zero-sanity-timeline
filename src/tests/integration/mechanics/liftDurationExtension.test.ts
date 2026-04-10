/**
 * @jest-environment jsdom
 */

/**
 * Lift Duration Extension — Integration Tests
 *
 * Tests the Gilberta ULT → Chen Qianyu BS → Lift extension interaction:
 * 1. Gilberta's ultimate applies Anomalous Gravity Field (5s) to enemy
 * 2. Chen Qianyu's battle skill applies Lift to enemy
 * 3. The field's onTrigger (BECOME LIFTED → EXTEND LIFT UNTIL END) extends
 *    the Lift duration to persist until the field expires
 *
 * Gilberta and Chen Qianyu must be swapped into slots (not default operators).
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import {
  PHYSICAL_STATUS_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../model/channels';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const GILBERTA_ID: string = require('../../../model/game-data/operators/gilberta/gilberta.json').id;
const CHEN_ID: string = require('../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const GRAVITY_FIELD_ID: string = require('../../../model/game-data/operators/gilberta/statuses/status-anomalous-gravity-field.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_GILBERTA = 'slot-0';
const SLOT_CHEN = 'slot-1';

// ── Helpers ──────────────────────────────────────────────────────────────────

function addViaContextMenu(app: AppResult, slotId: string, columnId: string, atFrame: number, variantLabel?: string) {
  const col = findColumn(app, slotId, columnId);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame, variantLabel);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getLiftEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerEntityId === ENEMY_ID,
  );
}

function getGravityFieldEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === GRAVITY_FIELD_ID && ev.ownerEntityId === ENEMY_ID,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Gilberta ULT + Chen 2x BS → Lift extended to field duration
// ═════════════════════════════════════════════════════════════════════════════

describe('Gilberta Gravity Field + Chen Qianyu BS → Lift duration extension', () => {
  it('Lift is extended to persist until Gravity Field ends', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Swap in Gilberta and Chen Qianyu
    act(() => { result.current.handleSwapOperator(SLOT_GILBERTA, GILBERTA_ID); });
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_ID); });

    // ── Context menu: verify Gilberta ULT is available ─────────────────
    const ultCol = findColumn(result.current, SLOT_GILBERTA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultMenu = buildContextMenu(result.current, ultCol!, 2 * FPS);
    expect(ultMenu).not.toBeNull();
    expect(ultMenu!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // Add Gilberta ULT at 2s — creates Anomalous Gravity Field (5s)
    act(() => { addViaContextMenu(result.current, SLOT_GILBERTA, NounType.ULTIMATE, 2 * FPS); });

    // Controller: Gravity Field status exists on enemy
    const fieldEvents = getGravityFieldEvents(result.current);
    expect(fieldEvents.length).toBeGreaterThanOrEqual(1);

    // ── Context menu: verify Chen BS is available ──────────────────────
    const bsCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const bsMenu = buildContextMenu(result.current, bsCol!, 4 * FPS);
    expect(bsMenu).not.toBeNull();
    expect(bsMenu!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // 1st Chen BS at 4s — applies Vulnerable (no Lift yet, need existing Vulnerable)
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    // Controller: Vulnerable infliction on enemy
    const vulnAfterFirst = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(vulnAfterFirst.length).toBeGreaterThanOrEqual(1);

    // 2nd Chen BS at 5s — Vulnerable exists, so Lift is applied
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 5 * FPS); });

    // Controller: Lift status exists on enemy
    const liftEvents = getLiftEvents(result.current);
    expect(liftEvents).toHaveLength(1);

    // Controller: Lift duration is extended beyond base duration
    // Base Lift is ~1s (120 frames) at skill level 1.
    // Gravity Field extends it UNTIL END of the field.
    // Field was applied during ULT — the extension makes Lift persist until field expires.
    const liftDur = eventDuration(liftEvents[0]);
    const baseLiftDuration = 1 * FPS; // 1s at default skill level
    expect(liftDur).toBeGreaterThan(baseLiftDuration);

    // ── View layer ─────────────────────────────────────────────────────
    // Lift is a micro-column inside the enemy status column
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();
    const microIds = new Set(enemyStatusCol!.microColumns!.map(mc => mc.id));
    expect(microIds.has(PHYSICAL_STATUS_COLUMNS.LIFT)).toBe(true);

    // ColumnViewModel has the Lift event with extended duration
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusVm = viewModels.get(enemyStatusCol!.key);
    expect(enemyStatusVm).toBeDefined();
    const vmLiftEvents = enemyStatusVm!.events.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );
    expect(vmLiftEvents).toHaveLength(1);
    expect(eventDuration(vmLiftEvents[0])).toBe(liftDur);
  });

  it('Gravity Field applied DURING existing Lift extends it via onEntryClause', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Swap in Gilberta and Chen Qianyu
    act(() => { result.current.handleSwapOperator(SLOT_GILBERTA, GILBERTA_ID); });
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_ID); });

    // ── Chen 2x BS first — creates Lift ─────────────────────────────────
    // 1st BS at 2s — applies Vulnerable
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });

    // 2nd BS at 3s — Vulnerable exists, Lift applied (base ~1s)
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 3 * FPS); });

    // Controller: Lift exists with base duration before Gilberta ULT
    const liftBefore = getLiftEvents(result.current);
    expect(liftBefore).toHaveLength(1);
    const baseDur = eventDuration(liftBefore[0]);
    expect(baseDur).toBe(1 * FPS); // 1s at default skill level

    // ── Gilberta ULT during Lift — onEntryClause should extend ──────────
    // Lift starts at the 2nd BS frame (~3s + offset). Place ULT so the field
    // starts while Lift is still active.
    const liftStart = liftBefore[0].startFrame;
    const ultFrame = liftStart + 1; // 1 frame after Lift starts — Lift is active
    act(() => { addViaContextMenu(result.current, SLOT_GILBERTA, NounType.ULTIMATE, ultFrame); });

    // Controller: Gravity Field exists
    const fieldEvents = getGravityFieldEvents(result.current);
    expect(fieldEvents.length).toBeGreaterThanOrEqual(1);

    // Controller: Lift duration is extended beyond base
    const liftAfter = getLiftEvents(result.current);
    expect(liftAfter).toHaveLength(1);
    const extendedDur = eventDuration(liftAfter[0]);
    expect(extendedDur).toBeGreaterThan(baseDur);

    // ── View layer ─────────────────────────────────────────────────────
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusVm = viewModels.get(enemyStatusCol!.key);
    expect(enemyStatusVm).toBeDefined();
    const vmLiftEvents = enemyStatusVm!.events.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );
    expect(vmLiftEvents).toHaveLength(1);
    expect(eventDuration(vmLiftEvents[0])).toBe(extendedDur);
  });

  it('without Gravity Field, Lift has base duration only', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Swap in Chen Qianyu only (no Gilberta)
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_ID); });

    // 1st BS at 2s — Vulnerable
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });

    // 2nd BS at 4s — Lift applied (Vulnerable exists)
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    // Controller: Lift exists with base duration (no field to extend it)
    const liftEvents = getLiftEvents(result.current);
    expect(liftEvents).toHaveLength(1);
    const liftDur = eventDuration(liftEvents[0]);

    // Base Lift duration is 1s at default skill level
    expect(liftDur).toBe(1 * FPS);
  });
});
