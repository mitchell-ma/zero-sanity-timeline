import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── AIC Heavy Armor (Armor) ─────────────────────────────────────────────────
export class AicHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.AIC_HEAVY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 30,
          [StatType.AGILITY]: 30,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.039,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 22.4;
}

// ── AIC Gauntlets (Gloves) ──────────────────────────────────────────────────
export class AicGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.AIC_HEAVY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 23,
          [StatType.WILL]: 23,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.063,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 16.8;
}

// ── AIC Alloy Plate (Kit) ───────────────────────────────────────────────────
export class AicAlloyPlate extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AIC_HEAVY,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 16,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.075,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 8.4;
}

// ── AIC Heavy Plate (Kit) ───────────────────────────────────────────────────
export class AicHeavyPlate extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AIC_HEAVY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 16,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.075,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 8.4;
}
