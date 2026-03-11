import { WeaponType } from "../../consts/enums";
import { AttackBoostL, IntellectBoostL } from "../weapon-skills/weaponSkills";
import { TwilightBlazingWail } from "../weapon-skills/namedWeaponSkills";
import { WeaponRarity } from "../../consts/types";
import { Weapon, WeaponBaseAttack } from "./weapon";

const RARITY: WeaponRarity = 6;

const BASE_ATTACK: WeaponBaseAttack = {
  lv1: 52,
  lv90: 510,
};

export class ForgebornScathe extends Weapon {
  static readonly WEAPON_TYPE = WeaponType.SWORD;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne: IntellectBoostL;
  readonly weaponSkillTwo: AttackBoostL;
  readonly weaponSkillThree: TwilightBlazingWail;

  constructor(params: {
    level: number;
    skillOneLevel: number;
    skillTwoLevel: number;
    skillThreeLevel: number;
  }) {
    const skillOne = new IntellectBoostL(params.skillOneLevel);
    const skillTwo = new AttackBoostL(params.skillTwoLevel);
    const skillThree = new TwilightBlazingWail(params.skillThreeLevel);

    super({
      weaponType: ForgebornScathe.WEAPON_TYPE,
      weaponRarity: ForgebornScathe.WEAPON_RARITY,
      level: params.level,
      baseAttack: BASE_ATTACK,
      weaponSkillOne: skillOne,
      weaponSkillTwo: skillTwo,
      weaponSkillThree: skillThree,
    });

    this.weaponSkillOne = skillOne;
    this.weaponSkillTwo = skillTwo;
    this.weaponSkillThree = skillThree;
  }
}
