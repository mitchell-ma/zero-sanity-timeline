import { WeaponSkillType } from "../../consts/enums";
import { WeaponSkill } from "./weaponSkill";

export class PlaceholderSkill extends WeaponSkill {
  constructor(level: number = 1) {
    super({ weaponSkillType: WeaponSkillType.ATTACK_BOOST_S, level });
  }
  getValue(): number { return 0; }
}
