/**
 * Data-driven gear — reads stats from JSON config instead of hardcoded TS subclasses.
 * Used for both built-in gears (from game-data/gears/*.json) and custom gears.
 */
import { GearCategory, GearSetType, StatType } from '../../consts/enums';
import { GearRank } from '../../consts/types';
import { Gear } from './gear';

export interface GearPieceConfig {
  name: string;
  gearCategory: string;
  defense: number;
  /** Stats by rank: { "1": { "STRENGTH": 87, ... }, "2": { ... }, ... } */
  allLevels: Record<string, Record<string, number>>;
}

export class DataDrivenGear extends Gear {
  constructor(piece: GearPieceConfig, gearSetType: string, rank: GearRank = 1) {
    // Convert string-keyed allLevels to number-keyed Record<StatType, number>
    const allLevels: Record<number, Partial<Record<StatType, number>>> = {};
    for (const [rankKey, stats] of Object.entries(piece.allLevels)) {
      const numericRank = Number(rankKey);
      const statRecord: Partial<Record<StatType, number>> = {};
      for (const [stat, value] of Object.entries(stats)) {
        statRecord[stat as StatType] = value;
      }
      allLevels[numericRank] = statRecord;
    }

    super({
      gearCategory: piece.gearCategory as GearCategory,
      gearSetType: gearSetType as unknown as GearSetType,
      rank,
      defense: piece.defense,
      allLevels,
    });
  }
}
