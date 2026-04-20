/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Breath of Transformation combo trigger CONTROLLED gating
 *
 * Verifies that a FINISHER performed by a non-controlled operator does NOT
 * open Zhuang's combo activation window.
 *
 * Zhuang's combo trigger (both base and enhanced) requires:
 *   CONTROLLED OPERATOR PERFORM SKILL FINISHER to ENEMY
 *   AND ENEMY HAVE STATUS INFLICTION ELECTRIC
 *
 * Regression guard for a bug in triggerMatch.ts::handlePerform FINISHER branch
 * where matchesOwner was called without the trigger frame, causing the
 * CONTROLLED determiner to always resolve at frame 0 (default slot-0
 * controlled) and incorrectly match any slot-0 finisher regardless of the
 * actual controlled state at the finisher frame.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import {
  COMBO_WINDOW_COLUMN_ID,
  INFLICTION_COLUMNS,
  ENEMY_ID,
} from '../../../../model/channels';
import { findColumn, buildContextMenu } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';
import type { ContextMenuItem, MiniTimeline } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZHUANG_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
const AKEKURI_ID: string = require('../../../../model/game-data/operators/akekuri/akekuri.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZHUANG = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

const CONTROL_LABEL = 'Set as Controlled Operator';

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupLoadout() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZHUANG, ZHUANG_ID); });
  act(() => { view.result.current.handleSwapOperator(SLOT_AKEKURI, AKEKURI_ID); });
  return view;
}

function transferControlToAkekuri(app: AppResult, atFrame: number) {
  const col = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === SLOT_AKEKURI &&
      c.columnId === NounType.BASIC_ATTACK,
  );
  if (!col) throw new Error('Akekuri BASIC_ATTACK column not found');
  const items = buildContextMenu(app, col, atFrame);
  if (!items) throw new Error('Context menu null for Akekuri column');
  const item = items.find((i: ContextMenuItem) => i.label === CONTROL_LABEL);
  if (!item || item.disabled) {
    throw new Error(`"${CONTROL_LABEL}" missing or disabled for Akekuri at ${atFrame}`);
  }
  const payload = item.actionPayload as AddEventPayload;
  return payload;
}

function placeElectricInfliction(app: AppResult, startSec = 0, durationSec = 20) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID,
      INFLICTION_COLUMNS.ELECTRIC,
      startSec * FPS,
      {
        name: INFLICTION_COLUMNS.ELECTRIC,
        segments: [{ properties: { duration: durationSec * FPS } }],
      },
    );
  });
}

function placeZhuangFinisher(app: AppResult, atFrame: number) {
  const basicCol = findColumn(app, SLOT_ZHUANG, NounType.BASIC_ATTACK);
  if (!basicCol) throw new Error('Zhuang BASIC_ATTACK column not found');
  const menu = buildContextMenu(app, basicCol, atFrame);
  if (!menu) throw new Error('Context menu null for Zhuang BASIC_ATTACK column');
  const finisherItem = menu.find(
    (i: ContextMenuItem) =>
      i.actionId === 'addEvent' &&
      (i.actionPayload as { defaultSkill?: { category?: string } }).defaultSkill?.category === NounType.FINISHER,
  );
  if (!finisherItem) {
    throw new Error('Finisher variant not available in Zhuang BASIC_ATTACK menu');
  }
  if (finisherItem.disabled) {
    throw new Error(`Finisher is disabled: ${finisherItem.disabledReason}`);
  }
  const payload = finisherItem.actionPayload as AddEventPayload;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function zhuangComboWindows(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === SLOT_ZHUANG,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Zhuang combo trigger — CONTROLLED operator gating on FINISHER', () => {
  it('does NOT open Zhuang CS window when her finisher fires while Akekuri is controlled', () => {
    const view = setupLoadout();
    const { result } = view;

    // Transfer control to Akekuri at 1s — from that frame onwards, Zhuang is not controlled.
    const controlPayload = transferControlToAkekuri(result.current, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        controlPayload.ownerEntityId,
        controlPayload.columnId,
        controlPayload.atFrame,
        controlPayload.defaultSkill,
      );
    });

    // Set up the electric infliction so the second clause condition passes.
    placeElectricInfliction(result.current, 0, 20);

    // Zhuang's finisher at 5s — well after Akekuri has taken control.
    placeZhuangFinisher(result.current, 5 * FPS);

    // Zhuang is not the controlled operator at the finisher frame,
    // so her combo activation window must not open.
    expect(zhuangComboWindows(result.current)).toHaveLength(0);
  });

  it('DOES open Zhuang CS window when her finisher fires while she is controlled', () => {
    const view = setupLoadout();
    const { result } = view;

    // No control transfer — Zhuang remains the default controlled operator.
    placeElectricInfliction(result.current, 0, 20);
    placeZhuangFinisher(result.current, 5 * FPS);

    // Happy-path guard: the CONTROLLED filter must still open the window
    // when the actor IS the controlled operator.
    expect(zhuangComboWindows(result.current).length).toBeGreaterThanOrEqual(1);
  });
});
