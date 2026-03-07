import { WeaponType, WeaponSkill } from '../enums';

/** Valid weapon rarity values. */
export type WeaponRarity = 3 | 4 | 5 | 6;

/** Weapon skill upgrade level. */
export type WeaponSkillLevel = number;

/** Rarity 3 weapons have two skills; rarity 4–6 weapons have three. */
export type WeaponSkillCount<R extends WeaponRarity> = R extends 3 ? 2 : 3;

export abstract class Weapon {
  readonly weaponType: WeaponType;
  readonly weaponRarity: WeaponRarity;

  level: number;

  weaponSkillOne:   WeaponSkill;
  weaponSkillTwo:   WeaponSkill;
  weaponSkillThree: WeaponSkill | undefined;

  weaponSkillOneLevel:   WeaponSkillLevel;
  weaponSkillTwoLevel:   WeaponSkillLevel;
  weaponSkillThreeLevel: WeaponSkillLevel | undefined;

  constructor(params: {
    weaponType: WeaponType;
    weaponRarity: WeaponRarity;
    level: number;
    weaponSkillOne: WeaponSkill;
    weaponSkillTwo: WeaponSkill;
    weaponSkillThree?: WeaponSkill;
    weaponSkillOneLevel: WeaponSkillLevel;
    weaponSkillTwoLevel: WeaponSkillLevel;
    weaponSkillThreeLevel?: WeaponSkillLevel;
  }) {
    const {
      weaponType,
      weaponRarity,
      level,
      weaponSkillOne,
      weaponSkillTwo,
      weaponSkillThree,
      weaponSkillOneLevel,
      weaponSkillTwoLevel,
      weaponSkillThreeLevel,
    } = params;

    if (level < 1 || !Number.isInteger(level)) {
      throw new RangeError(`Weapon level must be a positive integer, got ${level}`);
    }

    const hasThirdSkill = weaponRarity >= 4;

    if (hasThirdSkill && weaponSkillThree === undefined) {
      throw new Error(
        `Rarity ${weaponRarity} weapon requires weaponSkillThree`,
      );
    }
    if (!hasThirdSkill && weaponSkillThree !== undefined) {
      throw new Error(
        `Rarity 3 weapons do not have a third skill`,
      );
    }
    if (hasThirdSkill && weaponSkillThreeLevel === undefined) {
      throw new Error(
        `Rarity ${weaponRarity} weapon requires weaponSkillThreeLevel`,
      );
    }

    this.weaponType           = weaponType;
    this.weaponRarity         = weaponRarity;
    this.level                = level;
    this.weaponSkillOne       = weaponSkillOne;
    this.weaponSkillTwo       = weaponSkillTwo;
    this.weaponSkillThree     = weaponSkillThree;
    this.weaponSkillOneLevel   = weaponSkillOneLevel;
    this.weaponSkillTwoLevel   = weaponSkillTwoLevel;
    this.weaponSkillThreeLevel = weaponSkillThreeLevel;
  }

  /** Whether this weapon has a third skill slot (rarity 4–6). */
  get hasThirdSkill(): boolean {
    return this.weaponRarity >= 4;
  }
}
