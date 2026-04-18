/**
 * @jest-environment jsdom
 *
 * Aburrey's Legacy — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat aggregates correctly
 *   2. Trigger fires the buff status (allProcessedEvents) — one per skill type
 *   3. Buff status's STAT clause flows into damage breakdown — EXPECTED to
 *      fail until engine wires gear/weapon STAT ingestion.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, SLOT_INDEX, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource,
} from './helpers';
import { setUltimateEnergyToMax } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const BATTLE_BUFF = require('../../../model/game-data/gears/aburrey-legacy/statuses/status-aburrey-legacy-battle-skill.json').properties;
const COMBO_BUFF = require('../../../model/game-data/gears/aburrey-legacy/statuses/status-aburrey-legacy-combo-skill.json').properties;
const ULT_BUFF = require('../../../model/game-data/gears/aburrey-legacy/statuses/status-aburrey-legacy-ultimate.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'ABURREY_HEAVY_ARMOR_T1';
const GLOVES_ID = 'ABURREY_GAUNTLETS';
const KIT_ID = 'ABURREY_AUDITORY_CHIP_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe("Aburrey's Legacy — gear set E2E", () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates SKILL_DAMAGE_BONUS +0.24 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.SKILL_DAMAGE_BONUS] ?? 0).toBeGreaterThanOrEqual(0.24 - 1e-6);
    });
  });

  describe('Battle skill trigger → ABURREY_LEGACY_BATTLE_SKILL', () => {
    it('placing a battle skill creates the battle-skill buff', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BATTLE_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });

    it('ABURREY_LEGACY_BATTLE_SKILL contributes ATTACK_BONUS during its active window', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BATTLE_BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.ATTACK_BONUS, BATTLE_BUFF.name);
      expect(contribution).toBeCloseTo(0.05, 4);

      const entries = breakdownFor(row);
      const atkEntry = findEntry(entries, 'ATK%');
      expect(atkEntry).toBeDefined();
      const sources = atkEntry!.subEntries ?? [];
      const buffSource = sources.find(s => s.label.toLowerCase().includes(BATTLE_BUFF.name.toLowerCase()));
      expect(buffSource).toBeDefined();
      expect(buffSource!.value).toBeCloseTo(0.05, 4);
    });
  });

  describe('Combo skill trigger → ABURREY_LEGACY_COMBO_SKILL', () => {
    it('placing a combo skill creates the combo-skill buff', () => {
      const { result } = setup();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeSkill(result.current, SLOT, NounType.COMBO, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, COMBO_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });
  });

  describe('Ultimate trigger → ABURREY_LEGACY_ULTIMATE', () => {
    it('placing an ultimate creates the ultimate buff', () => {
      const { result } = setup();
      act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });
      placeSkill(result.current, SLOT, NounType.ULTIMATE, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, ULT_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });
  });
});
