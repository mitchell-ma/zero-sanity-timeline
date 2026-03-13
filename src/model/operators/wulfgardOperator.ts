import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RapidFireAkimbo,
  ThermiteTracers,
  FragGrenadeBeta,
  WolvenFury,
} from "../combat-skills/wulfgardSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 5;

/** Wulfgard's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 18,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 9,
    [StatType.WILL]: 13,
  },
  lv90: {
    [StatType.ATTACK]: 294,
    [StatType.STRENGTH]: 161,
    [StatType.AGILITY]: 95,
    [StatType.INTELLECT]: 92,
    [StatType.WILL]: 111,
  },
};

export class WulfgardOperator extends Operator {
  static readonly ELEMENT = ElementType.HEAT;
  static readonly OPERATOR_CLASS = OperatorClassType.CASTER;
  static readonly WEAPON_TYPES = [WeaponType.HANDCANNON];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.STRENGTH;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.AGILITY;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 2;

  readonly basicAttack: RapidFireAkimbo;
  readonly battleSkill: ThermiteTracers;
  readonly comboSkill: FragGrenadeBeta;
  readonly ultimate: WolvenFury;

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
      name: "Wulfgard",
      element: WulfgardOperator.ELEMENT,
      operatorClass: WulfgardOperator.OPERATOR_CLASS,
      weaponTypes: WulfgardOperator.WEAPON_TYPES,
      operatorRarity: WulfgardOperator.OPERATOR_RARITY,
      mainAttributeType: WulfgardOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: WulfgardOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: WulfgardOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: WulfgardOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Scorching Fangs',
      talentTwoName: 'Code of Restraint',
      attributeIncreaseName: 'Forged',
      attributeIncreaseAttribute: StatType.STRENGTH,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new RapidFireAkimbo({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new ThermiteTracers({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new FragGrenadeBeta({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new WolvenFury({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get potentialStatBonuses() {
    return {
      1: { [StatType.STRENGTH]: 15, [StatType.AGILITY]: 15 },
    };
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.COMBUSTION];
  }
  get comboDescription(): string { return 'Enemy has Combustion'; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Heat DMG. As the controlled operator, Final Strike also deals 18 Stagger. Dive Attack: Basic attack performed in mid-air becomes a dive attack that deals Heat DMG to nearby enemies. Finisher: Basic attack performed near a Staggered enemy becomes a finisher that deals massive Heat DMG and recovers some SP.',
      battle: 'Fires multiple shots at the target that deal some Heat DMG. The final shot also applies Heat Infliction. If the target has active Combustion or Electrification, do not apply Heat Infliction but instead consume the Arts Reaction to fire an additional shot that deals massive Heat DMG.',
      combo: 'Triggered when an Arts Infliction is applied to an enemy. Throws a frag grenade at the target\'s location that explodes upon hitting the ground, dealing Heat DMG and Heat Infliction to nearby enemies.',
      ultimate: 'Fires a rapid barrage of shots and unleashes the Wolven Fury to attack nearby enemies, dealing 5 hits of Heat DMG and forcibly applying Combustion.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Whenever Wulfgard applies Combustion, he gains Scorching Fangs for 10s. This effect cannot stack. Scorching Fangs: While active, Heat DMG Dealt +20%.',
        'Whenever Wulfgard applies Combustion, he gains Scorching Fangs for 10s. This effect cannot stack. Scorching Fangs: While active, Heat DMG Dealt +30%.',
        'Whenever Wulfgard applies Combustion, he gains Scorching Fangs for 10s. This effect cannot stack. Scorching Fangs: While active, Heat DMG Dealt +30%.',
      ],
      2: [
        'Whenever the battle skill Thermite Tracers successfully consumes an Arts Reaction, return 5 SP.',
        'Whenever the battle skill Thermite Tracers successfully consumes an Arts Reaction, return 10 SP.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Lone Wolf: Strength +15, Agility +15.',
      'Firearm Mods: Code of Restraint improved — returns 10 additional SP.',
      'Hunting Hour: While Scorching Fangs is active, triggering additional effects resets duration and grants teammates Scorching Fangs at 50% effectiveness.',
      'Will of the Pack: Ultimate Energy cost -15%.',
      'Natural Predator: Casting ultimate immediately resets the cooldown of Frag Grenade B.',
    ];
  }
}
