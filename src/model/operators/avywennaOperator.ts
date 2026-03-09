import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  ThunderlanceBlitz,
  ThunderlanceInterdiction,
  ThunderlanceStrike,
  ThunderlanceFinalShock,
} from "../combat-skills/avywennaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 24,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 19,
  },
  20: {
    [StatType.ATTACK]: 107,
    [StatType.STRENGTH]: 32,
    [StatType.AGILITY]: 54,
    [StatType.INTELLECT]: 32,
    [StatType.WILL]: 41,
  },
  40: {
    [StatType.ATTACK]: 163,
    [StatType.STRENGTH]: 49,
    [StatType.AGILITY]: 87,
    [StatType.INTELLECT]: 50,
    [StatType.WILL]: 64,
  },
  60: {
    [StatType.ATTACK]: 216,
    [StatType.STRENGTH]: 64,
    [StatType.AGILITY]: 118,
    [StatType.INTELLECT]: 66,
    [StatType.WILL]: 85,
  },
  80: {
    [StatType.ATTACK]: 269,
    [StatType.STRENGTH]: 80,
    [StatType.AGILITY]: 149,
    [StatType.INTELLECT]: 82,
    [StatType.WILL]: 107,
  },
  90: {
    [StatType.ATTACK]: 295,
    [StatType.STRENGTH]: 88,
    [StatType.AGILITY]: 165,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 118,
  },
};

export class AvywennaOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.POLEARM];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ThunderlanceBlitz;
  readonly battleSkill: ThunderlanceInterdiction;
  readonly comboSkill: ThunderlanceStrike;
  readonly ultimate: ThunderlanceFinalShock;

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
      name: "Avywenna",
      element: AvywennaOperator.ELEMENT,
      operatorClass: AvywennaOperator.OPERATOR_CLASS,
      weaponTypes: AvywennaOperator.WEAPON_TYPES,
      operatorRarity: AvywennaOperator.OPERATOR_RARITY,
      mainAttributeType: AvywennaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AvywennaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AvywennaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AvywennaOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new ThunderlanceBlitz({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ThunderlanceInterdiction({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new ThunderlanceStrike({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ThunderlanceFinalShock({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
