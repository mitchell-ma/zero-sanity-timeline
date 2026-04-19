/**
 * @jest-environment jsdom
 *
 * Æthertech — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat aggregates correctly
 *   2. Trigger fires the buff status (allProcessedEvents) — applying
 *      VULNERABLE infliction to the enemy from this operator
 *   3. Buff status's STAT clause flows into damage breakdown — EXPECTED to
 *      fail until engine wires gear/weapon STAT ingestion.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { ENEMY_ID, PHYSICAL_INFLICTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource, statusDisplayName
} from './helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
const BUFF = require('../../../model/game-data/gears/aethertech/statuses/status-aethertech.json').properties;
const MAJOR_BUFF = require('../../../model/game-data/gears/aethertech/statuses/status-aethertech-major.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'THERTECH_PLATING';
const GLOVES_ID = 'THERTECH_GLOVES';
const KIT_ID = 'THERTECH_STABILIZER_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, AKEKURI_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

function placeVulnerable(app: AppResult, atFrame: number) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, atFrame,
      {
        name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId: AKEKURI_ID,
      },
    );
  });
}

describe('Æthertech — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates ATTACK_BONUS +0.08 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.ATTACK_BONUS] ?? 0).toBeGreaterThanOrEqual(0.08 - 1e-6);
    });
  });

  describe('Vulnerability trigger → AETHERTECH', () => {
    it('freeform Vulnerable applied by this operator creates AETHERTECH', () => {
      const { result } = setup();
      placeVulnerable(result.current, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(AKEKURI_ID);
    });

    it('AETHERTECH contributes PHYSICAL_DAMAGE_BONUS during its active window', () => {
      const { result } = setup();
      placeVulnerable(result.current, 1 * FPS);
      placeSkill(result.current, SLOT, NounType.BASIC_ATTACK, 3 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.EXPECTED);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.PHYSICAL_DAMAGE_BONUS, statusDisplayName(BUFF.id));
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const dmgEntry = findEntry(entries, 'Physical DMG%');
      expect(dmgEntry).toBeDefined();
      const sources = dmgEntry!.subEntries ?? [];
      const buffSource = sources.find(s => s.label.toLowerCase().includes(statusDisplayName(BUFF.id).toLowerCase()));
      expect(buffSource).toBeDefined();
    });
  });

  describe('Four-stack trigger → AETHERTECH_MAJOR', () => {
    it('four Vulnerable applications by this operator trigger the major buff', () => {
      const { result } = setup();
      placeVulnerable(result.current, 1 * FPS);
      placeVulnerable(result.current, 2 * FPS);
      placeVulnerable(result.current, 3 * FPS);
      placeVulnerable(result.current, 4 * FPS);

      const majorBuff = eventsOnColumn(result.current, SLOT, MAJOR_BUFF.id);
      expect(majorBuff.length).toBeGreaterThanOrEqual(1);
    });
  });
});
