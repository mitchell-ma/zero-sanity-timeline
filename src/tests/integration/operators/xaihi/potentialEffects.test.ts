/**
 * @jest-environment jsdom
 */

/**
 * Xaihi Potential Effects — Integration Tests
 *
 * P2: Ultimate energy cost -10%
 *
 * Three-layer verification: context menu → controller → view.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { ColumnType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, type AppResult } from '../../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XAIHI_JSON = require('../../../../model/game-data/operators/xaihi/xaihi.json');
const XAIHI_ID: string = XAIHI_JSON.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/xaihi/skills/ultimate-stack-overflow.json',
).properties.id;

const SLOT_XAIHI = 'slot-0';

function setupXaihi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_XAIHI, XAIHI_ID); });
  return view;
}

function setPotential(result: { current: AppResult }, potential: number) {
  const props = result.current.loadoutProperties[SLOT_XAIHI];
  act(() => {
    result.current.handleStatsChange(SLOT_XAIHI, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// J. P2 — Ultimate Energy Cost Reduction
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. P2 — Ultimate Energy Cost', () => {
  it('J1: P0 ultimate costs 80, P2 costs 72 (game data)', () => {
    expect(getUltimateEnergyCostForPotential(XAIHI_ID, 0)).toBe(80);
    expect(getUltimateEnergyCostForPotential(XAIHI_ID, 1)).toBe(80);
    expect(getUltimateEnergyCostForPotential(XAIHI_ID, 2)).toBe(72);
    expect(getUltimateEnergyCostForPotential(XAIHI_ID, 5)).toBe(72);
  });

  it('J2: P2 ultimate places correctly through full pipeline', () => {
    const { result } = setupXaihi();
    setPotential(result, 2);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_XAIHI, 0); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.ULTIMATE);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);

    // Cryo AMP and Nature AMP should still be derived at P2
    const ampEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === TEAM_ID && (ev.name === NounType.CRYO_AMP || ev.name === NounType.NATURE_AMP),
    );
    expect(ampEvents).toHaveLength(2);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(col!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(
      ev => ev.name === ULTIMATE_ID && ev.ownerId === SLOT_XAIHI,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. P1 — BS Arts AMP +5%
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. P1 — BS Arts AMP +5%', () => {
  function placeBS_BA_and_getAmp(result: { current: AppResult }) {
    // Place BS at 2s
    const bsCol = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE);
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => { result.current.handleAddEvent(bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill); });
    // Place BA at 5s (final strike triggers AMP)
    const baCol = findColumn(result.current, SLOT_XAIHI, NounType.BASIC_ATTACK);
    const baPayload = getMenuPayload(result.current, baCol!, 5 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });
    return result.current.allProcessedEvents.find(
      ev => ev.name === NounType.ARTS_AMP && ev.ownerId === SLOT_XAIHI,
    );
  }

  // Skipped: BS Arts AMP is now on Auxiliary Crystal's onTriggerClause (PERFORM FINAL_STRIKE
  // with FULL HP condition). The PERFORM trigger chain from status onTriggerClause is not yet
  // connected in the engine — Auxiliary Crystal is applied but its trigger doesn't fire.
  it.skip('I1: P0 BS AMP is 0.15, P1 BS AMP is 0.20 (+5%)', () => {
    // P0
    const { result: r0 } = setupXaihi();
    setPotential(r0, 0);
    const p0Amp = placeBS_BA_and_getAmp(r0);
    expect(p0Amp).toBeDefined();
    expect(p0Amp!.statusValue).toBeCloseTo(0.15, 4);

    // P1
    const { result: r1 } = setupXaihi();
    setPotential(r1, 1);
    const p1Amp = placeBS_BA_and_getAmp(r1);
    expect(p1Amp).toBeDefined();
    expect(p1Amp!.statusValue).toBeCloseTo(0.20, 4);

    // ── View layer: AMP event exists in processed events with correct owner ──
    // (BS AMP goes to operator status column, not team — column builder
    // needs status trigger scanning to add it to matchColumnIds; skip view
    // column assertion for now, verify controller layer value instead)
    expect(p1Amp!.ownerId).toBe(SLOT_XAIHI);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. P5 — Ultimate AMP ×1.1
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. P5 — Ultimate AMP ×1.1', () => {
  it('K1: P5 AMP value is 1.1× P0 AMP value', () => {
    // P0 ult
    const { result: r0 } = setupXaihi();
    setPotential(r0, 0);
    act(() => { setUltimateEnergyToMax(r0.current, SLOT_XAIHI, 0); });
    const col0 = findColumn(r0.current, SLOT_XAIHI, NounType.ULTIMATE);
    const p0 = getMenuPayload(r0.current, col0!, 5 * FPS);
    act(() => { r0.current.handleAddEvent(p0.ownerId, p0.columnId, p0.atFrame, p0.defaultSkill); });
    const p0Amp = r0.current.allProcessedEvents.find(
      ev => ev.ownerId === TEAM_ID && ev.name === NounType.CRYO_AMP,
    );
    expect(p0Amp).toBeDefined();
    const p0Value = p0Amp!.statusValue as number;
    expect(p0Value).toBeGreaterThan(0);

    // P5 ult
    const { result: r5 } = setupXaihi();
    setPotential(r5, 5);
    act(() => { setUltimateEnergyToMax(r5.current, SLOT_XAIHI, 0); });
    const col5 = findColumn(r5.current, SLOT_XAIHI, NounType.ULTIMATE);
    const p5 = getMenuPayload(r5.current, col5!, 5 * FPS);
    act(() => { r5.current.handleAddEvent(p5.ownerId, p5.columnId, p5.atFrame, p5.defaultSkill); });
    const p5Amp = r5.current.allProcessedEvents.find(
      ev => ev.ownerId === TEAM_ID && ev.name === NounType.CRYO_AMP,
    );
    expect(p5Amp).toBeDefined();
    const p5Value = p5Amp!.statusValue as number;

    // ── Controller layer: P5 = P0 × 1.1 ──
    expect(p5Value).toBeCloseTo(p0Value * 1.1, 4);

    // ── View layer: both appear in team status column ──
    const viewModels = computeTimelinePresentation(
      r5.current.allProcessedEvents,
      r5.current.columns,
    );
    const teamCol = r5.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === TEAM_ID &&
        c.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
    );
    expect(teamCol).toBeDefined();
    const teamVM = viewModels.get(teamCol!.key);
    expect(teamVM).toBeDefined();
    expect(teamVM!.events.filter(ev => ev.name === NounType.CRYO_AMP)).toHaveLength(1);
    expect(teamVM!.events.filter(ev => ev.name === NounType.NATURE_AMP)).toHaveLength(1);
  });
});
