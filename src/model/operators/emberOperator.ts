import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SwordArtOfAssault,
  ForwardMarch,
  FrontlineSupport,
  ReIgnitedOath,
} from "../combat-skills/emberSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 20,
  },
  lv90: {
    [StatType.ATTACK]: 320,
    [StatType.STRENGTH]: 178,
    [StatType.AGILITY]: 85,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 130,
  },
};

export class EmberOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.DEFENDER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SwordArtOfAssault;
  readonly battleSkill: ForwardMarch;
  readonly comboSkill: FrontlineSupport;
  readonly ultimate: ReIgnitedOath;

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
      name: "Ember",
      element: EmberOperator.ELEMENT,
      operatorClass: EmberOperator.OPERATOR_CLASS,
      weaponTypes: EmberOperator.WEAPON_TYPES,
      operatorRarity: EmberOperator.OPERATOR_RARITY,
      mainAttributeType: EmberOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: EmberOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: EmberOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: EmberOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Inflamed for the Assault',
      talentTwoName: 'Pay the Ferric Price',
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new SwordArtOfAssault({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ForwardMarch({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FrontlineSupport({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ReIgnitedOath({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.STRENGTH]: 20, [StatType.WILL]: 20 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.OPERATOR_ATTACKED];
  }
  get comboDescription(): string { return 'Controlled operator is attacked'; }
  get derivedTeamColumns(): string[] { return ['team-shield']; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Leap and slam dealing Heat DMG with knockdown and stagger in fan-shaped area.',
      combo: 'Leaps at the enemy with heavy slam dealing Physical DMG, knockdown, and HP treatment.',
      ultimate: 'Ground slam dealing Heat DMG to nearby enemies. Grants all teammates a shield based on Ember\'s Max HP.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Gains 30% Protection when casting Forward March or Frontline Support.',
        'Gains 50% Protection when casting Forward March or Frontline Support.',
      ],
      2: [
        'When Ember receives DMG from the enemy, gains ATK +6% for 7s (max 3 stacks).',
        'When Ember receives DMG from the enemy, gains ATK +9% for 7s (max 3 stacks).',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Nomadic Fort: Talent Inflamed improved with +20% protection; hitting enemies extends duration by 1.5s.',
      'Steel-Hardened Veteran: Strength +20, Will +20.',
      'Indomitable Front: Combo skill restores HP to lowest-percentage teammate at 50% effectiveness.',
      'Undying Embers: Ultimate Energy cost -15%.',
      'The Steel Oath: Shield multiplied by 1.2; grants wielder ATK +10% while shield active.',
    ];
  }
}
