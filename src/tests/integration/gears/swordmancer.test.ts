/**
 * @jest-environment jsdom
 *
 * Swordmancer — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (STAGGER_EFFICIENCY_BONUS +0.2) aggregates
 *      correctly
 *   2. Trigger (APPLY STATUS / PHYSICAL on enemy) — freeform-place a
 *      physical status (BREACH) on the enemy with sourceEntityId = wielder,
 *      and assert the SWORDMANCER event is created.
 *   3. Swordmancer DEALs physical damage — no stat is surfaced in a
 *      breakdown for this particular set; the creation check is the primary
 *      assertion.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType, PhysicalStatusType, StatType } from '../../../consts/enums';
import { ENEMY_ID, PHYSICAL_STATUS_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, eventsOnColumn, gearLoadout,
} from './helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
const BUFF = require('../../../model/game-data/gears/swordmancer/statuses/status-swordmancer.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'SWORDMANCER_HEAVY_ARMOR';
const GLOVES_ID = 'SWORDMANCER_TAC_GAUNTLETS';
const KIT_ID = 'SWORDMANCER_FLINT';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, AKEKURI_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

function placePhysicalStatus(app: AppResult, atFrame: number) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, PHYSICAL_STATUS_COLUMNS.BREACH, atFrame,
      {
        name: PhysicalStatusType.BREACH,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId: AKEKURI_ID,
      },
    );
  });
}

describe('Swordmancer — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates STAGGER_EFFICIENCY_BONUS +0.2 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.STAGGER_EFFICIENCY_BONUS] ?? 0).toBeGreaterThanOrEqual(0.2 - 1e-6);
    });
  });

  describe('Physical status trigger → SWORDMANCER', () => {
    it('freeform BREACH applied by this operator creates the SWORDMANCER event', () => {
      const { result } = setup();
      placePhysicalStatus(result.current, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(AKEKURI_ID);
    });
  });
});
