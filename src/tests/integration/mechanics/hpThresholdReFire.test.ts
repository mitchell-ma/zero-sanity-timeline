/**
 * @jest-environment jsdom
 *
 * HP-threshold triggers re-fire at each EVENT_START when the target status
 * is no longer active — engine mechanic.
 *
 * Regression coverage for `_checkHpThresholds` in `eventInterpretorController.ts`.
 * Pre-fix: the trigger deduped once per pipeline run, so short-duration
 * (1-second) HP-gated buffs expired before later skill damage landed and
 * the damage rows were missing the buff's stat contribution. The fix
 * re-invokes the HP-threshold check on every EVENT_START and the inner
 * dedupe guard skips only when every target status of the trigger is
 * already active at that frame.
 *
 * Scenario: Mordvolt Insulation (Wulfgard, arts-dmg gear).
 *   - 3-piece passive + `HP >= 80%` triggers the 1-second MORDVOLT_INSULATION
 *     buff (`properties.duration = 1s`).
 *   - Default state: operators start at full HP → trigger condition holds.
 *   - Two battle skills placed 4s apart exercise re-fire across multiple
 *     EVENT_STARTs; the second BS must receive a fresh buff window so its
 *     damage row carries ARTS_DAMAGE_BONUS from MORDVOLT_INSULATION.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, damageRowAtOrAfter, eventsOnColumn,
  gearLoadout, placeSkill, statContributionFromSource,
} from '../gears/helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const BUFF = require('../../../model/game-data/gears/mordvolt-insulation/statuses/status-mordvolt-insulation.json').properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'MORDVOLT_INSULATION_VEST_T1';
const GLOVES_ID = 'MORDVOLT_INSULATION_GLOVES_T1';
const KIT_ID = 'MORDVOLT_INSULATION_BATTERY_T1';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

describe('HP-threshold re-fire at EVENT_START — Mordvolt Insulation', () => {
  it('BS at 1s: MORDVOLT_INSULATION buff start frame is >= BS EVENT_START (re-applied at BS start, not only at frame 0)', () => {
    const { result } = setup();
    placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

    const bs = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BATTLE,
    )!;
    expect(bs).toBeDefined();

    const buffs = eventsOnColumn(result.current, SLOT, BUFF.id);
    expect(buffs.length).toBeGreaterThanOrEqual(1);
    // Pre-fix symptom: only a single frame-0 buff existed (dedup at startup),
    // which had already expired by the 1s BS EVENT_START. Post-fix: a buff
    // must start at or after the BS's EVENT_START frame so its 1s window
    // covers the skill's damage frames.
    const latestBuff = buffs[buffs.length - 1];
    expect(latestBuff.startFrame).toBeGreaterThanOrEqual(bs.startFrame);
  });

  it('second BS at 5s: another MORDVOLT_INSULATION buff exists AND its ARTS_DAMAGE_BONUS shows up in the BS damage row', () => {
    const { result } = setup();
    placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);
    const bs2 = placeSkill(result.current, SLOT, NounType.BATTLE, 5 * FPS);

    // At least one buff event exists with a start frame >= the second BS's
    // start frame — i.e. the HP-threshold trigger re-fired for the second BS.
    const buffs = eventsOnColumn(result.current, SLOT, BUFF.id);
    const secondBuff = buffs.find(b => b.startFrame >= bs2.atFrame);
    expect(secondBuff).toBeDefined();

    // Stat contribution from MORDVOLT_INSULATION must surface on a damage
    // row at/after the second BS's start frame.
    const c = calc(result.current, CritMode.EXPECTED);
    const row = damageRowAtOrAfter(c, bs2.atFrame);
    expect(row).toBeDefined();
    const contribution = statContributionFromSource(row, StatType.ARTS_DAMAGE_BONUS, BUFF.name);
    expect(contribution).toBeGreaterThan(0);
  });

  // Note: a negative "HP below threshold → no re-fire" case would require
  // mutating enemy/operator HP state, which the public useApp API does not
  // expose. The condition-satisfied re-fire semantic above is what the fix
  // pins; HP-below-threshold behavior is covered by unit tests on
  // `_checkHpThresholds` directly.
});
