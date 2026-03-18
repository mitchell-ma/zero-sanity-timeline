import {
  buildSequencesFromOperatorJson,
  DataDrivenSkillEventSequence,
} from "./dataDrivenEventFrames";

// ── Auto-discover operator + skill JSON files ────────────────────────────────

/** Convert kebab-case filename to camelCase operator ID. */
function filenameToCamelCase(filename: string): string {
  return filename.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Operator base configs: game-data/operators/*-operator.json
const operatorContext = (require as any).context('../game-data/operators', false, /-operator\.json$/);
const OPERATOR_JSON: Record<string, Record<string, any>> = {};
for (const key of operatorContext.keys()) {
  const filename = key.replace('./', '').replace('-operator.json', '');
  const operatorId = filenameToCamelCase(filename);
  OPERATOR_JSON[operatorId] = operatorContext(key);
}

// Skill configs: game-data/operator-skills/*-skills.json
const skillContext = (require as any).context('../game-data/operator-skills', false, /-skills\.json$/);
const SKILL_JSON: Record<string, Record<string, any>> = {};
for (const key of skillContext.keys()) {
  const filename = key.replace('./', '').replace('-skills.json', '');
  const operatorId = filenameToCamelCase(filename);
  SKILL_JSON[operatorId] = skillContext(key);
}

// Talent configs: game-data/operator-talents/*-talents.json
const talentContext = (require as any).context('../game-data/operator-talents', false, /-talents\.json$/);
const TALENT_JSON: Record<string, Record<string, any>> = {};
for (const key of talentContext.keys()) {
  const filename = key.replace('./', '').replace('-talents.json', '');
  const operatorId = filenameToCamelCase(filename);
  TALENT_JSON[operatorId] = talentContext(key);
}

// Status configs: game-data/operator-statuses/*-statuses.json
const statusContext = (require as any).context('../game-data/operator-statuses', false, /-statuses\.json$/);
const STATUS_JSON: Record<string, any[]> = {};
for (const key of statusContext.keys()) {
  const filename = key.replace('./', '').replace('-statuses.json', '');
  const operatorId = filenameToCamelCase(filename);
  STATUS_JSON[operatorId] = statusContext(key);
}

// ── Status key normalization ─────────────────────────────────────────────────

/** Key mappings: short (operator-statuses) → long (engine-expected). */
const KEY_EXPAND: Record<string, string> = {
  verb: 'verbType', object: 'objectType', subject: 'subjectType',
  subjectDet: 'subjectDeterminer',
  to: 'toObjectType', toDet: 'toObjectDeterminer',
  from: 'fromObjectType', fromDet: 'fromObjectDeterminer',
  on: 'onObjectType', onDet: 'onObjectDeterminer',
  with: 'withPreposition', for: 'forPreposition',
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
 * Get the skill type map for an operator: { BASIC_ATTACK → baseSkillId, BATTLE_SKILL → baseSkillId, ... }.
 * Read from the skillTypeMap in the skills JSON.
 */
export function getSkillTypeMap(operatorId: string): Record<string, string> {
  return SKILL_JSON[operatorId]?.skillTypeMap ?? {};
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
