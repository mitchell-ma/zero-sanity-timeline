/**
 * OperatorStatusesController — loads and deserializes operator status JSON configs
 * into typed OperatorStatus class instances.
 *
 * Auto-discovers operator-statuses/*.json via require.context.
 * Each file contains an array of operator status entries sharing an originId.
 */
import type { ClauseEffect, ClausePredicate, StatusLevelConfig, DurationConfig } from './weaponStatusesController';

// ── Trigger clause type ─────────────────────────────────────────────────────

interface TriggerCondition {
  subjectDeterminer?: string;
  subject?: string;
  verb: string;
  object?: string;
  objectId?: string;
  cardinality?: number;
  cardinalityConstraint?: string;
}

interface TriggerClause {
  conditions: TriggerCondition[];
  effects?: ClauseEffect[];
}

// ── Segment type ────────────────────────────────────────────────────────────

interface StatusSegment {
  properties?: Record<string, unknown>;
  clause?: ClausePredicate[];
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_WITH_VALUE_KEYS = new Set(['verb', 'object', 'values']);
const VALID_EFFECT_KEYS = new Set(['verb', 'object', 'objectId', 'adjective', 'to', 'toDeterminer', 'with']);
const VALID_EFFECT_WITH_KEYS = new Set(['value']);
const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);
const VALID_TRIGGER_CONDITION_KEYS = new Set(['subjectDeterminer', 'subject', 'verb', 'object', 'objectId', 'cardinality', 'cardinalityConstraint']);
const VALID_DURATION_KEYS = new Set(['verb', 'values', 'unit']);
const VALID_LIMIT_KEYS = new Set(['verb', 'values']);
const VALID_STATUS_LEVEL_KEYS = new Set(['limit', 'interactionType']);
const VALID_SEGMENT_KEYS = new Set(['properties', 'clause']);
const VALID_PROPERTIES_KEYS = new Set(['id', 'name', 'type', 'element', 'to', 'toDeterminer', 'duration', 'statusLevel', 'enhancementTypes']);
const VALID_METADATA_KEYS = new Set(['originId', 'dataSources']);
const VALID_TOP_KEYS = new Set(['clause', 'onTriggerClause', 'onEntryClause', 'onExitClause', 'segments', 'properties', 'metadata']);

function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

function validateWithValue(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_WITH_VALUE_KEYS, path);
  if (typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (!Array.isArray(wv.values)) errors.push(`${path}.values: must be an array`);
  return errors;
}

function validateEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    if (w.value) errors.push(...validateWithValue(w.value as Record<string, unknown>, `${path}.with.value`));
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

function validateTriggerClause(clause: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(clause, VALID_CLAUSE_KEYS, path);
  if (!Array.isArray(clause.conditions)) errors.push(`${path}.conditions: must be an array`);
  else (clause.conditions as Record<string, unknown>[]).forEach((c, i) => errors.push(...checkKeys(c, VALID_TRIGGER_CONDITION_KEYS, `${path}.conditions[${i}]`)));
  if (clause.effects) {
    if (!Array.isArray(clause.effects)) errors.push(`${path}.effects: must be an array`);
    else (clause.effects as Record<string, unknown>[]).forEach((ef, i) => errors.push(...validateEffect(ef, `${path}.effects[${i}]`)));
  }
  return errors;
}

/** Validate a raw operator status JSON entry. Returns an array of error messages (empty = valid). */
export function validateOperatorStatus(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');

  if (json.clause) {
    if (!Array.isArray(json.clause)) errors.push('root.clause: must be an array');
    else (json.clause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateClause(c, `clause[${i}]`)));
  }

  for (const triggerKey of ['onTriggerClause', 'onEntryClause', 'onExitClause']) {
    if (json[triggerKey]) {
      if (!Array.isArray(json[triggerKey])) errors.push(`root.${triggerKey}: must be an array`);
      else (json[triggerKey] as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateTriggerClause(c, `${triggerKey}[${i}]`)));
    }
  }

  if (json.segments) {
    if (!Array.isArray(json.segments)) errors.push('root.segments: must be an array');
    else (json.segments as Record<string, unknown>[]).forEach((s, i) => errors.push(...checkKeys(s, VALID_SEGMENT_KEYS, `segments[${i}]`)));
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  if (typeof props.id !== 'string') errors.push('properties.id: must be a string');

  if (props.duration) {
    const dur = props.duration as Record<string, unknown>;
    errors.push(...checkKeys(dur, VALID_DURATION_KEYS, 'properties.duration'));
  }

  if (props.statusLevel) {
    const sl = props.statusLevel as Record<string, unknown>;
    errors.push(...checkKeys(sl, VALID_STATUS_LEVEL_KEYS, 'properties.statusLevel'));
    if (sl.limit) errors.push(...checkKeys(sl.limit as Record<string, unknown>, VALID_LIMIT_KEYS, 'properties.statusLevel.limit'));
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));
    if (typeof meta.originId !== 'string') errors.push('metadata.originId: must be a string');
  }

  return errors;
}

// ── OperatorStatus class ────────────────────────────────────────────────────

/** An operator status effect definition. Maps 1:1 to the JSON shape. */
export class OperatorStatus {
  readonly clause: ClausePredicate[];
  readonly onTriggerClause: TriggerClause[];
  readonly onEntryClause: TriggerClause[];
  readonly onExitClause: TriggerClause[];
  readonly segments: StatusSegment[];
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly element?: string;
  readonly to: string;
  readonly toDeterminer?: string;
  readonly duration?: DurationConfig;
  readonly statusLevel?: StatusLevelConfig;
  readonly enhancementTypes?: string[];
  readonly originId: string;
  readonly dataSources: string[];

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.clause = (json.clause ?? []) as ClausePredicate[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    this.onEntryClause = (json.onEntryClause ?? []) as TriggerClause[];
    this.onExitClause = (json.onExitClause ?? []) as TriggerClause[];
    this.segments = (json.segments ?? []) as StatusSegment[];
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    if (props.type) this.type = props.type as string;
    if (props.element) this.element = props.element as string;
    this.to = (props.to ?? 'OPERATOR') as string;
    if (props.toDeterminer) this.toDeterminer = props.toDeterminer as string;
    if (props.duration) this.duration = props.duration as DurationConfig;
    if (props.statusLevel) this.statusLevel = props.statusLevel as StatusLevelConfig;
    if (props.enhancementTypes) this.enhancementTypes = props.enhancementTypes as string[];
    this.originId = (meta.originId ?? '') as string;
    this.dataSources = (meta.dataSources ?? []) as string[];
  }

  get durationSeconds(): number {
    return this.duration?.values[0] ?? 0;
  }

  get maxStacks(): number {
    return this.statusLevel?.limit.values[0] ?? 1;
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      ...(this.clause.length > 0 ? { clause: this.clause } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      ...(this.onEntryClause.length > 0 ? { onEntryClause: this.onEntryClause } : {}),
      ...(this.onExitClause.length > 0 ? { onExitClause: this.onExitClause } : {}),
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      properties: {
        id: this.id,
        name: this.name,
        ...(this.type ? { type: this.type } : {}),
        ...(this.element ? { element: this.element } : {}),
        to: this.to,
        ...(this.toDeterminer ? { toDeterminer: this.toDeterminer } : {}),
        ...(this.duration ? { duration: this.duration } : {}),
        ...(this.statusLevel ? { statusLevel: this.statusLevel } : {}),
        ...(this.enhancementTypes ? { enhancementTypes: this.enhancementTypes } : {}),
      },
      metadata: {
        originId: this.originId,
        ...(this.dataSources.length > 0 ? { dataSources: this.dataSources } : {}),
      },
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): OperatorStatus {
    const errors = validateOperatorStatus(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[OperatorStatus] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new OperatorStatus(json);
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All operator statuses indexed by originId (operator camelCase ID). */
const operatorStatusCache = new Map<string, OperatorStatus[]>();

const operatorStatusContext = require.context('./operator-statuses', false, /-statuses\.json$/);
for (const key of operatorStatusContext.keys()) {
  const entries = operatorStatusContext(key) as Record<string, unknown>[];
  const statuses = entries.map(e => OperatorStatus.deserialize(e, key));
  if (statuses.length > 0) {
    const originId = statuses[0].originId;
    operatorStatusCache.set(originId, statuses);
  }
}

/** Get all operator statuses for an operator by originId (e.g. "laevatain"). */
export function getOperatorStatuses(originId: string): readonly OperatorStatus[] {
  return operatorStatusCache.get(originId) ?? [];
}

/** Get all registered operator IDs that have status definitions. */
export function getAllOperatorStatusOriginIds(): string[] {
  return Array.from(operatorStatusCache.keys());
}

/** Get all operator statuses across all operators. */
export function getAllOperatorStatuses(): readonly OperatorStatus[] {
  const result: OperatorStatus[] = [];
  operatorStatusCache.forEach(statuses => result.push(...statuses));
  return result;
}
