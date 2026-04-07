/**
 * DSL Effect Executor — Unit Tests
 *
 * Tests the core executor in isolation:
 * - APPLY: infliction, status, reaction
 * - CONSUME: infliction, status
 * - ALL: atomicity (if CONSUME fails, sibling APPLY doesn't fire)
 * - ALL LESS_THAN_EQUAL N: caps iterations
 * - ANY: only first passing predicate fires
 * - Nested ALL/ANY
 * - Condition evaluation: HAVE, IS
 * - Edge cases: empty timeline, no matching targets
 */

import { executeEffect, executeEffects, applyMutations, getChanceExpectation, getChanceElseExpectation } from '../../controller/timeline/effectExecutor';
import type { ExecutionContext, MutationSet } from '../../controller/timeline/effectExecutor';
import { StatAccumulator } from '../../controller/calculation/statAccumulator';
import { calculateDamage } from '../../model/calculation/damageFormulas';
import type { DamageParams } from '../../model/calculation/damageFormulas';
import { getFrameExpectation } from '../../controller/calculation/critExpectationModel';
import { evaluateConditions } from '../../controller/timeline/conditionEvaluator';
import type { ConditionContext } from '../../controller/timeline/conditionEvaluator';
import { VerbType, AdjectiveType, CardinalityConstraintType, NounType, DeterminerType, matchInteraction, interactionToLabel } from '../../dsl/semantics';
import type { Effect, Interaction } from '../../dsl/semantics';
import { COMMON_OWNER_ID } from '../../controller/slot/commonSlotController';
import { eventDuration } from '../../consts/viewTypes';
import type { TimelineEvent } from '../../consts/viewTypes';
import { CritMode, EventStatusType } from '../../consts/enums';
import { INFLICTION_COLUMNS, REACTION_COLUMNS } from '../../model/channels';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SH_ID: string = require('../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json').properties.id;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; ownerId: string }): TimelineEvent {
  return {
    id: overrides.name ?? 'TEST',
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
      objectQualifier: AdjectiveType.HEAT,
      to: NounType.ENEMY,
      with: {
        duration: { verb: VerbType.IS, value: 10 },
      },
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].columnId).toBe(INFLICTION_COLUMNS.HEAT);
    expect(result.produced[0].ownerId).toBe('enemy');
    expect(eventDuration(result.produced[0])).toBe(1200); // 10s * 120fps
  });

  test('APPLY STATUS produces a status event', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      toDeterminer: DeterminerType.THIS,
      to: NounType.OPERATOR,
      with: {
        duration: { verb: VerbType.IS, value: 20 },
      },
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].columnId).toBe('MELTING_FLAME');
    expect(result.produced[0].ownerId).toBe('slot1');
    expect(result.produced[0].name).toBe('MELTING_FLAME');
  });

  test('APPLY STATUS MELTING_FLAME is not capped — stacks grow freely', () => {
    // Pre-fill 10 active MF events — no hardcoded cap
    const existingMf = Array.from({ length: 10 }, (_, i) => makeEvent({
      uid: `mf-${i}`,
      name: 'MELTING_FLAME',
      columnId: 'MELTING_FLAME',
      ownerId: 'slot1',
      startFrame: i * 10,
      segments: [{ properties: { duration: 108000 } }],
    }));
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      toDeterminer: DeterminerType.THIS,
      to: NounType.OPERATOR,
    };
    const ctx = makeCtx({ events: existingMf });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1); // 11th stack allowed
  });

  test('APPLY non-exchange STATUS is not capped', () => {
    // No cap on any status type
    const existing = Array.from({ length: 10 }, (_, i) => makeEvent({
      uid: `sh-${i}`,
      name: SH_ID,
      columnId: SH_ID,
      ownerId: 'slot1',
      startFrame: i * 10,
      segments: [{ properties: { duration: 2400 } }],
    }));
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: SH_ID,
      toDeterminer: DeterminerType.THIS,
      to: NounType.OPERATOR,
    };
    const ctx = makeCtx({ events: existing });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1); // no cap on non-exchange statuses
  });

  test('APPLY COMBUSTION REACTION produces a reaction event', () => {
    const effect: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: NounType.REACTION,
      objectQualifier: AdjectiveType.COMBUSTION,
      to: NounType.ENEMY,
      with: {
        duration: { verb: VerbType.IS, value: 5 },
        stacks: { verb: VerbType.IS, value: 2 },
      },
    };
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].columnId).toBe(REACTION_COLUMNS.COMBUSTION);
    expect(result.produced[0].stacks).toBe(2);
  });
});

// ── CONSUME tests ────────────────────────────────────────────────────────

describe('CONSUME effects', () => {
  test('CONSUME HEAT INFLICTION clamps the oldest active infliction', () => {
    const infliction = makeEvent({
      uid: 'inf-1',
      columnId: INFLICTION_COLUMNS.HEAT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.INFLICTION,
      objectQualifier: AdjectiveType.HEAT,
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
      objectQualifier: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
    };
    const ctx = makeCtx({ events: [] });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(true);
  });

  test('CONSUME STATUS clamps an active status', () => {
    const status = makeEvent({
      uid: 'mf-1',
      columnId: 'MELTING_FLAME',
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
            to: NounType.OPERATOR,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FOCUS',
            to: NounType.ENEMY,
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
            objectQualifier: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            to: NounType.OPERATOR,
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
      uid: 'inf-1',
      columnId: INFLICTION_COLUMNS.HEAT,
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
            objectQualifier: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            to: NounType.OPERATOR,
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

  test('ALL LESS_THAN_EQUAL N caps iterations', () => {
    // 3 inflictions exist, but LESS_THAN_EQUAL 2
    const inflictions = [0, 1, 2].map(i => makeEvent({
      uid: `inf-${i}`,
      columnId: INFLICTION_COLUMNS.HEAT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    }));

    const effect: Effect = {
      verb: VerbType.ALL,
      for: {
        cardinalityConstraint: CardinalityConstraintType.LESS_THAN_EQUAL,
        value: { verb: VerbType.IS, value: 2 },
      },
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: NounType.INFLICTION,
            objectQualifier: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
          },
          {
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'MELTING_FLAME',
            toDeterminer: DeterminerType.THIS,
            to: NounType.OPERATOR,
          },
        ],
      }],
    };

    const ctx = makeCtx({ events: inflictions });
    const result = executeEffect(effect, ctx);

    // Only 2 iterations should execute (LESS_THAN_EQUAL 2)
    expect(result.produced).toHaveLength(2);
    expect(result.clamped.size).toBe(2);
  });

});

// ── ANY tests ────────────────────────────────────────────────────────────

describe('ANY compound effects', () => {
  test('ANY executes only the first passing predicate', () => {
    const combustion = makeEvent({
      uid: 'comb-1',
      columnId: REACTION_COLUMNS.COMBUSTION,
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
            to: NounType.ENEMY,
          }],
        },
        {
          conditions: [],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FALLBACK_STATUS',
            toDeterminer: DeterminerType.THIS,
            to: NounType.OPERATOR,
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
            to: NounType.ENEMY,
          }],
        },
        {
          conditions: [],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: 'FALLBACK_STATUS',
            toDeterminer: DeterminerType.THIS,
            to: NounType.OPERATOR,
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
            to: NounType.ENEMY,
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
                  to: NounType.ENEMY,
                }],
              },
              {
                conditions: [],
                effects: [{
                  verb: VerbType.APPLY,
                  object: NounType.STATUS,
                  objectId: 'DEFAULT_STATUS',
                  toDeterminer: DeterminerType.THIS,
            to: NounType.OPERATOR,
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
      uid: 'mf-1',
      columnId: 'MELTING_FLAME',
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

  test('HAVE STATUS with GREATER_THAN_EQUAL cardinality', () => {
    const statuses = [0, 1, 2].map(i => makeEvent({
      uid: `mf-${i}`,
      columnId: 'MELTING_FLAME',
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
      cardinalityConstraint: CardinalityConstraintType.GREATER_THAN_EQUAL,
      value: { verb: VerbType.IS, value: 3 },
    }];

    const ctx = makeCondCtx({ events: statuses });
    expect(evaluateConditions(conditions, ctx)).toBe(true);

    // Fewer than required
    const ctx2 = makeCondCtx({ events: statuses.slice(0, 2) });
    expect(evaluateConditions(conditions, ctx2)).toBe(false);
  });

  test('IS COMBUSTED checks for active combustion reaction', () => {
    const combustion = makeEvent({
      uid: 'comb-1',
      columnId: REACTION_COLUMNS.COMBUSTION,
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
      uid: 'inf-1',
      columnId: INFLICTION_COLUMNS.HEAT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const mutations: MutationSet = {
      produced: [makeEvent({
        uid: 'mf-new',
        columnId: 'MELTING_FLAME',
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
        to: NounType.ENEMY,
      },
      {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'MELTING_FLAME',
        toDeterminer: DeterminerType.THIS,
        to: NounType.OPERATOR,
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
        objectQualifier: AdjectiveType.HEAT,
        fromObject: NounType.ENEMY,
      },
      {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'MELTING_FLAME',
        toDeterminer: DeterminerType.THIS,
        to: NounType.OPERATOR,
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
      object: NounType.BATTLE,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.ANY,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE,
    };
    expect(matchInteraction(published, required)).toBe(true);
  });

  test('ANY determiner matches ALL determiner', () => {
    const published: Interaction = {
      subjectDeterminer: DeterminerType.ALL,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.ANY,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE,
    };
    expect(matchInteraction(published, required)).toBe(true);
  });

  test('mismatched determiners reject', () => {
    const published: Interaction = {
      subjectDeterminer: DeterminerType.OTHER,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE,
    };
    const required: Interaction = {
      subjectDeterminer: DeterminerType.THIS,
      subject: NounType.OPERATOR,
      verb: VerbType.PERFORM,
      object: NounType.BATTLE,
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
      object: NounType.BATTLE,
    });
    expect(label).toBe('Perform Battle');
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
      object: NounType.COMBO,
    });
    expect(label).toBe('Any Operator Perform Combo');
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
      to: NounType.OPERATOR,
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
      to: NounType.OPERATOR,
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
      to: NounType.ENEMY,
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
      to: NounType.OPERATOR,
    };
    const ctx = makeCtx({ sourceOwnerId: 'slot3' });
    const result = executeEffect(effect, ctx);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].ownerId).toBe('slot3');
  });

  test('CONSUME FROM ENEMY resolves correctly', () => {
    const infliction = makeEvent({
      uid: 'inf-1',
      columnId: INFLICTION_COLUMNS.HEAT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });
    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: NounType.INFLICTION,
      objectQualifier: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
    };
    const ctx = makeCtx({ events: [infliction] });
    const result = executeEffect(effect, ctx);
    expect(result.clamped.size).toBe(1);
    expect(result.clamped.has('inf-1')).toBe(true);
  });
});

// ── CHANCE tests ─────────────────────────────────────────────────────────

describe('CHANCE compound effects', () => {
  const chanceEffect = (chance: number, children: Effect[]): Effect => ({
    verb: VerbType.CHANCE,
    with: { value: { verb: VerbType.IS, value: chance } },
    effects: children,
  });

  const applyStatus = (objectId: string): Effect => ({
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId,
    toDeterminer: DeterminerType.THIS,
    to: NounType.OPERATOR,
  });

  const applyInflictionWithDuration = (durationSec: number): Effect => ({
    verb: VerbType.APPLY,
    object: NounType.INFLICTION,
    objectQualifier: AdjectiveType.HEAT,
    to: NounType.ENEMY,
    with: { duration: { verb: VerbType.IS, value: durationSec } },
  });

  test('ALWAYS mode: child effects always execute', () => {
    const effect = chanceEffect(0.3, [applyStatus('BUFF')]);
    const ctx = makeCtx({ critMode: CritMode.ALWAYS });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('BUFF');
  });

  test('NEVER mode: child effects never execute', () => {
    const effect = chanceEffect(0.3, [applyStatus('BUFF')]);
    const ctx = makeCtx({ critMode: CritMode.NEVER });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(0);
  });

  test('NEVER mode: even chance=1.0 does not execute', () => {
    const effect = chanceEffect(1.0, [applyStatus('BUFF')]);
    const ctx = makeCtx({ critMode: CritMode.NEVER });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(0);
  });

  test('EXPECTED mode: child effects execute with scaled values', () => {
    // 30% chance, 10s duration → expected duration = 3s = 360 frames
    const effect = chanceEffect(0.3, [applyInflictionWithDuration(10)]);
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(360); // 10 * 0.3 * 120
  });

  test('EXPECTED mode: default when critMode omitted', () => {
    // No critMode → defaults to EXPECTED
    const effect = chanceEffect(0.5, [applyInflictionWithDuration(10)]);
    const ctx = makeCtx();
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(600); // 10 * 0.5 * 120
  });

  test('empty children returns empty mutation set', () => {
    const effect = chanceEffect(0.5, []);
    const ctx = makeCtx({ critMode: CritMode.ALWAYS });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.produced).toHaveLength(0);
  });

  test('nested CHANCE: multipliers compound in EXPECTED mode', () => {
    // Outer 0.5, inner 0.3 → effective 0.15
    // 10s duration → expected 1.5s = 180 frames
    const inner = chanceEffect(0.3, [applyInflictionWithDuration(10)]);
    const outer = chanceEffect(0.5, [inner]);
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(outer, ctx);

    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(180); // 10 * 0.5 * 0.3 * 120
  });

  test('CHANCE inside ALL: works as a child effect', () => {
    const effect: Effect = {
      verb: VerbType.ALL,
      predicates: [{
        conditions: [],
        effects: [
          applyStatus('GUARANTEED'),
          chanceEffect(0.5, [applyStatus('PROBABILISTIC')]),
        ],
      }],
    };

    // ALWAYS mode: both fire
    const ctx = makeCtx({ critMode: CritMode.ALWAYS });
    const result = executeEffect(effect, ctx);
    expect(result.produced).toHaveLength(2);
    expect(result.produced[0].name).toBe('GUARANTEED');
    expect(result.produced[1].name).toBe('PROBABILISTIC');

    // NEVER mode: only guaranteed fires
    const ctx2 = makeCtx({ critMode: CritMode.NEVER });
    const result2 = executeEffect(effect, ctx2);
    expect(result2.produced).toHaveLength(1);
    expect(result2.produced[0].name).toBe('GUARANTEED');
  });

  test('CHANCE with failed child propagates failure', () => {
    // CHANCE wrapping a CONSUME that will fail (no infliction to consume)
    const effect = chanceEffect(1.0, [{
      verb: VerbType.CONSUME,
      object: NounType.INFLICTION,
      objectQualifier: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
    }]);
    const ctx = makeCtx({ critMode: CritMode.ALWAYS, events: [] });
    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(true);
  });

  test('ALWAYS mode: unscaled values (chanceMultiplier stays 1.0)', () => {
    // In ALWAYS mode, duration should NOT be scaled
    const effect = chanceEffect(0.3, [applyInflictionWithDuration(10)]);
    const ctx = makeCtx({ critMode: CritMode.ALWAYS });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(1200); // full 10s * 120fps, not scaled
  });
});

// ── CHANCE + ELSE tests ─────────────────────────────────────────────────────

describe('CHANCE with ELSE branch', () => {
  const chanceWithElse = (chance: number, children: Effect[], elseChildren: Effect[]): Effect => ({
    verb: VerbType.CHANCE,
    with: { value: { verb: VerbType.IS, value: chance } },
    effects: children,
    elseEffects: elseChildren,
  });

  const applyStatus = (objectId: string): Effect => ({
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId,
    toDeterminer: DeterminerType.THIS,
    to: NounType.OPERATOR,
  });

  const applyInflictionWithDuration = (durationSec: number): Effect => ({
    verb: VerbType.APPLY,
    object: NounType.INFLICTION,
    objectQualifier: AdjectiveType.HEAT,
    to: NounType.ENEMY,
    with: { duration: { verb: VerbType.IS, value: durationSec } },
  });

  test('ALWAYS mode: main effects fire, else effects do not', () => {
    const effect = chanceWithElse(0.3,
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    const ctx = makeCtx({ critMode: CritMode.ALWAYS });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('MAIN');
  });

  test('NEVER mode: else effects fire, main effects do not', () => {
    const effect = chanceWithElse(0.3,
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    const ctx = makeCtx({ critMode: CritMode.NEVER });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('FALLBACK');
  });

  test('EXPECTED mode: both paths execute with complementary multipliers', () => {
    // 30% chance: main gets 0.3 multiplier, else gets 0.7 multiplier
    // Main: 10s * 0.3 = 3s = 360 frames
    // Else: 10s * 0.7 = 7s = 840 frames
    const effect = chanceWithElse(0.3,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(360);  // 10 * 0.3 * 120
    expect(eventDuration(result.produced[1])).toBe(840);   // 10 * 0.7 * 120
  });

  test('EXPECTED mode without else: behaves same as before (no regression)', () => {
    const effect: Effect = {
      verb: VerbType.CHANCE,
      with: { value: { verb: VerbType.IS, value: 0.3 } },
      effects: [applyInflictionWithDuration(10)],
    };
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(360); // 10 * 0.3 * 120
  });

  test('empty else with NEVER mode: returns empty', () => {
    const effect: Effect = {
      verb: VerbType.CHANCE,
      with: { value: { verb: VerbType.IS, value: 0.5 } },
      effects: [applyStatus('MAIN')],
      // no elseEffects
    };
    const ctx = makeCtx({ critMode: CritMode.NEVER });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(0);
  });

  test('nested CHANCE with ELSE in EXPECTED mode compounds correctly', () => {
    // Outer: 0.5 chance, inner main: 0.4, inner else: (1-0.4)=0.6
    // Inner main effective: 0.5 * 0.4 = 0.2 → 10s * 0.2 = 2.4s = 240 frames (rounding: 10*0.2*120=240)
    // Inner else effective: 0.5 * 0.6 = 0.3 → 10s * 0.3 = 3.6s = 360 frames
    const inner = chanceWithElse(0.4,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const outer: Effect = {
      verb: VerbType.CHANCE,
      with: { value: { verb: VerbType.IS, value: 0.5 } },
      effects: [inner],
    };
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(outer, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(240);  // 10 * 0.5 * 0.4 * 120
    expect(eventDuration(result.produced[1])).toBe(360);   // 10 * 0.5 * 0.6 * 120
  });

  // ── isCrit-based resolution ──────────────────────────────────────────

  test('MANUAL mode: isCrit=true fires main, not else', () => {
    const effect = chanceWithElse(0.3,
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    const ctx = makeCtx({ critMode: CritMode.MANUAL, isCrit: true });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('MAIN');
  });

  test('MANUAL mode: isCrit=false fires else, not main', () => {
    const effect = chanceWithElse(0.3,
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    const ctx = makeCtx({ critMode: CritMode.MANUAL, isCrit: false });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('FALLBACK');
  });

  test('MANUAL mode: no isCrit defaults to false (else fires)', () => {
    const effect = chanceWithElse(0.3,
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    const ctx = makeCtx({ critMode: CritMode.MANUAL });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('FALLBACK');
  });

  test('MANUAL mode: isCrit=true fires main path', () => {
    const effect = chanceWithElse(0.01,  // very low chance
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    // isCrit=true forces main path despite low chance
    const ctx = makeCtx({ critMode: CritMode.MANUAL, isCrit: true });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('MAIN');
  });

  test('MANUAL mode: isCrit=false fires else path', () => {
    const effect = chanceWithElse(0.99,  // very high chance
      [applyStatus('MAIN')],
      [applyStatus('FALLBACK')],
    );
    // isCrit=false forces else path despite high chance
    const ctx = makeCtx({ critMode: CritMode.MANUAL, isCrit: false });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].name).toBe('FALLBACK');
  });

  test('MANUAL mode without else: isCrit=false returns empty', () => {
    const effect: Effect = {
      verb: VerbType.CHANCE,
      with: { value: { verb: VerbType.IS, value: 0.5 } },
      effects: [applyStatus('MAIN')],
    };
    const ctx = makeCtx({ critMode: CritMode.MANUAL, isCrit: false });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(0);
  });
});

// ── EXPECTED branching deep-dive ────────────────────────────────────────────

describe('CHANCE EXPECTED branching', () => {
  const chanceWithElse = (chance: number, children: Effect[], elseChildren: Effect[]): Effect => ({
    verb: VerbType.CHANCE,
    with: { value: { verb: VerbType.IS, value: chance } },
    effects: children,
    elseEffects: elseChildren,
  });

  const chanceEffect = (chance: number, children: Effect[]): Effect => ({
    verb: VerbType.CHANCE,
    with: { value: { verb: VerbType.IS, value: chance } },
    effects: children,
  });

  const applyInflictionWithDuration = (durationSec: number): Effect => ({
    verb: VerbType.APPLY,
    object: NounType.INFLICTION,
    objectQualifier: AdjectiveType.HEAT,
    to: NounType.ENEMY,
    with: { duration: { verb: VerbType.IS, value: durationSec } },
  });

  const applyStatusWithDuration = (objectId: string, durationSec: number): Effect => ({
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId,
    toDeterminer: DeterminerType.THIS,
    to: NounType.OPERATOR,
    with: { duration: { verb: VerbType.IS, value: durationSec } },
  });

  // ── Conservation: main + else = unscaled total ──────────────────────

  test('conservation: main + else durations sum to unscaled original', () => {
    // 40% chance, 20s duration on both branches
    // Main: 20 * 0.4 = 8s = 960f, Else: 20 * 0.6 = 12s = 1440f
    // Sum: 960 + 1440 = 2400f = 20s * 120fps ✓
    const effect = chanceWithElse(0.4,
      [applyInflictionWithDuration(20)],
      [applyInflictionWithDuration(20)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    const mainDur = eventDuration(result.produced[0]);
    const elseDur = eventDuration(result.produced[1]);
    expect(mainDur).toBe(960);   // 20 * 0.4 * 120
    expect(elseDur).toBe(1440);  // 20 * 0.6 * 120
    expect(mainDur + elseDur).toBe(2400); // 20 * 120 — full unscaled
  });

  test('conservation: 50/50 split produces equal durations', () => {
    const effect = chanceWithElse(0.5,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(eventDuration(result.produced[0])).toBe(600);  // 10 * 0.5 * 120
    expect(eventDuration(result.produced[1])).toBe(600);  // 10 * 0.5 * 120
  });

  // ── Edge: chance = 0.0 and chance = 1.0 ────────────────────────────

  test('chance=0.0: main gets zero duration, else gets full duration', () => {
    const effect = chanceWithElse(0.0,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(0);     // 10 * 0.0 * 120
    expect(eventDuration(result.produced[1])).toBe(1200);  // 10 * 1.0 * 120
  });

  test('chance=1.0: main gets full duration, else gets zero duration', () => {
    const effect = chanceWithElse(1.0,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(1200);  // 10 * 1.0 * 120
    expect(eventDuration(result.produced[1])).toBe(0);     // 10 * 0.0 * 120
  });

  // ── Asymmetric branches ────────────────────────────────────────────

  test('asymmetric: main and else produce different durations', () => {
    // 25% chance: main has 20s effect, else has 4s effect
    // Main: 20 * 0.25 = 5s = 600f
    // Else:  4 * 0.75 = 3s = 360f
    const effect = chanceWithElse(0.25,
      [applyInflictionWithDuration(20)],
      [applyInflictionWithDuration(4)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(600);  // 20 * 0.25 * 120
    expect(eventDuration(result.produced[1])).toBe(360);  //  4 * 0.75 * 120
  });

  test('asymmetric: main produces status, else produces infliction', () => {
    // 60% chance: main applies a status with 10s duration, else applies infliction with 5s duration
    const effect = chanceWithElse(0.6,
      [applyStatusWithDuration('BUFF', 10)],
      [applyInflictionWithDuration(5)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(result.produced[0].name).toBe('BUFF');
    expect(eventDuration(result.produced[0])).toBe(720);  // 10 * 0.6 * 120
    expect(eventDuration(result.produced[1])).toBe(240);  //  5 * 0.4 * 120
  });

  // ── Multiple children per branch ───────────────────────────────────

  test('multiple children: each child in both branches is scaled', () => {
    // 30% chance, main has 2 effects, else has 1 effect
    const effect = chanceWithElse(0.3,
      [
        applyStatusWithDuration('BUFF_A', 10),
        applyStatusWithDuration('BUFF_B', 20),
      ],
      [
        applyInflictionWithDuration(15),
      ],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(3);
    // Main children scaled by 0.3
    expect(result.produced[0].name).toBe('BUFF_A');
    expect(eventDuration(result.produced[0])).toBe(360);   // 10 * 0.3 * 120
    expect(result.produced[1].name).toBe('BUFF_B');
    expect(eventDuration(result.produced[1])).toBe(720);   // 20 * 0.3 * 120
    // Else child scaled by 0.7
    expect(eventDuration(result.produced[2])).toBe(1260);  // 15 * 0.7 * 120
  });

  // ── Stacks scaling ─────────────────────────────────────────────────

  test('reaction stacks are scaled by chance multiplier', () => {
    // 40% chance to apply 5-stack reaction, else apply 3-stack reaction
    // Main: 5 * 0.4 = 2, Else: 3 * 0.6 = 1.8
    const applyReactionWithStacks = (stacks: number): Effect => ({
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: NounType.REACTION,
      objectQualifier: AdjectiveType.COMBUSTION,
      to: NounType.ENEMY,
      with: { stacks: { verb: VerbType.IS, value: stacks } },
    });

    const effect = chanceWithElse(0.4,
      [applyReactionWithStacks(5)],
      [applyReactionWithStacks(3)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(result.produced[0].stacks).toBe(2);          // 5 * 0.4
    expect(result.produced[1].stacks).toBeCloseTo(1.8);  // 3 * 0.6
  });

  // ── Pre-existing chanceMultiplier from outer context ───────────────

  test('inherits outer chanceMultiplier and compounds it', () => {
    // Outer context already has 0.5 multiplier (e.g. from parent CHANCE without ELSE)
    // Inner CHANCE+ELSE at 0.4: main gets 0.5*0.4=0.2, else gets 0.5*0.6=0.3
    const effect = chanceWithElse(0.4,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED, chanceMultiplier: 0.5 });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(240);  // 10 * 0.5 * 0.4 * 120
    expect(eventDuration(result.produced[1])).toBe(360);  // 10 * 0.5 * 0.6 * 120
  });

  test('parent CHANCE (no else) → child CHANCE+ELSE compounds correctly', () => {
    // Outer: CHANCE 0.5 (no else) → multiplier 0.5
    // Inner: CHANCE 0.3 + ELSE → main 0.5*0.3=0.15, else 0.5*0.7=0.35
    const inner = chanceWithElse(0.3,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const outer = chanceEffect(0.5, [inner]);
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(outer, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(180);  // 10 * 0.15 * 120
    expect(eventDuration(result.produced[1])).toBe(420);  // 10 * 0.35 * 120
  });

  // ── Double-nested CHANCE+ELSE ──────────────────────────────────────

  test('nested CHANCE+ELSE inside CHANCE+ELSE: four leaf outcomes', () => {
    // Outer: 0.6 chance
    //   Main → inner: 0.4 chance
    //     Main: 0.6 * 0.4 = 0.24
    //     Else: 0.6 * 0.6 = 0.36
    //   Else → inner: 0.5 chance
    //     Main: 0.4 * 0.5 = 0.20
    //     Else: 0.4 * 0.5 = 0.20
    // Sum: 0.24 + 0.36 + 0.20 + 0.20 = 1.0 ✓
    const innerMain = chanceWithElse(0.4,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const innerElse = chanceWithElse(0.5,
      [applyInflictionWithDuration(10)],
      [applyInflictionWithDuration(10)],
    );
    const outer = chanceWithElse(0.6, [innerMain], [innerElse]);
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(outer, ctx);

    expect(result.produced).toHaveLength(4);
    // Outer-main → inner-main: 0.6 * 0.4 = 0.24
    expect(eventDuration(result.produced[0])).toBe(288);   // 10 * 0.24 * 120
    // Outer-main → inner-else: 0.6 * 0.6 = 0.36
    expect(eventDuration(result.produced[1])).toBe(432);   // 10 * 0.36 * 120
    // Outer-else → inner-main: 0.4 * 0.5 = 0.20
    expect(eventDuration(result.produced[2])).toBe(240);   // 10 * 0.20 * 120
    // Outer-else → inner-else: 0.4 * 0.5 = 0.20
    expect(eventDuration(result.produced[3])).toBe(240);   // 10 * 0.20 * 120

    // Conservation: all four durations sum to full unscaled
    const total = result.produced.reduce((sum, ev) => sum + eventDuration(ev), 0);
    expect(total).toBe(1200); // 10s * 120fps
  });

  // ── CHANCE+ELSE inside ALL compound ────────────────────────────────

  test('CHANCE+ELSE inside ALL: guaranteed + expected effects coexist', () => {
    // ALL with unconditional predicate:
    //   1. Guaranteed status (no chance gate)
    //   2. CHANCE 0.3 + ELSE (branching)
    const effect: Effect = {
      verb: VerbType.ALL,
      predicates: [{
        conditions: [],
        effects: [
          applyStatusWithDuration('GUARANTEED', 10),
          chanceWithElse(0.3,
            [applyStatusWithDuration('LUCKY', 10)],
            [applyStatusWithDuration('UNLUCKY', 10)],
          ),
        ],
      }],
    };
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(3);
    // Guaranteed: full duration (chanceMultiplier=1.0 from default)
    expect(result.produced[0].name).toBe('GUARANTEED');
    expect(eventDuration(result.produced[0])).toBe(1200); // 10 * 1.0 * 120
    // CHANCE main: scaled by 0.3
    expect(result.produced[1].name).toBe('LUCKY');
    expect(eventDuration(result.produced[1])).toBe(360);  // 10 * 0.3 * 120
    // CHANCE else: scaled by 0.7
    expect(result.produced[2].name).toBe('UNLUCKY');
    expect(eventDuration(result.produced[2])).toBe(840);  // 10 * 0.7 * 120
  });

  // ── Default critMode (omitted = EXPECTED) ──────────────────────────

  test('omitted critMode defaults to EXPECTED for branching', () => {
    const effect = chanceWithElse(0.25,
      [applyInflictionWithDuration(8)],
      [applyInflictionWithDuration(8)],
    );
    const ctx = makeCtx(); // no critMode
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(240);  // 8 * 0.25 * 120
    expect(eventDuration(result.produced[1])).toBe(720);  // 8 * 0.75 * 120
  });

  // ── Small probability precision ────────────────────────────────────

  test('small probability: 1% chance scales correctly', () => {
    // 0.01 chance, 100s duration
    // Main: 100 * 0.01 = 1s = 120f
    // Else: 100 * 0.99 = 99s = 11880f
    const effect = chanceWithElse(0.01,
      [applyInflictionWithDuration(100)],
      [applyInflictionWithDuration(100)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(2);
    expect(eventDuration(result.produced[0])).toBe(120);    // 100 * 0.01 * 120
    expect(eventDuration(result.produced[1])).toBe(11880);  // 100 * 0.99 * 120
    expect(eventDuration(result.produced[0]) + eventDuration(result.produced[1])).toBe(12000);
  });

  // ── Else-only (main effects empty) ────────────────────────────────

  test('empty main effects: only else branch produces output', () => {
    const effect = chanceWithElse(0.3,
      [],
      [applyInflictionWithDuration(10)],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(840);  // 10 * 0.7 * 120
  });

  test('empty else effects: only main branch produces output', () => {
    const effect = chanceWithElse(0.3,
      [applyInflictionWithDuration(10)],
      [],
    );
    const ctx = makeCtx({ critMode: CritMode.EXPECTED });
    const result = executeEffect(effect, ctx);

    expect(result.produced).toHaveLength(1);
    expect(eventDuration(result.produced[0])).toBe(360);  // 10 * 0.3 * 120
  });
});

// ── getChanceExpectation / getChanceElseExpectation ──────────────────────────

describe('getChanceExpectation', () => {
  test('EXPECTED mode: returns raw chance probability', () => {
    expect(getChanceExpectation(CritMode.EXPECTED, 0.35)).toBe(0.35);
    expect(getChanceExpectation(CritMode.EXPECTED, 0.0)).toBe(0);
    expect(getChanceExpectation(CritMode.EXPECTED, 1.0)).toBe(1);
  });

  test('ALWAYS mode: returns 1 regardless of chance', () => {
    expect(getChanceExpectation(CritMode.ALWAYS, 0.1)).toBe(1);
    expect(getChanceExpectation(CritMode.ALWAYS, 0.99)).toBe(1);
  });

  test('NEVER mode: returns 0 regardless of chance', () => {
    expect(getChanceExpectation(CritMode.NEVER, 0.9)).toBe(0);
    expect(getChanceExpectation(CritMode.NEVER, 0.01)).toBe(0);
  });

  test('MANUAL mode: returns 1 when resolved true, 0 when false', () => {
    expect(getChanceExpectation(CritMode.MANUAL, 0.5, true)).toBe(1);
    expect(getChanceExpectation(CritMode.MANUAL, 0.5, false)).toBe(0);
  });

  test('MANUAL mode: returns 0 when resolved undefined (no pin)', () => {
    expect(getChanceExpectation(CritMode.MANUAL, 0.3)).toBe(0);
  });
});

describe('getChanceElseExpectation', () => {
  test('EXPECTED mode: returns complementary probability', () => {
    expect(getChanceElseExpectation(CritMode.EXPECTED, 0.3)).toBeCloseTo(0.7);
    expect(getChanceElseExpectation(CritMode.EXPECTED, 0.0)).toBe(1);
    expect(getChanceElseExpectation(CritMode.EXPECTED, 1.0)).toBe(0);
    expect(getChanceElseExpectation(CritMode.EXPECTED, 0.5)).toBe(0.5);
  });

  test('ALWAYS mode: returns 0 (main always fires, else never fires)', () => {
    expect(getChanceElseExpectation(CritMode.ALWAYS, 0.3)).toBe(0);
  });

  test('NEVER mode: returns 1 (main never fires, else always fires)', () => {
    expect(getChanceElseExpectation(CritMode.NEVER, 0.3)).toBe(1);
  });

  test('MANUAL mode: complementary to resolved outcome', () => {
    expect(getChanceElseExpectation(CritMode.MANUAL, 0.5, true)).toBe(0);
    expect(getChanceElseExpectation(CritMode.MANUAL, 0.5, false)).toBe(1);
  });

  test('conservation: expectation + elseExpectation = 1 for all modes', () => {
    for (const mode of [CritMode.EXPECTED, CritMode.ALWAYS, CritMode.NEVER]) {
      const main = getChanceExpectation(mode, 0.35);
      const alt = getChanceElseExpectation(mode, 0.35);
      expect(main + alt).toBeCloseTo(1);
    }
    // Binary modes with resolved outcome
    for (const mode of [CritMode.MANUAL]) {
      for (const resolved of [true, false]) {
        const main = getChanceExpectation(mode, 0.35, resolved);
        const alt = getChanceElseExpectation(mode, 0.35, resolved);
        expect(main + alt).toBe(1);
      }
    }
  });
});

// ── StatAccumulator.resolveChance ──────────────────────────────────────��────

describe('StatAccumulator.resolveChance', () => {
  let acc: StatAccumulator;

  beforeEach(() => {
    acc = new StatAccumulator();
  });

  test('ALWAYS mode: returns true regardless of chance', () => {
    expect(acc.resolveChance('ev1', 0, 0, 0.1, CritMode.ALWAYS)).toBe(true);
    expect(acc.resolveChance('ev1', 0, 1, 0.99, CritMode.ALWAYS)).toBe(true);
  });

  test('NEVER mode: returns false regardless of chance', () => {
    expect(acc.resolveChance('ev1', 0, 0, 0.99, CritMode.NEVER)).toBe(false);
    expect(acc.resolveChance('ev1', 0, 1, 0.01, CritMode.NEVER)).toBe(false);
  });

  test('EXPECTED mode: returns undefined (caller uses getChanceExpectation)', () => {
    expect(acc.resolveChance('ev1', 0, 0, 0.5, CritMode.EXPECTED)).toBeUndefined();
  });

  test('existingPin overrides all modes', () => {
    expect(acc.resolveChance('ev1', 0, 0, 0.01, CritMode.NEVER, true)).toBe(true);
    expect(acc.resolveChance('ev1', 0, 0, 0.99, CritMode.ALWAYS, false)).toBe(false);
    expect(acc.resolveChance('ev1', 0, 0, 0.5, CritMode.EXPECTED, true)).toBe(true);
  });

  test('MANUAL mode: returns false without pin (no random roll)', () => {
    expect(acc.resolveChance('ev1', 0, 0, 0.5, CritMode.MANUAL)).toBe(false);
  });
});

// ── Crit × Chance multiplicative integration ────────────────────────────────

describe('crit × chance multiplicative expectations', () => {
  // Minimal DamageParams factory — only fields the formula actually multiplies
  const baseDamageParams = (overrides: Partial<DamageParams> = {}): DamageParams => ({
    attack: 1000,
    baseMultiplier: 1.5,
    attributeBonus: 1,
    multiplierGroup: 1,
    critMultiplier: 1,
    ampMultiplier: 1,
    staggerMultiplier: 1,
    finisherMultiplier: 1,
    linkMultiplier: 1,
    weakenMultiplier: 1,
    susceptibilityMultiplier: 1,
    fragilityMultiplier: 1,
    dmgReductionMultiplier: 1,
    protectionMultiplier: 1,
    defenseMultiplier: 1,
    resistanceMultiplier: 1,
    ...overrides,
  });

  // ── Default: no CHANCE gate → chanceMultiplier = 1 (transparent) ──────

  test('no CHANCE gate: chanceMultiplier defaults to 1, damage unchanged', () => {
    const params = baseDamageParams({ critMultiplier: 1.5 });
    // Without chanceMultiplier (undefined → 1)
    const damage = calculateDamage(params);
    // With explicit chanceMultiplier: 1
    const damageExplicit = calculateDamage({ ...params, chanceMultiplier: 1 });
    expect(damage).toBe(damageExplicit);
  });

  test('getChanceExpectation returns 1 for undefined chance (no gate)', () => {
    // When there's no CHANCE on a frame, the caller passes chance=undefined
    // but since the param is number, the caller would use 1 as the default
    expect(getChanceExpectation(CritMode.EXPECTED, 1)).toBe(1);
    expect(getChanceExpectation(CritMode.ALWAYS, 1)).toBe(1);
    expect(getChanceExpectation(CritMode.NEVER, 1)).toBe(0);
  });

  // ── EXPECTED mode: crit × chance are independent multipliers ──────────

  test('EXPECTED: crit and chance multiply independently in the formula', () => {
    const critRate = 0.4;
    const critDamage = 0.8;
    const chance = 0.3;

    const critExpectation = getFrameExpectation(CritMode.EXPECTED, undefined, undefined, critRate);
    const chanceExpectation = getChanceExpectation(CritMode.EXPECTED, chance);

    expect(critExpectation).toBe(0.4);
    expect(chanceExpectation).toBe(0.3);

    const critMultiplier = 1 + critDamage * critExpectation;  // 1 + 0.8 * 0.4 = 1.32
    expect(critMultiplier).toBeCloseTo(1.32);

    const params = baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation });
    const damage = calculateDamage(params);

    // Base: 1000 * 1.5 = 1500
    // × critMultiplier 1.32 = 1980
    // × chanceMultiplier 0.3 = 594
    expect(damage).toBeCloseTo(594);

    // Verify multiplicative: damage = baseDamage × crit × chance
    const baseDamage = calculateDamage(baseDamageParams());
    expect(damage).toBeCloseTo(baseDamage * critMultiplier * chanceExpectation);
  });

  test('EXPECTED: chance=1.0 is same as no CHANCE gate', () => {
    const critMultiplier = 1.5;
    const noChance = calculateDamage(baseDamageParams({ critMultiplier }));
    const fullChance = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: 1.0 }));
    expect(noChance).toBe(fullChance);
  });

  test('EXPECTED: chance=0.0 zeroes out all damage', () => {
    const damage = calculateDamage(baseDamageParams({
      critMultiplier: 1.5,
      chanceMultiplier: 0,
    }));
    expect(damage).toBe(0);
  });

  // ── ALWAYS mode: both crit and chance are 1 ───────────────────────────

  test('ALWAYS: both expectations are 1, damage is fully unscaled', () => {
    const critExpectation = getFrameExpectation(CritMode.ALWAYS, undefined, undefined);
    const chanceExpectation = getChanceExpectation(CritMode.ALWAYS, 0.1);

    expect(critExpectation).toBe(1);
    expect(chanceExpectation).toBe(1);

    const critMultiplier = 1 + 0.8 * critExpectation; // 1.8
    const damage = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation }));
    const expected = 1000 * 1.5 * 1.8 * 1; // 2700
    expect(damage).toBeCloseTo(expected);
  });

  // ── NEVER mode: both are 0 ────────────────────────────────────────────

  test('NEVER: crit contributes nothing, chance zeroes damage', () => {
    const critExpectation = getFrameExpectation(CritMode.NEVER, undefined, undefined);
    const chanceExpectation = getChanceExpectation(CritMode.NEVER, 0.9);

    expect(critExpectation).toBe(0);
    expect(chanceExpectation).toBe(0);

    const critMultiplier = 1 + 0.8 * critExpectation; // 1
    const damage = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation }));
    expect(damage).toBe(0);
  });

  // ── MANUAL mode: binary outcomes multiply ──────────────────────────────

  test('MANUAL: both hit → full damage with crit', () => {
    const critExpectation = getFrameExpectation(CritMode.MANUAL, undefined, true);
    const chanceExpectation = getChanceExpectation(CritMode.MANUAL, 0.3, true);

    expect(critExpectation).toBe(1);
    expect(chanceExpectation).toBe(1);

    const critMultiplier = 1 + 0.8 * critExpectation; // 1.8
    const damage = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation }));
    expect(damage).toBeCloseTo(1000 * 1.5 * 1.8);
  });

  test('MANUAL: crit hit but chance miss → zero damage', () => {
    const critExpectation = getFrameExpectation(CritMode.MANUAL, undefined, true);
    const chanceExpectation = getChanceExpectation(CritMode.MANUAL, 0.3, false);

    expect(critExpectation).toBe(1);
    expect(chanceExpectation).toBe(0);

    const critMultiplier = 1 + 0.8 * critExpectation;
    const damage = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation }));
    expect(damage).toBe(0);
  });

  test('MANUAL: chance hit but crit miss → base damage only', () => {
    const critExpectation = getFrameExpectation(CritMode.MANUAL, undefined, false);
    const chanceExpectation = getChanceExpectation(CritMode.MANUAL, 0.3, true);

    expect(critExpectation).toBe(0);
    expect(chanceExpectation).toBe(1);

    const critMultiplier = 1 + 0.8 * critExpectation; // 1
    const damage = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation }));
    expect(damage).toBeCloseTo(1000 * 1.5);
  });

  test('MANUAL: pinned crit=true + pinned chance=true → full damage', () => {
    const critExpectation = getFrameExpectation(CritMode.MANUAL, undefined, true);
    const chanceExpectation = getChanceExpectation(CritMode.MANUAL, 0.3, true);

    const critMultiplier = 1 + 0.8 * critExpectation;
    const damage = calculateDamage(baseDamageParams({ critMultiplier, chanceMultiplier: chanceExpectation }));
    expect(damage).toBeCloseTo(1000 * 1.5 * 1.8);
  });

  test('MANUAL: pinned chance=false → zero damage regardless of crit', () => {
    const chanceExpectation = getChanceExpectation(CritMode.MANUAL, 0.3, false);
    const damage = calculateDamage(baseDamageParams({
      critMultiplier: 1.8,
      chanceMultiplier: chanceExpectation,
    }));
    expect(damage).toBe(0);
  });

  // ── resolveChance + getChanceExpectation round-trip ────────────────────

  test('resolveChance feeds getChanceExpectation for MANUAL mode', () => {
    const acc = new StatAccumulator();

    // MANUAL without pin → returns false
    const resolved = acc.resolveChance('ev1', 0, 0, 0.5, CritMode.MANUAL);
    const expectation = getChanceExpectation(CritMode.MANUAL, 0.5, resolved);

    expect(resolved).toBe(false);
    expect(expectation).toBe(0);

    // MANUAL with pin=true → returns true
    const resolved2 = acc.resolveChance('ev1', 0, 1, 0.5, CritMode.MANUAL, true);
    const expectation2 = getChanceExpectation(CritMode.MANUAL, 0.5, resolved2);

    expect(resolved2).toBe(true);
    expect(expectation2).toBe(1);
  });

  test('EXPECTED mode: resolveChance returns undefined, getChanceExpectation uses raw chance', () => {
    const acc = new StatAccumulator();
    const resolved = acc.resolveChance('ev1', 0, 0, 0.35, CritMode.EXPECTED);
    expect(resolved).toBeUndefined();

    // Caller uses the raw chance directly
    const expectation = getChanceExpectation(CritMode.EXPECTED, 0.35);
    expect(expectation).toBe(0.35);
  });

  // ── Commutativity: order of multiplication doesn't matter ─────────────

  test('crit × chance = chance × crit in the damage formula', () => {
    const chance = 0.3;
    const critRate = 0.4;
    const critDamage = 0.8;

    const critMult = 1 + critDamage * critRate;
    const chanceMult = chance;

    // Apply crit first, then chance
    const d1 = calculateDamage(baseDamageParams({ critMultiplier: critMult, chanceMultiplier: chanceMult }));
    // Apply as a single product
    const base = calculateDamage(baseDamageParams());
    const d2 = base * critMult * chanceMult;

    expect(d1).toBeCloseTo(d2);
  });
});
