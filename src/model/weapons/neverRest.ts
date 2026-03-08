import { WeaponType } from "../enums";
import { AttackBoostL } from "../weapon-skills/weaponSkills";
import { FlowReincarnation } from "../weapon-skills/namedWeaponSkills";
import { WillBoostL } from "../weapon-skills/weaponSkills";
import { Weapon, WeaponRarity } from "./weapon";

const RARITY: WeaponRarity = 6;

/** Never Rest base attack values at key levels. */
const BASE_ATTACK_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 51,
  20: 146,
  40: 247,
  60: 348,
  80: 449,
  90: 500,
};

export class NeverRest extends Weapon {
  static readonly WEAPON_TYPE = WeaponType.SWORD;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne: WillBoostL;
  readonly weaponSkillTwo: AttackBoostL;
  readonly weaponSkillThree: FlowReincarnation;

  constructor(params: {
    level: number;
    skillOneLevel: number;
    skillTwoLevel: number;
    skillThreeLevel: number;
  }) {
    const skillOne = new WillBoostL(params.skillOneLevel);
    const skillTwo = new AttackBoostL(params.skillTwoLevel);
    const skillThree = new FlowReincarnation(params.skillThreeLevel);

    super({
      weaponType: NeverRest.WEAPON_TYPE,
      weaponRarity: NeverRest.WEAPON_RARITY,
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
