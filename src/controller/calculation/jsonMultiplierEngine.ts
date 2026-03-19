/**
 * Generic JSON-driven multiplier engine.
 *
 * Replaces skillMultiplierRegistry.ts and all combat-skills/*.ts classes.
 * Reads multiplier data directly from operator JSON frames, applying
 * potential-dependent modifiers from the potentials section.
 */
import { Potential, SkillLevel } from '../../consts/types';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';

// ── Types ────────────────────────────────────────────────────────────────────

interface JsonWithValue {
  verb: string;
  object?: string;
  value: number | number[];
}

interface JsonClauseEffect {
  verb: string;
  object?: string;
  with?: Record<string, JsonWithValue>;
}

interface JsonClausePredicate {
  conditions: Record<string, unknown>[];
  effects: JsonClauseEffect[];
}

interface JsonFrame {
  clause?: JsonClausePredicate[];
}

interface JsonSegment {
  name?: string;
  frames: JsonFrame[];
}

interface JsonSkillCategory {
  segments?: JsonSegment[];
  frames?: JsonFrame[];
}

interface JsonPotentialEffect {
  potentialEffectType: string;
  skillParameterModifier?: {
    skillType: string;
    parameterKey: string;
    value: number;
    parameterModifyType: string;
  };
}

interface JsonPotential {
  level: number;
  effects: JsonPotentialEffect[];
}

// ── Cache ────────────────────────────────────────────────────────────────────

/**
 * Cached per-level multiplier data for a skill category.
 * segmentMultipliers[segmentIndex][levelIndex] = sum of DAMAGE_MULTIPLIER across frames in segment.
 * perFrameMultipliers[segmentIndex][frameIndex][levelIndex] = individual frame DAMAGE_MULTIPLIER.
 */
interface CategoryMultiplierCache {
  segmentMultipliers: number[][];
  perFrameMultipliers: number[][][];
  /** For ramping skills: DAMAGE_MULTIPLIER_INCREMENT per frame (the per-tick increment). */
  perFrameScale2?: number[][][];
}

const cache = new Map<string, CategoryMultiplierCache>();

function getCacheKey(operatorId: string, category: string): string {
  return `${operatorId}:${category}`;
}

// ── Build multiplier data from JSON ──────────────────────────────────────────

/** Map old multiplier key names to their camelCase equivalents in the DEAL effect's with block. */
const MULTIPLIER_KEY_MAP: Record<string, string> = {
  DAMAGE_MULTIPLIER: 'value',
  DAMAGE_MULTIPLIER_INCREMENT: 'damageMultiplierIncrement',
};

function getDealEffect(frame: JsonFrame): JsonClauseEffect | undefined {
  for (const pred of (frame.clause ?? [])) {
    for (const ef of pred.effects) {
      if (ef.verb === 'DEAL' && ef.object === 'DAMAGE') return ef;
    }
  }
  return undefined;
}

function getAtk(frame: JsonFrame, level: number, key: string = 'DAMAGE_MULTIPLIER'): number {
  const deal = getDealEffect(frame);
  if (!deal?.with) return 0;
  const withKey = MULTIPLIER_KEY_MAP[key] ?? key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const wv = deal.with[withKey];
  if (!wv) return 0;
  if (Array.isArray(wv.value)) return wv.value[level - 1] ?? 0;
  return typeof wv.value === 'number' ? wv.value : 0;
}

function buildCategoryCache(operatorId: string, category: string): CategoryMultiplierCache | null {
  const json = getOperatorJson(operatorId);
  if (!json) return null;

  const skills = json.skills as Record<string, JsonSkillCategory> | undefined;
  if (!skills?.[category]) return null;

  const skillCat = skills[category];
  const segments: { frames: JsonFrame[]; label?: string }[] = [];

  if (skillCat.segments) {
    for (const seg of skillCat.segments) {
      segments.push({ frames: seg.frames ?? [], label: seg.name });
    }
  } else if (skillCat.frames) {
    segments.push({ frames: skillCat.frames });
  }

  if (segments.length === 0) return null;

  const LEVELS = 12;
  const segmentMultipliers: number[][] = [];
  const perFrameMultipliers: number[][][] = [];
  const perFrameScale2: number[][][] = [];
  let hasScale2 = false;

  for (const seg of segments) {
    const segMults: number[] = new Array(LEVELS).fill(0);
    const frameMults: number[][] = [];
    const frameScale2: number[][] = [];

    for (const frame of seg.frames) {
      const frameLevelMults: number[] = [];
      const frameLevelScale2: number[] = [];
      for (let lvl = 1; lvl <= LEVELS; lvl++) {
        const atk = getAtk(frame, lvl);
        frameLevelMults.push(atk);
        segMults[lvl - 1] += atk;

        const s2 = getAtk(frame, lvl, 'DAMAGE_MULTIPLIER_INCREMENT');
        frameLevelScale2.push(s2);
        if (s2 > 0) hasScale2 = true;
      }
      frameMults.push(frameLevelMults);
      frameScale2.push(frameLevelScale2);
    }

    segmentMultipliers.push(segMults);
    perFrameMultipliers.push(frameMults);
    perFrameScale2.push(frameScale2);
  }

  // If no frames had any multiplier data, treat as no data (allows empowered fallback)
  const hasAnyMultiplier = segmentMultipliers.some(seg => seg.some(m => m !== 0));
  if (!hasAnyMultiplier) return null;

  return {
    segmentMultipliers,
    perFrameMultipliers,
    ...(hasScale2 && { perFrameScale2 }),
  };
}

function getCategoryCache(operatorId: string, category: string): CategoryMultiplierCache | null {
  const key = getCacheKey(operatorId, category);
  if (cache.has(key)) return cache.get(key)!;
  let data = buildCategoryCache(operatorId, category);
  // Empowered variants may lack multiplier data — fall back to base category
  if (!data) {
    const baseCategory = getEmpoweredFallback(category);
    if (baseCategory) data = buildCategoryCache(operatorId, baseCategory);
  }
  if (data) cache.set(key, data);
  return data;
}

/** Map empowered skill IDs to their non-empowered base for multiplier fallback. */
function getEmpoweredFallback(skillId: string): string | null {
  if (skillId.endsWith('_ENHANCED_EMPOWERED')) return skillId.replace('_ENHANCED_EMPOWERED', '_ENHANCED');
  if (skillId.endsWith('_EMPOWERED')) return skillId.slice(0, -'_EMPOWERED'.length);
  return null;
}

// ── Potential modifier application ──────────────────────────────────────────

/**
 * Get the cumulative potential modifier for a skill.
 * Scans potentials[0..potential-1] for SKILL_PARAMETER effects
 * with parameterKey === 'DAMAGE_MULTIPLIER' matching the skill name.
 */
function getPotentialMultiplier(
  operatorId: string,
  skillName: string,
  potential: Potential,
): number {
  if (potential === 0) return 1;

  const json = getOperatorJson(operatorId);
  if (!json?.potentials) return 1;

  const potentials = json.potentials as JsonPotential[];
  let result = 1;

  for (const pot of potentials) {
    if (pot.level > potential) break;
    for (const eff of pot.effects) {
      if (eff.potentialEffectType !== 'SKILL_PARAMETER') continue;
      const mod = eff.skillParameterModifier;
      if (!mod || mod.parameterKey !== 'DAMAGE_MULTIPLIER') continue;
      const modSkill = mod.skillType;
      if (modSkill === skillName) {
        switch (mod.parameterModifyType) {
          case 'UNIQUE_MULTIPLIER':
            result *= mod.value;
            break;
          case 'MULTIPLICATIVE':
            result *= mod.value;
            break;
          case 'ADDITIVE':
            result += mod.value;
            break;
        }
      }
    }
  }

  return result;
}

// ── Skill ID resolution ─────────────────────────────────────────────────────

/** Check if a skill ID exists in the operator's skills JSON (or its empowered base). */
function resolveSkillKey(operatorId: string, skillName: string): string | null {
  const json = getOperatorJson(operatorId);
  if (!json?.skills) return null;
  if (json.skills[skillName]) return skillName;
  // Empowered variants may not have their own entry — resolve to base
  const fallback = getEmpoweredFallback(skillName);
  if (fallback && json.skills[fallback]) return skillName;
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the segment-total skill multiplier.
 * This is the sum of DAMAGE_MULTIPLIER across all frames in the segment.
 * The caller (damageTableBuilder) divides by frame count for uniform distribution.
 *
 * Returns null if operator/skill has no multiplier data or doesn't deal damage.
 */
export function getSkillMultiplier(
  operatorId: string,
  skillName: string,
  segmentIndex: number | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  const category = resolveSkillKey(operatorId, skillName);
  if (!category) return null;

  const data = getCategoryCache(operatorId, category);
  if (!data) return null;

  const segIdx = segmentIndex ?? 0;
  if (segIdx >= data.segmentMultipliers.length) return null;

  const baseMult = data.segmentMultipliers[segIdx][level - 1];
  if (baseMult === 0) return null;

  const potMod = getPotentialMultiplier(operatorId, skillName, potential);
  return baseMult * potMod;
}

/**
 * Get per-tick multiplier for skills with non-uniform per-frame damage.
 * Used for ramping skills like Smouldering Fire where each tick does
 * increasing damage: base + increment × tickIndex.
 *
 * Returns null for skills with uniform frame distribution (most skills).
 */
export function getPerTickMultiplier(
  operatorId: string,
  skillName: string,
  level: SkillLevel,
  potential: Potential,
  frameIndex: number,
): number | null {
  const category = resolveSkillKey(operatorId, skillName);
  if (!category) return null;

  const data = getCategoryCache(operatorId, category);
  if (!data?.perFrameScale2) return null;

  // Only return per-tick if the skill has DAMAGE_MULTIPLIER_INCREMENT (ramping increment)
  const segIdx = 0; // Per-tick is only used for single-segment skills
  const frameScale2 = data.perFrameScale2[segIdx];
  if (!frameScale2?.[0]?.[level - 1]) return null;

  const baseAtk = data.perFrameMultipliers[segIdx][0][level - 1];
  const increment = frameScale2[0][level - 1];
  const tickMult = baseAtk + increment * frameIndex;

  const potMod = getPotentialMultiplier(operatorId, skillName, potential);
  return tickMult * potMod;
}
