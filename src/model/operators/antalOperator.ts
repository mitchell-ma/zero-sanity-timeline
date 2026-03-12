import { ElementType, OperatorClassType, StatType, StatusType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  ExchangeCurrent,
  SpecifiedResearchSubject,
  EmpTestSite,
  OverclockedMoment,
} from "../combat-skills/antalSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

/** Antal's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 15,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 15,
    [StatType.WILL]: 9,
  },
  lv90: {
    [StatType.ATTACK]: 297,
    [StatType.STRENGTH]: 129,
    [StatType.AGILITY]: 86,
    [StatType.INTELLECT]: 165,
    [StatType.WILL]: 82,
  },
};

export class AntalOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ExchangeCurrent;
  readonly battleSkill: SpecifiedResearchSubject;
  readonly comboSkill: EmpTestSite;
  readonly ultimate: OverclockedMoment;

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
      name: "Antal",
      element: AntalOperator.ELEMENT,
      operatorClass: AntalOperator.OPERATOR_CLASS,
      weaponTypes: AntalOperator.WEAPON_TYPES,
      operatorRarity: AntalOperator.OPERATOR_RARITY,
      mainAttributeType: AntalOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AntalOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AntalOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AntalOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Improviser',
      talentTwoName: 'Subconscious Act',
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new ExchangeCurrent({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new SpecifiedResearchSubject({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new EmpTestSite({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new OverclockedMoment({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      4: { [StatType.INTELLECT]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_PHYSICAL_STATUS, TriggerConditionType.APPLY_ARTS_INFLICTION];
  }
  get comboDescription(): string { return 'Enemy with Focus suffers Physical Status or Arts Infliction'; }
  get comboRequiresActiveColumns(): string[] { return [StatusType.FOCUS]; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }
  get derivedTeamColumns(): string[] { return ['team-amp']; }
}
