import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  ThunderlanceBlitz,
  ThunderlanceInterdiction,
  ThunderlanceStrike,
  ThunderlanceFinalShock,
} from "../combat-skills/avywennaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 24,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 19,
  },
  lv90: {
    [StatType.ATTACK]: 295,
    [StatType.STRENGTH]: 88,
    [StatType.AGILITY]: 165,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 118,
  },
};

export class AvywennaOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.POLEARM];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ThunderlanceBlitz;
  readonly battleSkill: ThunderlanceInterdiction;
  readonly comboSkill: ThunderlanceStrike;
  readonly ultimate: ThunderlanceFinalShock;

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
      name: "Avywenna",
      element: AvywennaOperator.ELEMENT,
      operatorClass: AvywennaOperator.OPERATOR_CLASS,
      weaponTypes: AvywennaOperator.WEAPON_TYPES,
      operatorRarity: AvywennaOperator.OPERATOR_RARITY,
      mainAttributeType: AvywennaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AvywennaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AvywennaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AvywennaOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Stalwart',
      attributeIncreaseAttribute: StatType.WILL,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new ThunderlanceBlitz({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ThunderlanceInterdiction({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new ThunderlanceStrike({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ThunderlanceFinalShock({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      3: { [StatType.WILL]: 15, [StatType.ELECTRIC_DAMAGE_BONUS]: 0.08 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.FINAL_STRIKE];
  }
  get comboDescription(): string { return 'Final Strike on Electric/Electrified enemy'; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }
}
