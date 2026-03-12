import { WeaponType } from "../../consts/enums";
import { MainAttributeBoostS } from "../weapon-skills/weaponSkills";
import { AssaultArmamentPrep } from "../weapon-skills/namedWeaponSkills";
import { WeaponRarity } from "../../consts/types";
import { Weapon, WeaponBaseAttack } from "./weapon";

const RARITY: WeaponRarity = 3;

const BASE_ATTACK: WeaponBaseAttack = {
  lv1: 29,
  lv90: 283,
};

export class Tarr11 extends Weapon {
  static readonly WEAPON_TYPE = WeaponType.SWORD;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne: MainAttributeBoostS;
  readonly weaponSkillTwo: AssaultArmamentPrep;

  constructor(params: {
    level: number;
    skillOneLevel: number;
    skillTwoLevel: number;
  }) {
    const skillOne = new MainAttributeBoostS(params.skillOneLevel);
    const skillTwo = new AssaultArmamentPrep(params.skillTwoLevel);

    super({
      weaponType: Tarr11.WEAPON_TYPE,
      weaponRarity: Tarr11.WEAPON_RARITY,
      level: params.level,
      baseAttack: BASE_ATTACK,
      weaponSkillOne: skillOne,
      weaponSkillTwo: skillTwo,
    });

    this.weaponSkillOne = skillOne;
    this.weaponSkillTwo = skillTwo;
  }
}
