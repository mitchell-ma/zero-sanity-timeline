import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  ExuberantTrigger,
  BrrBrrBomb,
  Flashfreezer,
  CryoblastingPistolier,
} from "../combat-skills/yvonneSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 17,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 25,
    [StatType.WILL]: 16,
  },
  20: {
    [StatType.ATTACK]: 114,
    [StatType.STRENGTH]: 32,
    [StatType.AGILITY]: 38,
    [StatType.INTELLECT]: 57,
    [StatType.WILL]: 32,
  },
  40: {
    [StatType.ATTACK]: 174,
    [StatType.STRENGTH]: 50,
    [StatType.AGILITY]: 60,
    [StatType.INTELLECT]: 92,
    [StatType.WILL]: 49,
  },
  60: {
    [StatType.ATTACK]: 232,
    [StatType.STRENGTH]: 66,
    [StatType.AGILITY]: 80,
    [StatType.INTELLECT]: 125,
    [StatType.WILL]: 64,
  },
  80: {
    [StatType.ATTACK]: 289,
    [StatType.STRENGTH]: 82,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 158,
    [StatType.WILL]: 80,
  },
  90: {
    [StatType.ATTACK]: 318,
    [StatType.STRENGTH]: 90,
    [StatType.AGILITY]: 110,
    [StatType.INTELLECT]: 175,
    [StatType.WILL]: 88,
  },
};

export class YvonneOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.HANDCANNON];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ExuberantTrigger;
  readonly battleSkill: BrrBrrBomb;
  readonly comboSkill: Flashfreezer;
  readonly ultimate: CryoblastingPistolier;

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
      name: "Yvonne",
      element: YvonneOperator.ELEMENT,
      operatorClass: YvonneOperator.OPERATOR_CLASS,
      weaponTypes: YvonneOperator.WEAPON_TYPES,
      operatorRarity: YvonneOperator.OPERATOR_RARITY,
      mainAttributeType: YvonneOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: YvonneOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: YvonneOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: YvonneOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new ExuberantTrigger({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new BrrBrrBomb({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new Flashfreezer({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new CryoblastingPistolier({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
