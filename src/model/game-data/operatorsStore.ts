/**
 * OperatorsController — loads and deserializes operator JSON configs
 * into typed OperatorBase class instances.
 *
 * Auto-discovers operators/*-operator.json via require.context.
 */
import { checkKeys, VALID_METADATA_KEYS, validateTalentLevelArrays, validateNonNegativeValues } from './validationUtils';
import { NounType, VerbType } from '../../dsl/semantics';

// ── Types ───────────────────────────────────────────────────────────────────

interface TalentEntry {
  id: string;
  name?: string;
  description?: string;
  maxLevel: number;
}

interface AttributeIncreaseEntry {
  name: string;
  attribute: string;
}

interface TalentsConfig {
  one?: TalentEntry;
  two?: TalentEntry;
  attributeIncrease?: AttributeIncreaseEntry;
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
  'potentials', 'statsByLevel', 'talents', 'metadata',
]);

const VALID_TALENT_KEYS = new Set(['one', 'two', 'attributeIncrease']);
const VALID_ATTR_INCREASE_KEYS = new Set(['id', 'name', 'attribute']);


const VALID_LEVEL_ENTRY_KEYS = new Set(['level', 'operatorPromotionStage', 'attributes']);


/** Validate a raw operator JSON entry. Returns an array of error messages (empty = valid). */
export function validateOperator(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

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
    if (talents.one && typeof talents.one !== 'string') errors.push('talents.one: must be a talent ID string');
    if (talents.two && typeof talents.two !== 'string') errors.push('talents.two: must be a talent ID string');
    if (talents.attributeIncrease) errors.push(...checkKeys(talents.attributeIncrease as Record<string, unknown>, VALID_ATTR_INCREASE_KEYS, 'talents.attributeIncrease'));
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

// ── Potential file → consumer format conversion ─────────────────────────────

interface ResolvedPotential {
  level: number;
  name: string;
  description?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPotentialsFromFiles(context: any, operatorDir: string): { resolved: ResolvedPotential[]; raw: Record<string, unknown>[] } {
  const potentials: ResolvedPotential[] = [];
  const rawPotentials: Record<string, unknown>[] = [];
  for (const key of context.keys()) {
    const match = key.match(new RegExp(`^\\./${operatorDir}/potentials/potential-(\\d+)-`));
    if (!match) continue;
    const json = context(key) as Record<string, unknown>;
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const level = (props.level ?? parseInt(match[1])) as number;
    if (!level) continue;

    rawPotentials.push(json);

    potentials.push({
      level,
      name: (props.name ?? '') as string,
      ...(props.description ? { description: props.description as string } : {}),
    });
  }
  return {
    resolved: potentials.sort((a, b) => a.level - b.level),
    raw: rawPotentials.sort((a, b) => ((a.properties as Record<string, unknown>)?.level as number ?? 0) - ((b.properties as Record<string, unknown>)?.level as number ?? 0)),
  };
}

// ── Talent file → TalentEntry resolution ────────────────────────────────────

/** Resolve a ValueNode-style maxLevel property: { verb: "IS", value: N }. */
function resolveMaxLevel(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null;
  const rec = node as Record<string, unknown>;
  if (rec.verb === VerbType.IS && typeof rec.value === 'number') return rec.value;
  return null;
}

/** Derive maxLevel from the longest VARY_BY TALENT_LEVEL array in a JSON tree. */
function deriveTalentMaxLevel(obj: unknown): number {
  if (Array.isArray(obj)) return Math.max(0, ...obj.map(deriveTalentMaxLevel));
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    if (rec.object === NounType.TALENT_LEVEL && rec.verb === VerbType.VARY_BY && Array.isArray(rec.value)) {
      return rec.value.length;
    }
    return Math.max(0, ...Object.values(rec).map(deriveTalentMaxLevel));
  }
  return 0;
}

/** Build a map of talent ID → TalentEntry from talent JSON files for a given operator directory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadTalentsFromFiles(context: any, operatorDir: string): Map<string, TalentEntry> {
  const entries = new Map<string, TalentEntry>();
  for (const key of context.keys()) {
    const match = key.match(new RegExp(`^\\./${operatorDir}/talents/talent-`));
    if (!match) continue;
    const json = context(key) as Record<string, unknown>;
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const id = props.id as string | undefined;
    if (!id) continue;
    const rawName = (props.name ?? '') as string;
    const entry: TalentEntry = {
      id,
      name: rawName.replace(/ \(Talent\)$/, ''),
      maxLevel: resolveMaxLevel(props.maxLevel) ?? (deriveTalentMaxLevel(json) || 1),
    };
    if (typeof props.description === 'string') entry.description = props.description;
    entries.set(id, entry);
  }
  return entries;
}

/** Resolve talent string IDs in a raw JSON talents config using loaded talent files. */
function resolveTalentRefs(
  talents: Record<string, unknown>,
  talentMap: Map<string, TalentEntry>,
): void {
  for (const slot of ['one', 'two'] as const) {
    const val = talents[slot];
    if (typeof val === 'string') {
      const entry = talentMap.get(val);
      if (entry) {
        talents[slot] = entry;
      } else {
        console.warn(`[OperatorsStore] Talent ID "${val}" not found in talent files`);
        talents[slot] = { id: val, maxLevel: 1 };
      }
    }
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All operators indexed by JSON id (e.g. "LAEVATAIN"). */
const operatorCache = new Map<string, OperatorBase>();
/** Name → ID index. */
const operatorNameIndex = new Map<string, string>();
/** Directory name (kebab-case) → JSON id mapping for cross-store resolution. */
const dirToIdIndex = new Map<string, string>();
/** Custom operator overlay (takes priority over built-in). */
const customOperatorCache = new Map<string, OperatorBase>();
/** Raw potential JSON data indexed by operator JSON id. */
const potentialRawCache = new Map<string, Record<string, unknown>[]>();

const operatorContext = require.context('./operators', true, /\/[^/]+\/[^/]+\.json$/);
for (const key of operatorContext.keys()) {
  // Match files directly in operator subdirs (e.g. ./laevatain/laevatain.json)
  // but skip potentials/, skills/, statuses/, talents/, generic/
  const match = key.match(/^\.\/([^/]+)\/[^/]+\.json$/);
  if (!match || match[1] === 'generic') continue;
  // Skip subdirectory files (potentials, skills, statuses, talents)
  if (key.includes('/potentials/') || key.includes('/skills/') || key.includes('/statuses/') || key.includes('/talents/')) continue;

  const dirName = match[1];
  const json = operatorContext(key) as Record<string, unknown>;

  // Validate raw JSON before any resolution
  const errors = validateOperator(json);
  if (errors.length > 0) {
    const id = json.id ?? json.name ?? 'unknown';
    console.warn(`[OperatorBase] Validation errors in ${key ?? id}:\n  ${errors.join('\n  ')}`);
  }

  // Load potentials from separate files instead of inline data
  const { resolved: potentials, raw: rawPotentials } = loadPotentialsFromFiles(operatorContext, dirName);
  if (potentials.length > 0) {
    json.potentials = potentials;
  }

  // Resolve talent string IDs from talent JSON files
  // Clone talents to avoid mutating the shared JSON module
  let resolvedJson: Record<string, unknown> = json;
  let talentMap: Map<string, TalentEntry> | undefined;
  if (json.talents) {
    talentMap = loadTalentsFromFiles(operatorContext, dirName);
    const resolvedTalents = { ...(json.talents as Record<string, unknown>) };
    resolveTalentRefs(resolvedTalents, talentMap);
    resolvedJson = { ...json, talents: resolvedTalents };
  }

  // VARY_BY TALENT_LEVEL array shape audit. Builds the set of allowed array
  // lengths from the operator's talent maxLevels (each maxLevel + 1) and
  // walks every file in the operator's subdirectories, checking that each
  // VARY_BY TALENT_LEVEL array has a length matching one of those values.
  // Catches missing-leading-zero bugs (`feedback_talent_levels_zero_indexed.md`).
  if (talentMap && talentMap.size > 0) {
    const allowedLengths = new Set<number>();
    talentMap.forEach((entry) => allowedLengths.add(entry.maxLevel + 1));
    if (allowedLengths.size > 0) {
      for (const fileKey of operatorContext.keys()) {
        const fileMatch = fileKey.match(
          new RegExp(`^\\./${dirName}/(skills|statuses|talents|potentials)/([^/]+\\.json)$`),
        );
        if (!fileMatch) continue;
        const fileJson = operatorContext(fileKey) as Record<string, unknown>;
        const sourceKey = `${dirName}/${fileMatch[1]}/${fileMatch[2]}`;
        const arrErrors = validateTalentLevelArrays(fileJson, allowedLengths, sourceKey);
        if (arrErrors.length > 0) {
          console.warn(
            `[OperatorsStore] TALENT_LEVEL array shape errors in ${sourceKey}:\n  `
            + arrErrors.join('\n  '),
          );
        }
      }
    }
  }

  const operator = new OperatorBase(resolvedJson);
  if (operator.id) {
    const operatorId = operator.id;
    operator.icon = resolveOperatorIcon(operator.name);
    operatorCache.set(operatorId, operator);
    operatorNameIndex.set(operator.name, operatorId);
    dirToIdIndex.set(dirName, operatorId);
    if (rawPotentials.length > 0) {
      potentialRawCache.set(operatorId, rawPotentials);
    }
  }
}

/** Get an operator by JSON id (e.g. "LAEVATAIN"). Checks custom first. */
export function getOperatorBase(operatorId: string): OperatorBase | undefined {
  return customOperatorCache.get(operatorId) ?? operatorCache.get(operatorId);
}

/** Get raw potential JSON data for an operator by JSON id. */
export function getOperatorPotentialRaw(operatorId: string): readonly Record<string, unknown>[] {
  return potentialRawCache.get(operatorId) ?? [];
}

/** Resolve a directory name (kebab-case) to JSON operator id. */
export function resolveOperatorDirToId(dirName: string): string | undefined {
  return dirToIdIndex.get(dirName);
}

/** @deprecated Use getOperatorBase — operator IDs are now JSON ids. */
export function getOperatorBaseByType(operatorType: string): OperatorBase | undefined {
  return getOperatorBase(operatorType);
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
  }
}
