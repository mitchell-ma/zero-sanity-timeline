/**
 * @jest-environment jsdom
 */

/**
 * Gilberta — Messenger's Song Talent Integration Test
 *
 * Verifies that the APPLY STAT (ULTIMATE_GAIN_EFFICIENCY) talent effects
 * are filtered by operator class: GUARD, CASTER, SUPPORTER receive the buff,
 * while STRIKER (and other non-matching classes) do not.
 *
 * Setup: 4-operator team
 *  - slot-0: Gilberta (SUPPORTER) — matches
 *  - slot-1: Endministrator (GUARD) — matches
 *  - slot-2: Fluorite (CASTER) — matches
 *  - slot-3: Laevatain (STRIKER) — does NOT match
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { StatType } from '../../../../consts/enums';
import { getLastStatAccumulator } from '../../../../controller/timeline/eventQueueController';
import { aggregateLoadoutStats } from '../../../../controller/calculation/loadoutAggregator';

/* eslint-disable @typescript-eslint/no-require-imports */
const GILBERTA_ID: string = require('../../../../model/game-data/operators/gilberta/gilberta.json').id;
const ENDMINISTRATOR_ID: string = require('../../../../model/game-data/operators/endministrator/endministrator.json').id;
const FLUORITE_ID: string = require('../../../../model/game-data/operators/fluorite/fluorite.json').id;
const LAEVATAIN_ID: string = require('../../../../model/game-data/operators/laevatain/laevatain.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_GILBERTA = 'slot-0';
const SLOT_ENDMINISTRATOR = 'slot-1';
const SLOT_FLUORITE = 'slot-2';
const SLOT_LAEVATAIN = 'slot-3';

/**
 * Talent value = VARY_BY TALENT_LEVEL [0.04, 0.07] + VARY_BY POTENTIAL [0,0,0,0.05,0.05,0.05]
 * Resolved per-target-operator using THEIR talent level and potential context.
 *
 * Gilberta (6★, P0 default): talent level 2 → 0.07, potential 0 → 0.00 = 0.07
 * Endministrator (6★, P0 default): talent level is Gilberta's (source) → 0.07, potential 0 → 0.00 = 0.07
 * Fluorite (4★, P5 default): talent level → 0.07, potential 5 → 0.05 = 0.12
 */

function setupTeam() {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT_GILBERTA, GILBERTA_ID);
    view.result.current.handleSwapOperator(SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID);
    view.result.current.handleSwapOperator(SLOT_FLUORITE, FLUORITE_ID);
    view.result.current.handleSwapOperator(SLOT_LAEVATAIN, LAEVATAIN_ID);
  });
  return view;
}

/**
 * Helper: get the base loadout UE efficiency for a slot (before talent buffs).
 * Returns 0 if aggregation fails (no loadout configured).
 */
function getBaseUeEfficiency(app: ReturnType<typeof useApp>, slotId: string, operatorId: string) {
  const loadout = app.loadouts?.[slotId];
  const props = app.loadoutProperties?.[slotId];
  if (!loadout || !props) return 0;
  const agg = aggregateLoadoutStats(operatorId, loadout, props);
  return agg?.stats[StatType.ULTIMATE_GAIN_EFFICIENCY] ?? 0;
}

describe('Gilberta — Messenger\'s Song talent class filtering', () => {
  it('applies UE gain efficiency to GUARD, CASTER, SUPPORTER but not STRIKER', () => {
    const { result } = setupTeam();

    const accumulator = getLastStatAccumulator();
    expect(accumulator).not.toBeNull();

    // Get accumulated (talent-inclusive) UE efficiency for each slot
    const accGilberta = accumulator!.getStat(SLOT_GILBERTA, StatType.ULTIMATE_GAIN_EFFICIENCY);
    const accEndministrator = accumulator!.getStat(SLOT_ENDMINISTRATOR, StatType.ULTIMATE_GAIN_EFFICIENCY);
    const accFluorite = accumulator!.getStat(SLOT_FLUORITE, StatType.ULTIMATE_GAIN_EFFICIENCY);
    const accLaevatain = accumulator!.getStat(SLOT_LAEVATAIN, StatType.ULTIMATE_GAIN_EFFICIENCY);

    // Get base loadout UE efficiency (without talent)
    const baseGilberta = getBaseUeEfficiency(result.current, SLOT_GILBERTA, GILBERTA_ID);
    const baseEndministrator = getBaseUeEfficiency(result.current, SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID);
    const baseFluorite = getBaseUeEfficiency(result.current, SLOT_FLUORITE, FLUORITE_ID);
    const baseLaevatain = getBaseUeEfficiency(result.current, SLOT_LAEVATAIN, LAEVATAIN_ID);

    // Matching classes: talent delta should be > 0
    const deltaGilberta = accGilberta - baseGilberta;
    const deltaEndministrator = accEndministrator - baseEndministrator;
    const deltaFluorite = accFluorite - baseFluorite;
    const deltaLaevatain = accLaevatain - baseLaevatain;

    expect(deltaGilberta).toBeGreaterThan(0);
    expect(deltaEndministrator).toBeGreaterThan(0);
    expect(deltaFluorite).toBeGreaterThan(0);

    // Non-matching class (STRIKER): no talent delta
    expect(deltaLaevatain).toBeCloseTo(0, 4);
  });
});
