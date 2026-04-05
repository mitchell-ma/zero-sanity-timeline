/**
 * @jest-environment jsdom
 */

/**
 * Enemy Action — Integration Tests
 *
 * Verifies that enemy action events (DEAL DAMAGE to ALL OPERATOR):
 * - Appear in allProcessedEvents after placement
 * - Appear in the view model for canvas rendering
 * - Fire DEAL DAMAGE reactive triggers
 * - Have correct duration and element data
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { ENEMY_OWNER_ID, ENEMY_ACTION_COLUMN_ID } from '../../../model/channels';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT_0 = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function findEnemyActionCol(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === ENEMY_OWNER_ID &&
      c.columnId === ENEMY_ACTION_COLUMN_ID,
  );
}

function addEnemyAction(app: AppResult, atFrame: number) {
  const col = findEnemyActionCol(app);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getEnemyActionEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === ENEMY_ACTION_COLUMN_ID,
  );
}

describe('Enemy Action — Event Pipeline', () => {
  it('enemy action event appears in allProcessedEvents', () => {
    const { result } = renderHook(() => useApp());

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const events = getEnemyActionEvents(result.current);
    expect(events).toHaveLength(1);
    expect(events[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(events[0].columnId).toBe(ENEMY_ACTION_COLUMN_ID);
  });

  it('enemy action event has correct duration (2s = 240 frames)', () => {
    const { result } = renderHook(() => useApp());

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const events = getEnemyActionEvents(result.current);
    expect(events).toHaveLength(1);
    const totalDuration = events[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(240);
  });

  it('enemy action event has damageElement on frame', () => {
    const { result } = renderHook(() => useApp());

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const events = getEnemyActionEvents(result.current);
    expect(events).toHaveLength(1);
    const frame = events[0].segments[0]?.frames?.[0];
    expect(frame).toBeDefined();
    expect(frame!.damageElement).toBeDefined();
  });

  it('multiple enemy actions can be placed at non-overlapping frames', () => {
    const { result } = renderHook(() => useApp());

    act(() => { addEnemyAction(result.current, 1 * FPS); });
    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const events = getEnemyActionEvents(result.current);
    expect(events).toHaveLength(2);
  });
});

describe('Enemy Action — View Layer', () => {
  it('enemy action event appears in view model for canvas rendering', () => {
    const { result } = renderHook(() => useApp());

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const col = findEnemyActionCol(result.current);
    expect(col).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(col!.key);
    expect(vm).toBeDefined();
    expect(vm!.events).toHaveLength(1);
    expect(vm!.events[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(vm!.events[0].columnId).toBe(ENEMY_ACTION_COLUMN_ID);
  });
});

describe('Enemy Action — Reactive Triggers', () => {
  it('enemy action fires DEAL DAMAGE trigger (Pay the Ferric Price on Ember)', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EMBER_ID: string = require('../../../model/game-data/operators/ember/ember.json').id;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const PAY_THE_FERRIC_PRICE_ID = 'PAY_THE_FERRIC_PRICE';

    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT_0, EMBER_ID); });

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const pftpEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT_0,
    );
    expect(pftpEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('operator damage frames do NOT fire DEAL DAMAGE trigger', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EMBER_ID: string = require('../../../model/game-data/operators/ember/ember.json').id;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const PAY_THE_FERRIC_PRICE_ID = 'PAY_THE_FERRIC_PRICE';
    const { NounType } = require('../../../dsl/semantics');
    const { findColumn } = require('../helpers');

    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT_0, EMBER_ID); });

    // Place a battle skill (operator dealing damage TO enemy — should NOT trigger)
    const bsCol = findColumn(result.current, SLOT_0, NounType.BATTLE);
    const bsPayload = getMenuPayload(result.current, bsCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    const pftpEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT_0,
    );
    expect(pftpEvents).toHaveLength(0);
  });
});
