/**
 * @jest-environment jsdom
 *
 * onTriggerClauseType FIRST_MATCH — Integration Tests
 *
 * Covers the def-level `onTriggerClauseType: "FIRST_MATCH"` marker that
 * changes how multiple `onTriggerClause` entries on the same def are
 * evaluated when more than one clause's conditions match the same event.
 *
 * Reference: Endministrator's Essence Disintegration talent
 * (talent-essence-disintegration-talent.json) carries
 * `onTriggerClauseType: "FIRST_MATCH"`. Both clauses share the same
 * `CONSUME STATUS ORIGINIUM_CRYSTAL` trigger; clause 1 is gated on
 * `HAVE POTENTIAL >= 2`, clause 2 is the base (no potential gate).
 *
 * Without FIRST_MATCH at P2 the engine fires BOTH clauses, which produces
 * two APPLY-EVENT emissions onto the same RESET-limited status column —
 * the first instance is clamped to zero duration by the newer instance.
 * FIRST_MATCH should produce a single live self-buff at P2.
 */
import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { ClauseEvaluationType } from '../../../dsl/semantics';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../view/InformationPane';
import type { LoadoutProperties } from '../../../view/InformationPane';

/* eslint-disable @typescript-eslint/no-require-imports */
const ENDMINISTRATOR_ID: string = require(
  '../../../model/game-data/operators/endministrator/endministrator.json',
).id;

const ESSENCE_DISINTEGRATION_TALENT_JSON = require(
  '../../../model/game-data/operators/endministrator/talents/talent-essence-disintegration-talent.json',
);
const ESSENCE_DISINTEGRATION_ID: string = ESSENCE_DISINTEGRATION_TALENT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ENDMINISTRATOR = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setupEndministratorWithPotential(potential: number): { result: { current: AppResult } } {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID); });

  const stats: LoadoutProperties = {
    ...DEFAULT_LOADOUT_PROPERTIES,
    operator: {
      ...DEFAULT_LOADOUT_PROPERTIES.operator,
      potential,
    },
  };
  act(() => { view.result.current.handleStatsChange(SLOT_ENDMINISTRATOR, stats); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

  return view;
}

function placeComboThenBS(app: AppResult) {
  const comboCol = findColumn(app, SLOT_ENDMINISTRATOR, NounType.COMBO);
  const comboPayload = getMenuPayload(app, comboCol!, 2 * FPS);
  act(() => {
    app.handleAddEvent(
      comboPayload.ownerEntityId, comboPayload.columnId,
      comboPayload.atFrame, comboPayload.defaultSkill,
    );
  });

  const battleCol = findColumn(app, SLOT_ENDMINISTRATOR, NounType.BATTLE);
  const battlePayload = getMenuPayload(app, battleCol!, 5 * FPS);
  act(() => {
    app.handleAddEvent(
      battlePayload.ownerEntityId, battlePayload.columnId,
      battlePayload.atFrame, battlePayload.defaultSkill,
    );
  });
}

describe('onTriggerClauseType FIRST_MATCH — Essence Disintegration talent', () => {
  it('Sanity: talent JSON carries onTriggerClauseType = FIRST_MATCH', () => {
    // Guard against someone deleting the marker from the JSON.
    expect(ESSENCE_DISINTEGRATION_TALENT_JSON.onTriggerClauseType).toBe(
      ClauseEvaluationType.FIRST_MATCH,
    );
    // Confirm both clauses exist and share a CONSUME ORIGINIUM_CRYSTAL trigger.
    expect(ESSENCE_DISINTEGRATION_TALENT_JSON.onTriggerClause).toHaveLength(2);
  });

  it('P2: exactly one live Essence Disintegration buff with 15s duration (no zero-duration stub)', () => {
    const { result } = setupEndministratorWithPotential(2);
    placeComboThenBS(result.current);

    const buffs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );

    // FIRST_MATCH: only the P>=2 clause should fire, not the base clause too.
    // The base clause would otherwise create a second APPLY EVENT whose RESET
    // stack-interaction clamps one of the two to zero duration.
    expect(buffs).toHaveLength(1);
    expect(eventDuration(buffs[0])).toBe(15 * FPS);

    // Explicit negative assertion: no zero-duration stub anywhere on this column
    // for the operator's slot.
    const zeroStubs = buffs.filter(ev => eventDuration(ev) === 0);
    expect(zeroStubs).toHaveLength(0);
  });

  it('P0: exactly one live buff from the base clause (potential gate rejects clause 1)', () => {
    // At P0 only the base (second) clause matches; FIRST_MATCH still produces
    // a single live buff. This path already worked before FIRST_MATCH landed —
    // pinning it confirms FIRST_MATCH didn't regress the single-clause case.
    const { result } = setupEndministratorWithPotential(0);
    placeComboThenBS(result.current);

    const buffs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );

    expect(buffs).toHaveLength(1);
    expect(eventDuration(buffs[0])).toBe(15 * FPS);

    const zeroStubs = buffs.filter(ev => eventDuration(ev) === 0);
    expect(zeroStubs).toHaveLength(0);
  });
});
