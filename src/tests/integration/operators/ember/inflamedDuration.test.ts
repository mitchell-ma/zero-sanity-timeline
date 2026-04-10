/**
 * @jest-environment jsdom
 */

/**
 * Ember — Inflamed for the Assault Duration Tests
 *
 * Verifies that Forward March's onEntryClause applies INFLAMED_FOR_THE_ASSAULT
 * with the correct duration based on potential and ENEMY_HIT parameter:
 *
 *   P0:                          1.7s  (skill duration, no P1 extension)
 *   P1+ ENEMY_HIT=0:             1.7s  (P1 but enemy not hit)
 *   P1+ ENEMY_HIT=1 (default):   3.2s  (1.7 + 1.5 P1 extension)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const EMBER_JSON = require('../../../../model/game-data/operators/ember/ember.json');
const EMBER_ID: string = EMBER_JSON.id;

const INFLAMED_ID: string = require(
  '../../../../model/game-data/operators/ember/statuses/status-inflamed-for-the-assault.json',
).properties.id;
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

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_EMBER];
  app.handleStatsChange(SLOT_EMBER, {
    ...props,
    operator: { ...props.operator, potential },
  });
}

function addBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_EMBER, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getInflamedDuration(app: AppResult) {
  const inflamedEvents = app.allProcessedEvents.filter(
    (ev) => ev.columnId === INFLAMED_ID && ev.ownerEntityId === SLOT_EMBER,
  );
  expect(inflamedEvents.length).toBeGreaterThanOrEqual(1);
  return inflamedEvents[0].segments.reduce(
    (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
  );
}

describe('Inflamed for the Assault — Duration', () => {
  it('P0: Inflamed lasts 1.7s (skill duration only)', () => {
    const { result } = setupEmber();
    // Ember is 6★ → default P0

    act(() => { addBattleSkill(result.current, 5 * FPS); });

    const duration = getInflamedDuration(result.current);
    expect(duration).toBe(Math.round(1.7 * FPS));
  });

  it('P1 default (ENEMY_HIT=1): Inflamed lasts 3.2s (1.7 + 1.5 P1 extension)', () => {
    const { result } = setupEmber();
    act(() => { setPotential(result.current, 1); });

    act(() => { addBattleSkill(result.current, 5 * FPS); });

    const duration = getInflamedDuration(result.current);
    expect(duration).toBe(Math.round(3.2 * FPS));
  });
});
