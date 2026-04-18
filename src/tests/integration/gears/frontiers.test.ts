/**
 * @jest-environment jsdom
 *
 * Frontiers — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (COMBO_SKILL_COOLDOWN_REDUCTION +0.15)
 *      aggregates correctly
 *   2. Trigger (RECOVER SP_POINT) — marked it.skip because the engine does
 *      not yet emit RECOVER events for the gear trigger pipeline.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { StatType } from '../../../consts/enums';
import { TEAM_ID } from '../../../controller/slot/commonSlotController';
import {
  SLOT, calc, eventsOnColumn, gearLoadout,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BUFF = require('../../../model/game-data/gears/frontiers/statuses/status-frontiers.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'FRONTIERS_ARMOR_T1';
const GLOVES_ID = 'FRONTIERS_BLIGHT_RES_GLOVES';
const KIT_ID = 'FRONTIERS_COMM_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Frontiers — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates COMBO_SKILL_COOLDOWN_REDUCTION +0.15 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.COMBO_SKILL_COOLDOWN_REDUCTION] ?? 0).toBeGreaterThanOrEqual(0.15 - 1e-6);
    });
  });

  describe('RECOVER SP trigger → FRONTIERS', () => {
    it.skip('triggers when wielder recovers SP from skill (TODO: engine does not emit RECOVER SP_POINT for the gear trigger pipeline)', () => {
      const { result } = setup();
      // TODO: Place a combo skill whose animation returns SP; verify the team-wide buff lands on TEAM_ID.
      const buff = eventsOnColumn(result.current, TEAM_ID, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });
  });
});
