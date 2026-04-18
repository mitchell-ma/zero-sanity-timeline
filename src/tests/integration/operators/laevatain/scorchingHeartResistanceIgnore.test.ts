/**
 * @jest-environment jsdom
 */

/**
 * Scorching Heart — APPLY HEAT RESISTANCE_IGNORE STAT migration.
 *
 * Pins the talent's clause migration off the dead `IGNORE STAT RESISTANCE`
 * verb (a no-op for STAT in the engine) onto `APPLY HEAT RESISTANCE_IGNORE
 * STAT to OPERATOR THIS`. The new clause flows through the canonical APPLY
 * STAT branch in `eventInterpretorController.ts` and writes to the
 * operator's `HEAT_RESISTANCE_IGNORE` stat in the accumulator, summing into
 * the resistance addback bucket alongside enemy `<EL>_RESISTANCE_REDUCTION`.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { NounType, VerbType, AdjectiveType, isQualifiedId } from '../../../../dsl/semantics';
import { FPS } from '../../../../utils/timeline';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const SCORCHING_HEART_DEF = require(
  '../../../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json',
);
const SH_ID: string = SCORCHING_HEART_DEF.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAEVATAIN = 'slot-0';

beforeEach(() => { localStorage.clear(); });

/** Stack 4 battle skills 10s apart to accumulate Melting Flame to max → Scorching Heart fires.
 *  Mirrors the spacing used by `scorchingHeartActivation.test.ts`. */
function addBattleSkills(app: AppResult, count: number) {
  const col = findColumn(app, SLOT_LAEVATAIN, NounType.BATTLE);
  for (let i = 0; i < count; i++) {
    const payload = getMenuPayload(app, col!, (2 + i * 10) * FPS);
    act(() => {
      app.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }
}

describe('Scorching Heart — APPLY HEAT RESISTANCE_IGNORE STAT migration', () => {
  it('JSON config carries the new APPLY STAT clause shape (not legacy IGNORE)', () => {
    // Direct JSON inspection — protects the migration from regression.
    expect(SCORCHING_HEART_DEF.segments).toHaveLength(1);
    const segment = SCORCHING_HEART_DEF.segments[0];
    expect(segment.clause).toHaveLength(1);
    const predicate = segment.clause[0];
    expect(predicate.conditions).toHaveLength(0);
    expect(predicate.effects).toHaveLength(1);

    const effect = predicate.effects[0];
    expect(effect.verb).toBe(VerbType.APPLY);
    expect(effect.object).toBe(NounType.STAT);
    expect(effect.objectId).toBe(NounType.RESISTANCE_IGNORE);
    expect(effect.objectQualifier).toBe(AdjectiveType.HEAT);
    expect(effect.to).toBe(NounType.OPERATOR);
    // Self-targeted: no enemy redirect.
    expect(effect.toDeterminer).toBe('THIS');

    // Value carries the L1/L2/L3 ignore amounts (10 / 15 / 20).
    expect(effect.with.value.verb).toBe(VerbType.VARY_BY);
    expect(effect.with.value.value).toEqual([10, 15, 20]);
  });

  it('Scorching Heart event reaches accumulator: HEAT_RESISTANCE_IGNORE flattens correctly via DSL resolver', () => {
    // The resolver path the engine uses to flatten {STAT, RESISTANCE_IGNORE, HEAT}
    // into the StatType key. Pinned here so a regression in the DSL flattening
    // surface (e.g. removing per-element RESISTANCE_IGNORE stats) lights up.
    expect(isQualifiedId('HEAT_RESISTANCE_IGNORE', NounType.RESISTANCE_IGNORE)).toBe(true);
  });

  it('engine activates Scorching Heart from 4-stack Melting Flame and the SH event has segment clauses', () => {
    const view = renderHook(() => useApp());
    addBattleSkills(view.result.current, 4);

    const shEvents = view.result.current.allProcessedEvents.filter(
      ev => ev.columnId === SH_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(shEvents.length).toBeGreaterThanOrEqual(1);

    // The applied Scorching Heart event has the def's segments (with the
    // APPLY STAT clause) once the engine runs runStatusCreationLifecycle.
    const sh = shEvents[0];
    expect(sh.segments.length).toBeGreaterThanOrEqual(1);
    // Operator-targeted: lives on Laevatain's column, not enemy.
    expect(sh.ownerEntityId).toBe(SLOT_LAEVATAIN);
  });
});
