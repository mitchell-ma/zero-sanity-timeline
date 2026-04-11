import {
  AdjectiveType, NounType, VerbType, DeterminerType,
  VERB_OBJECTS, OBJECT_QUALIFIERS, OBJECT_REQUIRED_QUALIFIER, OBJECT_TARGET_MAPPING,
  CONSUME_TARGET_MAPPING, OBJECT_QUALIFIER_MAPPING,
} from '../../dsl/semantics';
import type { ObjectType } from '../../dsl/semantics';
import { ArtsReactionType, ElementType, OperatorClassType, SegmentType } from '../../consts/enums';

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
  'verb', 'value', 'object', 'objectId', 'objectQualifier', 'operation', 'left', 'right', 'of', 'unit',
]);

export const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);

export const VALID_METADATA_KEYS = new Set(['originId', 'dataSources', 'icon', 'isEnabled', 'dataStatus']);

export const VALID_EFFECT_KEYS = new Set([
  'verb', 'object', 'objectId', 'objectType', 'objectQualifier', 'objectDeterminer',
  'to', 'toDeterminer', 'toQualifier', 'from', 'fromDeterminer',
  'of', 'until',
  'with', 'value', 'cardinalityConstraint', 'effects', 'negated',
]);

export const VALID_EFFECT_WITH_KEYS = new Set([
  'value', 'duration', 'unit', 'stacks', 'multiplier', 'stagger', 'mainStat', 'cardinality',
  'segments', 'isForced',
]);

export const VALID_TRIGGER_CONDITION_KEYS = new Set([
  'subjectDeterminer', 'subject', 'subjectId', 'verb', 'object', 'objectId', 'objectQualifier', 'objectDeterminer',
  'element', 'negated', 'cardinalityConstraint', 'value', 'to', 'toDeterminer', 'from', 'fromDeterminer', 'with',
  'of',
]);

// ── Segment / frame shape ────────────────────────────────────────────────────

export const VALID_SEGMENT_KEYS = new Set([
  'metadata', 'properties', 'frames',
  // Segment-level clause + lifecycle hooks (parsed in
  // eventInterpretorController.ts:2337 SEGMENT_START / SEGMENT_END handlers
  // and dataDrivenEventFrames.ts JsonSegment.clause).
  'clause', 'clauseType', 'onEntryClause', 'onExitClause',
  // Documented comment field used in some files (e.g. pogranichnik); ignored
  // by the parser. Keeping it whitelisted so editors can leave inline notes.
  '_note',
]);

export const VALID_SEGMENT_PROPERTIES_KEYS = new Set([
  'segmentTypes', 'duration', 'name', 'element', 'delayedHitLabel',
  'timeDependency', 'timeInteractionType', 'suppliedParameters',
]);

export const VALID_SEGMENT_METADATA_KEYS = new Set([
  'eventComponentType', 'dataSources',
]);

export const VALID_FRAME_KEYS = new Set([
  'metadata', 'properties', 'clause', 'clauseType', 'damageElement',
  // Comment field; same rationale as VALID_SEGMENT_KEYS._note.
  '_note',
]);

export const VALID_FRAME_PROPERTIES_KEYS = new Set([
  'offset', 'element', 'frameTypes', 'dependencyTypes', 'suppliedParameters',
]);

export const VALID_FRAME_METADATA_KEYS = new Set([
  'eventComponentType', 'dataSources',
]);

/** Reaction → element mapping (mirrors src/model/channels REACTION_MICRO_COLUMNS). */
const REACTION_QUALIFIER_TO_ELEMENT: Partial<Record<ArtsReactionType, ElementType>> = {
  [ArtsReactionType.COMBUSTION]: ElementType.HEAT,
  [ArtsReactionType.SOLIDIFICATION]: ElementType.CRYO,
  [ArtsReactionType.CORROSION]: ElementType.NATURE,
  [ArtsReactionType.ELECTRIFICATION]: ElementType.ELECTRIC,
  [ArtsReactionType.SHATTER]: ElementType.CRYO,
};

/**
 * Inspect a frame's clause and return the element the frame should declare in
 * `properties.element`, or null if the frame has no element-tinted effect.
 * Used by `validateFrameShape` to enforce that damage/infliction/reaction
 * frames carry an explicit element so the renderer can color the diamond
 * correctly.
 *
 * Mirrors the audit in `src/tests/unit/auditFrameElements.test.ts`.
 */
function frameClauseElementRequirement(frame: Record<string, unknown>): string | null {
  const clauses = (frame.clause ?? []) as Record<string, unknown>[];
  for (const pred of clauses) {
    const effects = (pred.effects ?? []) as Record<string, unknown>[];
    for (const ef of effects) {
      const verb = ef.verb as VerbType | undefined;
      const obj = ef.object as NounType | undefined;
      const objId = ef.objectId as NounType | undefined;
      const qual = ef.objectQualifier as AdjectiveType | ArtsReactionType | undefined;

      // DEAL <ELEMENT> DAMAGE — qual is the element. PHYSICAL is not "tinted".
      if (verb === VerbType.DEAL && obj === NounType.DAMAGE && qual && qual !== AdjectiveType.PHYSICAL) {
        return qual;
      }
      // APPLY <ELEMENT> INFLICTION — qual is the element.
      if (verb === VerbType.APPLY && obj === NounType.INFLICTION && qual) {
        return qual;
      }
      // APPLY STATUS REACTION <REACTION_NAME> — qual is the reaction name.
      if (verb === VerbType.APPLY && obj === NounType.STATUS && objId === NounType.REACTION && qual) {
        return REACTION_QUALIFIER_TO_ELEMENT[qual as ArtsReactionType] ?? null;
      }
    }
  }
  return null;
}

/**
 * Validate a single frame: check key whitelists on the frame itself, its
 * `properties` block, its `metadata` block, and enforce that frames whose
 * clauses contain element-tinted effects (DEAL <element> DAMAGE, APPLY
 * <element> INFLICTION, APPLY REACTION <name>) carry `properties.element`.
 *
 * The element requirement is critical: the canvas renderer reads
 * `frame.properties.element` directly via `dataDrivenEventFrames.ts:167` to
 * populate `damageElement`. Without it the frame diamond renders white/grey.
 */
export function validateFrameShape(frame: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  errors.push(...checkKeys(frame, VALID_FRAME_KEYS, path));

  const props = frame.properties as Record<string, unknown> | undefined;
  if (props) {
    errors.push(...checkKeys(props, VALID_FRAME_PROPERTIES_KEYS, `${path}.properties`));
  }

  const meta = frame.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_FRAME_METADATA_KEYS, `${path}.metadata`));
  }

  const requiredElement = frameClauseElementRequirement(frame);
  if (requiredElement && !(props?.element)) {
    errors.push(
      `${path}.properties.element: required (frame deals/applies ${requiredElement}, ` +
      `must set "element": "${requiredElement}" so the renderer colors the diamond)`,
    );
  }
  return errors;
}

/**
 * For a COOLDOWN segment whose duration is `VARY_BY SKILL_LEVEL [...]`, check
 * that the L12 entry differs from L11. When the two are equal, the L12 tier
 * was almost certainly missed during reconcile (either copied from L11 or the
 * reduction was rolled one level early — Snowshine's Polar Rescue had the
 * latter, fixed in commit 9461b779).
 *
 * Tracked in docs/todo.md → "Audit: VARY_BY SKILL_LEVEL cooldown arrays".
 */
function validateCooldownSkillLevelMonotonicity(
  seg: Record<string, unknown>,
  path: string,
): string[] {
  const props = seg.properties as Record<string, unknown> | undefined;
  if (!props) return [];

  // Only inspect segments tagged as COOLDOWN.
  const segmentTypes = props.segmentTypes as string[] | undefined;
  if (!Array.isArray(segmentTypes) || !segmentTypes.includes(SegmentType.COOLDOWN)) {
    return [];
  }

  // Duration must be `{ value: <ValueNode>, unit: ... }` with the value being
  // a VARY_BY SKILL_LEVEL ValueNode carrying an array.
  const dur = props.duration as Record<string, unknown> | undefined;
  const durValue = dur?.value as Record<string, unknown> | undefined;
  if (!durValue) return [];
  if (durValue.verb !== VerbType.VARY_BY) return [];
  if (durValue.object !== NounType.SKILL_LEVEL) return [];
  const arr = durValue.value;
  if (!Array.isArray(arr) || arr.length < 2) return [];

  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  if (last === prev) {
    return [
      `${path}.properties.duration.value: VARY_BY SKILL_LEVEL cooldown ` +
      `[..., ${prev}, ${last}] — L12 (${last}) equals L11 (${prev}). ` +
      `Cross-check against endfield.wiki.gg; the L12 tier is usually a ` +
      `further reduction.`,
    ];
  }
  return [];
}

/**
 * Validate a segment's shape (metadata + properties keys + frames). Walks
 * frames via `validateFrameShape`.
 */
export function validateSegmentShape(seg: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  errors.push(...checkKeys(seg, VALID_SEGMENT_KEYS, path));

  const props = seg.properties as Record<string, unknown> | undefined;
  if (props) {
    errors.push(...checkKeys(props, VALID_SEGMENT_PROPERTIES_KEYS, `${path}.properties`));
  }
  const meta = seg.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_SEGMENT_METADATA_KEYS, `${path}.metadata`));
  }

  errors.push(...validateCooldownSkillLevelMonotonicity(seg, path));

  const frames = seg.frames as Record<string, unknown>[] | undefined;
  if (Array.isArray(frames)) {
    for (let fi = 0; fi < frames.length; fi++) {
      errors.push(...validateFrameShape(frames[fi], `${path}.frames[${fi}]`));
    }
  }
  return errors;
}

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
    ? OBJECT_QUALIFIER_MAPPING[ef.objectId as NounType]
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

/** Validate CONSUME target against CONSUME_TARGET_MAPPING (broader than APPLY). */
function warnInvalidConsumeTarget(ef: Record<string, unknown>, path: string): string[] {
  if (ef.verb !== VerbType.CONSUME) return [];
  const validTargets = CONSUME_TARGET_MAPPING[ef.object as ObjectType];
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

/** Validate with.isForced is a ValueNode, not a raw boolean. */
function warnRawBooleanIsForced(ef: Record<string, unknown>, path: string): string[] {
  const w = ef.with as Record<string, unknown> | undefined;
  if (w && typeof w.isForced === 'boolean') {
    return [`${path}.with.isForced: raw boolean — must be a ValueNode (e.g. { "verb": "IS", "value": 1 })`];
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
    ...warnRawBooleanIsForced(ef, path),
  ];
}
