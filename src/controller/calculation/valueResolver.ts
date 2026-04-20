/**
 * Recursive value expression resolver.
 *
 * Evaluates ValueNode trees against a resolution context (operator stats, skill level, potential).
 * All dependencies are static loadout values — no runtime state.
 */
import {
  NounType, VerbType, ValueNode, ValueOperation, DeterminerType, AdjectiveType,
  isValueLiteral, isValueVariable, isValueStat, isValueStatus, isValueIdentity, isValueExpression,
  isQualifiedId,
} from '../../dsl/semantics';
import type { ValueVariable as ValueVariableType, ValueStat as ValueStatType, ValueIdentity as ValueIdentityType } from '../../dsl/semantics';
import type { TimelineEvent } from '../../consts/viewTypes';
import { ElementType, StatusType } from '../../consts/enums';
import {
  ENEMY_ID, REACTION_COLUMNS, ELEMENT_TO_INFLICTION_COLUMN, PHYSICAL_INFLICTION_COLUMN_IDS,
} from '../../model/channels';
import type { LoadoutProperties } from '../../view/InformationPane';

/** Mirror of `resolveColumnId` in controller/timeline/columnResolution for the
 *  STATUS branch. Inlined to avoid a cycle (columnResolution → gameDataStore →
 *  operatorStatusesStore → valueResolver). Keep in sync with that module's STATUS path. */
function resolveStatusColumnId(objectId?: string, qualifier?: string): string | undefined {
  if (!objectId) return undefined;
  if (objectId === NounType.INFLICTION) {
    if (!qualifier) return undefined;
    return ELEMENT_TO_INFLICTION_COLUMN[qualifier]
      ?? (PHYSICAL_INFLICTION_COLUMN_IDS.has(qualifier) ? qualifier : undefined);
  }
  if (objectId === NounType.REACTION) {
    return qualifier ? (REACTION_COLUMNS as Record<string, string>)[qualifier] : undefined;
  }
  return objectId;
}

// ── Resolution context ──────────────────────────────────────────────────────

/**
 * Minimal interface the resolver needs to answer "STACKS of STATUS of ENEMY/OPERATOR" queries.
 * EventsQueryService implements this naturally; lighter callers (e.g. the engine's
 * interpret-time context) can implement it via `countActiveStatusStacks`.
 */
export interface StatusStacksQuery {
  getActiveStatusStacks(frame: number, ownerEntityId: string, statusId: string): number;
  /** Max `statusLevel` across active matching events — used for STATUS_LEVEL ValueStatus reads. */
  getActiveStatusLevel?(frame: number, ownerEntityId: string, statusId: string): number;
  /** Per-element susceptibility query — handles generic SUSCEPTIBILITY events carrying per-element values. Optional. */
  getActiveSusceptibilityStacks?(frame: number, element: ElementType): number;
}

/** Static loadout context for resolving variable lookups. */
export interface ValueResolutionContext {
  skillLevel: number;
  potential: number;
  /** Talent level for the current event's talent slot (resolved from operator's talent key-map). */
  talentLevel?: number;
  /** Weapon skill rank (1–9) for the current weapon-skill clause — used by
   *  `VARY_BY RANK of THIS WEAPON`. Defaults to 9 (max) when unset so
   *  passive-stat paths that bypass this context keep resolving to the max
   *  rank entry, matching pre-migration behavior. */
  weaponSkillRank?: number;
  /** Aggregated operator stats keyed by StatType string. */
  stats: Partial<Record<string, number>>;
  /** Context for the SOURCE operator (talent owner), when different from the current operator. */
  sourceContext?: ValueResolutionContext;
  /** User-supplied parameter values (e.g. { ENEMY_HIT: 2 }) for VARY_BY resolution. */
  suppliedParameters?: Record<string, number>;
  /** Runtime query authority for active-stack lookups (0 if unset). */
  statusQuery?: StatusStacksQuery;
  /** Frame at which status queries resolve. */
  frame?: number;
  /** Entity ID for OPERATOR-side status queries (ENEMY-side resolves to ENEMY_ID via the of-chain). */
  ownerEntityId?: string;
  /** Runtime query: consumed stack count for a status on the current event (e.g. LINK consumed by ult). */
  getEventStacks?: (statusId: string) => number;
  /** Runtime: number of stacks consumed by the triggering CONSUME effect (for STACKS of STATUS CONSUMED). */
  consumedStacks?: number;
  /** Per-event snapshot map (column id → shallow copies of active status events).
   *  Populated by the SNAPSHOT effect verb and threaded into the value context so
   *  queries with `objectQualifier: SNAPSHOT` on the outer ValueStatus node reduce
   *  over the captured event list (max statusLevel / sum stacks). */
  snapshotMap?: Record<string, TimelineEvent[]>;
}

/** Default context when no loadout is available (uses max skill level, no potential). */
export const DEFAULT_VALUE_CONTEXT: ValueResolutionContext = {
  skillLevel: 12,
  potential: 0,
  stats: {},
};

/** Walk the of-chain and return the first determiner found. Used for
 *  resolving SOURCE vs THIS when the determiner is nested (e.g. `of WEAPON of
 *  SOURCE OPERATOR`). */
function ofChainDeterminer(of: { determiner?: string; of?: unknown } | undefined): string | undefined {
  let cur = of;
  while (cur) {
    if (cur.determiner) return cur.determiner;
    cur = cur.of as { determiner?: string; of?: unknown } | undefined;
  }
  return undefined;
}

// ── Variable index resolution ───────────────────────────────────────────────

/**
 * Map variable object names to the 0-based array index for lookup.
 * SKILL_LEVEL is 1-indexed (1–12 → array[0–11]).
 * POTENTIAL and TALENT levels are 0-indexed (0–5 → array[0–5]).
 */
function getVariableArrayIndex(object: string, ctx: ValueResolutionContext, objectId?: string): number | undefined {
  switch (object) {
    case NounType.SKILL_LEVEL:  return ctx.skillLevel - 1;
    case NounType.RANK:         return (ctx.weaponSkillRank ?? 9) - 1;
    case NounType.POTENTIAL:   return ctx.potential;
    case NounType.TALENT_LEVEL: return ctx.talentLevel ?? 0;
    default: {
      // VARY_BY STATUS <objectId>: active stack count of the status on the resolved operator
      if (object === NounType.STATUS && objectId
          && ctx.statusQuery && ctx.frame != null && ctx.ownerEntityId) {
        return ctx.statusQuery.getActiveStatusStacks(ctx.frame, ctx.ownerEntityId, objectId);
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
    // Resolve against SOURCE context when any determiner in the of-chain is
    // SOURCE (e.g. `RANK of WEAPON of SOURCE OPERATOR` reaches SOURCE through
    // the nested operator clause, not directly on WEAPON).
    const resolveCtx = ofChainDeterminer((node as ValueVariableType).of) === DeterminerType.SOURCE && ctx.sourceContext
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

  if (isValueIdentity(node)) {
    const idNode = node as ValueIdentityType;
    // Identity check between entity references. Currently the resolver only tracks
    // a distinction between THIS (main ctx) and SOURCE (sourceContext). sourceContext
    // is only populated when the source slot differs from the owner slot — so its
    // presence is a reliable proxy for "THIS !== SOURCE".
    const subj = idNode.subjectDeterminer;
    const obj = idNode.objectDeterminer;
    if (subj === obj) return 1;
    const isThisSourcePair =
      (subj === DeterminerType.THIS && obj === DeterminerType.SOURCE) ||
      (subj === DeterminerType.SOURCE && obj === DeterminerType.THIS);
    if (isThisSourcePair) return ctx.sourceContext ? 0 : 1;
    return 0;
  }

  if (isValueStatus(node)) {
    const outerQualifier = (node as { objectQualifier?: string }).objectQualifier;
    const ofClause = node.of;
    if (!ofClause) {
      // CONSUMED STACKS with no `of` chain → stacks consumed by the triggering CONSUME effect.
      if (outerQualifier === AdjectiveType.CONSUMED && ctx.consumedStacks != null) {
        return ctx.consumedStacks;
      }
      return 0;
    }
    // DSL grammar uses objectQualifier + objectId (e.g. ELECTRIC + SUSCEPTIBILITY).
    // The storage column ID is the composed form (ELECTRIC_SUSCEPTIBILITY).
    const qualifier = (ofClause as { objectQualifier?: string }).objectQualifier;
    const statusId = ofClause.objectId && qualifier
      ? `${qualifier}_${ofClause.objectId}`
      : ofClause.objectId;
    if (!statusId) return 0;
    // SNAPSHOT qualifier on the outer node → read from the parent event's snapshot map
    // (populated by SNAPSHOT effect verb). Reduce the captured TimelineEvent[] to the
    // requested property: max(statusLevel) or sum(stacks). Keyed by the resolved column
    // id so both legacy (`objectId: ELECTRIFICATION`) and canonical (`objectId: REACTION,
    // objectQualifier: ELECTRIFICATION`) forms agree on lookup.
    if (outerQualifier === AdjectiveType.SNAPSHOT) {
      const snapKey = resolveStatusColumnId(ofClause.objectId, qualifier) ?? statusId;
      const snap = ctx.snapshotMap?.[snapKey];
      if (snap && snap.length > 0) {
        if (node.object === NounType.STATUS_LEVEL) {
          let maxLevel = 0;
          for (const ev of snap) {
            const lvl = ev.statusLevel ?? 0;
            if (lvl > maxLevel) maxLevel = lvl;
          }
          return maxLevel;
        }
        let total = 0;
        for (const ev of snap) total += ev.stacks ?? 1;
        return total;
      }
      return 0;
    }
    // STACKS of <STATUS> of EVENT → consumed stacks on the current event
    if (ofClause.object === NounType.EVENT && ctx.getEventStacks) {
      return ctx.getEventStacks(statusId);
    }
    // All other paths go through the unified statusQuery.
    if (!ctx.statusQuery || ctx.frame == null) return 0;
    const owner = ofClause.of?.object === NounType.ENEMY ? ENEMY_ID : ctx.ownerEntityId;
    if (!owner) return 0;
    // REACTION columns drop the suffix (e.g. ELECTRIFICATION_REACTION → ELECTRIFICATION),
    // so the hand-rolled `${qualifier}_${objectId}` mis-keys the lookup. Re-resolve to the
    // actual column id for the REACTION case; INFLICTION / SUSCEPTIBILITY are already correct.
    const queryStatusId = ofClause.objectId === NounType.REACTION
      ? (resolveStatusColumnId(ofClause.objectId, qualifier) ?? statusId)
      : statusId;
    // Susceptibility is a specialization: generic SUSCEPTIBILITY events can carry
    // per-element values, so the query expands qualified ids to element lookups.
    if (owner === ENEMY_ID
        && ctx.statusQuery.getActiveSusceptibilityStacks
        && isQualifiedId(queryStatusId, StatusType.SUSCEPTIBILITY)) {
      const element = queryStatusId.slice(0, -(StatusType.SUSCEPTIBILITY.length + 1)) as ElementType;
      return ctx.statusQuery.getActiveSusceptibilityStacks(ctx.frame, element);
    }
    if (node.object === NounType.STATUS_LEVEL) {
      return ctx.statusQuery.getActiveStatusLevel?.(ctx.frame, owner, queryStatusId) ?? 0;
    }
    return ctx.statusQuery.getActiveStatusStacks(ctx.frame, owner, queryStatusId);
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

// ── Parse-time constant collapse ────────────────────────────────────────────

/**
 * Collapse constant sub-expressions at parse time.
 *
 * - IS literals → returned as-is (already constant).
 * - VARY_BY (level-dependent) → returned as-is.
 * - STAT / STATUS → returned as-is (runtime-dependent).
 * - Expression: recursively collapse children. If both resolve to IS literals,
 *   compute the result and return a new IS literal.
 *
 * This eliminates runtime recursion for expressions composed entirely of
 * IS-literal operands (the most common case in JSON configs).
 */
export function collapseConstantExpressions(node: ValueNode): ValueNode {
  if (node == null) return node;

  // Leaf nodes — return unchanged
  if (isValueLiteral(node)) return node;
  if (isValueVariable(node)) return node;
  if (isValueStat(node)) return node;
  if (isValueStatus(node)) return node;
  if (isValueIdentity(node)) return node;

  // Expression: recurse into children, then try to collapse
  if (isValueExpression(node)) {
    const left = collapseConstantExpressions(node.left);
    const right = collapseConstantExpressions(node.right);

    // Both children are IS literals → compute at parse time
    if (isValueLiteral(left) && isValueLiteral(right)) {
      let result: number;
      switch (node.operation) {
        case ValueOperation.MULT:        result = left.value * right.value; break;
        case ValueOperation.ADD:         result = left.value + right.value; break;
        case ValueOperation.SUB:         result = left.value - right.value; break;
        case ValueOperation.INTEGER_DIV: result = right.value !== 0 ? Math.floor(left.value / right.value) : 0; break;
        case ValueOperation.MIN:         result = Math.min(left.value, right.value); break;
        case ValueOperation.MAX:         result = Math.max(left.value, right.value); break;
        default:                         result = 0;
      }
      return { verb: VerbType.IS, value: result };
    }

    // At least one child was non-constant — return expression with collapsed children
    if (left !== node.left || right !== node.right) {
      return { ...node, left, right };
    }
  }

  return node;
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
  if (!props || !props.skills || !props.operator) {
    return { ...DEFAULT_VALUE_CONTEXT, stats: stats ?? {} };
  }
  const levelKey = SKILL_COLUMN_LEVEL_KEY[skillColumn];
  return {
    skillLevel: levelKey ? props.skills[levelKey] : DEFAULT_VALUE_CONTEXT.skillLevel,
    potential: props.operator.potential,
    talentLevel: talentSlot === 'two' ? props.operator.talentTwoLevel : props.operator.talentOneLevel,
    stats: stats ?? {},
  };
}
