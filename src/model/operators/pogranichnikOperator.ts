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
      talentOneName: 'The Living Banner',
      talentTwoName: 'Tactical Instruction',
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

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 5 sequences that deals Physical DMG. Dive Attack: dive attack dealing Physical DMG. Finisher: finisher near Staggered enemy deals massive Physical DMG and recovers SP.',
      battle: '2-sequence slash applying Breach. Recovers SP based on consumed Vulnerability stacks.',
      combo: 'Up to 3 slash sequences. Enhanced damage on 4-stack Vulnerability consumption.',
      ultimate: 'Summons 4 Shieldguards to advance and push enemies. Generates Steel Oath points triggering additional summons and Decisive Assault.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Recovering 80 SP with own skills grants Fervent Morale for 20s — ATK +4% and Arts Intensity +4 (max 3 stacks).',
        'Recovering 80 SP with own skills grants Fervent Morale for 20s — ATK +8% and Arts Intensity +8 (max 3 stacks).',
      ],
      2: [
        'Any operator triggering ultimate\'s subsequent effects also gains Fervent Morale for 5s.',
        'Any operator triggering ultimate\'s subsequent effects also gains Fervent Morale for 10s.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Battle skill SP return improved: +15 SP when hitting 2+ enemies.',
      'Will +20, Physical DMG +10%.',
      'Talent threshold reduced to 60 SP; max Fervent Morale +2.',
      'Ultimate cost -15%.',
      'Combo skill cooldown -2s; SP recovery x1.2.',
    ];
  }
}
