import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Redeemer Seal (Kit) ─────────────────────────────────────────────────────
// Intellect + Ultimate Gain Efficiency
export class RedeemerSeal extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.NONE,
      rank,
      statsByRank: {
        1: { [StatType.INTELLECT]: 43, [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.257 },
        2: { [StatType.INTELLECT]: 47, [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.283 },
        3: { [StatType.INTELLECT]: 51, [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.309 },
        4: { [StatType.INTELLECT]: 55, [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.334 },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Redeemer Seal T1 (Kit) ──────────────────────────────────────────────────
// Will + Critical Rate
export class RedeemerSealT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.NONE,
      rank,
      statsByRank: {
        1: { [StatType.WILL]: 43, [StatType.CRITICAL_RATE]: 0.108 },
        2: { [StatType.WILL]: 47, [StatType.CRITICAL_RATE]: 0.119 },
        3: { [StatType.WILL]: 51, [StatType.CRITICAL_RATE]: 0.130 },
        4: { [StatType.WILL]: 55, [StatType.CRITICAL_RATE]: 0.140 },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Redeemer Tag (Kit) ──────────────────────────────────────────────────────
// Strength + Final DMG Reduction
export class RedeemerTag extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.NONE,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 43, [StatType.FINAL_DAMAGE_REDUCTION]: 0.178 },
        2: { [StatType.STRENGTH]: 47, [StatType.FINAL_DAMAGE_REDUCTION]: 0.192 },
        3: { [StatType.STRENGTH]: 51, [StatType.FINAL_DAMAGE_REDUCTION]: 0.206 },
        4: { [StatType.STRENGTH]: 55, [StatType.FINAL_DAMAGE_REDUCTION]: 0.219 },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Redeemer Tag T1 (Kit) ───────────────────────────────────────────────────
// Agility + Combo Skill DMG Bonus
export class RedeemerTagT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.NONE,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 43, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.432 },
        2: { [StatType.AGILITY]: 47, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.475 },
        3: { [StatType.AGILITY]: 51, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.518 },
        4: { [StatType.AGILITY]: 55, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.562 },
      },
    });
  }

  static readonly DEFENSE = 21;
}
