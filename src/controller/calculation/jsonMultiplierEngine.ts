/**
 * Generic JSON-driven multiplier engine.
 *
 * Replaces skillMultiplierRegistry.ts and all combat-skills/*.ts classes.
 * Reads multiplier data directly from operator JSON frames.
 * Resolves ValueExpressions (VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL, MULT expressions)
 * via resolveValueNode.
 */
import { Potential, SkillLevel } from '../../consts/types';
import { SegmentType } from '../../consts/enums';
import { VerbType, NounType } from '../../dsl/semantics';
import type { ValueNode } from '../../dsl/semantics';
import { resolveValueNode } from './valueResolver';
import { getOperatorSkill } from '../gameDataStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface JsonClauseEffect {
  verb: string;
  object?: string;
  with?: Record<string, ValueNode>;
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

// ── Cache ────────────────────────────────────────────────────────────────────

/**
 * Cached multiplier data for a skill category at a specific level+potential.
 * segmentMultipliers[segmentIndex] = sum of damage multiplier across frames in segment.
 * perFrameMultipliers[segmentIndex][frameIndex] = individual frame damage multiplier.
 */
interface ResolvedSkillMultipliers {
  segmentMultipliers: number[];
  perFrameMultipliers: number[][];
}

const resolvedMultipliers = new Map<string, ResolvedSkillMultipliers>();

function getResolvedKey(operatorId: string, category: string, level: SkillLevel, potential: Potential): string {
  return `${operatorId}:${category}:${level}:${potential}`;
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

function resolveDamageValue(frame: JsonFrame, level: SkillLevel, potential: Potential): number {
  const deal = getDealEffect(frame);
  if (!deal?.with?.value) return 0;
  return resolveValueNode(deal.with.value, { skillLevel: level, potential, stats: {} });
}

function buildCategoryCache(operatorId: string, category: string, level: SkillLevel, potential: Potential): ResolvedSkillMultipliers | null {
  const skill = getOperatorSkill(operatorId, category);
  if (!skill) return null;

  const skillCat = skill.serialize() as unknown as JsonSkillCategory;
  const segments: { frames: JsonFrame[]; label?: string }[] = [];

  if (skillCat.segments) {
    for (const seg of skillCat.segments) {
      // Skip non-damage segments — callers pass a damage-segment index that
      // also skips ANIMATION/COOLDOWN, keeping indices aligned.
      const types = seg.properties?.segmentTypes ?? [];
      if (types.includes(SegmentType.ANIMATION) || types.includes(SegmentType.COOLDOWN) || types.includes(SegmentType.IMMEDIATE_COOLDOWN)) continue;
      segments.push({ frames: seg.frames ?? [], label: seg.name });
    }
  } else if (skillCat.frames) {
    segments.push({ frames: skillCat.frames });
  }

  if (segments.length === 0) return null;

  const segmentMultipliers: number[] = [];
  const perFrameMultipliers: number[][] = [];

  for (const seg of segments) {
    let segSum = 0;
    const frameMults: number[] = [];

    for (const frame of seg.frames) {
      const val = resolveDamageValue(frame, level, potential);
      frameMults.push(val);
      segSum += val;
    }

    segmentMultipliers.push(segSum);
    perFrameMultipliers.push(frameMults);
  }

  // If no frames had any multiplier data, treat as no data (allows empowered fallback)
  if (segmentMultipliers.every(m => m === 0)) return null;

  return { segmentMultipliers, perFrameMultipliers };
}

function getCategoryCache(operatorId: string, category: string, level: SkillLevel, potential: Potential): ResolvedSkillMultipliers | null {
  const key = getResolvedKey(operatorId, category, level, potential);
  if (resolvedMultipliers.has(key)) return resolvedMultipliers.get(key)!;
  let data = buildCategoryCache(operatorId, category, level, potential);
  // Empowered variants may lack multiplier data — fall back to base category
  if (!data) {
    const baseCategory = getEmpoweredFallback(category);
    if (baseCategory) data = buildCategoryCache(operatorId, baseCategory, level, potential);
  }
  if (data) resolvedMultipliers.set(key, data);
  return data;
}

/** Map empowered skill IDs to their non-empowered base for multiplier fallback. */
function getEmpoweredFallback(skillId: string): string | null {
  if (skillId.endsWith('_ENHANCED_EMPOWERED')) return skillId.replace('_ENHANCED_EMPOWERED', '_ENHANCED');
  if (skillId.endsWith('_EMPOWERED')) return skillId.slice(0, -'_EMPOWERED'.length);
  return null;
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

const NON_DAMAGE_SEGMENT_TYPES = new Set([SegmentType.ANIMATION, SegmentType.COOLDOWN, SegmentType.IMMEDIATE_COOLDOWN]);

/** True if the segment carries damage frames (not ANIMATION, COOLDOWN, etc.). */
export function isDamageSegment(segmentTypes?: readonly string[]): boolean {
  if (!segmentTypes?.length) return true;
  return !segmentTypes.some(t => NON_DAMAGE_SEGMENT_TYPES.has(t as SegmentType));
}

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
  segmentIndex: number,
  level: SkillLevel,
  potential: Potential,
): number | null {
  const category = resolveSkillKey(operatorId, skillName);
  if (!category) return null;

  const data = getCategoryCache(operatorId, category, level, potential);
  if (!data) return null;

  if (segmentIndex >= data.segmentMultipliers.length) return null;

  const baseMult = data.segmentMultipliers[segmentIndex];
  if (baseMult === 0) return null;

  return baseMult;
}

/**
 * Get an individual frame's multiplier within a segment.
 * Returns null if the frame/segment doesn't exist or has no damage data.
 */
export function getPerFrameMultiplier(
  operatorId: string,
  skillName: string,
  segmentIndex: number,
  frameIndex: number,
  level: SkillLevel,
  potential: Potential,
): number | null {
  const category = resolveSkillKey(operatorId, skillName);
  if (!category) return null;

  const data = getCategoryCache(operatorId, category, level, potential);
  if (!data) return null;

  if (segmentIndex >= data.perFrameMultipliers.length) return null;
  const segFrames = data.perFrameMultipliers[segmentIndex];
  if (frameIndex >= segFrames.length) return null;

  const val = segFrames[frameIndex];
  return val === 0 ? null : val;
}
