import { WeaponType } from "../../consts/enums";
import { WeaponRarity } from "../../consts/types";
import { lookupByLevel } from "../../utils/lookupByLevel";
import { WeaponSkill } from "../weapon-skills/weaponSkill";

export abstract class Weapon {
  readonly weaponType: WeaponType;
  readonly weaponRarity: WeaponRarity;

  level: number;

  weaponSkillOne: WeaponSkill;
  weaponSkillTwo: WeaponSkill;
  weaponSkillThree: WeaponSkill | undefined;

  protected readonly baseAttackByLevel: Readonly<Record<number, number>>;

  constructor(params: {
    weaponType: WeaponType;
    weaponRarity: WeaponRarity;
    level: number;
    baseAttackByLevel: Readonly<Record<number, number>>;
    weaponSkillOne: WeaponSkill;
    weaponSkillTwo: WeaponSkill;
    weaponSkillThree?: WeaponSkill;
  }) {
    const {
      weaponType,
      weaponRarity,
      level,
      baseAttackByLevel,
      weaponSkillOne,
      weaponSkillTwo,
      weaponSkillThree,
    } = params;

    if (level < 1 || !Number.isInteger(level)) {
      throw new RangeError(
        `Weapon level must be a positive integer, got ${level}`,
      );
    }

    const hasThirdSkill = weaponRarity >= 4;

    if (hasThirdSkill && weaponSkillThree === undefined) {
      throw new Error(
        `Rarity ${weaponRarity} weapon requires weaponSkillThree`,
      );
    }
    if (!hasThirdSkill && weaponSkillThree !== undefined) {
      throw new Error(`Rarity 3 weapons do not have a third skill`);
    }

    this.weaponType = weaponType;
    this.weaponRarity = weaponRarity;
    this.level = level;
    this.baseAttackByLevel = baseAttackByLevel;
    this.weaponSkillOne = weaponSkillOne;
    this.weaponSkillTwo = weaponSkillTwo;
    this.weaponSkillThree = weaponSkillThree;
  }

  /** Whether this weapon has a third skill slot (rarity 4–6). */
  get hasThirdSkill(): boolean {
    return this.weaponRarity >= 4;
  }

  getBaseAttack(): number {
    return lookupByLevel(this.baseAttackByLevel, this.level);
  }
}
