import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── AIC Light Armor (Armor) ─────────────────────────────────────────────────
export class AicLightArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.AIC_LIGHT,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 30,
          [StatType.WILL]: 30,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.081,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 22.4,
    });
  }
}

// ── AIC Tactical Gloves (Gloves) ────────────────────────────────────────────
export class AicTacticalGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.AIC_LIGHT,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 23,
          [StatType.AGILITY]: 23,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.135,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 16.8,
    });
  }
}

// ── AIC Ceramic Plate (Kit) ─────────────────────────────────────────────────
export class AicCeramicPlate extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AIC_LIGHT,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 16,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.162,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 8.4,
    });
  }
}

// ── AIC Light Plate (Kit) ───────────────────────────────────────────────────
export class AicLightPlate extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AIC_LIGHT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 8.4,
    });
  }
}
