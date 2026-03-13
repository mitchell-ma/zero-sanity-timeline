import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SoaringBreak,
  AscendingStrike,
  SoarToTheStars,
  BladeGale,
} from "../combat-skills/chenQianyuSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 20,
    [StatType.AGILITY]: 24,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 295,
    [StatType.STRENGTH]: 130,
    [StatType.AGILITY]: 165,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 82,
  },
};

export class ChenQianyuOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.GUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SoaringBreak;
  readonly battleSkill: AscendingStrike;
  readonly comboSkill: SoarToTheStars;
  readonly ultimate: BladeGale;

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
      name: "Chen Qianyu",
      element: ChenQianyuOperator.ELEMENT,
      operatorClass: ChenQianyuOperator.OPERATOR_CLASS,
      weaponTypes: ChenQianyuOperator.WEAPON_TYPES,
      operatorRarity: ChenQianyuOperator.OPERATOR_RARITY,
      mainAttributeType: ChenQianyuOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: ChenQianyuOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: ChenQianyuOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: ChenQianyuOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Slashing Edge',
      talentTwoName: 'Momentum Breaker',
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new SoaringBreak({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new AscendingStrike({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new SoarToTheStars({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new BladeGale({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.AGILITY]: 15, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.08 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_VULNERABILITY];
  }
  get comboDescription(): string { return 'Enemy becomes Vulnerable'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 5 sequences that deals Physical DMG. Final Strike deals 16 Stagger. Finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Uppercut slash dealing Physical DMG and Lift.',
      combo: 'Slashing dash through target dealing Physical DMG and Lift to all enemies in path.',
      ultimate: '7-sequence slash attack with final sequence dealing increased damage.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'After hitting an enemy with skills, gains ATK +4% for 10s (max 5 stacks).',
        'After hitting an enemy with skills, gains ATK +8% for 10s (max 5 stacks).',
      ],
      2: [
        'Interrupting the enemy\'s charge up deals another 5 Stagger.',
        'Interrupting the enemy\'s charge up deals another 10 Stagger.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'DMG Dealt +20% to enemies below 50% HP.',
      'Agility +15, Physical DMG +8%.',
      'Skill damage multiplier increased to 1.1x.',
      'Ultimate Energy cost -15%.',
      'Combo skill cooldown -3s.',
    ];
  }
}
