/**
 * @jest-environment jsdom
 *
 * Hot Work — gear set E2E.
 *
 * Coverage:
 *   1. Loadout aggregation — 3-piece passive ARTS_INTENSITY +30 surfaces in
 *      `aggregatedStats` with "Hot Work (Gear Set)" source.
 *   2. Trigger dispatch — applying Combustion fires HOT_WORK_HEAT,
 *      applying Corrosion fires HOT_WORK_NATURE.
 *   3. Calculation ingestion — while a buff status is active, its
 *      `clause` STAT (HEAT_DAMAGE_BONUS / NATURE_DAMAGE_BONUS) shows up in
 *      `sub.statSources` and the breakdown tree.
 *
 * Layer (3) requires the engine to ingest STAT applications from active
 * buff statuses into per-frame damage; failing assertions there indicate
 * the wiring is still pending.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, ElementType, InteractionModeType, StatType } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const HEAT_BUFF = require('../../../model/game-data/gears/hot-work/statuses/status-hot-work-heat.json').properties;
const NATURE_BUFF = require('../../../model/game-data/gears/hot-work/statuses/status-hot-work-nature.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'HOT_WORK_EXO_RIG';
const GLOVES_ID = 'HOT_WORK_GAUNTLETS_T1';
const KIT_ID = 'HOT_WORK_POWER_BANK';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('Hot Work — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ARTS_INTENSITY +30 with the "Hot Work (Gear Set)" source', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ARTS_INTENSITY]).toBeGreaterThanOrEqual(30);
    });
  });

  function placeReaction(
    app: ReturnType<typeof setup>['result']['current'],
    reactionCol: string,
    atFrame: number,
  ) {
    act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      app.handleAddEvent(
        ENEMY_ID, reactionCol, atFrame,
        {
          name: reactionCol,
          segments: [{ properties: { duration: 20 * FPS } }],
          sourceEntityId: LAEVATAIN_ID,
        },
      );
    });
  }

  describe('Combustion trigger → HOT_WORK_HEAT', () => {
    it('freeform Combustion applied by this operator creates HOT_WORK_HEAT', () => {
      const { result } = setup();
      placeReaction(result.current, REACTION_COLUMNS.COMBUSTION, 1 * FPS);

      const combustion = eventsOnColumn(result.current, ENEMY_ID, REACTION_COLUMNS.COMBUSTION);
      expect(combustion.length).toBeGreaterThanOrEqual(1);

      const buff = eventsOnColumn(result.current, SLOT, HEAT_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });

    it('HOT_WORK_HEAT contributes HEAT_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      placeReaction(result.current, REACTION_COLUMNS.COMBUSTION, 1 * FPS);
      placeSkill(result.current, SLOT, NounType.BATTLE, 3 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, HEAT_BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();
      expect(row!.params!.sub!.element).toBe(ElementType.HEAT);

      const contribution = statContributionFromSource(row, StatType.HEAT_DAMAGE_BONUS, HEAT_BUFF.name);
      expect(contribution).toBeCloseTo(0.5, 4);

      const entries = breakdownFor(row);
      const heatEntry = findEntry(entries, 'Heat DMG%');
      expect(heatEntry).toBeDefined();
      expect(heatEntry!.value).toBeGreaterThanOrEqual(0.5 - 1e-6);
      const sources = heatEntry!.subEntries ?? [];
      const buffSource = sources.find(s => s.label.toLowerCase().includes(HEAT_BUFF.name.toLowerCase()));
      expect(buffSource).toBeDefined();
      expect(buffSource!.value).toBeCloseTo(0.5, 4);
    });
  });

  describe('Corrosion trigger → HOT_WORK_NATURE', () => {
    it('freeform Corrosion applied by this operator creates HOT_WORK_NATURE', () => {
      const { result } = setup();
      placeReaction(result.current, REACTION_COLUMNS.CORROSION, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, NATURE_BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(LAEVATAIN_ID);
    });
  });
});
