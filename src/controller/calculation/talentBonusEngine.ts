/**
 * Generic talent bonus engine.
 *
 * Evaluates `talentEffects` from operator JSONs to produce conditional
 * damage bonuses, replacing hardcoded if-chains in damageTableBuilder.
 */
import { CombatSkillType, ElementType, StatType } from '../../consts/enums';
import { Potential } from '../../consts/types';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import type { EventsQueryService } from '../timeline/eventsQueryService';

// ── JSON types ──────────────────────────────────────────────────────────────

interface TalentCondition {
  /** Enemy must be staggered. */
  enemyState?: 'STAGGERED';
  /** Enemy must have this element infliction active. */
  enemyStatus?: string;
  /** If enemyStatus condition met AND this reaction is active, value is doubled. */
  doubledBy?: string;
  /** Enemy must have susceptibility for this element. */
  hasSusceptibility?: string;
  /** Only applies to this skill type. */
  skillType?: string;
  /** Only applies to this specific skill name (CombatSkillType). */
  skillName?: string;
}

interface TalentEffect {
  name: string;
  source: 'TALENT_1' | 'TALENT_2' | 'POTENTIAL';
  minLevel?: number;
  minPotential?: number;
  bonusType: 'DAMAGE_DEALT' | 'CRITICAL_DAMAGE' | 'SPECIAL_MULTIPLIER' | 'STAGGER_DAMAGE' | 'ATTACK_PCT_FROM_STATS';
  values: number[];
  condition?: TalentCondition;
  /** For ATTACK_PCT_FROM_STATS: stat types to sum. */
  statSources?: string[];
}

// ── Evaluation results ──────────────────────────────────────────────────────

export interface TalentBonuses {
  dmgDealBonus: number;
  critDmgBonus: number;
  specialMultiplier: number;
  staggerDmgBonus: number;
  specialSources: { label: string; value: number }[];
}

export interface TalentAttackBonus {
  extraAttackPct: number;
}

// ── Context for evaluation ──────────────────────────────────────────────────

interface TalentEvalContext {
  absFrame: number;
  skillType: CombatSkillType;
  skillName: string;
  isStaggered: boolean;
  statusQuery?: EventsQueryService;
}

interface TalentStatContext {
  talentOneLevel: number;
  talentTwoLevel: number;
  potential: Potential;
  stats: Partial<Record<StatType, number>>;
}

// ── Cache ───────────────────────────────────────────────────────────────────

const effectsCache = new Map<string, TalentEffect[]>();

function getTalentEffects(operatorId: string): TalentEffect[] {
  if (effectsCache.has(operatorId)) return effectsCache.get(operatorId)!;
  const json = getOperatorJson(operatorId);
  const effects = (json?.talentEffects as TalentEffect[]) ?? [];
  effectsCache.set(operatorId, effects);
  return effects;
}

// ── Condition evaluation ────────────────────────────────────────────────────

function isConditionMet(
  cond: TalentCondition | undefined,
  ctx: TalentEvalContext,
): { met: boolean; doubled: boolean } {
  if (!cond || Object.keys(cond).length === 0) return { met: true, doubled: false };

  // Skill type filter
  if (cond.skillType && ctx.skillType !== cond.skillType) return { met: false, doubled: false };

  // Skill name filter
  if (cond.skillName && ctx.skillName !== cond.skillName) return { met: false, doubled: false };

  // Stagger check
  if (cond.enemyState === 'STAGGERED' && !ctx.isStaggered) return { met: false, doubled: false };

  // Enemy status check (with optional doubling)
  if (cond.enemyStatus && ctx.statusQuery) {
    const element = cond.enemyStatus as ElementType;
    const doubled = cond.doubledBy;

    // Check doubled condition first (reaction active)
    if (doubled) {
      const reactionCheck = doubled === 'SOLIDIFICATION'
        ? ctx.statusQuery.isSolidificationActive(ctx.absFrame)
        : false; // extend for other reactions as needed
      if (reactionCheck) return { met: true, doubled: true };
    }

    // Check base element infliction
    const inflictionCheck = element === ElementType.CRYO
      ? ctx.statusQuery.isCryoInflictionActive(ctx.absFrame)
      : false; // extend for other elements as needed
    if (inflictionCheck) return { met: true, doubled: false };

    return { met: false, doubled: false };
  }

  // Susceptibility check
  if (cond.hasSusceptibility && ctx.statusQuery) {
    const element = cond.hasSusceptibility as ElementType;
    if (ctx.statusQuery.getSusceptibilityBonus(ctx.absFrame, element) <= 0) {
      return { met: false, doubled: false };
    }
  }

  return { met: true, doubled: false };
}

// ── Source level resolution ─────────────────────────────────────────────────

function getEffectLevel(effect: TalentEffect, statCtx: TalentStatContext): number | null {
  switch (effect.source) {
    case 'TALENT_1':
      if (statCtx.talentOneLevel < (effect.minLevel ?? 1)) return null;
      return statCtx.talentOneLevel;
    case 'TALENT_2':
      if (statCtx.talentTwoLevel < (effect.minLevel ?? 1)) return null;
      return statCtx.talentTwoLevel;
    case 'POTENTIAL':
      if (statCtx.potential < (effect.minPotential ?? 1)) return null;
      return 1; // Potential effects use values[0]
    default:
      return null;
  }
}

function getEffectValue(effect: TalentEffect, level: number): number {
  // Level is 1-based for talents; values array is 0-based
  const idx = Math.min(level - 1, effect.values.length - 1);
  return effect.values[Math.max(0, idx)];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate per-frame talent bonuses for an operator.
 * Returns additive/multiplicative bonuses to apply in damage calculation.
 */
export function evaluateTalentBonuses(
  operatorId: string,
  statCtx: TalentStatContext,
  evalCtx: TalentEvalContext,
): TalentBonuses {
  const result: TalentBonuses = {
    dmgDealBonus: 0,
    critDmgBonus: 0,
    specialMultiplier: 1,
    staggerDmgBonus: 0,
    specialSources: [],
  };

  const effects = getTalentEffects(operatorId);
  if (effects.length === 0) return result;

  for (const effect of effects) {
    if (effect.bonusType === 'ATTACK_PCT_FROM_STATS') continue; // handled separately

    const level = getEffectLevel(effect, statCtx);
    if (level === null) continue;

    const { met, doubled } = isConditionMet(effect.condition, evalCtx);
    if (!met) continue;

    const value = getEffectValue(effect, level);
    const effectiveValue = doubled ? value * 2 : value;

    switch (effect.bonusType) {
      case 'DAMAGE_DEALT':
        result.dmgDealBonus += effectiveValue;
        break;
      case 'CRITICAL_DAMAGE':
        result.critDmgBonus += effectiveValue;
        break;
      case 'SPECIAL_MULTIPLIER':
        result.specialMultiplier *= effectiveValue;
        result.specialSources.push({ label: effect.name, value: effectiveValue });
        break;
      case 'STAGGER_DAMAGE':
        result.staggerDmgBonus += effectiveValue;
        break;
    }
  }

  return result;
}

/**
 * Evaluate stat-based ATK% bonus (e.g. Lifeng T1: INT + WIL → ATK%).
 * Called during operator data building, not per-frame.
 */
export function evaluateTalentAttackBonus(
  operatorId: string,
  statCtx: TalentStatContext,
): TalentAttackBonus {
  const result: TalentAttackBonus = { extraAttackPct: 0 };

  const effects = getTalentEffects(operatorId);
  for (const effect of effects) {
    if (effect.bonusType !== 'ATTACK_PCT_FROM_STATS') continue;

    const level = getEffectLevel(effect, statCtx);
    if (level === null) continue;

    const perPoint = getEffectValue(effect, level);
    const statSources = effect.statSources ?? [];
    let statSum = 0;
    for (const src of statSources) {
      statSum += (statCtx.stats[src as StatType] ?? 0);
    }
    result.extraAttackPct += statSum * perPoint;
  }

  return result;
}
