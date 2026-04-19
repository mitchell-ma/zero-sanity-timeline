/**
 * @jest-environment jsdom
 *
 * Breakdown tree — gear-buff stat source surfaces end-to-end.
 *
 * The gear-set coverage (`hotWork.test.ts`) already pins that a gear buff's
 * STAT clause lands in `row.params.sub.statSources[StatType.X]` with the
 * buff's display name. That is the calc-row layer.
 *
 * This test pins the next layer down — the rendered breakdown tree that the
 * InformationPane actually draws via `buildMultiplierEntries`. Regression
 * targets:
 *   1. The "Heat DMG%" entry has a leaf whose `label` matches the buff's
 *      display name ("Hot Work (Heat)"), not its raw id ("HOT_WORK_HEAT").
 *   2. The leaf's `value` equals the clause's VARY_BY resolved value (0.5).
 *   3. With no Combustion inflicted, the "Hot Work" buff does NOT appear
 *      under "Heat DMG%".
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, ElementType, InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, breakdownFor, damageRowAtOrAfter, findEntry, findSourceEntry,
  gearLoadout, placeSkill, statusDisplayName
} from '../gears/helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const HEAT_BUFF = require('../../../model/game-data/gears/hot-work/statuses/status-hot-work-heat.json').properties;
const HEAT_STATUS_JSON = require('../../../model/game-data/gears/hot-work/statuses/status-hot-work-heat.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const ARMOR_ID = 'HOT_WORK_EXO_RIG';
const GLOVES_ID = 'HOT_WORK_GAUNTLETS_T1';
const KIT_ID = 'HOT_WORK_POWER_BANK';

const HEAT_DMG_LABEL = 'Heat DMG%';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID));
  });
  return view;
}

function placeCombustion(
  app: ReturnType<typeof setup>['result']['current'],
  atFrame: number,
) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.COMBUSTION, atFrame,
      {
        name: REACTION_COLUMNS.COMBUSTION,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId: LAEVATAIN_ID,
      },
    );
  });
}

describe('InformationPane breakdown tree — gear buff source visibility', () => {
  it('surfaces the HOT_WORK_HEAT clause under "Heat DMG%" with display name and resolved value', () => {
    const { result } = setup();
    placeCombustion(result.current, 1 * FPS);
    placeSkill(result.current, SLOT, NounType.BATTLE, 3 * FPS);

    const c = calc(result.current, CritMode.EXPECTED);
    const row = damageRowAtOrAfter(c, 3 * FPS + 1);
    expect(row).toBeDefined();
    expect(row!.params!.sub!.element).toBe(ElementType.HEAT);

    const entries = breakdownFor(row);
    const heatEntry = findEntry(entries, HEAT_DMG_LABEL);
    expect(heatEntry).toBeDefined();
    expect(heatEntry!.subEntries).toBeDefined();

    // Leaf must carry the buff's DISPLAY NAME, not its raw id.
    const buffLeaf = heatEntry!.subEntries!.find(e => e.label === statusDisplayName(HEAT_BUFF.id));
    expect(buffLeaf).toBeDefined();
    // Raw-id leak regression: no leaf should label with the internal id.
    const rawIdLeak = heatEntry!.subEntries!.find(e => e.label === HEAT_BUFF.id);
    expect(rawIdLeak).toBeUndefined();

    // Clause value (0.5 per hot-work JSON `clause.effects[0].with.value.value`)
    // must propagate end-to-end to the leaf entry.
    const clauseValue = HEAT_STATUS_JSON.segments[0].clause[0].effects[0].with.value.value;
    expect(clauseValue).toBe(0.5);
    expect(buffLeaf!.value).toBeCloseTo(0.5, 4);
  });

  it('without Combustion inflicted: the "Hot Work (Heat)" buff does NOT appear under "Heat DMG%"', () => {
    const { result } = setup();
    // Place only the BS — no Combustion → the HOT_WORK_HEAT buff never fires.
    // Note: the 3pc gear pieces themselves contribute flat Heat DMG% via their
    // own stat blocks ("Hot Work Exo-Rig", etc.); we only assert the BUFF
    // status (display name "Hot Work (Heat)") is absent — that's what the
    // Combustion trigger is supposed to spawn.
    placeSkill(result.current, SLOT, NounType.BATTLE, 1 * FPS);

    const c = calc(result.current, CritMode.EXPECTED);
    const row = damageRowAtOrAfter(c, 1 * FPS + 1);
    expect(row).toBeDefined();

    const entries = breakdownFor(row);
    const heatEntry = findEntry(entries, HEAT_DMG_LABEL);
    const heatSubs = heatEntry?.subEntries ?? [];
    const buffLeaf = heatSubs.find(e => e.label === statusDisplayName(HEAT_BUFF.id));
    expect(buffLeaf).toBeUndefined();
    // Raw id leak also absent (regression guard in the negative path too).
    const rawIdLeaf = heatSubs.find(e => e.label === HEAT_BUFF.id);
    expect(rawIdLeaf).toBeUndefined();

    // Global scan: the triggered BUFF should not appear anywhere in the tree
    // (distinct from the 3pc gear-piece stat contributions which remain).
    const buffAnywhere = findSourceEntry(entries, statusDisplayName(HEAT_BUFF.id));
    expect(buffAnywhere).toBeUndefined();
  });
});
