import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Tide Fall Light Armor (Armor) ───────────────────────────────────────────
export class TideFallLightArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.TIDE_SURGE,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 87,
          [StatType.STRENGTH]: 58,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.123,
        },
        2: {
          [StatType.INTELLECT]: 95,
          [StatType.STRENGTH]: 63,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.136,
        },
        3: {
          [StatType.INTELLECT]: 104,
          [StatType.STRENGTH]: 69,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.148,
        },
        4: {
          [StatType.INTELLECT]: 113,
          [StatType.STRENGTH]: 75,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.160,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

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
