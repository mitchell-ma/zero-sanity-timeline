/**
 * DSL Effect Executor — Unit Tests
 *
 * Tests the core executor in isolation:
 * - APPLY: infliction, status, reaction
 * - CONSUME: infliction, status
 * - ALL: atomicity (if CONSUME fails, sibling APPLY doesn't fire)
 * - ALL AT_MOST N: caps iterations
 * - ANY: only first passing predicate fires
 * - Nested ALL/ANY
 * - Condition evaluation: HAVE, IS
 * - Edge cases: empty timeline, no matching targets
 */

import { executeEffect, executeEffects, applyMutations } from '../controller/timeline/effectExecutor';
import type { ExecutionContext, MutationSet } from '../controller/timeline/effectExecutor';
import { evaluateConditions } from '../controller/timeline/conditionEvaluator';
import type { ConditionContext } from '../controller/timeline/conditionEvaluator';
import { VerbType, AdjectiveType, CardinalityConstraintType, NounType, DeterminerType, WithValueVerb, matchInteraction, interactionToLabel } from '../consts/semantics';
import type { Effect, Interaction } from '../consts/semantics';
import { COMMON_OWNER_ID } from '../controller/slot/commonSlotController';
import { eventDuration } from '../consts/viewTypes';
import type { TimelineEvent } from '../consts/viewTypes';
import { EventStatusType } from '../consts/enums';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; ownerId: string }): TimelineEvent {
  return {
    name: 'TEST',
    startFrame: 0,
    segments: [{ properties: { duration: 2400 } }],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    events: [],
    frame: 100,
    sourceOwnerId: 'slot1',
    sourceSkillName: 'TEST_SKILL',
    idCounter: 0,
    ...overrides,
  };
}

function makeCondCtx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    events: [],
    frame: 100,
    sourceOwnerId: 'slot1',
    ...overrides,
  };
}

// ── APPLY tests ──────────────────────────────────────────────────────────

describe('APPLY effects', () => {
  test('APPLY HEAT INFLICTION produces an infliction event', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      toObject: NounType.ENEMY,
      with: {
        duration: { verb: WithValueVerb.IS, value: 10 },
      },
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].columnId).toBe('heatInfliction');
    expect(result.produced[0].ownerId).toBe('enemy');
    expect(eventDuration(result.produced[0])).toBe(1200); // 10s * 120fps
  });

  test('APPLY STATUS produces a status event', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      toDeterminer: DeterminerType.THIS,
      toObject: NounType.OPERATOR,
      with: {
        duration: { verb: WithValueVerb.IS, value: 20 },
      },
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].columnId).toBe('melting-flame');
    expect(result.produced[0].ownerId).toBe('slot1');
    expect(result.produced[0].name).toBe('MELTING_FLAME');
  });

  test('APPLY STATUS MELTING_FLAME is not capped — stacks grow freely', () => {
    // Pre-fill 10 active MF events — no hardcoded cap
    const existingMf = Array.from({ length: 10 }, (_, i) => makeEvent({
      id: `mf-${i}`,
      name: 'MELTING_FLAME',
      columnId: 'melting-flame',
      ownerId: 'slot1',
      startFrame: i * 10,
      segments: [{ properties: { duration: 108000 } }],
    }));
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      toDeterminer: DeterminerType.THIS,
      toObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ events: existingMf });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1); // 11th stack allowed
  });

  test('APPLY non-exchange STATUS is not capped', () => {
    // No cap on any status type
    const existing = Array.from({ length: 10 }, (_, i) => makeEvent({
      id: `sh-${i}`,
      name: 'SCORCHING_HEART_EFFECT',
      columnId: 'scorching-heart-effect',
      ownerId: 'slot1',
      startFrame: i * 10,
      segments: [{ properties: { duration: 2400 } }],
    }));
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'SCORCHING_HEART_EFFECT',
      toDeterminer: DeterminerType.THIS,
      toObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ events: existing });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1); // no cap on non-exchange statuses
  });

  test('APPLY COMBUSTION REACTION produces a reaction event', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.REACTION,
      adjective: AdjectiveType.COMBUSTION,
      toObject: NounType.ENEMY,
      with: {
        duration: { verb: WithValueVerb.IS, value: 5 },
        statusLevel: { verb: WithValueVerb.IS, value: 2 },
      },
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].columnId).toBe('combustion');
    expect(result.produced[0].statusLevel).toBe(2);
  });
});

// ── CONSUME tests ────────────────────────────────────────────────────────

describe('CONSUME effects', () => {
  test('CONSUME HEAT INFLICTION clamps the oldest active infliction', () => {
    const infliction = makeEvent({
      id: 'inf-1',
      columnId: 'heatInfliction',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
    };
    const ctx = makeCtx({ events: [infliction] });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.clamped.size).toBe(1);
    const clamp = result.clamped.get('inf-1')!;
    expect(clamp.newDuration).toBe(100); // frame 100 - startFrame 0
    expect(clamp.eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('CONSUME fails when no active infliction exists', () => {
    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
    };
    const ctx = makeCtx({ events: [] });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(true);
  });

  test('CONSUME STATUS clamps an active status', () => {
    const status = makeEvent({
      id: 'mf-1',
      columnId: 'melting-flame',
      ownerId: 'slot1',
      name: 'MELTING_FLAME',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      fromDeterminer: DeterminerType.THIS,
      fromObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ events: [status] });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.clamped.size).toBe(1);
    expect(result.clamped.get('mf-1')!.eventStatus).toBe(EventStatusType.CONSUMED);
  });
});

// ── ALL atomicity tests ──────────────────────────────────────────────────

describe('ALL compound effects', () => {
  test('ALL executes all child effects when no conditions', () => {
    const effect: Effect = {
      verb: VerbType.ALL,
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FOCUS',
            toObject: NounType.ENEMY,
          },
        ],
      }],
    };

    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(2);
  });

  test('ALL atomicity: if CONSUME fails, sibling APPLY does not fire', () => {
    const effect: Effect = {
      verb: VerbType.ALL,
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: NounType.INFLICTION,
            adjective: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
          },
        ],
      }],
    };

    // No inflictions exist → CONSUME fails → entire predicate skipped
    const ctx = makeCtx({ events: [] });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(0);
    expect(result.clamped.size).toBe(0);
  });

  test('ALL atomicity: CONSUME + APPLY succeeds when infliction exists', () => {
    const infliction = makeEvent({
      id: 'inf-1',
      columnId: 'heatInfliction',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const effect: Effect = {
      verb: VerbType.ALL,
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: NounType.INFLICTION,
            adjective: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
          },
        ],
      }],
    };

    const ctx = makeCtx({ events: [infliction] });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('MELTING_FLAME');
    expect(result.clamped.size).toBe(1);
    expect(result.clamped.get('inf-1')!.eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('ALL AT_MOST N caps iterations', () => {
    // 3 inflictions exist, but AT_MOST 2
    const inflictions = [0, 1, 2].map(i => makeEvent({
      id: `inf-${i}`,
      columnId: 'heatInfliction',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    }));

    const effect: Effect = {
      verb: VerbType.ALL,
      for: {
        cardinalityConstraint: CardinalityConstraintType.AT_MOST,
        cardinality: 2,
      },
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: NounType.INFLICTION,
            adjective: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
          },
        ],
      }],
    };

    const ctx = makeCtx({ events: inflictions });
    const result = executeEffect(effect, ctx);

    // Only 2 iterations should execute (AT_MOST 2)
    expect(result.produced).toHaveLength(2);
    expect(result.clamped.size).toBe(2);
  });

});

// ── ANY tests ────────────────────────────────────────────────────────────

describe('ANY compound effects', () => {
  test('ANY executes only the first passing predicate', () => {
    const combustion = makeEvent({
      id: 'comb-1',
      columnId: 'combustion',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const effect: Effect = {
      verb: VerbType.ANY,
      predicates: [
        {
          conditions: [{
            subject: NounType.ENEMY,
            verb: VerbType.HAVE,
            object: NounType.STATUS,
            objectId: 'COMBUSTION',
          }],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'SCORCHING_FANGS',
            toObject: NounType.ENEMY,
          }],
        },
        {
          conditions: [],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FALLBACK_STATUS',
            toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
          }],
        },
      ],
    };

    const ctx = makeCtx({ events: [combustion] });
    const result = executeEffect(effect, ctx);

    // First predicate passes → only SCORCHING_FANGS
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('SCORCHING_FANGS');
  });

  test('ANY falls through to unconditional when first fails', () => {
    // No combustion → first predicate fails → second (unconditional) fires
    const effect: Effect = {
      verb: VerbType.ANY,
      predicates: [
        {
          conditions: [{
            subject: NounType.ENEMY,
            verb: VerbType.HAVE,
            object: NounType.STATUS,
            objectId: 'COMBUSTION',
          }],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'SCORCHING_FANGS',
            toObject: NounType.ENEMY,
          }],
        },
        {
          conditions: [],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FALLBACK_STATUS',
            toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
          }],
        },
      ],
    };

    const ctx = makeCtx({ events: [] });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('FALLBACK_STATUS');
  });
});

// ── Nested ALL/ANY ───────────────────────────────────────────────────────

describe('Nested compound effects', () => {
  test('ALL containing nested ANY', () => {
    const effect: Effect = {
      verb: VerbType.ALL,
      predicates: [{
        conditions: [],
        effects: [
          // First child: plain APPLY
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FOCUS',
            toObject: NounType.ENEMY,
          },
          // Second child: nested ANY
          {
            verb: VerbType.ANY,
            predicates: [
              {
                conditions: [{
                  subject: NounType.ENEMY,
                  verb: VerbType.HAVE,
                  object: NounType.STATUS,
                  objectId: 'COMBUSTION',
                }],
                effects: [{
                  verb: VerbType.APPLY,
                  object: NounType.STATUS,
                  objectId: 'CONDITIONAL_STATUS',
                  toObject: NounType.ENEMY,
                }],
              },
              {
                conditions: [],
                effects: [{
                  verb: VerbType.APPLY,
                  object: NounType.STATUS,
                  objectId: 'DEFAULT_STATUS',
                  toDeterminer: DeterminerType.THIS,
            toObject: NounType.OPERATOR,
                }],
              },
            ],
          },
        ],
      }],
    };

    // No combustion → ANY falls through to DEFAULT_STATUS
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(result.produced[0].name).toBe('FOCUS');
    expect(result.produced[1].name).toBe('DEFAULT_STATUS');
  });
});

// ── Condition evaluation tests ───────────────────────────────────────────

describe('Condition evaluation', () => {
  test('HAVE STATUS passes when status is active', () => {
    const status = makeEvent({
      id: 'mf-1',
      columnId: 'melting-flame',
      ownerId: 'slot1',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const conditions: Interaction[] = [{
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.HAVE,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
    }];

    const ctx = makeCondCtx({ events: [status] });
    expect(evaluateConditions(conditions, ctx)).toBe(true);
  });

  test('HAVE STATUS fails when status is not active', () => {
    const conditions: Interaction[] = [{
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.HAVE,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
    }];

    const ctx = makeCondCtx({ events: [] });
    expect(evaluateConditions(conditions, ctx)).toBe(false);
  });

  test('HAVE STATUS with AT_LEAST cardinality', () => {
    const statuses = [0, 1, 2].map(i => makeEvent({
      id: `mf-${i}`,
      columnId: 'melting-flame',
      ownerId: 'slot1',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    }));

    const conditions: Interaction[] = [{
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.HAVE,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      cardinalityConstraint: CardinalityConstraintType.AT_LEAST,
      cardinality: 3,
    }];

    const ctx = makeCondCtx({ events: statuses });
    expect(evaluateConditions(conditions, ctx)).toBe(true);

    // Fewer than required
    const ctx2 = makeCondCtx({ events: statuses.slice(0, 2) });
    expect(evaluateConditions(conditions, ctx2)).toBe(false);
  });

  test('IS COMBUSTED checks for active combustion reaction', () => {
    const combustion = makeEvent({
      id: 'comb-1',
      columnId: 'combustion',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const conditions: Interaction[] = [{
      subject: NounType.ENEMY,
      verb: VerbType.IS,
      object: AdjectiveType.COMBUSTED,
    }];

    const ctx = makeCondCtx({ events: [combustion] });
    expect(evaluateConditions(conditions, ctx)).toBe(true);

    const ctx2 = makeCondCtx({ events: [] });
    expect(evaluateConditions(conditions, ctx2)).toBe(false);
  });

  test('Empty conditions pass unconditionally', () => {
    const ctx = makeCondCtx();
    expect(evaluateConditions([], ctx)).toBe(true);
  });
});

// ── applyMutations tests ─────────────────────────────────────────────────

describe('applyMutations', () => {
  test('applies clamps and appends produced events', () => {
    const existing = makeEvent({
      id: 'inf-1',
      columnId: 'heatInfliction',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const mutations: MutationSet = {
      produced: [makeEvent({
        id: 'mf-new',
        columnId: 'melting-flame',
        ownerId: 'slot1',
        name: 'MELTING_FLAME',
      })],
      clamped: new Map([['inf-1', {
        newDuration: 100,
        eventStatus: EventStatusType.CONSUMED,
        sourceOwnerId: 'slot1',
        sourceSkillName: 'TEST_SKILL',
      }]]),
      failed: false,
    };

    const result = applyMutations([existing], mutations);
    expect(result).toHaveLength(2);
    expect(eventDuration(result[0])).toBe(100);
    expect(result[0].eventStatus).toBe(EventStatusType.CONSUMED);
    expect(result[1].name).toBe('MELTING_FLAME');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('Empty timeline produces no mutations for CONSUME', () => {
    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      fromDeterminer: DeterminerType.THIS,
      fromObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ events: [] });
    const result = executeEffect(effect, ctx);
    expect(result.failed).toBe(true);
    expect(result.produced).toHaveLength(0);
  });

  test('Resource verbs (RECOVER, DEAL) return empty mutation set', () => {
    const recoverEffect: Effect = {
      verb: VerbType.RECOVER,
      object: NounType.SKILL_POINT,
    };
    const dealEffect: Effect = {
      verb: VerbType.DEAL,
      object: NounType.DAMAGE,
    };
    const ctx = makeCtx();

    expect(executeEffect(recoverEffect, ctx).failed).toBe(false);
    expect(executeEffect(recoverEffect, ctx).produced).toHaveLength(0);
    expect(executeEffect(dealEffect, ctx).failed).toBe(false);
    expect(executeEffect(dealEffect, ctx).produced).toHaveLength(0);
  });

  test('executeEffects accumulates results from multiple effects', () => {
    const effects: Effect[] = [
      {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'FOCUS',
        toObject: NounType.ENEMY,
      },
      {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'MELTING_FLAME',
        toDeterminer: DeterminerType.THIS,
        toObject: NounType.OPERATOR,
      },
    ];
    const ctx = makeCtx();
    const result = executeEffects(effects, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(2);
  });

  test('executeEffects fails early on required failure', () => {
    const effects: Effect[] = [
      {
        verb: VerbType.CONSUME,
        object: NounType.INFLICTION,
        adjective: AdjectiveType.HEAT,
        fromObject: NounType.ENEMY,
      },
      {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'MELTING_FLAME',
        toDeterminer: DeterminerType.THIS,
        toObject: NounType.OPERATOR,
      },
    ];
    const ctx = makeCtx({ events: [] });
    const result = executeEffects(effects, ctx);

    expect(result.failed).toBe(true);
  });
});

// ── Determiner resolution ────────────────────────────────────────────────

describe('matchInteraction — determiner handling', () => {
  test('ANY determiner matches any OPERATOR subject', () => {
    const published: Interaction = {
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.ANY,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    };
    expect(matchInteraction(published, required)).toBe(true);
  });

  test('ANY determiner matches ALL determiner', () => {
    const published: Interaction = {
      subjectDeterminer: DeterminerType.ALL,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.ANY,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    };
    expect(matchInteraction(published, required)).toBe(true);
  });

  test('mismatched determiners reject', () => {
    const published: Interaction = {
      subjectDeterminer: DeterminerType.OTHER,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    };
    expect(matchInteraction(published, required)).toBe(false);
  });

  test('omitted determiner defaults to THIS', () => {
    const withExplicit: Interaction = {
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.APPLY,
      object: NounType.INFLICTION,
    };
    const withoutDeterminer: Interaction = {
      subject: NounType.OPERATOR,
      verb: VerbType.APPLY,
      object: NounType.INFLICTION,
    };
    // Both directions should match since omitted defaults to THIS
    expect(matchInteraction(withExplicit, withoutDeterminer)).toBe(true);
    expect(matchInteraction(withoutDeterminer, withExplicit)).toBe(true);
  });

  test('ENEMY subject still works without determiners', () => {
    const published: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.IS,
      object: AdjectiveType.COMBUSTED,
    };
    const required: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.IS,
      object: AdjectiveType.COMBUSTED,
    };
    expect(matchInteraction(published, required)).toBe(true);
  });

  test('ENEMY vs OPERATOR rejects regardless of determiner', () => {
    const published: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.HAVE,
      object: NounType.STATUS,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.HAVE,
      object: NounType.STATUS,
    };
    expect(matchInteraction(published, required)).toBe(false);
  });
});

describe('interactionToLabel — determiner display', () => {
  test('THIS OPERATOR omits subject (implicit)', () => {
    const label = interactionToLabel({
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE_SKILL,
    });
    expect(label).toBe('Perform Battle Skill');
  });

  test('ALL OPERATOR shows determiner', () => {
    const label = interactionToLabel({
      subjectDeterminer: DeterminerType.ALL,
      subject: NounType.OPERATOR,
      verb: VerbType.HAVE,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
    });
    expect(label).toBe('All Operator Have Status (Melting Flame)');
  });

  test('ANY OPERATOR shows determiner', () => {
    const label = interactionToLabel({
      subjectDeterminer: DeterminerType.ANY,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.COMBO_SKILL,
    });
    expect(label).toBe('Any Operator Perform Combo Skill');
  });

  test('omitted determiner defaults to THIS (no subject shown)', () => {
    const label = interactionToLabel({
      subject: NounType.OPERATOR,
      verb: VerbType.APPLY,
      object: NounType.INFLICTION,
      element: 'HEAT',
    });
    expect(label).toBe('Apply Infliction [Heat]');
  });

  test('ENEMY subject renders normally', () => {
    const label = interactionToLabel({
      subject: NounType.ENEMY,
      verb: VerbType.IS,
      object: AdjectiveType.COMBUSTED,
    });
    expect(label).toBe('Enemy Is Combusted');
  });
});

describe('resolveOwnerId — determiner-based target resolution', () => {
  test('APPLY TO THIS OPERATOR resolves to sourceOwnerId', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      toDeterminer: DeterminerType.THIS,
      toObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ sourceOwnerId: 'slot2' });
    const result = executeEffect(effect, ctx);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].ownerId).toBe('slot2');
  });

  test('APPLY TO ALL OPERATOR resolves to COMMON_OWNER_ID', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'SCORCHING_FANGS',
      toDeterminer: DeterminerType.ALL,
      toObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ sourceOwnerId: 'slot1' });
    const result = executeEffect(effect, ctx);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].ownerId).toBe(COMMON_OWNER_ID);
  });

  test('APPLY TO ENEMY still resolves to enemy owner', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'FOCUS',
      toObject: NounType.ENEMY,
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].ownerId).toBe('enemy');
  });

  test('omitted determiner defaults to THIS (sourceOwnerId)', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'BUFF',
      toObject: NounType.OPERATOR,
    };
    const ctx = makeCtx({ sourceOwnerId: 'slot3' });
    const result = executeEffect(effect, ctx);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].ownerId).toBe('slot3');
  });

  test('CONSUME FROM ENEMY resolves correctly', () => {
    const infliction = makeEvent({
      id: 'inf-1',
      columnId: 'heatInfliction',
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });
    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
    };
    const ctx = makeCtx({ events: [infliction] });
    const result = executeEffect(effect, ctx);
    expect(result.clamped.size).toBe(1);
    expect(result.clamped.has('inf-1')).toBe(true);
  });
});
