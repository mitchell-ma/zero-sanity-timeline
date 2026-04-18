/**
 * Unified column-ID resolution for effects, conditions, and trigger index.
 *
 * Three sites used to have their own resolvers:
 *  - `eventInterpretorController.ts:resolveEffectColumnId` (single column)
 *  - `conditionEvaluator.ts:resolveColumnIds` (multi — qualifier can expand)
 *  - `triggerIndex.ts:ELEMENT_TO_INFLICTION` (element → infliction column map)
 *
 * All three now import from here. The single-column helper is used when the
 * caller needs "which column does this effect apply to?"; the multi-column
 * helper is used when the caller needs "which columns should I scan for
 * matching events?" — the latter expands `INFLICTION` (no qualifier) to
 * every element column, `REACTION` to every reaction column, etc.
 */
import { AdjectiveType, NounType, flattenQualifiedId } from '../../dsl/semantics';
import { PhysicalStatusType } from '../../consts/enums';
import type { TimelineEvent } from '../../consts/viewTypes';
import {
  INFLICTION_COLUMNS,
  PHYSICAL_STATUS_COLUMN_IDS,
  PHYSICAL_INFLICTION_COLUMN_IDS,
  REACTION_COLUMNS,
  ELEMENT_TO_INFLICTION_COLUMN,
} from '../../model/channels';
import { getStatusById } from '../gameDataStore';

// Re-export so every consumer pulls the mapping through `columnResolution`
// rather than reaching into the model/channels layer directly.
export { ELEMENT_TO_INFLICTION_COLUMN };

/**
 * Reverse of `ELEMENT_TO_INFLICTION_COLUMN` — column id → element/qualifier.
 * Used by combo trigger source duplication to reconstruct an `APPLY
 * INFLICTION qualifier=<element>` synthetic effect from a runtime
 * `comboTriggerColumnId` (e.g. `HEAT_INFLICTION` → `HEAT`).
 */
export const INFLICTION_COLUMN_TO_ELEMENT: Record<string, string> = Object.fromEntries(
  Object.entries(ELEMENT_TO_INFLICTION_COLUMN).map(([element, columnId]) => [columnId, element]),
);

export const PHYSICAL_STATUS_VALUES = new Set<string>(Object.values(PhysicalStatusType));

/**
 * For STATUS objectIds that get flattened-at-write-time to a qualified
 * column (e.g. `object=STATUS, objectId=SUSCEPTIBILITY, objectQualifier=PHYSICAL`
 * → `PHYSICAL_SUSCEPTIBILITY`), return the flattened ID if a status def
 * exists for it; otherwise return `undefined`.
 *
 * The canonical DSL authoring form is the struct
 * `{objectId: SUSCEPTIBILITY, objectQualifier: PHYSICAL}`. Events carry
 * the struct on `dslObjectId` / `dslObjectQualifier`, which is the fast
 * path for struct-based queries. This helper powers the columnId fallback
 * for legacy paths (freeform-placed events whose synthetic APPLY uses the
 * flat columnId, static column builders that address qualified columns by
 * their full id) so conditions referencing the struct form still find
 * events keyed by the flat column id.
 *
 * INFLICTION / REACTION / PHYSICAL are excluded — they have dedicated
 * expansion paths in `resolveColumnId(s)` above.
 */
function tryFlattenQualifiedStatusId(objectId: string, qualifier: string): string | undefined {
  if (objectId === NounType.INFLICTION
      || objectId === NounType.REACTION
      || objectId === AdjectiveType.PHYSICAL) {
    return undefined;
  }
  const flattened = flattenQualifiedId(qualifier, objectId);
  return getStatusById(flattened) ? flattened : undefined;
}

/**
 * Resolve a single column ID from `object + objectId + objectQualifier`.
 * Used by effect dispatch (doApply, doConsume, etc.) where there is exactly
 * one target column. Returns `undefined` when the effect doesn't map to a
 * known column.
 *
 * Handles both canonical grammar (`object=STATUS, objectId=<category>`) and
 * legacy direct form (`object=INFLICTION`).
 */
export function resolveColumnId(
  object?: string,
  objectId?: string,
  objectQualifier?: string,
): string | undefined {
  const qualifier = objectQualifier;

  // Canonical: object=STATUS, objectId is the category
  if (object === NounType.STATUS && objectId) {
    if (objectId === NounType.INFLICTION) {
      if (!qualifier) return undefined;
      const el = ELEMENT_TO_INFLICTION_COLUMN[qualifier];
      if (el) return el;
      // Physical inflictions (VULNERABLE) are valid `INFLICTION <qualifier>` too
      if (PHYSICAL_INFLICTION_COLUMN_IDS.has(qualifier)) return qualifier;
      return undefined;
    }
    if (objectId === NounType.REACTION) {
      return qualifier ? (REACTION_COLUMNS as Record<string, string>)[qualifier] : undefined;
    }
    if (objectId === AdjectiveType.PHYSICAL) {
      return qualifier && PHYSICAL_STATUS_VALUES.has(qualifier) ? qualifier : undefined;
    }
    return objectId;
  }

  return objectId;
}

/**
 * Resolve a list of column IDs matching an (object, objectId?, qualifier?)
 * triple. Used by condition evaluators and trigger-matching code that want
 * to scan across every matching column (e.g. "ANY infliction" → all four
 * element columns).
 */
export function resolveColumnIds(
  object: string,
  objectId?: string,
  qualifier?: string,
): string[] {
  if (object !== NounType.STATUS || !objectId) return [];

  if (objectId === NounType.INFLICTION) {
    if (qualifier === AdjectiveType.ARTS) return Object.values(INFLICTION_COLUMNS);
    if (qualifier) {
      const c = ELEMENT_TO_INFLICTION_COLUMN[qualifier];
      if (c) return [c];
      if (PHYSICAL_INFLICTION_COLUMN_IDS.has(qualifier)) return [qualifier];
      return [];
    }
    return Object.values(INFLICTION_COLUMNS);
  }
  if (objectId === NounType.REACTION) {
    if (qualifier) { const c = (REACTION_COLUMNS as Record<string, string>)[qualifier]; return c ? [c] : []; }
    return Object.values(REACTION_COLUMNS);
  }
  if (objectId === AdjectiveType.PHYSICAL) {
    if (qualifier) return [qualifier];
    return Array.from(PHYSICAL_STATUS_COLUMN_IDS);
  }

  // Qualified fallback: a struct `(SUSCEPTIBILITY, PHYSICAL)` maps to the
  // flattened column `PHYSICAL_SUSCEPTIBILITY` when a status def exists.
  // Used by the columnId path in `eventMatchesStatusPredicate` for
  // freeform-placed events whose `columnId` is the flat qualified id.
  if (qualifier) {
    const flattened = tryFlattenQualifiedStatusId(objectId, qualifier);
    if (flattened) return [flattened];
  }

  return [objectId];
}

/**
 * Inverse of `resolveColumnIds` — given a concrete column id, return every
 * DSL category label (`STATUS`, `INFLICTION`, `REACTION`, `PHYSICAL`) under
 * which trigger predicates can target it. Used by `TriggerIndex.matchEvent`
 * to let a `APPLY STATUS INFLICTION VULNERABLE` trigger match an event on
 * column `VULNERABLE`. Keep this function in lockstep with `resolveColumnIds`
 * — the two are bidirectional: every (category, qualifier) pair that
 * `resolveColumnIds` maps to a set of columns must report that category
 * back here for each column it produced.
 */
export function resolveColumnCategories(columnId: string): string[] {
  const categories: string[] = [];
  const reactionColumns: Set<string> = new Set(Object.values(REACTION_COLUMNS));
  const inflictionColumns: Set<string> = new Set(Object.values(INFLICTION_COLUMNS));
  if (reactionColumns.has(columnId)) categories.push(NounType.REACTION);
  if (inflictionColumns.has(columnId)) categories.push(NounType.INFLICTION);
  if (PHYSICAL_INFLICTION_COLUMN_IDS.has(columnId)) {
    // Physical inflictions (VULNERABLE) match both STATUS and INFLICTION
    // category triggers (`APPLY STATUS INFLICTION VULNERABLE`).
    categories.push(NounType.STATUS);
    categories.push(NounType.INFLICTION);
  } else if (PHYSICAL_STATUS_COLUMN_IDS.has(columnId)) {
    categories.push(NounType.STATUS);
    // `APPLY STATUS PHYSICAL CRUSH`-style triggers reference the PHYSICAL
    // category; include it so the resolver produces both forms.
    categories.push(AdjectiveType.PHYSICAL);
  } else if (!reactionColumns.has(columnId) && !inflictionColumns.has(columnId)) {
    categories.push(NounType.STATUS);
  }
  return categories;
}

// ────────────────────────────────────────────────────────────────────────────
// Event-vs-predicate matching
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compare a timeline event against a `{object, objectId, objectQualifier}`
 * DSL predicate. Matches if EITHER the struct matches OR the columnId
 * matches (union, not exclusive).
 *
 * **Struct path:** events created by `doApply`'s status write carry their
 * original DSL triple as `dslObjectId` / `dslObjectQualifier`. Effects
 * authored in JSON as `{object: STATUS, objectId: SUSCEPTIBILITY,
 * objectQualifier: PHYSICAL}` persist that exact shape on the event.
 * Conditions with the same shape compare by struct.
 *
 * **ColumnId path:** legacy effects and synthetic freeform applies flatten
 * the qualifier into the objectId (e.g. columnBuilder emits
 * `{objectId: 'NATURE_INFLICTION'}` with no qualifier). The condition
 * form `HAVE STATUS INFLICTION NATURE` must still match — so after the
 * struct check, we also try `resolveColumnIds` + `columnId` equality,
 * which handles INFLICTION/ARTS umbrella expansion, REACTION wildcards,
 * and PHYSICAL status expansion.
 *
 * Matching either way is sound: the struct form and the flat columnId
 * form both refer to the same underlying event. Returning true for
 * either match means the query finds the event regardless of which
 * authoring form produced it.
 *
 * Single authority for "does this event match this predicate" — add new
 * special cases here, not at call sites.
 */
export function eventMatchesStatusPredicate(
  event: TimelineEvent,
  predObject: string,
  predObjectId: string | undefined,
  predObjectQualifier: string | undefined,
): boolean {
  // Struct path: match if the event's DSL triple matches the predicate.
  if (event.dslObjectId != null
      && predObjectId != null
      && event.dslObjectId === predObjectId) {
    // Qualifier: predicate's qualifier must match (or be absent for wildcard).
    if (predObjectQualifier == null || event.dslObjectQualifier === predObjectQualifier) {
      return true;
    }
  }
  // ColumnId path: match if the event's columnId is in the predicate's
  // resolved column set. Handles umbrella expansions via `resolveColumnIds`.
  const columnIds = resolveColumnIds(predObject, predObjectId, predObjectQualifier);
  return columnIds.includes(event.columnId);
}
