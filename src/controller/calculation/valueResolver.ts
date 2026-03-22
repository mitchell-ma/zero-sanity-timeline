/**
 * Recursive value expression resolver.
 *
 * Evaluates ValueNode trees against a resolution context (operator stats, skill level, potential).
 * All dependencies are static loadout values — no runtime state.
 */
import {
  ValueNode, ValueOperator,
  isValueLiteral, isValueVariable, isValueStat, isValueExpression,
} from '../../dsl/semantics';

// ── Resolution context ──────────────────────────────────────────────────────

/** Static loadout context for resolving variable lookups. */
export interface ValueResolutionContext {
  skillLevel: number;
  potential: number;
  talentOneLevel?: number;
  talentTwoLevel?: number;
  /** Aggregated operator stats keyed by StatType string. */
  stats: Partial<Record<string, number>>;
}

/** Default context when no loadout is available (uses max skill level, no potential). */
export const DEFAULT_VALUE_CONTEXT: ValueResolutionContext = {
  skillLevel: 12,
  potential: 0,
  stats: {},
};

// ── Variable index resolution ───────────────────────────────────────────────

/**
 * Map variable object names to the 0-based array index for lookup.
 * SKILL_LEVEL is 1-indexed (1–12 → array[0–11]).
 * POTENTIAL and TALENT levels are 0-indexed (0–5 → array[0–5]).
 */
function getVariableArrayIndex(object: string, ctx: ValueResolutionContext): number | undefined {
  switch (object) {
    case 'SKILL_LEVEL':       return ctx.skillLevel - 1;
    case 'POTENTIAL':         return ctx.potential;
    case 'TALENT_LEVEL':
    case 'TALENT_ONE_LEVEL':  return ctx.talentOneLevel ?? 0;
    case 'TALENT_TWO_LEVEL':  return ctx.talentTwoLevel ?? 0;
    default:                  return undefined;
  }
}

// ── Core resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a ValueNode to a number.
 *
 * - ValueLiteral: returns the literal value.
 * - ValueVariable with value array: indexes by the dependency.
 * - ValueVariable without value array: raw stat lookup.
 * - ValueExpression: recursively resolves left and right, applies operator.
 */
export function resolveValueNode(node: ValueNode, ctx: ValueResolutionContext): number {
  if (isValueLiteral(node)) {
    return node.value;
  }

  if (isValueVariable(node)) {
    // Array lookup: index by dependency
    if (Array.isArray(node.value)) {
      const index = getVariableArrayIndex(node.object, ctx);
      if (index != null) {
        const clamped = Math.max(0, Math.min(index, node.value.length - 1));
        return node.value[clamped] ?? node.value[0] ?? 0;
      }
      // Unknown dependency with array — return first value as fallback
      return node.value[0] ?? 0;
    }
    // Single number (some VARY_BY entries have a single number)
    if (typeof node.value === 'number') {
      return node.value;
    }
    return 0;
  }

  if (isValueStat(node)) {
    return ctx.stats[node.objectId] ?? 0;
  }

  if (isValueExpression(node)) {
    const left = resolveValueNode(node.left, ctx);
    const right = resolveValueNode(node.right, ctx);

    switch (node.operator) {
      case ValueOperator.MULT:        return left * right;
      case ValueOperator.ADD:         return left + right;
      case ValueOperator.SUB:         return left - right;
      case ValueOperator.INTEGER_DIV: return right !== 0 ? Math.floor(left / right) : 0;
      case ValueOperator.MIN:         return Math.min(left, right);
      case ValueOperator.MAX:         return Math.max(left, right);
    }
  }

  return 0;
}

// ── Convenience helpers ─────────────────────────────────────────────────────

/** Resolve a WITH property node, returning undefined if the node is absent. */
export function resolveWithProperty(node: ValueNode | undefined, ctx: ValueResolutionContext): number | undefined {
  if (!node) return undefined;
  return resolveValueNode(node, ctx);
}

/**
 * Extract the raw value from a leaf node without a resolution context.
 * Returns the literal number for IS nodes, the value array or number for VARY_BY nodes.
 * Returns undefined for expression nodes (those require full resolution).
 */
export function getLeafValue(node: ValueNode): number | number[] | undefined {
  if (isValueLiteral(node)) return node.value;
  if (isValueVariable(node)) return node.value;
  return undefined;
}

/**
 * Extract a simple numeric value from a leaf node without resolution context.
 * For IS nodes: returns the literal.
 * For VARY_BY nodes with a number: returns it.
 * For VARY_BY nodes with an array: returns undefined (needs index).
 * For expression nodes: returns undefined (needs full resolution).
 */
export function getSimpleValue(node: ValueNode | undefined): number | undefined {
  if (!node) return undefined;
  if (isValueLiteral(node)) return node.value;
  if (isValueVariable(node) && typeof node.value === 'number') return node.value;
  return undefined;
}
