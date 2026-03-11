import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  FlamingCinders,
  Seethe,
  SmoulderingFire,
  Twilight,
} from "../combat-skills/laevatainSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

/** Laevatain's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 13,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 22,
    [StatType.WILL]: 9,
  },
  lv90: {
    [StatType.ATTACK]: 318,
    [StatType.STRENGTH]: 121,
    [StatType.AGILITY]: 99,
    [StatType.INTELLECT]: 177,
    [StatType.WILL]: 89,
  },
};

export class LaevatainOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 3;

  readonly basicAttack: FlamingCinders;
  readonly battleSkill: SmoulderingFire;
  readonly comboSkill: Seethe;
  readonly ultimate: Twilight;

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
      name: "Laevatain",
      element: LaevatainOperator.ELEMENT,
      operatorClass: LaevatainOperator.OPERATOR_CLASS,
      weaponTypes: LaevatainOperator.WEAPON_TYPES,
      operatorRarity: LaevatainOperator.OPERATOR_RARITY,
      mainAttributeType: LaevatainOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: LaevatainOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: LaevatainOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: LaevatainOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new FlamingCinders({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new SmoulderingFire({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new Seethe({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new Twilight({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.INTELLECT]: 20 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION, TriggerConditionType.CORROSION];
  }
  get comboDescription(): string { return 'Enemy has Combustion or Corrosion'; }
}
