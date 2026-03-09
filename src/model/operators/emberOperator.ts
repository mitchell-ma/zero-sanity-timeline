import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  SwordArtOfAssault,
  ForwardMarch,
  FrontlineSupport,
  ReIgnitedOath,
} from "../combat-skills/emberSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 20,
  },
  20: {
    [StatType.ATTACK]: 114,
    [StatType.STRENGTH]: 58,
    [StatType.AGILITY]: 31,
    [StatType.INTELLECT]: 32,
    [StatType.WILL]: 44,
  },
  40: {
    [StatType.ATTACK]: 175,
    [StatType.STRENGTH]: 94,
    [StatType.AGILITY]: 47,
    [StatType.INTELLECT]: 50,
    [StatType.WILL]: 70,
  },
  60: {
    [StatType.ATTACK]: 233,
    [StatType.STRENGTH]: 127,
    [StatType.AGILITY]: 62,
    [StatType.INTELLECT]: 66,
    [StatType.WILL]: 94,
  },
  80: {
    [StatType.ATTACK]: 291,
    [StatType.STRENGTH]: 161,
    [StatType.AGILITY]: 77,
    [StatType.INTELLECT]: 82,
    [StatType.WILL]: 118,
  },
  90: {
    [StatType.ATTACK]: 320,
    [StatType.STRENGTH]: 178,
    [StatType.AGILITY]: 85,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 130,
  },
};

export class EmberOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.DEFENDER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SwordArtOfAssault;
  readonly battleSkill: ForwardMarch;
  readonly comboSkill: FrontlineSupport;
  readonly ultimate: ReIgnitedOath;

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
      name: "Ember",
      element: EmberOperator.ELEMENT,
      operatorClass: EmberOperator.OPERATOR_CLASS,
      weaponTypes: EmberOperator.WEAPON_TYPES,
      operatorRarity: EmberOperator.OPERATOR_RARITY,
      mainAttributeType: EmberOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: EmberOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: EmberOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: EmberOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new SwordArtOfAssault({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ForwardMarch({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FrontlineSupport({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ReIgnitedOath({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
