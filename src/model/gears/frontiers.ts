import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Frontiers Armor (Armor) ─────────────────────────────────────────────────
export class FrontiersArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 87, [StatType.INTELLECT]: 58, [StatType.ULTIMATE_DAMAGE_BONUS]: 0.259 },
        2: { [StatType.STRENGTH]: 95, [StatType.INTELLECT]: 63, [StatType.ULTIMATE_DAMAGE_BONUS]: 0.285 },
        3: { [StatType.STRENGTH]: 104, [StatType.INTELLECT]: 69, [StatType.ULTIMATE_DAMAGE_BONUS]: 0.311 },
        4: { [StatType.STRENGTH]: 113, [StatType.INTELLECT]: 75, [StatType.ULTIMATE_DAMAGE_BONUS]: 0.336 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Frontiers Armor MOD (Armor) ─────────────────────────────────────────────
export class FrontiersArmorMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Frontiers Armor T1 (Armor) ──────────────────────────────────────────────
export class FrontiersArmorT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 87, [StatType.AGILITY]: 58, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.207 },
        2: { [StatType.STRENGTH]: 95, [StatType.AGILITY]: 63, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.228 },
        3: { [StatType.STRENGTH]: 104, [StatType.AGILITY]: 69, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.248 },
        4: { [StatType.STRENGTH]: 113, [StatType.AGILITY]: 75, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.269 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Frontiers Armor T2 (Armor) ──────────────────────────────────────────────
export class FrontiersArmorT2 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 87, [StatType.INTELLECT]: 58, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.207 },
        2: { [StatType.AGILITY]: 95, [StatType.INTELLECT]: 63, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.228 },
        3: { [StatType.AGILITY]: 104, [StatType.INTELLECT]: 69, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.248 },
        4: { [StatType.AGILITY]: 113, [StatType.INTELLECT]: 75, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.269 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Frontiers Armor T3 (Armor) ──────────────────────────────────────────────
export class FrontiersArmorT3 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Frontiers Blight RES Gloves (Gloves) ────────────────────────────────────
export class FrontiersBlightResGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 65, [StatType.INTELLECT]: 43, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.345 },
        2: { [StatType.AGILITY]: 71, [StatType.INTELLECT]: 47, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.380 },
        3: { [StatType.AGILITY]: 78, [StatType.INTELLECT]: 51, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.414 },
        4: { [StatType.AGILITY]: 84, [StatType.INTELLECT]: 55, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.449 },
      },
    });
  }
  static readonly DEFENSE = 42;
}

// ── Frontiers Blight RES Gloves MOD (Gloves) ────────────────────────────────
export class FrontiersBlightResGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── Frontiers Fiber Gloves (Gloves) ─────────────────────────────────────────
export class FrontiersFiberGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── Frontiers Fiber Gloves MOD (Gloves) ─────────────────────────────────────
export class FrontiersFiberGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── Frontiers Analyzer (Kit) ────────────────────────────────────────────────
export class FrontiersAnalyzer extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers Analyzer MOD (Kit) ────────────────────────────────────────────
export class FrontiersAnalyzerMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers Comm (Kit) ────────────────────────────────────────────────────
export class FrontiersComm extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 32, [StatType.AGILITY]: 21, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.414 },
        2: { [StatType.STRENGTH]: 35, [StatType.AGILITY]: 23, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.455 },
        3: { [StatType.STRENGTH]: 38, [StatType.AGILITY]: 25, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.497 },
        4: { [StatType.STRENGTH]: 41, [StatType.AGILITY]: 27, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.538 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers Comm MOD (Kit) ────────────────────────────────────────────────
export class FrontiersCommMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers Comm T1 (Kit) ─────────────────────────────────────────────────
export class FrontiersCommT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 32, [StatType.INTELLECT]: 21, [StatType.CRYO_DAMAGE_BONUS]: 0.230, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.230 },
        2: { [StatType.STRENGTH]: 35, [StatType.INTELLECT]: 23, [StatType.CRYO_DAMAGE_BONUS]: 0.253, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.253 },
        3: { [StatType.STRENGTH]: 38, [StatType.INTELLECT]: 25, [StatType.CRYO_DAMAGE_BONUS]: 0.276, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.276 },
        4: { [StatType.STRENGTH]: 41, [StatType.INTELLECT]: 27, [StatType.CRYO_DAMAGE_BONUS]: 0.299, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.299 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers Extra O2 Tube (Kit) ───────────────────────────────────────────
export class FrontiersExtraO2Tube extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 32, [StatType.INTELLECT]: 21 },
        2: { [StatType.AGILITY]: 35, [StatType.INTELLECT]: 23 },
        3: { [StatType.AGILITY]: 38, [StatType.INTELLECT]: 25 },
        4: { [StatType.AGILITY]: 41, [StatType.INTELLECT]: 27 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers O2 Tether (Kit) ───────────────────────────────────────────────
export class FrontiersO2Tether extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Frontiers O2 Tether MOD (Kit) ───────────────────────────────────────────
export class FrontiersO2TetherMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.FRONTIERS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}
