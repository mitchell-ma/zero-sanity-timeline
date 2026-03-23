/**
 * OperatorsController — loads and deserializes operator JSON configs
 * into typed OperatorBase class instances.
 *
 * Auto-discovers operators/*-operator.json via require.context.
 */
import { checkKeys, VALID_METADATA_KEYS } from './validationUtils';

// ── Types ───────────────────────────────────────────────────────────────────

interface TalentEntry {
  id: string;
  name?: string;
  maxLevel: number;
}

interface AttributeIncreaseEntry {
  name: string;
  attribute: string;
  maxLevel?: number;
}

interface TalentsConfig {
  one?: TalentEntry;
  two?: TalentEntry;
  attributeIncrease?: AttributeIncreaseEntry;
}

interface TalentEffect {
  name: string;
  bonusType: string;
  source?: string;
  minPotential?: number;
  minLevel?: number;
  values?: number[];
  value?: unknown;
  condition?: Record<string, unknown>;
  label?: string;
  statSources?: unknown;
  waveCount?: number;
}

interface LevelEntry {
  level: number;
  operatorPromotionStage: number;
  attributes: Record<string, number>;
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_TOP_KEYS = new Set([
  'id', 'name', 'operatorRarity', 'operatorClassType',
  'elementType', 'weaponTypes',
  'mainAttributeType', 'secondaryAttributeType',
  'potentials', 'statsByLevel', 'talents', 'talentEffects', 'metadata',
]);

const VALID_TALENT_KEYS = new Set(['one', 'two', 'attributeIncrease']);
const VALID_TALENT_ENTRY_KEYS = new Set(['id', 'name', 'maxLevel']);
const VALID_ATTR_INCREASE_KEYS = new Set(['id', 'name', 'attribute', 'maxLevel']);

const VALID_TALENT_EFFECT_KEYS = new Set([
  'name', 'bonusType', 'source', 'minPotential', 'minLevel',
  'values', 'value', 'condition', 'label', 'statSources', 'waveCount',
]);

const VALID_LEVEL_ENTRY_KEYS = new Set(['level', 'operatorPromotionStage', 'attributes']);


/** Validate a raw operator JSON entry. Returns an array of error messages (empty = valid). */
export function validateOperator(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');

  if (typeof json.id !== 'string') errors.push('root.id: must be a string');
  if (typeof json.name !== 'string') errors.push('root.name: must be a string');
  if (typeof json.operatorRarity !== 'number') errors.push('root.operatorRarity: must be a number');
  if (typeof json.operatorClassType !== 'string') errors.push('root.operatorClassType: must be a string');
  if (typeof json.elementType !== 'string') errors.push('root.elementType: must be a string');

  if (!Array.isArray(json.weaponTypes)) errors.push('root.weaponTypes: must be an array');
  if (typeof json.mainAttributeType !== 'string') errors.push('root.mainAttributeType: must be a string');
  if (typeof json.secondaryAttributeType !== 'string') errors.push('root.secondaryAttributeType: must be a string');

  if (!Array.isArray(json.statsByLevel)) errors.push('root.statsByLevel: must be an array');
  else if (json.statsByLevel.length > 0) {
    const first = json.statsByLevel[0] as Record<string, unknown>;
    errors.push(...checkKeys(first, VALID_LEVEL_ENTRY_KEYS, 'statsByLevel[0]'));
  }

  if (json.talents) {
    const talents = json.talents as Record<string, unknown>;
    errors.push(...checkKeys(talents, VALID_TALENT_KEYS, 'talents'));
    if (talents.one) errors.push(...checkKeys(talents.one as Record<string, unknown>, VALID_TALENT_ENTRY_KEYS, 'talents.one'));
    if (talents.two) errors.push(...checkKeys(talents.two as Record<string, unknown>, VALID_TALENT_ENTRY_KEYS, 'talents.two'));
    if (talents.attributeIncrease) errors.push(...checkKeys(talents.attributeIncrease as Record<string, unknown>, VALID_ATTR_INCREASE_KEYS, 'talents.attributeIncrease'));
  }

  if (json.talentEffects) {
    if (!Array.isArray(json.talentEffects)) errors.push('root.talentEffects: must be an array');
    else (json.talentEffects as Record<string, unknown>[]).forEach((te, i) => errors.push(...checkKeys(te, VALID_TALENT_EFFECT_KEYS, `talentEffects[${i}]`)));
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));
  }

  return errors;
}

// ── OperatorBase class ──────────────────────────────────────────────────────

/** An operator definition. Maps 1:1 to the JSON shape. */
export class OperatorBase {
  readonly id: string;
  readonly name: string;
  readonly operatorRarity: number;
  readonly operatorClassType: string;
  readonly elementType: string;
  readonly weaponTypes: string[];
  readonly mainAttributeType: string;
  readonly secondaryAttributeType: string;
  readonly potentials: unknown[];
  readonly statsByLevel: LevelEntry[];
  readonly talents: TalentsConfig;
  readonly talentEffects: TalentEffect[];
  readonly originId: string;
  readonly dataSources: string[];
  /** Resolved icon URL (set by loader after construction). */
  icon?: string;

  constructor(json: Record<string, unknown>) {
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.id = (json.id ?? '') as string;
    this.name = (json.name ?? '') as string;
    this.operatorRarity = (json.operatorRarity ?? 0) as number;
    this.operatorClassType = (json.operatorClassType ?? '') as string;
    this.elementType = (json.elementType ?? '') as string;
    this.weaponTypes = (json.weaponTypes ?? []) as string[];
    this.mainAttributeType = (json.mainAttributeType ?? '') as string;
    this.secondaryAttributeType = (json.secondaryAttributeType ?? '') as string;
    this.potentials = (json.potentials ?? []) as unknown[];
    this.statsByLevel = (json.statsByLevel ?? []) as LevelEntry[];
    this.talents = (json.talents ?? {}) as TalentsConfig;
    this.talentEffects = (json.talentEffects ?? []) as TalentEffect[];
    this.originId = (meta.originId ?? '') as string;
    this.dataSources = (meta.dataSources ?? []) as string[];
  }

  /** Get attributes at a specific level and promotion stage. */
  getAttributes(level: number, promotionStage: number): Record<string, number> {
    // Find the exact match first
    for (const entry of this.statsByLevel) {
      if (entry.level === level && entry.operatorPromotionStage === promotionStage) {
        return entry.attributes;
      }
    }
    // Fallback: find highest entry at or below the given level for the promotion stage
    let best: LevelEntry | undefined;
    for (const entry of this.statsByLevel) {
      if (entry.operatorPromotionStage === promotionStage && entry.level <= level) {
        if (!best || entry.level > best.level) best = entry;
      }
    }
    return best?.attributes ?? {};
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      operatorRarity: this.operatorRarity,
      operatorClassType: this.operatorClassType,
      elementType: this.elementType,
      weaponTypes: this.weaponTypes,
      mainAttributeType: this.mainAttributeType,
      secondaryAttributeType: this.secondaryAttributeType,
      ...(this.potentials.length > 0 ? { potentials: this.potentials } : {}),
      talents: this.talents,
      ...(this.talentEffects.length > 0 ? { talentEffects: this.talentEffects } : {}),
      statsByLevel: this.statsByLevel,
      metadata: {
        originId: this.originId,
        ...(this.dataSources.length > 0 ? { dataSources: this.dataSources } : {}),
      },
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): OperatorBase {
    const errors = validateOperator(json);
    if (errors.length > 0) {
      const id = json.id ?? json.name ?? 'unknown';
      console.warn(`[OperatorBase] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new OperatorBase(json);
  }
}

// ── Icon auto-discovery ─────────────────────────────────────────────────────

const operatorIconContext = require.context('../../assets/operators', false, /\.(png|webp)$/);
const OPERATOR_ICONS: Record<string, string> = {};
for (const key of operatorIconContext.keys()) {
  const match = key.match(/\.\/(.+)\.(png|webp)$/);
  if (match) {
    OPERATOR_ICONS[match[1]] = operatorIconContext(key);
  }
}

function resolveOperatorIcon(name: string): string | undefined {
  // Try exact match with splash suffix
  const key = name.replace(/ /g, '_').toLowerCase();
  const splashKey = `${key}_splash`;
  if (OPERATOR_ICONS[splashKey]) return OPERATOR_ICONS[splashKey];

  // Try banner suffix
  const bannerKey = `${key}_banner`;
  if (OPERATOR_ICONS[bannerKey]) return OPERATOR_ICONS[bannerKey];

  // Try case-insensitive match
  const lcKey = key;
  for (const [k, v] of Object.entries(OPERATOR_ICONS)) {
    if (k.toLowerCase().includes(lcKey)) return v;
  }
  return undefined;
}

// ── Filename → camelCase ID ─────────────────────────────────────────────────

function filenameToCamelCase(filename: string): string {
  return filename.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All operators indexed by camelCase ID (e.g. "laevatain"). */
const operatorCache = new Map<string, OperatorBase>();
/** Name → ID index. */
const operatorNameIndex = new Map<string, string>();
/** OperatorType (UPPER_CASE) → camelCase ID index. */
const operatorTypeIndex = new Map<string, string>();
/** Custom operator overlay (takes priority over built-in). */
const customOperatorCache = new Map<string, OperatorBase>();

const operatorContext = require.context('./operators', false, /-operator\.json$/);
for (const key of operatorContext.keys()) {
  const filename = key.replace('./', '').replace('-operator.json', '');
  const operatorId = filenameToCamelCase(filename);
  const json = operatorContext(key) as Record<string, unknown>;
  const operator = OperatorBase.deserialize(json, key);
  if (operator.id) {
    operator.icon = resolveOperatorIcon(operator.name);
    operatorCache.set(operatorId, operator);
    operatorNameIndex.set(operator.name, operatorId);
    operatorTypeIndex.set(operator.id, operatorId);
  }
}

/** Get an operator by camelCase ID (e.g. "laevatain"). Checks custom first. */
export function getOperatorBase(operatorId: string): OperatorBase | undefined {
  return customOperatorCache.get(operatorId) ?? operatorCache.get(operatorId);
}

/** Get an operator by UPPER_CASE operatorType (e.g. "LAEVATAIN"). */
export function getOperatorBaseByType(operatorType: string): OperatorBase | undefined {
  const id = operatorTypeIndex.get(operatorType);
  if (!id) return undefined;
  return getOperatorBase(id);
}

/** Get operator ID by display name. */
export function getOperatorIdByName(name: string): string | undefined {
  let customMatch: string | undefined;
  customOperatorCache.forEach((o, id) => { if (o.name === name) customMatch = id; });
  if (customMatch) return customMatch;
  return operatorNameIndex.get(name);
}

/** Get all operator camelCase IDs (custom + built-in). */
export function getAllOperatorBaseIds(): string[] {
  const ids = new Set(customOperatorCache.keys());
  operatorCache.forEach((_, id) => ids.add(id));
  return Array.from(ids);
}

/** Get all operators (custom + built-in). */
export function getAllOperatorBases(): readonly OperatorBase[] {
  const merged = new Map<string, OperatorBase>();
  operatorCache.forEach((o, id) => merged.set(id, o));
  customOperatorCache.forEach((o, id) => merged.set(id, o));
  const result: OperatorBase[] = [];
  merged.forEach(o => result.push(o));
  return result;
}

/** Get all operators filtered by class type. */
export function getOperatorBasesByClass(classType: string): readonly OperatorBase[] {
  return getAllOperatorBases().filter(o => o.operatorClassType === classType);
}

/** Get all operators filtered by element type. */
export function getOperatorBasesByElement(elementType: string): readonly OperatorBase[] {
  return getAllOperatorBases().filter(o => o.elementType === elementType);
}

// ── Custom registration ─────────────────────────────────────────────────────

/** Register a custom operator (overlay — takes priority over built-in). */
export function registerCustomOperatorBase(operatorId: string, json: Record<string, unknown>, icon?: string): OperatorBase {
  const operator = OperatorBase.deserialize(json, 'custom');
  operator.icon = icon ?? resolveOperatorIcon(operator.name);
  customOperatorCache.set(operatorId, operator);
  operatorNameIndex.set(operator.name, operatorId);
  operatorTypeIndex.set(operator.id, operatorId);
  return operator;
}

/** Deregister a custom operator by ID. */
export function deregisterCustomOperatorBase(operatorId: string): void {
  const operator = customOperatorCache.get(operatorId);
  if (operator) {
    customOperatorCache.delete(operatorId);
    if (operatorNameIndex.get(operator.name) === operatorId) {
      operatorNameIndex.delete(operator.name);
      operatorCache.forEach((o, id) => { if (o.name === operator.name) operatorNameIndex.set(o.name, id); });
    }
    if (operatorTypeIndex.get(operator.id) === operatorId) {
      operatorTypeIndex.delete(operator.id);
      operatorCache.forEach((o, id) => { if (o.id === operator.id) operatorTypeIndex.set(o.id, id); });
    }
  }
}
