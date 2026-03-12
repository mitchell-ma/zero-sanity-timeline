import { WeaponType } from "../../consts/enums";
import { AgilityBoostM } from "../weapon-skills/weaponSkills";
import { AttackBoostM } from "../weapon-skills/weaponSkills";
import { FlowUnbridledEdge } from "../weapon-skills/namedWeaponSkills";
import { WeaponRarity } from "../../consts/types";
import { Weapon, WeaponBaseAttack } from "./weapon";

const RARITY: WeaponRarity = 5;

const BASE_ATTACK: WeaponBaseAttack = {
  lv1: 42,
  lv90: 411,
};

export class EdgeOfLightness extends Weapon {
  static readonly WEAPON_TYPE = WeaponType.SWORD;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne: AgilityBoostM;
  readonly weaponSkillTwo: AttackBoostM;
  readonly weaponSkillThree: FlowUnbridledEdge;

  constructor(params: {
    level: number;
    skillOneLevel: number;
    skillTwoLevel: number;
    skillThreeLevel: number;
  }) {
    const skillOne = new AgilityBoostM(params.skillOneLevel);
    const skillTwo = new AttackBoostM(params.skillTwoLevel);
    const skillThree = new FlowUnbridledEdge(params.skillThreeLevel);

    super({
      weaponType: EdgeOfLightness.WEAPON_TYPE,
      weaponRarity: EdgeOfLightness.WEAPON_RARITY,
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
