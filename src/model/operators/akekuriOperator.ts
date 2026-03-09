import { ElementType, OperatorClassType, StatType, WeaponType } from "../../consts/enums";
import {
  SwordOfAspiration,
  BurstOfPassion,
  FlashAndDash,
  SquadOnMe,
} from "../combat-skills/akekuriSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { Operator } from "./operator";

const RARITY: OperatorRarity = 4;

/** Akekuri's base attribute scores by level (Elite 0–Max). */
const STATS_BY_LEVEL: Readonly<Record<number, Partial<Record<StatType, number>>>> = {
  1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 13,
    [StatType.AGILITY]: 15,
    [StatType.INTELLECT]: 12,
    [StatType.WILL]: 9,
  },
  20: {
    [StatType.ATTACK]: 92,
    [StatType.STRENGTH]: 34,
    [StatType.AGILITY]: 42,
    [StatType.INTELLECT]: 32,
    [StatType.WILL]: 30,
  },
  40: {
    [StatType.ATTACK]: 157,
    [StatType.STRENGTH]: 55,
    [StatType.AGILITY]: 70,
    [StatType.INTELLECT]: 53,
    [StatType.WILL]: 52,
  },
  60: {
    [StatType.ATTACK]: 222,
    [StatType.STRENGTH]: 77,
    [StatType.AGILITY]: 98,
    [StatType.INTELLECT]: 75,
    [StatType.WILL]: 74,
  },
  80: {
    [StatType.ATTACK]: 287,
    [StatType.STRENGTH]: 99,
    [StatType.AGILITY]: 126,
    [StatType.INTELLECT]: 96,
    [StatType.WILL]: 96,
  },
  90: {
    [StatType.ATTACK]: 319,
    [StatType.STRENGTH]: 110,
    [StatType.AGILITY]: 140,
    [StatType.INTELLECT]: 106,
    [StatType.WILL]: 108,
  },
};

export class AkekuriOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SwordOfAspiration;
  readonly battleSkill: BurstOfPassion;
  readonly comboSkill: FlashAndDash;
  readonly ultimate: SquadOnMe;

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
      name: "Akekuri",
      element: AkekuriOperator.ELEMENT,
      operatorClass: AkekuriOperator.OPERATOR_CLASS,
      weaponTypes: AkekuriOperator.WEAPON_TYPES,
      operatorRarity: AkekuriOperator.OPERATOR_RARITY,
      mainAttributeType: AkekuriOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AkekuriOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AkekuriOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AkekuriOperator.MAX_TALENT_TWO_LEVEL,
      statsByLevel: STATS_BY_LEVEL,
      ...params,
    });

    this.basicAttack = new SwordOfAspiration({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new BurstOfPassion({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FlashAndDash({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new SquadOnMe({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }
}
