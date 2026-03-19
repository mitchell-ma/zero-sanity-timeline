import {
  buildSequencesFromOperatorJson,
  DataDrivenSkillEventSequence,
} from "./dataDrivenEventFrames";
import { OPERATOR_COLUMNS } from '../channels';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { validateStatusConfig } from '../game-data/statusConfigValidator';

// ── Auto-discover operator + skill JSON files ────────────────────────────────

/** Convert kebab-case filename to camelCase operator ID. */
function filenameToCamelCase(filename: string): string {
  return filename.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Operator base configs: game-data/operators/*-operator.json
const operatorContext = require.context('../game-data/operators', false, /-operator\.json$/);
const OPERATOR_JSON: Record<string, Record<string, any>> = {};
for (const key of operatorContext.keys()) {
  const filename = key.replace('./', '').replace('-operator.json', '');
  OPERATOR_JSON[filenameToCamelCase(filename)] = operatorContext(key);
}

// Skill configs: game-data/operator-skills/*-skills.json
const skillContext = require.context('../game-data/operator-skills', false, /-skills\.json$/);
const SKILL_JSON: Record<string, Record<string, any>> = {};
for (const key of skillContext.keys()) {
  const filename = key.replace('./', '').replace('-skills.json', '');
  SKILL_JSON[filenameToCamelCase(filename)] = skillContext(key);
}

// Talent configs: game-data/operator-talents/*-talents.json
const talentContext = require.context('../game-data/operator-talents', false, /-talents\.json$/);
const TALENT_JSON: Record<string, Record<string, any>> = {};
for (const key of talentContext.keys()) {
  const filename = key.replace('./', '').replace('-talents.json', '');
  TALENT_JSON[filenameToCamelCase(filename)] = talentContext(key);
}

// Status configs: game-data/operator-statuses/*-statuses.json
const statusContext = require.context('../game-data/operator-statuses', false, /-statuses\.json$/);
const STATUS_JSON: Record<string, any[]> = {};
for (const key of statusContext.keys()) {
  const filename = key.replace('./', '').replace('-statuses.json', '');
  STATUS_JSON[filenameToCamelCase(filename)] = statusContext(key);
}

// Validate status and talent configs at load time
for (const [operatorId, statuses] of Object.entries(STATUS_JSON)) {
  const errors = validateStatusConfig(statuses, operatorId);
  if (errors.length > 0) {
    console.warn(`[statusValidator] ${operatorId}-statuses.json:`, errors.map(e => `${e.path}: ${e.message}`).join('; '));
  }
}
for (const [operatorId, talentJson] of Object.entries(TALENT_JSON)) {
  const talentStatuses = talentJson?.statusEvents as Record<string, unknown>[] | undefined;
  if (talentStatuses) {
    const errors = validateStatusConfig(talentStatuses, operatorId);
    if (errors.length > 0) {
      console.warn(`[statusValidator] ${operatorId}-talents.json:`, errors.map(e => `${e.path}: ${e.message}`).join('; '));
    }
  }
}

// ── Status key normalization ─────────────────────────────────────────────────

/** Key mappings: short (operator-statuses) → long (engine-expected). */
const KEY_EXPAND: Record<string, string> = {
  verb: 'verb', object: 'object', subject: 'subject',
  to: 'toObject',
  from: 'fromObject',
  on: 'onObject',
  with: 'with', for: 'for',
};

/** Recursively expand short keys in a JSON value. */
function expandKeys(val: any): any {
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(expandKeys);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    out[KEY_EXPAND[k] ?? k] = expandKeys(v);
  }
  return out;
}

// ── Exchange status config (derived from status JSONs with type=EXCHANGE) ────

const FPS_LOAD = 120;

/** Config for a single exchange status, derived from its JSON definition. */
export interface ExchangeStatusInfo {
  columnId: string;
  durationFrames: number;
}

function buildExchangeStatusConfig(): Record<string, ExchangeStatusInfo> {
  const config: Record<string, ExchangeStatusInfo> = {};
  const permanentDuration = TOTAL_FRAMES * 10;

  for (const statuses of Object.values(STATUS_JSON)) {
    for (const status of statuses) {
      const expanded = expandKeys(status);
      const props = expanded.properties;
      if (!props || props.type !== 'EXCHANGE') continue;
      const id = props.id as string;
      const columnId = (OPERATOR_COLUMNS as Record<string, string>)[id]
        ?? id.toLowerCase().replace(/_/g, '-');
      let durationFrames = permanentDuration;
      if (props.duration) {
        const val = Array.isArray(props.duration.value) ? props.duration.value[0] : props.duration.value;
        if (val >= 0) {
          durationFrames = props.duration.unit === 'SECOND' ? Math.round(val * FPS_LOAD) : val;
        }
      }
      config[id] = { columnId, durationFrames };
    }
  }
  return config;
}

/** Exchange status config map — keyed by status ID (e.g. MELTING_FLAME → { columnId, durationFrames }). */
let _exchangeStatusConfig: Record<string, ExchangeStatusInfo> | null = null;
export function getExchangeStatusConfig(): Record<string, ExchangeStatusInfo> {
  if (!_exchangeStatusConfig) _exchangeStatusConfig = buildExchangeStatusConfig();
  return _exchangeStatusConfig;
}

/** Set of all exchange status IDs, derived from status JSON configs with type=EXCHANGE. */
let _exchangeStatusIds: ReadonlySet<string> | null = null;
export function getExchangeStatusIds(): ReadonlySet<string> {
  if (!_exchangeStatusIds) _exchangeStatusIds = new Set(Object.keys(getExchangeStatusConfig()));
  return _exchangeStatusIds;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Sequence cache keyed by `operatorId:skillId`. */
const sequenceCache = new Map<string, readonly DataDrivenSkillEventSequence[]>();

/** Get the raw operator JSON for a given operator ID (includes skills merged in). */
export function getOperatorJson(operatorId: string): Record<string, any> | undefined {
  const base = OPERATOR_JSON[operatorId];
  if (!base) return undefined;
  const skills = SKILL_JSON[operatorId];
  if (!skills) return base;
  // Hoist non-skill keys (statusEvents, skillTypeMap) from skills JSON to top level
  const { statusEvents, skillTypeMap, ...skillEntries } = skills as Record<string, any>;
  // Merge status sources: operator-statuses JSONs (short keys → expanded) > skills JSON > talent JSON
  const operatorStatuses = (STATUS_JSON[operatorId] ?? []).map(expandKeys);
  const talentJson = TALENT_JSON[operatorId];
  const talentStatusEvents = talentJson?.statusEvents as any[] | undefined;
  const mergedStatusEvents = [
    ...operatorStatuses,
    ...(statusEvents ?? []),
    ...(talentStatusEvents ?? []),
  ];
  return {
    ...base,
    skills: skillEntries,
    skillTypeMap,
    ...(mergedStatusEvents.length > 0 ? { statusEvents: mergedStatusEvents } : {}),
  };
}

/** Get the skill JSON for a given operator ID. */
export function getSkillJson(operatorId: string): Record<string, any> | undefined {
  return SKILL_JSON[operatorId];
}

/** Get the operator-statuses JSON for a given operator ID. */
export function getOperatorStatuses(operatorId: string): any[] | undefined {
  return STATUS_JSON[operatorId];
}

/** Get all registered operator IDs. */
export function getAllOperatorIds(): string[] {
  return Object.keys(OPERATOR_JSON);
}

// ── Skill ID resolution ────────────────────────────────────────────────────

/**
 * Get all skill IDs for an operator (keys of the skills JSON, excluding metadata).
 * Includes FINISHER and DIVE as universal basic-attack skill IDs.
 */
export function getSkillIds(operatorId: string): Set<string> {
  const skills = SKILL_JSON[operatorId];
  if (!skills) return new Set();
  const ids = new Set<string>();
  ids.add('FINISHER');
  ids.add('DIVE');
  for (const key of Object.keys(skills)) {
    if (key === 'statusEvents' || key === 'skillTypeMap') continue;
    ids.add(key);
  }
  return ids;
}

/**
 * Get the raw skill type map for an operator.
 * BASIC_ATTACK may be an object { BATK, FINISHER, DIVE }; other entries are strings.
 */
export function getRawSkillTypeMap(operatorId: string): Record<string, any> {
  return SKILL_JSON[operatorId]?.skillTypeMap ?? {};
}

/**
 * Get the flattened skill type map: { BASIC_ATTACK → batkId, BATTLE_SKILL → id, ... }.
 * For BASIC_ATTACK, resolves to the BATK sub-entry.
 */
export function getSkillTypeMap(operatorId: string): Record<string, string> {
  const raw = getRawSkillTypeMap(operatorId);
  const flat: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    flat[key] = typeof val === 'string' ? val : val?.BATK ?? key;
  }
  return flat;
}

/**
 * Resolve the skill type (BASIC_ATTACK, BATTLE_SKILL, etc.) for a given skill ID.
 * Uses the skillTypeMap + variant suffix convention (_ENHANCED, _EMPOWERED, _ENHANCED_EMPOWERED).
 */
export function resolveSkillType(operatorId: string, skillId: string): string | null {
  if (skillId === 'FINISHER' || skillId === 'DIVE') return 'BASIC_ATTACK';
  const typeMap = getSkillTypeMap(operatorId);
  // Direct match: base skill ID is in the type map values
  for (const [type, baseId] of Object.entries(typeMap)) {
    if (baseId === skillId) return type;
  }
  // Variant match: strip suffix and check
  const suffixes = ['_ENHANCED_EMPOWERED', '_ENHANCED', '_EMPOWERED'];
  for (const suffix of suffixes) {
    if (skillId.endsWith(suffix)) {
      const baseId = skillId.slice(0, -suffix.length);
      for (const [type, id] of Object.entries(typeMap)) {
        if (id === baseId) return type;
      }
    }
  }
  return null;
}

/** Get frame sequences for a skill ID, with caching. */
export function getFrameSequences(
  operatorId: string,
  skillId: string,
): readonly DataDrivenSkillEventSequence[] {
  const cacheKey = `${operatorId}:${skillId}`;
  const cached = sequenceCache.get(cacheKey);
  if (cached) return cached;

  const json = getOperatorJson(operatorId);
  if (!json) return [];

  const sequences = buildSequencesFromOperatorJson(json, skillId);
  sequenceCache.set(cacheKey, sequences);
  return sequences;
}

/**
 * Get segment labels for a multi-sequence skill.
 * Returns undefined for single-sequence skills.
 */
export function getSegmentLabels(
  operatorId: string,
  skillId: string,
): string[] | undefined {
  const sequences = getFrameSequences(operatorId, skillId);
  if (sequences.length <= 1) return undefined;

  const labels = sequences
    .map(seq => seq.segmentName)
    .filter((name): name is string => name != null);

  // If segments have names, use them; otherwise return undefined (basic attack uses index labels)
  return labels.length === sequences.length ? labels : undefined;
}

/**
 * Get the delayedHitLabel for a skill (from properties.delayedHitLabel in the skills JSON).
 * Returns undefined if not set.
 */
export function getDelayedHitLabel(
  operatorId: string,
  skillId: string,
): string | undefined {
  const json = getOperatorJson(operatorId);
  if (!json) return undefined;
  const skills = json.skills as Record<string, any> | undefined;
  if (!skills) return undefined;
  const skillData = skills[skillId];
  return skillData?.properties?.delayedHitLabel;
}

/**
 * Get the combo skill's onTriggerClause from the skills JSON.
 * Resolves COMBO_SKILL → actual skill ID → properties.trigger.onTriggerClause.
 */
export function getComboTriggerClause(operatorId: string): readonly { conditions: any[] }[] | undefined {
  const json = getOperatorJson(operatorId);
  if (!json) return undefined;
  const skills = json.skills as Record<string, any> | undefined;
  const typeMap = getSkillTypeMap(operatorId);
  const comboSkillId = typeMap.COMBO_SKILL;
  if (!comboSkillId || !skills?.[comboSkillId]) return undefined;
  return skills[comboSkillId].properties?.trigger?.onTriggerClause;
}

/** Combo trigger info extracted from skills JSON. */
export interface ComboTriggerInfo {
  onTriggerClause: readonly { conditions: any[] }[];
  description: string;
  windowFrames: number;
}

/**
 * Get the combo skill's trigger info from the skills JSON.
 * Returns onTriggerClause, description, and windowFrames.
 */
export function getComboTriggerInfo(operatorId: string): ComboTriggerInfo | undefined {
  const json = getOperatorJson(operatorId);
  if (!json) return undefined;
  const skills = json.skills as Record<string, any> | undefined;
  const typeMap = getSkillTypeMap(operatorId);
  const comboSkillId = typeMap.COMBO_SKILL;
  if (!comboSkillId || !skills?.[comboSkillId]) return undefined;
  const trigger = skills[comboSkillId].properties?.trigger;
  if (!trigger?.onTriggerClause?.length) return undefined;
  return {
    onTriggerClause: trigger.onTriggerClause,
    description: trigger.description ?? '',
    windowFrames: trigger.windowFrames ?? 720,
  };
}

// ── ID collection helpers ───────────────────────────────────────────────────

/** Status entry: ID + display label. */
export interface StatusIdEntry { id: string; label: string; }

/**
 * Collect all status IDs with display names.
 * Sources: operator-statuses configs + StatusType enum (covers physical statuses, gear buffs, etc.).
 */
let _allStatusEntries: StatusIdEntry[] | null = null;
export function getAllStatusIds(): StatusIdEntry[] {
  if (_allStatusEntries) return _allStatusEntries;
  const seen = new Set<string>();
  const entries: StatusIdEntry[] = [];
  const { STATUS_LABELS } = require('../../consts/timelineColumnLabels');
  const { StatusType, ReactionType } = require('../../consts/enums');

  const reactionIds = new Set(Object.values(ReactionType) as string[]);

  for (const id of Object.values(StatusType) as string[]) {
    if (!seen.has(id) && !reactionIds.has(id)) {
      seen.add(id);
      entries.push({ id, label: STATUS_LABELS[id] ?? id });
    }
  }

  for (const operatorId of Object.keys(OPERATOR_JSON)) {
    const json = getOperatorJson(operatorId);
    const statusEvents: any[] = json?.statusEvents ?? [];
    for (const se of statusEvents) {
      const id = (se.id ?? se.name) as string | undefined;
      if (id && !seen.has(id)) {
        seen.add(id);
        const displayName = se.name ?? se.displayName ?? STATUS_LABELS[id] ?? id;
        entries.push({ id, label: displayName });
      }
    }
  }

  entries.sort((a, b) => a.label.localeCompare(b.label));
  _allStatusEntries = entries;
  return _allStatusEntries;
}

/**
 * Collect all reaction IDs with display names from ArtsReactionType + PhysicalStatusType.
 */
let _allReactionEntries: StatusIdEntry[] | null = null;
export function getAllReactionIds(): StatusIdEntry[] {
  if (_allReactionEntries) return _allReactionEntries;
  const { ArtsReactionType, PhysicalStatusType } = require('../../consts/enums');
  const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  const entries: StatusIdEntry[] = [];
  for (const id of Object.values(ArtsReactionType) as string[]) {
    entries.push({ id, label: titleCase(id) });
  }
  for (const id of Object.values(PhysicalStatusType) as string[]) {
    entries.push({ id, label: titleCase(id) });
  }
  _allReactionEntries = entries;
  return _allReactionEntries;
}

/**
 * Collect all infliction IDs with display names from the InflictionType enum.
 */
let _allInflictionEntries: StatusIdEntry[] | null = null;
export function getAllInflictionIds(): StatusIdEntry[] {
  if (_allInflictionEntries) return _allInflictionEntries;
  const { InflictionType } = require('../../consts/enums');
  const entries: StatusIdEntry[] = [];
  for (const id of Object.values(InflictionType) as string[]) {
    const label = id.replace(/_INFLICTION$/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
    entries.push({ id, label });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  _allInflictionEntries = entries;
  return _allInflictionEntries;
}

// Re-export timing functions from dataDrivenEventFrames
export {
  getSkillTimings,
  getUltimateEnergyCost,
  getSkillGaugeGains,
  getBattleSkillSpCost,
  getSkillCategoryData,
  getBasicAttackDurations,
} from "./dataDrivenEventFrames";
export type { SkillTimings, SkillGaugeGains, SkillCategoryData } from "./dataDrivenEventFrames";
