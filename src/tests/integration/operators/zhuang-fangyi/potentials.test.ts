/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Potential Modifier Tests
 *
 * Verifies that potential-gated DSL modifiers bake into Mantra of Sundering
 * correctly. Covers:
 *
 *   P1 (Four Symbols of Harmony):
 *     • DMG multiplier × 1.15 (all Thunder Strikes). Encoded as
 *       MULT(core, VARY_BY POTENTIAL [1, 1.15, 1.15, 1.15, 1.15, 1.15])
 *       wrapping the core damage value on every damage frame.
 *     • First BS cast creates 1 extra Sunderblade. Encoded as a
 *       POTENTIAL-typed status with an `onTriggerClause` gated by
 *       `THIS OPERATOR PERFORM SKILL BATTLE`
 *       ∧ `THIS OPERATOR HAVE POTENTIAL GREATER_THAN_EQUAL 1`
 *       ∧ `THIS EVENT IS OCCURRENCE WITH VALUE IS 1`.
 *       The new `OCCURRENCE` NounType counts prior instances of the same
 *       trigger status on the resolved owner and compares to the target.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, CritMode, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { findColumn, buildContextMenu } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import type { MiniTimeline } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZF_JSON = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json');
const ZF_ID: string = ZF_JSON.id;
const BS_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/skills/battle-skill-mantra-of-sundering.json',
).properties.id;
const SUNDERBLADE_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/statuses/status-sunderblade.json',
).properties.id;
const FOUR_SYMBOLS_P1_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/potentials/potential-1-four-symbols-of-harmony.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';
const P1_MULT = 1.15;

beforeEach(() => { localStorage.clear(); });

function setup(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZF_ID); });
  const props = view.result.current.loadoutProperties[SLOT_ZF];
  act(() => {
    view.result.current.handleStatsChange(SLOT_ZF, {
      ...props,
      operator: { ...props.operator, potential, talentOneLevel: 1 },
    });
  });
  return view;
}

function castBattleSkill(app: AppResult, atFrame: number) {
  const bsCol = findColumn(app, SLOT_ZF, NounType.BATTLE);
  app.handleAddEvent(SLOT_ZF, NounType.BATTLE, atFrame, bsCol!.defaultEvent!);
}

function battleSkillEvent(app: AppResult) {
  return app.allProcessedEvents.find(
    (ev) => ev.ownerEntityId === SLOT_ZF && ev.columnId === NounType.BATTLE && ev.id === BS_ID,
  );
}

function finalStrikeFrame(bsStartFrame: number) {
  return bsStartFrame + Math.round(1.7 * FPS);
}

function getBsDamageRows(app: AppResult, bsUid: string) {
  const calc = runCalculation(
    app.allProcessedEvents,
    app.columns,
    app.slots,
    app.enemy,
    app.loadoutProperties,
    app.loadouts,
    app.staggerBreaks,
    CritMode.NEVER,
    app.overrides,
  );
  return calc.rows.filter((r) => r.eventUid === bsUid);
}

describe('P1 Four Symbols of Harmony — DMG multiplier ×1.15', () => {
  it('P0: baseline — final strike mult = 0.45 × 6 = 2.70 (no 1.15× applied)', () => {
    const { result } = setup(0);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    const bs = battleSkillEvent(result.current);
    const rows = getBsDamageRows(result.current, bs!.uid);
    // Locate the final unconditional Thunder Strike specifically.
    const finalRow = rows.find((r) => r.absoluteFrame === finalStrikeFrame(bs!.startFrame));
    expect(finalRow).toBeDefined();
    expect(finalRow!.multiplier).toBeCloseTo(2.7, 6);
  });

  it('P1: final strike mult × 1.15 (2.70 → 3.105)', () => {
    const { result } = setup(1);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    const bs = battleSkillEvent(result.current);
    const rows = getBsDamageRows(result.current, bs!.uid);
    const finalRow = rows.find((r) => r.absoluteFrame === finalStrikeFrame(bs!.startFrame));
    expect(finalRow).toBeDefined();
    expect(finalRow!.multiplier).toBeCloseTo(2.7 * P1_MULT, 6);
  });

  it('P5: final strike mult still ×1.15 (P1 is a threshold, not a per-potential ramp)', () => {
    const { result } = setup(5);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    const bs = battleSkillEvent(result.current);
    const rows = getBsDamageRows(result.current, bs!.uid);
    const finalRow = rows.find((r) => r.absoluteFrame === finalStrikeFrame(bs!.startFrame));
    expect(finalRow).toBeDefined();
    expect(finalRow!.multiplier).toBeCloseTo(2.7 * P1_MULT, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P1 — "first battle skill casting creates 1 extra Sunderblade"
// Implemented as a POTENTIAL_STATUS gated by
//   PERFORM BATTLE ∧ HAVE POTENTIAL ≥ 1 ∧ THIS EVENT IS OCCURRENCE = 1
// The status's frame-0 clause APPLYs SUNDERBLADE to the operator, giving
// the first BS cast an extra stack. Subsequent casts fail the OCCURRENCE
// check so no further extras land.
// ═════════════════════════════════════════════════════════════════════════════

function countSunderblades(app: AppResult, atOrAfterFrame: number) {
  return app.allProcessedEvents.filter(
    (ev) =>
      ev.ownerEntityId === SLOT_ZF &&
      ev.columnId === SUNDERBLADE_ID &&
      ev.startFrame >= atOrAfterFrame,
  ).length;
}

function countFourSymbolsInstances(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) =>
      ev.ownerEntityId === SLOT_ZF &&
      ev.columnId === FOUR_SYMBOLS_P1_ID &&
      ev.startFrame > 0,
  ).length;
}

describe('P1 Four Symbols of Harmony — extra Sunderblade on first battle skill cast', () => {
  it('P0: first BS cast creates 1 Sunderblade only (trigger gated by potential)', () => {
    const { result } = setup(0);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    const bs = battleSkillEvent(result.current);

    expect(countSunderblades(result.current, bs!.startFrame)).toBe(1);
    expect(countFourSymbolsInstances(result.current)).toBe(0);
  });

  it('P1: first BS cast creates 2 Sunderblades (1 from BS APPLY + 1 from P1 status)', () => {
    const { result } = setup(1);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    const bs = battleSkillEvent(result.current);

    expect(countSunderblades(result.current, bs!.startFrame)).toBe(2);
    // The P1 status must have landed exactly once on the operator's timeline.
    expect(countFourSymbolsInstances(result.current)).toBe(1);
  });

  it('P1: second BS cast is blocked by OCCURRENCE — still only 1 Sunderblade from that cast', () => {
    const { result } = setup(1);
    // First cast creates the P1 status instance.
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    // Second cast far enough out that the first BS's segment has fully
    // ended (and its P1 status has expired), so the only thing blocking
    // the extra Sunderblade is the OCCURRENCE condition.
    act(() => { castBattleSkill(result.current, 20 * FPS); });

    const allBs = result.current.allProcessedEvents
      .filter((ev) => ev.ownerEntityId === SLOT_ZF && ev.columnId === NounType.BATTLE && ev.id === BS_ID)
      .sort((a, b) => a.startFrame - b.startFrame);
    expect(allBs).toHaveLength(2);
    const secondBs = allBs[1];

    // Sunderblades produced by the second cast alone: 1 (no extra from P1).
    const secondCastSunderblades = result.current.allProcessedEvents.filter(
      (ev) =>
        ev.ownerEntityId === SLOT_ZF &&
        ev.columnId === SUNDERBLADE_ID &&
        ev.startFrame >= secondBs.startFrame,
    );
    expect(secondCastSunderblades).toHaveLength(1);

    // And only one P1 status instance has landed across the entire timeline.
    expect(countFourSymbolsInstances(result.current)).toBe(1);
  });

  it('P1: extra Sunderblade upgrades the damage-row count from 1 → 2 on first cast', () => {
    // Without P1, 1 Sunderblade → only the final frame fires (1 row).
    // With P1, 2 Sunderblades → frame 1's gate (>=2) passes + final (2 rows).
    const { result } = setup(1);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    const bs = battleSkillEvent(result.current);
    const rows = getBsDamageRows(result.current, bs!.uid);
    expect(rows).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// OCCURRENCE DSL primitive — direct invariants
// ═════════════════════════════════════════════════════════════════════════════

describe('THIS EVENT IS OCCURRENCE — condition primitive', () => {
  it('resolves to "N=1" only on the first trigger firing', () => {
    const { result } = setup(1);
    // Cast three times at well-separated frames.
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    act(() => { castBattleSkill(result.current, 20 * FPS); });
    act(() => { castBattleSkill(result.current, 35 * FPS); });

    // The P1 trigger should fire exactly once — on the first cast. The
    // OCCURRENCE check (count prior + 1 === 1) is what prevents the 2nd
    // and 3rd triggers from landing another FOUR_SYMBOLS_OF_HARMONY_P1.
    expect(countFourSymbolsInstances(result.current)).toBe(1);
  });

  it('P0 with repeated casts: OCCURRENCE irrelevant — potential gate alone stops it', () => {
    const { result } = setup(0);
    act(() => { castBattleSkill(result.current, 5 * FPS); });
    act(() => { castBattleSkill(result.current, 20 * FPS); });
    expect(countFourSymbolsInstances(result.current)).toBe(0);
  });

  it('Sunderblade placed freeform (not a P1 event) does not satisfy the OCCURRENCE counter', () => {
    // Pre-apply a FOUR_SYMBOLS_OF_HARMONY_P1 instance directly via freeform:
    // place a raw Sunderblade first so we know the timeline isn't empty; the
    // P1 OCCURRENCE counter should only count events matching its own
    // columnId, not unrelated statuses on the operator.
    const { result } = setup(1);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const statusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerEntityId === SLOT_ZF &&
        c.columnId === OPERATOR_STATUS_COLUMN_ID,
    );
    const menu = buildContextMenu(result.current, statusCol!, 2 * FPS);
    const item = menu!.find(
      (i) =>
        i.actionId === 'addEvent' &&
        (i.actionPayload as AddEventPayload)?.columnId === SUNDERBLADE_ID,
    );
    if (item) {
      act(() => {
        const p = item.actionPayload as AddEventPayload;
        result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
      });
    }
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    act(() => { castBattleSkill(result.current, 10 * FPS); });

    // The BS cast is still the first OCCURRENCE of FOUR_SYMBOLS_OF_HARMONY_P1,
    // so the status lands once. Unrelated Sunderblade placements don't count.
    expect(countFourSymbolsInstances(result.current)).toBe(1);
  });
});
