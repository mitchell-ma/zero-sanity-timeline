import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Aburrey Heavy Armor (Armor) ─────────────────────────────────────────────
export class AburreyHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 61,
          [StatType.AGILITY]: 41,
          [StatType.SKILL_DAMAGE_BONUS]: 0.098,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 40;
}

// ── Aburrey Heavy Armor T1 (Armor) ──────────────────────────────────────────
export class AburreyHeavyArmorT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 40;
}

// ── Aburrey Light Armor (Armor) ─────────────────────────────────────────────
export class AburreyLightArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 40;
}

// ── Aburrey Light Armor T1 (Armor) ──────────────────────────────────────────
export class AburreyLightArmorT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 40;
}

// ── Aburrey Gauntlets (Gloves) ──────────────────────────────────────────────
export class AburreyGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 46,
          [StatType.WILL]: 30,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.245,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 30;
}

// ── Aburrey Auditory Chip (Kit) ─────────────────────────────────────────────
export class AburreyAuditoryChip extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 23,
          [StatType.WILL]: 15,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.294,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Aburrey Auditory Chip T1 (Kit) ──────────────────────────────────────────
export class AburreyAuditoryChipT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Aburrey Flashlight (Kit) ────────────────────────────────────────────────
export class AburreyFlashlight extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 23,
          [StatType.STRENGTH]: 15,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.175,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Aburrey Sensor Chip (Kit) ───────────────────────────────────────────────
export class AburreySensorChip extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 23,
          [StatType.AGILITY]: 15,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.294,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Aburrey Sensor Chip T1 (Kit) ────────────────────────────────────────────
export class AburreySensorChipT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 15;
}

// ── Aburrey UV Lamp (Kit) ───────────────────────────────────────────────────
export class AburreyUvLamp extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      rank,
      statsByRank: {
        1: {
          [StatType.STRENGTH]: 23,
          [StatType.AGILITY]: 15,
          [StatType.SKILL_DAMAGE_BONUS]: 0.196,
        },
        2: {},
        3: {},
        4: {},
      },
    });
  }

  static readonly DEFENSE = 15;
}
