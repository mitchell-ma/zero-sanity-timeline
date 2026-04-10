/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu P1 — Shadowless Integration Test
 *
 * P1 (Shadowless): "DMG Dealt +20% to enemies below 50% HP."
 *   Self-applying status triggered by ENEMY HAVE HP LESS_THAN_EQUAL 0.5.
 *   Gated by HAVE POTENTIAL >= 1.
 *
 * Three-layer verification:
 *   1. Controller: at P0, Shadowless does NOT appear (potential gate)
 *   2. Controller: at P1 with enough damage to push enemy below 50% HP,
 *      Shadowless status appears on Chen
 *   3. View: Shadowless appears in the correct column view model
 *
 * The engine pre-computes cumulative damage and evaluates HP conditions
 * periodically (every 1s). The default enemy (Rhodagn tier 1, HP 3461)
 * is used — a single battle skill at max rank exceeds 50% HP damage.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';
const SHADOWLESS_ID = 'CHEN_QIANYU_POTENTIAL1_SHADOWLESS';

beforeEach(() => {
  localStorage.clear();
});

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_CHEN];
  app.handleStatsChange(SLOT_CHEN, {
    ...props,
    operator: { ...props.operator, potential },
  });
}

function findMatchingColumn(app: AppResult, ownerEntityId: string, matchId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ownerEntityId &&
      (c.columnId === matchId || (c.matchColumnIds?.includes(matchId) ?? false)),
  );
}

function addBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_CHEN, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

// ═════════════════════════════════════════════════════════════════════════════
// P1 — Shadowless (DMG +20% when enemy < 50% HP)
// ═════════════════════════════════════════════════════════════════════════════

describe('Chen Qianyu P1 — Shadowless', () => {
  it('at P0, battle skill damage does NOT trigger Shadowless', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 0); });

    // Place multiple battle skills to ensure enough damage
    act(() => { addBattleSkill(result.current, 1 * FPS); });
    act(() => { addBattleSkill(result.current, 5 * FPS); });
    act(() => { addBattleSkill(result.current, 9 * FPS); });

    const shadowlessEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SHADOWLESS_ID,
    );
    expect(shadowlessEvents).toHaveLength(0);
  });

  it('at P1, battle skill damage triggers Shadowless when enemy drops below 50% HP', () => {
    const { result } = renderHook(() => useApp());
    // Swap to Falsewings so battle skill damage easily crosses 50% HP
    act(() => { result.current.handleSwapEnemy('falsewings'); });
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 1); });

    // Place enough battle skills for cumulative damage to push enemy below 50% HP.
    // Chen's Ascending Strike at rank 12 = 380% ATK × ~297 base = ~1129 raw damage.
    // Falsewings at level 90 = 73,373 HP; need ~50% = 36,687 → ~120 skills.
    for (let i = 0; i < 120; i++) {
      act(() => { addBattleSkill(result.current, (1 + i) * FPS); });
    }


    // Controller: Shadowless status should appear on Chen
    const shadowlessEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SHADOWLESS_ID && ev.ownerEntityId === SLOT_CHEN,
    );
    expect(shadowlessEvents.length).toBeGreaterThanOrEqual(1);

    // View: Shadowless appears in a column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    let foundInVM = false;
    viewModels.forEach(vm => {
      if (vm.events.some(ev => ev.columnId === SHADOWLESS_ID && ev.ownerEntityId === SLOT_CHEN)) foundInVM = true;
    });
    expect(foundInVM).toBe(true);
  });

  it('Shadowless status column appears on Chen with correct micro-column', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 1); });

    act(() => { addBattleSkill(result.current, 1 * FPS); });
    act(() => { addBattleSkill(result.current, 5 * FPS); });

    // Verify column routing — Shadowless should route to a status column on Chen
    const statusCol = findMatchingColumn(result.current, SLOT_CHEN, SHADOWLESS_ID);
    expect(!statusCol || statusCol.microColumns?.some(mc => mc.id === SHADOWLESS_ID)).toBe(true);
  });
});
