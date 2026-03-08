import { WeaponType } from "../enums";
import { ArtsBoostL, MainAttributeBoostL } from "../weapon-skills/weaponSkills";
import { InflictionViciousPurge } from "../weapon-skills/namedWeaponSkills";
import { Weapon, WeaponRarity } from "./weapon";

const RARITY: WeaponRarity = 6;

const BASE_ATTACK_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 50,
  20: 144,
  40: 243,
  60: 342,
  80: 441,
  90: 490,
};

export class Clannibal extends Weapon {
  static readonly WEAPON_TYPE = WeaponType.HANDCANNON;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne: MainAttributeBoostL;
  readonly weaponSkillTwo: ArtsBoostL;
  readonly weaponSkillThree: InflictionViciousPurge;

  constructor(params: {
    level: number;
    skillOneLevel: number;
    skillTwoLevel: number;
    skillThreeLevel: number;
  }) {
    const skillOne = new MainAttributeBoostL(params.skillOneLevel);
    const skillTwo = new ArtsBoostL(params.skillTwoLevel);
    const skillThree = new InflictionViciousPurge(params.skillThreeLevel);

    super({
      weaponType: Clannibal.WEAPON_TYPE,
      weaponRarity: Clannibal.WEAPON_RARITY,
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
