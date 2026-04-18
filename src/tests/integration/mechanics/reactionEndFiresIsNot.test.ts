/**
 * @jest-environment jsdom
 *
 * REACTION end fires IS_NOT (EVENT_END lifecycle) — engine mechanic.
 *
 * Regression coverage for the fix that now routes the REACTION branch of
 * `doApply` (in `eventInterpretorController.ts`, `APPLY STATUS REACTION X`)
 * through `runStatusCreationLifecycle`. Before the fix, freeform reactions
 * did NOT schedule an `EVENT_END` hook, so the `IS_NOT:<column>` reactive
 * trigger never fired when the reaction expired, and statuses that depend on
 * `BECOME NOT <state>` conditions (e.g. Yvonne's Freezing Point talent)
 * never consumed and lingered forever.
 *
 * Scenario: Yvonne's Freezing Point (`FREEZING_POINT_TALENT`).
 *   onTriggerClause:
 *     - ANY OPERATOR APPLY REACTION SOLIDIFICATION  →  APPLY EVENT (this)
 *     - ENEMY BECOME NOT SOLIDIFIED                  →  CONSUME EVENT (this)
 *   Placing a freeform SOLIDIFICATION on the enemy must:
 *     1. Create a FREEZING_POINT_TALENT event on Yvonne's slot
 *     2. End that event exactly when SOLIDIFICATION ends (not permanent)
 *     3. Not create the talent for an unrelated reaction (COMBUSTION)
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType, PERMANENT_DURATION } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { eventDuration } from '../../../consts/viewTypes';
import { FPS } from '../../../utils/timeline';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../model/game-data/operators/yvonne/yvonne.json').id;
const FREEZING_POINT_JSON = require('../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const FP_ID: string = FREEZING_POINT_JSON.properties.id;
const SLOT = 'slot-0';
const SOLID_DURATION_FRAMES = 5 * FPS;

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeFreeformReaction(
  app: AppResult,
  reactionColumn: string,
  atFrame: number,
  durationFrames: number,
) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, reactionColumn, atFrame,
      {
        name: reactionColumn,
        segments: [{ properties: { duration: Math.round(durationFrames) } }],
        sourceEntityId: YVONNE_ID,
      },
    );
  });
}

describe('REACTION apply runs creation lifecycle (schedules EVENT_END → IS_NOT)', () => {
  it('freeform SOLIDIFICATION creates FREEZING_POINT_TALENT on Yvonne', () => {
    const { result } = setup();
    placeFreeformReaction(result.current, REACTION_COLUMNS.SOLIDIFICATION, 1 * FPS, SOLID_DURATION_FRAMES);

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp.length).toBeGreaterThanOrEqual(1);
  });

  it('FREEZING_POINT_TALENT ends exactly when SOLIDIFICATION ends (BECOME_NOT fires via EVENT_END)', () => {
    const { result } = setup();
    placeFreeformReaction(result.current, REACTION_COLUMNS.SOLIDIFICATION, 1 * FPS, SOLID_DURATION_FRAMES);

    const reaction = result.current.allProcessedEvents.find(
      ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerEntityId === ENEMY_ID,
    )!;
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;
    expect(reaction).toBeDefined();
    expect(fp).toBeDefined();

    const reactionEnd = reaction.startFrame + eventDuration(reaction);
    const fpEnd = fp.startFrame + eventDuration(fp);
    expect(fpEnd).toBe(reactionEnd);
  });

  it('FREEZING_POINT_TALENT is NOT permanent (its JSON default would be if IS_NOT never fired)', () => {
    // Pre-fix symptom: FP ran forever because IS_NOT:solidification never
    // fired, so the talent retained its JSON-default 99999s permanent
    // duration. After the fix, EVENT_END of the reaction clamps the talent.
    const { result } = setup();
    placeFreeformReaction(result.current, REACTION_COLUMNS.SOLIDIFICATION, 1 * FPS, SOLID_DURATION_FRAMES);

    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;
    expect(fp).toBeDefined();

    const fpDur = eventDuration(fp);
    expect(fpDur).toBeLessThan(PERMANENT_DURATION);
    // And, specifically, ≤ the reaction duration.
    expect(fpDur).toBeLessThanOrEqual(SOLID_DURATION_FRAMES);
  });

  it('unrelated freeform reaction (COMBUSTION) does NOT create FREEZING_POINT_TALENT', () => {
    // Confirms the trigger doesn't spuriously fire on the wrong reaction —
    // the onTriggerClause condition is scoped to SOLIDIFICATION, not any
    // freeform reaction application.
    const { result } = setup();
    placeFreeformReaction(result.current, REACTION_COLUMNS.COMBUSTION, 1 * FPS, 10 * FPS);

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp).toHaveLength(0);
  });
});
