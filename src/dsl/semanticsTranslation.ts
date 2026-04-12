/**
 * Translates DSL Effect objects into human-readable structured output.
 *
 * Instead of mechanical "APPLY STATUS (FOCUS) TO ENEMY WITH duration IS 60",
 * produces natural sentences with separated properties:
 *   sentence: "Apply Focus status to the enemy"
 *   properties: ["Duration: 60s"]
 */

import type { Effect, Interaction, Predicate, ValueNode, WithPreposition } from '../dsl/semantics';
import { isValueLiteral, isValueVariable, isValueStat, isValueExpression, NounType, VerbType } from '../dsl/semantics';
import { UnitType } from '../consts/enums';
import { t } from '../locales/locale';

// ── Output ───────────────────────────────────────────────────────────────────

export interface TranslatedEffect {
  /** Main action sentence, e.g. "Apply Focus status to the enemy" */
  sentence: string;
  /** WITH properties rendered as key-value lines, e.g. ["Duration: 60s", "Stacks: 1"] */
  properties: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const titleCase = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Format a ValueNode (or raw value) into a compact display string. */
function displayValue(v: unknown): string {
  if (v == null) return '?';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  // Handle unit-wrapped values like { unit: "PERCENTAGE", value: { verb: "IS", value: 50 } }
  const rec = v as Record<string, unknown>;
  if (rec.unit && rec.value != null) {
    const inner = displayValue(rec.value);
    return rec.unit === UnitType.PERCENTAGE ? `${inner}%` : `${inner} ${String(rec.unit).toLowerCase()}`;
  }
  const node = v as ValueNode;
  if (isValueLiteral(node)) return String(node.value);
  if (isValueVariable(node)) {
    if (Array.isArray(node.value)) {
      const arr = node.value as number[];
      return arr.length <= 3 ? arr.join('/') : `${arr[0]}–${arr[arr.length - 1]}`;
    }
    if (typeof node.value === 'number') return String(node.value);
    return `(${titleCase(node.object)})`;
  }
  if (isValueStat(node)) return titleCase(node.objectId ?? '?');
  if (isValueExpression(node)) return `(expr)`;
  return String(v);
}

export const SUBJECT_LABELS: Record<string, string> = {
  OPERATOR: t('dsl.subject.OPERATOR'),
  ENEMY: t('dsl.subject.ENEMY'),
  EVENT: t('dsl.subject.EVENT'),
  SYSTEM: t('dsl.subject.SYSTEM'),
};

export const OBJECT_QUALIFIER_LABELS: Record<string, string> = {
  HEAT: t('dsl.objectQualifier.HEAT'), CRYO: t('dsl.objectQualifier.CRYO'), NATURE: t('dsl.objectQualifier.NATURE'), ELECTRIC: t('dsl.objectQualifier.ELECTRIC'), PHYSICAL: t('dsl.objectQualifier.PHYSICAL'),
  COMBUSTION: t('dsl.objectQualifier.COMBUSTION'), SOLIDIFICATION: t('dsl.objectQualifier.SOLIDIFICATION'), CORROSION: t('dsl.objectQualifier.CORROSION'), ELECTRIFICATION: t('dsl.objectQualifier.ELECTRIFICATION'),
  LIFT: t('dsl.objectQualifier.LIFT'), KNOCK_DOWN: t('dsl.objectQualifier.KNOCK_DOWN'), BREACH: t('dsl.objectQualifier.BREACH'), CRUSH: t('dsl.objectQualifier.CRUSH'),
  FORCED: t('dsl.objectQualifier.FORCED'),
  NODE_STAGGERED: t('dsl.objectQualifier.NODE_STAGGERED'), FULL_STAGGERED: t('dsl.objectQualifier.FULL_STAGGERED'),
  COMBO: t('dsl.objectQualifier.COMBO'), DODGE: t('dsl.objectQualifier.DODGE'), ANIMATION: t('dsl.objectQualifier.ANIMATION'),
};

export const CARDINALITY_LABELS: Record<string, string> = {
  EXACTLY: t('dsl.cardinality.EXACTLY'),
  GREATER_THAN: t('dsl.cardinality.GREATER_THAN'),
  GREATER_THAN_EQUAL: t('dsl.cardinality.GREATER_THAN_EQUAL'),
  LESS_THAN: t('dsl.cardinality.LESS_THAN'),
  LESS_THAN_EQUAL: t('dsl.cardinality.LESS_THAN_EQUAL'),
};

export const DETERMINER_LABELS: Record<string, string> = {
  THIS: t('dsl.determiner.THIS'),
  OTHER: t('dsl.determiner.OTHER'),
  ALL: t('dsl.determiner.ALL'),
  ALL_OTHER: t('dsl.determiner.ALL_OTHER'),
  ANY: t('dsl.determiner.ANY'),
  CONTROLLED: t('dsl.determiner.CONTROLLED'),
  TRIGGER: t('dsl.determiner.TRIGGER'),
  SOURCE: t('dsl.determiner.SOURCE'),
};

export const TARGET_LABELS: Record<string, string> = {
  ENEMY: t('dsl.target.ENEMY'),
  OPERATOR: t('dsl.target.OPERATOR'),
  TEAM: t('dsl.target.TEAM'),
};

export const VERB_LABELS: Record<string, string> = {
  // Compound
  ALL: t('dsl.verb.ALL'),
  ANY: t('dsl.verb.ANY'),
  // Action
  APPLY: t('dsl.verb.APPLY'),
  CONSUME: t('dsl.verb.CONSUME'),
  PERFORM: t('dsl.verb.PERFORM'),
  DEAL: t('dsl.verb.DEAL'),
  HIT: t('dsl.verb.HIT'),
  DEFEAT: t('dsl.verb.DEFEAT'),
  // Resource
  RECOVER: t('dsl.verb.RECOVER'),
  OVERHEAL: t('dsl.verb.OVERHEAL'),
  RETURN: t('dsl.verb.RETURN'),
  // Duration/stack
  REFRESH: t('dsl.verb.REFRESH'),
  EXTEND: t('dsl.verb.EXTEND'),
  MERGE: t('dsl.verb.MERGE'),
  RESET: t('dsl.verb.RESET'),
  // Stat
  IGNORE: t('dsl.verb.IGNORE'),
  ENABLE: t('dsl.verb.ENABLE'),
  // Time
  EXPERIENCE: t('dsl.verb.EXPERIENCE'),
  // Condition-only
  HAVE: t('dsl.verb.HAVE'),
  IS: t('dsl.verb.IS'),
  BECOME: t('dsl.verb.BECOME'),
  RECEIVE: t('dsl.verb.RECEIVE'),
};

export const OBJECT_LABELS: Record<string, string> = {
  STATUS: t('dsl.object.STATUS'),
  INFLICTION: t('dsl.object.INFLICTION'),
  REACTION: t('dsl.object.REACTION'),
  STACKS: t('dsl.object.STACKS'),
  SKILL_POINT: t('dsl.object.SKILL_POINT'),
  ULTIMATE_ENERGY: t('dsl.object.ULTIMATE_ENERGY'),
  STAGGER: t('dsl.object.STAGGER'),
  COOLDOWN: t('dsl.object.COOLDOWN'),
  HP: t('dsl.object.HP'),
  DAMAGE: t('dsl.object.DAMAGE'),
  TIME_STOP: t('dsl.object.TIME_STOP'),
  GAME_TIME: t('dsl.object.GAME_TIME'),
  REAL_TIME: t('dsl.object.REAL_TIME'),
  EVENT: t('dsl.object.EVENT'),
  ATTACK_BONUS: t('dsl.object.ATTACK_BONUS'),
  ARTS_REACTION: t('dsl.object.ARTS_REACTION'),
  FINAL_STRIKE: t('dsl.object.FINAL_STRIKE'),
  [NounType.STAT]: t('dsl.object.STAT'),
  [NounType.TALENT_LEVEL]: t('dsl.object.TALENT_LEVEL'),
  [NounType.ATTRIBUTE_INCREASE_LEVEL]: t('dsl.object.ATTRIBUTE_INCREASE_LEVEL'),
};

const PROPERTY_LABELS: Record<string, string> = {
  duration: t('dsl.property.duration'),
  stacks: t('dsl.property.stacks'),
  multiplier: t('dsl.property.multiplier'),
  stagger: t('dsl.property.stagger'),
  skillPoint: t('dsl.property.skillPoint'),
};

const PROPERTY_UNITS: Record<string, string> = {
  duration: 's',
};

// ── Combined noun+determiner translation ─────────────────────────────────────

/**
 * Translate a determiner+noun pair into a human-readable string.
 * e.g. ("THIS", "OPERATOR") → "this Operator", ("ENEMY", undefined) → "Enemy"
 */
export function translateNounPhrase(noun: string, determiner?: string): string {
  const nounLabel = TARGET_LABELS[noun] ?? OBJECT_LABELS[noun] ?? titleCase(noun);
  if (!determiner) return nounLabel;
  const detLabel = DETERMINER_LABELS[determiner] ?? determiner.toLowerCase();
  return `${detLabel} ${nounLabel}`;
}

// ── Generic token translation ────────────────────────────────────────────────

const ALL_TOKEN_LABELS: Record<string, string> = {
  ...VERB_LABELS, ...OBJECT_LABELS, ...SUBJECT_LABELS, ...OBJECT_QUALIFIER_LABELS,
  ...DETERMINER_LABELS, ...TARGET_LABELS, ...CARDINALITY_LABELS,
};

/** Translate a single DSL token (verb, noun, object qualifier, determiner, etc.) to its display label. */
export function translateDslToken(token: string): string {
  return ALL_TOKEN_LABELS[token] ?? titleCase(token);
}

/**
 * Translate a condition (Interaction) JSON object into a human-readable string.
 * Handles subjectDeterminer, subject, verb, objectQualifier, object, objectId, to, toDeterminer, cardinality.
 */
export function translateCondition(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (c.subjectDeterminer) parts.push(translateDslToken(String(c.subjectDeterminer)).toLowerCase());
  if (c.subject) parts.push(translateDslToken(String(c.subject)));
  if (c.verb) parts.push(translateDslToken(String(c.verb)));
  if (c.negated) parts.push('Not');
  if (c.objectQualifier) {
    parts.push(translateDslToken(String(c.objectQualifier)));
  }
  if (c.objectDeterminer) parts.push(translateDslToken(String(c.objectDeterminer)).toLowerCase());
  if (c.objectId) {
    parts.push(titleCase(String(c.objectId)));
    if (c.object) parts.push(translateDslToken(String(c.object)).toLowerCase());
  } else if (c.object) {
    parts.push(translateDslToken(String(c.object)));
  }
  if (c.of) {
    const ofC = c.of as Record<string, unknown>;
    parts.push('of');
    if (ofC.determiner) parts.push(translateDslToken(String(ofC.determiner)).toLowerCase());
    if (ofC.objectQualifier) parts.push(translateDslToken(String(ofC.objectQualifier)));
    if (ofC.objectId) parts.push(titleCase(String(ofC.objectId)));
    if (ofC.object) parts.push(translateDslToken(String(ofC.object)));
  }
  if (c.to || c.toDeterminer) {
    parts.push('to');
    if (c.toDeterminer) parts.push(translateDslToken(String(c.toDeterminer)).toLowerCase());
    if (c.to) parts.push(translateDslToken(String(c.to)));
  }
  if (c.cardinalityConstraint) {
    parts.push(translateDslToken(String(c.cardinalityConstraint)).toLowerCase());
    // The threshold can live in either `c.value` (direct form) or
    // `c.with.value` (extended ValueNode form). The engine's condition
    // evaluator supports both (conditionEvaluator.ts:resolveConditionThreshold),
    // and this translator must mirror it — otherwise the info-pane card for
    // a condition like `HAVE POTENTIAL GREATER_THAN_EQUAL with.value=5` would
    // render as "source Operator Have Potential at least" with no number.
    const directValue = c.value;
    const withBlock = c.with as Record<string, unknown> | undefined;
    const thresholdValue = directValue ?? withBlock?.value;
    if (thresholdValue != null) parts.push(displayValue(thresholdValue));
  }
  return parts.join(' ');
}

/**
 * Build structured parts from an effect JSON object for rendering.
 * Returns { verb, object, target, withEntries } for flexible rendering.
 */
export function translateEffectParts(ef: Record<string, unknown>): {
  verb: string;
  object: string;
  target: string;
  fromTarget: string;
} {
  const verb = ef.verb ? translateDslToken(String(ef.verb)) : '';

  // Object with objectQualifier and objectId
  const adjParts: string[] = [];
  if (ef.objectQualifier) {
    adjParts.push(translateDslToken(String(ef.objectQualifier)));
  }

  let objectStr = '';
  if (ef.objectId) {
    objectStr = `${[...adjParts, titleCase(String(ef.objectId))].join(' ')} ${ef.object ? translateDslToken(String(ef.object)).toLowerCase() : ''}`.trim();
  } else if (ef.object) {
    objectStr = [...adjParts, translateDslToken(String(ef.object))].join(' ');
  } else {
    objectStr = adjParts.join(' ');
  }

  // Target (to)
  const targetParts: string[] = [];
  if (ef.to || ef.toDeterminer) {
    if (ef.toDeterminer) targetParts.push(translateDslToken(String(ef.toDeterminer)).toLowerCase());
    if (ef.toQualifier) targetParts.push(titleCase(String(ef.toQualifier)));
    if (ef.to) targetParts.push(translateDslToken(String(ef.to)));
  }
  const target = targetParts.length > 0 ? `to ${targetParts.join(' ')}` : '';

  // From
  const fromParts: string[] = [];
  if (ef.fromDeterminer) fromParts.push(translateDslToken(String(ef.fromDeterminer)).toLowerCase());
  if (ef.fromObject ?? ef.from) fromParts.push(translateDslToken(String(ef.fromObject ?? ef.from)));
  const fromTarget = fromParts.length > 0 ? `from ${fromParts.join(' ')}` : '';

  // Of (possession: "REDUCE COOLDOWN OF COMBO SKILL")
  if (ef.of) {
    const ofC = ef.of as Record<string, unknown>;
    const ofParts: string[] = [];
    if (ofC.determiner) ofParts.push(translateDslToken(String(ofC.determiner)).toLowerCase());
    if (ofC.objectQualifier) ofParts.push(translateDslToken(String(ofC.objectQualifier)));
    if (ofC.objectId) ofParts.push(titleCase(String(ofC.objectId)));
    if (ofC.object) ofParts.push(translateDslToken(String(ofC.object)));
    if (ofParts.length > 0) objectStr += ` of ${ofParts.join(' ')}`;
  }

  // By (amount: "REDUCE COOLDOWN BY 2 SECOND")
  if (ef.by) {
    const byC = ef.by as Record<string, unknown>;
    const byVal = byC.value;
    const byUnit = byC.unit ? String(byC.unit).toLowerCase() : '';
    const byStr = byVal != null ? `${displayValue(byVal)}${byUnit ? ' ' + byUnit : ''}` : '';
    if (byStr) objectStr += ` by ${byStr}`;
  }

  return { verb, object: objectStr, target, fromTarget };
}

// ── Translation ─────────────────────────────────────────────────────────────

function formatWithValue(key: string, node: ValueNode): string {
  const label = PROPERTY_LABELS[key] ?? titleCase(key);
  const unit = PROPERTY_UNITS[key] ?? '';

  if (isValueLiteral(node)) {
    return `${label}: ${node.value}${unit}`;
  }
  if (isValueVariable(node)) {
    const dep = titleCase(node.object);
    if (Array.isArray(node.value)) {
      const arr = node.value;
      const preview = arr.length <= 3
        ? arr.map((v) => `${v}${unit}`).join(', ')
        : `${arr[0]}${unit}–${arr[arr.length - 1]}${unit}`;
      return `${label}: ${preview} (by ${dep})`;
    }
    if (typeof node.value === 'number') return `${label}: ${node.value}${unit}`;
    return `${label}: depends on ${dep}`;
  }
  if (isValueStat(node)) {
    return `${label}: ${titleCase(node.objectId ?? node.stat ?? '?')}`;
  }
  if (isValueExpression(node)) {
    return `${label}: (${node.operation} expression)`;
  }
  return `${label}: ?`;
}

function formatObject(e: Effect): string {
  const adjStr = e.objectQualifier
    ? titleCase(e.objectQualifier) + ' '
    : '';

  const objLabel = e.object
    ? (OBJECT_LABELS[String(e.object)] ?? titleCase(String(e.object)))
    : '';

  // For STATUS/INFLICTION with an objectId, use objectId as the name
  // e.g. APPLY STATUS (FOCUS) → "Apply Focus status"
  // e.g. APPLY STATUS (Empowered Focus) → "Apply Empowered Focus status"
  if (e.objectId && (e.object === NounType.STATUS || e.object === NounType.INFLICTION)) {
    const name = titleCase(e.objectId);
    return `${adjStr}${name} ${objLabel}`;
  }

  if (e.objectId) {
    return `${adjStr}${objLabel} (${titleCase(e.objectId)})`;
  }

  return `${adjStr}${objLabel}`;
}

function formatTarget(type: string, determiner?: string): string {
  if (type === NounType.OPERATOR && determiner) {
    const det = DETERMINER_LABELS[determiner] ?? determiner.toLowerCase();
    return `${det} operator`;
  }
  return TARGET_LABELS[type] ?? titleCase(type);
}

/** Object types where a WITH `value` should be inlined into the sentence. */
const INLINE_VALUE_OBJECTS = new Set([NounType.STAGGER, NounType.SKILL_POINT, NounType.ULTIMATE_ENERGY, NounType.HP, NounType.COOLDOWN]);

export function translateEffect(e: Effect): TranslatedEffect {
  // Verb
  const verb = VERB_LABELS[e.verb] ?? titleCase(e.verb);

  // Handle PERFORM DAMAGE specially → "Deal"
  const displayVerb = e.verb === VerbType.PERFORM && e.object === NounType.DAMAGE ? 'Deal' : verb;

  // Inline simple WITH value for resource-like objects
  // e.g. APPLY STAGGER TO ENEMY WITH value IS 18 → "Apply 18 stagger to the enemy"
  let inlinedValue = '';
  if (e.with && INLINE_VALUE_OBJECTS.has(String(e.object ?? '') as NounType)) {
    const vw = e.with.value;
    if (vw && isValueLiteral(vw)) {
      inlinedValue = `${vw.value} `;
    }
  }

  // Cardinality (e.g. "Apply 3 Heat infliction")
  const card = !inlinedValue && e.value != null && e.value !== 'MAX'
    ? `${displayValue(e.value)} `
    : !inlinedValue && e.value === 'MAX' ? 'max ' : '';

  // Object
  const obj = formatObject(e);

  // Build sentence parts
  const parts: string[] = [`${displayVerb} ${inlinedValue}${card}${obj}`.replace(/\s+/g, ' ').trim()];

  // TO
  if (e.to) parts.push(`to ${formatTarget(String(e.to), e.toDeterminer)}`);
  // FROM
  if (e.fromObject) parts.push(`from ${formatTarget(String(e.fromObject), e.fromDeterminer)}`);
  // ON
  if (e.onObject) parts.push(`on ${formatTarget(String(e.onObject), e.onDeterminer)}`);
  // UNTIL
  if (e.until) {
    const scope = String(e.until.of?.object ?? 'EVENT').toLowerCase();
    const det = e.until.of?.determiner?.toLowerCase() ?? 'this';
    parts.push(`until ${e.until.object.toLowerCase()} of ${det} ${scope}`);
  }
  // FOR
  if (e.for) {
    const fc = e.for.cardinalityConstraint.replace(/_/g, ' ').toLowerCase();
    const forVal = e.for.value === 'MAX' ? 'max' : displayValue(e.for.value);
    parts.push(`for ${fc} ${forVal}`);
  } else if (e.cardinalityConstraint && e.value == null) {
    parts.push(e.cardinalityConstraint.replace(/_/g, ' ').toLowerCase());
  }

  const sentence = parts.join(' ');

  // Properties from WITH preposition (skip inlined value)
  const properties: string[] = [];
  if (e.with) {
    for (const [k, wv] of Object.entries(e.with)) {
      if (inlinedValue && k === 'value') continue;
      properties.push(formatWithValue(k, wv));
    }
  }

  return { sentence, properties };
}

/**
 * Translate a list of effects into structured output.
 * Convenience wrapper for frame/segment effect arrays.
 */
export function translateEffects(effects: Effect[]): TranslatedEffect[] {
  return effects.map(translateEffect);
}

// ── Skill display name formatting ───────────────────────────────────────────

const ENHANCEMENT_LABELS: Record<string, string> = {
  EMPOWERED: t('dsl.enhancement.EMPOWERED'),
  ENHANCED: t('dsl.enhancement.ENHANCED'),
};

/**
 * Derive the base skill ID by stripping _ENHANCED/_EMPOWERED suffixes.
 * e.g. "SMOULDERING_FIRE_ENHANCED_EMPOWERED" → "SMOULDERING_FIRE"
 */
export function getBaseSkillId(skillId: string): string {
  return skillId
    .replace(/_EMPOWERED_ENHANCED$/, '')
    .replace(/_ENHANCED_EMPOWERED$/, '')
    .replace(/_EMPOWERED$/, '')
    .replace(/_ENHANCED$/, '');
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

function toRoman(n: number): string {
  return ROMAN_NUMERALS[n] ?? `${n + 1}`;
}

/**
 * Format a segment display name.
 * Uses the segment's name if available, otherwise a Roman numeral.
 */
export function formatSegmentDisplayName(segmentName: string | undefined, index: number): string {
  return segmentName ?? toRoman(index);
}

/**
 * Short segment label: name if available, otherwise a Roman numeral.
 */
export function formatSegmentShortName(segmentName: string | undefined, index: number): string {
  return segmentName ?? toRoman(index);
}

/**
 * Format a skill display name with enhancement type suffixes.
 * Uses the event's own name if provided, otherwise falls back to baseName.
 * e.g. ("Smouldering Fire", ["EMPOWERED", "ENHANCED"]) → "Smouldering Fire (Empowered + Enhanced)"
 */
export function formatSkillDisplayName(baseName: string, enhancementTypes?: string[], eventName?: string): string {
  const name = eventName ?? baseName;
  if (!enhancementTypes?.length) return name;
  const labels = enhancementTypes
    .filter((t) => t !== 'NORMAL')
    .map((t) => ENHANCEMENT_LABELS[t] ?? titleCase(t));
  if (labels.length === 0) return name;
  return `${name} (${labels.join(' + ')})`;
}

// ── Semantics → JSON serialization ──────────────────────────────────────────

/**
 * Serialize an Interaction to short-key JSON format with natural ordering.
 * Output: { subject, verb, object, objectId, ... }
 */
export function interactionToJson(i: Interaction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (i.subjectDeterminer) out.subjectDeterminer = i.subjectDeterminer;
  out.subject = i.subject;
  if (i.subjectProperty) out.subjectProperty = i.subjectProperty;
  if (i.negated) out.negated = i.negated;
  out.verb = i.verb;
  out.object = i.object;
  if (i.objectId) out.objectId = i.objectId;
  if (i.element) out.element = i.element;
  if (i.cardinalityConstraint) out.cardinalityConstraint = i.cardinalityConstraint;
  if (i.value != null) out.value = i.value;
  if (i.stacks != null) out.stacks = i.stacks;
  return out;
}

/**
 * Serialize an Effect to short-key JSON format with natural ordering.
 * Key order: verb, objectQualifier, object, objectId, to, from, on, with, for, predicates, effects
 */
export function effectToJson(e: Effect): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.verb = e.verb;
  if (e.objectQualifier) out.objectQualifier = e.objectQualifier;
  if (e.object) out.object = e.object;
  if (e.objectId) out.objectId = e.objectId;
  if (e.cardinalityConstraint) out.cardinalityConstraint = e.cardinalityConstraint;
  if (e.value != null) out.value = e.value;
  if (e.toDeterminer) out.toDeterminer = e.toDeterminer;
  if (e.to) out.to = e.to;
  if (e.toClassFilter) out.toClassFilter = e.toClassFilter;
  if (e.fromDeterminer) out.fromDeterminer = e.fromDeterminer;
  if (e.fromObject) out.from = e.fromObject;
  if (e.onDeterminer) out.onDeterminer = e.onDeterminer;
  if (e.onObject) out.on = e.onObject;
  if (e.with) out.with = withPrepositionToJson(e.with);
  if (e.for) out.for = e.for;
  if (e.until) out.until = e.until;
  if (e.predicates) out.predicates = e.predicates.map(predicateToJson);
  if (e.effects) out.effects = e.effects.map(effectToJson);
  return out;
}

/**
 * Serialize a Predicate to short-key JSON format.
 */
export function predicateToJson(p: Predicate): Record<string, unknown> {
  return {
    conditions: p.conditions.map(interactionToJson),
    effects: p.effects.map(effectToJson),
  };
}

function valueNodeToJson(node: ValueNode): unknown {
  if (isValueLiteral(node)) {
    return { verb: node.verb, value: node.value };
  }
  if (isValueVariable(node)) {
    return { verb: node.verb, object: node.object, ...(node.value != null ? { value: node.value } : {}) };
  }
  if (isValueStat(node)) {
    return { verb: node.verb, object: node.object, objectId: node.objectId };
  }
  if (isValueExpression(node)) {
    return { operation: node.operation, left: valueNodeToJson(node.left), right: valueNodeToJson(node.right) };
  }
  return node;
}

function withPrepositionToJson(wp: WithPreposition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(wp)) {
    out[k] = valueNodeToJson(v);
  }
  return out;
}

// ── K&R JSON formatter ──────────────────────────────────────────────────────

/**
 * Format a JSON value in K&R style:
 * - Opening braces on the same line as the key
 * - Short arrays (all primitives, ≤80 chars) inline on one line
 * - Consistent 2-space indentation
 */
export function formatJsonKR(value: unknown, indent = 2): string {
  return formatNode(value, 0, indent);
}

function formatNode(val: unknown, depth: number, indent: number): string {
  if (val == null || typeof val !== 'object') return JSON.stringify(val);

  const pad = ' '.repeat(depth * indent);
  const inner = ' '.repeat((depth + 1) * indent);

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    // Inline short primitive arrays
    if (val.every((v: unknown) => v == null || typeof v !== 'object')) {
      const inline = JSON.stringify(val);
      if (inline.length <= 80) return inline;
    }
    const items = val.map((v: unknown) => `${inner}${formatNode(v, depth + 1, indent)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(val as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  // Inline short flat objects (all primitive values, ≤80 chars)
  if (entries.every(([, v]) => v == null || typeof v !== 'object')) {
    const inline = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    if (inline.length <= 80) return inline;
  }
  const lines = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatNode(v, depth + 1, indent)}`);
  return `{\n${lines.join(',\n')}\n${pad}}`;
}
