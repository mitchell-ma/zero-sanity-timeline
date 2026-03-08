import { WeaponType } from "../enums";
import { AttackBoostL, IntellectBoostL } from "../weapon-skills/weaponSkills";
import { TwilightBlazingWail } from "../weapon-skills/namedWeaponSkills";
import { Weapon, WeaponRarity } from "./weapon";

const RARITY: WeaponRarity = 6;

const BASE_ATTACK_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 52,
  20: 149,
  40: 252,
  60: 355,
  80: 458,
  90: 510,
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
      baseAttackByLevel: BASE_ATTACK_BY_LEVEL,
      weaponSkillOne: skillOne,
      weaponSkillTwo: skillTwo,
      weaponSkillThree: skillThree,
    });

    this.weaponSkillOne = skillOne;
    this.weaponSkillTwo = skillTwo;
    this.weaponSkillThree = skillThree;
  }
}
