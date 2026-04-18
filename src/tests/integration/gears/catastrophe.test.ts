/**
 * @jest-environment jsdom
 *
 * Catastrophe — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (ULTIMATE_GAIN_EFFICIENCY +0.2) aggregates
 *      correctly
 *   2. Trigger fires on battle skill cast — buff RETURNS +50 SP, once per
 *      battle; this test confirms the buff status event is created.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, eventsOnColumn, gearLoadout, placeSkill,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BUFF = require('../../../model/game-data/gears/catastrophe/statuses/status-catastrophe.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'CATASTROPHE_HEAVY_ARMOR_T1';
const GLOVES_ID = 'CATASTROPHE_GLOVES';
const KIT_ID = 'CATASTROPHE_GAUZE_CARTRIDGE_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Catastrophe — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ULTIMATE_GAIN_EFFICIENCY +0.2 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ULTIMATE_GAIN_EFFICIENCY] ?? 0).toBeGreaterThanOrEqual(0.2 - 1e-6);
    });
  });

  describe('Battle skill cast trigger → CATASTROPHE', () => {
    it('placing a battle skill creates the CATASTROPHE buff', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });
  });
});
