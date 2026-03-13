import { ElementType, OperatorClassType, StatType, StatusType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  ExchangeCurrent,
  SpecifiedResearchSubject,
  EmpTestSite,
  OverclockedMoment,
} from "../combat-skills/antalSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

/** Antal's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 15,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 15,
    [StatType.WILL]: 9,
  },
  lv90: {
    [StatType.ATTACK]: 297,
    [StatType.STRENGTH]: 129,
    [StatType.AGILITY]: 86,
    [StatType.INTELLECT]: 165,
    [StatType.WILL]: 82,
  },
};

export class AntalOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ExchangeCurrent;
  readonly battleSkill: SpecifiedResearchSubject;
  readonly comboSkill: EmpTestSite;
  readonly ultimate: OverclockedMoment;

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
      name: "Antal",
      element: AntalOperator.ELEMENT,
      operatorClass: AntalOperator.OPERATOR_CLASS,
      weaponTypes: AntalOperator.WEAPON_TYPES,
      operatorRarity: AntalOperator.OPERATOR_RARITY,
      mainAttributeType: AntalOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AntalOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AntalOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AntalOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Improviser',
      talentTwoName: 'Subconscious Act',
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new ExchangeCurrent({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new SpecifiedResearchSubject({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new EmpTestSite({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new OverclockedMoment({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      4: { [StatType.INTELLECT]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_PHYSICAL_STATUS, TriggerConditionType.APPLY_ARTS_INFLICTION];
  }
  get comboDescription(): string { return 'Enemy with Focus suffers Physical Status or Arts Infliction'; }
  get comboRequiresActiveColumns(): string[] { return [StatusType.FOCUS]; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }
  get derivedTeamColumns(): string[] { return ['team-amp']; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Electric DMG. As the controlled operator, Final Strike also deals 15 Stagger. Dive Attack: Basic attack performed in mid-air becomes a dive attack that deals Electric DMG to nearby enemies. Finisher: Basic attack performed near a Staggered enemy becomes a finisher that deals massive Electric DMG and recovers some SP.',
      battle: 'Applies Focus with a long duration on the enemy and deals Electric DMG. An enemy with active Focus also suffers Electric Susceptibility and Heat Susceptibility. Focus can only be applied to 1 enemy at any given time.',
      combo: 'When an enemy with active Focus suffers a Physical Status or Arts Infliction, triggers 1 energy explosion on the enemy that deals Electric DMG and applies another stack of the same Physical Status or Arts Infliction.',
      ultimate: 'Applies temporary Electric Amp and Heat Amp to the entire team.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'After an Amped teammate\'s skill deals DMG, Antal restores the said teammate\'s HP by [72 + Strength x 0.6]. Triggers 1 time every 30s for each operator.',
        'After an Amped teammate\'s skill deals DMG, Antal restores the said teammate\'s HP by [108 + Strength x 0.9]. Triggers 1 time every 30s for each operator.',
      ],
      2: [
        'Gains 30% chance of Physical DMG immunity and restores HP of self by [27 + Strength x 0.23].',
        'Gains 30% chance of Physical DMG immunity and restores HP of self by [27 + Strength x 0.23].',
        'Gains 30% chance of Physical DMG immunity and restores HP of self by [45 + Strength x 0.38].',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Arts Talent: Electric Amp and Heat Amp effects increased to 1.1x.',
      'Improved Automation: Ultimate Energy cost -10%.',
      'Applied Originium Theory: When enemy with Focus is defeated, return 15 SP.',
      'Granny\'s Reminder: Intellect +10, Max HP +10%.',
      'High Specs Tech Tester: Applying Focus on the same target for 20s increases Electric and Heat Susceptibility effects by 4%.',
    ];
  }
}
