import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Bonekrusha Heavy Armor (Armor) ──────────────────────────────────────────
export class BonekrushaHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 87,
          [StatType.INTELLECT]: 58,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.123,
        },
        2: {
          [StatType.AGILITY]: 95,
          [StatType.INTELLECT]: 63,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.136,
        },
        3: {
          [StatType.AGILITY]: 104,
          [StatType.INTELLECT]: 69,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.148,
        },
        4: {
          [StatType.AGILITY]: 113,
          [StatType.INTELLECT]: 75,
          [StatType.ULTIMATE_DAMAGE_BONUS]: 0.160,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Bonekrusha Heavy Armor T1 (Armor) ───────────────────────────────────────
export class BonekrushaHeavyArmorT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 87,
          [StatType.STRENGTH]: 58,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.207,
        },
        2: {
          [StatType.AGILITY]: 95,
          [StatType.STRENGTH]: 63,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.228,
        },
        3: {
          [StatType.AGILITY]: 104,
          [StatType.STRENGTH]: 69,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.248,
        },
        4: {
          [StatType.AGILITY]: 113,
          [StatType.STRENGTH]: 75,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.269,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Bonekrusha Poncho (Armor) ───────────────────────────────────────────────
export class BonekrushaPoncho extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 87,
          [StatType.STRENGTH]: 58,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.207,
        },
        2: {
          [StatType.WILL]: 95,
          [StatType.STRENGTH]: 63,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.228,
        },
        3: {
          [StatType.WILL]: 104,
          [StatType.STRENGTH]: 69,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.248,
        },
        4: {
          [StatType.WILL]: 113,
          [StatType.STRENGTH]: 75,
          [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.269,
        },
      },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Bonekrusha Poncho MOD (Armor) ───────────────────────────────────────────
export class BonekrushaPonchoMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Bonekrusha Poncho T1 (Armor) ────────────────────────────────────────────
export class BonekrushaPonchoT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 56;
}

// ── Bonekrusha Wristband (Gloves) ───────────────────────────────────────────
export class BonekrushaWristband extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Bonekrusha Wristband MOD (Gloves) ───────────────────────────────────────
export class BonekrushaWristbandMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 42;
}

// ── Bonekrusha Figurine (Kit) ───────────────────────────────────────────────
export class BonekrushaFigurine extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 32,
          [StatType.AGILITY]: 21,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.414,
        },
        2: {
          [StatType.WILL]: 35,
          [StatType.AGILITY]: 23,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.455,
        },
        3: {
          [StatType.WILL]: 38,
          [StatType.AGILITY]: 25,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.497,
        },
        4: {
          [StatType.WILL]: 41,
          [StatType.AGILITY]: 27,
          [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.538,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Bonekrusha Figurine MOD (Kit) ───────────────────────────────────────────
export class BonekrushaFigurineMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Bonekrusha Figurine T1 (Kit) ────────────────────────────────────────────
export class BonekrushaFigurineT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Bonekrusha Mask (Kit) ───────────────────────────────────────────────────
export class BonekrushaMask extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: {
        1: {
          [StatType.AGILITY]: 32,
          [StatType.STRENGTH]: 21,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.414,
        },
        2: {
          [StatType.AGILITY]: 35,
          [StatType.STRENGTH]: 23,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.455,
        },
        3: {
          [StatType.AGILITY]: 38,
          [StatType.STRENGTH]: 25,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.497,
        },
        4: {
          [StatType.AGILITY]: 41,
          [StatType.STRENGTH]: 27,
          [StatType.STAGGER_DAMAGE_BONUS]: 0.538,
        },
      },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Bonekrusha Mask MOD (Kit) ───────────────────────────────────────────────
export class BonekrushaMaskMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}

// ── Bonekrusha Mask T1 (Kit) ────────────────────────────────────────────────
export class BonekrushaMaskT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.BONEKRUSHA,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }

  static readonly DEFENSE = 21;
}
