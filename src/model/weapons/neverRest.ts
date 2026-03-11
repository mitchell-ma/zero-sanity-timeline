import { WeaponType } from "../../consts/enums";
import { AttackBoostL } from "../weapon-skills/weaponSkills";
import { FlowReincarnation } from "../weapon-skills/namedWeaponSkills";
import { WillBoostL } from "../weapon-skills/weaponSkills";
import { WeaponRarity } from "../../consts/types";
import { Weapon, WeaponBaseAttack } from "./weapon";

const RARITY: WeaponRarity = 6;

const BASE_ATTACK: WeaponBaseAttack = {
  lv1: 51,
  lv90: 500,
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
