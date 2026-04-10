/**
 * @jest-environment jsdom
 */

/**
 * Ember — Pay the Ferric Price Integration Tests
 *
 * Verifies that only ENEMY DEAL DAMAGE triggers Pay the Ferric Price.
 * Operator damage frames (operator hitting enemy) must NOT trigger it.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { ENEMY_ID, ENEMY_ACTION_COLUMN_ID } from '../../../../model/channels';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';
import type { MiniTimeline } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const EMBER_JSON = require('../../../../model/game-data/operators/ember/ember.json');
const EMBER_ID: string = EMBER_JSON.id;

const PAY_THE_FERRIC_PRICE_ID = 'PAY_THE_FERRIC_PRICE';
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_EMBER = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupEmber() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_EMBER, EMBER_ID); });
  return view;
}

function addBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_EMBER, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function addEnemyAction(app: AppResult, atFrame: number) {
  const enemyCol = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === ENEMY_ID &&
      c.columnId === ENEMY_ACTION_COLUMN_ID,
  );
  expect(enemyCol).toBeDefined();
  const payload = getMenuPayload(app, enemyCol!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getPftpEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT_EMBER,
  );
}

describe('Pay the Ferric Price — DEAL DAMAGE trigger', () => {
  it('operator battle skill does NOT trigger Pay the Ferric Price', () => {
    const { result } = setupEmber();

    act(() => { addBattleSkill(result.current, 5 * FPS); });

    expect(getPftpEvents(result.current)).toHaveLength(0);
  });

  it('enemy action event appears in view model', () => {
    const { result } = setupEmber();

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const { computeTimelinePresentation } = require('../../../../controller/timeline/eventPresentationController');
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Find the enemy action column view model
    const enemyActionCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === ENEMY_ID &&
        c.columnId === ENEMY_ACTION_COLUMN_ID,
    );
    expect(enemyActionCol).toBeDefined();

    const vm = viewModels.get(enemyActionCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.length).toBeGreaterThanOrEqual(1);
  });

  it('enemy action DEAL DAMAGE triggers Pay the Ferric Price on Ember', () => {
    const { result } = setupEmber();

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const pftpEvents = getPftpEvents(result.current);
    expect(pftpEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('Pay the Ferric Price has 7s duration', () => {
    const { result } = setupEmber();

    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const pftpEvents = getPftpEvents(result.current);
    expect(pftpEvents.length).toBeGreaterThanOrEqual(1);

    const totalDuration = pftpEvents[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(7 * FPS);
  });

  it('stacks cap at 3 when enemy attacks overlap within duration', () => {
    const { result } = setupEmber();

    // Place 4 enemy attacks within 7s window, spaced 2s apart (enemy action is 2s long)
    act(() => { addEnemyAction(result.current, 1 * FPS); });
    act(() => { addEnemyAction(result.current, 3 * FPS); });
    act(() => { addEnemyAction(result.current, 5 * FPS); });
    act(() => { addEnemyAction(result.current, 7 * FPS); });

    const pftpEvents = getPftpEvents(result.current);
    // 4 triggers, all within 7s → 4th resets oldest → 3 active, 1 refreshed
    expect(pftpEvents).toHaveLength(4);
    const activeEvents = pftpEvents.filter((ev) => !ev.eventStatus);
    expect(activeEvents).toHaveLength(3);
    const refreshedEvents = pftpEvents.filter(
      (ev) => ev.eventStatus === EventStatusType.REFRESHED,
    );
    expect(refreshedEvents).toHaveLength(1);
  });
});
