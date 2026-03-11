import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  AllOutOffensive,
  ThePulverizingFront,
  FullMoonSlash,
  ShieldguardBanner,
} from "../combat-skills/pogranichnikSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 25,
    [StatType.AGILITY]: 17,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 20,
  },
  lv90: {
    [StatType.ATTACK]: 322,
    [StatType.STRENGTH]: 176,
    [StatType.AGILITY]: 95,
    [StatType.INTELLECT]: 88,
    [StatType.WILL]: 125,
  },
};

export class PogranichnikOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: AllOutOffensive;
  readonly battleSkill: ThePulverizingFront;
  readonly comboSkill: FullMoonSlash;
  readonly ultimate: ShieldguardBanner;

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
      name: "Pogranichnik",
      element: PogranichnikOperator.ELEMENT,
      operatorClass: PogranichnikOperator.OPERATOR_CLASS,
      weaponTypes: PogranichnikOperator.WEAPON_TYPES,
      operatorRarity: PogranichnikOperator.OPERATOR_RARITY,
      mainAttributeType: PogranichnikOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: PogranichnikOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: PogranichnikOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: PogranichnikOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Stalwart',
      attributeIncreaseAttribute: StatType.WILL,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new AllOutOffensive({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ThePulverizingFront({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FullMoonSlash({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ShieldguardBanner({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.WILL]: 20, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_PHYSICAL_STATUS];
  }
  get comboDescription(): string { return 'Crush or Breach consumes Vulnerability'; }
}
