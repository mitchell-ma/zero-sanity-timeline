import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  ExchangeCurrent,
  SpecifiedResearchSubject,
  EmpTestSite,
  OverclockedMoment,
} from "../combat-skills/antalSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseOperator } from "./baseOperator";

const RARITY: OperatorRarity = 4;

/** Antal's base attribute scores by level (Elite 0–Max). */
const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 15,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 15,
    [StatType.WILL]: 9,
  },
  20: {
    [StatType.ATTACK]: 87,
    [StatType.STRENGTH]: 40,
    [StatType.AGILITY]: 25,
    [StatType.INTELLECT]: 47,
    [StatType.WILL]: 25,
  },
  40: {
    [StatType.ATTACK]: 147,
    [StatType.STRENGTH]: 65,
    [StatType.AGILITY]: 43,
    [StatType.INTELLECT]: 81,
    [StatType.WILL]: 41,
  },
  60: {
    [StatType.ATTACK]: 207,
    [StatType.STRENGTH]: 91,
    [StatType.AGILITY]: 60,
    [StatType.INTELLECT]: 114,
    [StatType.WILL]: 58,
  },
  80: {
    [StatType.ATTACK]: 267,
    [StatType.STRENGTH]: 116,
    [StatType.AGILITY]: 78,
    [StatType.INTELLECT]: 148,
    [StatType.WILL]: 74,
  },
  90: {
    [StatType.ATTACK]: 297,
    [StatType.STRENGTH]: 129,
    [StatType.AGILITY]: 86,
    [StatType.INTELLECT]: 165,
    [StatType.WILL]: 82,
  },
};

export class AntalOperator extends BaseOperator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;

  readonly basicAttack: ExchangeCurrent;
  readonly battleSkill: SpecifiedResearchSubject;
  readonly comboSkill: EmpTestSite;
  readonly ultimate: OverclockedMoment;

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
      name: "Antal",
      element: AntalOperator.ELEMENT,
      operatorClass: AntalOperator.OPERATOR_CLASS,
      weaponTypes: AntalOperator.WEAPON_TYPES,
      operatorRarity: AntalOperator.OPERATOR_RARITY,
      mainAttributeType: AntalOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AntalOperator.SECONDARY_ATTRIBUTE_TYPE,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new ExchangeCurrent({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new SpecifiedResearchSubject({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new EmpTestSite({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new OverclockedMoment({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
