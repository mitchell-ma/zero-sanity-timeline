import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  XaihiBasicAttack,
  DistributedDos,
  StressTesting,
  StackOverflow,
} from "../combat-skills/xaihiSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 24,
    [StatType.WILL]: 19,
  },
  20: {
    [StatType.ATTACK]: 106,
    [StatType.STRENGTH]: 31,
    [StatType.AGILITY]: 30,
    [StatType.INTELLECT]: 55,
    [StatType.WILL]: 41,
  },
  40: {
    [StatType.ATTACK]: 161,
    [StatType.STRENGTH]: 47,
    [StatType.AGILITY]: 46,
    [StatType.INTELLECT]: 89,
    [StatType.WILL]: 64,
  },
  60: {
    [StatType.ATTACK]: 213,
    [StatType.STRENGTH]: 62,
    [StatType.AGILITY]: 60,
    [StatType.INTELLECT]: 120,
    [StatType.WILL]: 85,
  },
  80: {
    [StatType.ATTACK]: 266,
    [StatType.STRENGTH]: 77,
    [StatType.AGILITY]: 75,
    [StatType.INTELLECT]: 152,
    [StatType.WILL]: 107,
  },
  90: {
    [StatType.ATTACK]: 292,
    [StatType.STRENGTH]: 85,
    [StatType.AGILITY]: 82,
    [StatType.INTELLECT]: 168,
    [StatType.WILL]: 118,
  },
};

export class XaihiOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 1;

  readonly basicAttack: XaihiBasicAttack;
  readonly battleSkill: DistributedDos;
  readonly comboSkill: StressTesting;
  readonly ultimate: StackOverflow;

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
      name: "Xaihi",
      element: XaihiOperator.ELEMENT,
      operatorClass: XaihiOperator.OPERATOR_CLASS,
      weaponTypes: XaihiOperator.WEAPON_TYPES,
      operatorRarity: XaihiOperator.OPERATOR_RARITY,
      mainAttributeType: XaihiOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: XaihiOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: XaihiOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: XaihiOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new XaihiBasicAttack({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new DistributedDos({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new StressTesting({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new StackOverflow({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
