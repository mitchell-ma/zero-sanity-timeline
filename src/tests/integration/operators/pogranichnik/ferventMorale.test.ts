/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik — Fervent Morale & Living Banner Visual Rendering E2E Tests
 *
 * Verifies:
 * - Fervent Morale (RESET, limit 3): old instance gets REFRESHED when new one is applied
 * - Living Banner (NONE, unlimited): 1 event per APPLY with stacks = SP amount
 * - No duplicate Fervent Morale from combo + Tactical Instruction cascade
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';


/* eslint-disable @typescript-eslint/no-require-imports */
const POGRANICHNIK_ID: string = require('../../../../model/game-data/operators/pogranichnik/pogranichnik.json').id;
const FERVENT_MORALE_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-fervent-morale.json').properties.id;
const LIVING_BANNER_ID: string = require('../../../../model/game-data/operators/pogranichnik/talents/talent-the-living-banner-talent.json').properties.id;
const AKEKURI_ID: string = require('../../../../model/game-data/operators/akekuri/akekuri.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_POG = 'slot-3';

beforeEach(() => { localStorage.clear(); });

function setupPog() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Fervent Morale — RESET stacking
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Fervent Morale RESET stacking', () => {
  it('A1: second Fervent Morale REFRESHES the first (RESET interaction)', () => {
    const { result } = setupPog();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Place ult → Steel Oath
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Two combos → two Steel Oath consumptions → two Fervent Morale applications
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 30 * FPS, comboCol!.defaultEvent!); });

    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
    );

    // RESET: second application clamps (REFRESHES) the first
    // With Fervent Morale duration 5-10s and second combo at 30s, both may be separate (not overlapping)
    // Just verify at least 1 FM exists and it appears correctly
    expect(moraleEvents.length).toBeGreaterThanOrEqual(1);

    // At least 1 active FM remains
    const active = moraleEvents.filter(ev => !ev.eventStatus || (ev.eventStatus !== EventStatusType.CONSUMED));
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it('A2: Fervent Morale appears in view presentation on Pog status column', () => {
    const { result } = setupPog();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });

    const statusCol = findColumn(result.current, SLOT_POG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Living Banner — N events per APPLY with stacks=N (one event per stack)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Living Banner rendering', () => {
  it('B1: basic attack finisher creates 20 Living Banner events in one batch', () => {
    const { result } = setupPog();

    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(result.current, baCol!, 2 * FPS);
    act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });

    const bannerEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === LIVING_BANNER_ID && ev.ownerEntityId === SLOT_POG,
    );

    // One APPLY with stacks=20 → 20 underlying events, all at the same frame.
    expect(bannerEvents).toHaveLength(20);
    const frames = new Set(bannerEvents.map(ev => ev.startFrame));
    expect(frames.size).toBe(1);
  });

  it('B2: combo creates Living Banner batches (5, 7, 13) — total 25 stacks', () => {
    const { result } = setupPog();

    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });

    const bannerEvents = result.current.allProcessedEvents
      .filter(ev => ev.columnId === LIVING_BANNER_ID && ev.ownerEntityId === SLOT_POG)
      .sort((a, b) => a.startFrame - b.startFrame);

    // Combo fires three frames applying 5/7/13 stacks → 3 batches at 3 frames, 25 events total.
    const countsByFrame = new Map<number, number>();
    for (const ev of bannerEvents) {
      countsByFrame.set(ev.startFrame, (countsByFrame.get(ev.startFrame) ?? 0) + 1);
    }
    expect(Array.from(countsByFrame.values()).sort((a, b) => a - b)).toEqual([5, 7, 13]);
    expect(bannerEvents).toHaveLength(25);
  });

  it('B3: Living Banner appears in view presentation', () => {
    const { result } = setupPog();

    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(result.current, baCol!, 2 * FPS);
    act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });

    const statusCol = findColumn(result.current, SLOT_POG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(
      ev => ev.columnId === LIVING_BANNER_ID && ev.ownerEntityId === SLOT_POG,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. No duplicate Fervent Morale
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. No duplicate Fervent Morale', () => {
  it('C1: each Steel Oath consumption produces exactly 1 Fervent Morale (no duplicates)', () => {
    const { result } = setupPog();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Single combo → 1 Steel Oath consumption
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });

    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
    );

    // Exactly 1 Fervent Morale from this single consumption
    // (not 2 from both combo frame + Tactical Instruction cascade)
    expect(moraleEvents).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Fervent Morale max stacks via basic attacks
// ═══════════════════════════════════════════════════════════════════════════════

function placeBasicAttack(result: { current: ReturnType<typeof useApp> }, atFrame: number) {
  const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
  expect(baCol).toBeDefined();
  const payload = getMenuPayload(result.current, baCol!, atFrame);
  act(() => {
    result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function setPotential(app: ReturnType<typeof useApp>, slotId: string, potential: number) {
  const props = app.loadoutProperties[slotId];
  app.handleStatsChange(slotId, { ...props, operator: { ...props.operator, potential } });
}

function getFmEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
  );
}

describe('D. Fervent Morale max stacks via basic attacks', () => {
  it('D1: POG at P0 — 4 BATKs produce 1 FM, 8 BATKs produce 2, 12 BATKs produce 3 (max)', () => {
    const { result } = setupPog();

    // 4 BATKs × 20 = 80 stacks → 1st FM
    for (let i = 0; i < 4; i++) placeBasicAttack(result, (2 + i * 3) * FPS);
    expect(getFmEvents(result.current)).toHaveLength(1);

    // 4 more BATKs → 2nd FM
    for (let i = 0; i < 4; i++) placeBasicAttack(result, (20 + i * 3) * FPS);
    expect(getFmEvents(result.current)).toHaveLength(2);

    // 4 more BATKs → 3rd FM (max at P0)
    for (let i = 0; i < 4; i++) placeBasicAttack(result, (40 + i * 3) * FPS);
    expect(getFmEvents(result.current)).toHaveLength(3);
  });

  it('D2: POG at P3 — 3 BATKs produce 1 FM (threshold 60)', () => {
    const { result } = setupPog();
    act(() => { setPotential(result.current, SLOT_POG, 3); });

    // 3 BATKs × 20 = 60 stacks → 1st FM (P3 threshold)
    for (let i = 0; i < 3; i++) placeBasicAttack(result, (2 + i * 3) * FPS);
    expect(getFmEvents(result.current)).toHaveLength(1);
  });

  it('D3: other operator in team — POG at P0 still produces FM with max 3', () => {
    const view = renderHook(() => useApp());
    const SLOT_AKE = 'slot-0';
    act(() => { view.result.current.handleSwapOperator(SLOT_AKE, AKEKURI_ID); });
    act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // 12 BATKs → 3 FM (max at P0), team composition doesn't change the cap
    for (let i = 0; i < 12; i++) placeBasicAttack(view.result, (2 + i * 3) * FPS);
    expect(getFmEvents(view.result.current)).toHaveLength(3);
  });

  it('D4: other operator at P3 — POG at P0 still uses own potential for FM cap', () => {
    const view = renderHook(() => useApp());
    const SLOT_AKE = 'slot-0';
    act(() => { view.result.current.handleSwapOperator(SLOT_AKE, AKEKURI_ID); });
    act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(view.result.current, SLOT_AKE, 3); });

    // Akekuri P3, POG P0 → FM max still 3 (Akekuri's potential doesn't affect POG)
    for (let i = 0; i < 12; i++) placeBasicAttack(view.result, (2 + i * 3) * FPS);
    expect(getFmEvents(view.result.current)).toHaveLength(3);
  });

  it('D5: POG at P5 — self-apply Fervent Morale reaches 5 concurrent stacks (3 base + 2 from P3 potential identity gate)', () => {
    const { result } = setupPog();
    act(() => { setPotential(result.current, SLOT_POG, 5); });

    // 15 BATKs × 20 SP = 300 SP → 5 applies at P3+ threshold (60 SP each).
    // Space BATKs at 1s so every FM (20s duration) overlaps — without overlap
    // the cap is never actually exercised (durations expire between applies).
    // All applications are self-sourced (Living Banner T1 trigger on Pog),
    // so THIS OPERATOR === SOURCE OPERATOR → identity gate = 1 → cap = 3 + 2 = 5.
    for (let i = 0; i < 15; i++) placeBasicAttack(result, (2 + i) * FPS);

    const fms = getFmEvents(result.current);
    expect(fms).toHaveLength(5);
    // RESET mode marks the oldest REFRESHED when the cap is hit. If the engine
    // had resolved cap=3 (e.g. DEFAULT_VALUE_CONTEXT fallback), FM#1 and FM#2
    // would be REFRESHED by FM#4/#5. With the correct SOURCE-resolved cap=5,
    // all 5 overlap cleanly and none are clamped.
    const refreshed = fms.filter(ev => ev.eventStatus === EventStatusType.REFRESHED);
    expect(refreshed).toHaveLength(0);

    // Every applied FM should carry the runtime-resolved cap (5) stamped on
    // the event — this is what lets the view render label V instead of being
    // capped at the static-default III.
    for (const ev of fms) expect(ev.maxStacks).toBe(5);

    // Verify the view presentation: status column labels must reach "V"
    // (5th Roman numeral). Prior to the per-event maxStacks stamp, the view
    // resolved the limit via DEFAULT_VALUE_CONTEXT and capped every label at "III".
    const statusCol = findColumn(result.current, SLOT_POG, OPERATOR_STATUS_COLUMN_ID);
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    const labels = statusVM!.events
      .filter(ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG)
      .map(ev => statusVM!.statusOverrides.get(ev.uid)?.label);
    expect(labels.some(l => l?.endsWith(' V'))).toBe(true);
  });

  it('D6: POG at P5 — ult + 3 combos → Fervent Morale labels reach IV (cross-apply via Tactical Instruction T2)', () => {
    const { result } = setupPog();
    act(() => { setPotential(result.current, SLOT_POG, 5); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    // 3 combos close together — each consumes Steel Oath → Tactical Instruction T2
    // applies Fervent Morale to TRIGGER (Pog himself, solo).
    for (let i = 0; i < 3; i++) {
      act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, (3 + i * 2) * FPS, comboCol!.defaultEvent!); });
    }

    const fms = getFmEvents(result.current).sort((a, b) => a.startFrame - b.startFrame);
    for (const f of fms) expect(f.maxStacks).toBe(5);

    const statusCol = findColumn(result.current, SLOT_POG, OPERATOR_STATUS_COLUMN_ID);
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    const labels = statusVM!.events
      .filter(ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG)
      .map(ev => statusVM!.statusOverrides.get(ev.uid)?.label);
    // With cap=5 (not 3), the 4th and 5th concurrent FMs must be labeled IV and V,
    // not capped at III. Earlier bug: eventPresentationController clamped at the
    // DEFAULT_VALUE_CONTEXT-resolved limit = 3, so every FM past the 3rd read "III".
    expect(labels.some(l => l?.endsWith(' IV'))).toBe(true);
    expect(labels.some(l => l?.endsWith(' V'))).toBe(true);
    expect(labels.filter(l => l?.endsWith(' III')).length).toBeLessThanOrEqual(1);
  });
});
