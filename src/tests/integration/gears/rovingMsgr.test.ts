/**
 * @jest-environment jsdom
 *
 * Roving MSGR — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (AGILITY +50) aggregates correctly
 *   2. HP >= 80% trigger is the default state (operators start full HP);
 *      placing any skill creates the ROVING_MSGR buff.
 *   3. Buff's STAT clause (PHYSICAL_DAMAGE_BONUS +0.2) flows into the damage
 *      breakdown — EXPECTED to fail until engine wires gear/weapon STAT
 *      ingestion.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource, statusDisplayName
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
const BUFF = require('../../../model/game-data/gears/roving-msgr/statuses/status-roving-msgr.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'ROVING_MSGR_JACKET_T1';
const GLOVES_ID = 'ROVING_MSGR_FISTS_T1';
const KIT_ID = 'ROVING_MSGR_FLASHLIGHT_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, AKEKURI_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Roving MSGR — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates AGILITY +50 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.AGILITY] ?? 0).toBeGreaterThanOrEqual(50);
    });
  });

  describe('HP >= 80% trigger → ROVING_MSGR', () => {
    it('placing a battle skill creates ROVING_MSGR (default full HP)', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });

    it('ROVING_MSGR contributes PHYSICAL_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.PHYSICAL_DAMAGE_BONUS, statusDisplayName(BUFF.id));
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const entry = findEntry(entries, 'Physical DMG%');
      expect(entry).toBeDefined();
    });
  });
});
