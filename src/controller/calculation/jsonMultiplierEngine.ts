/**
 * Generic JSON-driven multiplier engine.
 *
 * Replaces skillMultiplierRegistry.ts and all combat-skills/*.ts classes.
 * Reads multiplier data directly from operator JSON frames, applying
 * potential-dependent modifiers from the potentials section.
 */
import { Potential, SkillLevel } from '../../consts/types';
import { VerbType, NounType } from '../../dsl/semantics';
import { getOperatorSkill, getOperatorBase } from '../gameDataStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface JsonWithValue {
  verb: string; // "IS" | "VARY_BY"
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
  properties?: { dependencyTypes?: string[] };
}

interface JsonSegment {
  name?: string;
  frames: JsonFrame[];
  properties?: { segmentTypes?: string[] };
}

interface JsonSkillCategory {
  segments?: JsonSegment[];
  frames?: JsonFrame[];
  properties?: { dependencyTypes?: string[] };
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
 * segmentMultipliers[segmentIndex][levelIndex] = sum of damage multiplier across frames in segment.
 * perFrameMultipliers[segmentIndex][frameIndex][levelIndex] = individual frame damage multiplier.
 */
interface CategoryMultiplierCache {
  segmentMultipliers: number[][];
  perFrameMultipliers: number[][][];
}

const cache = new Map<string, CategoryMultiplierCache>();

function getCacheKey(operatorId: string, category: string): string {
  return `${operatorId}:${category}`;
}

// ── Build multiplier data from JSON ──────────────────────────────────────────

function getDealEffect(frame: JsonFrame): JsonClauseEffect | undefined {
  for (const pred of (frame.clause ?? [])) {
    for (const ef of pred.effects) {
      if (ef.verb === VerbType.DEAL && ef.object === NounType.DAMAGE) return ef;
    }
  }
  return undefined;
}

function getAtk(frame: JsonFrame, level: number, key: string = 'value'): number {
  const deal = getDealEffect(frame);
  if (!deal?.with) return 0;
  const wv = deal.with[key];
  if (!wv) return 0;
  if (Array.isArray(wv.value)) return wv.value[level - 1] ?? 0;
  return typeof wv.value === 'number' ? wv.value : 0;
}

function buildCategoryCache(operatorId: string, category: string): CategoryMultiplierCache | null {
  const skill = getOperatorSkill(operatorId, category);
  if (!skill) return null;

  const skillCat = skill.serialize() as unknown as JsonSkillCategory;
  const segments: { frames: JsonFrame[]; label?: string }[] = [];

  if (skillCat.segments) {
    for (const seg of skillCat.segments) {
      // Skip ANIMATION segments (no frames, no damage data)
      if (seg.properties?.segmentTypes?.includes('ANIMATION')) continue;
      segments.push({ frames: seg.frames ?? [], label: seg.name });
    }
  } else if (skillCat.frames) {
    segments.push({ frames: skillCat.frames });
  }

  if (segments.length === 0) return null;

  const LEVELS = 12;
  const segmentMultipliers: number[][] = [];
  const perFrameMultipliers: number[][][] = [];

  for (const seg of segments) {
    const segMults: number[] = new Array(LEVELS).fill(0);
    const frameMults: number[][] = [];

    for (const frame of seg.frames) {
      const frameLevelMults: number[] = [];
      for (let lvl = 1; lvl <= LEVELS; lvl++) {
        const atk = getAtk(frame, lvl);
        frameLevelMults.push(atk);
        segMults[lvl - 1] += atk;
      }
      frameMults.push(frameLevelMults);
    }

    segmentMultipliers.push(segMults);
    perFrameMultipliers.push(frameMults);
  }

  // If no frames had any multiplier data, treat as no data (allows empowered fallback)
  const hasAnyMultiplier = segmentMultipliers.some(seg => seg.some(m => m !== 0));
  if (!hasAnyMultiplier) return null;

  return { segmentMultipliers, perFrameMultipliers };
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
 * with parameterKey === 'damage multiplier' matching the skill name.
 */
function getPotentialMultiplier(
  operatorId: string,
  skillName: string,
  potential: Potential,
): number {
  if (potential === 0) return 1;

  const base = getOperatorBase(operatorId);
  if (!base?.potentials?.length) return 1;

  const potentials = base.potentials as JsonPotential[];
  let result = 1;

  for (const pot of potentials) {
    if (pot.level > potential) break;
    for (const eff of pot.effects) {
      if (eff.potentialEffectType !== 'SKILL_PARAMETER') continue;
      const mod = eff.skillParameterModifier;
      if (!mod || mod.parameterKey !== 'DAMAGE_MULTIPLIER_MODIFIER') continue;
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
  if (getOperatorSkill(operatorId, skillName)) return skillName;
  // Empowered variants may not have their own entry — resolve to base
  const fallback = getEmpoweredFallback(skillName);
  if (fallback && getOperatorSkill(operatorId, fallback)) return skillName;
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the segment-total skill multiplier.
 * This is the sum of damage multiplier across all frames in the segment.
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

