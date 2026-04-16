/**
 * @jest-environment jsdom
 */

/**
 * Tangtang — Waterspout Visual Render E2E
 *
 * Verifies the full pipeline: engine dispatches N waterspout events per
 * APPLY stacks=N, and the view layer renders them as distinct unclamped
 * blocks (no truncation hiding damage-tick frames at 1s/2s/3s).
 *
 * Three-layer verification:
 *   1. Engine: correct waterspout event count and placement
 *   2. View overrides: no visualActivationDuration clamping
 *   3. View model: all waterspout events appear in the column with
 *      full segment durations preserved
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const TANGTANG_ID: string = require('../../../../model/game-data/operators/tangtang/tangtang.json').id;
const WATERSPOUT_ID: string = require('../../../../model/game-data/operators/tangtang/statuses/status-waterspout.json').properties.id;
const WHIRLPOOL_ID: string = require('../../../../model/game-data/operators/tangtang/statuses/status-whirlpool.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const WATERSPOUT_DURATION_FRAMES = 3 * FPS;

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, TANGTANG_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeCombo(app: AppResult, frame: number) {
  const col = findColumn(app, SLOT, NounType.COMBO)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

function placeBS(app: AppResult, frame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

function getWaterspouts(app: AppResult) {
  return app.allProcessedEvents
    .filter(ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function getEnemyStatusVM(app: AppResult) {
  const col = app.columns.find(
    (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
  expect(col).toBeDefined();
  const viewModels = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  return viewModels.get(col!.key)!;
}

describe('Waterspout visual render — distinct unclamped events', () => {
  it('BS with 2 whirlpools → 3 waterspout events (1 + 2), each with full 3s duration', () => {
    const { result } = setup();

    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT && ev.startFrame > 0,
    );
    expect(whirlpools).toHaveLength(2);

    placeBS(result.current, 8 * FPS);

    // ── Engine layer: N waterspouts dispatched ──
    const waterspouts = getWaterspouts(result.current);
    expect(waterspouts.length).toBeGreaterThanOrEqual(3);

    // Each waterspout has full 3s duration (not truncated)
    for (const ws of waterspouts) {
      expect(eventDuration(ws)).toBe(WATERSPOUT_DURATION_FRAMES);
    }
  });

  it('overlapping waterspouts are NOT visually clamped — no visualActivationDuration override', () => {
    const { result } = setup();

    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);
    placeBS(result.current, 8 * FPS);

    const waterspouts = getWaterspouts(result.current);
    expect(waterspouts.length).toBeGreaterThanOrEqual(3);

    // ── View override layer: no clamping ──
    const vm = getEnemyStatusVM(result.current);
    for (const ws of waterspouts) {
      const override = vm.statusOverrides.get(ws.uid);
      expect(!override || override.visualActivationDuration == null).toBe(true);
    }
  });

  it('waterspout events in view model preserve full segment durations (frames not stripped)', () => {
    const { result } = setup();

    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);
    placeBS(result.current, 8 * FPS);

    const waterspouts = getWaterspouts(result.current);
    expect(waterspouts.length).toBeGreaterThanOrEqual(3);

    // ── View model layer: events appear with full durations ──
    const vm = getEnemyStatusVM(result.current);
    const wsInView = vm.events.filter(ev => ev.columnId === WATERSPOUT_ID);
    expect(wsInView.length).toBe(waterspouts.length);

    for (const ws of wsInView) {
      expect(eventDuration(ws)).toBe(WATERSPOUT_DURATION_FRAMES);
    }
  });

  it('two BS casts 1s apart → waterspouts from both casts render with full duration', () => {
    const { result } = setup();

    placeCombo(result.current, 2 * FPS);
    placeBS(result.current, 5 * FPS);
    placeBS(result.current, 6 * FPS);

    const waterspouts = getWaterspouts(result.current);
    expect(waterspouts.length).toBeGreaterThanOrEqual(2);

    // All waterspouts keep full 3s even though they overlap across casts
    const vm = getEnemyStatusVM(result.current);
    const wsInView = vm.events.filter(ev => ev.columnId === WATERSPOUT_ID);
    for (const ws of wsInView) {
      expect(eventDuration(ws)).toBe(WATERSPOUT_DURATION_FRAMES);
    }

    // No visual clamping overrides
    for (const ws of wsInView) {
      const override = vm.statusOverrides.get(ws.uid);
      expect(!override || override.visualActivationDuration == null).toBe(true);
    }
  });
});
