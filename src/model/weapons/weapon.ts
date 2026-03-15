import { WeaponType } from "../../consts/enums";
import { WeaponRarity } from "../../consts/types";
import { WeaponSkill } from "../weapon-skills/weaponSkill";

export interface WeaponBaseAttack {
  lv1: number;
  lv90: number;
  attackByLevel?: Record<number, number>;
}

export function interpolateAttack(base: WeaponBaseAttack, level: number): number {
  if (base.attackByLevel && level in base.attackByLevel) {
    return base.attackByLevel[level];
  }
  const t = (level - 1) / 89;
  return base.lv1 + (base.lv90 - base.lv1) * t;
}

export abstract class Weapon {
  readonly weaponType: WeaponType;
  readonly weaponRarity: WeaponRarity;

  level: number;

  weaponSkillOne: WeaponSkill;
  weaponSkillTwo: WeaponSkill;
  weaponSkillThree: WeaponSkill | undefined;

  readonly baseAttack: WeaponBaseAttack;

  constructor(params: {
    weaponType: WeaponType;
    weaponRarity: WeaponRarity;
    level: number;
    baseAttack: WeaponBaseAttack;
    weaponSkillOne: WeaponSkill;
    weaponSkillTwo: WeaponSkill;
    weaponSkillThree?: WeaponSkill;
  }) {
    const {
      weaponType,
      weaponRarity,
      level,
      baseAttack,
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
    this.baseAttack = baseAttack;
    this.weaponSkillOne = weaponSkillOne;
    this.weaponSkillTwo = weaponSkillTwo;
    this.weaponSkillThree = weaponSkillThree;
  }

  /** Whether this weapon has a third skill slot (rarity 4–6). */
  get hasThirdSkill(): boolean {
    return this.weaponRarity >= 4;
  }

  getBaseAttack(): number {
    return interpolateAttack(this.baseAttack, this.level);
  }
}
