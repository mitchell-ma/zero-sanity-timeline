/**
 * OperatorSkillsController — loads and deserializes operator skill JSON configs
 * into typed OperatorSkill class instances.
 *
 * Auto-discovers operator-skills/*-skills.json via require.context.
 * Each file contains skill entries keyed by skill ID (e.g. "FLAMING_CINDERS_BATK").
 */
import { EventType } from '../../consts/enums';
import type { Interaction, ValueNode } from '../../dsl/semantics';
import { checkKeys, checkIdAndName, validateEffect, validateInteraction, validateSegmentShape, validateNonNegativeValues, collectEnemyWithDeterminer, validateEventTypes } from './validationUtils';
import {
  LocaleKey, resolveEventName, resolveEventDescription,
  resolveSegmentName, resolveFrameName,
} from '../../locales/gameDataLocale';

// ── Types ───────────────────────────────────────────────────────────────────

interface SkillDuration {
  value: ValueNode;
  unit: string;
}

interface TriggerClause {
  conditions: Interaction[];
}

/**
 * Rewrite a raw `segments` array so each segment and named frame carries its
 * display name from the locale bundle. Consumers (EventBlock, presentation
 * controller, tests) read `properties.name` directly; we resolve it at load
 * time so downstream code is unaware of the locale layer.
 */
function injectSegmentNames(segments: unknown[], prefix: string): unknown[] {
  if (!prefix) return segments;
  return segments.map((seg, si) => {
    if (!seg || typeof seg !== 'object') return seg;
    const s = seg as Record<string, unknown>;
    const segName = resolveSegmentName(prefix, si);
    const rawFrames = s.frames as Record<string, unknown>[] | undefined;
    const frames = Array.isArray(rawFrames) ? rawFrames.map((frame, fi) => {
      if (!frame || typeof frame !== 'object') return frame;
      const f = frame as Record<string, unknown>;
      const frameName = resolveFrameName(prefix, si, fi);
      if (!frameName) return f;
      const fprops = (f.properties ?? {}) as Record<string, unknown>;
      return { ...f, properties: { ...fprops, name: frameName } };
    }) : undefined;
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const nextProps = segName ? { ...props, name: segName } : props;
    return {
      ...s,
      properties: nextProps,
      ...(frames ? { frames } : {}),
    };
  });
}

/** Activation window embedded Event structure within a combo skill. */
export interface ActivationWindowDef {
  properties: { maxSkills?: number };
  onTriggerClause: TriggerClause[];
  segments: { properties: { duration: { value: number | ValueNode; unit: string } } }[];
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_SKILL_ENTRY_KEYS = new Set([
  'segments', 'onTriggerClause', 'onEntryClause', 'onExitClause', 'activationClause', 'activationWindow', 'properties', 'metadata',
]);

const VALID_SKILL_PROPERTIES_KEYS = new Set([
  'id', 'duration', 'windowFrames',
  'dependencyTypes', 'element',
  'eventTypes', 'eventCategoryType', 'eventQualifierType', 'suppliedParameters',
  // Blackboard values extracted from Warfarin's skill patch table; used by
  // the locale resolver to interpolate `{poise:0}` / `{atk_scale:0.0}` style
  // tokens in the skill description.
  'descriptionParams',
]);

const VALID_SKILL_METADATA_KEYS = new Set(['originId', 'eventComponentType', 'dataSources', 'icon', 'dataStatus']);

/** Validate a single skill entry. Returns an array of error messages (empty = valid). */
export function validateOperatorSkill(json: Record<string, unknown>, skillId: string): string[] {
  const path = `skill[${skillId}]`;
  const errors = checkKeys(json, VALID_SKILL_ENTRY_KEYS, path);
  errors.push(...validateNonNegativeValues(json, path));

  if (json.segments && !Array.isArray(json.segments)) {
    errors.push(`${path}.segments: must be an array`);
  }

  if (json.clause && !Array.isArray(json.clause)) {
    errors.push(`${path}.clause: must be an array`);
  }

  if (json.activationClause && !Array.isArray(json.activationClause)) {
    errors.push(`${path}.activationClause: must be an array`);
  }

  if (json.onTriggerClause && !Array.isArray(json.onTriggerClause)) {
    errors.push(`${path}.onTriggerClause: must be an array`);
  }

  if (json.onEntryClause && !Array.isArray(json.onEntryClause)) {
    errors.push(`${path}.onEntryClause: must be an array`);
  }

  if (json.onExitClause && !Array.isArray(json.onExitClause)) {
    errors.push(`${path}.onExitClause: must be an array`);
  }

  // Walk effects and conditions in clauses, segments, and frames. Effects go
  // through the full semantic check; conditions run the shape-only
  // `validateInteraction` pass (catches e.g. `objectId: ELECTRIFICATION` where
  // `objectQualifier: ELECTRIFICATION` is meant).
  const walkEffects = (clauses: unknown[], clausePath: string) => {
    if (!Array.isArray(clauses)) return;
    for (let ci = 0; ci < clauses.length; ci++) {
      const clause = clauses[ci] as Record<string, unknown>;
      const conditions = clause.conditions as Record<string, unknown>[] | undefined;
      if (Array.isArray(conditions)) {
        for (let ki = 0; ki < conditions.length; ki++) {
          errors.push(...validateInteraction(conditions[ki], `${clausePath}[${ci}].conditions[${ki}]`));
        }
      }
      const effects = clause.effects as Record<string, unknown>[] | undefined;
      if (!Array.isArray(effects)) continue;
      for (let ei = 0; ei < effects.length; ei++) {
        errors.push(...validateEffect(effects[ei], `${clausePath}[${ci}].effects[${ei}]`));
      }
    }
  };
  walkEffects(json.clause as unknown[] ?? [], `${path}.clause`);
  walkEffects(json.onTriggerClause as unknown[] ?? [], `${path}.onTriggerClause`);
  walkEffects(json.onEntryClause as unknown[] ?? [], `${path}.onEntryClause`);
  walkEffects(json.onExitClause as unknown[] ?? [], `${path}.onExitClause`);
  if (Array.isArray(json.segments)) {
    for (let si = 0; si < (json.segments as unknown[]).length; si++) {
      const seg = (json.segments as Record<string, unknown>[])[si];
      // Whitelist segment / frame shape (keys + frame.properties.element).
      errors.push(...validateSegmentShape(seg, `${path}.segments[${si}]`));
      const frames = seg.frames as Record<string, unknown>[] | undefined;
      if (!Array.isArray(frames)) continue;
      for (let fi = 0; fi < frames.length; fi++) {
        walkEffects(frames[fi].clause as unknown[] ?? [], `${path}.segments[${si}].frames[${fi}].clause`);
      }
    }
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) {
    errors.push(`${path}.properties: required`);
  } else {
    errors.push(...checkKeys(props, VALID_SKILL_PROPERTIES_KEYS, `${path}.properties`));
    errors.push(...checkIdAndName(props, `${path}.properties`));
    errors.push(...validateEventTypes(props, `${path}.properties`));
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_SKILL_METADATA_KEYS, `${path}.metadata`));
  }

  // Flag any `object: ENEMY` paired with a `determiner` — ENEMY is a singleton
  // in the DSL and has no determiner. Walk the whole skill tree so value-node
  // `of` chains, effect subject/object/to/from, and nested predicates are covered.
  errors.push(...collectEnemyWithDeterminer(json, path));

  return errors;
}

// ── OperatorSkill class ─────────────────────────────────────────────────────

/** A single operator skill definition. Maps 1:1 to the JSON shape. */
export class OperatorSkill {
  readonly id: string;
  readonly segments: unknown[];
  readonly activationClause: unknown[];
  readonly onTriggerClause: TriggerClause[];
  readonly onEntryClause: unknown[];
  readonly onExitClause: unknown[];
  readonly name: string;
  readonly description: string;
  readonly duration?: SkillDuration;
  readonly windowFrames?: number;
  readonly dependencyTypes?: string[];
  readonly element?: string;
  readonly eventTypes: EventType[];
  readonly eventCategoryType?: string;
  readonly eventQualifierType?: string;
  readonly activationWindow?: ActivationWindowDef;
  readonly originId?: string;
  readonly icon?: string;
  readonly suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;

  constructor(id: string, json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.id = id;
    this.activationClause = (json.activationClause ?? []) as unknown[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    this.onEntryClause = (json.onEntryClause ?? []) as unknown[];
    this.onExitClause = (json.onExitClause ?? []) as unknown[];
    const operatorId = (meta.originId ?? '') as string;
    const prefix = operatorId ? LocaleKey.operatorSkill(operatorId, id) : '';
    this.name = prefix ? resolveEventName(prefix) : '';
    // descriptionParams are blackboard values from the skill patch table —
    // pass them through so `{poise:0}` / `{atk_scale:0.0}` tokens in the
    // description template interpolate to their numeric values.
    const descriptionParams = props.descriptionParams as Record<string, number> | undefined;
    this.description = prefix ? resolveEventDescription(prefix, descriptionParams) : '';
    if (this.description === `${prefix}.event.description`) this.description = '';
    // Inject segment and frame names from the locale bundle into the raw JSON
    // segments so the view layer (`EventBlock`, `allSegmentLabels`) continues
    // to read them via `segment.properties.name` / `frame.properties.name`.
    this.segments = injectSegmentNames((json.segments ?? []) as unknown[], prefix);
    if (props.duration) this.duration = props.duration as SkillDuration;
    if (props.windowFrames != null) this.windowFrames = props.windowFrames as number;
    if (props.dependencyTypes) this.dependencyTypes = props.dependencyTypes as string[];
    if (props.element) this.element = props.element as string;
    this.eventTypes = (props.eventTypes as EventType[]) ?? [EventType.SKILL];
    if (props.eventCategoryType) this.eventCategoryType = props.eventCategoryType as string;
    if (props.eventQualifierType) this.eventQualifierType = props.eventQualifierType as string;
    if (json.activationWindow) this.activationWindow = json.activationWindow as ActivationWindowDef;
    if (meta.originId) this.originId = meta.originId as string;
    if (meta.icon) this.icon = meta.icon as string;
    if (props.suppliedParameters) this.suppliedParameters = props.suppliedParameters as Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.activationClause.length > 0 ? { activationClause: this.activationClause } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      ...(this.onEntryClause.length > 0 ? { onEntryClause: this.onEntryClause } : {}),
      ...(this.onExitClause.length > 0 ? { onExitClause: this.onExitClause } : {}),
      ...(this.activationWindow ? { activationWindow: this.activationWindow } : {}),
      properties: {
        id: this.id,
        // Reproject locale-resolved strings so configCache/getStatusDef surfaces them.
        ...(this.name ? { name: this.name } : {}),
        ...(this.description ? { description: this.description } : {}),
        ...(this.duration ? { duration: this.duration } : {}),
        ...(this.windowFrames != null ? { windowFrames: this.windowFrames } : {}),
        ...(this.dependencyTypes ? { dependencyTypes: this.dependencyTypes } : {}),
        ...(this.element ? { element: this.element } : {}),
        eventTypes: this.eventTypes,
        ...(this.eventCategoryType ? { eventCategoryType: this.eventCategoryType } : {}),
        ...(this.eventQualifierType ? { eventQualifierType: this.eventQualifierType } : {}),
        ...(this.suppliedParameters ? { suppliedParameters: this.suppliedParameters } : {}),
      },
      ...(this.originId || this.icon ? { metadata: { ...(this.originId ? { originId: this.originId } : {}), ...(this.icon ? { icon: this.icon } : {}) } } : {}),
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(id: string, json: Record<string, unknown>, source?: string): OperatorSkill {
    const errors = validateOperatorSkill(json, id);
    if (errors.length > 0) {
      console.warn(`[OperatorSkill] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new OperatorSkill(id, json);
  }
}

// ── Directory → JSON-ID map ──────────────────────────────────────────────────

// Build directory→JSON-ID map from operator JSON files (independent of operatorsStore init order)
const _dirToId = new Map<string, string>();
const _opContext = require.context('./operators', true, /\/[^/]+\/[^/]+\.json$/);
for (const k of _opContext.keys()) {
  const m = k.match(/^\.\/([^/]+)\/[^/]+\.json$/);
  if (!m || m[1] === 'generic' || k.includes('/potentials/') || k.includes('/skills/') || k.includes('/statuses/') || k.includes('/talents/')) continue;
  const j = _opContext(k) as Record<string, unknown>;
  if (typeof j.id === 'string') _dirToId.set(m[1], j.id);
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All operator skills indexed by operator JSON ID → skill ID → OperatorSkill. */
const skillCache = new Map<string, Map<string, OperatorSkill>>();

const skillContext = require.context('./operators', true, /\/skills\/[^/]+\.json$/);
for (const key of skillContext.keys()) {
  // Extract operatorId from path: ./laevatain/skills/basic-attack-batk-flaming-cinders.json → LAEVATAIN
  const match = key.match(/^\.\/([^/]+)\/skills\/[^/]+\.json$/);
  if (!match) continue;
  const operatorId = _dirToId.get(match[1]) ?? match[1];

  const json = skillContext(key) as Record<string, unknown>;
  const props = json.properties as Record<string, unknown> | undefined;
  const skillId = (props?.id ?? '') as string;
  if (!skillId) {
    console.warn(`[OperatorSkillsController] Missing properties.id in ${key}`);
    continue;
  }

  if (!skillCache.has(operatorId)) {
    skillCache.set(operatorId, new Map());
  }
  skillCache.get(operatorId)!.set(skillId, OperatorSkill.deserialize(skillId, json, key));
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Get all skills for an operator by camelCase ID. */
export function getOperatorSkills(operatorId: string): ReadonlyMap<string, OperatorSkill> | undefined {
  return skillCache.get(operatorId);
}

/** Get a specific skill for an operator. */
export function getOperatorSkill(operatorId: string, skillId: string): OperatorSkill | undefined {
  return skillCache.get(operatorId)?.get(skillId);
}

/** Get all skill IDs for an operator. */
export function getOperatorSkillIds(operatorId: string): Set<string> {
  const skills = skillCache.get(operatorId);
  return skills ? new Set(skills.keys()) : new Set();
}

/** Get all operator IDs that have skill definitions. */
export function getAllOperatorSkillSetIds(): string[] {
  return Array.from(skillCache.keys());
}
