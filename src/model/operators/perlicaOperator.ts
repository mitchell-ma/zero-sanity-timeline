import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  ProtocolAlphaBreach,
  ProtocolOmegaStrike,
  InstantProtocolChain,
  ProtocolEpsilon,
} from "../combat-skills/perlicaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 24,
    [StatType.WILL]: 16,
  },
  20: {
    [StatType.ATTACK]: 107,
    [StatType.STRENGTH]: 32,
    [StatType.AGILITY]: 35,
    [StatType.INTELLECT]: 54,
    [StatType.WILL]: 31,
  },
  40: {
    [StatType.ATTACK]: 163,
    [StatType.STRENGTH]: 49,
    [StatType.AGILITY]: 55,
    [StatType.INTELLECT]: 87,
    [StatType.WILL]: 47,
  },
  60: {
    [StatType.ATTACK]: 216,
    [StatType.STRENGTH]: 64,
    [StatType.AGILITY]: 73,
    [StatType.INTELLECT]: 118,
    [StatType.WILL]: 62,
  },
  80: {
    [StatType.ATTACK]: 269,
    [StatType.STRENGTH]: 80,
    [StatType.AGILITY]: 91,
    [StatType.INTELLECT]: 149,
    [StatType.WILL]: 77,
  },
  90: {
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
      statsByLevel: STATS_BY_LEVEL,
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
}
