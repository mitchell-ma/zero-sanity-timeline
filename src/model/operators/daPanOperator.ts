import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RollingCut,
  FlipDaWok,
  MoreSpice,
  ChopNDunk,
} from "../combat-skills/daPanSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 23,
    [StatType.AGILITY]: 18,
    [StatType.INTELLECT]: 16,
    [StatType.WILL]: 17,
  },
  lv90: {
    [StatType.ATTACK]: 300,
    [StatType.STRENGTH]: 162,
    [StatType.AGILITY]: 100,
    [StatType.INTELLECT]: 85,
    [StatType.WILL]: 90,
  },
};

export class DaPanOperator extends Operator {
  static readonly ELEMENT = ElementType.PHYSICAL;
  static readonly OPERATOR_CLASS = OperatorClassType.STRIKER;
  static readonly WEAPON_TYPES = [WeaponType.GREAT_SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 2;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: RollingCut;
  readonly battleSkill: FlipDaWok;
  readonly comboSkill: MoreSpice;
  readonly ultimate: ChopNDunk;

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
      name: "Da Pan",
      element: DaPanOperator.ELEMENT,
      operatorClass: DaPanOperator.OPERATOR_CLASS,
      weaponTypes: DaPanOperator.WEAPON_TYPES,
      operatorRarity: DaPanOperator.OPERATOR_RARITY,
      mainAttributeType: DaPanOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: DaPanOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: DaPanOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: DaPanOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Reduce and Thicken',
      talentTwoName: 'Salty or Mild',
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new RollingCut({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new FlipDaWok({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new MoreSpice({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ChopNDunk({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      3: { [StatType.STRENGTH]: 15, [StatType.PHYSICAL_DAMAGE_BONUS]: 0.08 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.APPLY_VULNERABILITY];
  }
  get comboDescription(): string { return 'Enemy reaches 4 Vulnerability stacks'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Charges a wok flip dealing Physical DMG and Lift to enemies.',
      combo: 'Swings wok for massive damage and Crush.',
      ultimate: 'Lifts all nearby enemies, performs 6-sequence slashes, then knocks them down with massive damage.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'After consuming Vulnerability stack, gain +4% Physical DMG for 10s (max 4 stacks).',
        'After consuming Vulnerability stack, gain +6% Physical DMG for 10s (max 4 stacks).',
      ],
      2: [
        'Ultimate grants Prep Ingredients stacks (max 1); combo skills reduce cooldown 40% when active.',
        'Ultimate grants Prep Ingredients stacks (max 2); combo skills reduce cooldown 40% when active.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Fine Cooking: Ultimate grants +30% Physical DMG for 15s after defeating enemies.',
      'Harmonized Flavors: Talent duration +10s, max stacks +1.',
      'Model Employee: Strength +15, Physical DMG +8%.',
      'Special Blend: Ultimate energy cost -15%.',
      'Fire it Up: Single-target hits apply extra Vulnerability (once per 45s).',
    ];
  }
}
