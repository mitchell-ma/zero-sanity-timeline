import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Roving MSGR Jacket (Armor) ──────────────────────────────────────────────
export class RovingMsgrJacket extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 44, [StatType.INTELLECT]: 29, [StatType.ATTACK]: 16.2 },
        2: {},
        3: {},
        4: {},
      },
      defense: 28.8,
    });
  }
}

// ── Roving MSGR Jacket MOD (Armor) ──────────────────────────────────────────
export class RovingMsgrJacketMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 28.8,
    });
  }
}

// ── Roving MSGR Jacket T1 (Armor) ───────────────────────────────────────────
export class RovingMsgrJacketT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 28.8,
    });
  }
}

// ── Roving MSGR Fists (Gloves) ──────────────────────────────────────────────
export class RovingMsgrFists extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 33, [StatType.STRENGTH]: 22, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.097 },
        2: {},
        3: {},
        4: {},
      },
      defense: 21.6,
    });
  }
}

// ── Roving MSGR Fists MOD (Gloves) ──────────────────────────────────────────
export class RovingMsgrFistsMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21.6,
    });
  }
}

// ── Roving MSGR Fists T1 (Gloves) ───────────────────────────────────────────
export class RovingMsgrFistsT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21.6,
    });
  }
}

// ── Roving MSGR Flashlight (Kit) ────────────────────────────────────────────
export class RovingMsgrFlashlight extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 21, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.210 },
        2: {},
        3: {},
        4: {},
      },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Flashlight T1 (Kit) ─────────────────────────────────────────
export class RovingMsgrFlashlightT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Flashlight T2 (Kit) ─────────────────────────────────────────
export class RovingMsgrFlashlightT2 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Flashspike (Kit) ────────────────────────────────────────────
export class RovingMsgrFlashspike extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Flashspike MOD (Kit) ────────────────────────────────────────
export class RovingMsgrFlashspikeMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Gyro (Kit) ──────────────────────────────────────────────────
export class RovingMsgrGyro extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 21, [StatType.ATTACK_BONUS]: 0.105 },
        2: {},
        3: {},
        4: {},
      },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Gyro MOD (Kit) ──────────────────────────────────────────────
export class RovingMsgrGyroMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}

// ── Roving MSGR Gyro T1 (Kit) ───────────────────────────────────────────────
export class RovingMsgrGyroT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.ROVING_MSGR,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 10.8,
    });
  }
}
