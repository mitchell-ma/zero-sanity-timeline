/**
 * `VARY_BY RANK of THIS WEAPON` — resolver unit test.
 *
 * Validates that `getVariableArrayIndex` reads `ctx.weaponSkillRank` (1-indexed,
 * 1–9 → array[0–8]) and that `resolveValueNode` clamps / falls back correctly.
 */
import { resolveValueNode, type ValueResolutionContext } from '../../controller/calculation/valueResolver';
import { NounType, VerbType, type ValueNode } from '../../dsl/semantics';

function mk(rank: number | undefined): ValueResolutionContext {
  return {
    skillLevel: 12,
    potential: 0,
    stats: {},
    weaponSkillRank: rank,
  };
}

const NINE_RANK_ARRAY = [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448];

function node(): ValueNode {
  return {
    verb: VerbType.VARY_BY,
    object: NounType.RANK,
    value: NINE_RANK_ARRAY,
    of: {
      object: NounType.WEAPON,
      of: { object: NounType.OPERATOR, determiner: 'THIS' as never },
    },
  } as unknown as ValueNode;
}

describe('VARY_BY RANK of THIS WEAPON', () => {
  test('rank 1 → array[0] (min)', () => {
    expect(resolveValueNode(node(), mk(1))).toBe(0.16);
  });

  test('rank 5 → array[4]', () => {
    expect(resolveValueNode(node(), mk(5))).toBe(0.288);
  });

  test('rank 9 → array[8] (max)', () => {
    expect(resolveValueNode(node(), mk(9))).toBe(0.448);
  });

  test('rank above max clamps to array[8]', () => {
    expect(resolveValueNode(node(), mk(12))).toBe(0.448);
  });

  test('undefined rank defaults to max rank — preserves pre-migration behavior', () => {
    expect(resolveValueNode(node(), mk(undefined))).toBe(0.448);
  });

  test('rank 0 or negative clamps to array[0]', () => {
    expect(resolveValueNode(node(), mk(0))).toBe(0.16);
  });
});
