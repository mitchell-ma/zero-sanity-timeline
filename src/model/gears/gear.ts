import { GearSetType, GearCategory, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { lookupByLevel } from "../../utils/lookupByLevel";
type AllLevels = Readonly<Record<number, Partial<Record<StatType, number>>>>;

export abstract class Gear {
  readonly gearCategory: GearCategory;
  readonly gearSetType: GearSetType;
  /** Flat defense value (constant across all ranks). */
  readonly defense: number;
  rank: GearRank;

  protected readonly allLevels: AllLevels;

  constructor(params: {
    gearCategory: GearCategory;
    gearSetType: GearSetType;
    rank: GearRank;
    allLevels: AllLevels;
    defense?: number;
  }) {
    this.gearCategory = params.gearCategory;
    this.gearSetType = params.gearSetType;
    this.rank = params.rank;
    this.defense = params.defense ?? 0;
    this.allLevels = params.allLevels;
  }

  getStats(): Partial<Record<StatType, number>> {
    const stats = lookupByLevel(this.allLevels, this.rank);
    if (this.defense > 0) return { ...stats, [StatType.BASE_DEFENSE]: this.defense };
    return stats;
  }

  /** Get stats with per-stat-line ranks. Missing keys default to `this.rank`. */
  getStatsPerLine(ranks: Record<string, number>): Partial<Record<StatType, number>> {
    const result: Partial<Record<StatType, number>> = {};
    // Get the stat keys from rank 1 (all ranks have the same keys)
    const refStats = this.allLevels[1] ?? {};
    for (const key of Object.keys(refStats)) {
      const lineRank = (ranks[key] ?? this.rank) as 1 | 2 | 3 | 4;
      const rankStats = lookupByLevel(this.allLevels, lineRank);
      if (key in rankStats) {
        result[key as StatType] = rankStats[key as StatType];
      }
    }
    if (this.defense > 0) result[StatType.BASE_DEFENSE] = this.defense;
    return result;
  }

  /** Get the stat types this gear provides (from rank 1 reference). */
  getStatKeys(): StatType[] {
    const refStats = this.allLevels[1] ?? {};
    return Object.keys(refStats) as StatType[];
  }
}
