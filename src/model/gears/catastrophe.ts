import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Catastrophe Heavy Armor (Armor) ─────────────────────────────────────────
export class CatastropheHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.CATASTROPHE,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 61,
          [StatType.INTELLECT]: 41,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.184,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 40;
}

// ── Catastrophe Heavy Armor T1 (Armor) ──────────────────────────────────────
export class CatastropheHeavyArmorT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.CATASTROPHE,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 40;
}

// ── Catastrophe Gloves (Gloves) ─────────────────────────────────────────────
export class CatastropheGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.CATASTROPHE,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 46,
          [StatType.INTELLECT]: 30,
          [StatType.ARTS_INTENSITY]: 24.5,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 30;
}

// ── Catastrophe Filter (Kit) ────────────────────────────────────────────────
export class CatastropheFilter extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.CATASTROPHE,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 23,
          [StatType.INTELLECT]: 15,
          [StatType.ARTS_INTENSITY]: 29.4,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Catastrophe Gauze Cartridge (Kit) ────────────────────────────────────────
export class CatastropheGauzeCartridge extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.CATASTROPHE,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 23,
          [StatType.INTELLECT]: 15,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.368,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Catastrophe Gauze Cartridge T1 (Kit) ────────────────────────────────────
export class CatastropheGauzeCartridgeT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.CATASTROPHE,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 15;
}
