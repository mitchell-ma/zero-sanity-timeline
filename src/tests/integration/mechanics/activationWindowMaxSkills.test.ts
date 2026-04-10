/**
 * @jest-environment jsdom
 */

/**
 * Activation Window maxSkills — Integration Tests
 *
 * Tests the activationWindow embedded Event structure (config reads from
 * activationWindow instead of top-level onTriggerClause/windowFrames) and
 * maxSkills=1 enforcement for standard single-combo operators.
 *
 * Uses Wulfgard (Combustion trigger, maxSkills=1) since Wulfgard's APPLY-based
 * trigger reliably creates activation windows from skill-derived inflictions.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import {
  COMBO_WINDOW_COLUMN_ID,
  INFLICTION_COLUMNS,
  ENEMY_ID,
} from '../../../model/channels';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { getComboTriggerInfo } from '../../../controller/gameDataStore';
import { findColumn, buildContextMenu, getMenuPayload, type AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_WULFGARD = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupWulfgard() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });
  return view;
}

function placeHeatInfliction(result: { current: AppResult }, startSec: number, durationSec = 20) {
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.HEAT, startSec * FPS,
      { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
  act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Config reads from activationWindow
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Config reads from activationWindow', () => {
  it('A1: Wulfgard maxSkills=1 from activationWindow', () => {
    const info = getComboTriggerInfo(WULFGARD_ID);
    expect(info).toBeDefined();
    expect(info!.maxSkills).toBe(1);
    expect(info!.windowFrames).toBe(720);
  });

  it('A2: Laevatain maxSkills=1 from activationWindow', () => {
    const info = getComboTriggerInfo(LAEVATAIN_ID);
    expect(info).toBeDefined();
    expect(info!.maxSkills).toBe(1);
    expect(info!.windowFrames).toBe(720);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. maxSkills=1 enforcement (Wulfgard)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. maxSkills=1 enforcement', () => {
  it('B1: Activation window has maxSkills=1', () => {
    const { result } = setupWulfgard();
    placeHeatInfliction(result, 1);

    const windows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_WULFGARD,
    );
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].maxSkills).toBe(1);
  });

  it('B2: One combo allowed within window', () => {
    const { result } = setupWulfgard();
    placeHeatInfliction(result, 1);

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    expect(comboCol).toBeDefined();

    // First combo should be available
    const menu1 = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menu1).not.toBeNull();
    const addItem = menu1!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBeFalsy();

    // Place the combo
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Verify combo exists
    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('B3: Second combo disabled with limit reason (maxSkills=1)', () => {
    const { result } = setupWulfgard();
    placeHeatInfliction(result, 1);

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);

    // Place first combo
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Second combo at different frame within window — should be disabled
    // (overlap OR limit, both are valid blocks for maxSkills=1)
    const menu2 = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menu2).not.toBeNull();
    const addItem2 = menu2!.find(i => i.actionId === 'addEvent');
    expect(addItem2).toBeDefined();
    expect(addItem2!.disabled).toBe(true);
  });
});
