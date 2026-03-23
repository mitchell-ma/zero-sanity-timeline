/**
 * ValueNode type guards — unit tests for isValueLiteral, isValueStat, isValueExpression.
 *
 * Tests the widened type guards after:
 * - ValueStat extended form (valueType + stat + ofDeterminer)
 * - ValueExpression operator → operation rename
 * - isValueLiteral excluding valueType field
 */
import {
  VerbType, NounType, ValueOperation, DeterminerType,
  isValueLiteral, isValueVariable, isValueStat, isValueExpression,
} from '../../dsl/semantics';
import type { ValueNode } from '../../dsl/semantics';

describe('ValueNode type guards', () => {
  describe('isValueLiteral', () => {
    it('matches { verb: IS, value: number }', () => {
      const node: ValueNode = { verb: VerbType.IS, value: 42 };
      expect(isValueLiteral(node)).toBe(true);
    });

    it('rejects ValueStat existing form (has object field)', () => {
      const node: ValueNode = { verb: VerbType.IS, object: NounType.STAT, objectId: 'STRENGTH' };
      expect(isValueLiteral(node)).toBe(false);
    });

    it('rejects ValueStat extended form (has valueType field)', () => {
      const node = {
        verb: VerbType.IS,
        valueType: NounType.STAT,
        stat: 'STRENGTH',
        ofDeterminer: DeterminerType.SOURCE,
      } as ValueNode;
      expect(isValueLiteral(node)).toBe(false);
    });

    it('rejects ValueVariable', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: [1, 2, 3] };
      expect(isValueLiteral(node)).toBe(false);
    });

    it('rejects ValueExpression', () => {
      const node: ValueNode = {
        operation: ValueOperation.MULT,
        left: { verb: VerbType.IS, value: 1 },
        right: { verb: VerbType.IS, value: 2 },
      };
      expect(isValueLiteral(node)).toBe(false);
    });
  });

  describe('isValueStat', () => {
    it('matches existing form { verb: IS, object: STAT, objectId }', () => {
      const node: ValueNode = { verb: VerbType.IS, object: NounType.STAT, objectId: 'INTELLECT' };
      expect(isValueStat(node)).toBe(true);
    });

    it('matches extended form { verb: IS, valueType: STAT, stat, ofDeterminer }', () => {
      const node = {
        verb: VerbType.IS,
        valueType: NounType.STAT,
        stat: 'STRENGTH',
        ofDeterminer: DeterminerType.SOURCE,
      } as ValueNode;
      expect(isValueStat(node)).toBe(true);
    });

    it('rejects ValueLiteral (no object or valueType)', () => {
      const node: ValueNode = { verb: VerbType.IS, value: 42 };
      expect(isValueStat(node)).toBe(false);
    });

    it('rejects ValueVariable', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: [1] };
      expect(isValueStat(node)).toBe(false);
    });
  });

  describe('isValueVariable', () => {
    it('matches VARY_BY node', () => {
      const node: ValueNode = { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: [1, 2] };
      expect(isValueVariable(node)).toBe(true);
    });

    it('matches VARY_BY with ofDeterminer', () => {
      const node = {
        verb: VerbType.VARY_BY,
        object: 'TALENT_ONE_LEVEL',
        ofDeterminer: DeterminerType.SOURCE,
        of: 'OPERATOR',
        value: [72, 108],
      } as ValueNode;
      expect(isValueVariable(node)).toBe(true);
    });
  });

  describe('isValueExpression', () => {
    it('matches node with operation field', () => {
      const node: ValueNode = {
        operation: ValueOperation.MULT,
        left: { verb: VerbType.IS, value: 1 },
        right: { verb: VerbType.IS, value: 2 },
      };
      expect(isValueExpression(node)).toBe(true);
    });

    it('rejects leaf nodes', () => {
      expect(isValueExpression({ verb: VerbType.IS, value: 1 })).toBe(false);
      expect(isValueExpression({ verb: VerbType.VARY_BY, object: 'X', value: [1] })).toBe(false);
      expect(isValueExpression({ verb: VerbType.IS, object: NounType.STAT, objectId: 'X' })).toBe(false);
    });
  });
});
