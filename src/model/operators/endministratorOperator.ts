import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  DestructiveSequence,
  ConstructiveSequence,
  SealingSequence,
  BombardmentSequence,
} from "../combat-skills/endministratorSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 17,
    [StatType.INTELLECT]: 19,
    [StatType.WILL]: 17,
  },
  lv90: {
    [StatType.ATTACK]: 320,
    [StatType.STRENGTH]: 175,
    [StatType.AGILITY]: 95,
    [StatType.INTELLECT]: 120,
    [StatType.WILL]: 90,
  },
};

export class EndministratorOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.GUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: DestructiveSequence;
  readonly battleSkill: ConstructiveSequence;
  readonly comboSkill: SealingSequence;
  readonly ultimate: BombardmentSequence;

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
      name: "Endministrator",
      element: EndministratorOperator.ELEMENT,
      operatorClass: EndministratorOperator.OPERATOR_CLASS,
      weaponTypes: EndministratorOperator.WEAPON_TYPES,
      operatorRarity: EndministratorOperator.OPERATOR_RARITY,
      mainAttributeType: EndministratorOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: EndministratorOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: EndministratorOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: EndministratorOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Essence Disintegration',
      talentTwoName: 'Realspace Stasis',
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new DestructiveSequence({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ConstructiveSequence({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new SealingSequence({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new BombardmentSequence({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.CAST_COMBO_SKILL];
  }
  get comboDescription(): string { return 'Another operator casts combo skill'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 5 sequences that deals Physical DMG. Dive Attack: Basic attack performed in mid-air becomes a dive attack. Finisher: Basic attack performed near a Staggered enemy becomes a finisher that deals massive Physical DMG and recovers some SP.',
      battle: 'Forceful burst of Originium Crystals attacking enemies in AoE. Deals Physical DMG and applies Crush.',
      combo: 'Rushes to attack and applies sealing crystals to the enemy. Shattering the crystals deals bonus damage.',
      ultimate: 'Wide area bombardment dealing massive Physical DMG. Extra hits if enemies have crystals attached.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Gains ATK +15% for 15s when crystals are consumed.',
        'Gains ATK +30% for 15s when crystals are consumed.',
      ],
      2: [
        'Enemies with attached crystals suffer Physical DMG Taken +10%.',
        'Enemies with attached crystals suffer Physical DMG Taken +20%.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Final Awakening: Constructive Sequence returns 50 SP when consuming crystals.',
      'Reflection of Authority: Allied operators gain half the ATK buff.',
      '???',
      '???',
      '???',
    ];
  }
}
