import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  AllOutOffensive,
  ThePulverizingFront,
  FullMoonSlash,
  ShieldguardBanner,
} from "../combat-skills/pogranichnikSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 17,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 20,
  },
  20: {
    [StatType.ATTACK]: 115,
    [StatType.STRENGTH]: 57,
    [StatType.AGILITY]: 34,
    [StatType.INTELLECT]: 32,
    [StatType.WILL]: 43,
  },
  40: {
    [StatType.ATTACK]: 176,
    [StatType.STRENGTH]: 93,
    [StatType.AGILITY]: 52,
    [StatType.INTELLECT]: 49,
    [StatType.WILL]: 67,
  },
  60: {
    [StatType.ATTACK]: 234,
    [StatType.STRENGTH]: 126,
    [StatType.AGILITY]: 69,
    [StatType.INTELLECT]: 64,
    [StatType.WILL]: 90,
  },
  80: {
    [StatType.ATTACK]: 293,
    [StatType.STRENGTH]: 159,
    [StatType.AGILITY]: 86,
    [StatType.INTELLECT]: 80,
    [StatType.WILL]: 113,
  },
  90: {
    [StatType.ATTACK]: 322,
    [StatType.STRENGTH]: 176,
    [StatType.AGILITY]: 95,
    [StatType.INTELLECT]: 88,
    [StatType.WILL]: 125,
  },
};

export class PogranichnikOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;

  readonly basicAttack: AllOutOffensive;
  readonly battleSkill: ThePulverizingFront;
  readonly comboSkill: FullMoonSlash;
  readonly ultimate: ShieldguardBanner;

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
      name: "Pogranichnik",
      element: PogranichnikOperator.ELEMENT,
      operatorClass: PogranichnikOperator.OPERATOR_CLASS,
      weaponTypes: PogranichnikOperator.WEAPON_TYPES,
      operatorRarity: PogranichnikOperator.OPERATOR_RARITY,
      mainAttributeType: PogranichnikOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: PogranichnikOperator.SECONDARY_ATTRIBUTE_TYPE,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new AllOutOffensive({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ThePulverizingFront({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FullMoonSlash({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ShieldguardBanner({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
