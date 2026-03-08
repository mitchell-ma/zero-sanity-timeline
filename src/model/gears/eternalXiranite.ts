import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Eternal Xiranite Armor (Armor) ──────────────────────────────────────────
export class EternalXiraniteArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 87,
          [StatType.INTELLECT]: 58,
          [StatType.ARTS_INTENSITY]: 20.7,
        },
        2: {
          [StatType.WILL]: 95,
          [StatType.INTELLECT]: 63,
          [StatType.ARTS_INTENSITY]: 22.8,
        },
        3: {
          [StatType.WILL]: 104,
          [StatType.INTELLECT]: 69,
          [StatType.ARTS_INTENSITY]: 24.8,
        },
        4: {
          [StatType.WILL]: 113,
          [StatType.INTELLECT]: 75,
          [StatType.ARTS_INTENSITY]: 26.9,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Eternal Xiranite Gloves (Gloves) ────────────────────────────────────────
export class EternalXiraniteGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 65,
          [StatType.STRENGTH]: 43,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.205,
        },
        2: {
          [StatType.INTELLECT]: 71,
          [StatType.STRENGTH]: 47,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.226,
        },
        3: {
          [StatType.INTELLECT]: 78,
          [StatType.STRENGTH]: 51,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.246,
        },
        4: {
          [StatType.INTELLECT]: 84,
          [StatType.STRENGTH]: 55,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.267,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Eternal Xiranite Gloves T1 (Gloves) ─────────────────────────────────────
export class EternalXiraniteGlovesT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 65,
          [StatType.WILL]: 43,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.205,
        },
        2: {
          [StatType.INTELLECT]: 71,
          [StatType.WILL]: 47,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.226,
        },
        3: {
          [StatType.INTELLECT]: 78,
          [StatType.WILL]: 51,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.246,
        },
        4: {
          [StatType.INTELLECT]: 84,
          [StatType.WILL]: 55,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.267,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Eternal Xiranite Auxiliary Arm (Kit) ─────────────────────────────────────
export class EternalXiraniteAuxiliaryArm extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 32,
          [StatType.INTELLECT]: 21,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.246,
        },
        2: {
          [StatType.WILL]: 35,
          [StatType.INTELLECT]: 23,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.271,
        },
        3: {
          [StatType.WILL]: 38,
          [StatType.INTELLECT]: 25,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.296,
        },
        4: {
          [StatType.WILL]: 41,
          [StatType.INTELLECT]: 27,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.320,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Eternal Xiranite Power Core (Kit) ───────────────────────────────────────
export class EternalXiranitePowerCore extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 32,
          [StatType.STRENGTH]: 21,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.246,
        },
        2: {
          [StatType.INTELLECT]: 35,
          [StatType.STRENGTH]: 23,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.271,
        },
        3: {
          [StatType.INTELLECT]: 38,
          [StatType.STRENGTH]: 25,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.296,
        },
        4: {
          [StatType.INTELLECT]: 41,
          [StatType.STRENGTH]: 27,
          [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.320,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Eternal Xiranite Power Core T1 (Kit) ────────────────────────────────────
export class EternalXiranitePowerCoreT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 32,
          [StatType.WILL]: 21,
          [StatType.TREATMENT_BONUS]: 0.207,
        },
        2: {
          [StatType.INTELLECT]: 35,
          [StatType.WILL]: 23,
          [StatType.TREATMENT_BONUS]: 0.228,
        },
        3: {
          [StatType.INTELLECT]: 38,
          [StatType.WILL]: 25,
          [StatType.TREATMENT_BONUS]: 0.248,
        },
        4: {
          [StatType.INTELLECT]: 41,
          [StatType.WILL]: 27,
          [StatType.TREATMENT_BONUS]: 0.269,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}
