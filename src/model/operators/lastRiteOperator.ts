import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  DanceOfRime,
  EsotericLegacy,
  WintersDevourer,
  VigilServices,
} from "../combat-skills/lastRiteSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 58,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 16,
  },
  20: {
    [StatType.ATTACK]: 116,
    [StatType.STRENGTH]: 59,
    [StatType.AGILITY]: 37,
    [StatType.INTELLECT]: 32,
    [StatType.WILL]: 31,
  },
  40: {
    [StatType.ATTACK]: 178,
    [StatType.STRENGTH]: 95,
    [StatType.AGILITY]: 57,
    [StatType.INTELLECT]: 49,
    [StatType.WILL]: 47,
  },
  60: {
    [StatType.ATTACK]: 237,
    [StatType.STRENGTH]: 129,
    [StatType.AGILITY]: 76,
    [StatType.INTELLECT]: 64,
    [StatType.WILL]: 62,
  },
  80: {
    [StatType.ATTACK]: 296,
    [StatType.STRENGTH]: 163,
    [StatType.AGILITY]: 95,
    [StatType.INTELLECT]: 80,
    [StatType.WILL]: 77,
  },
  90: {
    [StatType.ATTACK]: 325,
    [StatType.STRENGTH]: 180,
    [StatType.AGILITY]: 105,
    [StatType.INTELLECT]: 88,
    [StatType.WILL]: 85,
  },
};

export class LastRiteOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;

  readonly basicAttack: DanceOfRime;
  readonly battleSkill: EsotericLegacy;
  readonly comboSkill: WintersDevourer;
  readonly ultimate: VigilServices;

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
      name: "Last Rite",
      element: LastRiteOperator.ELEMENT,
      operatorClass: LastRiteOperator.OPERATOR_CLASS,
      weaponTypes: LastRiteOperator.WEAPON_TYPES,
      operatorRarity: LastRiteOperator.OPERATOR_RARITY,
      mainAttributeType: LastRiteOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: LastRiteOperator.SECONDARY_ATTRIBUTE_TYPE,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new DanceOfRime({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new EsotericLegacy({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new WintersDevourer({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new VigilServices({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
