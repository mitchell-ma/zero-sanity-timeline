import { WeaponType } from "../../consts/enums";
import { IntellectBoostL, TreatmentEfficiencyBoostL } from '../weapon-skills/weaponSkills';
import { InflictionTidalMurmurs } from '../weapon-skills/namedWeaponSkills';
import { WeaponRarity } from "../../consts/types";
import { Weapon, WeaponBaseAttack } from "./weapon";

const RARITY: WeaponRarity = 6;

const BASE_ATTACK: WeaponBaseAttack = {
  lv1: 50,
  lv90: 495,
};

export class DreamsOfTheStarryBeach extends Weapon {
  static readonly WEAPON_TYPE   = WeaponType.ARTS_UNIT;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne:   IntellectBoostL;
  readonly weaponSkillTwo:   TreatmentEfficiencyBoostL;
  readonly weaponSkillThree: InflictionTidalMurmurs;

  constructor(params: {
    level:           number;
    skillOneLevel:   number;
    skillTwoLevel:   number;
    skillThreeLevel: number;
  }) {
    const skillOne   = new IntellectBoostL(params.skillOneLevel);
    const skillTwo   = new TreatmentEfficiencyBoostL(params.skillTwoLevel);
    const skillThree = new InflictionTidalMurmurs(params.skillThreeLevel);

    super({
      weaponType:      DreamsOfTheStarryBeach.WEAPON_TYPE,
      weaponRarity:    DreamsOfTheStarryBeach.WEAPON_RARITY,
      level:           params.level,
      baseAttack: BASE_ATTACK,
      weaponSkillOne:   skillOne,
      weaponSkillTwo:   skillTwo,
      weaponSkillThree: skillThree,
    });

    this.weaponSkillOne   = skillOne;
    this.weaponSkillTwo   = skillTwo;
    this.weaponSkillThree = skillThree;
  }
}
