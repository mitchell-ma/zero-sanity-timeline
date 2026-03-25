/**
 * Value resolver — unit tests for sourceContext, ofDeterminer, and ValueOperation rename.
 */
import { VerbType, ValueOperation, NounType, DeterminerType } from '../../dsl/semantics';
import type { ValueNode } from '../../dsl/semantics';
import { resolveValueNode } from '../../controller/calculation/valueResolver';
import type { ValueResolutionContext } from '../../controller/calculation/valueResolver';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ValueResolutionContext>): ValueResolutionContext {
  return { skillLevel: 12, potential: 0, stats: {}, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('resolveValueNode', () => {
  describe('ValueLiteral', () => {
    it('returns the literal value', () => {
      const node: ValueNode = { verb: VerbType.IS, value: 42 };
      expect(resolveValueNode(node, makeCtx())).toBe(42);
    });
  });

  describe('ValueVariable — basic', () => {
    it('indexes SKILL_LEVEL array (1-indexed)', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: [10, 20, 30] };
      expect(resolveValueNode(node, makeCtx({ skillLevel: 2 }))).toBe(20);
    });

    it('indexes TALENT_LEVEL array (0-indexed)', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'TALENT_LEVEL', value: [72, 108] };
      expect(resolveValueNode(node, makeCtx({ talentLevel: 0 }))).toBe(72);
      expect(resolveValueNode(node, makeCtx({ talentLevel: 1 }))).toBe(108);
    });

    it('defaults to 0 when talentLevel is not set', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'TALENT_LEVEL', value: [72, 108] };
      expect(resolveValueNode(node, makeCtx())).toBe(72);
    });

    it('clamps to last element when index exceeds array length', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'TALENT_LEVEL', value: [72, 108] };
      expect(resolveValueNode(node, makeCtx({ talentLevel: 5 }))).toBe(108);
    });
  });

  describe('ValueVariable — ofDeterminer SOURCE', () => {
    it('uses sourceContext talent level when ofDeterminer is SOURCE', () => {
      const node: ValueNode = {
        verb: VerbType.VARY_BY,
        object: 'TALENT_LEVEL',
        ofDeterminer: DeterminerType.SOURCE,
        of: 'OPERATOR',
        value: [72, 108],
      } as ValueNode;
      const ctx = makeCtx({
        talentLevel: 0,
        sourceContext: makeCtx({ talentLevel: 1 }),
      });
      // Should use sourceContext (talentLevel=1) → 108, not main ctx (talentLevel=0) → 72
      expect(resolveValueNode(node, ctx)).toBe(108);
    });

    it('falls back to main context when sourceContext is absent', () => {
      const node: ValueNode = {
        verb: VerbType.VARY_BY,
        object: 'TALENT_LEVEL',
        ofDeterminer: DeterminerType.SOURCE,
        of: 'OPERATOR',
        value: [72, 108],
      } as ValueNode;
      const ctx = makeCtx({ talentLevel: 0 });
      expect(resolveValueNode(node, ctx)).toBe(72);
    });

    it('uses main context when ofDeterminer is not SOURCE', () => {
      const node: ValueNode = {
        verb: VerbType.VARY_BY,
        object: 'TALENT_LEVEL',
        value: [72, 108],
      };
      const ctx = makeCtx({
        talentLevel: 0,
        sourceContext: makeCtx({ talentLevel: 1 }),
      });
      expect(resolveValueNode(node, ctx)).toBe(72);
    });
  });

  describe('ValueStat — existing form', () => {
    it('looks up stat from context', () => {
      const node: ValueNode = { verb: VerbType.IS, object: NounType.STAT, objectId: 'STRENGTH' };
      expect(resolveValueNode(node, makeCtx({ stats: { STRENGTH: 500 } }))).toBe(500);
    });

    it('returns 0 for missing stat', () => {
      const node: ValueNode = { verb: VerbType.IS, object: NounType.STAT, objectId: 'STRENGTH' };
      expect(resolveValueNode(node, makeCtx())).toBe(0);
    });
  });

  describe('ValueStat — extended form with ofDeterminer', () => {
    it('resolves stat from sourceContext when ofDeterminer is SOURCE', () => {
      const node: ValueNode = {
        verb: VerbType.IS,
        valueType: NounType.STAT,
        stat: 'STRENGTH',
        ofDeterminer: DeterminerType.SOURCE,
      } as ValueNode;
      const ctx = makeCtx({
        stats: { STRENGTH: 100 },
        sourceContext: makeCtx({ stats: { STRENGTH: 500 } }),
      });
      expect(resolveValueNode(node, ctx)).toBe(500);
    });

    it('resolves stat from main context when no sourceContext', () => {
      const node: ValueNode = {
        verb: VerbType.IS,
        valueType: NounType.STAT,
        stat: 'STRENGTH',
        ofDeterminer: DeterminerType.SOURCE,
      } as ValueNode;
      const ctx = makeCtx({ stats: { STRENGTH: 100 } });
      expect(resolveValueNode(node, ctx)).toBe(100);
    });

    it('resolves stat from main context when ofDeterminer is absent', () => {
      const node: ValueNode = {
        verb: VerbType.IS,
        valueType: NounType.STAT,
        stat: 'INTELLECT',
      } as ValueNode;
      const ctx = makeCtx({
        stats: { INTELLECT: 300 },
        sourceContext: makeCtx({ stats: { INTELLECT: 999 } }),
      });
      expect(resolveValueNode(node, ctx)).toBe(300);
    });
  });

  describe('ValueExpression — operation field', () => {
    it('MULT multiplies left and right', () => {
      const node: ValueNode = {
        operation: ValueOperation.MULT,
        left: { verb: VerbType.IS, value: 3 },
        right: { verb: VerbType.IS, value: 7 },
      };
      expect(resolveValueNode(node, makeCtx())).toBe(21);
    });

    it('ADD sums left and right', () => {
      const node: ValueNode = {
        operation: ValueOperation.ADD,
        left: { verb: VerbType.IS, value: 10 },
        right: { verb: VerbType.IS, value: 5 },
      };
      expect(resolveValueNode(node, makeCtx())).toBe(15);
    });

    it('INTEGER_DIV floors division', () => {
      const node: ValueNode = {
        operation: ValueOperation.INTEGER_DIV,
        left: { verb: VerbType.IS, value: 7 },
        right: { verb: VerbType.IS, value: 2 },
      };
      expect(resolveValueNode(node, makeCtx())).toBe(3);
    });
  });

  describe('IMPROVISER heal formula — nested MULT with SOURCE context', () => {
    it('resolves base * (scaling * STRENGTH) using SOURCE talent and stats', () => {
      // Formula: MULT(VARY_BY TALENT_LEVEL [72,108], MULT(VARY_BY TALENT_LEVEL [0.6,0.9], STAT STRENGTH))
      const node: ValueNode = {
        operation: ValueOperation.MULT,
        left: {
          verb: VerbType.VARY_BY,
          object: 'TALENT_LEVEL',
          ofDeterminer: DeterminerType.SOURCE,
          of: 'OPERATOR',
          value: [72, 108],
        } as ValueNode,
        right: {
          operation: ValueOperation.MULT,
          left: {
            verb: VerbType.VARY_BY,
            object: 'TALENT_LEVEL',
            ofDeterminer: DeterminerType.SOURCE,
            of: 'OPERATOR',
            value: [0.6, 0.9],
          } as ValueNode,
          right: {
            verb: VerbType.IS,
            valueType: NounType.STAT,
            stat: 'STRENGTH',
            ofDeterminer: DeterminerType.SOURCE,
          } as ValueNode,
        },
      };

      const sourceCtx = makeCtx({ talentLevel: 1, stats: { STRENGTH: 500 } });
      const ctx = makeCtx({ sourceContext: sourceCtx });

      // 108 * (0.9 * 500) = 108 * 450 = 48600
      expect(resolveValueNode(node, ctx)).toBe(48600);
    });

    it('uses talent level 0 values at base talent', () => {
      const node: ValueNode = {
        operation: ValueOperation.MULT,
        left: {
          verb: VerbType.VARY_BY,
          object: 'TALENT_LEVEL',
          ofDeterminer: DeterminerType.SOURCE,
          of: 'OPERATOR',
          value: [72, 108],
        } as ValueNode,
        right: {
          operation: ValueOperation.MULT,
          left: {
            verb: VerbType.VARY_BY,
            object: 'TALENT_LEVEL',
            ofDeterminer: DeterminerType.SOURCE,
            of: 'OPERATOR',
            value: [0.6, 0.9],
          } as ValueNode,
          right: {
            verb: VerbType.IS,
            valueType: NounType.STAT,
            stat: 'STRENGTH',
            ofDeterminer: DeterminerType.SOURCE,
          } as ValueNode,
        },
      };

      const sourceCtx = makeCtx({ talentLevel: 0, stats: { STRENGTH: 200 } });
      const ctx = makeCtx({ sourceContext: sourceCtx });

      // 72 * (0.6 * 200) = 72 * 120 = 8640
      expect(resolveValueNode(node, ctx)).toBe(8640);
    });
  });
});
