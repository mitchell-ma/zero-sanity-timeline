/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — P5 Storm of Transformation
 *
 * During the Empyrean of Truth transformation (ultimate active), DMG dealt by
 * Zhuang ignores 15% of the enemy's Electric Resistance.
 *
 * Encoded as a POTENTIAL status with:
 *   onTriggerClause: THIS OPERATOR PERFORM ULTIMATE ∧ HAVE POTENTIAL ≥ 5
 *                    → APPLY EVENT THIS to THIS OPERATOR
 *   segment (25s):   APPLY STAT RESISTANCE_IGNORE ELECTRIC 0.15 to THIS OPERATOR
 *
 * Expiry follows naturally from the 25s segment duration, which matches
 * the ultimate's own active window.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { findColumn, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZF_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
const P5_JSON = require('../../../../model/game-data/operators/zhuang-fangyi/potentials/potential-5-storm-of-transformation.json');
const P5_ID: string = P5_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';
const P5_DURATION_FRAMES = 25 * FPS;

beforeEach(() => { localStorage.clear(); });

function setup(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZF_ID); });
  const props = view.result.current.loadoutProperties[SLOT_ZF];
  act(() => {
    view.result.current.handleStatsChange(SLOT_ZF, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
  act(() => { setUltimateEnergyToMax(view.result.current, SLOT_ZF, 0); });
  return view;
}

function castUltimate(app: AppResult, atFrame: number) {
  const ultCol = findColumn(app, SLOT_ZF, NounType.ULTIMATE);
  if (!ultCol?.defaultEvent) throw new Error('Ultimate column/default missing');
  act(() => { app.handleAddEvent(SLOT_ZF, NounType.ULTIMATE, atFrame, ultCol.defaultEvent!); });
}

function p5StatusEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerEntityId === SLOT_ZF && ev.columnId === P5_ID,
  );
}

// ── Config-level invariants ──────────────────────────────────────────────────

describe('P5 Storm of Transformation — JSON config invariants', () => {
  it('applies electric RESISTANCE_IGNORE 0.15 in its passive segment clause', () => {
    const seg = P5_JSON.segments[0];
    const effect = seg.clause[0].effects[0];
    expect(effect.verb).toBe('APPLY');
    expect(effect.object).toBe('STAT');
    expect(effect.objectId).toBe('RESISTANCE_IGNORE');
    expect(effect.objectQualifier).toBe('ELECTRIC');
    expect(effect.to).toBe('OPERATOR');
    expect(effect.toDeterminer).toBe('THIS');
    expect(effect.with.value.value).toBeCloseTo(0.15, 6);
  });

  it('P5 status has no onTriggerClause (application moved to ult segment frame)', () => {
    expect(P5_JSON.onTriggerClause).toBeUndefined();
  });

  it('ult segment 2 frame 0 applies P5 status gated on HAVE POTENTIAL ≥ 5', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const ULT_JSON = require('../../../../model/game-data/operators/zhuang-fangyi/skills/ultimate-smiting-tempest.json');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const frame = ULT_JSON.segments[1].frames[0];
    // Find the clause whose effect applies P5_ID (ordering-independent — frame
    // also carries an unconditional APPLY SMITING_TEMPEST_BATTLE clause).
    const p5Clause = frame.clause.find((cl: { effects: { objectId?: string }[] }) =>
      cl.effects.some((e: { objectId?: string }) => e.objectId === P5_ID),
    );
    const potentialGate = p5Clause.conditions.find(
      (c: { verb?: string; object?: string }) => c.verb === VerbType.HAVE && c.object === NounType.POTENTIAL,
    );
    expect(potentialGate.value.value).toBe(5);
    expect(potentialGate.cardinalityConstraint).toBe('GREATER_THAN_EQUAL');

    const applyEffect = p5Clause.effects[0];
    expect(applyEffect.verb).toBe('APPLY');
    expect(applyEffect.object).toBe('STATUS');
    expect(applyEffect.objectId).toBe(P5_ID);
    expect(applyEffect.with.duration.value).toBe(25);
  });

  it('segment duration matches ultimate active window (25s)', () => {
    const seg = P5_JSON.segments[0];
    expect(seg.properties.duration.value.value).toBe(25);
    expect(seg.properties.duration.unit).toBe('SECOND');
  });
});

// ── Runtime trigger behavior ─────────────────────────────────────────────────

describe('P5 Storm of Transformation — runtime trigger', () => {
  it('P4: ult cast does NOT apply P5 status (potential gate)', () => {
    const { result } = setup(4);
    castUltimate(result.current, 5 * FPS);
    expect(p5StatusEvents(result.current)).toHaveLength(0);
  });

  it('P5 without casting ult: no status applied (trigger is gated on PERFORM ULTIMATE)', () => {
    const { result } = setup(5);
    expect(p5StatusEvents(result.current)).toHaveLength(0);
  });

  it('P5: ult cast applies exactly one P5 status covering the ult active window', () => {
    const { result } = setup(5);
    const ultFrame = 5 * FPS;
    castUltimate(result.current, ultFrame);

    const statuses = p5StatusEvents(result.current);
    expect(statuses).toHaveLength(1);

    const ev = statuses[0];
    // Starts at/near ult cast (trigger fires on PERFORM ULTIMATE)
    expect(ev.startFrame).toBeGreaterThanOrEqual(ultFrame);
    expect(ev.startFrame).toBeLessThanOrEqual(ultFrame + 2 * FPS);
    // Covers at least the 25s passive window from the segment config
    const totalDur = ev.segments.reduce((s, sg) => s + (sg.properties.duration ?? 0), 0);
    expect(totalDur).toBeGreaterThanOrEqual(P5_DURATION_FRAMES);
  });

  it('P5: repeated ult casts keep a single active instance (stacks.limit=1, RESET)', () => {
    const { result } = setup(5);
    castUltimate(result.current, 5 * FPS);
    // A second ult cast well outside the first window replaces the prior instance
    // by RESET interaction; ult-energy regen gating is bypassed by setUltimateEnergyToMax.
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ZF, 0); });
    castUltimate(result.current, 40 * FPS);

    const statuses = p5StatusEvents(result.current);
    // No stacks stacking: never more than a single concurrent instance.
    // Two casts may produce two sequential instances (first ends before second starts).
    const overlaps = statuses.some((a) =>
      statuses.some((b) =>
        a !== b &&
        a.startFrame < b.startFrame + b.segments.reduce((s, sg) => s + (sg.properties.duration ?? 0), 0) &&
        b.startFrame < a.startFrame + a.segments.reduce((s, sg) => s + (sg.properties.duration ?? 0), 0),
      ),
    );
    expect(overlaps).toBe(false);
  });
});
