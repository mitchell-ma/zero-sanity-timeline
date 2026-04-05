/**
 * Recursive value expression resolver.
 *
 * Evaluates ValueNode trees against a resolution context (operator stats, skill level, potential).
 * All dependencies are static loadout values — no runtime state.
 */
import {
  NounType, ValueNode, ValueOperation, DeterminerType,
  isValueLiteral, isValueVariable, isValueStat, isValueStatus, isValueExpression,
  flattenQualifiedId,
} from '../../dsl/semantics';
import type { ValueVariable as ValueVariableType, ValueStat as ValueStatType } from '../../dsl/semantics';
import type { LoadoutProperties } from '../../view/InformationPane';

// ── Resolution context ──────────────────────────────────────────────────────

/** Static loadout context for resolving variable lookups. */
export interface ValueResolutionContext {
  skillLevel: number;
  potential: number;
  /** Talent level for the current event's talent slot (resolved from operator's talent key-map). */
  talentLevel?: number;
  /** Aggregated operator stats keyed by StatType string. */
  stats: Partial<Record<string, number>>;
  /** Context for the SOURCE operator (talent owner), when different from the current operator. */
  sourceContext?: ValueResolutionContext;
  /** User-supplied parameter values (e.g. { ENEMY_HIT: 2 }) for VARY_BY resolution. */
  suppliedParameters?: Record<string, number>;
  /** Runtime query: active stack count for a status on the resolved operator (0 if not present). */
  getStatusStacks?: (statusId: string) => number;
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
function getVariableArrayIndex(object: string, ctx: ValueResolutionContext, objectId?: string): number | undefined {
  switch (object) {
    case 'SKILL_LEVEL':       return ctx.skillLevel - 1;
    case 'POTENTIAL':         return ctx.potential;
    case 'TALENT_LEVEL':      return ctx.talentLevel ?? 0;
    default: {
      // VARY_BY STATUS <objectId>: active stack count of the status on the resolved operator
      if (object === NounType.STATUS && objectId && ctx.getStatusStacks) {
        return ctx.getStatusStacks(objectId);
      }
      // Check user-supplied parameters (e.g. ENEMY_HIT from VARY_BY)
      const paramValue = ctx.suppliedParameters?.[object];
      if (paramValue != null) return paramValue;
      return undefined;
    }
  }
}

// ── Core resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a ValueNode to a number.
 *
 * - ValueLiteral: returns the literal value.
 * - ValueVariable with value array: indexes by the dependency.
 * - ValueVariable without value array: raw stat lookup.
 * - ValueExpression: recursively resolves left and right, applies operation.
 */
export function resolveValueNode(node: ValueNode, ctx: ValueResolutionContext): number {
  if (isValueLiteral(node)) {
    return node.value;
  }

  if (isValueVariable(node)) {
    // Resolve against SOURCE context when of.determiner is SOURCE
    const resolveCtx = (node as ValueVariableType).of?.determiner === DeterminerType.SOURCE && ctx.sourceContext
      ? ctx.sourceContext : ctx;
    // Array lookup: index by dependency
    if (Array.isArray(node.value)) {
      const varNode = node as ValueVariableType & { objectId?: string };
      const index = getVariableArrayIndex(node.object, resolveCtx, varNode.objectId);
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
    const statNode = node as ValueStatType;
    const statKey = statNode.objectId ?? statNode.stat;
    const resolveCtx = statNode.of?.determiner === DeterminerType.SOURCE && ctx.sourceContext
      ? ctx.sourceContext : ctx;
    return statKey ? (resolveCtx.stats[statKey] ?? 0) : 0;
  }

  if (isValueStatus(node)) {
    const ofClause = node.of;
    if (ofClause && ctx.getStatusStacks) {
      const statusId = ofClause.objectQualifier && ofClause.objectId
        ? flattenQualifiedId(String(ofClause.objectQualifier), ofClause.objectId)
        : ofClause.objectId;
      if (statusId) return ctx.getStatusStacks(statusId);
    }
    return 0;
  }

  if (isValueExpression(node)) {
    const left = resolveValueNode(node.left, ctx);
    const right = resolveValueNode(node.right, ctx);

    switch (node.operation) {
      case ValueOperation.MULT:        return left * right;
      case ValueOperation.ADD:         return left + right;
      case ValueOperation.SUB:         return left - right;
      case ValueOperation.INTEGER_DIV: return right !== 0 ? Math.floor(left / right) : 0;
      case ValueOperation.MIN:         return Math.min(left, right);
      case ValueOperation.MAX:         return Math.max(left, right);
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

// ── Skill column → skill level mapping ──────────────────────────────────────

/** Map skill column ID to the corresponding LoadoutProperties.skills field. */
const SKILL_COLUMN_LEVEL_KEY: Record<string, keyof LoadoutProperties['skills']> = {
  [NounType.BASIC_ATTACK]:    'basicAttackLevel',
  [NounType.BATTLE]:   'battleSkillLevel',
  [NounType.COMBO]:    'comboSkillLevel',
  [NounType.ULTIMATE]: 'ultimateLevel',
};

/** Talent slot key — corresponds to the operator JSON `talents.one` / `talents.two` key-map. */
export type TalentSlot = 'one' | 'two';

/**
 * Build a ValueResolutionContext for a given skill column from loadout properties.
 * Falls back to DEFAULT_VALUE_CONTEXT when props is undefined.
 *
 * @param talentSlot — When resolving a talent/status, pass the talent slot ('one' or 'two')
 *   so `TALENT_LEVEL` resolves to the correct talent level from the operator's loadout.
 */
export function buildContextForSkillColumn(
  props: LoadoutProperties | undefined,
  skillColumn: string,
  stats?: Partial<Record<string, number>>,
  talentSlot?: TalentSlot,
): ValueResolutionContext {
  if (!props) return { ...DEFAULT_VALUE_CONTEXT, stats: stats ?? {} };
  const levelKey = SKILL_COLUMN_LEVEL_KEY[skillColumn];
  return {
    skillLevel: levelKey ? props.skills[levelKey] : DEFAULT_VALUE_CONTEXT.skillLevel,
    potential: props.operator.potential,
    talentLevel: talentSlot === 'two' ? props.operator.talentTwoLevel : props.operator.talentOneLevel,
    stats: stats ?? {},
  };
}
