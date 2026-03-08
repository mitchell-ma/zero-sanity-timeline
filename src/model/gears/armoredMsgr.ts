import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Armored MSGR Jacket (Armor) ─────────────────────────────────────────────
export class ArmoredMsgrJacket extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 44, [StatType.AGILITY]: 29, [StatType.HP_BONUS]: 0.105 },
        2: {},
        3: {},
        4: {},
      },
    });
  }
  static readonly DEFENSE = 28.8;
}

// ── Armored MSGR Jacket MOD (Armor) ─────────────────────────────────────────
export class ArmoredMsgrJacketMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 28.8;
}

// ── Armored MSGR Jacket T1 (Armor) ──────────────────────────────────────────
export class ArmoredMsgrJacketT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 28.8;
}

// ── Armored MSGR Gloves (Gloves) ────────────────────────────────────────────
export class ArmoredMsgrGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 33, [StatType.WILL]: 22, [StatType.FINAL_DAMAGE_REDUCTION]: 0.080 },
        2: {},
        3: {},
        4: {},
      },
    });
  }
  static readonly DEFENSE = 21.6;
}

// ── Armored MSGR Gloves MOD (Gloves) ────────────────────────────────────────
export class ArmoredMsgrGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21.6;
}

// ── Armored MSGR Gloves T1 (Gloves) ────────────────────────────────────────
export class ArmoredMsgrGlovesT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21.6;
}

// ── Armored MSGR Gloves T2 (Gloves) ────────────────────────────────────────
export class ArmoredMsgrGlovesT2 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21.6;
}

// ── Armored MSGR Flashlight (Kit) ───────────────────────────────────────────
export class ArmoredMsgrFlashlight extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 21, [StatType.HP_BONUS]: 0.210 },
        2: {},
        3: {},
        4: {},
      },
    });
  }
  static readonly DEFENSE = 10.8;
}

// ── Armored MSGR Flashlight T1 (Kit) ────────────────────────────────────────
export class ArmoredMsgrFlashlightT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 10.8;
}

// ── Armored MSGR Flashspike (Kit) ───────────────────────────────────────────
export class ArmoredMsgrFlashspike extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 10.8;
}

// ── Armored MSGR Flashspike MOD (Kit) ───────────────────────────────────────
export class ArmoredMsgrFlashspikeMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 10.8;
}

// ── Armored MSGR Gyro (Kit) ─────────────────────────────────────────────────
export class ArmoredMsgrGyro extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 21, [StatType.ATTACK_BONUS]: 0.105 },
        2: {},
        3: {},
        4: {},
      },
    });
  }
  static readonly DEFENSE = 10.8;
}

// ── Armored MSGR Gyro MOD (Kit) ─────────────────────────────────────────────
export class ArmoredMsgrGyroMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 10.8;
}

// ── Armored MSGR Gyro T1 (Kit) ──────────────────────────────────────────────
export class ArmoredMsgrGyroT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ARMORED_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 10.8;
}
