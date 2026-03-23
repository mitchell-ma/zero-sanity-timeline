/**
 * GearStatusesController — loads and deserializes gear status JSON configs
 * into typed GearSetEffect and GearStatus class instances.
 *
 * Auto-discovers gears/gear-statuses/*-statuses.json via require.context.
 * Each file is an array: first entry is the set-level effect (GEAR_SET_EFFECT),
 * followed by individual status entries (GEAR_SET_STATUS).
 */
import { UnitType, EventType, EventCategoryType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';
import type { Interaction } from '../../dsl/semantics';
import type { ClausePredicate, StacksConfig, DurationConfig } from './weaponStatusesController';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../../controller/calculation/valueResolver';

// ── Shared validation helpers ───────────────────────────────────────────────

const VALID_VALUE_NODE_KEYS = new Set(['verb', 'value', 'object', 'objectId', 'operator', 'left', 'right', 'ofDeterminer', 'of']);
const VALID_EFFECT_KEYS = new Set(['verb', 'object', 'adjective', 'objectId', 'to', 'toDeterminer', 'with']);
const VALID_EFFECT_WITH_KEYS = new Set(['value', 'multiplier', 'staggerValue']);
const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);
const VALID_TRIGGER_CLAUSE_KEYS = new Set(['conditions', 'effects']);

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
    for (const wk of Object.keys(w)) {
      errors.push(...validateValueNode(w[wk] as Record<string, unknown>, `${path}.with.${wk}`));
    }
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

// ── GearSetEffect validation ────────────────────────────────────────────────

const VALID_SET_EFFECT_TOP_KEYS = new Set(['onTriggerClause', 'properties', 'metadata']);
const VALID_SET_EFFECT_PROPS_KEYS = new Set(['type', 'id', 'name', 'rarity', 'piecesRequired', 'description', 'eventType', 'eventCategoryType']);
const VALID_METADATA_KEYS = new Set(['originId', 'dataSources']);

/** Validate a raw gear set effect JSON entry. */
export function validateGearSetEffect(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_SET_EFFECT_TOP_KEYS, 'root');

  if (json.onTriggerClause) {
    if (!Array.isArray(json.onTriggerClause)) errors.push('root.onTriggerClause: must be an array');
    else (json.onTriggerClause as Record<string, unknown>[]).forEach((t, i) => {
      errors.push(...checkKeys(t, VALID_TRIGGER_CLAUSE_KEYS, `onTriggerClause[${i}]`));
      if (!Array.isArray(t.conditions)) errors.push(`onTriggerClause[${i}].conditions: must be an array`);
      if (!Array.isArray(t.effects)) errors.push(`onTriggerClause[${i}].effects: must be an array`);
      else (t.effects as Record<string, unknown>[]).forEach((ef, j) => errors.push(...validateEffect(ef, `onTriggerClause[${i}].effects[${j}]`)));
    });
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_SET_EFFECT_PROPS_KEYS, 'properties'));
  if (typeof props.id !== 'string') errors.push('properties.id: must be a string');
  if (typeof props.name !== 'string') errors.push('properties.name: must be a string');
  if (typeof props.type !== 'string') errors.push('properties.type: must be a string');

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));

  return errors;
}

// ── GearStatus validation ───────────────────────────────────────────────────

const VALID_STATUS_TOP_KEYS = new Set(['clause', 'properties', 'metadata']);
const VALID_STATUS_PROPS_KEYS = new Set(['type', 'id', 'name', 'description', 'duration', 'stacks', 'cooldownSeconds', 'eventType', 'eventCategoryType']);
const VALID_DURATION_KEYS = new Set(['value', 'unit']);
const VALID_LIMIT_KEYS = new Set(['verb', 'value', 'object', 'objectId', 'operator', 'left', 'right']);
const VALID_STATUS_LEVEL_KEYS = new Set(['limit', 'interactionType']);

/** Validate a raw gear status JSON entry. */
export function validateGearStatus(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_STATUS_TOP_KEYS, 'root');

  if (!Array.isArray(json.clause)) errors.push('root.clause: must be an array');
  else (json.clause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateClause(c, `clause[${i}]`)));

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_STATUS_PROPS_KEYS, 'properties'));
  if (typeof props.id !== 'string') errors.push('properties.id: must be a string');
  if (typeof props.name !== 'string') errors.push('properties.name: must be a string');
  if (typeof props.type !== 'string') errors.push('properties.type: must be a string');

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
      errors.push(...checkKeys(sl.limit as Record<string, unknown>, VALID_LIMIT_KEYS, 'properties.stacks.limit'));
      errors.push(...validateValueNode(sl.limit as Record<string, unknown>, 'properties.stacks.limit'));
    }
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));

  return errors;
}

// ── GearSetEffect class ─────────────────────────────────────────────────────

interface TriggerClauseEntry {
  conditions: Interaction[];
  effects: { verb: string; object: string; objectId?: string }[];
}

/** A gear set effect definition (type=GEAR_SET_EFFECT). Set-level metadata + triggers. */
export class GearSetEffect {
  readonly onTriggerClause: TriggerClauseEntry[];
  readonly type: string;
  readonly id: string;
  readonly name: string;
  readonly rarity: number;
  readonly piecesRequired?: number;
  readonly description?: string;
  readonly eventType: EventType;
  readonly eventCategoryType: EventCategoryType;
  readonly originId: string;
  readonly dataSources: string[];

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClauseEntry[];
    this.type = (props.type ?? 'GEAR_SET_EFFECT') as string;
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    this.rarity = (props.rarity ?? 0) as number;
    if (props.piecesRequired) this.piecesRequired = props.piecesRequired as number;
    if (props.description) this.description = props.description as string;
    this.eventType = (props.eventType as EventType) ?? EventType.STATUS_EVENT;
    this.eventCategoryType = (props.eventCategoryType as EventCategoryType) ?? EventCategoryType.GEAR_STATUS;
    this.originId = (meta.originId ?? '') as string;
    this.dataSources = (meta.dataSources ?? []) as string[];
  }

  /** Get status IDs referenced by trigger effects. */
  get triggeredStatusIds(): string[] {
    return this.onTriggerClause
      .flatMap(t => t.effects)
      .map(e => e.objectId)
      .filter((id): id is string => !!id);
  }

  serialize(): Record<string, unknown> {
    return {
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        type: this.type,
        id: this.id,
        name: this.name,
        rarity: this.rarity,
        ...(this.piecesRequired ? { piecesRequired: this.piecesRequired } : {}),
        ...(this.description ? { description: this.description } : {}),
        eventType: this.eventType,
        eventCategoryType: this.eventCategoryType,
      },
      metadata: {
        originId: this.originId,
        ...(this.dataSources.length > 0 ? { dataSources: this.dataSources } : {}),
      },
    };
  }

  static deserialize(json: Record<string, unknown>, source?: string): GearSetEffect {
    const errors = validateGearSetEffect(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[GearSetEffect] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new GearSetEffect(json);
  }
}

// ── GearStatus class ────────────────────────────────────────────────────────

/** A single gear status definition (type=GEAR_SET_STATUS). */
export class GearStatus {
  readonly clause: ClausePredicate[];
  readonly type: string;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly duration: DurationConfig;
  readonly stacks: StacksConfig;
  readonly cooldownSeconds?: number;
  readonly eventType: EventType;
  readonly eventCategoryType: EventCategoryType;
  readonly originId: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.clause = (json.clause ?? []) as ClausePredicate[];
    this.type = (props.type ?? 'GEAR_SET_STATUS') as string;
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    if (props.description) this.description = props.description as string;
    this.duration = (props.duration ?? { value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND }) as DurationConfig;
    this.stacks = (props.stacks ?? {
      limit: { verb: VerbType.IS, value: 1 },
      interactionType: 'NONE',
    }) as StacksConfig;
    if (props.cooldownSeconds) this.cooldownSeconds = props.cooldownSeconds as number;
    this.eventType = (props.eventType as EventType) ?? EventType.STATUS_EVENT;
    this.eventCategoryType = (props.eventCategoryType as EventCategoryType) ?? EventCategoryType.GEAR_SET_STATUS;
    this.originId = (meta.originId ?? '') as string;
  }

  get durationSeconds(): number {
    return resolveValueNode(this.duration.value, DEFAULT_VALUE_CONTEXT);
  }

  get maxStacks(): number {
    return resolveValueNode(this.stacks.limit, DEFAULT_VALUE_CONTEXT);
  }

  serialize(): Record<string, unknown> {
    return {
      clause: this.clause,
      properties: {
        type: this.type,
        id: this.id,
        name: this.name,
        ...(this.description ? { description: this.description } : {}),
        duration: this.duration,
        stacks: this.stacks,
        ...(this.cooldownSeconds ? { cooldownSeconds: this.cooldownSeconds } : {}),
        eventType: this.eventType,
        eventCategoryType: this.eventCategoryType,
      },
      metadata: {
        originId: this.originId,
      },
    };
  }

  static deserialize(json: Record<string, unknown>, source?: string): GearStatus {
    const errors = validateGearStatus(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[GearStatus] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new GearStatus(json);
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** Gear set effects indexed by ID (e.g. "HOT_WORK"). */
const gearSetEffectCache = new Map<string, GearSetEffect>();
/** Gear statuses indexed by originId (gear set type). */
const gearStatusCache = new Map<string, GearStatus[]>();

const gearStatusContext = require.context('./gears/gear-statuses', false, /-statuses\.json$/);
for (const key of gearStatusContext.keys()) {
  const entries = gearStatusContext(key) as Record<string, unknown>[];
  if (!Array.isArray(entries) || entries.length === 0) continue;

  for (const entry of entries) {
    const type = ((entry.properties ?? {}) as Record<string, unknown>).type as string;

    if (type === 'GEAR_SET_EFFECT') {
      const effect = GearSetEffect.deserialize(entry, key);
      if (effect.id) gearSetEffectCache.set(effect.id, effect);
    } else if (type === 'GEAR_SET_STATUS') {
      const status = GearStatus.deserialize(entry, key);
      if (status.originId) {
        const list = gearStatusCache.get(status.originId) ?? [];
        list.push(status);
        gearStatusCache.set(status.originId, list);
      }
    }
  }
}

// ── Public API: Gear Set Effects ─────────────────────────────────────────────

/** Get a gear set effect by ID (e.g. "HOT_WORK"). */
export function getGearSetEffect(gearSetId: string): GearSetEffect | undefined {
  return gearSetEffectCache.get(gearSetId);
}

/** Get all gear set effect IDs. */
export function getAllGearSetEffectIds(): string[] {
  return Array.from(gearSetEffectCache.keys());
}

/** Get all gear set effects. */
export function getAllGearSetEffects(): readonly GearSetEffect[] {
  const result: GearSetEffect[] = [];
  gearSetEffectCache.forEach(e => result.push(e));
  return result;
}

// ── Public API: Gear Statuses ────────────────────────────────────────────────

/** Get all gear statuses for a gear set by originId (e.g. "HOT_WORK"). */
export function getGearStatuses(originId: string): readonly GearStatus[] {
  return gearStatusCache.get(originId) ?? [];
}

/** Get all registered gear set originIds that have status definitions. */
export function getAllGearStatusOriginIds(): string[] {
  return Array.from(gearStatusCache.keys());
}

/** Get all gear statuses across all gear sets. */
export function getAllGearStatuses(): readonly GearStatus[] {
  const result: GearStatus[] = [];
  gearStatusCache.forEach(statuses => result.push(...statuses));
  return result;
}
