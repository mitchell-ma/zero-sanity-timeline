import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  ProtocolAlphaBreach,
  ProtocolOmegaStrike,
  InstantProtocolChain,
  ProtocolEpsilon,
} from "../combat-skills/perlicaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 24,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 295,
    [StatType.STRENGTH]: 88,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 165,
    [StatType.WILL]: 85,
  },
};

export class PerlicaOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.CASTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ProtocolAlphaBreach;
  readonly battleSkill: ProtocolOmegaStrike;
  readonly comboSkill: InstantProtocolChain;
  readonly ultimate: ProtocolEpsilon;

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
      name: "Perlica",
      element: PerlicaOperator.ELEMENT,
      operatorClass: PerlicaOperator.OPERATOR_CLASS,
      weaponTypes: PerlicaOperator.WEAPON_TYPES,
      operatorRarity: PerlicaOperator.OPERATOR_RARITY,
      mainAttributeType: PerlicaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: PerlicaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: PerlicaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: PerlicaOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Obliteration Protocol',
      talentTwoName: 'Cycle Protocol',
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new ProtocolAlphaBreach({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ProtocolOmegaStrike({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new InstantProtocolChain({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ProtocolEpsilon({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.FINAL_STRIKE];
  }
  get comboDescription(): string { return 'Final Strike finisher'; }

  get skillDescriptions() {
    return {
      basic: 'Multi-sequence Electric attack. Dive Attack: dive attack dealing Electric DMG. Finisher: finisher near Staggered enemy deals massive Electric DMG and recovers SP.',
      battle: 'Electromagnetic bolt dealing Electric DMG and Electric Infliction.',
      combo: 'Chains lightning to targets.',
      ultimate: 'Orbital debris strike with area damage.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'DMG Dealt +20% to Staggered enemies.',
        'DMG Dealt +30% to Staggered enemies.',
      ],
      2: [
        'Combo skill chains once more against Vulnerable enemies.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Electrification duration +75%.',
      'Ultimate energy cost -15%.',
      'ATK +20% for 5s after applying Electrification (2 stacks).',
      'Arts damage taken debuff duration x1.33.',
      'Critical Rate +30%.',
    ];
  }
}
