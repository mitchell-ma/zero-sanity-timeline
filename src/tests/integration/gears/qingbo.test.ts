/**
 * @jest-environment jsdom
 *
 * Qingbo — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (COMBO_SKILL_COOLDOWN_REDUCTION +0.15)
 *      aggregates correctly
 *   2. Trigger fires on combo skill cast (buff = SKILL_DAMAGE_BONUS +0.2)
 *   3. Buff's STAT clause flows into damage breakdown — EXPECTED to fail.
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
const BUFF = require('../../../model/game-data/gears/qingbo/statuses/status-qingbo.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'QINGBO_HEAVY_ARMOR';
const GLOVES_ID = 'QINGBO_GAUNTLETS';
const KIT_ID = 'QINGBO_BAMBOO_CUTTER';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Qingbo — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates COMBO_SKILL_COOLDOWN_REDUCTION +0.15 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.COMBO_SKILL_COOLDOWN_REDUCTION] ?? 0).toBeGreaterThanOrEqual(0.15 - 1e-6);
    });
  });

  describe('Combo skill cast trigger → QINGBO', () => {
    it('placing a combo skill creates the QINGBO buff', () => {
      const { result } = setup();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeSkill(result.current, SLOT, NounType.COMBO, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });

    it('QINGBO contributes SKILL_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeSkill(result.current, SLOT, NounType.COMBO, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.SKILL_DAMAGE_BONUS, BUFF.name);
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const entry = findEntry(entries, 'Skill DMG%');
      expect(entry).toBeDefined();
    });
  });
});
