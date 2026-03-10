import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RapidFireAkimbo,
  ThermiteTracers,
  FragGrenadeBeta,
  WolvenFury,
} from "../combat-skills/wulfgardSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

/** Wulfgard's base attribute scores by level (Elite 0–Max). */
const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 18,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 9,
    [StatType.WILL]: 13,
  },
  20: {
    [StatType.ATTACK]: 86,
    [StatType.STRENGTH]: 49,
    [StatType.AGILITY]: 27,
    [StatType.INTELLECT]: 27,
    [StatType.WILL]: 34,
  },
  40: {
    [StatType.ATTACK]: 146,
    [StatType.STRENGTH]: 81,
    [StatType.AGILITY]: 47,
    [StatType.INTELLECT]: 45,
    [StatType.WILL]: 56,
  },
  60: {
    [StatType.ATTACK]: 205,
    [StatType.STRENGTH]: 113,
    [StatType.AGILITY]: 66,
    [StatType.INTELLECT]: 64,
    [StatType.WILL]: 78,
  },
  80: {
    [StatType.ATTACK]: 264,
    [StatType.STRENGTH]: 145,
    [StatType.AGILITY]: 85,
    [StatType.INTELLECT]: 83,
    [StatType.WILL]: 100,
  },
  90: {
    [StatType.ATTACK]: 294,
    [StatType.STRENGTH]: 161,
    [StatType.AGILITY]: 95,
    [StatType.INTELLECT]: 92,
    [StatType.WILL]: 111,
  },
};

export class WulfgardOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.CASTER;
  static readonly WEAPON_TYPES = [WeaponType.HANDCANNON];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: RapidFireAkimbo;
  readonly battleSkill: ThermiteTracers;
  readonly comboSkill: FragGrenadeBeta;
  readonly ultimate: WolvenFury;

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
      name: "Wulfgard",
      element: WulfgardOperator.ELEMENT,
      operatorClass: WulfgardOperator.OPERATOR_CLASS,
      weaponTypes: WulfgardOperator.WEAPON_TYPES,
      operatorRarity: WulfgardOperator.OPERATOR_RARITY,
      mainAttributeType: WulfgardOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: WulfgardOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: WulfgardOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: WulfgardOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new RapidFireAkimbo({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ThermiteTracers({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FragGrenadeBeta({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new WolvenFury({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION];
  }
  get comboDescription(): string { return 'Enemy has Combustion'; }
}
