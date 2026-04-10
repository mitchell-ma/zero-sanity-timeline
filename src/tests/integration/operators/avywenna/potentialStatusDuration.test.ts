/**
 * @jest-environment jsdom
 */

/**
 * Avywenna — Potential-Dependent Status Duration Tests
 *
 * Verifies that P2 correctly extends Thunderlance and Thunderlance EX durations:
 *   P0–P1: 30s base + 0 = 30s
 *   P2–P5: 30s base + 20s = 50s
 *
 * Three-layer verification:
 *   1. Game data: resolveDurationSeconds returns correct values per potential
 *   2. Controller: allProcessedEvents status durations reflect operator potential
 *   3. View: computeTimelinePresentation includes status events with correct durations
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, ColumnType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { eventDuration } from '../../../../consts/viewTypes';
import { getOperatorStatuses } from '../../../../model/game-data/operatorStatusesStore';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const AVYWENNA_ID: string = require(
  '../../../../model/game-data/operators/avywenna/avywenna.json',
).id;

const THUNDERLANCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance.json',
).properties.id;

const THUNDERLANCE_EX_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-ex.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const SLOT_INDEX = 0;

// Duration expectations (in seconds)
const BASE_DURATION = 30;
const P2_BONUS = 20;

beforeEach(() => {
  localStorage.clear();
});

function setupAvywennaWithPotential(potential: number) {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT, AVYWENNA_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });

  const props = view.result.current.loadoutProperties[SLOT];
  act(() => {
    view.result.current.handleStatsChange(SLOT, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });

  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Game Data — resolveDurationSeconds
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Game data: resolveDurationSeconds by potential', () => {
  const statuses = getOperatorStatuses(AVYWENNA_ID);
  const thunderlance = statuses.find(s => s.id === THUNDERLANCE_STATUS_ID)!;
  const thunderlanceEx = statuses.find(s => s.id === THUNDERLANCE_EX_STATUS_ID)!;

  it('A1: Thunderlance base durationSeconds (P0) is 30s', () => {
    expect(thunderlance.durationSeconds).toBe(BASE_DURATION);
    expect(thunderlance.resolveDurationSeconds(0)).toBe(BASE_DURATION);
  });

  it('A2: Thunderlance P1 durationSeconds is still 30s', () => {
    expect(thunderlance.resolveDurationSeconds(1)).toBe(BASE_DURATION);
  });

  it('A3: Thunderlance P2 durationSeconds is 50s', () => {
    expect(thunderlance.resolveDurationSeconds(2)).toBe(BASE_DURATION + P2_BONUS);
  });

  it('A4: Thunderlance P5 durationSeconds is 50s', () => {
    expect(thunderlance.resolveDurationSeconds(5)).toBe(BASE_DURATION + P2_BONUS);
  });

  it('A5: Thunderlance EX P0 durationSeconds is 30s', () => {
    expect(thunderlanceEx.resolveDurationSeconds(0)).toBe(BASE_DURATION);
  });

  it('A6: Thunderlance EX P2 durationSeconds is 50s', () => {
    expect(thunderlanceEx.resolveDurationSeconds(2)).toBe(BASE_DURATION + P2_BONUS);
  });

  it('A7: Thunderlance EX P5 durationSeconds is 50s', () => {
    expect(thunderlanceEx.resolveDurationSeconds(5)).toBe(BASE_DURATION + P2_BONUS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Controller — Combo deploys Thunderlance with potential-dependent duration
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Combo Thunderlance duration by potential', () => {
  it('B1: P0 — Thunderlance duration is 30s', () => {
    const { result } = setupAvywennaWithPotential(0);

    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const thunderlanceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    expect(thunderlanceEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(thunderlanceEvents[0])).toBe(BASE_DURATION * FPS);
  });

  it('B2: P2 — Thunderlance duration is 50s', () => {
    const { result } = setupAvywennaWithPotential(2);

    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const thunderlanceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    expect(thunderlanceEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(thunderlanceEvents[0])).toBe((BASE_DURATION + P2_BONUS) * FPS);
  });

  it('B3: P5 — Thunderlance duration is 50s', () => {
    const { result } = setupAvywennaWithPotential(5);

    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const thunderlanceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    expect(thunderlanceEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(thunderlanceEvents[0])).toBe((BASE_DURATION + P2_BONUS) * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Controller — Ultimate deploys Thunderlance EX with potential-dependent duration
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Ultimate Thunderlance EX duration by potential', () => {
  it('C1: P0 — Thunderlance EX duration is 30s', () => {
    const { result } = setupAvywennaWithPotential(0);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const exEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
    );
    expect(exEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(exEvents[0])).toBe(BASE_DURATION * FPS);
  });

  it('C2: P2 — Thunderlance EX duration is 50s', () => {
    const { result } = setupAvywennaWithPotential(2);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const exEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
    );
    expect(exEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(exEvents[0])).toBe((BASE_DURATION + P2_BONUS) * FPS);
  });

  it('C3: P5 — Thunderlance EX duration is 50s', () => {
    const { result } = setupAvywennaWithPotential(5);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const exEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
    );
    expect(exEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(exEvents[0])).toBe((BASE_DURATION + P2_BONUS) * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. View Layer — Presentation reflects potential-dependent durations
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. View layer: Thunderlance duration in presentation', () => {
  it('D1: P0 vs P5 Thunderlance events have different durations in view models', () => {
    const { result: resultP0 } = setupAvywennaWithPotential(0);
    const { result: resultP5 } = setupAvywennaWithPotential(5);

    // Place combo in both setups
    for (const result of [resultP0, resultP5]) {
      const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
      const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // Verify P0 Thunderlance events are in the view
    const vmP0 = computeTimelinePresentation(
      resultP0.current.allProcessedEvents,
      resultP0.current.columns,
    );
    const statusColP0 = resultP0.current.columns.find(
      c => c.type === ColumnType.MINI_TIMELINE
        && (c as MiniTimeline).ownerEntityId === SLOT
        && (c as MiniTimeline).columnId === OPERATOR_STATUS_COLUMN_ID,
    );
    expect(statusColP0).toBeDefined();
    const vmStatusP0 = vmP0.get(statusColP0!.key);
    expect(vmStatusP0).toBeDefined();
    const p0Event = vmStatusP0!.events.find(ev => ev.name === THUNDERLANCE_STATUS_ID);
    expect(p0Event).toBeDefined();

    // Verify P5 Thunderlance events are in the view
    const vmP5 = computeTimelinePresentation(
      resultP5.current.allProcessedEvents,
      resultP5.current.columns,
    );
    const statusColP5 = resultP5.current.columns.find(
      c => c.type === ColumnType.MINI_TIMELINE
        && (c as MiniTimeline).ownerEntityId === SLOT
        && (c as MiniTimeline).columnId === OPERATOR_STATUS_COLUMN_ID,
    );
    expect(statusColP5).toBeDefined();
    const vmStatusP5 = vmP5.get(statusColP5!.key);
    expect(vmStatusP5).toBeDefined();
    const p5Event = vmStatusP5!.events.find(ev => ev.name === THUNDERLANCE_STATUS_ID);
    expect(p5Event).toBeDefined();

    // P5 duration should be longer than P0
    expect(eventDuration(p5Event!)).toBeGreaterThan(eventDuration(p0Event!));
    expect(eventDuration(p0Event!)).toBe(BASE_DURATION * FPS);
    expect(eventDuration(p5Event!)).toBe((BASE_DURATION + P2_BONUS) * FPS);
  });
});
