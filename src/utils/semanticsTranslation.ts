/**
 * Translates DSL Effect objects into human-readable structured output.
 *
 * Instead of mechanical "APPLY STATUS (FOCUS) TO ENEMY WITH duration IS 60",
 * produces natural sentences with separated properties:
 *   sentence: "Apply Focus status to the enemy"
 *   properties: ["Duration: 60s"]
 */

import type { Effect, Interaction, Predicate, WithValue, WithPreposition } from '../consts/semantics';

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

export const SUBJECT_LABELS: Record<string, string> = {
  OPERATOR: 'Operator',
  ENEMY: 'Enemy',
  EVENT: 'Event',
  SYSTEM: 'System',
};

export const ADJECTIVE_LABELS: Record<string, string> = {
  HEAT: 'Heat', CRYO: 'Cryo', NATURE: 'Nature', ELECTRIC: 'Electric', PHYSICAL: 'Physical',
  COMBUSTION: 'Combustion', SOLIDIFICATION: 'Solidification', CORROSION: 'Corrosion', ELECTRIFICATION: 'Electrification',
  LIFT: 'Lift', KNOCK_DOWN: 'Knock Down', BREACH: 'Breach', CRUSH: 'Crush',
  FORCED: 'Forced',
  NODE_STAGGERED: 'Node Staggered', FULL_STAGGERED: 'Full Staggered',
  COMBO: 'Combo', DODGE: 'Dodge', ANIMATION: 'Animation',
};

export const CARDINALITY_LABELS: Record<string, string> = {
  EXACTLY: 'exactly',
  AT_LEAST: 'at least',
  AT_MOST: 'at most',
};

export const DETERMINER_LABELS: Record<string, string> = {
  THIS: 'this',
  OTHER: 'other',
  ALL: 'all',
  ANY: 'any',
};

export const TARGET_LABELS: Record<string, string> = {
  ENEMY: 'the enemy',
  OPERATOR: 'the operator',
};

export const VERB_LABELS: Record<string, string> = {
  // Compound
  ALL: 'All',
  ANY: 'Any',
  // Action
  APPLY: 'Apply',
  CONSUME: 'Consume',
  PERFORM: 'Perform',
  DEAL: 'Deal',
  HIT: 'Hit',
  DEFEAT: 'Defeat',
  // Resource
  RECOVER: 'Recover',
  OVERHEAL: 'Overheal',
  RETURN: 'Return',
  // Duration/stack
  REFRESH: 'Refresh',
  EXTEND: 'Extend',
  MERGE: 'Merge',
  RESET: 'Reset',
  // Stat
  IGNORE: 'Ignore',
  ENHANCE: 'Enhance',
  // Time
  EXPERIENCE: 'Experience',
  // Condition-only
  HAVE: 'Have',
  IS: 'Is',
  BECOME: 'Become',
  RECEIVE: 'Receive',
};

export const OBJECT_LABELS: Record<string, string> = {
  STATUS: 'status',
  INFLICTION: 'infliction',
  REACTION: 'reaction',
  ARTS_REACTION: 'arts reaction',
  STACKS: 'stacks',
  SKILL_POINT: 'skill points',
  ULTIMATE_ENERGY: 'ultimate energy',
  STAGGER: 'stagger',
  COOLDOWN: 'cooldown',
  HP: 'HP',
  DAMAGE: 'damage',
  TIME_STOP: 'time stop',
  GAME_TIME: 'game time',
  REAL_TIME: 'real time',
};

const PROPERTY_LABELS: Record<string, string> = {
  duration: 'Duration',
  stacks: 'Stacks',
  cardinality: 'Amount',
  multiplier: 'Multiplier',
  staggerValue: 'Stagger',
  skillPoint: 'SP',
  statusLevel: 'Status level',
};

const PROPERTY_UNITS: Record<string, string> = {
  duration: 's',
};

// ── Translation ─────────────────────────────────────────────────────────────

function formatWithValue(key: string, wv: WithValue): string {
  const label = PROPERTY_LABELS[key] ?? titleCase(key);
  const unit = PROPERTY_UNITS[key] ?? '';

  if (wv.verb === 'IS' && typeof wv.value === 'number') {
    return `${label}: ${wv.value}${unit}`;
  }
  if (wv.verb === 'BASED_ON') {
    const dep = wv.object ? titleCase(wv.object) : 'level';
    if (Array.isArray(wv.value)) {
      const arr = wv.value as number[];
      const preview = arr.length <= 3
        ? arr.map((v) => `${v}${unit}`).join(', ')
        : `${arr[0]}${unit}–${arr[arr.length - 1]}${unit}`;
      return `${label}: ${preview} (by ${dep})`;
    }
    return `${label}: depends on ${dep}`;
  }

  const val = typeof wv.value === 'number'
    ? `${wv.value}${unit}`
    : `[${(wv.value as number[]).slice(0, 3).join(', ')}${(wv.value as number[]).length > 3 ? '...' : ''}]`;
  return `${label}: ${val}`;
}

function formatObject(e: Effect): string {
  const adjs = e.adjective
    ? (Array.isArray(e.adjective) ? e.adjective : [e.adjective])
    : [];

  const adjStr = adjs.length > 0
    ? adjs.map((a) => titleCase(a)).join(' ') + ' '
    : '';

  const objLabel = e.object
    ? (OBJECT_LABELS[String(e.object)] ?? titleCase(String(e.object)))
    : '';

  // For STATUS/INFLICTION/REACTION with an objectId, use objectId as the name
  // e.g. APPLY STATUS (FOCUS) → "Apply Focus status"
  // e.g. APPLY STATUS (Empowered Focus) → "Apply Empowered Focus status"
  if (e.objectId && (e.object === 'STATUS' || e.object === 'INFLICTION' || e.object === 'REACTION')) {
    const name = titleCase(e.objectId);
    return `${adjStr}${name} ${objLabel}`;
  }

  if (e.objectId) {
    return `${adjStr}${objLabel} (${titleCase(e.objectId)})`;
  }

  return `${adjStr}${objLabel}`;
}

function formatTarget(type: string, determiner?: string): string {
  if (type === 'OPERATOR' && determiner) {
    const det = DETERMINER_LABELS[determiner] ?? determiner.toLowerCase();
    return `${det} operator`;
  }
  return TARGET_LABELS[type] ?? titleCase(type);
}

/** Object types where a WITH `value` or `cardinality` should be inlined into the sentence. */
const INLINE_VALUE_OBJECTS = new Set(['STAGGER', 'SKILL_POINT', 'ULTIMATE_ENERGY', 'HP', 'COOLDOWN']);

export function translateEffect(e: Effect): TranslatedEffect {
  // Verb
  const verb = VERB_LABELS[e.verb] ?? titleCase(e.verb);

  // Handle PERFORM DAMAGE specially → "Deal"
  const displayVerb = e.verb === 'PERFORM' && e.object === 'DAMAGE' ? 'Deal' : verb;

  // Inline simple WITH value/cardinality for resource-like objects
  // e.g. APPLY STAGGER TO ENEMY WITH value IS 18 → "Apply 18 stagger to the enemy"
  let inlinedValue = '';
  if (e.with && INLINE_VALUE_OBJECTS.has(String(e.object ?? ''))) {
    const vw = e.with.value ?? e.with.cardinality;
    if (vw && vw.verb === 'IS' && typeof vw.value === 'number') {
      inlinedValue = `${vw.value} `;
    }
  }

  // Cardinality (e.g. "Apply 3 Heat infliction")
  const card = !inlinedValue && e.cardinality != null && e.cardinality !== 'MAX'
    ? `${e.cardinality} `
    : !inlinedValue && e.cardinality === 'MAX' ? 'max ' : '';

  // Object
  const obj = formatObject(e);

  // Build sentence parts
  const parts: string[] = [`${displayVerb} ${inlinedValue}${card}${obj}`.replace(/\s+/g, ' ').trim()];

  // TO
  if (e.toObject) parts.push(`to ${formatTarget(String(e.toObject), e.toDeterminer)}`);
  // FROM
  if (e.fromObject) parts.push(`from ${formatTarget(String(e.fromObject), e.fromDeterminer)}`);
  // ON
  if (e.onObject) parts.push(`on ${formatTarget(String(e.onObject), e.onDeterminer)}`);
  // UNTIL
  if (e.until) parts.push(`until ${e.until.toLowerCase()}`);
  // FOR
  if (e.for) {
    const fc = e.for.cardinalityConstraint.replace(/_/g, ' ').toLowerCase();
    parts.push(`for ${fc} ${e.for.cardinality}`);
  } else if (e.cardinalityConstraint && e.cardinality == null) {
    parts.push(e.cardinalityConstraint.replace(/_/g, ' ').toLowerCase());
  }

  const sentence = parts.join(' ');

  // Properties from WITH preposition (skip inlined value/cardinality)
  const properties: string[] = [];
  if (e.with) {
    for (const [k, wv] of Object.entries(e.with)) {
      if (inlinedValue && (k === 'value' || k === 'cardinality')) continue;
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
  EMPOWERED: 'Empowered',
  ENHANCED: 'Enhanced',
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
  if (i.cardinality != null) out.cardinality = i.cardinality;
  if (i.stacks != null) out.stacks = i.stacks;
  return out;
}

/**
 * Serialize an Effect to short-key JSON format with natural ordering.
 * Key order: verb, adjective, object, objectId, to, from, on, with, for, predicates, effects
 */
export function effectToJson(e: Effect): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.verb = e.verb;
  if (e.adjective) out.adjective = e.adjective;
  if (e.object) out.object = e.object;
  if (e.objectId) out.objectId = e.objectId;
  if (e.cardinalityConstraint) out.cardinalityConstraint = e.cardinalityConstraint;
  if (e.cardinality != null) out.cardinality = e.cardinality;
  if (e.toDeterminer) out.toDeterminer = e.toDeterminer;
  if (e.toObject) out.to = e.toObject;
  if (e.toObjectClassFilter) out.toClassFilter = e.toObjectClassFilter;
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

function withPrepositionToJson(wp: WithPreposition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(wp)) {
    out[k] = { verb: v.verb, ...(v.object ? { object: v.object } : {}), value: v.value };
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
