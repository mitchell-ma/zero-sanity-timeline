/**
 * @jest-environment jsdom
 *
 * Mordvolt Insulation — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (INTELLECT +50) aggregates correctly
 *   2. HP >= 80% trigger is the default state (operators start full HP);
 *      placing any skill creates the MORDVOLT_INSULATION buff.
 *   3. Buff applies ARTS_DAMAGE_BONUS — asserted in the damage breakdown
 *      during its active window (EXPECTED to fail until engine wires
 *      gear/weapon STAT ingestion).
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const BUFF = require('../../../model/game-data/gears/mordvolt-insulation/statuses/status-mordvolt-insulation.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'MORDVOLT_INSULATION_VEST_T1';
const GLOVES_ID = 'MORDVOLT_INSULATION_GLOVES_T1';
const KIT_ID = 'MORDVOLT_INSULATION_BATTERY_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Mordvolt Insulation — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates INTELLECT +50 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.INTELLECT] ?? 0).toBeGreaterThanOrEqual(50);
    });
  });

  describe('HP >= 80% trigger → MORDVOLT_INSULATION', () => {
    it('placing a battle skill creates MORDVOLT_INSULATION (default full HP)', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });

    it('MORDVOLT_INSULATION contributes ARTS_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.ARTS_DAMAGE_BONUS, BUFF.name);
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const entry = findEntry(entries, 'Arts DMG%');
      expect(entry).toBeDefined();
    });
  });
});
