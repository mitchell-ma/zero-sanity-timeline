import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { lookupByLevel } from "../../utils/lookupByLevel";
type StatsByRank = Readonly<Record<number, Partial<Record<StatType, number>>>>;

export abstract class Gear {
  readonly gearType: GearType;
  readonly gearEffectType: GearEffectType;
  /** Flat defense value (constant across all ranks). */
  readonly defense: number;
  rank: GearRank;

  protected readonly statsByRank: StatsByRank;

  constructor(params: {
    gearType: GearType;
    gearEffectType: GearEffectType;
    rank: GearRank;
    statsByRank: StatsByRank;
    defense?: number;
  }) {
    this.gearType = params.gearType;
    this.gearEffectType = params.gearEffectType;
    this.rank = params.rank;
    this.defense = params.defense ?? 0;
    this.statsByRank = params.statsByRank;
  }

  getStats(): Partial<Record<StatType, number>> {
    const stats = lookupByLevel(this.statsByRank, this.rank);
    if (this.defense > 0) return { ...stats, [StatType.DEFENSE]: this.defense };
    return stats;
  }

  /** Get stats with per-stat-line ranks. Missing keys default to `this.rank`. */
  getStatsPerLine(ranks: Record<string, number>): Partial<Record<StatType, number>> {
    const result: Partial<Record<StatType, number>> = {};
    // Get the stat keys from rank 1 (all ranks have the same keys)
    const refStats = this.statsByRank[1] ?? {};
    for (const key of Object.keys(refStats)) {
      const lineRank = (ranks[key] ?? this.rank) as 1 | 2 | 3 | 4;
      const rankStats = lookupByLevel(this.statsByRank, lineRank);
      if (key in rankStats) {
        result[key as StatType] = rankStats[key as StatType];
      }
    }
    if (this.defense > 0) result[StatType.DEFENSE] = this.defense;
    return result;
  }

  /** Get the stat types this gear provides (from rank 1 reference). */
  getStatKeys(): StatType[] {
    const refStats = this.statsByRank[1] ?? {};
    return Object.keys(refStats) as StatType[];
  }
}
