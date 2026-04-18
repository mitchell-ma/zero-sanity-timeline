/**
 * @jest-environment jsdom
 *
 * LYNX — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (TREATMENT_BONUS +0.2) aggregates correctly
 *   2. Trigger (RECOVER HP on other operators) — marked it.skip because the
 *      engine does not yet emit HP recovery events usable by the gear
 *      trigger pipeline in this harness.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { StatType } from '../../../consts/enums';
import {
  SLOT, calc, eventsOnColumn, gearLoadout,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BUFF = require('../../../model/game-data/gears/lynx/statuses/status-lynx.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'LYNX_CUIRASS';
const GLOVES_ID = 'LYNX_GAUNTLETS';
const KIT_ID = 'LYNX_CONNECTOR_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('LYNX — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates TREATMENT_BONUS +0.2 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.TREATMENT_BONUS] ?? 0).toBeGreaterThanOrEqual(0.2 - 1e-6);
    });
  });

  describe('RECOVER HP trigger → LYNX', () => {
    it.skip('triggers when treatment is received by a teammate (TODO: harness does not drive treatment events)', () => {
      const { result } = setup();
      // TODO: Place a treatment-skill event whose animation recovers another slot's HP.
      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });
  });
});
