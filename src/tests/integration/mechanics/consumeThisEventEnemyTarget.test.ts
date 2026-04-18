/**
 * @jest-environment jsdom
 *
 * CONSUME THIS EVENT — Parent-Status Target Routing
 *
 * Covers the entity-routing invariant in `doConsume` inside
 * `eventInterpretorController.ts`: when an onTriggerClause fires
 * `CONSUME THIS EVENT`, the consume target is resolved through the parent
 * status's `target` / `to` property via `getStatusDef(parentStatusId)` —
 * not blindly to the operator's slot.
 *
 * Reference: Endministrator's Realspace Stasis talent
 * (talent-realspace-stasis.json) has `target: "ENEMY"`. Its onTriggerClause
 * fires `CONSUME THIS EVENT` (+ APPLY ORIGINIUM_CRYSTALS_SHATTER) whenever
 * an operator applies Vulnerable/Lift/Crush/KnockDown/Breach to the enemy.
 * The CONSUME must hit the enemy's ORIGINIUM_CRYSTAL column, not the
 * operator slot's column (the bug would write a phantom CONSUMED event to
 * the operator slot).
 *
 * The Endministrator skills.test.ts B2/D2d tests already exercise the
 * cascade; this file pins the precise entity-routing invariant.
 */
import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { EventStatusType, InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ENDMINISTRATOR_ID: string = require(
  '../../../model/game-data/operators/endministrator/endministrator.json',
).id;

const REALSPACE_STASIS_ID: string = require(
  '../../../model/game-data/operators/endministrator/talents/talent-realspace-stasis.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ENDMINISTRATOR = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setupEndministrator(): { result: { current: AppResult } } {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeCombo(app: AppResult, atFrame: number) {
  const comboCol = findColumn(app, SLOT_ENDMINISTRATOR, NounType.COMBO);
  const payload = getMenuPayload(app, comboCol!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const battleCol = findColumn(app, SLOT_ENDMINISTRATOR, NounType.BATTLE);
  const payload = getMenuPayload(app, battleCol!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('CONSUME THIS EVENT — parent status target routing (Realspace Stasis)', () => {
  it('Combo-applied Originium Crystal lives on ENEMY, not on the operator slot', () => {
    const { result } = setupEndministrator();
    placeCombo(result.current, 2 * FPS);

    // Crystal must exist on the enemy entity.
    const onEnemy = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(onEnemy.length).toBeGreaterThanOrEqual(1);

    // Sanity: no crystal event landed on the operator slot at creation time.
    const onSlot = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );
    expect(onSlot).toHaveLength(0);
  });

  it('BS consume (via CRUSH-trigger CONSUME THIS EVENT) hits the ENEMY crystal column', () => {
    const { result } = setupEndministrator();
    placeCombo(result.current, 2 * FPS);

    // Sanity: crystal exists on enemy, none on slot.
    const crystalsBeforeOnEnemy = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(crystalsBeforeOnEnemy.length).toBeGreaterThanOrEqual(1);

    // Battle skill applies CRUSH → Realspace Stasis onTriggerClause fires
    // `CONSUME THIS EVENT` on its parent status (target: ENEMY) → the
    // enemy's crystal event is marked CONSUMED.
    placeBattleSkill(result.current, 5 * FPS);

    // Primary invariant: at least one crystal on ENEMY is now CONSUMED.
    const consumedOnEnemy = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID
        && ev.ownerEntityId === ENEMY_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedOnEnemy.length).toBeGreaterThanOrEqual(1);

    // Regression guard for the bug fixed in doConsume: no crystal event
    // should have been written/consumed on the operator slot as a side
    // effect of CONSUME THIS EVENT routing.
    const anyOnSlot = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );
    expect(anyOnSlot).toHaveLength(0);
  });

  // Negative case (target: OPERATOR) intentionally skipped:
  // The job spec permits skipping when no existing talent has a clean
  // single-clause `CONSUME THIS EVENT` with `target: OPERATOR`. All
  // current `target: OPERATOR` + `CONSUME THIS EVENT` talents (Arclight,
  // Fluorite, Perlica, Pogranichnik, Yvonne) gate their CONSUME on
  // stack thresholds or enemy-state transitions that would require
  // invented setup to exercise in isolation. Per CLAUDE.md we do not
  // invent game data.
});
