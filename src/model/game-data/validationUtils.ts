import {
  VerbType, DeterminerType,
  VERB_OBJECTS, OBJECT_QUALIFIERS, OBJECT_REQUIRED_QUALIFIER, OBJECT_TARGET_MAPPING,
  NOUN_QUALIFIER_MAPPING,
} from '../../dsl/semantics';
import type { ObjectType, NounType } from '../../dsl/semantics';
import { OperatorClassType } from '../../consts/enums';

// ── Enum value sets for validation ──────────────────────────────────────────
const VALID_DETERMINERS = new Set<string>(Object.values(DeterminerType));
const VALID_OPERATOR_CLASSES = new Set<string>(Object.values(OperatorClassType));

// ── Shared validation utilities for game-data config loaders ────────────────

/** Report unexpected keys in a config object. */
export function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

// ── Shared valid-key sets ───────────────────────────────────────────────────

export const VALID_VALUE_NODE_KEYS = new Set([
  'verb', 'value', 'object', 'objectId', 'operation', 'left', 'right', 'ofDeterminer', 'of',
]);

export const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);

export const VALID_METADATA_KEYS = new Set(['originId', 'dataSources', 'icon', 'isEnabled']);

export const VALID_EFFECT_KEYS = new Set([
  'verb', 'object', 'objectId', 'objectType', 'objectQualifier', 'objectDeterminer',
  'to', 'toDeterminer', 'toQualifier', 'from', 'fromDeterminer',
  'of', 'until',
  'with', 'value', 'cardinalityConstraint', 'effects', 'negated',
]);

export const VALID_EFFECT_WITH_KEYS = new Set([
  'value', 'duration', 'unit', 'stacks', 'multiplier', 'staggerValue', 'mainStat', 'cardinality',
]);

export const VALID_TRIGGER_CONDITION_KEYS = new Set([
  'subjectDeterminer', 'subject', 'subjectId', 'verb', 'object', 'objectId', 'objectQualifier', 'objectDeterminer',
  'element', 'negated', 'cardinalityConstraint', 'value', 'to', 'toDeterminer', 'from', 'fromDeterminer', 'with',
  'ofSubject', 'ofDeterminer',
]);

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

  // When objectId is present (e.g. object=STATUS, objectId=REACTION), validate qualifier
  // against the objectId's noun qualifier set; otherwise use the object's own qualifiers
  const validQualifiers = ef.objectId
    ? NOUN_QUALIFIER_MAPPING[ef.objectId as NounType]
    : OBJECT_QUALIFIERS[obj as ObjectType];
  if (validQualifiers && ef.objectQualifier) {
    if (!(validQualifiers as string[]).includes(ef.objectQualifier as string)) {
      errors.push(`${path}: ${ef.verb} ${obj} has invalid qualifier "${ef.objectQualifier}"`);
    }
  }

  return errors;
}

/** Validate determiner fields against DeterminerType enum. */
function warnInvalidDeterminers(ef: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  for (const key of ['toDeterminer', 'fromDeterminer', 'objectDeterminer'] as const) {
    if (ef[key] && !VALID_DETERMINERS.has(ef[key] as string)) {
      errors.push(`${path}.${key}: "${ef[key]}" is not a valid DeterminerType`);
    }
  }
  return errors;
}

/** Validate toQualifier against OperatorClassType. */
function warnInvalidToQualifier(ef: Record<string, unknown>, path: string): string[] {
  if (ef.toQualifier && !VALID_OPERATOR_CLASSES.has(ef.toQualifier as string)) {
    return [`${path}.toQualifier: "${ef.toQualifier}" is not a valid OperatorClassType`];
  }
  return [];
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
    ...warnInvalidDeterminers(ef, path),
    ...warnInvalidToQualifier(ef, path),
    ...warnInvalidApplyTarget(ef, path),
    ...warnInvalidConsumeTarget(ef, path),
  ];
}
