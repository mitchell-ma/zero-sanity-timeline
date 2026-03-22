/**
 * WeaponStatusesLoader — loads and deserializes weapon status JSON configs
 * into typed WeaponStatus class instances.
 *
 * Auto-discovers weapons/weapon-statuses/*.json via require.context.
 * Each file contains an array of weapon status entries sharing an originId.
 */
import { UnitType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';
import type { Interaction, ValueNode } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../../controller/calculation/valueResolver';

// ── DSL value types ─────────────────────────────────────────────────────────

export interface ClauseEffect {
  verb: string;
  object: string;
  adjective?: string;
  to?: string;
  toDeterminer?: string;
  with?: Record<string, ValueNode>;
}

export interface ClausePredicate {
  conditions: Interaction[];
  effects: ClauseEffect[];
}

export interface StacksConfig {
  limit: ValueNode;
  interactionType: string;
}

export interface DurationConfig {
  value: ValueNode;
  unit: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_VALUE_NODE_KEYS = new Set(['verb', 'value', 'object', 'objectId', 'operator', 'left', 'right']);
const VALID_EFFECT_KEYS = new Set(['verb', 'object', 'adjective', 'to', 'toDeterminer', 'with', 'objectId']);
const VALID_EFFECT_WITH_KEYS = new Set(['value']);
const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);
const VALID_DURATION_KEYS = new Set(['value', 'unit']);
const VALID_LIMIT_KEYS = new Set(['verb', 'value', 'object']);
const VALID_STATUS_LEVEL_KEYS = new Set(['limit', 'interactionType']);
const VALID_PROPERTIES_KEYS = new Set(['id', 'name', 'description', 'to', 'toDeterminer', 'duration', 'stacks']);
const VALID_METADATA_KEYS = new Set(['originId', 'dataSources']);
const VALID_TOP_KEYS = new Set(['clause', 'properties', 'metadata']);

function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

function validateValueNode(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_VALUE_NODE_KEYS, path);
  if ('verb' in wv && typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if ('operator' in wv && typeof wv.operator !== 'string') errors.push(`${path}.operator: must be a string`);
  return errors;
}

function validateEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    if (w.value) errors.push(...validateValueNode(w.value as Record<string, unknown>, `${path}.with.value`));
  }
  return errors;
}

function validateClause(clause: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(clause, VALID_CLAUSE_KEYS, path);
  if (!Array.isArray(clause.conditions)) errors.push(`${path}.conditions: must be an array`);
  if (!Array.isArray(clause.effects)) errors.push(`${path}.effects: must be an array`);
  else (clause.effects as Record<string, unknown>[]).forEach((ef, i) => errors.push(...validateEffect(ef, `${path}.effects[${i}]`)));
  return errors;
}

/** Validate a raw weapon status JSON entry. Returns an array of error messages (empty = valid). */
export function validateWeaponStatus(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');

  if (!Array.isArray(json.clause)) errors.push('root.clause: must be an array');
  else (json.clause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateClause(c, `clause[${i}]`)));

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  if (typeof props.id !== 'string') errors.push('properties.id: must be a string');
  if (typeof props.name !== 'string') errors.push('properties.name: must be a string');
  if (props.to !== undefined && typeof props.to !== 'string') errors.push('properties.to: must be a string');
  if (props.toDeterminer !== undefined && typeof props.toDeterminer !== 'string') errors.push('properties.toDeterminer: must be a string');

  if (props.duration) {
    const dur = props.duration as Record<string, unknown>;
    errors.push(...checkKeys(dur, VALID_DURATION_KEYS, 'properties.duration'));
    if (typeof dur.value !== 'object' || dur.value === null) errors.push('properties.duration.value: must be a ValueNode object');
    if (typeof dur.unit !== 'string') errors.push('properties.duration.unit: must be a string');
  }

  if (props.stacks) {
    const sl = props.stacks as Record<string, unknown>;
    errors.push(...checkKeys(sl, VALID_STATUS_LEVEL_KEYS, 'properties.stacks'));
    if (typeof sl.interactionType !== 'string') errors.push('properties.stacks.interactionType: must be a string');
    if (sl.limit) {
      const limit = sl.limit as Record<string, unknown>;
      errors.push(...checkKeys(limit, VALID_LIMIT_KEYS, 'properties.stacks.limit'));
      if (typeof limit.verb !== 'string') errors.push('properties.stacks.limit.verb: must be a string');
    }
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));
    if (typeof meta.originId !== 'string') errors.push('metadata.originId: must be a string');
  }

  return errors;
}

// ── WeaponStatus class ──────────────────────────────────────────────────────

/** A single weapon status effect definition. Maps 1:1 to the JSON shape. */
export class WeaponStatus {
  readonly clause: ClausePredicate[];
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly to: string;
  readonly toDeterminer: string;
  readonly duration: DurationConfig;
  readonly stacks: StacksConfig;
  readonly originId: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.clause = (json.clause ?? []) as ClausePredicate[];
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    if (props.description) this.description = props.description as string;
    this.to = (props.to ?? 'OPERATOR') as string;
    this.toDeterminer = (props.toDeterminer ?? 'THIS') as string;
    this.duration = (props.duration ?? { value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND }) as DurationConfig;
    this.stacks = (props.stacks ?? {
      limit: { verb: VerbType.IS, value: 1 },
      interactionType: 'NONE',
    }) as StacksConfig;
    this.originId = (meta.originId ?? '') as string;
  }

  get durationSeconds(): number {
    return resolveValueNode(this.duration.value, DEFAULT_VALUE_CONTEXT);
  }

  get maxStacks(): number {
    return resolveValueNode(this.stacks.limit, DEFAULT_VALUE_CONTEXT);
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      clause: this.clause,
      properties: {
        id: this.id,
        name: this.name,
        ...(this.description ? { description: this.description } : {}),
        to: this.to,
        toDeterminer: this.toDeterminer,
        duration: this.duration,
        stacks: this.stacks,
      },
      metadata: {
        originId: this.originId,
      },
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): WeaponStatus {
    const errors = validateWeaponStatus(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[WeaponStatus] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new WeaponStatus(json);
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All weapon statuses indexed by originId. */
const weaponStatusCache = new Map<string, WeaponStatus[]>();

const weaponStatusContext = require.context('./weapons/weapon-statuses', false, /-statuses\.json$/);
for (const key of weaponStatusContext.keys()) {
  const raw = weaponStatusContext(key);
  if (!Array.isArray(raw)) continue;
  const entries = raw as Record<string, unknown>[];
  const statuses = entries.map(e => WeaponStatus.deserialize(e, key));
  if (statuses.length > 0) {
    const originId = statuses[0].originId;
    weaponStatusCache.set(originId, statuses);
  }
}

/** Get all weapon statuses for a weapon by originId (e.g. "FORGEBORN_SCATHE"). */
export function getWeaponStatuses(originId: string): readonly WeaponStatus[] {
  return weaponStatusCache.get(originId) ?? [];
}

/** Get all registered weapon originIds that have status definitions. */
export function getAllWeaponStatusOriginIds(): string[] {
  return Array.from(weaponStatusCache.keys());
}

/** Get all weapon statuses across all weapons. */
export function getAllWeaponStatuses(): readonly WeaponStatus[] {
  const result: WeaponStatus[] = [];
  weaponStatusCache.forEach(statuses => result.push(...statuses));
  return result;
}
