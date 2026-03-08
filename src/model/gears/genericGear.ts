import { GearEffectType, GearType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

/**
 * Generic gear stub for registry entries that don't have full stat tables yet.
 */
export class GenericGear extends Gear {
  constructor(params: {
    gearType: GearType;
    gearEffectType?: GearEffectType;
    rank?: GearRank;
  }) {
    super({
      gearType: params.gearType,
      gearEffectType: params.gearEffectType ?? GearEffectType.HOT_WORK,
      rank: params.rank ?? 1,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
}
