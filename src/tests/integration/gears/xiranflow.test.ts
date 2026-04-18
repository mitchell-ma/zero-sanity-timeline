/**
 * @jest-environment jsdom
 *
 * Xiranflow — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (ATTACK_BONUS +0.10) aggregates correctly
 *   2. Trigger (CONSUME REACTION / Electrification or Corrosion FROM ENEMY)
 *      — Wulfgard's Code of Restraint consumes Combustion, not
 *      Electrification; no clean in-harness way to drive the CONSUME event
 *      for this gear pipeline. Marked it.skip with a TODO.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { StatType } from '../../../consts/enums';
import {
  SLOT, calc, eventsOnColumn, gearLoadout,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const BUFF = require('../../../model/game-data/gears/xiranflow/statuses/status-xiranflow.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'XIRANFLOW_LIGHT_ARMOR';
const GLOVES_ID = 'XIRANFLOW_GLOVES';
const KIT_ID = 'XIRANFLOW_BATON';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Xiranflow — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ATTACK_BONUS +0.10 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ATTACK_BONUS] ?? 0).toBeGreaterThanOrEqual(0.10 - 1e-6);
    });
  });

  describe('Consume reaction trigger → XIRANFLOW', () => {
    it.skip('triggers when wielder consumes Electrification or Corrosion (TODO: no clean harness-driven CONSUME for this gear pipeline)', () => {
      const { result } = setup();
      // TODO: Once the harness can drive a CONSUME of Electrification/Corrosion from the
      // wielder (e.g. via a skill whose clause consumes the reaction), assert the buff.
      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });
  });
});
