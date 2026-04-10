/**
 * collapseConstantExpressions — parse-time value node optimization.
 *
 * Validates that expression trees composed entirely of IS literals are
 * collapsed into a single IS literal at parse time, while expressions
 * containing runtime-dependent operands (VARY_BY, STAT, STATUS) are
 * left intact.
 */

import { VerbType, ValueOperation, NounType } from '../../dsl/semantics';
import type { ValueNode, ValueExpression } from '../../dsl/semantics';
import { collapseConstantExpressions } from '../../controller/calculation/valueResolver';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Shorthand for an IS literal. */
function lit(value: number): ValueNode {
  return { verb: VerbType.IS, value };
}

/** Shorthand for a VARY_BY SKILL_LEVEL node. */
function varyBySkillLevel(values: number[]): ValueNode {
  return { verb: VerbType.VARY_BY, object: NounType.SKILL_LEVEL, value: values };
}

/** Shorthand for a VARY_BY POTENTIAL node. */
function varyByPotential(values: number[]): ValueNode {
  return { verb: VerbType.VARY_BY, object: NounType.POTENTIAL, value: values };
}

/** Shorthand for a ValueStatus (STACKS of STATUS). */
function statusStacks(): ValueNode {
  return {
    verb: VerbType.IS,
    object: NounType.STACKS,
    of: { object: NounType.STATUS, objectId: 'TEST_STATUS' },
  } as ValueNode;
}

/** Shorthand for a binary expression. */
function expr(op: ValueOperation, left: ValueNode, right: ValueNode): ValueExpression {
  return { operation: op, left, right };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('collapseConstantExpressions', () => {
  // ── Leaf pass-through ────────────────────────────────────────────────────

  test('IS literal passes through unchanged', () => {
    const node = lit(42);
    const result = collapseConstantExpressions(node);
    expect(result).toBe(node); // same reference — no allocation
    expect(result).toEqual({ verb: VerbType.IS, value: 42 });
  });

  test('VARY_BY SKILL_LEVEL passes through unchanged', () => {
    const node = varyBySkillLevel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const result = collapseConstantExpressions(node);
    expect(result).toBe(node);
  });

  test('VARY_BY POTENTIAL passes through unchanged', () => {
    const node = varyByPotential([0, 1, 2, 3, 4, 5]);
    const result = collapseConstantExpressions(node);
    expect(result).toBe(node);
  });

  test('VARY_BY STATUS (runtime-dependent) passes through unchanged', () => {
    const node: ValueNode = { verb: VerbType.VARY_BY, object: NounType.STATUS, value: [0, 1, 2, 3] };
    const result = collapseConstantExpressions(node);
    expect(result).toBe(node);
  });

  test('ValueStatus (STACKS of STATUS) passes through unchanged', () => {
    const node = statusStacks();
    const result = collapseConstantExpressions(node);
    expect(result).toBe(node);
  });

  test('null/undefined input passes through', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(collapseConstantExpressions(null as any)).toBeNull();
  });

  // ── Expression collapse (both operands are IS literals) ──────────────────

  test('MULT: IS 5 * IS 3 collapses to IS 15', () => {
    const node = expr(ValueOperation.MULT, lit(5), lit(3));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(15));
  });

  test('ADD: IS 10 + IS 7 collapses to IS 17', () => {
    const node = expr(ValueOperation.ADD, lit(10), lit(7));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(17));
  });

  test('SUB: IS 10 - IS 3 collapses to IS 7', () => {
    const node = expr(ValueOperation.SUB, lit(10), lit(3));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(7));
  });

  test('INTEGER_DIV: IS 7 / IS 2 collapses to IS 3 (floored)', () => {
    const node = expr(ValueOperation.INTEGER_DIV, lit(7), lit(2));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(3));
  });

  test('INTEGER_DIV by zero collapses to IS 0', () => {
    const node = expr(ValueOperation.INTEGER_DIV, lit(7), lit(0));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(0));
  });

  test('MIN: IS 3 MIN IS 7 collapses to IS 3', () => {
    const node = expr(ValueOperation.MIN, lit(3), lit(7));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(3));
  });

  test('MAX: IS 3 MAX IS 7 collapses to IS 7', () => {
    const node = expr(ValueOperation.MAX, lit(3), lit(7));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(7));
  });

  // ── Zero and negative values ─────────────────────────────────────────────

  test('zero values handled: IS 0 * IS 5 collapses to IS 0', () => {
    const node = expr(ValueOperation.MULT, lit(0), lit(5));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(0));
  });

  test('negative values handled: IS -3 + IS 8 collapses to IS 5', () => {
    const node = expr(ValueOperation.ADD, lit(-3), lit(8));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(5));
  });

  test('negative result: IS 3 - IS 10 collapses to IS -7', () => {
    const node = expr(ValueOperation.SUB, lit(3), lit(10));
    const result = collapseConstantExpressions(node);
    expect(result).toEqual(lit(-7));
  });

  // ── Nested expression collapse ───────────────────────────────────────────

  test('nested: (IS 2 * IS 3) + IS 4 collapses to IS 10', () => {
    const inner = expr(ValueOperation.MULT, lit(2), lit(3));
    const outer = expr(ValueOperation.ADD, inner, lit(4));
    const result = collapseConstantExpressions(outer);
    expect(result).toEqual(lit(10));
  });

  test('deeply nested: ((IS 2 + IS 3) * IS 4) - IS 1 collapses to IS 19', () => {
    const add = expr(ValueOperation.ADD, lit(2), lit(3));
    const mult = expr(ValueOperation.MULT, add, lit(4));
    const sub = expr(ValueOperation.SUB, mult, lit(1));
    const result = collapseConstantExpressions(sub);
    expect(result).toEqual(lit(19));
  });

  // ── Non-collapsible (mixed constant + runtime) ──────────────────────────

  test('expression with one IS literal and one VARY_BY stays as expression', () => {
    const node = expr(ValueOperation.MULT, lit(5), varyBySkillLevel([1, 2, 3]));
    const result = collapseConstantExpressions(node);
    // Should remain an expression (not collapsed to a literal)
    expect('operation' in result).toBe(true);
    expect((result as ValueExpression).operation).toBe(ValueOperation.MULT);
  });

  test('expression with runtime STATUS stacks operand stays uncollapsed', () => {
    const node = expr(ValueOperation.MULT, lit(10), statusStacks());
    const result = collapseConstantExpressions(node);
    expect('operation' in result).toBe(true);
  });

  test('nested: collapsible sub-expression collapses but outer stays if one operand is VARY_BY', () => {
    // (IS 2 * IS 3) + VARY_BY → IS 6 + VARY_BY (inner collapses, outer stays)
    const inner = expr(ValueOperation.MULT, lit(2), lit(3));
    const outer = expr(ValueOperation.ADD, inner, varyBySkillLevel([1, 2, 3]));
    const result = collapseConstantExpressions(outer);
    expect('operation' in result).toBe(true);
    const resultExpr = result as ValueExpression;
    // The left child should be collapsed to IS 6
    expect(resultExpr.left).toEqual(lit(6));
    // The right child stays as VARY_BY
    expect('verb' in resultExpr.right).toBe(true);
    expect((resultExpr.right as { verb: string }).verb).toBe(VerbType.VARY_BY);
  });
});
