/**
 * @jest-environment jsdom
 */

/**
 * Akekuri P1 & P3 — Potential Status Integration Tests
 *
 * P1 (Positive Feedback): "After recovering SP with skills, Akekuri gains
 *   ATK +10% for 10s. This effect can reach 5 stacks."
 *   Triggers on RECOVER SKILL_POINT — fires from combo skill and ultimate frames.
 *
 * P3 (Committed Team Player): "Ultimate SQUAD! ON ME! improved: While ultimate
 *   is active, entire team gains ATK +10%."
 *   TEAM-targeted status applied at ultimate active segment start.
 *
 * Three-layer verification:
 *   1. Controller: at P0, statuses do NOT appear
 *   2. Controller: at correct potential, statuses DO appear with correct owner/column
 *   3. View: statuses appear in the correct column view models
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

const SLOT_AKEKURI = 'slot-1';
const P1_STATUS_ID = 'AKEKURI_P1_POSITIVE_FEEDBACK';
const P3_STATUS_ID = 'AKEKURI_P3_COMMITTED_TEAM_PLAYER';

beforeEach(() => {
  localStorage.clear();
});

function findTeamStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === TEAM_ID &&
      c.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
  );
}

function addCombo(app: AppResult, atFrame: number) {
  const comboCol = findColumn(app, SLOT_AKEKURI, NounType.COMBO);
  expect(comboCol).toBeDefined();
  const payload = getMenuPayload(app, comboCol!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function addUltimate(app: AppResult, atFrame: number) {
  const ultCol = findColumn(app, SLOT_AKEKURI, NounType.ULTIMATE);
  expect(ultCol).toBeDefined();
  const payload = getMenuPayload(app, ultCol!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_AKEKURI];
  app.handleStatsChange(SLOT_AKEKURI, {
    ...props,
    operator: { ...props.operator, potential },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// P1 — Positive Feedback (ATK +10% on SP recovery, 5 stacks, 10s)
// ═════════════════════════════════════════════════════════════════════════════

describe('Akekuri P1 — Positive Feedback', () => {
  it('at P0, combo skill SP recovery does NOT trigger Positive Feedback', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 0); });

    act(() => { addCombo(result.current, 1 * FPS); });

    const p1Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === P1_STATUS_ID,
    );
    expect(p1Events).toHaveLength(0);
  });

  it('at P1, combo skill SP recovery triggers Positive Feedback on Akekuri', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 1); });

    act(() => { addCombo(result.current, 1 * FPS); });

    // Combo has 2 RECOVER SKILL_POINT frames → should produce Positive Feedback stacks
    const p1Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === P1_STATUS_ID && ev.ownerEntityId === SLOT_AKEKURI,
    );
    expect(p1Events.length).toBeGreaterThanOrEqual(1);

    // View: appears in Akekuri's status column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    let foundInVM = false;
    viewModels.forEach(vm => {
      if (vm.events.some(ev => ev.columnId === P1_STATUS_ID && ev.ownerEntityId === SLOT_AKEKURI)) foundInVM = true;
    });
    expect(foundInVM).toBe(true);
  });

  it('at P1, ultimate SP recovery also triggers Positive Feedback', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 1); });

    act(() => { addUltimate(result.current, 1 * FPS); });

    // Ultimate has 3 RECOVER SKILL_POINT frames → should produce Positive Feedback stacks
    const p1Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === P1_STATUS_ID && ev.ownerEntityId === SLOT_AKEKURI,
    );
    expect(p1Events.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3 — Committed Team Player (team ATK +10% during ultimate)
// ═════════════════════════════════════════════════════════════════════════════

describe('Akekuri P3 — Committed Team Player', () => {
  it('at P0, ultimate does NOT produce the team ATK status', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Set potential to 0
    act(() => { setPotential(result.current, 0); });

    // Add ultimate at t=1s
    act(() => { addUltimate(result.current, 1 * FPS); });

    // Controller: no COMMITTED_TEAM_PLAYER events
    const p3Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === P3_STATUS_ID,
    );
    expect(p3Events).toHaveLength(0);
  });

  it('at P3, ultimate produces COMMITTED_TEAM_PLAYER on team column', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Set potential to 3
    act(() => { setPotential(result.current, 3); });

    // Add ultimate at t=1s
    act(() => { addUltimate(result.current, 1 * FPS); });

    // Controller: COMMITTED_TEAM_PLAYER appears under TEAM_ID
    const p3Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === P3_STATUS_ID && ev.ownerEntityId === TEAM_ID,
    );
    expect(p3Events.length).toBeGreaterThanOrEqual(1);

    // View: appears in team-status column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const teamCol = findTeamStatusColumn(result.current);
    expect(teamCol).toBeDefined();
    const teamVM = viewModels.get(teamCol!.key);
    expect(teamVM).toBeDefined();
    const vmP3Events = teamVM!.events.filter(
      (ev) => ev.columnId === P3_STATUS_ID,
    );
    expect(vmP3Events.length).toBeGreaterThanOrEqual(1);
  });
});
