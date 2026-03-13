import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import {
  RockyWhispers,
  DollyRush,
  EruptionColumn,
  WoolyParty,
} from "../combat-skills/ardeliaSkills";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BaseStats, Operator } from "./operator";

const RARITY: OperatorRarity = 6;

/** Ardelia's base attribute scores at lv1 and lv90. */
const BASE_STATS: BaseStats = {
  lv1: {
    [StatType.ATTACK]: 30,
    [StatType.STRENGTH]: 9,
    [StatType.AGILITY]: 9,
    [StatType.INTELLECT]: 20,
    [StatType.WILL]: 15,
  },
  lv90: {
    [StatType.ATTACK]: 323,
    [StatType.STRENGTH]: 112,
    [StatType.AGILITY]: 93,
    [StatType.INTELLECT]: 145,
    [StatType.WILL]: 118,
  },
};

export class ArdeliaOperator extends Operator {
  static readonly ELEMENT = ElementType.NATURE;
  static readonly OPERATOR_CLASS = OperatorClassType.SUPPORTER;
  static readonly WEAPON_TYPES = [WeaponType.ARTS_UNIT];
  static readonly OPERATOR_RARITY = RARITY;
  static readonly MAIN_ATTRIBUTE_TYPE = StatType.INTELLECT;
  static readonly SECONDARY_ATTRIBUTE_TYPE = StatType.WILL;
  static readonly MAX_TALENT_ONE_LEVEL = 3;
  static readonly MAX_TALENT_TWO_LEVEL = 3;

  readonly basicAttack: RockyWhispers;
  readonly battleSkill: DollyRush;
  readonly comboSkill: EruptionColumn;
  readonly ultimate: WoolyParty;

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
      name: "Ardelia",
      element: ArdeliaOperator.ELEMENT,
      operatorClass: ArdeliaOperator.OPERATOR_CLASS,
      weaponTypes: ArdeliaOperator.WEAPON_TYPES,
      operatorRarity: ArdeliaOperator.OPERATOR_RARITY,
      mainAttributeType: ArdeliaOperator.MAIN_ATTRIBUTE_TYPE,
      secondaryAttributeType: ArdeliaOperator.SECONDARY_ATTRIBUTE_TYPE,
      maxTalentOneLevel: ArdeliaOperator.MAX_TALENT_ONE_LEVEL,
      maxTalentTwoLevel: ArdeliaOperator.MAX_TALENT_TWO_LEVEL,
      talentOneName: 'Friendly Presence',
      talentTwoName: 'Mountainpeak Surfer',
      attributeIncreaseName: 'Keen Mind',
      attributeIncreaseAttribute: StatType.INTELLECT,
      baseStats: BASE_STATS,
      ...params,
    });

    this.basicAttack = new RockyWhispers({
      level: params.basicAttackLevel,
      operatorPotential: params.potential,
    });
    this.battleSkill = new DollyRush({
      level: params.battleSkillLevel,
      operatorPotential: params.potential,
    });
    this.comboSkill = new EruptionColumn({
      level: params.comboSkillLevel,
      operatorPotential: params.potential,
    });
    this.ultimate = new WoolyParty({
      level: params.ultimateLevel,
      operatorPotential: params.potential,
    });
  }

  get comboRequires(): TriggerConditionType[] {
    return [TriggerConditionType.FINAL_STRIKE];
  }
  get comboDescription(): string { return 'Final Strike on enemy with no Vulnerability or Arts Infliction'; }
  get comboForbidsActiveColumns(): string[] { return ['vulnerableInfliction', 'heatInfliction', 'cryoInfliction', 'natureInfliction', 'electricInfliction']; }
  get derivedEnemyColumns(): string[] { return ['enemy-susceptibility']; }

  get skillDescriptions() {
    return {
      basic: 'An attack with up to 4 sequences that deals Nature DMG. As the controlled operator, Final Strike also deals 18 Stagger. Dive Attack: Basic attack performed in mid-air becomes a dive attack that deals Nature DMG to nearby enemies. Finisher: Basic attack performed near a Staggered enemy becomes a finisher that deals massive Nature DMG and recovers some SP.',
      battle: 'Hops on Mr. Dolly and rams the target to deal Nature DMG. If the target has Corrosion, then consume the Corrosion and apply Physical Susceptibility and Arts Susceptibility to the target.',
      combo: 'Launches a homing Volcanic Cloud at a target enemy that deals Nature DMG when close enough. The Volcanic Cloud explodes after a short delay, dealing half of the Nature DMG and forcibly applying temporary Corrosion to nearby enemies.',
      ultimate: 'Ardelia enters a mobile channeling state and summons the aid of Mr. Dolly. Multiple copies are thrown in random directions. Each copy deals Nature DMG when hitting the enemy. Each enemy can only take 1 damaging hit every 0.3s.',
    };
  }

  get talentDescriptions() {
    return {
      1: [
        'Creates 3 Shadows of Mr. Dolly after hitting enemy; 10% chance additional Shadows spawn. Restores HP by [45 + Will x 0.38] on touch; otherwise heals lowest HP teammate. Shadows last 10s, max 10 exist.',
        'Creates 3 Shadows of Mr. Dolly after hitting enemy; 10% chance additional Shadows spawn. Restores HP by [45 + Will x 0.38] on touch; otherwise heals lowest HP teammate. Shadows last 10s, max 10 exist.',
        'Creates 3 Shadows of Mr. Dolly after hitting enemy; 10% chance additional Shadows spawn. Restores HP by [90 + Will x 0.75] on touch; otherwise heals lowest HP teammate. Shadows last 10s, max 10 exist.',
      ],
      2: [
        'Battle skill Dolly Rush improved: Triggering the additional effect while an enemy with Corrosion is nearby immediately casts the battle skill again. Only triggers once per casting.',
      ],
    };
  }

  get potentialDescriptions() {
    return [
      'Dolly Paradise: +8% Physical and Arts Susceptibility when consuming Corrosion.',
      'Game Rewards: Treats another allied operator with lowest HP at half effectiveness.',
      'Explosive Eruption: Duration +1s; Shadow creation chance x1.2.',
      'Rock Blossom: Ultimate Energy cost -15%.',
      'Volcanic Steam: Cooldown -2s; DMG x1.2; Corrosion duration +4s.',
    ];
  }
}
