import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  Ruination,
  TurbidAvatar,
  AspectOfWrath,
  HeartOfTheUnmoving,
} from "../combat-skills/lifengSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 17,
  },
  lv90: {
    [StatType.ATTACK]: 322,
    [StatType.STRENGTH]: 180,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 95,
    [StatType.WILL]: 90,
  },
};

export class LifengOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.GUARD;
  static readonly WEAPON_TYPES = [WeaponType.POLEARM];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: Ruination;
  readonly battleSkill: TurbidAvatar;
  readonly comboSkill: AspectOfWrath;
  readonly ultimate: HeartOfTheUnmoving;

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
      name: "Lifeng",
      element: LifengOperator.ELEMENT,
      operatorClass: LifengOperator.OPERATOR_CLASS,
      weaponTypes: LifengOperator.WEAPON_TYPES,
      operatorRarity: LifengOperator.OPERATOR_RARITY,
      mainAttributeType: LifengOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: LifengOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: LifengOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: LifengOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Illumination',
      talentTwoName: 'Subduer of Evil',
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new Ruination({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new TurbidAvatar({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new AspectOfWrath({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new HeartOfTheUnmoving({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.STRENGTH]: 15, [StatType.AGILITY]: 15, [StatType.INTELLECT]: 15, [StatType.WILL]: 15 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.FINAL_STRIKE];
  }
  get comboDescription(): string { return 'Final Strike on enemy with Physical Susceptibility or Breach'; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Multiple polearm swings dealing Physical DMG. Ground slam that knocks down enemies in area.',
      combo: 'Triggered on Final Strike on enemy with Physical Susceptibility or Breach. Moves to enemy and applies Lift with bonus damage to Breach targets.',
      ultimate: 'Aspect slams Immovable Vajra dealing Physical DMG and knockdown to large area.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Every point of Intellect and Will further grants ATK +0.10%.',
        'Every point of Intellect and Will further grants ATK +0.15%.',
      ],
      2: [
        'Applying Knock Down also deals 50% ATK of Physical DMG.',
        'Applying Knock Down also deals 100% ATK of Physical DMG.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Breaking the Obsession: Turbid Avatar improved with Physical Susceptibility +5%.',
      'Self Refinement: All attributes +15.',
      'Spiritual Cultivation: Intellect/Will grants additional ATK +0.05%.',
      'Brief Instant: Ultimate Energy cost -15%.',
      'Unremitting: Every 15s, next effect triggered deals additional 250% ATK Physical DMG and 5 Stagger.',
    ];
  }
}
