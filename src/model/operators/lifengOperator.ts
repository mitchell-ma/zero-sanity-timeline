import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  Ruination,
  TurbidAvatar,
  AspectOfWrath,
  HeartOfTheUnmoving,
} from "../combat-skills/lifengSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 17,
  },
  20: {
    [StatType.ATTACK]: 115,
    [StatType.STRENGTH]: 59,
    [StatType.AGILITY]: 35,
    [StatType.INTELLECT]: 34,
    [StatType.WILL]: 32,
  },
  40: {
    [StatType.ATTACK]: 176,
    [StatType.STRENGTH]: 95,
    [StatType.AGILITY]: 55,
    [StatType.INTELLECT]: 52,
    [StatType.WILL]: 50,
  },
  60: {
    [StatType.ATTACK]: 234,
    [StatType.STRENGTH]: 129,
    [StatType.AGILITY]: 73,
    [StatType.INTELLECT]: 69,
    [StatType.WILL]: 66,
  },
  80: {
    [StatType.ATTACK]: 293,
    [StatType.STRENGTH]: 163,
    [StatType.AGILITY]: 91,
    [StatType.INTELLECT]: 86,
    [StatType.WILL]: 82,
  },
  90: {
    [StatType.ATTACK]: 322,
    [StatType.STRENGTH]: 180,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 95,
    [StatType.WILL]: 90,
  },
};

export class LifengOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.GUARD;
  static readonly WEAPON_TYPES = [WeaponType.POLEARM];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: Ruination;
  readonly battleSkill: TurbidAvatar;
  readonly comboSkill: AspectOfWrath;
  readonly ultimate: HeartOfTheUnmoving;

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
      name: "Lifeng",
      element: LifengOperator.ELEMENT,
      operatorClass: LifengOperator.OPERATOR_CLASS,
      weaponTypes: LifengOperator.WEAPON_TYPES,
      operatorRarity: LifengOperator.OPERATOR_RARITY,
      mainAttributeType: LifengOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: LifengOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: LifengOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: LifengOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new Ruination({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new TurbidAvatar({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new AspectOfWrath({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new HeartOfTheUnmoving({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
