import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Type 50 Yinglung Heavy Armor (Armor) ────────────────────────────────────
export class Type50YinglungHeavyArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 87, [StatType.WILL]: 58, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.115 },
        2: { [StatType.STRENGTH]: 95, [StatType.WILL]: 63, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.127 },
        3: { [StatType.STRENGTH]: 104, [StatType.WILL]: 69, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.138 },
        4: { [StatType.STRENGTH]: 113, [StatType.WILL]: 75, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.149 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Type 50 Yinglung Light Armor (Armor) ────────────────────────────────────
export class Type50YinglungLightArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: {
        1: { [StatType.WILL]: 87, [StatType.STRENGTH]: 58, [StatType.SKILL_DAMAGE_BONUS]: 0.138 },
        2: { [StatType.WILL]: 95, [StatType.STRENGTH]: 63, [StatType.SKILL_DAMAGE_BONUS]: 0.152 },
        3: { [StatType.WILL]: 104, [StatType.STRENGTH]: 69, [StatType.SKILL_DAMAGE_BONUS]: 0.166 },
        4: { [StatType.WILL]: 113, [StatType.STRENGTH]: 75, [StatType.SKILL_DAMAGE_BONUS]: 0.179 },
      },
    });
  }
  static readonly DEFENSE = 56;
}

// ── Type 50 Yinglung Gloves (Gloves) ────────────────────────────────────────
export class Type50YinglungGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: {
        1: { [StatType.AGILITY]: 65, [StatType.INTELLECT]: 43, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.345 },
        2: { [StatType.AGILITY]: 71, [StatType.INTELLECT]: 47, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.380 },
        3: { [StatType.AGILITY]: 78, [StatType.INTELLECT]: 51, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.414 },
        4: { [StatType.AGILITY]: 84, [StatType.INTELLECT]: 55, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.449 },
      },
    });
  }
  static readonly DEFENSE = 42;
}

// ── Type 50 Yinglung Gloves T1 (Gloves) ────────────────────────────────────
export class Type50YinglungGlovesT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 42;
}

// ── Type 50 Yinglung Knife (Kit) ────────────────────────────────────────────
export class Type50YinglungKnife extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: {
        1: { [StatType.WILL]: 32, [StatType.AGILITY]: 21, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.414 },
        2: { [StatType.WILL]: 35, [StatType.AGILITY]: 23, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.455 },
        3: { [StatType.WILL]: 38, [StatType.AGILITY]: 25, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.497 },
        4: { [StatType.WILL]: 41, [StatType.AGILITY]: 27, [StatType.COMBO_SKILL_DAMAGE_BONUS]: 0.538 },
      },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Type 50 Yinglung Knife T1 (Kit) ────────────────────────────────────────
export class Type50YinglungKnifeT1 extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
    });
  }
  static readonly DEFENSE = 21;
}

// ── Type 50 Yinglung Radar (Kit) ────────────────────────────────────────────
export class Type50YinglungRadar extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 32, [StatType.WILL]: 21, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.230 },
        2: { [StatType.STRENGTH]: 35, [StatType.WILL]: 23, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.253 },
        3: { [StatType.STRENGTH]: 38, [StatType.WILL]: 25, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.276 },
        4: { [StatType.STRENGTH]: 41, [StatType.WILL]: 27, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.299 },
      },
    });
  }
  static readonly DEFENSE = 21;
}
