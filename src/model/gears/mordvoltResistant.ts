import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Mordvolt Resistant Vest (Armor) ─────────────────────────────────────────
export class MordvoltResistantVest extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 44,
          [StatType.AGILITY]: 29,
          [StatType.HP_BONUS]: 0.105,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 28.8;
}

// ── Mordvolt Resistant Vest MOD (Armor) ─────────────────────────────────────
export class MordvoltResistantVestMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 28.8;
}

// ── Mordvolt Resistant Vest T1 (Armor) ──────────────────────────────────────
export class MordvoltResistantVestT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 28.8;
}

// ── Mordvolt Resistant Gloves (Gloves) ──────────────────────────────────────
export class MordvoltResistantGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 33,
          [StatType.INTELLECT]: 22,
          [StatType.TREATMENT_BONUS]: 0.088,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 21.6;
}

// ── Mordvolt Resistant Gloves MOD (Gloves) ──────────────────────────────────
export class MordvoltResistantGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21.6;
}

// ── Mordvolt Resistant Gloves T1 (Gloves) ───────────────────────────────────
export class MordvoltResistantGlovesT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21.6;
}

// ── Mordvolt Resistant Battery (Kit) ────────────────────────────────────────
export class MordvoltResistantBattery extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 21,
          [StatType.TREATMENT_BONUS]: 0.105,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 10.8;
}

// ── Mordvolt Resistant Battery MOD (Kit) ────────────────────────────────────
export class MordvoltResistantBatteryMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 10.8;
}

// ── Mordvolt Resistant Battery T1 (Kit) ─────────────────────────────────────
export class MordvoltResistantBatteryT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 10.8;
}

// ── Mordvolt Resistant Wrench (Kit) ─────────────────────────────────────────
export class MordvoltResistantWrench extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 21,
          [StatType.ATTACK_BONUS]: 0.105,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 10.8;
}

// ── Mordvolt Resistant Wrench MOD (Kit) ─────────────────────────────────────
export class MordvoltResistantWrenchMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 10.8;
}

// ── Mordvolt Resistant Wrench T1 (Kit) ──────────────────────────────────────
export class MordvoltResistantWrenchT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 10.8;
}
