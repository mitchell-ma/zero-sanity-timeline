import {
  VerbType,
  VERB_OBJECTS, OBJECT_QUALIFIERS, OBJECT_REQUIRED_QUALIFIER, OBJECT_TARGET_MAPPING,
} from '../../dsl/semantics';
import type { ObjectType } from '../../dsl/semantics';

// ── Shared validation utilities for game-data config loaders ────────────────

/** Report unexpected keys in a config object. */
export function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

// ── Shared valid-key sets (value nodes are reused across all config types) ───

export const VALID_VALUE_NODE_KEYS = new Set([
  'verb', 'value', 'object', 'objectId', 'operator', 'left', 'right', 'ofDeterminer', 'of',
]);

export const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);

export const VALID_METADATA_KEYS = new Set(['originId', 'dataSources', 'icon']);

// ── Effect validation (all checks driven by semantics.ts mappings) ──────────

/** Validate verb+object combination against VERB_OBJECTS. */
function warnInvalidVerbObject(ef: Record<string, unknown>, path: string): string[] {
  const validObjects = VERB_OBJECTS[ef.verb as VerbType];
  if (!validObjects || !ef.object) return [];
  if (!(validObjects as string[]).includes(ef.object as string)) {
    return [`${path}: ${ef.verb} ${ef.object} — invalid verb+object combination`];
  }
  return [];
}

/** Validate objectQualifier against OBJECT_QUALIFIERS; enforce OBJECT_REQUIRED_QUALIFIER. */
function warnInvalidQualifier(ef: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  const obj = ef.object as string;

  if (OBJECT_REQUIRED_QUALIFIER.has(obj) && !ef.objectQualifier && !ef.objectId) {
    errors.push(`${path}: ${ef.verb} ${obj} requires a qualifier (objectQualifier or objectId)`);
  }

  const validQualifiers = OBJECT_QUALIFIERS[obj as ObjectType];
  if (validQualifiers && ef.objectQualifier) {
    const quals = Array.isArray(ef.objectQualifier) ? ef.objectQualifier : [ef.objectQualifier];
    for (const q of quals) {
      if (!(validQualifiers as string[]).includes(q as string)) {
        errors.push(`${path}: ${ef.verb} ${obj} has invalid qualifier "${q}"`);
      }
    }
  }

  return errors;
}

/** Validate APPLY target against OBJECT_TARGET_MAPPING. */
function warnInvalidApplyTarget(ef: Record<string, unknown>, path: string): string[] {
  if (ef.verb !== VerbType.APPLY) return [];
  const validTargets = OBJECT_TARGET_MAPPING[ef.object as ObjectType];
  if (!validTargets) return [];
  if (!ef.to) return [`${path}: APPLY ${ef.object} missing "to" — valid targets: ${validTargets.join(', ')}`];
  if (!(validTargets as string[]).includes(ef.to as string)) {
    return [`${path}: APPLY ${ef.object} has "to": "${ef.to}" — valid targets: ${validTargets.join(', ')}`];
  }
  return [];
}

/** Validate CONSUME target against OBJECT_TARGET_MAPPING. */
function warnInvalidConsumeTarget(ef: Record<string, unknown>, path: string): string[] {
  if (ef.verb !== VerbType.CONSUME) return [];
  const validTargets = OBJECT_TARGET_MAPPING[ef.object as ObjectType];
  if (!validTargets) return [];
  const from = (ef as { from?: string }).from;
  if (!from) {
    return [`${path}: CONSUME ${ef.object} ${ef.objectId ?? ef.objectQualifier ?? ''} missing "from" — valid targets: ${validTargets.join(', ')}`];
  }
  if (!(validTargets as string[]).includes(from)) {
    return [`${path}: CONSUME ${ef.object} has "from": "${from}" — valid targets: ${validTargets.join(', ')}`];
  }
  return [];
}

/**
 * Run all effect validations against DSL semantics mappings.
 * Single entry point — replaces individual warnX calls at each call site.
 */
export function validateEffect(ef: Record<string, unknown>, path: string): string[] {
  return [
    ...warnInvalidVerbObject(ef, path),
    ...warnInvalidQualifier(ef, path),
    ...warnInvalidApplyTarget(ef, path),
    ...warnInvalidConsumeTarget(ef, path),
  ];
}
