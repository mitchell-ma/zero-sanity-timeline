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
import { DEFAULT_STATS } from '../../consts/stats';
import { interpolateStats, ATTRIBUTE_INCREASE_VALUES } from './operator';
import type { BaseStats } from './operator';
import type { Potential, SkillLevel } from '../../consts/types';

/** Minimal operator config shape accepted by DataDrivenOperator. */
export interface OperatorStatConfig {
  elementType: string;
  mainAttributeType: string;
  secondaryAttributeType: string;
  potentials?: {
    level: number;
    effects: {
      potentialEffectType: string;
      statModifier?: { statType: string; value: number };
    }[];
  }[];
  talents?: {
    one?: { name: string; maxLevel: number };
    two?: { name: string; maxLevel: number };
    attributeIncrease?: { name: string; attribute: string };
  };
  /** Built-in operators: 99 level entries with exact per-level stats. */
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
    this.attributeIncreaseAttribute =
      (config.talents?.attributeIncrease?.attribute as StatType) ?? this.mainAttributeType;

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

  /** Returns cumulative stat bonuses from potentials 1..potential. */
  getPotentialStats(potential?: number): Partial<Record<StatType, number>> {
    const p = potential ?? this.potential;
    const result: Partial<Record<StatType, number>> = {};
    if (!this.config.potentials) return result;

    for (const pot of this.config.potentials) {
      if (pot.level > p) continue;
      for (const eff of pot.effects) {
        if (eff.potentialEffectType === 'STAT_MODIFIER' && eff.statModifier) {
          const stat = eff.statModifier.statType as StatType;
          result[stat] = (result[stat] ?? 0) + eff.statModifier.value;
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
  get attributeIncreaseName(): string { return this.config.talents?.attributeIncrease?.name ?? ''; }

  // ── Private ──────────────────────────────────────────────────────────────

  private computeStats(level: number): Record<StatType, number> {
    if (this.config.allLevels?.length) {
      const levelEntry = this.config.allLevels.find(e => e.level === level)
        ?? this.config.allLevels[this.config.allLevels.length - 1];
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
    throw new Error('Operator config must have either allLevels or baseStats');
  }
}
