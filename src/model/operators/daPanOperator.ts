import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RollingCut,
  FlipDaWok,
  MoreSpice,
  ChopNDunk,
} from "../combat-skills/daPanSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 23,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 17,
  },
  20: {
    [StatType.ATTACK]: 108,
    [StatType.STRENGTH]: 53,
    [StatType.AGILITY]: 35,
    [StatType.INTELLECT]: 31,
    [StatType.WILL]: 32,
  },
  40: {
    [StatType.ATTACK]: 165,
    [StatType.STRENGTH]: 86,
    [StatType.AGILITY]: 55,
    [StatType.INTELLECT]: 47,
    [StatType.WILL]: 50,
  },
  60: {
    [StatType.ATTACK]: 219,
    [StatType.STRENGTH]: 116,
    [StatType.AGILITY]: 73,
    [StatType.INTELLECT]: 62,
    [StatType.WILL]: 66,
  },
  80: {
    [StatType.ATTACK]: 273,
    [StatType.STRENGTH]: 147,
    [StatType.AGILITY]: 91,
    [StatType.INTELLECT]: 77,
    [StatType.WILL]: 82,
  },
  90: {
    [StatType.ATTACK]: 300,
    [StatType.STRENGTH]: 162,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 85,
    [StatType.WILL]: 90,
  },
};

export class DaPanOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: RollingCut;
  readonly battleSkill: FlipDaWok;
  readonly comboSkill: MoreSpice;
  readonly ultimate: ChopNDunk;

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
      name: "Da Pan",
      element: DaPanOperator.ELEMENT,
      operatorClass: DaPanOperator.OPERATOR_CLASS,
      weaponTypes: DaPanOperator.WEAPON_TYPES,
      operatorRarity: DaPanOperator.OPERATOR_RARITY,
      mainAttributeType: DaPanOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: DaPanOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: DaPanOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: DaPanOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new RollingCut({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new FlipDaWok({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new MoreSpice({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ChopNDunk({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_VULNERABILITY];
  }
  get comboDescription(): string { return 'Enemy reaches 4 Vulnerability stacks'; }
}
