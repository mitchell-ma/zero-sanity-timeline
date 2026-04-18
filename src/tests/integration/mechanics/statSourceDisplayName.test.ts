/**
 * @jest-environment jsdom
 *
 * Stat source label resolves to the status's display name — engine mechanic.
 *
 * Regression coverage for the fix at `eventInterpretorController.ts:~1557`
 * where `pushStatSource` now resolves the breakdown-facing source label via
 * `getStatusDef(parentStatusId).properties.name` rather than leaking the
 * raw status ID. The event-level `sourceSkillId` field stores IDs like
 * `HOT_WORK_HEAT`; the breakdown UI must show `"Hot Work (Heat)"` instead.
 *
 * Scenario: Laevatain with Hot Work gear, freeform COMBUSTION on enemy
 * triggers `HOT_WORK_HEAT` (status id) / `"Hot Work (Heat)"` (status name).
 * A battle skill's damage row has a statSources entry for HEAT_DAMAGE_BONUS
 * whose `source` field equals the display name exactly — NOT the raw ID.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import {
  SLOT, calc, damageRowAtOrAfter, eventsOnColumn,
  gearLoadout, placeSkill,
} from '../gears/helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const HEAT_BUFF = require('../../../model/game-data/gears/hot-work/statuses/status-hot-work-heat.json').properties;
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
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

describe('Stat source label resolves to the status display name', () => {
  it('HOT_WORK_HEAT surfaces as "Hot Work (Heat)" (display name), not as the raw ID', () => {
    const { result } = setup();

    // Freeform COMBUSTION on enemy → HOT_WORK_HEAT trigger fires.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        {
          name: REACTION_COLUMNS.COMBUSTION,
          segments: [{ properties: { duration: 20 * FPS } }],
          sourceEntityId: LAEVATAIN_ID,
        },
      );
    });

    // Sanity: the buff was created on the operator slot.
    const buff = eventsOnColumn(result.current, SLOT, HEAT_BUFF.id)[0];
    expect(buff).toBeDefined();

    // Battle skill to produce a damage row whose sub.statSources we can inspect.
    placeSkill(result.current, SLOT, NounType.BATTLE, 3 * FPS);

    const c = calc(result.current, CritMode.EXPECTED);
    const row = damageRowAtOrAfter(c, buff.startFrame + 1);
    expect(row).toBeDefined();

    const sources = row!.params!.sub!.statSources?.[StatType.HEAT_DAMAGE_BONUS];
    expect(sources).toBeDefined();
    expect(sources!.length).toBeGreaterThan(0);

    // Exact match: the source label is the status's display NAME, not its ID.
    // (display name = "Hot Work (Heat)" ; id = "HOT_WORK_HEAT")
    expect(HEAT_BUFF.name).not.toBe(HEAT_BUFF.id);
    const hasDisplayName = sources!.some(s => s.source === HEAT_BUFF.name);
    expect(hasDisplayName).toBe(true);

    // Negative: no source entry leaks the raw ID.
    const hasRawId = sources!.some(s => s.source === HEAT_BUFF.id);
    expect(hasRawId).toBe(false);
  });
});
