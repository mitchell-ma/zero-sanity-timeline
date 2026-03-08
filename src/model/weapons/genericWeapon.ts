import { WeaponType } from "../../consts/enums";
import { WeaponRarity } from "../../consts/types";
import { PlaceholderSkill } from "../weapon-skills/placeholderSkill";
import { Weapon } from "./weapon";

/**
 * Generic weapon stub for registry entries that don't have full stat tables yet.
 */
export class GenericWeapon extends Weapon {
  constructor(params: {
    weaponType: WeaponType;
    weaponRarity?: WeaponRarity;
    level?: number;
  }) {
    const rarity = params.weaponRarity ?? 6;
    super({
      weaponType: params.weaponType,
      weaponRarity: rarity,
      level: params.level ?? 90,
      baseAttackByLevel: { 1: 100, 90: 1000 },
      weaponSkillOne: new PlaceholderSkill(),
      weaponSkillTwo: new PlaceholderSkill(),
      ...(rarity >= 4 ? { weaponSkillThree: new PlaceholderSkill() } : {}),
    });
  }
}
