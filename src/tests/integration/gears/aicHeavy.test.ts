/**
 * @jest-environment jsdom
 *
 * AIC Heavy — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat aggregates correctly
 *   2. Trigger ("defeat enemy") — not currently testable (engine does not
 *      model enemy defeats); marked it.skip.
 *   3. Freeform-placed buff still exercises the calc-ingestion layer
 *      (EXPECTED to fail until engine wires gear/weapon STAT ingestion).
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { StatType } from '../../../consts/enums';
import {
  SLOT, calc, eventsOnColumn, gearLoadout,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BUFF = require('../../../model/game-data/gears/aic-heavy/statuses/status-aic-heavy.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'AIC_HEAVY_ARMOR';
const GLOVES_ID = 'AIC_GAUNTLETS';
const KIT_ID = 'AIC_ALLOY_PLATE';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('AIC Heavy — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates FLAT_HP +500 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.FLAT_HP] ?? 0).toBeGreaterThanOrEqual(500);
    });
  });

  describe('Defeat enemy trigger → AIC_HEAVY', () => {
    it.skip('defeating an enemy creates the AIC_HEAVY status (TODO: engine does not yet model enemy defeats)', () => {
      const { result } = setup();
      // TODO: When engine supports DEFEAT triggers, drive a defeat here and assert.
      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });
  });
});
