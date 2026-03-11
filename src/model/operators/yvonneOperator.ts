import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  ExuberantTrigger,
  BrrBrrBomb,
  Flashfreezer,
  CryoblastingPistolier,
} from "../combat-skills/yvonneSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 17,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 25,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 318,
    [StatType.STRENGTH]: 90,
    [StatType.AGILITY]: 110,
    [StatType.INTELLECT]: 175,
    [StatType.WILL]: 88,
  },
};

export class YvonneOperator extends Operator {
  static readonly ELEMENT = ElementType.CRYO;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.HANDCANNON];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: ExuberantTrigger;
  readonly battleSkill: BrrBrrBomb;
  readonly comboSkill: Flashfreezer;
  readonly ultimate: CryoblastingPistolier;

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
      name: "Yvonne",
      element: YvonneOperator.ELEMENT,
      operatorClass: YvonneOperator.OPERATOR_CLASS,
      weaponTypes: YvonneOperator.WEAPON_TYPES,
      operatorRarity: YvonneOperator.OPERATOR_RARITY,
      mainAttributeType: YvonneOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: YvonneOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: YvonneOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: YvonneOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new ExuberantTrigger({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new BrrBrrBomb({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new Flashfreezer({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new CryoblastingPistolier({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.INTELLECT]: 20, [StatType.CRITICAL_RATE]: 0.07 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.FINAL_STRIKE];
  }
  get comboDescription(): string { return 'Final Strike on Solidified enemy'; }
}
