import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SeekAndHunt,
  TempestuousArc,
  PealOfThunder,
  ExplodingBlitz,
} from "../combat-skills/arclightSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 17,
    [StatType.AGILITY]: 23,
    [StatType.INTELLECT]: 18,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 296,
    [StatType.STRENGTH]: 92,
    [StatType.AGILITY]: 162,
    [StatType.INTELLECT]: 100,
    [StatType.WILL]: 88,
  },
};

export class ArclightOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SeekAndHunt;
  readonly battleSkill: TempestuousArc;
  readonly comboSkill: PealOfThunder;
  readonly ultimate: ExplodingBlitz;

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
      name: "Arclight",
      element: ArclightOperator.ELEMENT,
      operatorClass: ArclightOperator.OPERATOR_CLASS,
      weaponTypes: ArclightOperator.WEAPON_TYPES,
      operatorRarity: ArclightOperator.OPERATOR_RARITY,
      mainAttributeType: ArclightOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: ArclightOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: ArclightOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: ArclightOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Skirmisher',
      talentTwoName: 'Wildland Trekker',
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new SeekAndHunt({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new TempestuousArc({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new PealOfThunder({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ExplodingBlitz({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.AGILITY]: 15, [StatType.INTELLECT]: 15 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.ELECTRIFICATION];
  }
  get comboDescription(): string { return 'Enemy has or consumed Electrification'; }
}
