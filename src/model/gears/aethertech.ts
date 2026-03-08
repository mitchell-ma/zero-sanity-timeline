import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Æthertech Plating (Armor) ───────────────────────────────────────────────
export class AethertechPlating extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.AETHERTECH,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 87,
          [StatType.WILL]: 58,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.207,
        },
        2: {
          [StatType.STRENGTH]: 95,
          [StatType.WILL]: 63,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.228,
        },
        3: {
          [StatType.STRENGTH]: 104,
          [StatType.WILL]: 69,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.248,
        },
        4: {
          [StatType.STRENGTH]: 113,
          [StatType.WILL]: 75,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.269,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Æthertech Gloves (Gloves) ───────────────────────────────────────────────
export class AethertechGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.AETHERTECH,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 65,
          [StatType.STRENGTH]: 43,
          [StatType.ARTS_INTENSITY]: 34.5,
        },
        2: {
          [StatType.AGILITY]: 71,
          [StatType.STRENGTH]: 47,
          [StatType.ARTS_INTENSITY]: 38.0,
        },
        3: {
          [StatType.AGILITY]: 78,
          [StatType.STRENGTH]: 51,
          [StatType.ARTS_INTENSITY]: 41.4,
        },
        4: {
          [StatType.AGILITY]: 84,
          [StatType.STRENGTH]: 55,
          [StatType.ARTS_INTENSITY]: 44.9,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Æthertech Analysis Band (Kit) ───────────────────────────────────────────
export class AethertechAnalysisBand extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AETHERTECH,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 32,
          [StatType.WILL]: 21,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.230,
        },
        2: {
          [StatType.STRENGTH]: 35,
          [StatType.WILL]: 23,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.253,
        },
        3: {
          [StatType.STRENGTH]: 38,
          [StatType.WILL]: 25,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.276,
        },
        4: {
          [StatType.STRENGTH]: 41,
          [StatType.WILL]: 27,
          [StatType.PHYSICAL_DAMAGE_BONUS]: 0.299,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Æthertech Stabilizer (Kit) ──────────────────────────────────────────────
export class AethertechStabilizer extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AETHERTECH,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 32,
          [StatType.STRENGTH]: 21,
          [StatType.ARTS_INTENSITY]: 41.4,
        },
        2: {
          [StatType.AGILITY]: 35,
          [StatType.STRENGTH]: 23,
          [StatType.ARTS_INTENSITY]: 45.5,
        },
        3: {
          [StatType.AGILITY]: 38,
          [StatType.STRENGTH]: 25,
          [StatType.ARTS_INTENSITY]: 49.7,
        },
        4: {
          [StatType.AGILITY]: 41,
          [StatType.STRENGTH]: 27,
          [StatType.ARTS_INTENSITY]: 53.8,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Æthertech Visor (Kit) ───────────────────────────────────────────────────
export class AethertechVisor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AETHERTECH,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Æthertech Watch (Kit) ───────────────────────────────────────────────────
export class AethertechWatch extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.AETHERTECH,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}
