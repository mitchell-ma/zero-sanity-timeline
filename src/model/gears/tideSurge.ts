import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Tide Surge Gauntlets (Gloves) ───────────────────────────────────────────
export class TideSurgeGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.TIDE_SURGE,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 65,
          [StatType.WILL]: 43,
          [StatType.CRYO_DAMAGE_BONUS]: 0.192,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.192,
        },
        2: {
          [StatType.STRENGTH]: 71,
          [StatType.WILL]: 47,
          [StatType.CRYO_DAMAGE_BONUS]: 0.211,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.211,
        },
        3: {
          [StatType.STRENGTH]: 78,
          [StatType.WILL]: 51,
          [StatType.CRYO_DAMAGE_BONUS]: 0.230,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.230,
        },
        4: {
          [StatType.STRENGTH]: 84,
          [StatType.WILL]: 55,
          [StatType.CRYO_DAMAGE_BONUS]: 0.249,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.249,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}
