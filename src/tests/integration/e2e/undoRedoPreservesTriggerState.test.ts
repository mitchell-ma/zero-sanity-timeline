/**
 * @jest-environment jsdom
 *
 * Undo/redo does not leak stale interpreter state across pipeline runs.
 *
 * The EventInterpretorController carries instance-level dedupe sets
 * (`firedHpThresholds`, `triggerUsageCount`) that must be cleared before
 * every pipeline run. If they leak across undo→redo cycles, the redo pass
 * would see a "fired" entry from the original run and suppress the buff,
 * causing the re-derived event stream to diverge from the pre-undo one.
 *
 * Scenario: Wulfgard + Mordvolt Insulation gear (HP>=80% → MORDVOLT_INSULATION
 * buff). The gear fires a passive buff at frame 0 from the HP threshold
 * check, and the buff can also re-fire on subsequent skill placements.
 * We drive undo→redo cycles and assert the processed-event stream is
 * structurally identical to the pre-undo state — which catches any leak
 * where redo would produce fewer/different buff events than the original
 * run because of stale `firedHpThresholds` entries.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import { gearLoadout } from '../gears/helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const MORDVOLT_BUFF = require('../../../model/game-data/gears/mordvolt-insulation/statuses/status-mordvolt-insulation.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

const ARMOR_ID = 'MORDVOLT_INSULATION_VEST_T1';
const GLOVES_ID = 'MORDVOLT_INSULATION_GLOVES_T1';
const KIT_ID = 'MORDVOLT_INSULATION_BATTERY_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
  return payload;
}

function buffEvents(app: AppResult) {
  return app.allProcessedEvents
    .filter(ev => ev.ownerEntityId === SLOT && ev.columnId === MORDVOLT_BUFF.id)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function battleEvents(app: AppResult) {
  return app.allProcessedEvents
    .filter(ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BATTLE)
    .sort((a, b) => a.startFrame - b.startFrame);
}

/**
 * useHistory pushes undo entries via queueMicrotask — tests must yield a
 * microtask before calling undo() so the push is visible.
 */
async function flushMicrotasks() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Serialize buff events minus per-run identifiers for structural comparison. */
function structuralBuffs(app: AppResult): string {
  return JSON.stringify(
    buffEvents(app).map(ev => ({
      id: ev.id,
      columnId: ev.columnId,
      ownerEntityId: ev.ownerEntityId,
      sourceEntityId: ev.sourceEntityId,
      startFrame: ev.startFrame,
    })),
  );
}

describe('undo/redo preserves trigger state', () => {
  it('single BS: undo→redo yields structurally identical buff stream', async () => {
    const { result } = setup();

    // Place BS at 1s — Mordvolt buffs fire (passive at frame 0 + possibly
    // re-fires at EVENT_START for the BS).
    placeBattleSkill(result.current, 1 * FPS);

    const battleCountBefore = battleEvents(result.current).length;
    expect(battleCountBefore).toBe(1);

    const buffsBefore = buffEvents(result.current);
    expect(buffsBefore.length).toBeGreaterThanOrEqual(1);
    const snapshotBefore = structuralBuffs(result.current);

    // ── Undo ────────────────────────────────────────────────────────────────
    await flushMicrotasks();
    act(() => { result.current.undo(); });

    // BS is gone.
    expect(battleEvents(result.current)).toHaveLength(0);

    // ── Redo ────────────────────────────────────────────────────────────────
    act(() => { result.current.redo(); });

    // BS is back.
    expect(battleEvents(result.current)).toHaveLength(battleCountBefore);

    // Buff stream is structurally identical to the pre-undo state. Stale
    // `firedHpThresholds` entries would cause one or more Mordvolt buffs
    // that fired in the original pass to be suppressed on redo, surfacing
    // here as a structural diff.
    const snapshotAfter = structuralBuffs(result.current);
    expect(snapshotAfter).toBe(snapshotBefore);

    // Sanity: every buff has a stable sourceEntityId (WULFGARD, not stale).
    for (const b of buffEvents(result.current)) {
      expect(b.sourceEntityId).toBe(WULFGARD_ID);
      expect(b.ownerEntityId).toBe(SLOT);
    }
  });

  it('two BS chained: undo both→redo both yields structurally identical buff stream', async () => {
    const { result } = setup();

    // Place two BS. Depending on buff duration vs. spacing, each may spawn
    // its own re-fire. What we care about here is that the redo path
    // reproduces the exact same buff set as the original run.
    placeBattleSkill(result.current, 1 * FPS);
    placeBattleSkill(result.current, 5 * FPS);

    const battleCountBefore = battleEvents(result.current).length;
    expect(battleCountBefore).toBe(2);
    const buffsBefore = buffEvents(result.current);
    expect(buffsBefore.length).toBeGreaterThanOrEqual(1);
    const snapshotBefore = structuralBuffs(result.current);

    // ── Undo twice ──────────────────────────────────────────────────────────
    await flushMicrotasks();
    act(() => { result.current.undo(); });
    await flushMicrotasks();
    act(() => { result.current.undo(); });

    expect(battleEvents(result.current)).toHaveLength(0);

    // ── Redo twice ──────────────────────────────────────────────────────────
    act(() => { result.current.redo(); });
    act(() => { result.current.redo(); });

    // Both BS back.
    expect(battleEvents(result.current)).toHaveLength(battleCountBefore);

    // Buff stream structurally identical — stresses `_checkHpThresholds`
    // idempotency across chained undo/redo.
    const snapshotAfter = structuralBuffs(result.current);
    expect(snapshotAfter).toBe(snapshotBefore);
  });
});
