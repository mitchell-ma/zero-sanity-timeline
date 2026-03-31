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

import { executeEffect, executeEffects, applyMutations } from '../../controller/timeline/effectExecutor';
import type { ExecutionContext, MutationSet } from '../../controller/timeline/effectExecutor';
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
      object: NounType.REACTION,
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

  test('ALL AT_MOST N caps iterations', () => {
    // 3 inflictions exist, but AT_MOST 2
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
        cardinalityConstraint: CardinalityConstraintType.AT_MOST,
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

    // Only 2 iterations should execute (AT_MOST 2)
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

  test('HAVE STATUS with AT_LEAST cardinality', () => {
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
      cardinalityConstraint: CardinalityConstraintType.AT_LEAST,
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

  test('RANDOM mode: respects Math.random', () => {
    const effect = chanceEffect(0.5, [applyStatus('BUFF')]);

    // Mock Math.random to return 0.3 (< 0.5, passes)
    const origRandom = Math.random;
    Math.random = () => 0.3;
    const passCtx = makeCtx({ critMode: CritMode.RANDOM });
    const passResult = executeEffect(effect, passCtx);
    expect(passResult.produced).toHaveLength(1);

    // Mock Math.random to return 0.7 (>= 0.5, fails)
    Math.random = () => 0.7;
    const failCtx = makeCtx({ critMode: CritMode.RANDOM });
    const failResult = executeEffect(effect, failCtx);
    expect(failResult.produced).toHaveLength(0);

    Math.random = origRandom;
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

  test('nested CHANCE in SIMULATION: both rolls must pass', () => {
    const inner = chanceEffect(0.5, [applyStatus('BUFF')]);
    const outer = chanceEffect(0.5, [inner]);

    const origRandom = Math.random;
    let callCount = 0;

    // First call (outer) returns 0.3 (pass), second call (inner) returns 0.7 (fail)
    Math.random = () => {
      callCount++;
      return callCount === 1 ? 0.3 : 0.7;
    };
    const ctx = makeCtx({ critMode: CritMode.RANDOM });
    const result = executeEffect(outer, ctx);
    expect(result.produced).toHaveLength(0);

    // Both pass
    callCount = 0;
    Math.random = () => 0.1;
    const ctx2 = makeCtx({ critMode: CritMode.RANDOM });
    const result2 = executeEffect(outer, ctx2);
    expect(result2.produced).toHaveLength(1);

    Math.random = origRandom;
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
