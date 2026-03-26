/**
 * OperatorSkillsController — loads and deserializes operator skill JSON configs
 * into typed OperatorSkill class instances.
 *
 * Auto-discovers operator-skills/*-skills.json via require.context.
 * Each file contains skill entries keyed by skill ID (e.g. "FLAMING_CINDERS").
 */
import { EventType, EventCategoryType } from '../../consts/enums';
import type { Interaction, ValueNode } from '../../dsl/semantics';
import { checkKeys, warnMissingEffectTarget } from './validationUtils';

// ── Types ───────────────────────────────────────────────────────────────────

interface SkillDuration {
  value: ValueNode;
  unit: string;
}

interface TriggerClause {
  conditions: Interaction[];
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_SKILL_ENTRY_KEYS = new Set([
  'segments', 'clause', 'clauseType', 'onTriggerClause', 'activationClause', 'properties', 'metadata',
]);

const VALID_SKILL_PROPERTIES_KEYS = new Set([
  'id', 'name', 'description', 'duration', 'windowFrames',
  'enhancementTypes', 'dependencyTypes', 'element',
  'eventType', 'eventCategoryType', 'suppliedParameters',
]);

const VALID_SKILL_METADATA_KEYS = new Set(['originId', 'eventComponentType', 'dataSources', 'icon']);

/** Validate a single skill entry. Returns an array of error messages (empty = valid). */
export function validateOperatorSkill(json: Record<string, unknown>, skillId: string): string[] {
  const path = `skill[${skillId}]`;
  const errors = checkKeys(json, VALID_SKILL_ENTRY_KEYS, path);

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

  // Walk effects in clauses, segments, and frames to warn about missing targets
  const walkEffects = (clauses: unknown[], clausePath: string) => {
    if (!Array.isArray(clauses)) return;
    for (let ci = 0; ci < clauses.length; ci++) {
      const clause = clauses[ci] as Record<string, unknown>;
      const effects = clause.effects as Record<string, unknown>[] | undefined;
      if (!Array.isArray(effects)) continue;
      for (let ei = 0; ei < effects.length; ei++) {
        errors.push(...warnMissingEffectTarget(effects[ei], `${clausePath}[${ci}].effects[${ei}]`));
      }
    }
  };
  walkEffects(json.clause as unknown[] ?? [], `${path}.clause`);
  walkEffects(json.onTriggerClause as unknown[] ?? [], `${path}.onTriggerClause`);
  if (Array.isArray(json.segments)) {
    for (let si = 0; si < (json.segments as unknown[]).length; si++) {
      const seg = (json.segments as Record<string, unknown>[])[si];
      const frames = seg.frames as Record<string, unknown>[] | undefined;
      if (!Array.isArray(frames)) continue;
      for (let fi = 0; fi < frames.length; fi++) {
        walkEffects(frames[fi].clause as unknown[] ?? [], `${path}.segments[${si}].frames[${fi}].clause`);
      }
    }
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (props) {
    errors.push(...checkKeys(props, VALID_SKILL_PROPERTIES_KEYS, `${path}.properties`));
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_SKILL_METADATA_KEYS, `${path}.metadata`));
  }

  return errors;
}

// ── OperatorSkill class ─────────────────────────────────────────────────────

/** A single operator skill definition. Maps 1:1 to the JSON shape. */
export class OperatorSkill {
  readonly id: string;
  readonly segments: unknown[];
  readonly clause: unknown[];
  readonly activationClause: unknown[];
  readonly onTriggerClause: TriggerClause[];
  readonly name: string;
  readonly description: string;
  readonly duration?: SkillDuration;
  readonly windowFrames?: number;
  readonly enhancementTypes?: string[];
  readonly dependencyTypes?: string[];
  readonly element?: string;
  readonly eventType: EventType;
  readonly eventCategoryType?: EventCategoryType;
  readonly originId?: string;
  readonly icon?: string;

  constructor(id: string, json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.id = id;
    this.segments = (json.segments ?? []) as unknown[];
    this.clause = (json.clause ?? []) as unknown[];
    this.activationClause = (json.activationClause ?? []) as unknown[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    this.name = (props.name ?? '') as string;
    this.description = (props.description ?? '') as string;
    if (props.duration) this.duration = props.duration as SkillDuration;
    if (props.windowFrames != null) this.windowFrames = props.windowFrames as number;
    if (props.enhancementTypes) this.enhancementTypes = props.enhancementTypes as string[];
    if (props.dependencyTypes) this.dependencyTypes = props.dependencyTypes as string[];
    if (props.element) this.element = props.element as string;
    this.eventType = (props.eventType as EventType) ?? EventType.COMBAT_SKILL;
    if (props.eventCategoryType) this.eventCategoryType = props.eventCategoryType as EventCategoryType;
    if (meta.originId) this.originId = meta.originId as string;
    if (meta.icon) this.icon = meta.icon as string;
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.clause.length > 0 ? { clause: this.clause } : {}),
      ...(this.activationClause.length > 0 ? { activationClause: this.activationClause } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        id: this.id,
        name: this.name,
        ...(this.description ? { description: this.description } : {}),
        ...(this.duration ? { duration: this.duration } : {}),
        ...(this.windowFrames != null ? { windowFrames: this.windowFrames } : {}),
        ...(this.enhancementTypes ? { enhancementTypes: this.enhancementTypes } : {}),
        ...(this.dependencyTypes ? { dependencyTypes: this.dependencyTypes } : {}),
        ...(this.element ? { element: this.element } : {}),
        eventType: this.eventType,
        ...(this.eventCategoryType ? { eventCategoryType: this.eventCategoryType } : {}),
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

// ── Filename → camelCase ID ─────────────────────────────────────────────────

function filenameToCamelCase(filename: string): string {
  return filename.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
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
