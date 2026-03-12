import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  BeamCohesionArts,
  GravityMode,
  MatrixDisplacement,
  GravityField,
} from "../combat-skills/gilbertaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 17,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 25,
    [StatType.WILL]: 19,
  },
  lv90: {
    [StatType.ATTACK]: 318,
    [StatType.STRENGTH]: 90,
    [StatType.AGILITY]: 88,
    [StatType.INTELLECT]: 178,
    [StatType.WILL]: 120,
  },
};

export class GilbertaOperator extends Operator {
  static readonly ELEMENT = ElementType.NATURE;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: BeamCohesionArts;
  readonly battleSkill: GravityMode;
  readonly comboSkill: MatrixDisplacement;
  readonly ultimate: GravityField;

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
      name: "Gilberta",
      element: GilbertaOperator.ELEMENT,
      operatorClass: GilbertaOperator.OPERATOR_CLASS,
      weaponTypes: GilbertaOperator.WEAPON_TYPES,
      operatorRarity: GilbertaOperator.OPERATOR_RARITY,
      mainAttributeType: GilbertaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: GilbertaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: GilbertaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: GilbertaOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: "Messenger's Song",
      talentTwoName: 'Late Reply',
      attributeIncreaseName: 'Stalwart',
      attributeIncreaseAttribute: StatType.WILL,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new BeamCohesionArts({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new GravityMode({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new MatrixDisplacement({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new GravityField({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION, TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION, TriggerConditionType.ELECTRIFICATION];
  }
  get comboDescription(): string { return 'Any Arts Reaction applied'; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }
}
