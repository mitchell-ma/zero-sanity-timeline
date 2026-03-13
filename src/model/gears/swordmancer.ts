import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Swordmancer Heavy Armor (Armor) ─────────────────────────────────────────
export class SwordmancerHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 87,
          [StatType.STRENGTH]: 58,
          [StatType.ARTS_INTENSITY]: 20.7,
        },
        2: {
          [StatType.AGILITY]: 95,
          [StatType.STRENGTH]: 63,
          [StatType.ARTS_INTENSITY]: 22.8,
        },
        3: {
          [StatType.AGILITY]: 104,
          [StatType.STRENGTH]: 69,
          [StatType.ARTS_INTENSITY]: 24.8,
        },
        4: {
          [StatType.AGILITY]: 113,
          [StatType.STRENGTH]: 75,
          [StatType.ARTS_INTENSITY]: 26.9,
        },
      },
      defense: 56,
    });
  }
}

// ── Swordmancer Light Armor (Armor) ─────────────────────────────────────────
export class SwordmancerLightArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 56,
    });
  }
}

// ── Swordmancer TAC Fists (Gloves) ──────────────────────────────────────────
export class SwordmancerTacFists extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 65,
          [StatType.STRENGTH]: 43,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.431,
        },
        2: {
          [StatType.AGILITY]: 71,
          [StatType.STRENGTH]: 47,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.474,
        },
        3: {
          [StatType.AGILITY]: 78,
          [StatType.STRENGTH]: 51,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.517,
        },
        4: {
          [StatType.AGILITY]: 84,
          [StatType.STRENGTH]: 55,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.561,
        },
      },
      defense: 42,
    });
  }
}

// ── Swordmancer TAC Gauntlets (Gloves) ──────────────────────────────────────
export class SwordmancerTacGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 65, [StatType.WILL]: 43, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.192 },
        2: { [StatType.STRENGTH]: 71, [StatType.WILL]: 47, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.211 },
        3: { [StatType.STRENGTH]: 78, [StatType.WILL]: 51, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.230 },
        4: { [StatType.STRENGTH]: 84, [StatType.WILL]: 55, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.249 },
      },
      defense: 42,
    });
  }
}

// ── Swordmancer TAC Gloves (Gloves) ──────────────────────────────────────────
export class SwordmancerTacGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 65, [StatType.WILL]: 43, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.192 },
        2: { [StatType.STRENGTH]: 71, [StatType.WILL]: 47, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.211 },
        3: { [StatType.STRENGTH]: 78, [StatType.WILL]: 51, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.230 },
        4: { [StatType.STRENGTH]: 84, [StatType.WILL]: 55, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.249 },
      },
      defense: 42,
    });
  }
}

// ── Swordmancer Flint (Kit) ─────────────────────────────────────────────────
export class SwordmancerFlint extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 32,
          [StatType.STRENGTH]: 21,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.230,
        },
        2: {
          [StatType.AGILITY]: 35,
          [StatType.STRENGTH]: 23,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.253,
        },
        3: {
          [StatType.AGILITY]: 38,
          [StatType.STRENGTH]: 25,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.276,
        },
        4: {
          [StatType.AGILITY]: 41,
          [StatType.STRENGTH]: 27,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.299,
        },
      },
      defense: 21,
    });
  }
}

// ── Swordmancer Micro Filter (Kit) ──────────────────────────────────────────
export class SwordmancerMicroFilter extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21,
    });
  }
}

// ── Swordmancer NAV Beacon (Kit) ────────────────────────────────────────────
export class SwordmancerNavBeacon extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.SWORDMANCER,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21,
    });
  }
}
