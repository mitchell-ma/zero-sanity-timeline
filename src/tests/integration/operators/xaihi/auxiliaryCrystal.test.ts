/**
 * @jest-environment jsdom
 */

/**
 * Xaihi Auxiliary Crystal — Integration Tests
 *
 * Tests that the battle skill applies AUXILIARY_CRYSTAL status to the CONTROLLED
 * operator, not to Xaihi herself. Xaihi is placed in slot-2; the controlled
 * operator is slot-0 by default.
 *
 * Three-layer verification:
 * 1. Context menu: BS add-event is available on Xaihi's column
 * 2. Controller: AC status events appear in allProcessedEvents with correct ownerId
 * 3. View: AC events render in the correct operator's status column ViewModel
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { OPERATOR_COLUMNS, OPERATOR_STATUS_COLUMN_ID, COMBO_WINDOW_COLUMN_ID, INFLICTION_COLUMNS, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { ColumnType, CombatSkillType, EventStatusType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, type AppResult } from '../../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XAIHI_JSON = require('../../../../model/game-data/operators/xaihi/xaihi.json');
const XAIHI_ID: string = XAIHI_JSON.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AC_STATUS_ID: string = require(
  '../../../../model/game-data/operators/xaihi/statuses/status-auxiliary-crystal.json',
).properties.id;

const SLOT_DEFAULT_CONTROLLED = 'slot-0';
const SLOT_XAIHI = 'slot-2';

function setupXaihiInSlot2() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_XAIHI, XAIHI_ID); });
  return view;
}

/** Find the operator-status column for a slot (uses matchColumnIds for micro-column routing). */
function findStatusColumn(app: AppResult, slotId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === OPERATOR_STATUS_COLUMN_ID,
  );
}

describe('D. Auxiliary Crystal targeting', () => {
  it('D1: BS applies AUXILIARY_CRYSTAL to controlled operator (slot-0), not to Xaihi (slot-2)', () => {
    const { result } = setupXaihiInSlot2();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE_SKILL);
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
    const acEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === AC_STATUS_ID,
    );
    expect(acEvents.length).toBe(2);
    for (const ev of acEvents) {
      expect(ev.ownerId).toBe(SLOT_DEFAULT_CONTROLLED);
    }

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // AC events should appear in the CONTROLLED operator's (slot-0) status column
    const controlledStatusCol = findStatusColumn(result.current, SLOT_DEFAULT_CONTROLLED);
    expect(controlledStatusCol).toBeDefined();
    const controlledVM = viewModels.get(controlledStatusCol!.key);
    expect(controlledVM).toBeDefined();
    const acInControlled = controlledVM!.events.filter(ev => ev.name === AC_STATUS_ID);
    expect(acInControlled.length).toBe(2);
    // Verify micro-positions are assigned (events render in the column)
    for (const ev of acInControlled) {
      expect(controlledVM!.microPositions.has(ev.uid)).toBe(true);
    }

    // AC events should NOT appear in Xaihi's (slot-2) status column
    const xaihiStatusCol = findStatusColumn(result.current, SLOT_XAIHI);
    expect(xaihiStatusCol).toBeDefined();
    const xaihiVM = viewModels.get(xaihiStatusCol!.key);
    expect(xaihiVM).toBeDefined();
    const acInXaihi = xaihiVM!.events.filter(ev => ev.name === AC_STATUS_ID);
    expect(acInXaihi.length).toBe(0);
  });

  it('D3: Controlled operator BA final strike consumes 1 AC stack', () => {
    const { result } = setupXaihiInSlot2();

    // ── Place Xaihi BS at 2s → AC with 2 stacks on slot-0 (default controlled) ──
    const bsCol = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE_SKILL);
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId,
        bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Verify 2 AC stacks on controlled operator with labels "I" and "II"
    const acBefore = result.current.allProcessedEvents.filter(
      ev => ev.name === AC_STATUS_ID && ev.ownerId === SLOT_DEFAULT_CONTROLLED,
    );
    expect(acBefore.length).toBe(2);

    // View: before consumption, top stack shows "II" (stacks=2, same as Steel Oath pattern)
    const vmBefore = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusColBefore = findStatusColumn(result.current, SLOT_DEFAULT_CONTROLLED);
    expect(statusColBefore).toBeDefined();
    const controlledVMBefore = vmBefore.get(statusColBefore!.key);
    expect(controlledVMBefore).toBeDefined();
    const acBeforeVM = controlledVMBefore!.events.filter(ev => ev.name === AC_STATUS_ID);
    const labelsBefore = acBeforeVM.map(ev => controlledVMBefore!.statusOverrides.get(ev.uid)?.label);
    expect(labelsBefore).toContain('Auxiliary Crystal II');

    // ── Context menu: place BA on controlled operator (slot-0) after BS frame ──
    const baCol = findColumn(result.current, SLOT_DEFAULT_CONTROLLED, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, baCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    const baPayload = getMenuPayload(result.current, baCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        baPayload.ownerId, baPayload.columnId,
        baPayload.atFrame, baPayload.defaultSkill,
      );
    });

    // ── Controller layer: restack clamps all active and re-creates remaining ──
    const acAfter = result.current.allProcessedEvents.filter(
      ev => ev.name === AC_STATUS_ID && ev.ownerId === SLOT_DEFAULT_CONTROLLED,
    );
    // 2 original (clamped) + 1 restacked = 3 total
    const consumed = acAfter.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = acAfter.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed.length).toBe(2); // both originals clamped by restack
    expect(active.length).toBe(1);   // 1 restacked event with stacks=1
    expect(active[0].stacks).toBe(1);

    // ── View layer: same pipeline as Steel Oath (II → I transition) ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const controlledStatusCol = findStatusColumn(result.current, SLOT_DEFAULT_CONTROLLED);
    expect(controlledStatusCol).toBeDefined();
    const controlledVM = viewModels.get(controlledStatusCol!.key);
    expect(controlledVM).toBeDefined();
    const acInVM = controlledVM!.events.filter(ev => ev.name === AC_STATUS_ID);
    // Top visible event should show "I" (restacked with stacks=1)
    const activeInVM = acInVM.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(activeInVM.length).toBe(1);
    const activeOverride = controlledVM!.statusOverrides.get(activeInVM[0].uid);
    expect(activeOverride).toBeDefined();
    expect(activeOverride!.label).toBe('Auxiliary Crystal I');
  });

  it('D4: Two BA final strikes consume both AC stacks', () => {
    const { result } = setupXaihiInSlot2();

    // ── Place Xaihi BS at 2s → AC with 2 stacks on slot-0 ──
    const bsCol = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE_SKILL);
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId,
        bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // ── Place 1st BA on slot-0 at 5s ──
    const baCol = findColumn(result.current, SLOT_DEFAULT_CONTROLLED, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    const ba1Payload = getMenuPayload(result.current, baCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ba1Payload.ownerId, ba1Payload.columnId,
        ba1Payload.atFrame, ba1Payload.defaultSkill,
      );
    });

    // ── Place 2nd BA on slot-0 at 10s ──
    const ba2Payload = getMenuPayload(result.current, baCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ba2Payload.ownerId, ba2Payload.columnId,
        ba2Payload.atFrame, ba2Payload.defaultSkill,
      );
    });

    // ── Controller layer: restack produces clamped + restacked events per consumption ──
    const acEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === AC_STATUS_ID && ev.ownerId === SLOT_DEFAULT_CONTROLLED,
    );
    const consumed = acEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = acEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    // All stacks consumed — no active events remain
    expect(active.length).toBe(0);
    expect(consumed.length).toBeGreaterThanOrEqual(2);

    // ── View layer: all events consumed, visual shows II → I → gone ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const controlledStatusCol = findStatusColumn(result.current, SLOT_DEFAULT_CONTROLLED);
    expect(controlledStatusCol).toBeDefined();
    const controlledVM = viewModels.get(controlledStatusCol!.key);
    expect(controlledVM).toBeDefined();
    const acInVM = controlledVM!.events.filter(ev => ev.name === AC_STATUS_ID);
    // All should be consumed
    const consumedInVM = acInVM.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumedInVM.length).toBe(acInVM.length);
  });

  it('D5: Combo activation window opens when last AC stack is consumed', () => {
    const { result } = setupXaihiInSlot2();

    // ── Place BS at 2s → AC with 2 stacks on slot-0 ──
    const bsCol = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE_SKILL);
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId,
        bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // ── Place 1st BA at 5s, 2nd BA at 10s → both AC stacks consumed ──
    const baCol = findColumn(result.current, SLOT_DEFAULT_CONTROLLED, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    const ba1Payload = getMenuPayload(result.current, baCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ba1Payload.ownerId, ba1Payload.columnId,
        ba1Payload.atFrame, ba1Payload.defaultSkill,
      );
    });
    const ba2Payload = getMenuPayload(result.current, baCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ba2Payload.ownerId, ba2Payload.columnId,
        ba2Payload.atFrame, ba2Payload.defaultSkill,
      );
    });

    // ── Controller layer: combo activation window should exist ──
    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_XAIHI,
    );
    expect(comboWindows.length).toBeGreaterThanOrEqual(1);

    // ── Context menu: combo should be placeable within the window ──
    const comboCol = findColumn(result.current, SLOT_XAIHI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    // Place combo after the last AC consumption
    const lastConsumedFrame = Math.max(
      ...result.current.allProcessedEvents
        .filter(ev => ev.name === AC_STATUS_ID && ev.eventStatus === EventStatusType.CONSUMED)
        .map(ev => ev.startFrame + ev.segments.reduce((s: number, seg: { properties: { duration: number } }) => s + seg.properties.duration, 0)),
    );
    const comboMenu = buildContextMenu(result.current, comboCol!, lastConsumedFrame + 1 * FPS);
    expect(comboMenu).not.toBeNull();
    const comboPayload = getMenuPayload(result.current, comboCol!, lastConsumedFrame + 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // ── Controller layer: combo event exists with correct effects ──
    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(comboEvents).toHaveLength(1);

    // Combo applies cryo infliction to enemy
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_OWNER_ID
        && ev.startFrame > comboEvents[0].startFrame,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);

    // ── View layer: combo appears in the combo column ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.columnId === NounType.COMBO_SKILL)).toBe(true);

    // Cryo infliction visible in enemy status column
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === ENEMY_OWNER_ID &&
        c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const inflictionsInVM = enemyVM!.events.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(inflictionsInVM.length).toBeGreaterThanOrEqual(1);
  });

  it('D2: BS applies AUXILIARY_CRYSTAL to Xaihi when she IS the controlled operator', () => {
    const { result } = setupXaihiInSlot2();

    // ── Context menu layer: place CONTROL event ──
    const inputCol = findColumn(result.current, SLOT_XAIHI, OPERATOR_COLUMNS.INPUT);
    expect(inputCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, inputCol!, 1 * FPS);
    expect(menuItems).not.toBeNull();
    const controlItem = menuItems!.find(
      i => i.actionId === 'addEvent' &&
        (i.actionPayload as Record<string, unknown>)?.defaultSkill &&
        ((i.actionPayload as Record<string, Record<string, unknown>>).defaultSkill?.id === CombatSkillType.CONTROL),
    );
    expect(controlItem).toBeDefined();
    expect(controlItem!.disabled).toBeFalsy();
    const controlPayload = controlItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
    act(() => {
      result.current.handleAddEvent(
        controlPayload.ownerId, controlPayload.columnId,
        controlPayload.atFrame, controlPayload.defaultSkill,
      );
    });

    // ── Context menu layer: place BS ──
    const bsCol = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE_SKILL);
    expect(bsCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, bsCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId,
        bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const acEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === AC_STATUS_ID,
    );
    expect(acEvents.length).toBe(2);
    for (const ev of acEvents) {
      expect(ev.ownerId).toBe(SLOT_XAIHI);
    }

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // AC events should appear in Xaihi's (slot-2) status column since she's controlled
    const xaihiStatusCol = findStatusColumn(result.current, SLOT_XAIHI);
    expect(xaihiStatusCol).toBeDefined();
    const xaihiVM = viewModels.get(xaihiStatusCol!.key);
    expect(xaihiVM).toBeDefined();
    const acInXaihi = xaihiVM!.events.filter(ev => ev.name === AC_STATUS_ID);
    expect(acInXaihi.length).toBe(2);
    for (const ev of acInXaihi) {
      expect(xaihiVM!.microPositions.has(ev.uid)).toBe(true);
    }
  });
});
