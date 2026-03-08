import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── LYNX Cuirass (Armor) ────────────────────────────────────────────────────
export class LynxCuirass extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 87,
          [StatType.INTELLECT]: 58,
          [StatType.TREATMENT_BONUS]: 0.103,
        },
        2: {
          [StatType.WILL]: 95,
          [StatType.INTELLECT]: 63,
          [StatType.TREATMENT_BONUS]: 0.114,
        },
        3: {
          [StatType.WILL]: 104,
          [StatType.INTELLECT]: 69,
          [StatType.TREATMENT_BONUS]: 0.124,
        },
        4: {
          [StatType.WILL]: 113,
          [StatType.INTELLECT]: 75,
          [StatType.TREATMENT_BONUS]: 0.135,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── LYNX Cuirass MOD (Armor) ────────────────────────────────────────────────
export class LynxCuirassMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 56;
}

// ── LYNX Heavy Armor (Armor) ────────────────────────────────────────────────
export class LynxHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 56;
}

// ── LYNX Gauntlets (Gloves) ─────────────────────────────────────────────────
export class LynxGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 65,
          [StatType.STRENGTH]: 43,
          [StatType.TREATMENT_BONUS]: 0.172,
        },
        2: {
          [StatType.WILL]: 71,
          [StatType.STRENGTH]: 47,
          [StatType.TREATMENT_BONUS]: 0.190,
        },
        3: {
          [StatType.WILL]: 78,
          [StatType.STRENGTH]: 51,
          [StatType.TREATMENT_BONUS]: 0.207,
        },
        4: {
          [StatType.WILL]: 84,
          [StatType.STRENGTH]: 55,
          [StatType.TREATMENT_BONUS]: 0.224,
        },
      },
    });
  }

  static readonly DEFENSE = 42;
}

// ── LYNX Gloves (Gloves) ────────────────────────────────────────────────────
export class LynxGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 42;
}

// ── LYNX Gloves MOD (Gloves) ────────────────────────────────────────────────
export class LynxGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 42;
}

// ── LYNX Aegis Injector (Kit) ───────────────────────────────────────────────
export class LynxAegisInjector extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── LYNX Aegis Injector MOD (Kit) ───────────────────────────────────────────
export class LynxAegisInjectorMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── LYNX Connector (Kit) ────────────────────────────────────────────────────
export class LynxConnector extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 32,
          [StatType.WILL]: 21,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.171,
        },
        2: {
          [StatType.STRENGTH]: 35,
          [StatType.WILL]: 23,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.185,
        },
        3: {
          [StatType.STRENGTH]: 38,
          [StatType.WILL]: 25,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.199,
        },
        4: {
          [StatType.STRENGTH]: 41,
          [StatType.WILL]: 27,
          [StatType.FINAL_DAMAGE_REDUCTION]: 0.212,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── LYNX Connector MOD (Kit) ────────────────────────────────────────────────
export class LynxConnectorMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── LYNX Connector T1 (Kit) ─────────────────────────────────────────────────
export class LynxConnectorT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── LYNX Slab (Kit) ─────────────────────────────────────────────────────────
export class LynxSlab extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── LYNX Slab MOD (Kit) ─────────────────────────────────────────────────────
export class LynxSlabMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.LYNX,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}
