import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── MI Security Armor (Armor) ───────────────────────────────────────────────
export class MiSecurityArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 87, [StatType.STRENGTH]: 58, [StatType.ARTS_INTENSITY]: 20.7 },
        2: { [StatType.AGILITY]: 95, [StatType.STRENGTH]: 63, [StatType.ARTS_INTENSITY]: 22.8 },
        3: { [StatType.AGILITY]: 104, [StatType.STRENGTH]: 69, [StatType.ARTS_INTENSITY]: 24.8 },
        4: { [StatType.AGILITY]: 113, [StatType.STRENGTH]: 75, [StatType.ARTS_INTENSITY]: 26.9 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── MI Security Armor MOD (Armor) ───────────────────────────────────────────
export class MiSecurityArmorMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 56;
}

// ── MI Security Overalls (Armor) ────────────────────────────────────────────
export class MiSecurityOveralls extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.INTELLECT]: 87, [StatType.AGILITY]: 58, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.138 },
        2: { [StatType.INTELLECT]: 95, [StatType.AGILITY]: 63, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.152 },
        3: { [StatType.INTELLECT]: 104, [StatType.AGILITY]: 69, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.166 },
        4: { [StatType.INTELLECT]: 113, [StatType.AGILITY]: 75, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.179 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── MI Security Overalls MOD (Armor) ────────────────────────────────────────
export class MiSecurityOverallsMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 56;
}

// ── MI Security Overalls T1 (Armor) ─────────────────────────────────────────
export class MiSecurityOverallsT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 56;
}

// ── MI Security Overalls T2 (Armor) ─────────────────────────────────────────
export class MiSecurityOverallsT2 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 56;
}

// ── MI Security Gloves (Gloves) ─────────────────────────────────────────────
export class MiSecurityGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 65, [StatType.STRENGTH]: 43, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.345 },
        2: { [StatType.AGILITY]: 71, [StatType.STRENGTH]: 47, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.380 },
        3: { [StatType.AGILITY]: 78, [StatType.STRENGTH]: 51, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.414 },
        4: { [StatType.AGILITY]: 84, [StatType.STRENGTH]: 55, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.449 },
      },
    });
  }
  static readonly DEFENSE = 42;
}

// ── MI Security Gloves MOD (Gloves) ─────────────────────────────────────────
export class MiSecurityGlovesMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── MI Security Hands PPE (Gloves) ──────────────────────────────────────────
export class MiSecurityHandsPpe extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.INTELLECT]: 65, [StatType.AGILITY]: 43, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.230 },
        2: { [StatType.INTELLECT]: 71, [StatType.AGILITY]: 47, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.253 },
        3: { [StatType.INTELLECT]: 78, [StatType.AGILITY]: 51, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.276 },
        4: { [StatType.INTELLECT]: 84, [StatType.AGILITY]: 55, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.299 },
      },
    });
  }
  static readonly DEFENSE = 42;
}

// ── MI Security Hands PPE MOD (Gloves) ──────────────────────────────────────
export class MiSecurityHandsPpeMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── MI Security Hands PPE T1 (Gloves) ───────────────────────────────────────
export class MiSecurityHandsPpeT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── MI Security Armband (Kit) ───────────────────────────────────────────────
export class MiSecurityArmband extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 32, [StatType.WILL]: 21, [StatType.CRYO_DAMAGE_BONUS]: 0.230, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.230 },
        2: { [StatType.STRENGTH]: 35, [StatType.WILL]: 23, [StatType.CRYO_DAMAGE_BONUS]: 0.253, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.253 },
        3: { [StatType.STRENGTH]: 38, [StatType.WILL]: 25, [StatType.CRYO_DAMAGE_BONUS]: 0.276, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.276 },
        4: { [StatType.STRENGTH]: 41, [StatType.WILL]: 27, [StatType.CRYO_DAMAGE_BONUS]: 0.299, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.299 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Push Knife (Kit) ────────────────────────────────────────────
export class MiSecurityPushKnife extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.WILL]: 32, [StatType.INTELLECT]: 21, [StatType.HEAT_DAMAGE_BONUS]: 0.230, [StatType.NATURE_DAMAGE_BONUS]: 0.230 },
        2: { [StatType.WILL]: 35, [StatType.INTELLECT]: 23, [StatType.HEAT_DAMAGE_BONUS]: 0.253, [StatType.NATURE_DAMAGE_BONUS]: 0.253 },
        3: { [StatType.WILL]: 38, [StatType.INTELLECT]: 25, [StatType.HEAT_DAMAGE_BONUS]: 0.276, [StatType.NATURE_DAMAGE_BONUS]: 0.276 },
        4: { [StatType.WILL]: 41, [StatType.INTELLECT]: 27, [StatType.HEAT_DAMAGE_BONUS]: 0.299, [StatType.NATURE_DAMAGE_BONUS]: 0.299 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Push Knife MOD (Kit) ────────────────────────────────────────
export class MiSecurityPushKnifeMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Push Knife T1 (Kit) ─────────────────────────────────────────
export class MiSecurityPushKnifeT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Scope (Kit) ─────────────────────────────────────────────────
export class MiSecurityScope extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 32, [StatType.STRENGTH]: 21, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.414 },
        2: { [StatType.AGILITY]: 35, [StatType.STRENGTH]: 23, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.455 },
        3: { [StatType.AGILITY]: 38, [StatType.STRENGTH]: 25, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.497 },
        4: { [StatType.AGILITY]: 41, [StatType.STRENGTH]: 27, [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 0.538 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Scope MOD (Kit) ─────────────────────────────────────────────
export class MiSecurityScopeMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Toolkit (Kit) ───────────────────────────────────────────────
export class MiSecurityToolkit extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: {
        1: { [StatType.INTELLECT]: 32, [StatType.AGILITY]: 21, [StatType.CRITICAL_RATE]: 0.103 },
        2: { [StatType.INTELLECT]: 35, [StatType.AGILITY]: 23, [StatType.CRITICAL_RATE]: 0.114 },
        3: { [StatType.INTELLECT]: 38, [StatType.AGILITY]: 25, [StatType.CRITICAL_RATE]: 0.124 },
        4: { [StatType.INTELLECT]: 41, [StatType.AGILITY]: 27, [StatType.CRITICAL_RATE]: 0.135 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Toolkit MOD (Kit) ───────────────────────────────────────────
export class MiSecurityToolkitMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Visor (Kit) ─────────────────────────────────────────────────
export class MiSecurityVisor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── MI Security Visor MOD (Kit) ─────────────────────────────────────────────
export class MiSecurityVisorMod extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.MI_SECURITY,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}
