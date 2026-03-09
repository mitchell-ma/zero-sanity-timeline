import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  SignatureGunKata,
  TinySurprise,
  FreeGiveaway,
  ApexPrankster,
} from "../combat-skills/fluoriteSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 4;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 22,
    [StatType.WILL]: 16,
  },
  20: {
    [StatType.ATTACK]: 105,
    [StatType.STRENGTH]: 31,
    [StatType.AGILITY]: 38,
    [StatType.INTELLECT]: 48,
    [StatType.WILL]: 30,
  },
  40: {
    [StatType.ATTACK]: 160,
    [StatType.STRENGTH]: 47,
    [StatType.AGILITY]: 60,
    [StatType.INTELLECT]: 77,
    [StatType.WILL]: 46,
  },
  60: {
    [StatType.ATTACK]: 212,
    [StatType.STRENGTH]: 62,
    [StatType.AGILITY]: 80,
    [StatType.INTELLECT]: 104,
    [StatType.WILL]: 60,
  },
  80: {
    [StatType.ATTACK]: 264,
    [StatType.STRENGTH]: 77,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 131,
    [StatType.WILL]: 75,
  },
  90: {
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
      statsByLevel: STATS_BY_LEVEL,
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
}
