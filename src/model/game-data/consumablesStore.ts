/**
 * ConsumablesStore — loads and deserializes consumable & tactical JSON configs.
 *
 * Auto-discovers:
 *   consumables/consumables/*.json  → ConsumableData
 *   consumables/tacticals/*.json    → TacticalData
 */
import { StatType, UnitType, EventType, EventCategoryType, StackInteractionType } from '../../consts/enums';
import { VerbType, NounType, DeterminerType } from '../../dsl/semantics';
import type { Interaction, ValueNode } from '../../dsl/semantics';
import { checkKeys, VALID_CLAUSE_KEYS } from './validationUtils';

// ── Shared duration type (matches weapon/operator status stores) ────────────

interface DurationConfig {
  value: ValueNode;
  unit: UnitType;
}

// ── Shared types ────────────────────────────────────────────────────────────

interface ClausePredicate {
  conditions?: Record<string, unknown>[];
  effects?: Record<string, unknown>[];
}

interface SegmentData {
  properties?: Record<string, unknown>;
  frames?: FrameData[];
}

interface FrameData {
  properties?: Record<string, unknown>;
  clause?: ClausePredicate[];
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_CONSUMABLE_TOP_KEYS = new Set(['properties', 'clause', 'metadata']);
const VALID_TACTICAL_TOP_KEYS = new Set(['properties', 'onTriggerClause', 'segments', 'metadata']);
const VALID_CONSUMABLE_PROPERTIES_KEYS = new Set(['id', 'name', 'rarity', 'duration']);
const VALID_TACTICAL_PROPERTIES_KEYS = new Set(['id', 'name', 'rarity', 'usageLimit']);
const VALID_METADATA_KEYS = new Set(['dataSources', 'icon', 'originId']);

function validateProperties(props: Record<string, unknown>, validKeys: Set<string>): string[] {
  const errors = checkKeys(props, validKeys, 'properties');
  if (typeof props.id !== 'string') errors.push('properties.id: must be a string');
  if (typeof props.name !== 'string') errors.push('properties.name: must be a string');
  if (typeof props.rarity !== 'number') errors.push('properties.rarity: must be a number');
  return errors;
}

export function validateConsumable(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_CONSUMABLE_TOP_KEYS, 'root');
  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...validateProperties(props, VALID_CONSUMABLE_PROPERTIES_KEYS));
  if (!Array.isArray(json.clause)) errors.push('root.clause: must be an array');
  else (json.clause as Record<string, unknown>[]).forEach((c, i) => {
    errors.push(...checkKeys(c, VALID_CLAUSE_KEYS, `clause[${i}]`));
  });
  if (json.metadata) errors.push(...checkKeys(json.metadata as Record<string, unknown>, VALID_METADATA_KEYS, 'metadata'));
  return errors;
}

export function validateTactical(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TACTICAL_TOP_KEYS, 'root');
  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...validateProperties(props, VALID_TACTICAL_PROPERTIES_KEYS));
  if (!props.usageLimit || typeof props.usageLimit !== 'object') errors.push('properties.usageLimit: must be a ValueNode');
  if (!Array.isArray(json.onTriggerClause)) errors.push('root.onTriggerClause: must be an array');
  if (!Array.isArray(json.segments)) errors.push('root.segments: must be an array');
  if (json.metadata) errors.push(...checkKeys(json.metadata as Record<string, unknown>, VALID_METADATA_KEYS, 'metadata'));
  return errors;
}

// ── Clause value extraction helpers ─────────────────────────────────────────

/** Extract { statId: value } from APPLY STAT effects in a clause array. */
function extractStatsFromClauses(clauses: ClausePredicate[]): Partial<Record<StatType, number>> {
  const stats: Partial<Record<StatType, number>> = {};
  for (const clause of clauses) {
    for (const ef of clause.effects ?? []) {
      if (ef.verb === VerbType.APPLY && ef.object === NounType.STAT && ef.objectId) {
        const wv = (ef.with as Record<string, unknown>)?.value as { value?: number } | undefined;
        if (wv?.value != null) {
          stats[ef.objectId as StatType] = wv.value;
        }
      }
    }
  }
  return stats;
}

/** Resolve a DurationConfig to seconds. */
function resolveDurationSeconds(dur: DurationConfig): number {
  const vn = dur.value as { value?: number };
  return vn?.value ?? 0;
}

/** Extract the trigger condition (first condition of first onTriggerClause entry). */
function extractTriggerCondition(clauses: ClausePredicate[]): Interaction {
  const first = clauses[0];
  if (!first?.conditions?.length) return {} as Interaction;
  return first.conditions[0] as unknown as Interaction;
}

/** Extract trigger threshold from the onTriggerClause condition's with.value. */
function extractTriggerThreshold(clauses: ClausePredicate[]): number {
  const first = clauses[0];
  const cond = first?.conditions?.[0] as Record<string, unknown> | undefined;
  const wv = (cond?.with as Record<string, unknown>)?.value as { value?: number } | undefined;
  return wv?.value ?? 0;
}

/** Extract ultEnergyRestore from the first segment's first frame's RECOVER ULTIMATE_ENERGY effect. */
function extractUltEnergyRestore(segments: SegmentData[]): number {
  for (const seg of segments) {
    for (const frame of seg.frames ?? []) {
      for (const clause of frame.clause ?? []) {
        for (const ef of clause.effects ?? []) {
          if (ef.verb === VerbType.RECOVER && ef.object === NounType.ULTIMATE_ENERGY) {
            const wv = (ef.with as Record<string, unknown>)?.value as { value?: number } | undefined;
            return wv?.value ?? 0;
          }
        }
      }
    }
  }
  return 0;
}

/** Extract segment duration from the first segment. */
function extractSegmentDuration(segments: SegmentData[]): DurationConfig | undefined {
  const first = segments[0];
  return first?.properties?.duration as DurationConfig | undefined;
}

// ── Data classes ────────────────────────────────────────────────────────────

export class ConsumableData {
  readonly id: string;
  readonly name: string;
  readonly rarity: number;
  readonly clause: ClausePredicate[];
  readonly duration: DurationConfig;
  /** Pre-extracted stat bonuses from clause effects. */
  readonly stats: Partial<Record<StatType, number>>;
  icon?: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    this.rarity = (props.rarity ?? 0) as number;
    this.clause = (json.clause ?? []) as ClausePredicate[];
    this.duration = props.duration as DurationConfig;
    this.stats = extractStatsFromClauses(this.clause);
  }

  get durationSeconds(): number {
    return resolveDurationSeconds(this.duration);
  }

  /** Serialize as a talent-shaped passive def for the event pipeline. */
  serializeAsTriggerDef(): Record<string, unknown> {
    return {
      clause: this.clause,
      properties: {
        id: this.id,
        name: this.name,
        target: NounType.OPERATOR,
        targetDeterminer: DeterminerType.THIS,
        stacks: { limit: { verb: VerbType.IS, value: 1 }, interactionType: StackInteractionType.NONE },
        duration: this.duration,
        eventType: EventType.STATUS,
        eventCategoryType: EventCategoryType.TALENT,
      },
      metadata: {},
    };
  }

  static deserialize(json: Record<string, unknown>, source?: string) {
    const errors = validateConsumable(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[Consumable] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new ConsumableData(json);
  }
}

export class TacticalData {
  readonly id: string;
  readonly name: string;
  readonly rarity: number;
  readonly usageLimit: ValueNode;
  readonly onTriggerClause: ClausePredicate[];
  readonly segments: SegmentData[];
  /** Pre-extracted trigger condition from onTriggerClause. */
  readonly triggerCondition: Interaction;
  /** Pre-extracted from segment frame clause. */
  readonly ultEnergyRestore: number;
  /** Pre-extracted from onTriggerClause condition threshold. */
  readonly triggerThreshold: number;
  /** Segment duration as DSL struct. */
  readonly duration: DurationConfig;
  icon?: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    this.rarity = (props.rarity ?? 0) as number;
    this.usageLimit = props.usageLimit as ValueNode;
    this.onTriggerClause = (json.onTriggerClause ?? []) as ClausePredicate[];
    this.segments = (json.segments ?? []) as SegmentData[];
    this.triggerCondition = extractTriggerCondition(this.onTriggerClause);
    this.ultEnergyRestore = extractUltEnergyRestore(this.segments);
    this.triggerThreshold = extractTriggerThreshold(this.onTriggerClause);
    this.duration = extractSegmentDuration(this.segments)!;
  }

  get resolvedUsageLimit(): number {
    return (this.usageLimit as { value?: number }).value ?? 1;
  }

  get durationSeconds(): number {
    return resolveDurationSeconds(this.duration);
  }

  /** Serialize as a talent-shaped trigger source def for the event pipeline. */
  serializeAsTriggerDef(): Record<string, unknown> {
    return {
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      properties: {
        id: this.id,
        name: this.name,
        target: NounType.OPERATOR,
        targetDeterminer: DeterminerType.THIS,
        stacks: { limit: { verb: VerbType.IS, value: 1 }, interactionType: StackInteractionType.NONE },
        eventType: EventType.STATUS,
        eventCategoryType: EventCategoryType.TALENT,
      },
      metadata: {},
      usageLimit: this.resolvedUsageLimit,
    };
  }

  static deserialize(json: Record<string, unknown>, source?: string) {
    const errors = validateTactical(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[Tactical] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new TacticalData(json);
  }
}

// ── Icon auto-discovery ─────────────────────────────────────────────────────

const consumableIconContext = require.context('../../assets/consumables', false, /\.(png|webp)$/);
const CONSUMABLE_ICONS: Record<string, string> = {};
for (const key of consumableIconContext.keys()) {
  const match = key.match(/\.\/(.+)\.(png|webp)$/);
  if (match) {
    CONSUMABLE_ICONS[match[1]] = consumableIconContext(key);
  }
}

function resolveConsumableIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_').toLowerCase();
  return CONSUMABLE_ICONS[key];
}

// ── Loader ──────────────────────────────────────────────────────────────────

const consumableCache = new Map<string, ConsumableData>();
const consumableNameIndex = new Map<string, string>();

const consumableContext = require.context('./consumables/consumables', false, /\.json$/);
for (const key of consumableContext.keys()) {
  const json = consumableContext(key) as Record<string, unknown>;
  const consumable = ConsumableData.deserialize(json, key);
  if (consumable.id) {
    consumable.icon = resolveConsumableIcon(consumable.name);
    consumableCache.set(consumable.id, consumable);
    consumableNameIndex.set(consumable.name, consumable.id);
  }
}

const tacticalCache = new Map<string, TacticalData>();
const tacticalNameIndex = new Map<string, string>();

const tacticalContext = require.context('./consumables/tacticals', false, /\.json$/);
for (const key of tacticalContext.keys()) {
  const json = tacticalContext(key) as Record<string, unknown>;
  const tactical = TacticalData.deserialize(json, key);
  if (tactical.id) {
    tactical.icon = resolveConsumableIcon(tactical.name);
    tacticalCache.set(tactical.id, tactical);
    tacticalNameIndex.set(tactical.name, tactical.id);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getConsumable(consumableId: string): ConsumableData | undefined {
  return consumableCache.get(consumableId);
}

export function getAllConsumables(): readonly ConsumableData[] {
  return Array.from(consumableCache.values());
}

export function getConsumableIdByName(name: string): string | undefined {
  return consumableNameIndex.get(name);
}

export function getTactical(tacticalId: string): TacticalData | undefined {
  return tacticalCache.get(tacticalId);
}

export function getAllTacticals(): readonly TacticalData[] {
  return Array.from(tacticalCache.values());
}

export function getTacticalIdByName(name: string): string | undefined {
  return tacticalNameIndex.get(name);
}
