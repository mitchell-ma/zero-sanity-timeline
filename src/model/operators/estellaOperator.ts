import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  AudioNoise,
  Onomatopoeia,
  Distortion,
  Tremolo,
} from "../combat-skills/estellaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 18,
    [StatType.AGILITY]: 21,
    [StatType.INTELLECT]: 17,
    [StatType.WILL]: 19,
  },
  lv90: {
    [StatType.ATTACK]: 297,
    [StatType.STRENGTH]: 108,
    [StatType.AGILITY]: 140,
    [StatType.INTELLECT]: 90,
    [StatType.WILL]: 120,
  },
};

export class EstellaOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.GUARD;
  static readonly WEAPON_TYPES = [WeaponType.POLEARM];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: AudioNoise;
  readonly battleSkill: Onomatopoeia;
  readonly comboSkill: Distortion;
  readonly ultimate: Tremolo;

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
      name: "Estella",
      element: EstellaOperator.ELEMENT,
      operatorClass: EstellaOperator.OPERATOR_CLASS,
      weaponTypes: EstellaOperator.WEAPON_TYPES,
      operatorRarity: EstellaOperator.OPERATOR_RARITY,
      mainAttributeType: EstellaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: EstellaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: EstellaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: EstellaOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Commiseration',
      talentTwoName: 'Laziness Pays Off Now',
      attributeIncreaseName: 'Stalwart',
      attributeIncreaseAttribute: StatType.WILL,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new AudioNoise({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new Onomatopoeia({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new Distortion({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new Tremolo({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      4: { [StatType.WILL]: 10, [StatType.STRENGTH]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.SOLIDIFICATION];
  }
  get comboDescription(): string { return 'Enemy has Solidification'; }
}
