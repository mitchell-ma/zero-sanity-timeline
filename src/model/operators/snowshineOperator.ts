import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  HypothermicAssault,
  SaturatedDefense,
  PolarRescue,
  FrigidSnowfield,
} from "../combat-skills/snowshineSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 23,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 20,
  },
  lv90: {
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
      talentOneName: 'Forged',
      talentTwoName: 'Polar Survival',
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
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

  get potentialStatBonuses() {
    return {
      4: { [StatType.WILL]: 20 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.HP_BELOW_THRESHOLD];
  }
  get comboDescription(): string { return 'Controlled operator drops below 60% HP'; }
  get derivedTeamColumns(): string[] { return ['team-shield']; }
}
