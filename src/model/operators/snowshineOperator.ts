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

  get skillDescriptions() {
    return {
      basic: 'A 3-hit combo dealing Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Raises a shield granting protection. Retaliates with Cryo DMG.',
      combo: 'Leaps to aid controlled operator.',
      ultimate: 'Leap attack creating a snow zone applying Solidification.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Strength +10.',
        'Strength +15.',
        'Strength +20.',
      ],
      2: [
        'Treatment Effect +15% for targets of 45% HP or below.',
        'Treatment Effect +25% for targets of 55% HP or below.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Cold Shelter: Arts inflictions cannot apply to protected allies during shield.',
      'Storm Region: Ultimate radius +20%.',
      'Polar Survival Guide: Solidification duration +2 seconds.',
      'Tundra Aegis: DEF +20, Will +20.',
      'Cold Disaster Specialist: Successful retaliations return 10 SP.',
    ];
  }
}
