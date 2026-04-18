/**
 * @jest-environment jsdom
 *
 * Tide Surge — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (SKILL_DAMAGE_BONUS +0.2) aggregates
 *      correctly
 *   2. Trigger fires when 2+ stacks of an arts infliction are applied by the
 *      wielder — freeform-place two stacks of Electric infliction.
 *   3. Buff's STAT clause (ARTS_DAMAGE_BONUS +0.35) flows into the damage
 *      breakdown — EXPECTED to fail until engine wires gear/weapon STAT
 *      ingestion.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { ArtsInflictionType, CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { ENEMY_ID, INFLICTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource,
} from './helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const BUFF = require('../../../model/game-data/gears/tide-surge/statuses/status-tide-surge.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'TIDE_FALL_LIGHT_ARMOR';
const GLOVES_ID = 'TIDE_SURGE_GAUNTLETS';
const KIT_ID = 'HANGING_RIVER_O2_TUBE';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

function placeInfliction(app: AppResult, atFrame: number) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.ELECTRIC, atFrame,
      {
        name: ArtsInflictionType.ELECTRIC_INFLICTION,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId: WULFGARD_ID,
      },
    );
  });
}

describe('Tide Surge — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates SKILL_DAMAGE_BONUS +0.2 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.SKILL_DAMAGE_BONUS] ?? 0).toBeGreaterThanOrEqual(0.2 - 1e-6);
    });
  });

  describe('2+ infliction stacks trigger → TIDE_SURGE', () => {
    it('two stacks of Electric infliction applied by this operator create TIDE_SURGE', () => {
      const { result } = setup();
      placeInfliction(result.current, 1 * FPS);
      placeInfliction(result.current, 2 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(WULFGARD_ID);
    });

    it('TIDE_SURGE contributes ARTS_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      placeInfliction(result.current, 1 * FPS);
      placeInfliction(result.current, 2 * FPS);
      placeSkill(result.current, SLOT, NounType.BATTLE, 3 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.ARTS_DAMAGE_BONUS, BUFF.name);
      expect(contribution).toBeCloseTo(0.35, 4);

      const entries = breakdownFor(row);
      const entry = findEntry(entries, 'Arts DMG%');
      expect(entry).toBeDefined();
    });
  });
});
