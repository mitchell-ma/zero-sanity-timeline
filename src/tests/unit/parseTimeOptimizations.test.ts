/**
 * Parse-time optimizations — DataDrivenSkillEventFrame.
 *
 * Tests two parse-time optimizations applied during frame construction:
 *
 * 1. Qualified status-ID pre-composition:
 *    Effects with objectQualifier + objectId get `_composedQualifiedId`
 *    populated at parse time so the interpreter can skip runtime
 *    `flattenQualifiedId` calls.
 *
 * 2. Conditional clause fast-path:
 *    `getHasConditionalClauses()` is pre-computed at parse time so the
 *    interpreter can skip `filterClauses` for frames with only
 *    unconditional clauses.
 */

import { DataDrivenSkillEventFrame } from '../../model/event-frames/dataDrivenEventFrames';
import { VerbType, NounType, AdjectiveType, flattenQualifiedId } from '../../dsl/semantics';
import { UnitType } from '../../consts/enums';

// ── JSON fixture helpers ───────────────────────────────────────────────────

/**
 * Build a minimal JsonFrame fixture. The constructor requires
 * `properties.offset` to exist.
 */
function buildFrame(clauses: { conditions: Record<string, unknown>[]; effects: Record<string, unknown>[] }[]) {
  return {
    properties: { offset: { value: 0, unit: UnitType.SECOND } },
    clause: clauses,
  };
}

// ── Tests: qualified status-ID pre-composition ─────────────────────────────

describe('qualified status-ID pre-composition', () => {
  test('effect with objectQualifier + objectId gets _composedQualifiedId', () => {
    const frame = buildFrame([{
      conditions: [],
      effects: [{
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectQualifier: AdjectiveType.CRYO,
        objectId: NounType.AMP,
        to: NounType.OPERATOR,
        with: { duration: { verb: VerbType.IS, value: 10 } },
      }],
    }]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    const clauses = parsed.getClauses();
    expect(clauses.length).toBe(1);

    const effect = clauses[0].effects[0];
    expect(effect).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const composed = (effect as any)._composedQualifiedId;
    expect(composed).toBe(flattenQualifiedId(AdjectiveType.CRYO, NounType.AMP));
  });

  test('effect without objectQualifier has no _composedQualifiedId', () => {
    const frame = buildFrame([{
      conditions: [],
      effects: [{
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: 'SOME_STATUS',
        to: NounType.OPERATOR,
        with: { duration: { verb: VerbType.IS, value: 5 } },
      }],
    }]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    const clauses = parsed.getClauses();
    expect(clauses.length).toBe(1);

    const effect = clauses[0].effects[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((effect as any)._composedQualifiedId).toBeUndefined();
  });

  test('composed ID matches flattenQualifiedId(qualifier, objectId)', () => {
    const qualifier = AdjectiveType.HEAT;
    const objectId = NounType.AMP;

    const frame = buildFrame([{
      conditions: [],
      effects: [{
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectQualifier: qualifier,
        objectId,
        to: NounType.OPERATOR,
        with: { duration: { verb: VerbType.IS, value: 8 } },
      }],
    }]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    const effect = parsed.getClauses()[0].effects[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const composed = (effect as any)._composedQualifiedId;
    expect(composed).toBe(flattenQualifiedId(qualifier, objectId));
    expect(composed).toBe(`${qualifier}_${objectId}`);
  });

  test('INFLICTION objectId is excluded from pre-composition', () => {
    const frame = buildFrame([{
      conditions: [],
      effects: [{
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectQualifier: AdjectiveType.CRYO,
        objectId: NounType.INFLICTION,
        to: NounType.ENEMY,
        with: { duration: { verb: VerbType.IS, value: 5 } },
      }],
    }]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    const clauses = parsed.getClauses();
    const effect = clauses[0]?.effects[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((effect as any)?._composedQualifiedId).toBeUndefined();
  });
});

// ── Tests: getHasConditionalClauses fast-path ──────────────────────────────

describe('getHasConditionalClauses fast-path', () => {
  test('frame with only unconditional clauses returns false', () => {
    const frame = buildFrame([
      {
        conditions: [],
        effects: [{
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: 'TEST_BUFF',
          to: NounType.OPERATOR,
          with: { duration: { verb: VerbType.IS, value: 10 } },
        }],
      },
      {
        conditions: [],
        effects: [{
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: 'TEST_BUFF_2',
          to: NounType.OPERATOR,
          with: { duration: { verb: VerbType.IS, value: 5 } },
        }],
      },
    ]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    expect(parsed.getHasConditionalClauses()).toBe(false);
  });

  test('frame with at least one conditional clause returns true', () => {
    const frame = buildFrame([
      {
        conditions: [],
        effects: [{
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: 'UNCONDITIONAL_BUFF',
          to: NounType.OPERATOR,
          with: { duration: { verb: VerbType.IS, value: 10 } },
        }],
      },
      {
        conditions: [{ subject: NounType.OPERATOR, verb: VerbType.HAVE, object: NounType.STATUS, objectId: 'SOME_STATUS' }],
        effects: [{
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: 'CONDITIONAL_BUFF',
          to: NounType.OPERATOR,
          with: { duration: { verb: VerbType.IS, value: 5 } },
        }],
      },
    ]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    expect(parsed.getHasConditionalClauses()).toBe(true);
  });

  test('frame with no clauses returns false', () => {
    const frame = {
      properties: { offset: { value: 0, unit: UnitType.SECOND } },
      // No clause array at all
    };

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    expect(parsed.getHasConditionalClauses()).toBe(false);
    expect(parsed.getClauses().length).toBe(0);
  });

  test('frame with empty clause array returns false', () => {
    const frame = buildFrame([]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    expect(parsed.getHasConditionalClauses()).toBe(false);
  });

  test('frame where all clauses are conditional returns true', () => {
    const frame = buildFrame([
      {
        conditions: [{ subject: NounType.ENEMY, verb: VerbType.IS, object: AdjectiveType.BREACHED }],
        effects: [{
          verb: VerbType.DEAL,
          object: NounType.DAMAGE,
          objectQualifier: AdjectiveType.PHYSICAL,
          with: { multiplier: { verb: VerbType.IS, value: 1.5 } },
        }],
      },
    ]);

    const parsed = new DataDrivenSkillEventFrame(frame as never);
    expect(parsed.getHasConditionalClauses()).toBe(true);
  });
});
