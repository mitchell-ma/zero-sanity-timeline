import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RockyWhispers,
  DollyRush,
  EruptionColumn,
  WoolyParty,
} from "../combat-skills/ardeliaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

/** Ardelia's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 9,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 20,
    [StatType.WILL]: 15,
  },
  lv90: {
    [StatType.ATTACK]: 323,
    [StatType.STRENGTH]: 112,
    [StatType.AGILITY]: 93,
    [StatType.INTELLECT]: 145,
    [StatType.WILL]: 118,
  },
};

export class ArdeliaOperator extends Operator {
  static readonly ELEMENT = ElementType.NATURE;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 3;

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
      maxTalentOneLevel: ArdeliaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: ArdeliaOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Friendly Presence',
      talentTwoName: 'Mountainpeak Surfer',
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
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

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.FINAL_STRIKE];
  }
  get comboDescription(): string { return 'Final Strike on enemy with no Vulnerability or Arts Infliction'; }
  get comboForbidsActiveColumns(): string[] { return ['heatInfliction', 'cryoInfliction', 'natureInfliction', 'electricInfliction']; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }
}
