/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard — Potential Effects Integration Tests
 *
 * Tests potential-driven mechanics through the full useApp pipeline:
 *   - P4: Ultimate energy cost reduction (90 * 0.85 = 76.5)
 *   - P5: Natural Predator status appears, combo cooldown reset on ult
 *   - P0: No potential effects active (negative verification)
 *
 * Three-layer verification:
 *   1. Game data: getUltimateEnergyCostForPotential resolves correctly
 *   2. Controller: allProcessedEvents, cooldown durations
 *   3. View: computeTimelinePresentation column view models
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';


import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  INFLICTION_COLUMNS, ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_JSON = require('../../../../model/game-data/operators/wulfgard/wulfgard.json');
const WULFGARD_ID: string = WULFGARD_JSON.id;

const P5_STATUS_ID: string = require(
  '../../../../model/game-data/operators/wulfgard/statuses/status-wulfgard-natural-predator.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_WULFGARD = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupWulfgardWithPotential(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });

  const props = view.result.current.loadoutProperties[SLOT_WULFGARD];
  act(() => {
    view.result.current.handleStatsChange(SLOT_WULFGARD, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });

  return view;
}

function placeHeatInfliction(
  result: { current: AppResult },
  startSec: number,
  durationSec = 30,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, startSec * FPS,
      { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. P4 — Ultimate Energy Cost Reduction
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. P4 — Ultimate Energy Cost', () => {
  it('A1: P0 ult cost is 90, P4 ult cost is 76.5', () => {
    const p0Cost = getUltimateEnergyCostForPotential(WULFGARD_ID, 0);
    const p4Cost = getUltimateEnergyCostForPotential(WULFGARD_ID, 4);

    expect(p0Cost).toBe(90);
    expect(p4Cost).toBe(76.5);
  });

  it('A2: P5 ult cost is also 76.5 (same as P4)', () => {
    const p5Cost = getUltimateEnergyCostForPotential(WULFGARD_ID, 5);
    expect(p5Cost).toBe(76.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. P5 — Natural Predator Status
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. P5 — Natural Predator', () => {
  it('B1: P5 Natural Predator activates — verified through combo cooldown reset', () => {
    // Natural Predator is a trigger (onTriggerClause), not a visible status.
    // Its effect is verified by placing combo → ult → checking cooldown shortens.
    const { result } = setupWulfgardWithPotential(5);

    placeHeatInfliction(result, 1);

    // Combo at 2s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 5s — P5 Natural Predator should reset combo cooldown
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(eventDuration(comboAfter!)).toBeLessThan(durationBefore);
  });

  it('B2: P5 ult resets combo cooldown — second combo placeable', () => {
    const { result } = setupWulfgardWithPotential(5);

    placeHeatInfliction(result, 1);

    // Place combo at 2s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 5s — should reset combo cooldown
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Combo duration should be shorter after cooldown reset
    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    const durationAfter = eventDuration(comboAfter!);
    expect(durationAfter).toBeLessThan(durationBefore);

    // View: combo in view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. P0 — No Potential Effects (Negative)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. P0 — No Potential Effects', () => {
  it('C1: P0 has no Natural Predator status', () => {
    const { result } = setupWulfgardWithPotential(0);

    // Controller: no P5 status at P0
    const npEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === P5_STATUS_ID && ev.ownerId === SLOT_WULFGARD,
    );
    expect(npEvents).toHaveLength(0);
  });

  it('C2: P0 ult does NOT reset combo cooldown', () => {
    const { result } = setupWulfgardWithPotential(0);

    placeHeatInfliction(result, 1);

    // Combo at 2s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 5s — should NOT reset combo cooldown at P0
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    const durationAfter = eventDuration(comboAfter!);

    // Duration unchanged — no cooldown reset at P0
    expect(durationAfter).toBe(durationBefore);

    // View: combo and ult both in their column VMs
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
    const ultVM = viewModels.get(ultCol!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
  });
});
