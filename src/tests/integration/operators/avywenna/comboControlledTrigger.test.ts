/**
 * @jest-environment jsdom
 */

/**
 * Avywenna Combo — CONTROLLED Operator Trigger
 *
 * Avywenna's combo (Thunderlance: Strike) requires:
 *   - CONTROLLED operator performs FINAL_STRIKE
 *   - Enemy has Electric Infliction OR Electrification
 *
 * Tests verify:
 *   1. Electrification on enemy + non-controlled Akekuri BATK → NO combo window
 *   2. Electrification on enemy + controlled Akekuri BATK → combo window opens
 *
 * Verification layers:
 *   Controller: allProcessedEvents for combo activation window
 *   View: computeTimelinePresentation for combo column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  COMBO_WINDOW_COLUMN_ID,
  REACTION_COLUMNS,
  ENEMY_ID,
} from '../../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import type { MiniTimeline, ContextMenuItem } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, type AppResult, type AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AVYWENNA_ID: string = require('../../../../model/game-data/operators/avywenna/avywenna.json').id;
const AKEKURI_ID: string = require('../../../../model/game-data/operators/akekuri/akekuri.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_AVYWENNA = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

const CONTROL_LABEL = 'Set as Controlled Operator';

beforeEach(() => {
  localStorage.clear();
});

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_AVYWENNA, AVYWENNA_ID); });
  act(() => { view.result.current.handleSwapOperator(SLOT_AKEKURI, AKEKURI_ID); });
  return view;
}

function getComboWindows(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_AVYWENNA,
  );
}

function placeElectrification(
  result: { current: AppResult },
  startSec: number,
  durationSec = 20,
) {
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.ELECTRIFICATION, startSec * FPS,
      { name: REACTION_COLUMNS.ELECTRIFICATION, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
  act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
}

function placeAkekuriBatk(result: { current: AppResult }, startSec: number) {
  const col = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
  if (!col) throw new Error('Akekuri basic attack column not found');
  const payload = getMenuPayload(result.current, col, startSec * FPS);
  act(() => {
    result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function findControlMenuItem(app: AppResult, slotId: string, atFrame: number): ContextMenuItem | undefined {
  const col = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === NounType.BASIC_ATTACK,
  );
  if (!col) throw new Error(`No column found for ${slotId}`);
  const items = buildContextMenu(app, col, atFrame);
  if (!items) throw new Error(`Context menu returned null for ${slotId} at frame ${atFrame}`);
  return items.find(i => i.label === CONTROL_LABEL);
}

function setControlled(result: { current: AppResult }, slotId: string, atFrame: number) {
  const item = findControlMenuItem(result.current, slotId, atFrame);
  if (!item) throw new Error(`"${CONTROL_LABEL}" not found for ${slotId}`);
  if (item.disabled) throw new Error(`"${CONTROL_LABEL}" disabled for ${slotId}: ${item.disabledReason}`);
  const payload = item.actionPayload as AddEventPayload;
  act(() => {
    result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLLED operator requirement for combo trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('Avywenna combo — CONTROLLED operator trigger', () => {
  it('non-controlled Akekuri BATK with Electrification does NOT open combo window', () => {
    const { result } = setup();

    // slot-0 (Avywenna) is controlled by default — Akekuri (slot-1) is NOT controlled
    placeElectrification(result, 1);
    placeAkekuriBatk(result, 2);

    // Controller layer: no combo activation window for Avywenna
    const windows = getComboWindows(result.current);
    expect(windows).toHaveLength(0);

    // View layer: combo column should have no activation window events
    const comboCol = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(comboCol!.key);
    expect(vm).toBeDefined();
    const windowEventsInView = vm!.events.filter(ev => ev.columnId === COMBO_WINDOW_COLUMN_ID);
    expect(windowEventsInView).toHaveLength(0);
  });

  it('controlled Akekuri BATK with Electrification opens combo window', () => {
    const { result } = setup();

    // Set Akekuri as controlled at frame 0
    setControlled(result, SLOT_AKEKURI, 0);

    placeElectrification(result, 1);
    placeAkekuriBatk(result, 2);

    // Controller layer: combo activation window exists for Avywenna
    const windows = getComboWindows(result.current);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].ownerId).toBe(SLOT_AVYWENNA);
    expect(windows[0].columnId).toBe(COMBO_WINDOW_COLUMN_ID);
    expect(windows[0].maxSkills).toBe(1);

    // Window should start at or after the FINAL_STRIKE frame of Akekuri's BATK
    // Akekuri BATK last segment final frame offset = 0.7s from segment start
    // Total BATK duration before last segment: 0.5 + 0.767 + 0.733 = 2.0s
    // Final strike frame ≈ 2s + 2.0s + 0.7s = 4.7s = ~564 frames
    expect(windows[0].startFrame).toBeGreaterThan(2 * FPS);

    // Window duration = 6 seconds = 720 frames
    const windowDuration = windows[0].segments.reduce(
      (sum, s) => sum + s.properties.duration, 0,
    );
    expect(windowDuration).toBe(6 * FPS);

    // View layer: combo column should show the activation window
    const comboCol = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(comboCol!.key);
    expect(vm).toBeDefined();
    const windowEventsInView = vm!.events.filter(ev => ev.columnId === COMBO_WINDOW_COLUMN_ID);
    expect(windowEventsInView.length).toBeGreaterThanOrEqual(1);
  });
});
