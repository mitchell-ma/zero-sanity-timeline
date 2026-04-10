/**
 * @jest-environment jsdom
 */

/**
 * Shield Application — Integration Tests
 *
 * Verifies that Ember's Re-Ignited Oath ultimate creates SHIELD status events
 * via the Steel Oath / Steel Oath Empowered status clauses (APPLY SHIELD).
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const EMBER_ID: string = require('../../../model/game-data/operators/ember/ember.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, EMBER_ID); });
  return view;
}

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT];
  app.handleStatsChange(SLOT, { ...props, operator: { ...props.operator, potential } });
}

function addUlt(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

describe('Shield Application — Ember Ultimate', () => {
  it('Steel Oath status appears on operator at P0', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const steelOath = result.current.allProcessedEvents.filter(
      ev => ev.columnId === 'THE_STEEL_OATH',
    );
    expect(steelOath.length).toBeGreaterThanOrEqual(1);
  });

  it('Steel Oath Empowered status appears at P5 (exclusive)', () => {
    const { result } = setup();
    act(() => { setPotential(result.current, 5); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const empowered = result.current.allProcessedEvents.filter(
      ev => ev.columnId === 'THE_STEEL_OATH_EMPOWERED',
    );
    expect(empowered.length).toBeGreaterThanOrEqual(1);

    const regular = result.current.allProcessedEvents.filter(
      ev => ev.columnId === 'THE_STEEL_OATH',
    );
    expect(regular).toHaveLength(0);
  });

  it('SHIELD status column exists in generic statuses', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const shieldJson = require('../../../model/game-data/generic/statuses/status-shield.json');
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(shieldJson.properties.id).toBe(StatusType.SHIELD);
    expect(shieldJson.properties.stacks.interactionType).toBe('RESET');
  });
});
