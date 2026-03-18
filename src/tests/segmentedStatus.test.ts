/**
 * Segmented Status Tests — verifies segment support in the status derivation engine,
 * OTHER/ANY target resolution in the effect executor and condition evaluator.
 */
import { executeEffect } from '../controller/timeline/effectExecutor';
import type { ExecutionContext } from '../controller/timeline/effectExecutor';
import { evaluateConditions } from '../controller/timeline/conditionEvaluator';
import type { ConditionContext } from '../controller/timeline/conditionEvaluator';
import { VerbType, NounType, DeterminerType, WithValueVerb } from '../consts/semantics';
import type { Effect, Interaction } from '../consts/semantics';
import type { TimelineEvent } from '../consts/viewTypes';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; ownerId: string }): TimelineEvent {
  return {
    name: 'TEST',
    startFrame: 0,
    activationDuration: 2400,
    activeDuration: 0,
    cooldownDuration: 0,
    ...overrides,
  };
}

function makeExecCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
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

// ── OTHER/ANY target resolution tests ────────────────────────────────────

describe('OTHER/ANY target resolution', () => {
  describe('effectExecutor resolveOwnerId', () => {
    test('OTHER OPERATOR uses targetOwnerId when present', () => {
      const effect: Effect = {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'TEST_BUFF',
        toObject: NounType.OPERATOR,
        toDeterminer: DeterminerType.OTHER,
        with: {
          duration: { verb: WithValueVerb.IS, value: 10 },
        },
      };
      const ctx = makeExecCtx({ targetOwnerId: 'slot2' });
      const result = executeEffect(effect, ctx);

      expect(result.failed).toBe(false);
      expect(result.produced).toHaveLength(1);
      expect(result.produced[0].ownerId).toBe('slot2');
    });

    test('OTHER OPERATOR falls back to sourceOwnerId when no targetOwnerId', () => {
      const effect: Effect = {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'TEST_BUFF',
        toObject: NounType.OPERATOR,
        toDeterminer: DeterminerType.OTHER,
        with: {
          duration: { verb: WithValueVerb.IS, value: 10 },
        },
      };
      const ctx = makeExecCtx();
      const result = executeEffect(effect, ctx);

      expect(result.failed).toBe(false);
      expect(result.produced).toHaveLength(1);
      expect(result.produced[0].ownerId).toBe('slot1');
    });

    test('ANY OPERATOR uses targetOwnerId when present', () => {
      const effect: Effect = {
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'TEST_BUFF',
        toObject: NounType.OPERATOR,
        toDeterminer: DeterminerType.ANY,
        with: {
          duration: { verb: WithValueVerb.IS, value: 5 },
        },
      };
      const ctx = makeExecCtx({ targetOwnerId: 'slot3' });
      const result = executeEffect(effect, ctx);

      expect(result.failed).toBe(false);
      expect(result.produced).toHaveLength(1);
      expect(result.produced[0].ownerId).toBe('slot3');
    });
  });

  describe('conditionEvaluator resolveOwnerId', () => {
    test('OTHER OPERATOR condition uses targetOwnerId', () => {
      const statusEvent = makeEvent({
        id: 'status-1',
        columnId: 'test-buff',
        ownerId: 'slot2',
        name: 'TEST_BUFF',
      });
      const conditions: Interaction[] = [{
        subject: NounType.OPERATOR,
        subjectDeterminer: DeterminerType.OTHER,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: 'TEST_BUFF',
      }];
      const ctx = makeCondCtx({
        events: [statusEvent],
        targetOwnerId: 'slot2',
      });

      expect(evaluateConditions(conditions, ctx)).toBe(true);
    });

    test('OTHER OPERATOR condition returns undefined (wildcard) when no targetOwnerId', () => {
      // With no targetOwnerId, OTHER resolves to undefined (wildcard),
      // so it should match any operator's events
      const statusEvent = makeEvent({
        id: 'status-1',
        columnId: 'test-buff',
        ownerId: 'slot2',
        name: 'TEST_BUFF',
      });
      const conditions: Interaction[] = [{
        subject: NounType.OPERATOR,
        subjectDeterminer: DeterminerType.OTHER,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: 'TEST_BUFF',
      }];
      const ctx = makeCondCtx({
        events: [statusEvent],
      });

      // undefined ownerId acts as wildcard in activeCountAtFrame
      expect(evaluateConditions(conditions, ctx)).toBe(true);
    });

    test('ANY OPERATOR condition uses targetOwnerId when present', () => {
      const statusEvent = makeEvent({
        id: 'status-1',
        columnId: 'test-buff',
        ownerId: 'slot3',
        name: 'TEST_BUFF',
      });
      const conditions: Interaction[] = [{
        subject: NounType.OPERATOR,
        subjectDeterminer: DeterminerType.ANY,
        verb: VerbType.HAVE,
        object: NounType.STATUS,
        objectId: 'TEST_BUFF',
      }];
      const ctx = makeCondCtx({
        events: [statusEvent],
        targetOwnerId: 'slot3',
      });

      expect(evaluateConditions(conditions, ctx)).toBe(true);
    });
  });
});
