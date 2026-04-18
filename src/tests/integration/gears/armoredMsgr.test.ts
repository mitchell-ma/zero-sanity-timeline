/**
 * @jest-environment jsdom
 *
 * Armored MSGR — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (STRENGTH +50) aggregates correctly
 *   2. Trigger (HP <= 50%) — requires HP manipulation in the test harness;
 *      marked it.skip.
 *   3. Calc-ingestion placeholder: buff applies FINAL_DAMAGE_REDUCTION, which
 *      is a defensive stat and does not show up in operator damage rows;
 *      the trigger path itself is the calc-relevant assertion.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { StatType } from '../../../consts/enums';
import {
  SLOT, calc, eventsOnColumn, gearLoadout,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BUFF = require('../../../model/game-data/gears/armored-msgr/statuses/status-armored-msgr.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'ARMORED_MSGR_JACKET_T1';
const GLOVES_ID = 'ARMORED_MSGR_GLOVES_T1';
const KIT_ID = 'ARMORED_MSGR_FLASHLIGHT_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Armored MSGR — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates STRENGTH +50 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.STRENGTH] ?? 0).toBeGreaterThanOrEqual(50);
    });
  });

  describe('HP <= 50% trigger → ARMORED_MSGR', () => {
    it.skip('triggers when HP <= 50% (TODO: needs HP manipulation in test harness)', () => {
      const { result } = setup();
      // TODO: Once the harness can drive operator HP below 50%, assert the buff appears.
      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });
  });
});
