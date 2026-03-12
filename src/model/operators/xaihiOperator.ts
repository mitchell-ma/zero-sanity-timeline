import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  XaihiBasicAttack,
  DistributedDos,
  StressTesting,
  StackOverflow,
} from "../combat-skills/xaihiSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 16,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 24,
    [StatType.WILL]: 19,
  },
  lv90: {
    [StatType.ATTACK]: 292,
    [StatType.STRENGTH]: 85,
    [StatType.AGILITY]: 82,
    [StatType.INTELLECT]: 168,
    [StatType.WILL]: 118,
  },
};

export class XaihiOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 1;

  readonly basicAttack: XaihiBasicAttack;
  readonly battleSkill: DistributedDos;
  readonly comboSkill: StressTesting;
  readonly ultimate: StackOverflow;

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
      name: "Xaihi",
      element: XaihiOperator.ELEMENT,
      operatorClass: XaihiOperator.OPERATOR_CLASS,
      weaponTypes: XaihiOperator.WEAPON_TYPES,
      operatorRarity: XaihiOperator.OPERATOR_RARITY,
      mainAttributeType: XaihiOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: XaihiOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: XaihiOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: XaihiOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Execute Process',
      talentTwoName: 'Freeze Protocol',
      attributeIncreaseName: 'Stalwart',
      attributeIncreaseAttribute: StatType.WILL,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new XaihiBasicAttack({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new DistributedDos({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new StressTesting({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new StackOverflow({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      4: { [StatType.INTELLECT]: 15, [StatType.TREATMENT_BONUS]: 0.10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.HP_TREATMENT];
  }
  get comboDescription(): string { return 'Auxiliary Crystal exhausts HP treatments'; }
  get derivedTeamColumns(): string[] { return ['team-amp']; }
}
