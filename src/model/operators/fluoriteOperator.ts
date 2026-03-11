import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SignatureGunKata,
  TinySurprise,
  FreeGiveaway,
  ApexPrankster,
} from "../combat-skills/fluoriteSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 54,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 22,
    [StatType.WILL]: 16,
  },
  lv90: {
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
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

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
      maxTalentOneLevel: FluoriteOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: FluoriteOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
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

  get potentialStatBonuses() {
    return {
      1: { [StatType.AGILITY]: 10, [StatType.INTELLECT]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION];
  }
  get comboDescription(): string { return '2+ Cryo or Nature Infliction stacks'; }
}
