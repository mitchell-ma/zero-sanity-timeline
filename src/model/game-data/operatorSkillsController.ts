/**
 * OperatorSkillsController — loads and deserializes operator skill JSON configs
 * into typed OperatorSkill class instances.
 *
 * Auto-discovers operator-skills/*-skills.json via require.context.
 * Each file contains skill entries keyed by skill ID (e.g. "FLAMING_CINDERS").
 */
import { EventType, EventCategoryType } from '../../consts/enums';
import type { Interaction, ValueNode } from '../../dsl/semantics';

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
  'segments', 'clause', 'onTriggerClause', 'properties', 'metadata',
]);

const VALID_SKILL_PROPERTIES_KEYS = new Set([
  'name', 'description', 'duration', 'windowFrames',
  'enhancementTypes', 'dependencyTypes',
  'eventType', 'eventCategoryType',
]);

const VALID_SKILL_METADATA_KEYS = new Set(['originId']);

function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

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

  if (json.onTriggerClause && !Array.isArray(json.onTriggerClause)) {
    errors.push(`${path}.onTriggerClause: must be an array`);
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
  readonly onTriggerClause: TriggerClause[];
  readonly name: string;
  readonly description: string;
  readonly duration?: SkillDuration;
  readonly windowFrames?: number;
  readonly enhancementTypes?: string[];
  readonly dependencyTypes?: string[];
  readonly eventType: EventType;
  readonly eventCategoryType?: EventCategoryType;
  readonly originId?: string;

  constructor(id: string, json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.id = id;
    this.segments = (json.segments ?? []) as unknown[];
    this.clause = (json.clause ?? []) as unknown[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    this.name = (props.name ?? '') as string;
    this.description = (props.description ?? '') as string;
    if (props.duration) this.duration = props.duration as SkillDuration;
    if (props.windowFrames != null) this.windowFrames = props.windowFrames as number;
    if (props.enhancementTypes) this.enhancementTypes = props.enhancementTypes as string[];
    if (props.dependencyTypes) this.dependencyTypes = props.dependencyTypes as string[];
    this.eventType = (props.eventType as EventType) ?? EventType.COMBAT_SKILL_EVENT;
    if (props.eventCategoryType) this.eventCategoryType = props.eventCategoryType as EventCategoryType;
    if (meta.originId) this.originId = meta.originId as string;
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.clause.length > 0 ? { clause: this.clause } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        name: this.name,
        ...(this.description ? { description: this.description } : {}),
        ...(this.duration ? { duration: this.duration } : {}),
        ...(this.windowFrames != null ? { windowFrames: this.windowFrames } : {}),
        ...(this.enhancementTypes ? { enhancementTypes: this.enhancementTypes } : {}),
        ...(this.dependencyTypes ? { dependencyTypes: this.dependencyTypes } : {}),
        eventType: this.eventType,
        ...(this.eventCategoryType ? { eventCategoryType: this.eventCategoryType } : {}),
      },
      ...(this.originId ? { metadata: { originId: this.originId } } : {}),
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

// ── Loader ──────────────────────────────────────────────────────────────────

/** All operator skills indexed by operator camelCase ID → skill ID → OperatorSkill. */
const skillCache = new Map<string, Map<string, OperatorSkill>>();

const skillContext = require.context('./operator-skills', false, /-skills\.json$/);
for (const key of skillContext.keys()) {
  const filename = key.replace('./', '').replace('-skills.json', '');
  const operatorId = filenameToCamelCase(filename);
  const json = skillContext(key) as Record<string, unknown>;

  const skills = new Map<string, OperatorSkill>();
  for (const [skillId, skillData] of Object.entries(json)) {
    if (typeof skillData !== 'object' || skillData == null) continue;
    skills.set(skillId, OperatorSkill.deserialize(skillId, skillData as Record<string, unknown>, `${key}:${skillId}`));
  }
  skillCache.set(operatorId, skills);
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
