/**
 * Weapon stat store — loads and deserializes weapon status JSON configs
 * into typed `WeaponStat` class instances.
 *
 * Auto-discovers weapons/<weapon>/statuses/status-*.json via require.context.
 * Each file is a status entry that a `WeaponSkill` onTriggerClause applies.
 */
import { UnitType, EventType, EventCategoryType } from '../../consts/enums';
import { NounType, VerbType } from '../../dsl/semantics';
import type { Interaction, ValueNode } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../../controller/calculation/valueResolver';
import { checkKeys, checkIdAndName, VALID_VALUE_NODE_KEYS, VALID_CLAUSE_KEYS, VALID_METADATA_KEYS, VALID_EFFECT_KEYS, VALID_EFFECT_WITH_KEYS, validateEffect as validateEffectSemantics, validateNonNegativeValues, validateSegmentShape } from './validationUtils';
import { LocaleKey, GENERIC_WEAPON_ID, resolveEventName, resolveOptionalEventDescription } from '../../locales/gameDataLocale';

// ── DSL value types ─────────────────────────────────────────────────────────

export interface ClauseEffect {
  verb: string;
  object: string;
  objectId?: string;
  objectQualifier?: string;
  to?: string;
  toDeterminer?: string;
  with?: Record<string, ValueNode>;
}

export interface ClausePredicate {
  conditions: Interaction[];
  effects: ClauseEffect[];
}

interface TriggerClause {
  conditions: Interaction[];
  effects?: ClauseEffect[];
}

export interface StacksConfig {
  limit: ValueNode;
  interactionType: string;
}

export interface DurationConfig {
  value: ValueNode;
  unit: string;
}

/** Shape of a single entry in the `segments` array on a status config. */
export interface StatusSegment {
  metadata?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  clause?: ClausePredicate[];
  clauseType?: string;
  frames?: unknown[];
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_DURATION_KEYS = new Set(['value', 'unit']);
const VALID_STATUS_LEVEL_KEYS = new Set(['limit', 'interactionType']);
const VALID_PROPERTIES_KEYS = new Set(['id', 'to', 'toDeterminer', 'duration', 'stacks', 'eventType', 'eventCategoryType']);
const VALID_TOP_KEYS = new Set(['segments', 'onTriggerClause', 'onExitClause', 'properties', 'metadata']);

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
    if (w.value) errors.push(...validateValueNode(w.value as Record<string, unknown>, `${path}.with.value`));
  }
  return errors;
}

function validateClause(clause: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(clause, VALID_CLAUSE_KEYS, path);
  if (!Array.isArray(clause.conditions)) errors.push(`${path}.conditions: must be an array`);
  if (!Array.isArray(clause.effects)) errors.push(`${path}.effects: must be an array`);
  else (clause.effects as Record<string, unknown>[]).forEach((ef, i) => errors.push(...validateLocalEffect(ef, `${path}.effects[${i}]`)));
  return errors;
}

/** Validate a raw weapon stat JSON entry. Returns an array of error messages (empty = valid). */
export function validateWeaponStat(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

  // Root-level `clause`/`clauseType` are rejected — clauses MUST live inside segments.
  if ('clause' in json) errors.push('root.clause: not allowed — move clause effects into segments[0].clause');
  if ('clauseType' in json) errors.push('root.clauseType: not allowed — set clauseType on segments[0] instead');

  // Marker-only weapon statuses (no onTrigger/onExit, no segments) are allowed —
  // they exist as visible cooldown/state markers. Otherwise, segments required.
  const hasRuntimeHook =
    (Array.isArray(json.onTriggerClause) && (json.onTriggerClause as unknown[]).length > 0) ||
    (Array.isArray(json.onExitClause) && (json.onExitClause as unknown[]).length > 0);
  if (json.segments) {
    if (!Array.isArray(json.segments) || (json.segments as unknown[]).length === 0) {
      errors.push('root.segments: must be a non-empty array');
    } else {
      (json.segments as Record<string, unknown>[]).forEach((s, i) => errors.push(...validateSegmentShape(s, `segments[${i}]`)));
    }
  } else if (hasRuntimeHook) {
    errors.push('root.segments: required when onTriggerClause/onExitClause is present');
  }

  if (json.onTriggerClause) {
    if (!Array.isArray(json.onTriggerClause)) errors.push('root.onTriggerClause: must be an array');
    else (json.onTriggerClause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateClause(c, `onTriggerClause[${i}]`)));
  }
  if (json.onExitClause) {
    if (!Array.isArray(json.onExitClause)) errors.push('root.onExitClause: must be an array');
    else (json.onExitClause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateClause(c, `onExitClause[${i}]`)));
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  errors.push(...checkIdAndName(props, 'properties'));
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
      errors.push(...checkKeys(limit, VALID_VALUE_NODE_KEYS, 'properties.stacks.limit'));
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

// ── WeaponStat class ────────────────────────────────────────────────────────

/** A weapon stat-bearing status definition (eventCategoryType=WEAPON_STAT). */
export class WeaponStat {
  readonly segments: StatusSegment[];
  readonly onTriggerClause: TriggerClause[];
  readonly onExitClause: ClausePredicate[];
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly to: string;
  readonly toDeterminer: string;
  readonly duration: DurationConfig;
  readonly stacks: StacksConfig;
  readonly eventType: EventType;
  readonly eventCategoryType: string;
  readonly categoryType = EventCategoryType.WEAPON;
  readonly originId: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.segments = (json.segments ?? []) as StatusSegment[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    this.onExitClause = (json.onExitClause ?? []) as ClausePredicate[];
    this.id = (props.id ?? '') as string;
    const weaponId = (meta.originId ?? '') as string;
    const prefix = this.id
      ? LocaleKey.weaponStatus(weaponId || GENERIC_WEAPON_ID, this.id)
      : '';
    this.name = prefix ? resolveEventName(prefix) : '';
    if (prefix) {
      const desc = resolveOptionalEventDescription(prefix);
      if (desc !== undefined) this.description = desc;
    }
    this.to = (props.to ?? 'OPERATOR') as string;
    this.toDeterminer = (props.toDeterminer ?? 'THIS') as string;
    this.duration = (props.duration ?? { value: { verb: VerbType.IS, value: 0 }, unit: UnitType.SECOND }) as DurationConfig;
    this.stacks = (props.stacks ?? {
      limit: { verb: VerbType.IS, value: 1 },
      interactionType: 'NONE',
    }) as StacksConfig;
    this.eventType = (props.eventType as EventType) ?? EventType.STATUS;
    this.eventCategoryType = props.eventCategoryType as string;
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
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      ...(this.onExitClause.length > 0 ? { onExitClause: this.onExitClause } : {}),
      properties: {
        id: this.id,
        // Reproject locale-resolved strings so configCache/getStatusDef surfaces them.
        ...(this.name ? { name: this.name } : {}),
        ...(this.description ? { description: this.description } : {}),
        to: this.to,
        toDeterminer: this.toDeterminer,
        duration: this.duration,
        stacks: this.stacks,
        eventType: this.eventType,
        eventCategoryType: this.eventCategoryType,
      },
      metadata: {
        originId: this.originId,
      },
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): WeaponStat {
    const errors = validateWeaponStat(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[WeaponStat] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new WeaponStat(json);
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All WeaponStats indexed by originId. */
const weaponStatCache = new Map<string, WeaponStat[]>();

// Route by eventCategoryType=WEAPON (not by path). The JSON's
// properties.eventCategoryType is the source of truth; paths are
// informational only so files can be reorganized without breaking the loader.
const weaponContext = require.context('./weapons', true, /\.json$/);
for (const key of weaponContext.keys()) {
  const json = weaponContext(key) as Record<string, unknown>;
  const props = (json.properties ?? {}) as Record<string, unknown>;
  if (props.eventCategoryType !== NounType.WEAPON) continue;
  const stat = WeaponStat.deserialize(json, key);
  if (stat.originId) {
    if (!weaponStatCache.has(stat.originId)) {
      weaponStatCache.set(stat.originId, []);
    }
    weaponStatCache.get(stat.originId)!.push(stat);
  }
}

/** Get all WeaponStats for a weapon by originId (e.g. "FORGEBORN_SCATHE"). */
export function getWeaponStats(originId: string): readonly WeaponStat[] {
  return weaponStatCache.get(originId) ?? [];
}

/** Get all registered weapon originIds that have WeaponStat definitions. */
export function getAllWeaponStatOriginIds(): string[] {
  return Array.from(weaponStatCache.keys());
}

/** Get all WeaponStats across all weapons. */
export function getAllWeaponStats(): readonly WeaponStat[] {
  const result: WeaponStat[] = [];
  weaponStatCache.forEach(stats => result.push(...stats));
  return result;
}
