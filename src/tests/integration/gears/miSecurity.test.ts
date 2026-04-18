/**
 * @jest-environment jsdom
 *
 * MI Security — gear set E2E.
 *
 * Coverage:
 *   1. Passive 3-piece bonus stat (CRITICAL_RATE +0.05) aggregates correctly
 *   2. Trigger (PERFORM CRITICAL_HIT) is already covered by
 *      `mechanics/miSecurityDualScopeStacking.test.ts`; here we focus on the
 *      calc-ingestion leg: verify the buff's ATTACK_BONUS shows up in the
 *      damage-row statSources during its active window (EXPECTED to fail
 *      until engine wires gear/weapon STAT ingestion).
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, eventsOnColumn, findEntry,
  gearLoadout, placeSkill, statContributionFromSource,
} from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../model/game-data/operators/rossi/rossi.json').id;
const BUFF = require('../../../model/game-data/gears/mi-security/statuses/status-mi-security.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'MI_SECURITY_ARMOR_T1';
const GLOVES_ID = 'MI_SECURITY_GLOVES_T1';
const KIT_ID = 'MI_SECURITY_PUSH_KNIFE_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, ROSSI_ID); });
  act(() => { view.result.current.setCritMode(CritMode.ALWAYS); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('MI Security — gear set E2E', () => {
  describe('passive 3-piece bonus', () => {
    it('aggregates CRITICAL_RATE +0.05 for the wielder', () => {
      const { result } = setup();
      const c = calc(result.current);
      const stats = c.aggregatedStats[SLOT].stats;
      expect(stats[StatType.CRITICAL_RATE] ?? 0).toBeGreaterThanOrEqual(0.05 - 1e-6);
    });
  });

  describe('Critical hit trigger → MI_SECURITY', () => {
    it('basic attack under CritMode.ALWAYS creates MI_SECURITY buff events', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BASIC_ATTACK, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id);
      expect(buff.length).toBeGreaterThanOrEqual(1);
      expect(buff[0].sourceEntityId).toBe(ROSSI_ID);
    });

    it('MI_SECURITY contributes ATTACK_BONUS during its active window', () => {
      const { result } = setup();
      placeSkill(result.current, SLOT, NounType.BASIC_ATTACK, 1 * FPS);

      const buff = eventsOnColumn(result.current, SLOT, BUFF.id)[0];
      expect(buff).toBeDefined();

      const c = calc(result.current, CritMode.ALWAYS);
      const row = damageRowAtOrAfter(c, buff.startFrame + 1);
      expect(row).toBeDefined();

      const contribution = statContributionFromSource(row, StatType.ATTACK_BONUS, BUFF.name);
      expect(contribution).toBeGreaterThan(0);

      const entries = breakdownFor(row);
      const atkEntry = findEntry(entries, 'ATK%');
      expect(atkEntry).toBeDefined();
      const sources = atkEntry!.subEntries ?? [];
      const buffSource = sources.find(s => s.label.toLowerCase().includes(BUFF.name.toLowerCase()));
      expect(buffSource).toBeDefined();
    });
  });
});
