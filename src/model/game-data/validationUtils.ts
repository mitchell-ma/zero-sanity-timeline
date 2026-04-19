import {
  AdjectiveType, NounType, VerbType, DeterminerType,
  VERB_OBJECTS, OBJECT_QUALIFIERS, OBJECT_REQUIRED_QUALIFIER, OBJECT_TARGET_MAPPING,
  CONSUME_TARGET_MAPPING, OBJECT_QUALIFIER_MAPPING,
} from '../../dsl/semantics';
import type { ObjectType } from '../../dsl/semantics';
import { ArtsReactionType, ElementType, OperatorClassType, PhysicalInflictionType, PhysicalStatusType, SegmentType } from '../../consts/enums';

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

/**
 * IDs whose canonical in-game display is the same all-caps token as the id —
 * stylized brand/codename writing rather than a placeholder copied from `id`.
 * These are exempted from the `id !== name` check in `checkIdAndName`.
 */
const ID_NAME_EQUALITY_EXCEPTIONS = new Set<string>(['JET', 'LYNX', 'NONE']);

/**
 * Validate the `id` and `name` pair on a properties-style block. `id` is the
 * SCREAMING_SNAKE_CASE programmatic identifier; `name` is the human-readable
 * display string ("Slashing Edge (T1)"). They must both be strings AND must
 * differ — when they match, `name` is almost certainly a placeholder copied
 * from `id` instead of a properly cased display string. Stylized all-caps
 * names (e.g. JET, LYNX) are allowlisted via ID_NAME_EQUALITY_EXCEPTIONS.
 */
export function checkIdAndName(obj: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  if (typeof obj.id !== 'string') errors.push(`${path}.id: must be a string`);
  if (typeof obj.name !== 'string') errors.push(`${path}.name: must be a string`);
  if (
    typeof obj.id === 'string'
    && typeof obj.name === 'string'
    && obj.id === obj.name
    && !ID_NAME_EQUALITY_EXCEPTIONS.has(obj.id)
  ) {
    errors.push(`${path}.name: "${obj.name}" — name must be a human-readable display string, not a copy of id`);
  }
  return errors;
}

// ── Shared valid-key sets ───────────────────────────────────────────────────

export const VALID_VALUE_NODE_KEYS = new Set([
  'verb', 'value', 'object', 'objectId', 'objectQualifier', 'operation', 'left', 'right', 'of', 'unit',
  // Identity-comparison value node: "THIS OPERATOR IS SOURCE OPERATOR" → 1 or 0
  'subject', 'subjectDeterminer', 'objectDeterminer',
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
]);

export const VALID_SEGMENT_PROPERTIES_KEYS = new Set([
  'segmentTypes', 'duration', 'name', 'element', 'delayedHitLabel',
  'timeDependency', 'timeInteractionType', 'suppliedParameters',
]);

export const VALID_SEGMENT_METADATA_KEYS = new Set([
  'eventComponentType', 'dataSources',
]);

export const VALID_FRAME_KEYS = new Set([
  'metadata', 'properties', 'clause', 'clauseType',
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

/** Infliction-qualifier → element mapping. Element inflictions map to their own
 *  element; physical inflictions (VULNERABLE) map to PHYSICAL since they are
 *  not elements themselves. */
const INFLICTION_QUALIFIER_TO_ELEMENT: Record<string, ElementType> = {
  [AdjectiveType.HEAT]: ElementType.HEAT,
  [AdjectiveType.CRYO]: ElementType.CRYO,
  [AdjectiveType.NATURE]: ElementType.NATURE,
  [AdjectiveType.ELECTRIC]: ElementType.ELECTRIC,
  [AdjectiveType.ARTS]: ElementType.ARTS,
  [AdjectiveType.PHYSICAL]: ElementType.PHYSICAL,
  [PhysicalInflictionType.VULNERABLE]: ElementType.PHYSICAL,
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

      // DEAL <ELEMENT> DAMAGE — qual is the element. PHYSICAL is not "tinted";
      // ANY is a trigger-condition wildcard and never a real effect element.
      if (verb === VerbType.DEAL && obj === NounType.DAMAGE && qual
          && qual !== AdjectiveType.PHYSICAL && qual !== AdjectiveType.ANY) {
        return qual;
      }
      // APPLY STATUS INFLICTION <QUAL> — qual may be an element (HEAT/CRYO/...)
      // or a physical infliction (VULNERABLE); physical inflictions are rendered
      // with PHYSICAL element.
      if (verb === VerbType.APPLY && obj === NounType.STATUS && objId === NounType.INFLICTION && qual) {
        return INFLICTION_QUALIFIER_TO_ELEMENT[qual as string] ?? null;
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
 * VARY_BY TALENT_LEVEL array shape validator.
 *
 * Resolvers index TALENT_LEVEL arrays as zero-based:
 *   - `valueResolver.ts:57` (`ctx.talentLevel ?? 0`)
 *   - `eventInterpretorController.ts` `resolveClauseDimensionKey` (numeric key match)
 * So a talent with `maxLevel = N` requires an array of length `N + 1` whose
 * leading entry is the neutral value at talent level 0 (0 for additive
 * bonuses, 1 for multiplicative ones — both are accepted; the validator only
 * checks length, not the specific neutral value).
 *
 * A length-2 array on a `maxLevel=2` talent silently grants L1 benefits at
 * talent level 0 — see `feedback_talent_levels_zero_indexed.md`.
 *
 * Some files have arrays we can't yet fix without wiki data; they're listed
 * in `KNOWN_AMBIGUOUS_TALENT_LEVEL_FILES` and skipped here.
 *
 * @param json — the parsed JSON file content
 * @param allowedLengths — set of acceptable array lengths for this operator,
 *   typically `{maxLevelTalentOne + 1, maxLevelTalentTwo + 1}`. Empty set
 *   means the operator has no talents (e.g. generic statuses) — the
 *   validator passes anything in that case.
 * @param sourceKey — relative file path used for matching against
 *   KNOWN_AMBIGUOUS_TALENT_LEVEL_FILES and for error messages.
 */
export function validateTalentLevelArrays(
  json: unknown,
  allowedLengths: Set<number>,
  sourceKey: string,
): string[] {
  if (KNOWN_AMBIGUOUS_TALENT_LEVEL_FILES.has(sourceKey)) return [];
  if (allowedLengths.size === 0) return [];

  const errors: string[] = [];

  function walk(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], `${path}[${i}]`);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (
      obj.verb === VerbType.VARY_BY
      && obj.object === NounType.TALENT_LEVEL
      && Array.isArray(obj.value)
    ) {
      const arr = obj.value as unknown[];
      if (!allowedLengths.has(arr.length)) {
        const allowedStr = Array.from(allowedLengths).sort((a, b) => a - b).join(' or ');
        errors.push(
          `${path}: VARY_BY TALENT_LEVEL array length ${arr.length} (allowed: ${allowedStr}) `
          + `— [${arr.join(',')}]. Arrays must be zero-indexed with length = talent maxLevel + 1; `
          + `index 0 is the neutral value at talent level 0 (0 for additive bonuses, 1 for multiplicative).`,
        );
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      walk(v, `${path}.${k}`);
    }
  }

  walk(json, '');
  return errors;
}

/**
 * Files with VARY_BY TALENT_LEVEL arrays whose missing L0/Lmax entries can't
 * be inferred from existing data — they need a wiki lookup before being
 * fixed. Tracked in `docs/todo.md` under
 * "VARY_BY TALENT_LEVEL arrays needing wiki data".
 *
 * Path format: `<operator-dir>/<subfolder>/<filename>.json` (relative to
 * `src/model/game-data/operators/`).
 *
 * Mirrored by `src/tests/unit/talentLevelArrayShape.test.ts`'s skip list.
 */
export const KNOWN_AMBIGUOUS_TALENT_LEVEL_FILES = new Set<string>([
  'laevatain/statuses/status-scorching-heart.json',
  'yvonne/statuses/status-barrage-of-technology.json',
  'ardelia/talents/talent-friendly-presence-talent.json',
  'ardelia/skills/action-mr-dolly-shadow.json',
]);

/**
 * Walk a parsed config JSON and flag negative numeric values inside `duration`
 * and `stacks` blocks. Both are semantically non-negative: durations are
 * time spans (use `PERMANENT_DURATION` / 99999 for infinite), and stack counts
 * are `0..limit` (use `UNLIMITED_STACKS` for no cap).
 *
 * Negative values used to be a silent sentinel for "permanent duration" or
 * "inherit from source"; that is no longer supported — the engine rejects
 * negatives and callers must use the explicit permanent constant or an
 * `until: { object: END }` predicate instead.
 *
 * Checks both flat values (`{"verb": "IS", "value": -1}`) and VARY_BY arrays
 * (`{"verb": "VARY_BY", "value": [..., -1, ...]}`) inside these fields.
 */
export function validateNonNegativeValues(json: unknown, rootPath = ''): string[] {
  const errors: string[] = [];

  /**
   * Check a single ValueNode-shaped object for negative resolved values.
   *
   * Only inspects leaf forms (`IS` and `VARY_BY`). Arithmetic nodes
   * (`{operation, left, right}`) are intentionally NOT recursed into — it is
   * valid for a component of an arithmetic duration/stacks expression to be
   * negative (e.g. `duration = base + VARY_BY SKILL_LEVEL [0, 0, -1, -2]` for
   * a cooldown reduction). What matters is the resolved value at runtime,
   * which is a property of the whole expression, not its leaves.
   */
  function checkValueNode(node: unknown, fieldPath: string): void {
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const verb = obj.verb;
    if (verb === VerbType.IS && typeof obj.value === 'number' && obj.value < 0) {
      errors.push(
        `${fieldPath}.value: ${obj.value} — duration/stacks values cannot be negative `
        + `(use PERMANENT_DURATION=99999 for infinite, or express "until source ends" via `
        + `an "until": { "object": "END" } predicate).`,
      );
      return;
    }
    if (verb === VerbType.VARY_BY && Array.isArray(obj.value)) {
      for (let i = 0; i < obj.value.length; i++) {
        const v = obj.value[i];
        if (typeof v === 'number' && v < 0) {
          errors.push(
            `${fieldPath}.value[${i}]: ${v} — duration/stacks VARY_BY entries cannot be negative.`,
          );
        }
      }
    }
  }

  function walk(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], `${path}[${i}]`);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    // `duration: { value: ValueNode, unit: ... }` and `stacks: { value: ValueNode, ... }`
    // are the two DSL containers that carry non-negative quantities.
    if ('duration' in obj && obj.duration !== null && typeof obj.duration === 'object') {
      const durValue = (obj.duration as Record<string, unknown>).value;
      checkValueNode(durValue, `${path}.duration`);
    }
    if ('stacks' in obj && obj.stacks !== null && typeof obj.stacks === 'object') {
      const stacks = obj.stacks as Record<string, unknown>;
      // `stacks.value` (apply/consume/compare quantity) and `stacks.limit` (max).
      if (stacks.value !== undefined) checkValueNode(stacks.value, `${path}.stacks`);
      if (stacks.limit !== undefined) checkValueNode(stacks.limit, `${path}.stacks.limit`);
      // Flat ValueNode form: `stacks: { verb: IS, value: 3 }`.
      if (stacks.verb !== undefined) checkValueNode(stacks, `${path}.stacks`);
    }
    for (const [k, v] of Object.entries(obj)) {
      // Skip the keys we already inspected to avoid double-reporting.
      if (k === 'duration' || k === 'stacks') continue;
      walk(v, `${path}.${k}`);
    }
  }

  walk(json, rootPath);
  return errors;
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

/**
 * INFLICTION and REACTION are objectIds under `object: STATUS` — NEVER valid
 * as `object` or `subject` in their own right. This check is shared by
 * `validateEffect` and `validateInteraction` so legacy shapes fail loudly on
 * both effect and condition sides.
 *
 * Returns `{ errors, objectRejected }` — `objectRejected` is true when the
 * object-position check tripped, so callers can short-circuit further
 * object-driven validation (e.g. VERB_OBJECTS lookup) that would emit
 * confusing downstream errors on the same invalid shape.
 */
function warnInvalidInflictionReactionPosition(
  shape: Record<string, unknown>,
  path: string,
): { errors: string[]; objectRejected: boolean } {
  const errors: string[] = [];
  let objectRejected = false;
  if (shape.subject === NounType.INFLICTION || shape.subject === NounType.REACTION) {
    errors.push(`${path}: ${shape.subject} is not a valid subject — use objectId under subject=STATUS or subject=ENEMY/OPERATOR`);
  }
  if (shape.object === NounType.INFLICTION || shape.object === NounType.REACTION) {
    errors.push(`${path}: ${shape.object} is not a valid object — use objectId under object=STATUS (e.g. {object: "STATUS", objectId: "${shape.object}", objectQualifier: "<HEAT|CRYO|...>"})`);
    objectRejected = true;
  }
  return { errors, objectRejected };
}

/** Validate verb+object combination against VERB_OBJECTS. */
function warnInvalidVerbObject(ef: Record<string, unknown>, path: string): string[] {
  const { errors, objectRejected } = warnInvalidInflictionReactionPosition(ef, path);
  if (objectRejected) return errors;
  const validObjects = VERB_OBJECTS[ef.verb as VerbType];
  if (!validObjects || !ef.object) return errors;
  if (!(validObjects as string[]).includes(ef.object as string)) {
    errors.push(`${path}: ${ef.verb} ${ef.object} — invalid verb+object combination`);
  }
  return errors;
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
 * Reject End-Axis import artifacts inside `with`: `damageMultiplierIncrement`,
 * `poiseExtra`, and `count` are not valid DSL keys — no interpretor code reads
 * them, so any values written here are silently dropped. The patterns they
 * encoded must be re-expressed in the DSL:
 *   - `damageMultiplierIncrement` — escalating damage → ValueNode arithmetic on `value`.
 *   - `poiseExtra` — extra stagger per hit → a separate `DEAL STAGGER` effect.
 *   - `count` — multi-hit → unroll into explicit frames or per-hit predicates.
 */
const INVALID_WITH_KEYS: Record<string, string> = {
  damageMultiplierIncrement:
    'not a valid DSL key — no interpreter reads this field. '
    + 'Express multi-hit or escalating damage via separate frames, predicates, or arithmetic on "value".',
  poiseExtra:
    'not a valid DSL key — no interpreter reads this field. '
    + 'Express extra stagger via a separate DEAL STAGGER effect.',
  count:
    'not a valid DSL key — no interpreter reads this field. '
    + 'Unroll multi-hit attacks into explicit frames or per-hit predicates.',
};

function warnInvalidWithKeys(ef: Record<string, unknown>, path: string): string[] {
  const w = ef.with as Record<string, unknown> | undefined;
  if (!w) return [];
  const errors: string[] = [];
  for (const [key, message] of Object.entries(INVALID_WITH_KEYS)) {
    if (w[key] !== undefined) {
      errors.push(`${path}.with.${key}: ${message}`);
    }
  }
  return errors;
}

// ── Reaction / physical-status ID shape check ───────────────────────────────

/**
 * Arts reaction names (COMBUSTION, ELECTRIFICATION, …) and physical-status
 * names (LIFT, CRUSH, …) are `objectQualifier` values, not `objectId` values.
 * The canonical shape is:
 *   { object: STATUS, objectId: REACTION,  objectQualifier: <ArtsReactionType> }
 *   { object: STATUS, objectId: PHYSICAL,  objectQualifier: <PhysicalStatusType> }
 * Writing the reaction/physical name directly as `objectId` silently breaks
 * trigger matching and status consumption because the interpretor keys on the
 * (objectId, objectQualifier) pair.
 */
const ARTS_REACTION_NAMES = new Set<string>(Object.values(ArtsReactionType));
const PHYSICAL_STATUS_NAMES = new Set<string>(Object.values(PhysicalStatusType));

/**
 * Flag effects/conditions that write an arts-reaction or physical-status name
 * into `objectId` instead of `objectQualifier`. Runs against any shape with
 * the `{ object, objectId, objectQualifier }` triple — effects and conditions
 * share the same key layout, so this validator covers both.
 */
function warnReactionPhysicalIdMisuse(shape: Record<string, unknown>, path: string): string[] {
  const objId = shape.objectId as string | undefined;
  if (!objId) return [];

  if (ARTS_REACTION_NAMES.has(objId)) {
    return [
      `${path}: "${objId}" is an arts reaction — it must be an objectQualifier, `
      + `not an objectId. Use { "object": "STATUS", "objectId": "REACTION", "objectQualifier": "${objId}" }.`,
    ];
  }
  if (PHYSICAL_STATUS_NAMES.has(objId)) {
    return [
      `${path}: "${objId}" is a physical status — it must be an objectQualifier, `
      + `not an objectId. Use { "object": "STATUS", "objectId": "PHYSICAL", "objectQualifier": "${objId}" }.`,
    ];
  }
  return [];
}

// ── ENEMY determiner check ───────────────────────────────────────────────

/**
 * Walk a value node / clause tree and flag any `object: ENEMY` reference that
 * carries a `determiner`. ENEMY is a singleton in the DSL — there is no
 * `THIS ENEMY` vs `OTHER ENEMY`; the one enemy column is referenced as
 * `{ "object": "ENEMY" }` with no determiner. A stray `determiner: THIS` on
 * ENEMY would be silently ignored by the resolver but signals a misreading of
 * the DSL grammar; flag it loudly so configs stay canonical.
 */
export function collectEnemyWithDeterminer(node: unknown, path: string): string[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    const errors: string[] = [];
    for (let i = 0; i < node.length; i++) {
      errors.push(...collectEnemyWithDeterminer(node[i], `${path}[${i}]`));
    }
    return errors;
  }
  const obj = node as Record<string, unknown>;
  const errors: string[] = [];

  // Nested `of` clauses: { object: "ENEMY", determiner: "THIS" }
  const of = obj.of as Record<string, unknown> | undefined;
  if (of && of.object === NounType.ENEMY && of.determiner !== undefined) {
    errors.push(
      `${path}.of: ENEMY has no determiner in the DSL. Use { "object": "ENEMY" } — there is only one enemy column.`,
    );
  }

  // Determiner+noun pairs on the same object (subject/object/to/from with ENEMY).
  // ENEMY on subject/object/to/from positions is allowed *without* a paired
  // determiner; the DSL has no THIS/ANY/ALL distinction for ENEMY.
  const pairs = [
    ['subject', 'subjectDeterminer'],
    ['object', 'objectDeterminer'],
    ['to', 'toDeterminer'],
    ['from', 'fromDeterminer'],
  ] as const;
  for (const [nounKey, detKey] of pairs) {
    if (obj[nounKey] === NounType.ENEMY && obj[detKey] !== undefined) {
      errors.push(
        `${path}: ${nounKey}=ENEMY has no ${detKey} in the DSL. Remove ${detKey}.`,
      );
    }
  }

  // Recurse into every object-valued child so nested value expressions
  // (left/right) and clause trees are covered.
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child && typeof child === 'object') {
      errors.push(...collectEnemyWithDeterminer(child, `${path}.${key}`));
    }
  }
  return errors;
}

// ── TEAM target + THIS OPERATOR value resolution ──────────────────────────

/**
 * Walk a value node tree and flag any `of.determiner: THIS` with
 * `of.object: OPERATOR`. When the parent effect targets TEAM, value
 * resolution runs against the team entity — which has no stats, skill
 * level, talent level, or potential. The correct form is
 * `"determiner": "SOURCE"` so the resolver picks the casting operator's
 * context.
 */
export function collectThisOperatorInValueNode(node: unknown, path: string, ownerLabel: string = 'owning'): string[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  const obj = node as Record<string, unknown>;
  const errors: string[] = [];

  // Check the `of` clause on this node
  const of = obj.of as Record<string, unknown> | undefined;
  if (of && of.determiner === DeterminerType.THIS && of.object === NounType.OPERATOR) {
    errors.push(
      `${path}.of: "determiner": "THIS" resolves against the ${ownerLabel} entity (no operator stats/levels). `
      + `Use "determiner": "SOURCE" to resolve against the casting operator.`,
    );
  }

  // Recurse into expression children and nested of clauses
  for (const key of ['left', 'right', 'of'] as const) {
    if (obj[key] && typeof obj[key] === 'object') {
      errors.push(...collectThisOperatorInValueNode(obj[key], `${path}.${key}`, ownerLabel));
    }
  }
  return errors;
}

/**
 * Walk an arbitrary clause tree (conditions + effects, including nested
 * predicates in ALL/ANY compound effects) and flag every occurrence of a
 * `<role>Determiner: THIS` paired with its companion noun equal to `OPERATOR`.
 * When the enclosing status has `to: ENEMY` (or TEAM), `THIS` resolves to the
 * non-operator owner, so any `THIS + OPERATOR` reference silently picks up
 * the wrong entity's (empty) stats/levels. The canonical form is `SOURCE` to
 * point at the casting operator.
 *
 * Covers all DSL determiner/noun pairings that may reference the caster:
 *   - subjectDeterminer + subject      (condition subject)
 *   - objectDeterminer  + object       (effect/condition object)
 *   - toDeterminer      + to           (effect recipient)
 *   - fromDeterminer    + from         (effect source)
 *   - ofDeterminer      + of           (effect flat ref)
 *   - determiner        + object       (nested `of` struct inside value nodes,
 *                                       also caught by collectThisOperatorInValueNode)
 */
export function collectThisOperatorInClauses(node: unknown, path: string, ownerLabel: string): string[] {
  if (node === null || typeof node !== 'object') return [];
  const errors: string[] = [];

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      errors.push(...collectThisOperatorInClauses(node[i], `${path}[${i}]`, ownerLabel));
    }
    return errors;
  }

  const obj = node as Record<string, unknown>;

  const pairs: [string, string][] = [
    ['subjectDeterminer', 'subject'],
    ['objectDeterminer', 'object'],
    ['toDeterminer', 'to'],
    ['fromDeterminer', 'from'],
    ['ofDeterminer', 'of'],
    ['determiner', 'object'],
  ];
  for (const [detKey, nounKey] of pairs) {
    if (obj[detKey] === DeterminerType.THIS && obj[nounKey] === NounType.OPERATOR) {
      errors.push(
        `${path}: "${detKey}: THIS" with "${nounKey}: OPERATOR" resolves against the ${ownerLabel} entity `
        + `(no operator stats/levels). Use "${detKey}: SOURCE" to resolve against the casting operator.`,
      );
    }
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object') {
      errors.push(...collectThisOperatorInClauses(value, `${path}.${key}`, ownerLabel));
    }
  }

  return errors;
}

// ── Flattenable-base qualifier consistency ─────────────────────────────────

/**
 * Nouns whose canonical DSL form is `{object: STATUS, objectId: X,
 * objectQualifier: Y}` and which represent per-element status columns
 * (e.g. `SUSCEPTIBILITY + PHYSICAL` → Physical Susceptibility).
 *
 * In EFFECTS, the qualifier is strictly required — an unqualified apply
 * would write to an orphan column / be silently dropped by the interpretor.
 * In CONDITIONS, the qualifier may be omitted when paired with
 * `objectDeterminer: "ANY"`, which signals a wildcard trigger match
 * (e.g. Eternal Xiranite's "fires when wearer applies any susceptibility").
 */
const FLATTENABLE_STATUS_BASES_FOR_VALIDATION = new Set<string>([
  NounType.AMP,
  NounType.SUSCEPTIBILITY,
  NounType.FRAGILITY,
]);

/**
 * Flag an effect whose `{object: STATUS, objectId: <BASE>}` omits the
 * `objectQualifier` — an unqualified apply has no canonical storage column.
 * The canonical authoring form is
 * `{object: STATUS, objectId: <BASE>, objectQualifier: <X>}`.
 */
function warnFlattenableBaseMissingQualifierInEffect(shape: Record<string, unknown>, path: string): string[] {
  const object = shape.object as string | undefined;
  const objectId = shape.objectId as string | undefined;
  const objectQualifier = shape.objectQualifier as string | undefined;
  if (object !== NounType.STATUS) return [];
  if (!objectId) return [];
  if (!FLATTENABLE_STATUS_BASES_FOR_VALIDATION.has(objectId)) return [];
  if (objectQualifier) return [];
  return [
    `${path}: effect APPLY/CONSUME STATUS ${objectId} without objectQualifier — `
    + `requires an element qualifier (PHYSICAL/CRYO/HEAT/ELECTRIC/NATURE/ARTS). `
    + `Wildcards are only allowed in trigger conditions via "objectDeterminer": "ANY".`,
  ];
}

/**
 * Flag a condition whose `{object: STATUS, objectId: <BASE>}` omits the
 * `objectQualifier` AND lacks the `objectDeterminer: "ANY"` wildcard marker.
 * An unqualified trigger check without the ANY marker is ambiguous — use
 * `objectDeterminer: "ANY"` to explicitly declare the wildcard match.
 */
function warnFlattenableBaseMissingQualifierInCondition(shape: Record<string, unknown>, path: string): string[] {
  const object = shape.object as string | undefined;
  const objectId = shape.objectId as string | undefined;
  const objectQualifier = shape.objectQualifier as string | undefined;
  const objectDeterminer = shape.objectDeterminer as string | undefined;
  if (object !== NounType.STATUS) return [];
  if (!objectId) return [];
  if (!FLATTENABLE_STATUS_BASES_FOR_VALIDATION.has(objectId)) return [];
  if (objectQualifier) return [];
  if (objectDeterminer === DeterminerType.ANY) return [];
  return [
    `${path}: condition STATUS ${objectId} without objectQualifier — either add `
    + `an element qualifier (PHYSICAL/CRYO/HEAT/ELECTRIC/NATURE/ARTS) or set `
    + `"objectDeterminer": "ANY" to explicitly match any qualifier.`,
  ];
}

// ── Subject-side triple shape validation ───────────────────────────────────

/**
 * Valid verbs on the condition side of the DSL: state assertions (HAVE, IS,
 * BECOME, RECEIVE), skill-performance triggers (PERFORM, DEFEAT), action
 * triggers (APPLY, CONSUME, DEAL, RECOVER, RETURN) used inside
 * `onTriggerClause` to react to other actors' actions. Anything outside
 * this set is almost certainly a typo — the interpretor's switch will
 * silently fall through and the condition returns false.
 *
 * Sourced from `triggerIndex.ts` priority map + `conditionEvaluator.ts`
 * verb switch. Keep in sync with both.
 */
const CONDITION_VERBS = new Set<string>([
  VerbType.HAVE, VerbType.IS, VerbType.BECOME, VerbType.RECEIVE,
  VerbType.PERFORM, VerbType.DEFEAT,
  VerbType.APPLY, VerbType.CONSUME, VerbType.DEAL,
  VerbType.RECOVER, VerbType.RETURN,
]);

/**
 * Validate a condition's subject+object triple shape:
 *   - `subject` must be a valid NounType
 *   - `subjectDeterminer`, `objectDeterminer`, `fromDeterminer` must each
 *     be valid DeterminerType values
 *   - `verb` must be in the condition-verb allowlist
 *   - `objectId` / `objectQualifier` must pass the same qualifier-mapping
 *     check as effects
 *   - flattenable bases must carry a qualifier
 *
 * Existing checks (`warnReactionPhysicalIdMisuse`) are retained.
 */
function warnInvalidConditionVerb(cond: Record<string, unknown>, path: string): string[] {
  const verb = cond.verb as string | undefined;
  if (!verb) return [`${path}: condition missing "verb"`];
  if (!CONDITION_VERBS.has(verb)) {
    return [`${path}: condition verb "${verb}" is not allowed — valid: ${Array.from(CONDITION_VERBS).sort().join(', ')}`];
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
    ...warnInvalidWithKeys(ef, path),
    ...warnReactionPhysicalIdMisuse(ef, path),
    ...warnFlattenableBaseMissingQualifierInEffect(ef, path),
  ];
}

/**
 * Validate a single interaction (condition) — conditions share the
 * `{ object, objectId, objectQualifier }` shape with effects. Runs the
 * qualifier / determiner / flattenable-base checks (shared with effects)
 * plus the condition-verb allowlist.
 */
export function validateInteraction(shape: Record<string, unknown>, path: string): string[] {
  return [
    ...warnInvalidInflictionReactionPosition(shape, path).errors,
    ...warnReactionPhysicalIdMisuse(shape, path),
    ...warnInvalidConditionVerb(shape, path),
    ...warnInvalidQualifier(shape, path),
    ...warnInvalidDeterminers(shape, path),
    ...warnFlattenableBaseMissingQualifierInCondition(shape, path),
  ];
}
