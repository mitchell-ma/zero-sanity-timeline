import { StatType, WeaponSkillType } from "../../consts/enums";
import { NamedEffectGroup, WeaponSkill } from "./weaponSkill";

const BRUTALITY_DISCIPLINARIAN: readonly number[] = [];
// Twilight: Blazing Wail — triggers after wielder uses ultimate; lasts 20s
const TWILIGHT_BLAZING_WAIL_HEAT_DMG_BONUS: readonly number[] = [
  0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448,
];
const TWILIGHT_BLAZING_WAIL_BASIC_ATK_DMG_BONUS: readonly number[] = [
  0.75, 0.9, 1.05, 1.2, 1.35, 1.5, 1.65, 1.8, 2.1,
];
const TWILIGHT_BLAZING_WAIL_DURATION_SECONDS = 20;
const TWILIGHT_AZURE_CLOUDS: readonly number[] = [];
const INFLICTION_WHITE_NIGHT_NOVA: readonly number[] = [];
// Flow: Reincarnation — triggers on SP recovery, once per 0.1s, max 5 stacks
const FLOW_REINCARNATION_PHYSICAL_DMG_BONUS: readonly number[] = [
  0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448,
];
const FLOW_REINCARNATION_WIELDER_ATK_BONUS: readonly number[] = [
  0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14,
];
const FLOW_REINCARNATION_TEAM_ATK_BONUS: readonly number[] = [
  0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06, 0.07,
];
const FLOW_REINCARNATION_DURATION_SECONDS = 30;
const INFLICTION_LONG_TIME_WISH: readonly number[] = [];
// Flow: Thermal Release — activates after wielder's skill recovers SP or grants Link state; max 2 stacks, 20s
const FLOW_THERMAL_RELEASE_WIELDER_ATK_BONUS: readonly number[] = [
  0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.28,
];
const FLOW_THERMAL_RELEASE_TEAM_ATK_BONUS: readonly number[] = [
  0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14,
];
const FLOW_THERMAL_RELEASE_DURATION_SECONDS = 20;
const FLOW_THERMAL_RELEASE_MAX_STACKS = 2;
const INFLICTION_COVETOUS_BUILDUP: readonly number[] = [];
const COMBATIVE_ANTHEM_OF_CINDER: readonly number[] = [];
const INSPIRING_BACK_TO_THE_BROKEN_CITY: readonly number[] = [];
const TWILIGHT_IMPOSING_PEAK: readonly number[] = [];
// Flow: Unbridled Edge — triggers on SP recovery from skill; secondary attr bonus (passive)
// + team Heat/Electric DMG bonus (triggered), 20s, max 3 stacks
const FLOW_UNBRIDLED_EDGE_SECONDARY_ATTR_BONUS: readonly number[] = [
  0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.14,
];
const FLOW_UNBRIDLED_EDGE_HEAT_ELECTRIC_DMG_BONUS: readonly number[] = [
  0.03, 0.036, 0.042, 0.048, 0.054, 0.06, 0.066, 0.072, 0.084,
];
const FLOW_UNBRIDLED_EDGE_DURATION_SECONDS = 20;
const FLOW_UNBRIDLED_EDGE_MAX_STACKS = 3;
const FLOW_UNBRIDLED_EDGE: readonly number[] = FLOW_UNBRIDLED_EDGE_SECONDARY_ATTR_BONUS;
const INFLICTION_SINCERE_INTERROGATION: readonly number[] = [];
const SUPPRESSION_FIN_CHASERS_INTENT: readonly number[] = [];
const PURSUIT_UNENDING_CYCLE: readonly number[] = [];
const SUPPRESSION_EMERGENCY_BOOST: readonly number[] = [];
const ASSAULT_ARMAMENT_PREP: readonly number[] = [
  12, 14.4, 16.8, 19.2, 21.6, 24, 26.4, 28.8, 33.6,
];

export class BrutalityDisciplinarian extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.BRUTALITY_DISCIPLINARIAN, level,
      description: 'After consuming Vulnerability stacks, wielder gains ATK bonus scaling with consumed stacks for 20s. Team gets half. Does not stack.',
    });
  }
  getValue(): number {
    return BRUTALITY_DISCIPLINARIAN[this.level - 1] ?? 0;
  }
}

export class TwilightBlazingWail extends WeaponSkill {
  static readonly DURATION_SECONDS = TWILIGHT_BLAZING_WAIL_DURATION_SECONDS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_BLAZING_WAIL, level,
      description: 'When the wielder casts an ultimate, gains Basic ATK DMG Dealt and Heat DMG Dealt bonus for 20s. Does not stack.',
    });
  }

  /** Heat DMG bonus per stack. */
  getValue(): number {
    return TWILIGHT_BLAZING_WAIL_HEAT_DMG_BONUS[this.level - 1] ?? 0;
  }

  /** Basic Attack DMG bonus post-ultimate. */
  getBasicAtkDmgBonus(): number {
    return TWILIGHT_BLAZING_WAIL_BASIC_ATK_DMG_BONUS[this.level - 1] ?? 0;
  }

  getPassiveStats(): Partial<Record<StatType, number>> {
    return { [StatType.HEAT_DAMAGE_BONUS]: this.getValue() };
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [{
      stats: [
        { stat: StatType.BASIC_ATTACK_DAMAGE_BONUS, value: this.getBasicAtkDmgBonus() },
        { stat: StatType.HEAT_DAMAGE_BONUS, value: this.getValue() },
      ],
    }];
  }
}

export class TwilightAzureClouds extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_AZURE_CLOUDS, level,
      description: 'Battle skills and ultimates gain Physical DMG Dealt bonus. Against Staggered enemies, gains additional Physical DMG Dealt bonus.',
    });
  }
  getValue(): number {
    return TWILIGHT_AZURE_CLOUDS[this.level - 1] ?? 0;
  }
}

export class InflictionWhiteNightNova extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_WHITE_NIGHT_NOVA,
      level,
      description: 'After applying Combustion or Electrification, wielder gains Arts DMG Dealt and Arts Intensity bonus for 15s. Does not stack.',
    });
  }
  getValue(): number {
    return INFLICTION_WHITE_NIGHT_NOVA[this.level - 1] ?? 0;
  }
}

export class FlowReincarnation extends WeaponSkill {
  static readonly TRIGGER_INTERVAL_SECONDS = 0.1;
  static readonly MAX_STACKS = 5;
  static readonly DURATION_SECONDS = FLOW_REINCARNATION_DURATION_SECONDS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.FLOW_REINCARNATION, level,
      description: "After the wielder's skill recovers SP, wielder gains Physical DMG Dealt bonus and team gains ATK bonus for 30s. Max 5 stacks, duration counted separately.",
    });
  }

  /** Physical DMG bonus applied per stack. */
  getValue(): number {
    return FLOW_REINCARNATION_PHYSICAL_DMG_BONUS[this.level - 1] ?? 0;
  }

  /** ATK bonus granted to the wielder per stack. */
  getWielderAtkBonus(): number {
    return FLOW_REINCARNATION_WIELDER_ATK_BONUS[this.level - 1] ?? 0;
  }

  /** ATK bonus granted to the rest of the team per stack. */
  getTeamAtkBonus(): number {
    return FLOW_REINCARNATION_TEAM_ATK_BONUS[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [
      { stats: [{ stat: StatType.PHYSICAL_DAMAGE_BONUS, value: this.getValue() }] },
      { stats: [{ stat: StatType.ATTACK_BONUS, value: this.getTeamAtkBonus() }] },
    ];
  }
}

export class InflictionLongTimeWish extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_LONG_TIME_WISH,
      level,
      description: 'When applying Originium Crystals or Solidification, during the next battle skill or ultimate within 20s, wielder gains Physical DMG Dealt bonus. Does not stack.',
    });
  }
  getValue(): number {
    return INFLICTION_LONG_TIME_WISH[this.level - 1] ?? 0;
  }
}

export class FlowThermalRelease extends WeaponSkill {
  static readonly DURATION_SECONDS = FLOW_THERMAL_RELEASE_DURATION_SECONDS;
  static readonly MAX_STACKS = FLOW_THERMAL_RELEASE_MAX_STACKS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.FLOW_THERMAL_RELEASE, level,
      description: "After the wielder's skill recovers SP or grants Link state, wielder and team gain ATK bonus for 20s. Max 2 stacks.",
    });
  }

  /** ATK bonus granted to the wielder per stack. */
  getValue(): number {
    return FLOW_THERMAL_RELEASE_WIELDER_ATK_BONUS[this.level - 1] ?? 0;
  }

  /** ATK bonus granted to the rest of the team per stack. */
  getTeamAtkBonus(): number {
    return FLOW_THERMAL_RELEASE_TEAM_ATK_BONUS[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [
      { stats: [{ stat: StatType.ATTACK_BONUS, value: this.getValue() }] },
      { stats: [{ stat: StatType.ATTACK_BONUS, value: this.getTeamAtkBonus() }] },
    ];
  }
}

export class InflictionCovetousBuildup extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_COVETOUS_BUILDUP,
      level,
      description: 'When Combustion or Corrosion is applied, wielder gains Heat DMG, Nature DMG, and ATK bonus for 20s. Max 2 stacks.',
    });
  }
  getValue(): number {
    return INFLICTION_COVETOUS_BUILDUP[this.level - 1] ?? 0;
  }
}

export class CombativeAnthemOfCinder extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.COMBATIVE_ANTHEM_OF_CINDER,
      level,
      description: 'When applying a Physical Status, wielder gains ATK bonus for 20s. Max 2 stacks.',
    });
  }
  getValue(): number {
    return COMBATIVE_ANTHEM_OF_CINDER[this.level - 1] ?? 0;
  }
}

export class InspiringBackToTheBrokenCity extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INSPIRING_BACK_TO_THE_BROKEN_CITY,
      level,
      description: 'ATK bonus and Arts Intensity bonus (passive).',
    });
  }
  getValue(): number {
    return INSPIRING_BACK_TO_THE_BROKEN_CITY[this.level - 1] ?? 0;
  }
}

export class TwilightImposingPeak extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_IMPOSING_PEAK, level,
      description: 'After applying Lifted, during the next ultimate within 30s, wielder gains Physical DMG Dealt bonus. Max 3 stacks, duration counted separately.',
    });
  }
  getValue(): number {
    return TWILIGHT_IMPOSING_PEAK[this.level - 1] ?? 0;
  }
}

export class FlowUnbridledEdge extends WeaponSkill {
  static readonly DURATION_SECONDS = FLOW_UNBRIDLED_EDGE_DURATION_SECONDS;
  static readonly MAX_STACKS = FLOW_UNBRIDLED_EDGE_MAX_STACKS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.FLOW_UNBRIDLED_EDGE, level,
      description: "Secondary attribute bonus (passive). After the wielder's skill recovers SP, team gains Heat and Electric DMG Dealt bonus for 20s. Max 3 stacks.",
    });
  }

  /** Secondary attribute bonus (passive). */
  getValue(): number {
    return FLOW_UNBRIDLED_EDGE[this.level - 1] ?? 0;
  }

  /** Heat/Electric DMG bonus per stack (triggered). */
  getElementDmgBonus(): number {
    return FLOW_UNBRIDLED_EDGE_HEAT_ELECTRIC_DMG_BONUS[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [{
      stats: [
        { stat: StatType.HEAT_DAMAGE_BONUS, value: this.getElementDmgBonus() },
        { stat: StatType.ELECTRIC_DAMAGE_BONUS, value: this.getElementDmgBonus() },
      ],
    }];
  }
}

export class InflictionSincereInterrogation extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_SINCERE_INTERROGATION,
      level,
      description: 'After consuming an Arts Reaction, wielder gains ATK bonus for 20s. Max 2 stacks, duration counted separately.',
    });
  }
  getValue(): number {
    return INFLICTION_SINCERE_INTERROGATION[this.level - 1] ?? 0;
  }
}

export class SuppressionFinChasersIntent extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.SUPPRESSION_FIN_CHASERS_INTENT,
      level,
      description: "When battle skill applies Solidification, enemy suffers Cryo DMG Taken bonus for 15s. Does not stack.",
    });
  }
  getValue(): number {
    return SUPPRESSION_FIN_CHASERS_INTENT[this.level - 1] ?? 0;
  }
}

export class PursuitUnendingCycle extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.PURSUIT_UNENDING_CYCLE, level,
      description: 'When casting a combo skill, wielder gains ATK bonus for 20s. Does not stack.',
    });
  }
  getValue(): number {
    return PURSUIT_UNENDING_CYCLE[this.level - 1] ?? 0;
  }
}

export class SuppressionEmergencyBoost extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.SUPPRESSION_EMERGENCY_BOOST,
      level,
      description: 'When battle skill hits enemy, wielder gains ATK bonus for 20s. Does not stack.',
    });
  }
  getValue(): number {
    return SUPPRESSION_EMERGENCY_BOOST[this.level - 1] ?? 0;
  }
}

export class AssaultArmamentPrep extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ASSAULT_ARMAMENT_PREP, level,
      description: 'Flat ATK bonus (passive).',
    });
  }
  /** Flat ATK bonus value. */
  getValue(): number {
    return ASSAULT_ARMAMENT_PREP[this.level - 1] ?? 0;
  }
  getPassiveStats(): Partial<Record<StatType, number>> {
    return { [StatType.ATTACK]: this.getValue() };
  }
}

// Twilight: Lustrous Pyre — grants Max HP bonus and ATK to allies with differing elements after ultimate; 20s
const TWILIGHT_LUSTROUS_PYRE_MAX_HP_BONUS: readonly number[] = [
  0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.28,
];
const TWILIGHT_LUSTROUS_PYRE_ULT_ATK_BONUS: readonly number[] = [
  0.08, 0.096, 0.112, 0.128, 0.144, 0.16, 0.176, 0.192, 0.224,
];
const TWILIGHT_LUSTROUS_PYRE_DURATION_SECONDS = 20;

export class TwilightLustrousPyre extends WeaponSkill {
  static readonly DURATION_SECONDS = TWILIGHT_LUSTROUS_PYRE_DURATION_SECONDS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_LUSTROUS_PYRE, level,
      description: 'Max HP bonus (passive). When the wielder casts an ultimate, operators with differing elements gain ATK bonus for 20s. Does not stack.',
    });
  }

  /** Max HP bonus granted. */
  getValue(): number {
    return TWILIGHT_LUSTROUS_PYRE_MAX_HP_BONUS[this.level - 1] ?? 0;
  }

  /** ATK bonus granted to allies with differing elements after ultimate. */
  getUltAtkBonus(): number {
    return TWILIGHT_LUSTROUS_PYRE_ULT_ATK_BONUS[this.level - 1] ?? 0;
  }

  getPassiveStats(): Partial<Record<StatType, number>> {
    return { [StatType.HP_BONUS]: this.getValue() };
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [{
      stats: [{ stat: StatType.ATTACK_BONUS, value: this.getUltAtkBonus() }],
    }];
  }
}

// Infliction: Vicious Purge — boosts Arts DMG and enemy Arts DMG taken; 15s duration, 25s cooldown
const INFLICTION_VICIOUS_PURGE_ARTS_DMG_BONUS: readonly number[] = [
  0.12, 0.144, 0.168, 0.192, 0.216, 0.24, 0.264, 0.288, 0.336,
];
const INFLICTION_VICIOUS_PURGE_ENEMY_ARTS_DMG_TAKEN: readonly number[] = [
  0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.28,
];
const INFLICTION_VICIOUS_PURGE_DURATION_SECONDS = 15;
const INFLICTION_VICIOUS_PURGE_COOLDOWN_SECONDS = 25;

export class InflictionViciousPurge extends WeaponSkill {
  static readonly DURATION_SECONDS = INFLICTION_VICIOUS_PURGE_DURATION_SECONDS;
  static readonly COOLDOWN_SECONDS = INFLICTION_VICIOUS_PURGE_COOLDOWN_SECONDS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.INFLICTION_VICIOUS_PURGE, level,
      description: 'After consuming an Arts Reaction, wielder gains Arts DMG Dealt bonus and enemy suffers Arts DMG Taken increase for 15s. 25s cooldown.',
    });
  }

  /** Arts DMG bonus granted to the wielder. */
  getValue(): number {
    return INFLICTION_VICIOUS_PURGE_ARTS_DMG_BONUS[this.level - 1] ?? 0;
  }

  /** Increase to Arts DMG taken by the enemy. */
  getEnemyArtsDmgTaken(): number {
    return INFLICTION_VICIOUS_PURGE_ENEMY_ARTS_DMG_TAKEN[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [
      { stats: [{ stat: StatType.ARTS_DAMAGE_BONUS, value: this.getValue() }] },
      { stats: [{ stat: StatType.ARTS_DAMAGE_BONUS, value: this.getEnemyArtsDmgTaken() }] },
    ];
  }
}

// ── Stub named skills (data arrays empty — to be filled when wiki data is available) ──

export class CrusherPrincelyDeterrence extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.CRUSHER_PRINCELY_DETERRENCE, level,
    description: 'On Final Strike, wielder gains ATK and Stagger Efficiency bonus for 8s. ATK doubled when controlled. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class CrusherHonedIntoLegion extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.CRUSHER_HONED_INTO_LEGION, level,
    description: 'On Final Strike, wielder gains ATK bonus for 10s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class SuppressionStackedHew extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.SUPPRESSION_STACKED_HEW, level,
    description: 'When battle skill or ultimate hits enemy, wielder gains Physical DMG Dealt bonus for 30s. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return 0; }
}
export class SuppressionAstrophysics extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.SUPPRESSION_ASTROPHYSICS, level,
    description: 'When casting battle skill or combo skill, wielder gains Arts DMG Dealt bonus for 15s. The two effects apply separately and do not stack with themselves.',
  }); }
  getValue(): number { return 0; }
}
export class SuppressionConcentricCircles extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.SUPPRESSION_CONCENTRIC_CIRCLES, level,
    description: 'When casting combo skill, during the next battle skill within 30s, wielder gains Combo Skill DMG and Electric DMG bonus. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return 0; }
}
export class CombativeVirtuousGain extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.COMBATIVE_VIRTUOUS_GAIN, level,
    description: 'After applying Physical Status, wielder deals additional Physical DMG hit and gains ATK bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class BrutalityCementedFury extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.BRUTALITY_CEMENTED_FURY, level,
    description: 'When applying Vulnerability to 0-stack enemy, wielder gains ATK and Crit Rate bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class BrutalityLandsOfYore extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.BRUTALITY_LANDS_OF_YORE, level,
    description: 'After consuming Vulnerability stacks, wielder gains Physical DMG Dealt bonus scaling with consumed stacks for 20s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class DetonateBonechilling extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.DETONATE_BONECHILLING, level,
    description: 'When battle skill applies Cryo Infliction, wielder gains Cryo DMG Dealt bonus for 15s. Combo on Cryo-inflicted enemy doubles the bonus. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class DetonateSeekerOfTheEsoteric extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.DETONATE_SEEKER_OF_THE_ESOTERIC, level,
    description: 'When applying Arts Burst, wielder gains ATK bonus for 30s. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return 0; }
}
export class DetonateImposingChampion extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.DETONATE_IMPOSING_CHAMPION, level,
    description: 'When applying Arts Burst, wielder gains secondary attribute bonus and enemy suffers Arts DMG Taken increase for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class EfficacyTenaciousWill extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.EFFICACY_TENACIOUS_WILL, level,
    description: 'When applying Knocked Down or Weakened, wielder gains DEF bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class FractureArtzyExaggeration extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.FRACTURE_ARTZY_EXAGGERATION, level,
    description: 'After scoring a critical hit with battle or combo skill, wielder gains Cryo DMG Dealt bonus for 30s. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return 0; }
}
export class PursuitAidFromThePast extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.PURSUIT_AID_FROM_THE_PAST, level,
    description: 'When combo skill applies Arts Burst or Combustion, wielder gains Battle Skill DMG and ATK bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class PursuitDutyFulfilled extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.PURSUIT_DUTY_FULFILLED, level,
    description: 'After combo skill applies Lifted, team gains Arts DMG and Nature DMG Dealt bonus for 15s. Additional Arts DMG per enemy Lifted. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class PursuitTranscendentArts extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.PURSUIT_TRANSCENDENT_ARTS, level,
    description: 'When combo skill applies Arts Burst or Physical Status, team gains Heat and Electric DMG Dealt bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class InflictionRoadHomeForAllLife extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INFLICTION_ROAD_HOME_FOR_ALL_LIFE, level,
    description: 'When applying an Arts Reaction, wielder gains ATK bonus for 20s. Max 2 stacks, duration counted separately.',
  }); }
  getValue(): number { return 0; }
}
export class InflictionWildernessCluster extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INFLICTION_WILDERNESS_CLUSTER, level,
    description: 'When applying Electrification, team gains Physical and Electric DMG Dealt bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class InflictionWedgeOfCivilization extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INFLICTION_WEDGE_OF_CIVILIZATION, level,
    description: 'When casting battle skill, wielder gains Arts DMG Dealt bonus for 15s. If battle skill applies Arts Reaction, bonus doubles. Does not stack with itself.',
  }); }
  getValue(): number { return 0; }
}
export class InflictionConquestOfIcyPeaks extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INFLICTION_CONQUEST_OF_ICY_PEAKS, level,
    description: 'Against enemies with Cryo Infliction or Solidification, wielder gains Cryo DMG bonus. After consuming Solidification, wielder gains ATK bonus for 15s.',
  }); }
  getValue(): number { return 0; }
}
export class TwilightHumiliation extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.TWILIGHT_HUMILIATION, level,
    description: 'When casting ultimate or combo skill, wielder gains Arts DMG Dealt bonus for 15s. Ultimate grants double bonus. The two effects apply separately.',
  }); }
  getValue(): number { return 0; }
}
export class MedicantBlightFervor extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.MEDICANT_BLIGHT_FERVOR, level,
    description: 'After skill provides HP treatment, team gains ATK bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class MedicantEyeOfTalos extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.MEDICANT_EYE_OF_TALOS, level,
    description: "After combo skill provides HP treatment, controlled operator gains Shield based on wielder's Max HP for 15s. 15s cooldown.",
  }); }
  getValue(): number { return 0; }
}
export class MedicantRedemptionOfFaith extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.MEDICANT_REDEMPTION_OF_FAITH, level,
    description: 'When battle skill provides HP treatment, controlled operator is restored for additional HP. 15s cooldown.',
  }); }
  getValue(): number { return 0; }
}
export class MincingTherapy extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.MINCING_THERAPY, level,
    description: "After a Protected operator takes DMG, wielder restores that operator's HP. 15s cooldown.",
  }); }
  getValue(): number { return 0; }
}
export class MedicantGloryOfKnighthood extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.MEDICANT_GLORY_OF_KNIGHTHOOD, level,
    description: 'Secondary attribute bonus and Combo Skill HP Treatment enhancement (passive).',
  }); }
  getValue(): number { return 0; }
}
export class WeightOfMountain extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.WEIGHT_OF_MOUNTAIN, level,
    description: 'Against vulnerable enemies, DMG Dealt increases. When battle skill applies Vulnerability or Physical Susceptibility, all attributes increase for 15s. Effects apply separately.',
  }); }
  getValue(): number { return 0; }
}
export class InspiringStartOfASaga extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INSPIRING_START_OF_A_SAGA, level,
    description: 'When wielder HP is above 80%, gains ATK bonus (passive conditional).',
  }); }
  getValue(): number { return 0; }
}
export class InflictionLoneAndDistantSail extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INFLICTION_LONE_AND_DISTANT_SAIL, level,
    description: 'When Solidification or Corrosion is applied, wielder gains Cryo DMG, Nature DMG, and Crit Rate bonus for 15s. Self-triggered doubles bonuses. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class DetonateRapidStrike extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.DETONATE_RAPID_STRIKE, level,
    description: 'After consuming Arts Infliction, wielder gains Nature DMG bonus for 20s. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class SuppressionTilliteEtchings extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.SUPPRESSION_TILLITE_ETCHINGS, level,
    description: 'When battle skill applies Nature Infliction, other operators gain Arts DMG Dealt bonus for 15s. Stacking bonus per enemy with Nature Infliction. Does not stack.',
  }); }
  getValue(): number { return 0; }
}
export class InspiringMortiseAndTenonAnalysis extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: WeaponSkillType.INSPIRING_MORTISE_AND_TENON_ANALYSIS, level,
    description: 'Main attribute bonus and Arts Intensity bonus (passive).',
  }); }
  getValue(): number { return 0; }
}

// Infliction: Tidal Murmurs — secondary attribute bonus; increases Arts DMG taken after Corrosion consumption; 25s
const INFLICTION_TIDAL_MURMURS_SECONDARY_ATTR_BONUS: readonly number[] = [
  0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448,
];
const INFLICTION_TIDAL_MURMURS_ENEMY_ARTS_DMG_TAKEN: readonly number[] = [
  0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.28,
];
const INFLICTION_TIDAL_MURMURS_DURATION_SECONDS = 25;

export class InflictionTidalMurmurs extends WeaponSkill {
  static readonly DURATION_SECONDS = INFLICTION_TIDAL_MURMURS_DURATION_SECONDS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.INFLICTION_TIDAL_MURMURS, level,
      description: 'After consuming Corrosion, wielder gains secondary attribute bonus and enemy suffers Arts DMG Taken increase for 25s. Does not stack.',
    });
  }

  /** Secondary attribute bonus. */
  getValue(): number {
    return INFLICTION_TIDAL_MURMURS_SECONDARY_ATTR_BONUS[this.level - 1] ?? 0;
  }

  /** Increase to Arts DMG taken by the enemy (after Corrosion consumption). */
  getEnemyArtsDmgTaken(): number {
    return INFLICTION_TIDAL_MURMURS_ENEMY_ARTS_DMG_TAKEN[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [
      { stats: [{ stat: StatType.WILL_BONUS, value: this.getValue() }] },
      { stats: [{ stat: StatType.ARTS_DAMAGE_BONUS, value: this.getEnemyArtsDmgTaken() }] },
    ];
  }
}
