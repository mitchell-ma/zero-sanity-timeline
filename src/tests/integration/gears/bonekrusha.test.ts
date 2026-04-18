/**
 * @jest-environment jsdom
 *
 * Bonekrusha — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (ATTACK_BONUS +0.15) aggregates correctly
 *   2. Trigger fires on combo skill cast
 *   3. Buff status's STAT clause flows into damage breakdown — EXPECTED to
 *      fail until engine wires gear/weapon STAT ingestion.
 *      Buff grants BATTLE_SKILL_DAMAGE_BONUS (objectQualifier BATTLE),
 *      consumed on next BS cast.
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
const BUFF = require('../../../model/game-data/gears/bonekrusha/statuses/status-bonekrusha.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'BONEKRUSHA_HEAVY_ARMOR_T1';
const GLOVES_ID = 'BONEKRUSHA_WRISTBAND_T1';
const KIT_ID = 'BONEKRUSHA_FIGURINE_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Bonekrusha — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ATTACK_BONUS +0.15 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ATTACK_BONUS] ?? 0).toBeGreaterThanOrEqual(0.15 - 1e-6);
    });
  });

  describe('Combo skill cast trigger → BONEKRUSHA', () => {
    it('placing a combo skill creates the BONEKRUSHA buff', () => {
      const { result } = setup();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeSkill(result.current, SLOT, NounType.COMBO, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });

    it('BONEKRUSHA contributes battle-skill damage bonus when active', () => {
      const { result } = setup();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeSkill(result.current, SLOT, NounType.COMBO, 1 * FPS);
      placeSkill(result.current, SLOT, NounType.BATTLE, 3 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.BATTLE_SKILL_DAMAGE_BONUS, BUFF.name);
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const entry = findEntry(entries, 'Skill Type DMG%');
      expect(entry).toBeDefined();
    });
  });
});
