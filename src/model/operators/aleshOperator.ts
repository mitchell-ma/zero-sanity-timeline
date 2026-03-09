import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  RodCasting,
  UnconventionalLure,
  AugerAngling,
  OneMonsterCatch,
} from "../combat-skills/aleshSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 23,
    [StatType.AGILITY]: 17,
    [StatType.INTELLECT]: 18,
    [StatType.WILL]: 17,
  },
  20: {
    [StatType.ATTACK]: 108,
    [StatType.STRENGTH]: 52,
    [StatType.AGILITY]: 33,
    [StatType.INTELLECT]: 35,
    [StatType.WILL]: 32,
  },
  40: {
    [StatType.ATTACK]: 164,
    [StatType.STRENGTH]: 84,
    [StatType.AGILITY]: 51,
    [StatType.INTELLECT]: 55,
    [StatType.WILL]: 50,
  },
  60: {
    [StatType.ATTACK]: 218,
    [StatType.STRENGTH]: 113,
    [StatType.AGILITY]: 67,
    [StatType.INTELLECT]: 73,
    [StatType.WILL]: 66,
  },
  80: {
    [StatType.ATTACK]: 271,
    [StatType.STRENGTH]: 143,
    [StatType.AGILITY]: 84,
    [StatType.INTELLECT]: 91,
    [StatType.WILL]: 82,
  },
  90: {
    [StatType.ATTACK]: 298,
    [StatType.STRENGTH]: 158,
    [StatType.AGILITY]: 92,
    [StatType.INTELLECT]: 100,
    [StatType.WILL]: 90,
  },
};

export class AleshOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: RodCasting;
  readonly battleSkill: UnconventionalLure;
  readonly comboSkill: AugerAngling;
  readonly ultimate: OneMonsterCatch;

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
      name: "Alesh",
      element: AleshOperator.ELEMENT,
      operatorClass: AleshOperator.OPERATOR_CLASS,
      weaponTypes: AleshOperator.WEAPON_TYPES,
      operatorRarity: AleshOperator.OPERATOR_RARITY,
      mainAttributeType: AleshOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AleshOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AleshOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AleshOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new RodCasting({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new UnconventionalLure({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new AugerAngling({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new OneMonsterCatch({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
