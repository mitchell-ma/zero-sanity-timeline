import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SignatureGunKata,
  TinySurprise,
  FreeGiveaway,
  ApexPrankster,
} from "../combat-skills/fluoriteSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 22,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 290,
    [StatType.STRENGTH]: 85,
    [StatType.AGILITY]: 110,
    [StatType.INTELLECT]: 145,
    [StatType.WILL]: 82,
  },
};

export class FluoriteOperator extends Operator {
  static readonly ELEMENT = ElementType.NATURE;
  static readonly OPERATOR_CLASS = OperatorClassType.CASTER;
  static readonly WEAPON_TYPES = [WeaponType.HANDCANNON];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SignatureGunKata;
  readonly battleSkill: TinySurprise;
  readonly comboSkill: FreeGiveaway;
  readonly ultimate: ApexPrankster;

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
      name: "Fluorite",
      element: FluoriteOperator.ELEMENT,
      operatorClass: FluoriteOperator.OPERATOR_CLASS,
      weaponTypes: FluoriteOperator.WEAPON_TYPES,
      operatorRarity: FluoriteOperator.OPERATOR_RARITY,
      mainAttributeType: FluoriteOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: FluoriteOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: FluoriteOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: FluoriteOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Love the Stab and Twist',
      talentTwoName: 'Unpredictable',
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new SignatureGunKata({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new TinySurprise({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FreeGiveaway({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ApexPrankster({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      1: { [StatType.AGILITY]: 10, [StatType.INTELLECT]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION];
  }
  get comboDescription(): string { return '2+ Cryo or Nature Infliction stacks'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Nature DMG. Dive Attack: dive attack dealing Nature DMG. Finisher: finisher near Staggered enemy deals massive Nature DMG and recovers SP.',
      battle: 'Kicks an explosive applying Slow. Detonates for Nature DMG and Nature Infliction.',
      combo: 'Shoots target for special explosion.',
      ultimate: 'Moves in arc firing 4 sequences of Nature DMG. Detonates stuck explosives with increased damage.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'DMG Dealt +10% vs Slowed targets.',
        'DMG Dealt +20% vs Slowed targets.',
      ],
      2: [
        '20% chance Arts DMG immunity; ATK +10% for 10s.',
        '20% chance Arts DMG immunity; ATK +20% for 10s.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Agility +10, Intellect +10.',
      'Talent "Unpredictable" chance increased by +10%.',
      'Slow effect applied to all enemies from Tiny Surprise lasting 6s.',
      'Ultimate Energy cost -10%.',
      'Combo skill cooldown reduced 1s when inflictions applied (max once/1s).',
    ];
  }
}
