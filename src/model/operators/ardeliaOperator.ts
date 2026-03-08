import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  RockyWhispers,
  DollyRush,
  EruptionColumn,
  WoolyParty,
} from "../combat-skills/ardeliaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseOperator } from "./baseOperator";

const RARITY: OperatorRarity = 6;

/** Ardelia's base attribute scores by level (Elite 0–Max). */
const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 9,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 20,
    [StatType.WILL]: 15,
  },
  20: {
    [StatType.ATTACK]: 93,
    [StatType.STRENGTH]: 31,
    [StatType.AGILITY]: 27,
    [StatType.INTELLECT]: 46,
    [StatType.WILL]: 37,
  },
  40: {
    [StatType.ATTACK]: 159,
    [StatType.STRENGTH]: 54,
    [StatType.AGILITY]: 46,
    [StatType.INTELLECT]: 75,
    [StatType.WILL]: 60,
  },
  60: {
    [StatType.ATTACK]: 225,
    [StatType.STRENGTH]: 77,
    [StatType.AGILITY]: 65,
    [StatType.INTELLECT]: 103,
    [StatType.WILL]: 83,
  },
  80: {
    [StatType.ATTACK]: 291,
    [StatType.STRENGTH]: 100,
    [StatType.AGILITY]: 84,
    [StatType.INTELLECT]: 131,
    [StatType.WILL]: 106,
  },
  90: {
    [StatType.ATTACK]: 323,
    [StatType.STRENGTH]: 112,
    [StatType.AGILITY]: 93,
    [StatType.INTELLECT]: 145,
    [StatType.WILL]: 118,
  },
};

export class ArdeliaOperator extends BaseOperator {
  static readonly ELEMENT = ElementType.NATURE;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;

  readonly basicAttack: RockyWhispers;
  readonly battleSkill: DollyRush;
  readonly comboSkill: EruptionColumn;
  readonly ultimate: WoolyParty;

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
      name: "Ardelia",
      element: ArdeliaOperator.ELEMENT,
      operatorClass: ArdeliaOperator.OPERATOR_CLASS,
      weaponTypes: ArdeliaOperator.WEAPON_TYPES,
      operatorRarity: ArdeliaOperator.OPERATOR_RARITY,
      mainAttributeType: ArdeliaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: ArdeliaOperator.SECONDARY_ATTRIBUTE_TYPE,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new RockyWhispers({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new DollyRush({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new EruptionColumn({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new WoolyParty({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
