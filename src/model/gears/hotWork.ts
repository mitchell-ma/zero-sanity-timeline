import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Hot Work Exoskeleton (Armor) ──────────────────────────────────────────────
export class HotWorkExoskeleton extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 87,
          [StatType.AGILITY]: 58,
          [StatType.HEAT_DAMAGE_BONUS]: 0.115,
          [StatType.NATURE_DAMAGE_BONUS]: 0.115,
        },
        2: {
          [StatType.STRENGTH]: 95,
          [StatType.AGILITY]: 63,
          [StatType.HEAT_DAMAGE_BONUS]: 0.127,
          [StatType.NATURE_DAMAGE_BONUS]: 0.127,
        },
        3: {
          [StatType.STRENGTH]: 104,
          [StatType.AGILITY]: 69,
          [StatType.HEAT_DAMAGE_BONUS]: 0.138,
          [StatType.NATURE_DAMAGE_BONUS]: 0.138,
        },
        4: {
          [StatType.STRENGTH]: 113,
          [StatType.AGILITY]: 75,
          [StatType.HEAT_DAMAGE_BONUS]: 0.149,
          [StatType.NATURE_DAMAGE_BONUS]: 0.149,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Hot Work Gauntlets (Gloves) ───────────────────────────────────────────────
export class HotWorkGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 65,
          [StatType.STRENGTH]: 43,
          [StatType.HEAT_DAMAGE_BONUS]: 0.192,
          [StatType.NATURE_DAMAGE_BONUS]: 0.192,
        },
        2: {
          [StatType.INTELLECT]: 71,
          [StatType.STRENGTH]: 47,
          [StatType.HEAT_DAMAGE_BONUS]: 0.211,
          [StatType.NATURE_DAMAGE_BONUS]: 0.211,
        },
        3: {
          [StatType.INTELLECT]: 78,
          [StatType.STRENGTH]: 51,
          [StatType.HEAT_DAMAGE_BONUS]: 0.230,
          [StatType.NATURE_DAMAGE_BONUS]: 0.230,
        },
        4: {
          [StatType.INTELLECT]: 84,
          [StatType.STRENGTH]: 55,
          [StatType.HEAT_DAMAGE_BONUS]: 0.249,
          [StatType.NATURE_DAMAGE_BONUS]: 0.249,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Hot Work Gauntlets T1 (Gloves) ────────────────────────────────────────────
export class HotWorkGauntletsT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 65,
          [StatType.INTELLECT]: 43,
          [StatType.HEAT_DAMAGE_BONUS]: 0.192,
          [StatType.NATURE_DAMAGE_BONUS]: 0.192,
        },
        2: {
          [StatType.WILL]: 71,
          [StatType.INTELLECT]: 47,
          [StatType.HEAT_DAMAGE_BONUS]: 0.211,
          [StatType.NATURE_DAMAGE_BONUS]: 0.211,
        },
        3: {
          [StatType.WILL]: 78,
          [StatType.INTELLECT]: 51,
          [StatType.HEAT_DAMAGE_BONUS]: 0.230,
          [StatType.NATURE_DAMAGE_BONUS]: 0.230,
        },
        4: {
          [StatType.WILL]: 84,
          [StatType.INTELLECT]: 55,
          [StatType.HEAT_DAMAGE_BONUS]: 0.249,
          [StatType.NATURE_DAMAGE_BONUS]: 0.249,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Hot Work Power Bank (Kit) ─────────────────────────────────────────────────
export class HotWorkPowerBank extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 32,
          [StatType.AGILITY]: 21,
          [StatType.ARTS_INTENSITY]: 41.4,
        },
        2: {
          [StatType.STRENGTH]: 35,
          [StatType.AGILITY]: 23,
          [StatType.ARTS_INTENSITY]: 45.5,
        },
        3: {
          [StatType.STRENGTH]: 38,
          [StatType.AGILITY]: 25,
          [StatType.ARTS_INTENSITY]: 49.7,
        },
        4: {
          [StatType.STRENGTH]: 41,
          [StatType.AGILITY]: 27,
          [StatType.ARTS_INTENSITY]: 53.8,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Hot Work Power Cartridge (Kit) ────────────────────────────────────────────
export class HotWorkPowerCartridge extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 32,
          [StatType.INTELLECT]: 21,
          [StatType.ARTS_INTENSITY]: 41.4,
        },
        2: {
          [StatType.WILL]: 35,
          [StatType.INTELLECT]: 23,
          [StatType.ARTS_INTENSITY]: 45.5,
        },
        3: {
          [StatType.WILL]: 38,
          [StatType.INTELLECT]: 25,
          [StatType.ARTS_INTENSITY]: 49.7,
        },
        4: {
          [StatType.WILL]: 41,
          [StatType.INTELLECT]: 27,
          [StatType.ARTS_INTENSITY]: 53.8,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Hot Work Pyrometer (Kit) ──────────────────────────────────────────────────
export class HotWorkPyrometer extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 41,
          [StatType.ARTS_INTENSITY]: 41.4,
        },
        2: {
          [StatType.INTELLECT]: 45,
          [StatType.ARTS_INTENSITY]: 45.5,
        },
        3: {
          [StatType.INTELLECT]: 49,
          [StatType.ARTS_INTENSITY]: 49.7,
        },
        4: {
          [StatType.INTELLECT]: 53,
          [StatType.ARTS_INTENSITY]: 53.8,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}
