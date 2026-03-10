import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  HypothermicAssault,
  SaturatedDefense,
  PolarRescue,
  FrigidSnowfield,
} from "../combat-skills/snowshineSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 23,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 20,
  },
  20: {
    [StatType.ATTACK]: 105,
    [StatType.STRENGTH]: 53,
    [StatType.AGILITY]: 30,
    [StatType.INTELLECT]: 31,
    [StatType.WILL]: 44,
  },
  40: {
    [StatType.ATTACK]: 160,
    [StatType.STRENGTH]: 85,
    [StatType.AGILITY]: 46,
    [StatType.INTELLECT]: 47,
    [StatType.WILL]: 70,
  },
  60: {
    [StatType.ATTACK]: 212,
    [StatType.STRENGTH]: 115,
    [StatType.AGILITY]: 60,
    [StatType.INTELLECT]: 62,
    [StatType.WILL]: 94,
  },
  80: {
    [StatType.ATTACK]: 264,
    [StatType.STRENGTH]: 145,
    [StatType.AGILITY]: 75,
    [StatType.INTELLECT]: 77,
    [StatType.WILL]: 118,
  },
  90: {
    [StatType.ATTACK]: 290,
    [StatType.STRENGTH]: 160,
    [StatType.AGILITY]: 82,
    [StatType.INTELLECT]: 85,
    [StatType.WILL]: 130,
  },
};

export class SnowshineOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.DEFENDER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: HypothermicAssault;
  readonly battleSkill: SaturatedDefense;
  readonly comboSkill: PolarRescue;
  readonly ultimate: FrigidSnowfield;

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
      name: "Snowshine",
      element: SnowshineOperator.ELEMENT,
      operatorClass: SnowshineOperator.OPERATOR_CLASS,
      weaponTypes: SnowshineOperator.WEAPON_TYPES,
      operatorRarity: SnowshineOperator.OPERATOR_RARITY,
      mainAttributeType: SnowshineOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: SnowshineOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: SnowshineOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: SnowshineOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new HypothermicAssault({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new SaturatedDefense({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new PolarRescue({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new FrigidSnowfield({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.HP_BELOW_THRESHOLD];
  }
  get comboDescription(): string { return 'Controlled operator drops below 60% HP'; }
  get derivedTeamColumns(): string[] { return ['team-shield']; }
}
