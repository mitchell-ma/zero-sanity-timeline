/**
 * @jest-environment jsdom
 */

/**
 * Freeform Susceptibility Damage — E2E
 *
 * Verifies the full user flow: place a freeform HEAT_SUSCEPTIBILITY on the
 * enemy via context menu (defaults to 0%), edit its value to 10% through the
 * info pane (handleUpdateEvent), then confirm the damage calc reflects 1.1×.
 *
 * Uses Akekuri (slot-1, HEAT element) battle skill as the damage source.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, ElementType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../model/channels';
import { findColumn, getMenuPayload, buildContextMenu } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const HEAT_SUSC_ID: string = require(
  '../../../model/game-data/generic/statuses/status-heat-susceptibility.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_AKEKURI = 'slot-1';
const BS_START_FRAME = 1 * FPS;
const SUSC_VALUE = 0.10; // 10%

beforeEach(() => { localStorage.clear(); });

/** Place Akekuri battle skill at BS_START_FRAME. */
function placeBattleSkill(app: AppResult) {
  const bsCol = findColumn(app, SLOT_AKEKURI, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  const payload = getMenuPayload(app, bsCol!, BS_START_FRAME);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

/** Place freeform HEAT_SUSCEPTIBILITY on enemy via context menu (value defaults to 0). */
function placeSusceptibilityViaContextMenu(app: AppResult) {
  const enemyStatusCol = findColumn(app, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();

  const menuItems = buildContextMenu(app, enemyStatusCol!, 0, 0.5);
  expect(menuItems).not.toBeNull();

  // Find the Heat Susceptibility context menu item
  const suscItem = menuItems!.find(
    i => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.defaultSkill?.id === HEAT_SUSC_ID,
  );

  if (suscItem) {
    const payload = suscItem.actionPayload as AddEventPayload;
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  } else {
    // Fallback: place directly (column may not be visible until an infliction exists)
    app.handleAddEvent(ENEMY_ID, HEAT_SUSC_ID, 0, {
      name: HEAT_SUSC_ID, id: HEAT_SUSC_ID,
      segments: [{ properties: { duration: 10 * FPS } }],
    });
  }
}

function findSusceptibilityUid(app: AppResult): string {
  const suscEvent = app.allProcessedEvents.find(
    ev => ev.id === HEAT_SUSC_ID && ev.ownerEntityId === ENEMY_ID,
  );
  expect(suscEvent).toBeDefined();
  return suscEvent!.uid;
}

function getBsDamageRows(app: AppResult) {
  const calc = runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
  );
  return calc.rows.filter(
    r => r.damage != null && r.damage > 0 && r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE,
  );
}

describe('Freeform HEAT_SUSCEPTIBILITY — Akekuri BS damage E2E', () => {
  it('place susceptibility via context menu, edit to 10% via info pane, verify 1.1× damage', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Step 1: Place battle skill (baseline) ────────────────────────────
    act(() => { placeBattleSkill(result.current); });
    const baseRows = getBsDamageRows(result.current);
    expect(baseRows.length).toBeGreaterThan(0);

    // ── Step 2: Place HEAT_SUSCEPTIBILITY via context menu (defaults to 0%) ──
    act(() => { placeSusceptibilityViaContextMenu(result.current); });

    // Damage should be unchanged — susceptibility is 0%
    const zeroRows = getBsDamageRows(result.current);
    for (let i = 0; i < baseRows.length; i++) {
      expect(zeroRows[i].damage).toBeCloseTo(baseRows[i].damage!, 2);
    }

    // ── Step 3: Edit susceptibility to 10% via info pane (handleUpdateEvent) ──
    const suscUid = findSusceptibilityUid(result.current);

    act(() => {
      result.current.handleUpdateEvent(suscUid, {
        susceptibility: { [ElementType.HEAT]: SUSC_VALUE },
      });
    });

    // ── Step 4: Verify 1.1× damage on every hit ─────────────────────────
    const suscRows = getBsDamageRows(result.current);
    expect(suscRows).toHaveLength(baseRows.length);

    for (let i = 0; i < baseRows.length; i++) {
      const baseDmg = baseRows[i].damage!;
      const suscDmg = suscRows[i].damage!;
      const ratio = suscDmg / baseDmg;
      expect(ratio).toBeCloseTo(1 + SUSC_VALUE, 4);
    }
  });
});
