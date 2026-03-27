/**
 * Data-driven operator model — reads stats from operator JSON config
 * instead of hardcoded TS subclasses.
 *
 * The config is the immutable template (from JSON or custom content).
 * The instance holds mutable loadout state (level, potential, talents, skill levels)
 * and recomputes derived stats when level changes.
 *
 * Supports both:
 * - Built-in operators with `allLevels` (99 discrete level entries, 1–99)
 * - Custom operators with `baseStats: { lv1, lv90 }` (interpolated)
 */
import { ElementType, StatType } from '../../consts/enums';
import { resolveEffectStat } from '../enums/stats';
import { VerbType, NounType } from '../../dsl/semantics';
import { DEFAULT_STATS } from '../../consts/stats';
import { interpolateStats, ATTRIBUTE_INCREASE_VALUES } from './operator';
import { getOperatorPotentialRaw } from '../game-data/operatorsStore';
import type { BaseStats } from './operator';
import type { Potential, SkillLevel } from '../../consts/types';
import { getOperatorStatuses } from '../game-data/operatorStatusesStore';

/** Lookup from generic attribute-increase status ID → { name, attribute }. */
export const ATTRIBUTE_INCREASE_LOOKUP: Record<string, { name: string; attribute: StatType }> = {};
for (const status of getOperatorStatuses('generic')) {
  const serialized = status.serialize();
  const props = serialized.properties as Record<string, unknown>;
  const clause = serialized.clause as Array<{ effects?: Array<{ objectId?: string }> }>;
  const effect = clause?.[0]?.effects?.[0];
  if (props?.id && effect?.objectId) {
    ATTRIBUTE_INCREASE_LOOKUP[props.id as string] = { name: props.name as string, attribute: effect.objectId as StatType };
  }
}

/** Minimal operator config shape accepted by DataDrivenOperator. */
export interface OperatorStatConfig {
  id: string;
  elementType: string;
  mainAttributeType: string;
  secondaryAttributeType: string;
  potentials?: {
    level: number;
    description?: string;
  }[];
  talents?: {
    one?: { name: string; description?: string; maxLevel: number };
    two?: { name: string; description?: string; maxLevel: number };
    attributeIncrease?: { id: string };
  };
  /** Built-in operators: level entries with exact per-level stats. */
  statsByLevel?: { level: number; attributes: Record<string, number> }[];
  /** @deprecated Use statsByLevel. */
  allLevels?: { level: number; attributes: Record<string, number> }[];
  /** Custom operators: simplified lv1/lv90 stats for interpolation. */
  baseStats?: BaseStats;
}

/**
 * Data-driven operator for stat computation.
 *
 * Config = immutable template from JSON.
 * Instance = mutable loadout state with derived stats.
 */
export class DataDrivenOperator {
  // ── Immutable identity (from config) ─────────────────────────────────────
  readonly mainAttributeType: StatType;
  readonly secondaryAttributeType: StatType;
  readonly attributeIncreaseAttribute: StatType;
  readonly element: ElementType;

  // ── Mutable loadout state ────────────────────────────────────────────────
  private _level: number;
  potential: Potential;
  talentOneLevel: number;
  talentTwoLevel: number;
  attributeIncreaseLevel: number;
  basicAttackLevel: SkillLevel;
  battleSkillLevel: SkillLevel;
  comboSkillLevel: SkillLevel;
  ultimateLevel: SkillLevel;

  // ── Derived (recomputed on level change) ─────────────────────────────────
  stats: Record<StatType, number>;

  // ── Config reference ─────────────────────────────────────────────────────
  readonly config: OperatorStatConfig;

  constructor(config: OperatorStatConfig, level: number = 90) {
    this.config = config;
    this._level = level;
    this.element = config.elementType as ElementType;
    this.mainAttributeType = config.mainAttributeType as StatType;
    this.secondaryAttributeType = config.secondaryAttributeType as StatType;
    const aiId = config.talents?.attributeIncrease?.id;
    this.attributeIncreaseAttribute =
      (aiId ? ATTRIBUTE_INCREASE_LOOKUP[aiId]?.attribute : undefined) ?? this.mainAttributeType;

    // Default mutable state
    this.potential = 0;
    this.talentOneLevel = 0;
    this.talentTwoLevel = 0;
    this.attributeIncreaseLevel = 4;
    this.basicAttackLevel = 1;
    this.battleSkillLevel = 1;
    this.comboSkillLevel = 1;
    this.ultimateLevel = 1;

    this.stats = this.computeStats(level);
  }

  get level(): number { return this._level; }
  set level(value: number) {
    this._level = value;
    this.stats = this.computeStats(value);
  }

  getBaseAttack(): number {
    return this.stats[StatType.BASE_ATTACK] ?? 0;
  }

  /** Returns cumulative stat bonuses from potentials 1..potential (e.g. +10 AGI from P2). */
  getPotentialStats(potential?: number): Partial<Record<StatType, number>> {
    const p = potential ?? this.potential;
    const result: Partial<Record<StatType, number>> = {};
    const rawPotentials = getOperatorPotentialRaw(this.config.id);

    for (const raw of rawPotentials) {
      const props = (raw.properties ?? {}) as Record<string, unknown>;
      const level = (props.level ?? 0) as number;
      if (level > p) continue;

      const clauses = (raw.clause ?? []) as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[];
      for (const clause of clauses) {
        if (clause.conditions && clause.conditions.length > 0) continue;
        for (const eff of (clause.effects ?? [])) {
          if (eff.verb === VerbType.APPLY && eff.to === NounType.OPERATOR && eff.object !== NounType.STATUS) {
            const w = (eff.with ?? {}) as Record<string, { value?: unknown }>;
            const value = (w.value?.value ?? 0) as number;
            const stat = resolveEffectStat(eff as { object: string; objectId?: string; objectQualifier?: string });
            if (stat) result[stat] = (result[stat] ?? 0) + value;
          }
        }
      }
    }
    return result;
  }

  /** Returns cumulative attribute increase bonus for a given level (0–4). */
  getAttributeIncrease(level?: number): number {
    const lv = level ?? this.attributeIncreaseLevel;
    let total = 0;
    for (let i = 1; i <= Math.min(lv, ATTRIBUTE_INCREASE_VALUES.length - 1); i++) {
      total += ATTRIBUTE_INCREASE_VALUES[i];
    }
    return total;
  }

  // ── Talent info (from config) ──────────────────────────────────────────

  get maxTalentOneLevel(): number { return this.config.talents?.one?.maxLevel ?? 0; }
  get maxTalentTwoLevel(): number { return this.config.talents?.two?.maxLevel ?? 0; }
  get talentOneName(): string { return this.config.talents?.one?.name ?? ''; }
  get talentTwoName(): string { return this.config.talents?.two?.name ?? ''; }
  get attributeIncreaseName(): string {
    const aiId = this.config.talents?.attributeIncrease?.id;
    return (aiId ? ATTRIBUTE_INCREASE_LOOKUP[aiId]?.name : undefined) ?? '';
  }

  get potentialDescriptions(): string[] | undefined {
    const pots = this.config.potentials as { description?: string }[] | undefined;
    if (!pots?.length) return undefined;
    const descs = pots.map(p => p.description ?? '');
    return descs.some(d => d) ? descs : undefined;
  }

  get talentDescriptions(): Record<number, string[]> | undefined {
    const t = this.config.talents;
    if (!t) return undefined;
    const result: Record<number, string[]> = {};
    if (t.one?.description) result[1] = [t.one.description];
    if (t.two?.description) result[2] = [t.two.description];
    return Object.keys(result).length > 0 ? result : undefined;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private computeStats(level: number): Record<StatType, number> {
    const levels = this.config.statsByLevel ?? this.config.allLevels;
    if (levels?.length) {
      const levelEntry = levels.find(e => e.level === level)
        ?? levels[levels.length - 1];
      const levelStats: Partial<Record<StatType, number>> = {};
      for (const [key, value] of Object.entries(levelEntry.attributes)) {
        levelStats[key as StatType] = value;
      }
      return { ...DEFAULT_STATS, ...levelStats };
    } else if (this.config.baseStats) {
      return {
        ...DEFAULT_STATS,
        [StatType.BASE_HP]: 500 + (5495 - 500) * ((level - 1) / 89),
        [StatType.CRITICAL_RATE]: 0.05,
        [StatType.CRITICAL_DAMAGE]: 0.5,
        ...interpolateStats(this.config.baseStats, level),
      };
    }
    throw new Error('Operator config must have either statsByLevel or baseStats');
  }
}
