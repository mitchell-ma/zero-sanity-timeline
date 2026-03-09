import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  RigidInterdictionBasic,
  RigidInterdiction,
  TimelySuppression,
  TextbookAssault,
} from "../combat-skills/catcherSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 4;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 22,
    [StatType.AGILITY]: 15,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 21,
  },
  20: {
    [StatType.ATTACK]: 104,
    [StatType.STRENGTH]: 48,
    [StatType.AGILITY]: 29,
    [StatType.INTELLECT]: 30,
    [StatType.WILL]: 46,
  },
  40: {
    [StatType.ATTACK]: 158,
    [StatType.STRENGTH]: 77,
    [StatType.AGILITY]: 44,
    [StatType.INTELLECT]: 45,
    [StatType.WILL]: 72,
  },
  60: {
    [StatType.ATTACK]: 209,
    [StatType.STRENGTH]: 104,
    [StatType.AGILITY]: 57,
    [StatType.INTELLECT]: 59,
    [StatType.WILL]: 97,
  },
  80: {
    [StatType.ATTACK]: 260,
    [StatType.STRENGTH]: 131,
    [StatType.AGILITY]: 71,
    [StatType.INTELLECT]: 73,
    [StatType.WILL]: 122,
  },
  90: {
    [StatType.ATTACK]: 285,
    [StatType.STRENGTH]: 145,
    [StatType.AGILITY]: 78,
    [StatType.INTELLECT]: 80,
    [StatType.WILL]: 135,
  },
};

export class CatcherOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.DEFENDER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;

  readonly basicAttack: RigidInterdictionBasic;
  readonly battleSkill: RigidInterdiction;
  readonly comboSkill: TimelySuppression;
  readonly ultimate: TextbookAssault;

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
      name: "Catcher",
      element: CatcherOperator.ELEMENT,
      operatorClass: CatcherOperator.OPERATOR_CLASS,
      weaponTypes: CatcherOperator.WEAPON_TYPES,
      operatorRarity: CatcherOperator.OPERATOR_RARITY,
      mainAttributeType: CatcherOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: CatcherOperator.SECONDARY_ATTRIBUTE_TYPE,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new RigidInterdictionBasic({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new RigidInterdiction({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new TimelySuppression({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new TextbookAssault({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
