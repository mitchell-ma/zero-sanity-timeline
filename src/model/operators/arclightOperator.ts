import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  SeekAndHunt,
  TempestuousArc,
  PealOfThunder,
  ExplodingBlitz,
} from "../combat-skills/arclightSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 55,
    [StatType.STRENGTH]: 17,
    [StatType.AGILITY]: 23,
    [StatType.INTELLECT]: 18,
    [StatType.WILL]: 16,
  },
  lv90: {
    [StatType.ATTACK]: 296,
    [StatType.STRENGTH]: 92,
    [StatType.AGILITY]: 162,
    [StatType.INTELLECT]: 100,
    [StatType.WILL]: 88,
  },
};

export class ArclightOperator extends Operator {
  static readonly ELEMENT = ElementType.ELECTRIC;
  static readonly OPERATOR_CLASS = OperatorClassType.VANGUARD;
  static readonly WEAPON_TYPES = [WeaponType.SWORD];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: SeekAndHunt;
  readonly battleSkill: TempestuousArc;
  readonly comboSkill: PealOfThunder;
  readonly ultimate: ExplodingBlitz;

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
      name: "Arclight",
      element: ArclightOperator.ELEMENT,
      operatorClass: ArclightOperator.OPERATOR_CLASS,
      weaponTypes: ArclightOperator.WEAPON_TYPES,
      operatorRarity: ArclightOperator.OPERATOR_RARITY,
      mainAttributeType: ArclightOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: ArclightOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: ArclightOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: ArclightOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Skirmisher',
      talentTwoName: 'Wildland Trekker',
      attributeIncreaseName: 'Skirmisher',
      attributeIncreaseAttribute: StatType.AGILITY,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new SeekAndHunt({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new TempestuousArc({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new PealOfThunder({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new ExplodingBlitz({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      2: { [StatType.AGILITY]: 15, [StatType.INTELLECT]: 15 },
    };
  }

  get derivedTeamColumns(): string[] { return ['team-wildland-trekker']; }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.ELECTRIFICATION];
  }
  get comboDescription(): string { return 'Enemy has or consumed Electrification'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 5 sequences that deals Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: 'Blinks to enemy\'s side for 2 slashes. If enemy has Electrification, consumes it for additional Electric DMG attack plus SP recovery.',
      combo: 'Flurry of slashes dealing Physical DMG and recovering SP.',
      ultimate: 'Forward dash wreathed in electricity dealing Electric DMG and applying Electric Infliction. Explodes after short delay for another hit.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'After triggering Tempestuous Arc\'s additional effect 3 times, grants team Electric DMG Dealt +0.05% per Intellect point (15s, non-stacking).',
        'After triggering Tempestuous Arc\'s additional effect 3 times, grants team Electric DMG Dealt +0.08% per Intellect point (15s, non-stacking).',
      ],
      2: [
        'Ultimate applies 6% Electric Susceptibility for 10s.',
        'Ultimate applies 10% Electric Susceptibility for 10s.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Child of the Storm: Tempestuous Arc recovers additional 10 SP after triggering extra effects.',
      'Speed Battler: Agility +15, Intellect +15.',
      '"Hanna": Wildland Trekker DMG Boost increased to 1.3x original.',
      'Aldertone\'s Teachings: Exploding Blitz Ultimate Energy cost -15%.',
      'Servant of the Wildlands: Wildland Trekker trigger requirement reduced to 2 times.',
    ];
  }
}
