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

// ── Public API ──────────────────────────────────────────────────────────────

/** Sequence cache keyed by `operatorId:skillCategory`. */
const sequenceCache = new Map<string, readonly DataDrivenSkillEventSequence[]>();

/** Get the raw operator JSON for a given operator ID (includes skills merged in). */
export function getOperatorJson(operatorId: string): Record<string, any> | undefined {
  const base = OPERATOR_JSON[operatorId];
  if (!base) return undefined;
  const skills = SKILL_JSON[operatorId];
  if (!skills) return base;
  return { ...base, skills };
}

/** Get the skill JSON for a given operator ID. */
export function getSkillJson(operatorId: string): Record<string, any> | undefined {
  return SKILL_JSON[operatorId];
}

/** Get all registered operator IDs. */
export function getAllOperatorIds(): string[] {
  return Object.keys(OPERATOR_JSON);
}

/** Skill name map cache: operatorId → { skillId → categoryKey }. */
const skillNameMapCache = new Map<string, Record<string, string>>();

/**
 * Build skill name map from operator skill data.
 * Derives { skillId → category } from skills[category].id.
 * Includes universal FINISHER/DIVE → BASIC_ATTACK mappings.
 */
export function getSkillNameMap(operatorId: string): Record<string, string> {
  if (skillNameMapCache.has(operatorId)) return skillNameMapCache.get(operatorId)!;
  const skills = SKILL_JSON[operatorId];
  if (!skills) return {};
  const map: Record<string, string> = { FINISHER: 'BASIC_ATTACK', DIVE: 'BASIC_ATTACK' };
  for (const [category, skill] of Object.entries(skills)) {
    if ((skill as any).id) map[(skill as any).id] = category;
  }
  skillNameMapCache.set(operatorId, map);
  return map;
}

/** Get frame sequences for a skill category, with caching. */
export function getFrameSequences(
  operatorId: string,
  skillCategory: string,
): readonly DataDrivenSkillEventSequence[] {
  const cacheKey = `${operatorId}:${skillCategory}`;
  const cached = sequenceCache.get(cacheKey);
  if (cached) return cached;

  const json = getOperatorJson(operatorId);
  if (!json) return [];

  const sequences = buildSequencesFromOperatorJson(json, skillCategory);
  sequenceCache.set(cacheKey, sequences);
  return sequences;
}

/**
 * Get segment labels for a multi-sequence skill category.
 * Returns undefined for single-sequence skills.
 */
export function getSegmentLabels(
  operatorId: string,
  skillCategory: string,
): string[] | undefined {
  const sequences = getFrameSequences(operatorId, skillCategory);
  if (sequences.length <= 1) return undefined;

  const labels = sequences
    .map(seq => seq.segmentName)
    .filter((name): name is string => name != null);

  // If segments have names, use them; otherwise return undefined (basic attack uses index labels)
  return labels.length === sequences.length ? labels : undefined;
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
