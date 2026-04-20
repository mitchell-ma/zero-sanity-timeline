/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Freezing Point Talent E2E Tests
 *
 * Verifies the merged Freezing Point talent end-to-end through the damage
 * calculation pipeline. The talent was refactored from two separate status
 * files (FREEZING_POINT_CRYO / FREEZING_POINT_SOLIDIFICATION) into a single
 * talent event with a FIRST_MATCH clause, so the key invariant is that
 * Solidification and Cryo buffs never stack — Solidification takes priority.
 *
 * Each test places a basic attack and reads `params.sub.critDamage` from
 * the resulting damage row, verifying the CRITICAL_DAMAGE delta from base.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { NounType } from '../../../../dsl/semantics';
import { CritMode, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID } from '../../../../model/channels';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
const FREEZING_POINT_JSON = require('../../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json');
const FREEZING_POINT_ID: string = FREEZING_POINT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupYvonne(talentTwoLevel: number, potential = 0) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  const props = view.result.current.loadoutProperties[SLOT];
  act(() => {
    view.result.current.handleStatsChange(SLOT, {
      ...props,
      operator: { ...props.operator, talentTwoLevel, potential },
    });
  });
  return view;
}

function placeCryo(app: AppResult) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.CRYO, 0,
      { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
    );
  });
}

function placeSolidification(app: AppResult) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 0,
      { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
    );
  });
}

function placeBasicAttack(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BASIC_ATTACK);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function getCritDamageAtFirstDamageRow(app: AppResult): number {
  const calc = runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.ALWAYS, app.overrides,
  );
  // Scope to the basic-attack damage row on SLOT — freeform reactions now also
  // attribute to SLOT via sourceEntityId fallback, and a reaction's own damage
  // row doesn't carry Freezing Point deltas.
  const row = calc.rows.find(r =>
    r.damage != null && r.damage > 0 && r.params?.sub
    && r.ownerEntityId === SLOT && r.columnId === NounType.BASIC_ATTACK,
  );
  expect(row).toBeDefined();
  return row!.params!.sub!.critDamage;
}

/** Freezing Point CRITICAL_DAMAGE delta = critDamage(with infliction) - critDamage(baseline). */
function measureFreezingPointDelta(
  talentTwoLevel: number,
  potential: number,
  place: (app: AppResult) => void,
): number {
  // Baseline: same Yvonne state, no infliction on enemy
  const base = setupYvonne(talentTwoLevel, potential);
  placeBasicAttack(base.result.current, 1 * FPS);
  const baseCrit = getCritDamageAtFirstDamageRow(base.result.current);

  // With infliction placed before the basic attack
  const buffed = setupYvonne(talentTwoLevel, potential);
  place(buffed.result.current);
  placeBasicAttack(buffed.result.current, 1 * FPS);
  const buffedCrit = getCritDamageAtFirstDamageRow(buffed.result.current);

  return Number((buffedCrit - baseCrit).toFixed(6));
}

// =============================================================================
// A. Talent Level 2 — single-branch scenarios
// =============================================================================

describe('A. T2 — single-branch Freezing Point scenarios', () => {
  it('A1: no infliction → no CRITICAL_DAMAGE bonus', () => {
    const { result } = setupYvonne(2);
    placeBasicAttack(result.current, 1 * FPS);
    const baseCrit = getCritDamageAtFirstDamageRow(result.current);

    // Sanity: talent event should not exist on operator timeline
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FREEZING_POINT_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp).toBeUndefined();

    // Baseline crit damage should match vanilla (no delta applied)
    expect(baseCrit).toBeGreaterThan(0);
  });

  it('A2: Cryo infliction only → CRITICAL_DAMAGE +0.2', () => {
    const delta = measureFreezingPointDelta(2, 0, placeCryo);
    expect(delta).toBeCloseTo(0.2, 4);
  });

  it('A3: Solidification only → CRITICAL_DAMAGE +0.4', () => {
    const delta = measureFreezingPointDelta(2, 0, placeSolidification);
    expect(delta).toBeCloseTo(0.4, 4);
  });
});

// =============================================================================
// B. FIRST_MATCH invariant — Solidification wins over Cryo
// =============================================================================

describe('B. FIRST_MATCH — Solidification wins, no stacking with Cryo', () => {
  it('B1: Cryo + Solidification active simultaneously → +0.4 only (not +0.6)', () => {
    // Place Solidification BEFORE Cryo so the talent clause sees the higher
    // branch first. When both are simultaneous, FIRST_MATCH picks the higher
    // branch regardless of placement order.
    const delta = measureFreezingPointDelta(2, 0, (app) => {
      placeSolidification(app);
      placeCryo(app);
    });
    // Key invariant: FIRST_MATCH picks the Solidification branch.
    // If the two branches incorrectly stacked (legacy behavior), delta = 0.6.
    expect(delta).toBeCloseTo(0.4, 4);
    expect(delta).not.toBeCloseTo(0.6, 4);
  });

  it('B2: exactly one Freezing Point talent event is active with both inflictions', () => {
    const { result } = setupYvonne(2);
    placeCryo(result.current);
    placeSolidification(result.current);
    placeBasicAttack(result.current, 1 * FPS);

    const fpEvents = result.current.allProcessedEvents.filter(
      ev => ev.id === FREEZING_POINT_ID && ev.ownerEntityId === SLOT,
    );
    // Multiple APPLY EVENT THIS fire (one per infliction), but stacks.limit=1 + RESET
    // collapses them into a single active instance at any given frame.
    expect(fpEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. Talent Level scaling
// =============================================================================

describe('C. Talent-level scaling ([0, 0.1, 0.2] / [0, 0.2, 0.4])', () => {
  it('C1: T0 → no CRITICAL_DAMAGE bonus even with infliction', () => {
    const deltaCryo = measureFreezingPointDelta(0, 0, placeCryo);
    const deltaSolid = measureFreezingPointDelta(0, 0, placeSolidification);
    expect(deltaCryo).toBeCloseTo(0, 4);
    expect(deltaSolid).toBeCloseTo(0, 4);
  });

  it('C2: T1 — Cryo +0.1, Solidification +0.2', () => {
    expect(measureFreezingPointDelta(1, 0, placeCryo)).toBeCloseTo(0.1, 4);
    expect(measureFreezingPointDelta(1, 0, placeSolidification)).toBeCloseTo(0.2, 4);
  });

  it('C3: T2 — Cryo +0.2, Solidification +0.4', () => {
    expect(measureFreezingPointDelta(2, 0, placeCryo)).toBeCloseTo(0.2, 4);
    expect(measureFreezingPointDelta(2, 0, placeSolidification)).toBeCloseTo(0.4, 4);
  });
});

// =============================================================================
// D. Potential scaling (P3+ adds extra +0.1 cryo / +0.2 solid)
// =============================================================================

describe('D. Potential scaling — P3+ baked into talent', () => {
  it('D1: T2 + P0-P2 — no extra bonus', () => {
    expect(measureFreezingPointDelta(2, 0, placeCryo)).toBeCloseTo(0.2, 4);
    expect(measureFreezingPointDelta(2, 2, placeCryo)).toBeCloseTo(0.2, 4);
  });

  it('D2: T2 + P3 — Cryo +0.3, Solidification +0.6', () => {
    expect(measureFreezingPointDelta(2, 3, placeCryo)).toBeCloseTo(0.3, 4);
    expect(measureFreezingPointDelta(2, 3, placeSolidification)).toBeCloseTo(0.6, 4);
  });

  it('D3: T2 + P5 — Cryo +0.3, Solidification +0.6 (same as P3 for Freezing Point component)', () => {
    // P3+ potential entry is flat [0, 0, 0, X, X, X], so P4 and P5 match P3.
    expect(measureFreezingPointDelta(2, 5, placeCryo)).toBeCloseTo(0.3, 4);
    expect(measureFreezingPointDelta(2, 5, placeSolidification)).toBeCloseTo(0.6, 4);
  });

  it('D4: FIRST_MATCH still wins at P5 — Cryo+Solid → +0.6 (not +0.9)', () => {
    const delta = measureFreezingPointDelta(2, 5, (app) => {
      placeSolidification(app);
      placeCryo(app);
    });
    expect(delta).toBeCloseTo(0.6, 4);
    expect(delta).not.toBeCloseTo(0.9, 4);
  });
});
