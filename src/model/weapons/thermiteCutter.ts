import { WeaponType } from "../../consts/enums";
import { AttackBoostL, WillBoostL } from "../weapon-skills/weaponSkills";
import { FlowThermalRelease } from "../weapon-skills/namedWeaponSkills";
import { WeaponRarity } from "../../consts/types";
import { Weapon } from "./weapon";

const RARITY: WeaponRarity = 6;

const BASE_ATTACK_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 50,
  20: 144,
  40: 243,
  60: 342,
  80: 441,
  90: 490,
};

export class ThermiteCutter extends Weapon {
  static readonly WEAPON_TYPE = WeaponType.SWORD;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne: WillBoostL;
  readonly weaponSkillTwo: AttackBoostL;
  readonly weaponSkillThree: FlowThermalRelease;

  constructor(params: {
    level: number;
    skillOneLevel: number;
    skillTwoLevel: number;
    skillThreeLevel: number;
  }) {
    const skillOne = new WillBoostL(params.skillOneLevel);
    const skillTwo = new AttackBoostL(params.skillTwoLevel);
    const skillThree = new FlowThermalRelease(params.skillThreeLevel);

    super({
      weaponType: ThermiteCutter.WEAPON_TYPE,
      weaponRarity: ThermiteCutter.WEAPON_RARITY,
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
