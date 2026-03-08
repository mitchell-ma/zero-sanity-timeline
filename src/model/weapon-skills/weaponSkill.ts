import { WeaponSkillType } from "../../consts/enums";

export abstract class WeaponSkill {
  readonly weaponSkillType: WeaponSkillType;

  level: number;

  constructor(params: { weaponSkillType: WeaponSkillType; level: number }) {
    this.weaponSkillType = params.weaponSkillType;
    this.level = params.level;
  }

  abstract getValue(): number;
}
