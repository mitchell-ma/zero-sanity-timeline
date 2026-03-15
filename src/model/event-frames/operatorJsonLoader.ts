import {
  buildSequencesFromOperatorJson,
  DataDrivenSkillEventSequence,
} from "./dataDrivenEventFrames";

// ── Auto-discover operator JSON files ───────────────────────────────────────

/** Convert kebab-case filename to camelCase operator ID. */
function filenameToCamelCase(filename: string): string {
  return filename.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Use require.context to auto-discover all JSON files in game-data/operators/
const operatorContext = (require as any).context('../game-data/operators', false, /\.json$/);
const OPERATOR_JSON: Record<string, Record<string, any>> = {};
for (const key of operatorContext.keys()) {
  const filename = key.replace('./', '').replace('.json', '');
  const operatorId = filenameToCamelCase(filename);
  OPERATOR_JSON[operatorId] = operatorContext(key);
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Sequence cache keyed by `operatorId:skillCategory`. */
const sequenceCache = new Map<string, readonly DataDrivenSkillEventSequence[]>();

/** Get the raw operator JSON for a given operator ID. */
export function getOperatorJson(operatorId: string): Record<string, any> | undefined {
  return OPERATOR_JSON[operatorId];
}

/** Get all registered operator IDs. */
export function getAllOperatorIds(): string[] {
  return Object.keys(OPERATOR_JSON);
}

/** Skill name map cache: operatorId → { enumKey → categoryKey }. */
const skillNameMapCache = new Map<string, Record<string, string>>();

/**
 * Build skill name map from operator JSON skills.
 * Derives { CombatSkillsType → category } from skills[category].id.
 * Includes universal FINISHER/DIVE → BASIC_ATTACK mappings.
 */
export function getSkillNameMap(operatorId: string): Record<string, string> {
  if (skillNameMapCache.has(operatorId)) return skillNameMapCache.get(operatorId)!;
  const json = OPERATOR_JSON[operatorId];
  if (!json?.skills) return {};
  const map: Record<string, string> = { FINISHER: 'BASIC_ATTACK', DIVE: 'BASIC_ATTACK' };
  const skills = json.skills as Record<string, { id?: string }>;
  for (const [category, skill] of Object.entries(skills)) {
    if (skill.id) map[skill.id] = category;
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

  const json = OPERATOR_JSON[operatorId];
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
