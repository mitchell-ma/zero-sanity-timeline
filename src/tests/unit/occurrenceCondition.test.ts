/**
 * `THIS EVENT IS OCCURRENCE` condition primitive — unit tests.
 *
 * New DSL node that resolves true when the current trigger is firing for the
 * Nth time on the resolved owner's timeline. The condition evaluator counts
 * prior events matching `ctx.currentTriggerStatusId` + owner with
 * `startFrame < ctx.frame`, adds 1, then compares to the target per the
 * cardinalityConstraint (default `EXACTLY`).
 */

import { evaluateInteraction } from '../../controller/timeline/conditionEvaluator';
import type { ConditionContext } from '../../controller/timeline/conditionEvaluator';
import { NounType, VerbType, CardinalityConstraintType, DeterminerType } from '../../dsl/semantics';
import type { Interaction } from '../../dsl/semantics';
import type { TimelineEvent } from '../../consts/viewTypes';

const SLOT = 'slot-0';
const TRIGGER_ID = 'FOUR_SYMBOLS_OF_HARMONY_P1';

function ev(uid: string, startFrame: number, overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    uid, id: TRIGGER_ID, name: TRIGGER_ID,
    ownerEntityId: SLOT, columnId: TRIGGER_ID,
    startFrame, segments: [{ properties: { duration: 240 } }],
    ...overrides,
  } as TimelineEvent;
}

function condIsOccurrence(target: number, cardinality?: CardinalityConstraintType): Interaction {
  const cond: Interaction = {
    subjectDeterminer: DeterminerType.THIS,
    subject: NounType.EVENT,
    verb: VerbType.IS,
    object: NounType.OCCURRENCE,
  };
  if (cardinality) cond.cardinalityConstraint = cardinality;
  (cond as unknown as { with?: { value?: unknown } }).with = {
    value: { verb: VerbType.IS, value: target },
  };
  return cond;
}

function makeCtx(events: TimelineEvent[], frame: number): ConditionContext {
  return {
    events,
    frame,
    sourceEntityId: SLOT,
    currentTriggerStatusId: TRIGGER_ID,
  };
}

describe('THIS EVENT IS OCCURRENCE', () => {
  it('empty timeline: N=1 matches (first occurrence)', () => {
    const ctx = makeCtx([], 600);
    expect(evaluateInteraction(condIsOccurrence(1), ctx)).toBe(true);
  });

  it('empty timeline: N=2 does not match (not the second yet)', () => {
    const ctx = makeCtx([], 600);
    expect(evaluateInteraction(condIsOccurrence(2), ctx)).toBe(false);
  });

  it('one prior occurrence on same owner: N=2 matches', () => {
    const ctx = makeCtx([ev('a', 100)], 600);
    expect(evaluateInteraction(condIsOccurrence(2), ctx)).toBe(true);
    expect(evaluateInteraction(condIsOccurrence(1), ctx)).toBe(false);
  });

  it('prior events on a DIFFERENT owner do not count', () => {
    const ctx = makeCtx([ev('a', 100, { ownerEntityId: 'slot-1' })], 600);
    expect(evaluateInteraction(condIsOccurrence(1), ctx)).toBe(true);
  });

  it('prior events on a DIFFERENT columnId do not count', () => {
    const ctx = makeCtx([ev('a', 100, { columnId: 'OTHER_STATUS' })], 600);
    expect(evaluateInteraction(condIsOccurrence(1), ctx)).toBe(true);
  });

  it('prior events at or after ctx.frame do not count (strictly-before)', () => {
    // startFrame === ctx.frame → excluded.
    const ctx = makeCtx([ev('a', 600)], 600);
    expect(evaluateInteraction(condIsOccurrence(1), ctx)).toBe(true);
  });

  it('missing currentTriggerStatusId: falls back to false', () => {
    const ctx: ConditionContext = { events: [], frame: 600, sourceEntityId: SLOT };
    expect(evaluateInteraction(condIsOccurrence(1), ctx)).toBe(false);
  });

  it('cardinalityConstraint GREATER_THAN_EQUAL: N≥2 matches when 1+ prior exists', () => {
    const ctx = makeCtx([ev('a', 100)], 600);
    expect(evaluateInteraction(condIsOccurrence(2, CardinalityConstraintType.GREATER_THAN_EQUAL), ctx)).toBe(true);
    // Also matches lower threshold (occurrence 2 ≥ 1).
    expect(evaluateInteraction(condIsOccurrence(1, CardinalityConstraintType.GREATER_THAN_EQUAL), ctx)).toBe(true);
    // Doesn't match higher threshold.
    expect(evaluateInteraction(condIsOccurrence(3, CardinalityConstraintType.GREATER_THAN_EQUAL), ctx)).toBe(false);
  });

  it('multiple prior occurrences aggregate: N=4 matches after 3 priors', () => {
    const ctx = makeCtx([ev('a', 100), ev('b', 200), ev('c', 300)], 600);
    expect(evaluateInteraction(condIsOccurrence(4), ctx)).toBe(true);
    expect(evaluateInteraction(condIsOccurrence(3), ctx)).toBe(false);
  });

  it('negation flips the match', () => {
    const ctx = makeCtx([], 600);
    const cond = condIsOccurrence(1);
    (cond as { negated?: boolean }).negated = true;
    // EXACTLY 1 matches → negated → false.
    expect(evaluateInteraction(cond, ctx)).toBe(false);
  });
});
