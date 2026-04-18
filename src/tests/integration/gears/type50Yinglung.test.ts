/**
 * @jest-environment jsdom
 *
 * Type 50 Yinglung — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (ATTACK_BONUS +0.15) aggregates correctly
 *   2. Trigger (any operator PERFORM BATTLE) — cast a battle skill; the
 *      wearer receives the TYPE_50_YINGLUNG buff.
 *   3. Buff's STAT clause (COMBO_SKILL_DAMAGE_BONUS +0.2, consumed on next
 *      combo cast) flows into the damage breakdown — EXPECTED to fail.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BUFF = require('../../../model/game-data/gears/type-50-yinglung/statuses/status-type-50-yinglung.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'TYPE_50_YINGLUNG_HEAVY_ARMOR_T1';
const GLOVES_ID = 'TYPE_50_YINGLUNG_GLOVES_T1';
const KIT_ID = 'TYPE_50_YINGLUNG_KNIFE_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Type 50 Yinglung — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ATTACK_BONUS +0.15 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ATTACK_BONUS] ?? 0).toBeGreaterThanOrEqual(0.15 - 1e-6);
    });
  });

  describe('Battle skill trigger → TYPE_50_YINGLUNG', () => {
    it('placing a battle skill creates the TYPE_50_YINGLUNG buff', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
    });

    it('TYPE_50_YINGLUNG contributes COMBO_SKILL_DAMAGE_BONUS for the next combo cast', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeSkill(result.current, SLOT, NounType.COMBO, 3 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.COMBO_SKILL_DAMAGE_BONUS, BUFF.name);
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const entry = findEntry(entries, 'Skill Type DMG%');
      expect(entry).toBeDefined();
    });
  });
});
