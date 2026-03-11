import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  DanceOfRime,
  EsotericLegacy,
  WintersDevourer,
  VigilServices,
} from "../combat-skills/lastRiteSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 58,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 325,
    [StatType.STRENGTH]: 180,
    [StatType.AGILITY]: 105,
    [StatType.INTELLECT]: 88,
    [StatType.WILL]: 85,
  },
};

export class LastRiteOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: DanceOfRime;
  readonly battleSkill: EsotericLegacy;
  readonly comboSkill: WintersDevourer;
  readonly ultimate: VigilServices;

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
      name: "Last Rite",
      element: LastRiteOperator.ELEMENT,
      operatorClass: LastRiteOperator.OPERATOR_CLASS,
      weaponTypes: LastRiteOperator.WEAPON_TYPES,
      operatorRarity: LastRiteOperator.OPERATOR_RARITY,
      mainAttributeType: LastRiteOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: LastRiteOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: LastRiteOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: LastRiteOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new DanceOfRime({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new EsotericLegacy({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new WintersDevourer({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new VigilServices({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.STRENGTH]: 20, [StatType.CRYO_DAMAGE_BONUS]: 0.10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.SOLIDIFICATION];
  }
  get comboDescription(): string { return 'Enemy has 3+ Cryo Infliction stacks'; }
}
