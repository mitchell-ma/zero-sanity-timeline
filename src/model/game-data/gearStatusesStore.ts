/**
 * Gear store — loads and deserializes gear JSON configs into typed `Gear`
 * (wrapper: permanent stat + on-trigger source) and `GearStat` (the in-game
 * visible gear buff status applied by the wrapper) class instances.
 *
 * Routing is by `eventCategoryType`, NOT file path:
 * - `GEAR_STAT` → `Gear` (wrapper)
 * - `GEAR`      → `GearStat` (in-game buff)
 *
 * Paths are informational only; reorganizing files will not break the loader.
 */
import { UnitType, EventType, EventCategoryType } from '../../consts/enums';
import { VerbType, NounType, DeterminerType } from '../../dsl/semantics';
import type { Interaction } from '../../dsl/semantics';
import type { StacksConfig, DurationConfig, StatusSegment } from './weaponStatusesStore';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../../controller/calculation/valueResolver';

import { checkKeys, checkIdAndName, VALID_VALUE_NODE_KEYS, VALID_CLAUSE_KEYS, VALID_METADATA_KEYS, VALID_EFFECT_KEYS, VALID_EFFECT_WITH_KEYS, validateEffect as validateEffectSemantics, validateNonNegativeValues, validateSegmentShape, validateEventTypes } from './validationUtils';
import { LocaleKey, resolveEventName, resolveOptionalEventDescription } from '../../locales/gameDataLocale';

function validateValueNode(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_VALUE_NODE_KEYS, path);
  if ('verb' in wv && typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if ('operator' in wv && typeof wv.operator !== 'string') errors.push(`${path}.operator: must be a string`);
  return errors;
}

function validateLocalEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  errors.push(...validateEffectSemantics(ef, path));
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    for (const wk of Object.keys(w)) {
      errors.push(...validateValueNode(w[wk] as Record<string, unknown>, `${path}.with.${wk}`));
    }
  }
  return errors;
}

// ── Gear validation ─────────────────────────────────────────────────────────

const VALID_GEAR_TOP_KEYS = new Set(['segments', 'onTriggerClause', 'properties', 'metadata']);
const VALID_GEAR_PROPS_KEYS = new Set(['id', 'rarity', 'piecesRequired', 'eventTypes', 'eventCategoryType']);

/** Validate a raw GearSet (set-level effect) JSON entry. */
export function validateGearSet(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_GEAR_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

  if (json.onTriggerClause) {
    if (!Array.isArray(json.onTriggerClause)) errors.push('root.onTriggerClause: must be an array');
    else (json.onTriggerClause as Record<string, unknown>[]).forEach((t, i) => {
      errors.push(...checkKeys(t, VALID_CLAUSE_KEYS, `onTriggerClause[${i}]`));
      if (!Array.isArray(t.conditions)) errors.push(`onTriggerClause[${i}].conditions: must be an array`);
      if (!Array.isArray(t.effects)) errors.push(`onTriggerClause[${i}].effects: must be an array`);
      else (t.effects as Record<string, unknown>[]).forEach((ef, j) => errors.push(...validateLocalEffect(ef, `onTriggerClause[${i}].effects[${j}]`)));
    });
  }

  // Root-level `clause` is rejected — clauses MUST live inside segments.
  if ('clause' in json) errors.push('root.clause: not allowed — move clause effects into segments[0].clause');

  // Placeholder gear definitions (no onTriggerClause, no segments) are allowed.
  // Otherwise, segments is required.
  const hasRuntimeHook = Array.isArray(json.onTriggerClause) && (json.onTriggerClause as unknown[]).length > 0;
  if (json.segments) {
    if (!Array.isArray(json.segments) || (json.segments as unknown[]).length === 0) {
      errors.push('root.segments: must be a non-empty array');
    } else {
      (json.segments as Record<string, unknown>[]).forEach((s, i) => errors.push(...validateSegmentShape(s, `segments[${i}]`)));
    }
  } else if (hasRuntimeHook) {
    errors.push('root.segments: required when onTriggerClause is present');
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_GEAR_PROPS_KEYS, 'properties'));
  errors.push(...checkIdAndName(props, 'properties'));
  errors.push(...validateEventTypes(props, 'properties'));

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));

  return errors;
}

// ── GearStat validation ─────────────────────────────────────────────────────

const VALID_GEAR_STAT_TOP_KEYS = new Set(['segments', 'properties', 'metadata']);
const VALID_GEAR_STAT_PROPS_KEYS = new Set(['id', 'duration', 'stacks', 'cooldownSeconds', 'usageLimit', 'eventTypes', 'eventCategoryType']);
const VALID_DURATION_KEYS = new Set(['value', 'unit']);
const VALID_STATUS_LEVEL_KEYS = new Set(['limit', 'interactionType']);

/** Validate a raw GearStat JSON entry. */
export function validateGearStat(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_GEAR_STAT_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

  // Root-level `clause` is rejected — clauses MUST live inside segments.
  if ('clause' in json) errors.push('root.clause: not allowed — move clause effects into segments[0].clause');

  if (!Array.isArray(json.segments) || (json.segments as unknown[]).length === 0) {
    errors.push('root.segments: required and must be a non-empty array');
  } else {
    (json.segments as Record<string, unknown>[]).forEach((s, i) => errors.push(...validateSegmentShape(s, `segments[${i}]`)));
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_GEAR_STAT_PROPS_KEYS, 'properties'));
  errors.push(...checkIdAndName(props, 'properties'));
  errors.push(...validateEventTypes(props, 'properties'));

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
      errors.push(...checkKeys(sl.limit as Record<string, unknown>, VALID_VALUE_NODE_KEYS, 'properties.stacks.limit'));
      errors.push(...validateValueNode(sl.limit as Record<string, unknown>, 'properties.stacks.limit'));
    }
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));

  return errors;
}

// ── Gear class ──────────────────────────────────────────────────────────────

interface TriggerClauseEntry {
  conditions: Interaction[];
  effects: { verb: string; object: string; objectId?: string }[];
}

/** A gear set definition (eventCategoryType=GEAR_STAT). Set-level metadata,
 *  `segments` carrying the permanent-effect clause, and `onTriggerClause`
 *  that apply in-game Gear statuses (eventCategoryType=GEAR). */
export class GearSet {
  readonly segments: StatusSegment[];
  readonly onTriggerClause: TriggerClauseEntry[];
  readonly id: string;
  readonly name: string;
  readonly rarity: number;
  readonly piecesRequired?: number;
  readonly description?: string;
  readonly eventTypes: EventType[];
  readonly eventCategoryType: string;
  readonly categoryType = EventCategoryType.GEAR;
  readonly originId: string;
  readonly dataSources: string[];

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.segments = (json.segments ?? []) as StatusSegment[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClauseEntry[];
    this.id = (props.id ?? '') as string;
    const gearPrefix = this.id ? LocaleKey.gear(this.id) : '';
    this.name = gearPrefix ? resolveEventName(gearPrefix) : '';
    this.rarity = (props.rarity ?? 0) as number;
    if (props.piecesRequired) this.piecesRequired = props.piecesRequired as number;
    if (gearPrefix) {
      const desc = resolveOptionalEventDescription(gearPrefix);
      if (desc !== undefined) this.description = desc;
    }
    this.eventTypes = (props.eventTypes as EventType[]) ?? [EventType.STATUS];
    this.eventCategoryType = props.eventCategoryType as string;
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
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        id: this.id,
        ...(this.name ? { name: this.name } : {}),
        rarity: this.rarity,
        ...(this.piecesRequired ? { piecesRequired: this.piecesRequired } : {}),
        ...(this.description ? { description: this.description } : {}),
        eventTypes: this.eventTypes,
        eventCategoryType: this.eventCategoryType,
      },
      metadata: {
        originId: this.originId,
        ...(this.dataSources.length > 0 ? { dataSources: this.dataSources } : {}),
      },
    };
  }

  /** Serialize as a trigger-source def for the event pipeline. */
  serializeAsTriggerDef(): Record<string, unknown> {
    return {
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        id: this.id,
        ...(this.name ? { name: this.name } : {}),
        target: NounType.OPERATOR,
        targetDeterminer: DeterminerType.THIS,
        eventTypes: [EventType.STATUS],
        eventCategoryType: NounType.GEAR_STAT,
      },
      metadata: {
        originId: this.originId,
      },
    };
  }

  static deserialize(json: Record<string, unknown>, source?: string): GearSet {
    const errors = validateGearSet(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[GearSet] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new GearSet(json);
  }
}

// ── GearStat class ──────────────────────────────────────────────────────────

/** The in-game-visible gear buff status (eventCategoryType=GEAR), applied by
 *  the wrapping `Gear` via its onTriggerClause. */
export class GearStat {
  readonly segments: StatusSegment[];
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly duration: DurationConfig;
  readonly stacks: StacksConfig;
  readonly cooldownSeconds?: number;
  readonly usageLimit?: { verb: string; value: number };
  readonly eventTypes: EventType[];
  readonly eventCategoryType: string;
  readonly categoryType = EventCategoryType.GEAR;
  readonly originId: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.segments = (json.segments ?? []) as StatusSegment[];
    this.id = (props.id ?? '') as string;
    const gearSetId = (meta.originId ?? '') as string;
    const prefix = (this.id && gearSetId) ? LocaleKey.gearStatus(gearSetId, this.id) : '';
    this.name = prefix ? resolveEventName(prefix) : '';
    if (prefix) {
      const desc = resolveOptionalEventDescription(prefix);
      if (desc !== undefined) this.description = desc;
    }
    this.duration = (props.duration ?? { value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND }) as DurationConfig;
    this.stacks = (props.stacks ?? {
      limit: { verb: VerbType.IS, value: 1 },
      interactionType: 'NONE',
    }) as StacksConfig;
    if (props.cooldownSeconds) this.cooldownSeconds = props.cooldownSeconds as number;
    if (props.usageLimit) this.usageLimit = props.usageLimit as { verb: string; value: number };
    this.eventTypes = (props.eventTypes as EventType[]) ?? [EventType.STATUS];
    this.eventCategoryType = props.eventCategoryType as string;
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
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      properties: {
        id: this.id,
        // Reproject the locale-resolved display name so downstream consumers
        // (configCache → getStatusDef) can surface it without a second lookup.
        ...(this.name ? { name: this.name } : {}),
        ...(this.description ? { description: this.description } : {}),
        duration: this.duration,
        stacks: this.stacks,
        ...(this.cooldownSeconds ? { cooldownSeconds: this.cooldownSeconds } : {}),
        eventTypes: this.eventTypes,
        eventCategoryType: this.eventCategoryType,
      },
      ...(this.usageLimit ? { usageLimit: this.usageLimit.value } : {}),
      metadata: {
        originId: this.originId,
      },
    };
  }

  static deserialize(json: Record<string, unknown>, source?: string): GearStat {
    const errors = validateGearStat(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[GearStat] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new GearStat(json);
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** Gear sets (set-level effects) indexed by ID (e.g. "HOT_WORK_STAT"). */
const gearSetCache = new Map<string, GearSet>();
/** Gear stats indexed by originId (gear set id). */
const gearStatCache = new Map<string, GearStat[]>();

// Load all gear JSONs (excluding pieces) and route by eventCategoryType.
// Paths are informational only — routing depends solely on the category value
// so files can be reorganized without breaking the loader.
const gearContext = require.context('./gears', true, /\.json$/);
for (const key of gearContext.keys()) {
  if (key.includes('/pieces/')) continue;
  const json = gearContext(key) as Record<string, unknown>;
  const catType = ((json.properties ?? {}) as Record<string, unknown>).eventCategoryType as string;
  if (catType === NounType.GEAR_STAT) {
    // Gear set wrapper: holds onTriggerClause + permanent `clause`.
    const gearSet = GearSet.deserialize(json, key);
    if (gearSet.id) gearSetCache.set(gearSet.id, gearSet);
  } else if (catType === NounType.GEAR) {
    // In-game-visible gear buff status applied by the wrapper.
    const stat = GearStat.deserialize(json, key);
    if (stat.originId) {
      const list = gearStatCache.get(stat.originId) ?? [];
      list.push(stat);
      gearStatCache.set(stat.originId, list);
    }
  }
}

// ── Public API: Gear Sets ───────────────────────────────────────────────────

/** Get a GearSet by ID (e.g. "HOT_WORK_STAT"). */
export function getGearSet(gearSetId: string): GearSet | undefined {
  return gearSetCache.get(gearSetId);
}

/** Get all GearSet IDs. */
export function getAllGearSetIds(): string[] {
  return Array.from(gearSetCache.keys());
}

/** Get all GearSets. */
export function getAllGearSets(): readonly GearSet[] {
  const result: GearSet[] = [];
  gearSetCache.forEach(e => result.push(e));
  return result;
}

// ── Public API: Gear Stats ──────────────────────────────────────────────────

/** Get all GearStats for a gear by originId (e.g. "HOT_WORK"). */
export function getGearStats(originId: string): readonly GearStat[] {
  return gearStatCache.get(originId) ?? [];
}

/** Get all registered gear originIds that have GearStat definitions. */
export function getAllGearStatOriginIds(): string[] {
  return Array.from(gearStatCache.keys());
}

/** Get all GearStats across all gears. */
export function getAllGearStats(): readonly GearStat[] {
  const result: GearStat[] = [];
  gearStatCache.forEach(stats => result.push(...stats));
  return result;
}
