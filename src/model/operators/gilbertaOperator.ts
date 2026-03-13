import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  BeamCohesionArts,
  GravityMode,
  MatrixDisplacement,
  GravityField,
} from "../combat-skills/gilbertaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 57,
    [StatType.STRENGTH]: 17,
    [StatType.AGILITY]: 16,
    [StatType.INTELLECT]: 25,
    [StatType.WILL]: 19,
  },
  lv90: {
    [StatType.ATTACK]: 318,
    [StatType.STRENGTH]: 90,
    [StatType.AGILITY]: 88,
    [StatType.INTELLECT]: 178,
    [StatType.WILL]: 120,
  },
};

export class GilbertaOperator extends Operator {
  static readonly ELEMENT = ElementType.NATURE;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: BeamCohesionArts;
  readonly battleSkill: GravityMode;
  readonly comboSkill: MatrixDisplacement;
  readonly ultimate: GravityField;

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
      name: "Gilberta",
      element: GilbertaOperator.ELEMENT,
      operatorClass: GilbertaOperator.OPERATOR_CLASS,
      weaponTypes: GilbertaOperator.WEAPON_TYPES,
      operatorRarity: GilbertaOperator.OPERATOR_RARITY,
      mainAttributeType: GilbertaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: GilbertaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: GilbertaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: GilbertaOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: "Messenger's Song",
      talentTwoName: 'Late Reply',
      attributeIncreaseName: 'Stalwart',
      attributeIncreaseAttribute: StatType.WILL,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new BeamCohesionArts({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new GravityMode({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new MatrixDisplacement({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new GravityField({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION, TriggerConditionType.SOLIDIFICATION, TriggerConditionType.CORROSION, TriggerConditionType.ELECTRIFICATION];
  }
  get comboDescription(): string { return 'Any Arts Reaction applied'; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }
  get derivedTeamColumns(): string[] { return ['team-ultimate-gain']; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Nature DMG. Dive Attack: dive attack dealing Nature DMG. Finisher: finisher near Staggered enemy deals massive Nature DMG and recovers SP.',
      battle: 'Creates a gravity well dealing Nature DMG. Applies Nature Infliction on implosion.',
      combo: 'Deals Nature DMG and Lifts targets.',
      ultimate: 'Creates anomalous gravity field applying Nature Infliction, Slow, and Arts Susceptibility. Effect scales with Vulnerability stacks.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'All allied Guards, Casters, and Supporters gain Ultimate Gain Efficiency +4%.',
        'All allied Guards, Casters, and Supporters gain Ultimate Gain Efficiency +7%.',
      ],
      2: [
        'Hitting 2+ enemies restores [72 + Intellect x0.6] HP to operator or lowest-HP teammate.',
        'Hitting 2+ enemies restores [108 + Intellect x0.9] HP to operator or lowest-HP teammate.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Above the Clouds: Gravity Mode effect radius +20%.',
      'Wind Walker: Arts Susceptibility per Vulnerability stack doubled; target treated as having +1 stack (max 4).',
      'Quick, Gentle Steps: Messenger\'s Song Ultimate Gain Efficiency +5%.',
      'Dances with Clouds: Gravity Field Ultimate Energy cost -15%.',
      'Special Mail: Matrix Displacement cooldown -2s; DMG multiplier 1.3x.',
    ];
  }
}
