import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SwordOfAspiration,
  BurstOfPassion,
  FlashAndDash,
  SquadOnMe,
} from "../combat-skills/akekuriSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 4;

/** Akekuri's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 13,
    [StatType.AGILITY]: 15,
    [StatType.INTELLECT]: 12,
    [StatType.WILL]: 9,
  },
  lv90: {
    [StatType.ATTACK]: 319,
    [StatType.STRENGTH]: 110,
    [StatType.AGILITY]: 140,
    [StatType.INTELLECT]: 106,
    [StatType.WILL]: 108,
  },
};

export class AkekuriOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SwordOfAspiration;
  readonly battleSkill: BurstOfPassion;
  readonly comboSkill: FlashAndDash;
  readonly ultimate: SquadOnMe;

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
      name: "Akekuri",
      element: AkekuriOperator.ELEMENT,
      operatorClass: AkekuriOperator.OPERATOR_CLASS,
      weaponTypes: AkekuriOperator.WEAPON_TYPES,
      operatorRarity: AkekuriOperator.OPERATOR_RARITY,
      mainAttributeType: AkekuriOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: AkekuriOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: AkekuriOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: AkekuriOperator.MAX_TALENT_TWO_LEVEL,
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new SwordOfAspiration({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new BurstOfPassion({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FlashAndDash({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new SquadOnMe({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.AGILITY]: 10, [StatType.INTELLECT]: 10 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.STAGGER, TriggerConditionType.STAGGER_NODE];
  }
  get comboDescription(): string { return 'Enemy becomes Staggered or hits a Stagger Node'; }
  get derivedTeamColumns(): string[] | undefined { return ['team-link']; }
}
