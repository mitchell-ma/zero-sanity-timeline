import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RigidInterdictionBasic,
  RigidInterdiction,
  TimelySuppression,
  TextbookAssault,
} from "../combat-skills/catcherSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 22,
    [StatType.AGILITY]: 15,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 21,
  },
  lv90: {
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
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

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
      maxTalentOneLevel: CatcherOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: CatcherOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Resilient Defense',
      talentTwoName: 'Comprehensive Mindset',
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
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

  get potentialStatBonuses() {
    return {
      2: { [StatType.WILL]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.OPERATOR_ATTACKED];
  }
  get comboDescription(): string { return 'Enemy charges up or operator below 40% HP'; }
  get derivedTeamColumns(): string[] { return ['team-shield']; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Physical DMG. Final Strike deals 22 Stagger.',
      battle: 'Raises shield providing protection to self and nearby operators. Retaliates with bash dealing Physical DMG and applying Vulnerability.',
      combo: 'Downward punch dealing Physical DMG. Grants shields to self and a teammate.',
      ultimate: 'Two consecutive slashes applying Weaken, then powerful slam dealing massive DMG and Knock Down.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'For every 10 Will, DEF +1.0.',
        'For every 10 Will, DEF +1.2.',
      ],
      2: [
        'Ultimate creates 2 shockwaves dealing 30% ATK Physical DMG each.',
        'Ultimate creates 3 shockwaves dealing 45% ATK Physical DMG each.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Multi-layered Readiness: Battle and ultimate skills gain additional strike dealing [300 + DEF x5.0] Physical DMG.',
      'Bonus Spec Training: DEF +20, Will +10.',
      'Unwavering Post: Combo skill shield duration +5 seconds.',
      'Compensated Suffering: Ultimate energy cost -10%.',
      'Choice Without Regrets: Hitting enemies while shield active returns 10 SP.',
    ];
  }
}
