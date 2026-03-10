import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  FlamingCinders,
  Seethe,
  SmoulderingFire,
  Twilight,
} from "../combat-skills/laevatainSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 6;

/** Laevatain's base attribute scores by level (Elite 0–Max). */
const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 13,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 22,
    [StatType.WILL]: 9,
  },
  20: {
    [StatType.ATTACK]: 91,
    [StatType.STRENGTH]: 36,
    [StatType.AGILITY]: 28,
    [StatType.INTELLECT]: 55,
    [StatType.WILL]: 26,
  },
  40: {
    [StatType.ATTACK]: 156,
    [StatType.STRENGTH]: 60,
    [StatType.AGILITY]: 49,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 44,
  },
  60: {
    [StatType.ATTACK]: 221,
    [StatType.STRENGTH]: 85,
    [StatType.AGILITY]: 69,
    [StatType.INTELLECT]: 125,
    [StatType.WILL]: 62,
  },
  80: {
    [StatType.ATTACK]: 285,
    [StatType.STRENGTH]: 109,
    [StatType.AGILITY]: 89,
    [StatType.INTELLECT]: 160,
    [StatType.WILL]: 80,
  },
  90: {
    [StatType.ATTACK]: 318,
    [StatType.STRENGTH]: 121,
    [StatType.AGILITY]: 99,
    [StatType.INTELLECT]: 177,
    [StatType.WILL]: 89,
  },
};

export class LaevatainOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 3;

  readonly basicAttack: FlamingCinders;
  readonly battleSkill: SmoulderingFire;
  readonly comboSkill: Seethe;
  readonly ultimate: Twilight;

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
      name: "Laevatain",
      element: LaevatainOperator.ELEMENT,
      operatorClass: LaevatainOperator.OPERATOR_CLASS,
      weaponTypes: LaevatainOperator.WEAPON_TYPES,
      operatorRarity: LaevatainOperator.OPERATOR_RARITY,
      mainAttributeType: LaevatainOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: LaevatainOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: LaevatainOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: LaevatainOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new FlamingCinders({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new SmoulderingFire({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new Seethe({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new Twilight({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION, TriggerConditionType.CORROSION];
  }
  get comboDescription(): string { return 'Enemy has Combustion or Corrosion'; }
}
