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
import { AdjectiveType, NounType } from '../../dsl/semantics';
import { PhysicalStatusType } from '../../consts/enums';
import {
  INFLICTION_COLUMNS,
  PHYSICAL_STATUS_COLUMN_IDS,
  REACTION_COLUMNS,
  ELEMENT_TO_INFLICTION_COLUMN,
} from '../../model/channels';

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
      return qualifier ? ELEMENT_TO_INFLICTION_COLUMN[qualifier] : undefined;
    }
    if (objectId === NounType.REACTION) {
      return qualifier ? (REACTION_COLUMNS as Record<string, string>)[qualifier] : undefined;
    }
    if (objectId === AdjectiveType.PHYSICAL) {
      return qualifier && PHYSICAL_STATUS_VALUES.has(qualifier) ? qualifier : undefined;
    }
    return objectId;
  }

  // Legacy direct INFLICTION form
  if (object === NounType.INFLICTION) {
    return qualifier ? ELEMENT_TO_INFLICTION_COLUMN[qualifier] : undefined;
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
  // Direct INFLICTION form
  if (object === NounType.INFLICTION) {
    if (qualifier === AdjectiveType.ARTS) return Object.values(INFLICTION_COLUMNS);
    if (qualifier) { const c = ELEMENT_TO_INFLICTION_COLUMN[qualifier]; return c ? [c] : []; }
    return Object.values(INFLICTION_COLUMNS);
  }
  if (object !== NounType.STATUS || !objectId) return [];

  if (objectId === NounType.INFLICTION) {
    if (qualifier === AdjectiveType.ARTS) return Object.values(INFLICTION_COLUMNS);
    if (qualifier) { const c = ELEMENT_TO_INFLICTION_COLUMN[qualifier]; return c ? [c] : []; }
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

  return [objectId];
}
