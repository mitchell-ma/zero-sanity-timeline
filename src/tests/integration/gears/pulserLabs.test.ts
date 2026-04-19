/**
 * @jest-environment jsdom
 *
 * Pulser Labs — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (ARTS_INTENSITY +30) aggregates correctly
 *   2. Trigger — Electrification reaction from this operator creates
 *      PULSER_LABS_ELECTRIC; Solidification creates PULSER_LABS_CRYO.
 *      (Pattern mirrors the Hot Work reference.)
 *   3. Buff's STAT clause (ELECTRIC_DAMAGE_BONUS / CRYO_DAMAGE_BONUS) shows
 *      in damage breakdown during its active window — EXPECTED to fail.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, damageRowAtOrAfter, eventsOnColumn,
  gearLoadout, placeSkill, statContributionFromSource, statusDisplayName
} from './helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const ELECTRIC_BUFF = require('../../../model/game-data/gears/pulser-labs/statuses/status-pulser-labs-electric.json').properties;
const CRYO_BUFF = require('../../../model/game-data/gears/pulser-labs/statuses/status-pulser-labs-cryo.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'PULSER_LABS_DISRUPTOR_SUIT';
const GLOVES_ID = 'PULSER_LABS_GLOVES';
const KIT_ID = 'PULSER_LABS_CALIBRATOR';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

function placeReaction(app: AppResult, reactionCol: string, atFrame: number) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, reactionCol, atFrame,
      {
        name: reactionCol,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId: WULFGARD_ID,
      },
    );
  });
}

describe('Pulser Labs — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ARTS_INTENSITY +30 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ARTS_INTENSITY] ?? 0).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Electrification trigger → PULSER_LABS_ELECTRIC', () => {
    it('freeform Electrification applied by this operator creates PULSER_LABS_ELECTRIC', () => {
      const { result } = setup();
      placeReaction(result.current, REACTION_COLUMNS.ELECTRIFICATION, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, ELECTRIC_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(WULFGARD_ID);
    });

    it('PULSER_LABS_ELECTRIC contributes ELECTRIC_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      placeReaction(result.current, REACTION_COLUMNS.ELECTRIFICATION, 1 * FPS);
      // Wulfgard BS is HEAT; the buff's ELECTRIC_DAMAGE_BONUS doesn't visibly
      // multiply HEAT damage, but the buff's stat contribution should still
      // surface in the damage row's statSources map.
      placeSkill(result.current, SLOT, NounType.BATTLE, 3 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, ELECTRIC_BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.ELECTRIC_DAMAGE_BONUS, statusDisplayName(ELECTRIC_BUFF.id));
      expect(contribution).toBeCloseTo(0.5, 4);
    });
  });

  describe('Solidification trigger → PULSER_LABS_CRYO', () => {
    it('freeform Solidification applied by this operator creates PULSER_LABS_CRYO', () => {
      const { result } = setup();
      placeReaction(result.current, REACTION_COLUMNS.SOLIDIFICATION, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, CRYO_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(WULFGARD_ID);
    });
  });
});
