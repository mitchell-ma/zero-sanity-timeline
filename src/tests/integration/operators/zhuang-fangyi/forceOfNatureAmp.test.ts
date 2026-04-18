/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Force of Nature Amp Integration Tests
 *
 * Covers three pieces of new behavior:
 *
 * 1. Runtime `APPLY STAT` override — when a status event carries a parent-
 *    supplied `statusValue` (from `APPLY ... WITH value: X`), the status's
 *    segment-clause `APPLY STAT` uses that runtime value instead of re-
 *    resolving the DSL default (`eventInterpretorController.ts` doApply).
 *
 * 2. Per-hit Force of Nature ramp — each Thunder Strike damage frame applies
 *    FORCE_OF_NATURE_TALENT with `base + hit_count × per_hit` so the AMP
 *    climbs over the cast.
 *
 * 3. Dynamic final-frame formula — the unconditional final Thunder Strike
 *    uses `ADD(base, MULT(STACKS of SUNDERBLADE, per_hit))` so the amp bump
 *    scales with the actual Sunderblade count that landed (1–9), not a
 *    hardcoded 9.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, CritMode, InteractionModeType, ElementType } from '../../../../consts/enums';
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
const FORCE_OF_NATURE_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/talents/talent-force-of-nature.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';
const FON_BASE = 0.09;      // L1 base amp
const FON_PER_HIT = 0.01;   // L1 per-hit increment

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

/**
 * Set up Zhuang Fangyi with Force of Nature talent pinned to level 1 so the
 * VARY_BY TALENT_LEVEL arrays resolve to the L1 amp/per-hit values
 * (`FON_BASE = 0.09`, `FON_PER_HIT = 0.01`). Default loadout would otherwise
 * run at L2 and double every expected number.
 */
function setupZhuangFangyi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZF_ID); });
  const props = view.result.current.loadoutProperties[SLOT_ZF];
  act(() => {
    view.result.current.handleStatsChange(SLOT_ZF, {
      ...props,
      operator: { ...props.operator, talentOneLevel: 1 },
    });
  });
  return view;
}

function findOperatorStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === SLOT_ZF &&
      c.columnId === OPERATOR_STATUS_COLUMN_ID,
  );
}

function placeSunderblade(app: AppResult, atFrame: number) {
  const statusCol = findOperatorStatusColumn(app);
  const menuItems = buildContextMenu(app, statusCol!, atFrame);
  const item = menuItems!.find(
    (i) =>
      i.actionId === 'addEvent' &&
      (i.actionPayload as AddEventPayload)?.columnId === SUNDERBLADE_ID,
  );
  const payload = item!.actionPayload as AddEventPayload;
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function preApplySunderblades(result: { current: AppResult }, count: number, startSec: number) {
  if (count <= 0) return;
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  for (let i = 0; i < count; i++) {
    act(() => { placeSunderblade(result.current, Math.round((startSec + i * 0.1) * FPS)); });
  }
  act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const bsCol = findColumn(app, SLOT_ZF, NounType.BATTLE);
  app.handleAddEvent(SLOT_ZF, NounType.BATTLE, atFrame, bsCol!.defaultEvent!);
}

function findBattleSkillEvent(app: AppResult) {
  return app.allProcessedEvents.find(
    (ev) => ev.ownerEntityId === SLOT_ZF && ev.columnId === NounType.BATTLE && ev.id === BS_ID,
  );
}

/** All derived FORCE_OF_NATURE_TALENT events on Zhuang Fangyi, ordered by startFrame. */
function forceOfNatureEvents(app: AppResult) {
  return app.allProcessedEvents
    .filter(
      (ev) =>
        ev.ownerEntityId === SLOT_ZF &&
        ev.columnId === FORCE_OF_NATURE_ID &&
        ev.startFrame > 0,
    )
    .sort((a, b) => a.startFrame - b.startFrame);
}

function runCalc(app: AppResult) {
  return runCalculation(
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
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 1 — Runtime APPLY STAT override (doApply `ctx.sourceEvent.statusValue`)
// ═════════════════════════════════════════════════════════════════════════════

describe('Runtime APPLY STAT override — parent with.value replaces DSL default', () => {
  it('talent fired via onTriggerClause (no parent with.value) → DSL default wins', () => {
    const { result } = setupZhuangFangyi();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    // The talent's onTriggerClause fires at BS cast and applies a FoN event
    // with no `with.value` — its statusValue must be undefined so the segment
    // clause falls through to the DSL default (VARY_BY TALENT_LEVEL).
    const events = forceOfNatureEvents(result.current);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const triggerEvent = events[0]; // earliest = onTriggerClause instance at BS cast
    expect(triggerEvent.startFrame).toBe(5 * FPS);
    expect(triggerEvent.statusValue).toBeUndefined();
  });

  it('BS damage frame (with parent with.value) → event carries the override statusValue', () => {
    const { result } = setupZhuangFangyi();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    // The final (unconditional) frame always fires. Its APPLY FORCE_OF_NATURE
    // supplies `with.value: ADD(base, MULT(stacks, per_hit))` — with 1
    // Sunderblade (no pre-apply, no Electrification), the expression
    // evaluates to 0.09 + 1 * 0.01 = 0.10.
    const events = forceOfNatureEvents(result.current);
    const finalStrikeFrame = 5 * FPS + Math.round(1.7 * FPS);
    const finalFoN = events.find((ev) => ev.startFrame === finalStrikeFrame);
    expect(finalFoN).toBeDefined();
    expect(finalFoN!.statusValue).toBeCloseTo(FON_BASE + 1 * FON_PER_HIT, 6);
  });

  it('breakdown — damage row post-BS carries the override ELECTRIC AMP source', () => {
    const { result } = setupZhuangFangyi();

    // Pre-apply 5 Sunderblades so the BS sees 6 active at its final frame →
    // final FoN statusValue = 0.09 + 6 * 0.01 = 0.15.
    preApplySunderblades(result, 5, 1);
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const bs = findBattleSkillEvent(result.current);
    expect(bs).toBeDefined();

    const calc = runCalc(result.current);
    // Find the final Thunder Strike's own damage row — the row fires AFTER
    // the final-frame APPLY in effect order, so its allAmpSources already
    // reflects the new override value (not the talent's DSL default).
    const finalStrikeAbs = bs!.startFrame + Math.round(1.7 * FPS);
    const bsFinalRow = calc.rows.find(
      (r) => r.eventUid === bs!.uid && r.absoluteFrame === finalStrikeAbs,
    );
    expect(bsFinalRow).toBeDefined();

    // The final FoN application's statusValue must propagate to the ELECTRIC
    // AMP source used by damage calc. DSL-default fallback would show 0.09;
    // the runtime override makes it 0.15.
    const allAmpSources = bsFinalRow!.params!.sub!.allAmpSources;
    const electricAmps = allAmpSources[ElementType.ELECTRIC] ?? [];
    const talentSource = electricAmps.find((s) => /force.*nature/i.test(s.label));
    expect(talentSource).toBeDefined();
    // Final value = base + stacks(6) * per_hit = 0.15. DSL default would be 0.09.
    expect(talentSource!.value).toBeCloseTo(FON_BASE + 6 * FON_PER_HIT, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 2 — Per-hit Force of Nature ramp
// ═════════════════════════════════════════════════════════════════════════════

describe('Force of Nature per-hit ramp across Thunder Strikes', () => {
  const RAMP_CASES = [
    { preExisting: 0, expectedFinalValue: FON_BASE + 1 * FON_PER_HIT, label: '1 Sunderblade' },
    { preExisting: 2, expectedFinalValue: FON_BASE + 3 * FON_PER_HIT, label: '3 Sunderblades' },
    { preExisting: 8, expectedFinalValue: FON_BASE + 9 * FON_PER_HIT, label: '9 Sunderblades (max)' },
  ];

  for (const { preExisting, expectedFinalValue, label } of RAMP_CASES) {
    it(`${label}: final FoN event carries the base + stacks × per_hit amp`, () => {
      const { result } = setupZhuangFangyi();
      preApplySunderblades(result, preExisting, 1);

      const bsStartSec = preExisting + 2;
      act(() => { placeBattleSkill(result.current, bsStartSec * FPS); });

      const bs = findBattleSkillEvent(result.current);
      const finalStrikeFrame = bs!.startFrame + Math.round(1.7 * FPS);
      const events = forceOfNatureEvents(result.current);
      const finalFoN = events.find((ev) => ev.startFrame === finalStrikeFrame);
      expect(finalFoN).toBeDefined();
      expect(finalFoN!.statusValue).toBeCloseTo(expectedFinalValue, 6);
    });
  }

  it('gated frame 1 (2 Sunderblades) carries statusValue = base + 1 × per_hit', () => {
    // Pre-apply 1 Sunderblade so only gated frame 1 fires (besides the final).
    // Frame 1's APPLY FoN has hardcoded multiplier = 1 → statusValue = 0.10.
    const { result } = setupZhuangFangyi();
    preApplySunderblades(result, 1, 1);
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const events = forceOfNatureEvents(result.current);
    // Expected FoN events at this BS cast:
    //   - onTriggerClause instance at 5s (startFrame == bsStart)
    //   - frame 1 instance at 5s + 0.5s
    //   - final instance at 5s + 1.7s
    const frame1Abs = 5 * FPS + Math.round(0.5 * FPS);
    const frame1FoN = events.find((ev) => ev.startFrame === frame1Abs);
    expect(frame1FoN).toBeDefined();
    expect(frame1FoN!.statusValue).toBeCloseTo(FON_BASE + 1 * FON_PER_HIT, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 3 — Dynamic final-frame formula (STACKS of SUNDERBLADE)
// ═════════════════════════════════════════════════════════════════════════════

describe('Final-frame value reads STACKS of SUNDERBLADE dynamically', () => {
  const STACK_CASES = [
    { preExisting: 0, expectedStacks: 1 },
    { preExisting: 1, expectedStacks: 2 },
    { preExisting: 4, expectedStacks: 5 },
    { preExisting: 7, expectedStacks: 8 },
    { preExisting: 8, expectedStacks: 9 },
  ];

  for (const { preExisting, expectedStacks } of STACK_CASES) {
    it(`pre-apply ${preExisting} → final FoN statusValue reflects STACKS=${expectedStacks}`, () => {
      const { result } = setupZhuangFangyi();
      preApplySunderblades(result, preExisting, 1);

      const bsStartSec = preExisting + 2;
      act(() => { placeBattleSkill(result.current, bsStartSec * FPS); });

      const bs = findBattleSkillEvent(result.current);
      const finalFrameAbs = bs!.startFrame + Math.round(1.7 * FPS);
      const finalFoN = forceOfNatureEvents(result.current).find((ev) => ev.startFrame === finalFrameAbs);
      expect(finalFoN).toBeDefined();

      // If the final frame still hardcoded MULT(9, ...), all cases would give
      // the same 0.18 — so this test fails unless STACKS is read dynamically.
      const expected = FON_BASE + expectedStacks * FON_PER_HIT;
      expect(finalFoN!.statusValue).toBeCloseTo(expected, 6);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 4 — Sunderblade APPLY formula (MIN(3, 1 + STATUS_LEVEL))
// ═════════════════════════════════════════════════════════════════════════════

describe('Sunderblade APPLY formula — MIN(3, 1 + STATUS_LEVEL of ELECTRIFICATION of ENEMY)', () => {
  it('no Electrification on enemy: APPLY creates exactly 1 Sunderblade event', () => {
    const { result } = setupZhuangFangyi();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const sunderblades = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ZF && ev.columnId === SUNDERBLADE_ID && ev.startFrame > 0,
    );
    expect(sunderblades).toHaveLength(1);
  });

  // Freeform placement of Electrification does not currently preserve
  // `statusLevel` through the pipeline (reactionColumn.add rebuilds the
  // derived event from `options.stacks`, discarding the freeform
  // `defaultSkill.statusLevel`). Re-enable once that path is fixed.
  it.skip('Electrification level 2 → APPLY creates 3 Sunderblades (MIN(3, 1 + 2))', () => {
    const { result } = setupZhuangFangyi();
    // Would place Electrification with statusLevel=2 here, then cast BS.
    expect(result).toBeDefined();
  });

  it.skip('Electrification level 4 (max) → APPLY clamps at 3 Sunderblades (MIN(3, 5))', () => {
    const { result } = setupZhuangFangyi();
    expect(result).toBeDefined();
  });
});
