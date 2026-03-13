import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Mordvolt Insulation Vest (Armor) ────────────────────────────────────────
export class MordvoltInsulationVest extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 44,
          [StatType.STRENGTH]: 29,
          [StatType.ATTACK]: 16.2,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 28.8,
    });
  }
}

// ── Mordvolt Insulation Vest MOD (Armor) ────────────────────────────────────
export class MordvoltInsulationVestMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 28.8,
    });
  }
}

// ── Mordvolt Insulation Vest T1 (Armor) ─────────────────────────────────────
export class MordvoltInsulationVestT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 28.8,
    });
  }
}

// ── Mordvolt Insulation Vest T2 (Armor) ─────────────────────────────────────
export class MordvoltInsulationVestT2 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 28.8,
    });
  }
}

// ── Mordvolt Insulation Gloves (Gloves) ─────────────────────────────────────
export class MordvoltInsulationGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 33,
          [StatType.WILL]: 22,
          [StatType.ARTS_DAMAGE_BONUS]: 0.092,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 21.6,
    });
  }
}

// ── Mordvolt Insulation Gloves MOD (Gloves) ─────────────────────────────────
export class MordvoltInsulationGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21.6,
    });
  }
}

// ── Mordvolt Insulation Gloves T1 (Gloves) ──────────────────────────────────
export class MordvoltInsulationGlovesT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21.6,
    });
  }
}

// ── Mordvolt Insulation Battery (Kit) ───────────────────────────────────────
export class MordvoltInsulationBattery extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 21,
          [StatType.CRITICAL_RATE]: 0.052,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 10.8,
    });
  }
}

// ── Mordvolt Insulation Battery MOD (Kit) ───────────────────────────────────
export class MordvoltInsulationBatteryMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Mordvolt Insulation Battery T1 (Kit) ────────────────────────────────────
export class MordvoltInsulationBatteryT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Mordvolt Insulation Wrench (Kit) ────────────────────────────────────────
export class MordvoltInsulationWrench extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 21,
          [StatType.ATTACK_BONUS]: 0.105,
        },
        2: {},
        3: {},
        4: {},
      },
      defense: 10.8,
    });
  }
}

// ── Mordvolt Insulation Wrench MOD (Kit) ────────────────────────────────────
export class MordvoltInsulationWrenchMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Mordvolt Insulation Wrench T1 (Kit) ─────────────────────────────────────
export class MordvoltInsulationWrenchT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Mordvolt Insulation Wrench T2 (Kit) ─────────────────────────────────────
export class MordvoltInsulationWrenchT2 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}
