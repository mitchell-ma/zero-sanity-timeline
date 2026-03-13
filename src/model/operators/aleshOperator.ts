import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RodCasting,
  UnconventionalLure,
  AugerAngling,
  OneMonsterCatch,
} from "../combat-skills/aleshSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 23,
    [StatType.AGILITY]: 17,
    [StatType.INTELLECT]: 18,
    [StatType.WILL]: 17,
  },
  lv90: {
    [StatType.ATTACK]: 298,
    [StatType.STRENGTH]: 158,
    [StatType.AGILITY]: 92,
    [StatType.INTELLECT]: 100,
    [StatType.WILL]: 90,
  },
};

export class AleshOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: RodCasting;
  readonly battleSkill: UnconventionalLure;
  readonly comboSkill: AugerAngling;
  readonly ultimate: OneMonsterCatch;

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
      name: "Alesh",
      element: AleshOperator.ELEMENT,
      operatorClass: AleshOperator.OPERATOR_CLASS,
      weaponTypes: AleshOperator.WEAPON_TYPES,
      operatorRarity: AleshOperator.OPERATOR_RARITY,
      mainAttributeType: AleshOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AleshOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AleshOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AleshOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Flash-frozen for Freshness',
      talentTwoName: 'Veteran Angler',
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new RodCasting({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new UnconventionalLure({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new AugerAngling({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new OneMonsterCatch({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.STRENGTH]: 15, [StatType.INTELLECT]: 15 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION, TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION, TriggerConditionType.ELECTRIFICATION];
  }
  get comboDescription(): string { return 'Arts Reaction or Originium Crystals consumed nearby'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 5 sequences that deals Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Hooks ice dealing Physical DMG. Consumes Cryo Infliction stacks to apply Solidification and recover SP.',
      combo: 'Opens angling hole dealing Physical DMG with SP recovery. Chance to catch Rare Fin for enhanced damage.',
      ultimate: 'Hooks massive fin dealing Cryo DMG in large AoE. Applies Cryo Infliction and recovers SP.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Gain 3 Ultimate Energy when Solidification/Originium Crystals applied nearby; +6 if Alesh applies it (3s cooldown).',
        'Gain 4 Ultimate Energy when Solidification/Originium Crystals applied nearby; +8 if Alesh applies it (3s cooldown).',
      ],
      2: [
        'Every 10 Intellect grants Rare Fin catching chance +0.2% (max: +30%).',
        'Each 10 Intellect increases catch chance +0.5% (max: +30%).',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Battle skill grants additional 10 SP recovery.',
      'Strength +15, Intellect +15.',
      'Combo skill grants team ATK +15% for 10s after catching Rare Fin.',
      'Ultimate cost -15%.',
      'Ultimate damage x1.5 against targets below 50% HP.',
    ];
  }
}
