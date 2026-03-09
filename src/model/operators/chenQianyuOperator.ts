import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  SoaringBreak,
  AscendingStrike,
  SoarToTheStars,
  BladeGale,
} from "../combat-skills/chenQianyuSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 20,
    [StatType.AGILITY]: 24,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 16,
  },
  20: {
    [StatType.ATTACK]: 107,
    [StatType.STRENGTH]: 44,
    [StatType.AGILITY]: 54,
    [StatType.INTELLECT]: 32,
    [StatType.WILL]: 30,
  },
  40: {
    [StatType.ATTACK]: 163,
    [StatType.STRENGTH]: 70,
    [StatType.AGILITY]: 87,
    [StatType.INTELLECT]: 50,
    [StatType.WILL]: 46,
  },
  60: {
    [StatType.ATTACK]: 216,
    [StatType.STRENGTH]: 94,
    [StatType.AGILITY]: 118,
    [StatType.INTELLECT]: 66,
    [StatType.WILL]: 60,
  },
  80: {
    [StatType.ATTACK]: 269,
    [StatType.STRENGTH]: 118,
    [StatType.AGILITY]: 149,
    [StatType.INTELLECT]: 82,
    [StatType.WILL]: 75,
  },
  90: {
    [StatType.ATTACK]: 295,
    [StatType.STRENGTH]: 130,
    [StatType.AGILITY]: 165,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 82,
  },
};

export class ChenQianyuOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.GUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;

  readonly basicAttack: SoaringBreak;
  readonly battleSkill: AscendingStrike;
  readonly comboSkill: SoarToTheStars;
  readonly ultimate: BladeGale;

  constructor(params: {
    level: number;
    potential?: Potential;
    talentOneLevel?: number;
    talentTwoLevel?: number;
    basicAttackLevel?: SkillLevel;
    battleSkillLevel?: SkillLevel;
    comboSkillLevel?: SkillLevel;
    ultimateLevel?: SkillLevel;
  }) {
    super({
      name: "Chen Qianyu",
      element: ChenQianyuOperator.ELEMENT,
      operatorClass: ChenQianyuOperator.OPERATOR_CLASS,
      weaponTypes: ChenQianyuOperator.WEAPON_TYPES,
      operatorRarity: ChenQianyuOperator.OPERATOR_RARITY,
      mainAttributeType: ChenQianyuOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: ChenQianyuOperator.SECONDARY_ATTRIBUTE_TYPE,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new SoaringBreak({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new AscendingStrike({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new SoarToTheStars({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new BladeGale({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
