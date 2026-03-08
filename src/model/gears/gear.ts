import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { lookupByLevel } from "../../utils/lookupByLevel";
type StatsByRank = Readonly<Record<number, Partial<Record<StatType, number>>>>;

export abstract class Gear {
  readonly gearType: GearType;
  readonly gearEffectType: GearEffectType;
  rank: GearRank;

  protected readonly statsByRank: StatsByRank;

  constructor(params: {
    gearType: GearType;
    gearEffectType: GearEffectType;
    rank: GearRank;
    statsByRank: StatsByRank;
  }) {
    this.gearType = params.gearType;
    this.gearEffectType = params.gearEffectType;
    this.rank = params.rank;
    this.statsByRank = params.statsByRank;
  }

  getStats(): Partial<Record<StatType, number>> {
    return lookupByLevel(this.statsByRank, this.rank);
  }
}
