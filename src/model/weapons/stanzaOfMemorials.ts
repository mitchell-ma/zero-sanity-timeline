import { WeaponType } from '../enums';
import { AttackBoostM, IntellectBoostM } from '../weapon-skills/weaponSkills';
import { TwilightLustrousPyre } from '../weapon-skills/namedWeaponSkills';
import { Weapon, WeaponRarity } from './weapon';

const RARITY: WeaponRarity = 5;

const BASE_ATTACK_BY_LEVEL: Readonly<Record<number, number>> = {
   1:  42,
  20: 120,
  40: 203,
  60: 286,
  80: 369,
  90: 411,
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
      baseAttackByLevel: BASE_ATTACK_BY_LEVEL,
      weaponSkillOne:   skillOne,
      weaponSkillTwo:   skillTwo,
      weaponSkillThree: skillThree,
    });

    this.weaponSkillOne   = skillOne;
    this.weaponSkillTwo   = skillTwo;
    this.weaponSkillThree = skillThree;
  }
}
