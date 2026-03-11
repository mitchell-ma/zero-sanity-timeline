import { WeaponType } from "../../consts/enums";
import { AttackBoostM, IntellectBoostM } from '../weapon-skills/weaponSkills';
import { TwilightLustrousPyre } from '../weapon-skills/namedWeaponSkills';
import { WeaponRarity } from "../../consts/types";
import { Weapon, WeaponBaseAttack } from "./weapon";

const RARITY: WeaponRarity = 5;

const BASE_ATTACK: WeaponBaseAttack = {
  lv1: 42,
  lv90: 411,
};

export class StanzaOfMemorials extends Weapon {
  static readonly WEAPON_TYPE   = WeaponType.ARTS_UNIT;
  static readonly WEAPON_RARITY = RARITY;

  readonly weaponSkillOne:   IntellectBoostM;
  readonly weaponSkillTwo:   AttackBoostM;
  readonly weaponSkillThree: TwilightLustrousPyre;

  constructor(params: {
    level:           number;
    skillOneLevel:   number;
    skillTwoLevel:   number;
    skillThreeLevel: number;
  }) {
    const skillOne   = new IntellectBoostM(params.skillOneLevel);
    const skillTwo   = new AttackBoostM(params.skillTwoLevel);
    const skillThree = new TwilightLustrousPyre(params.skillThreeLevel);

    super({
      weaponType:      StanzaOfMemorials.WEAPON_TYPE,
      weaponRarity:    StanzaOfMemorials.WEAPON_RARITY,
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
