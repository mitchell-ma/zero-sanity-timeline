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
      talentOneName: 'Scorching Heart',
      talentTwoName: 'Re-Ignition',
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
      2: { [StatType.INTELLECT]: 20, [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 0.15 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION, TriggerConditionType.CORROSION];
  }
  get comboDescription(): string { return 'Enemy has Combustion or Corrosion'; }
  get spReturnNotes(): string[] {
    return ['P1: +20 SP on Additional Attack hit'];
  }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 5 sequences that deals Heat DMG. As the controlled operator, Final Strike also deals 18 Stagger. Dive Attack: Basic attack performed in mid-air becomes a dive attack that deals Heat DMG to nearby enemies. Finisher: Basic attack performed near a Staggered enemy becomes a finisher that deals massive Heat DMG and recovers some SP.',
      battle: 'Summons a Magma Fragment to continuously attack enemies and deal Heat DMG. Hitting the enemy grants 1 stack of Melting Flame. If Laevatain already has 4 stacks of Melting Flame when casting the skill, then consume all the stacks and perform 1 additional attack that deals Heat DMG and forcibly triggers temporary Combustion to all enemies in a large area. When the additional attack hits the enemy, restores additional Ultimate Energy. Battle skill effects are enhanced while Laevatain\'s ultimate is active.',
      combo: 'Fire erupts beneath the feet of any enemy with Combustion or Corrosion, dealing Heat DMG to them. If the skill hits the enemy, Laevatain gains 1 stack of Melting Flame and further gains Ultimate Energy per enemy hit.',
      ultimate: 'Laevatain summons her Sviga Laevi and becomes the controlled operator. For a certain duration, her basic attacks are enhanced and the Sviga Laevi strikes together with Laevatain, with each attack dealing Heat DMG. BATK sequence 3 also applies Heat Infliction.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'After the controlled operator\'s Final Strike or Finisher hits the enemy, Laevatain absorbs Heat Infliction from nearby enemies. Every stack absorbed gives 1 stack of Melting Flame (max: 4). After reaching 4 stacks, DMG dealt ignores 10 Heat RES for 20s. Also absorbs Heat Infliction from defeated enemies.',
        'After the controlled operator\'s Final Strike or Finisher hits the enemy, Laevatain absorbs Heat Infliction from nearby enemies. Every stack absorbed gives 1 stack of Melting Flame (max: 4). After reaching 4 stacks, DMG dealt ignores 15 Heat RES for 20s. Also absorbs Heat Infliction from defeated enemies.',
        'After the controlled operator\'s Final Strike or Finisher hits the enemy, Laevatain absorbs Heat Infliction from nearby enemies. Every stack absorbed gives 1 stack of Melting Flame (max: 4). After reaching 4 stacks, DMG dealt ignores 20 Heat RES for 20s. Also absorbs Heat Infliction from defeated enemies.',
      ],
      2: [
        'When HP drops below 40%, gain 90% Protection and restore 5% Max HP per second for 4s. Triggers once every 120s.',
        'When HP drops below 40%, gain 90% Protection and restore 5% Max HP per second for 4s. Triggers once every 120s.',
        'When HP drops below 40%, gain 90% Protection and restore 5% Max HP per second for 8s. Triggers once every 120s.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Heart of Melting Flame: Additional attack multiplier increased to 1.2x, and scoring a hit returns 20 SP.',
      'Pursuit of Memories: Intellect +20, Basic Attack DMG Dealt +15%.',
      'Fragments from the Past: Combustion duration from battle skill increased by 50%, Combustion DMG increased to 1.5x.',
      'Ice Cream Furnace: Ultimate Energy cost -15%.',
      'Proof of Existence: Enhanced basic attack DMG multiplier increased to 1.2x; during ultimate, each enemy defeated extends duration by +1s (max: +7s).',
    ];
  }
}
