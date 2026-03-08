import { WeaponSkillType } from "../enums";
import { WeaponSkill } from "./weaponSkill";

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
const FLOW_UNBRIDLED_EDGE: readonly number[] = [];
const INFLICTION_SINCERE_INTERROGATION: readonly number[] = [];
const SUPPRESSION_FIN_CHASERS_INTENT: readonly number[] = [];
const PURSUIT_UNENDING_CYCLE: readonly number[] = [];
const SUPPRESSION_EMERGENCY_BOOST: readonly number[] = [];
const ASSAULT_ARMAMENT_PREP: readonly number[] = [];

export class BrutalityDisciplinarian extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.BRUTALITY_DISCIPLINARIAN, level });
  }
  getValue(): number {
    return BRUTALITY_DISCIPLINARIAN[this.level - 1] ?? 0;
  }
}

export class TwilightBlazingWail extends WeaponSkill {
  static readonly DURATION_SECONDS = TWILIGHT_BLAZING_WAIL_DURATION_SECONDS;

  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_BLAZING_WAIL, level });
  }

  /** Heat DMG bonus per stack. */
  getValue(): number {
    return TWILIGHT_BLAZING_WAIL_HEAT_DMG_BONUS[this.level - 1] ?? 0;
  }

  /** Basic Attack DMG bonus post-ultimate. */
  getBasicAtkDmgBonus(): number {
    return TWILIGHT_BLAZING_WAIL_BASIC_ATK_DMG_BONUS[this.level - 1] ?? 0;
  }
}

export class TwilightAzureClouds extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_AZURE_CLOUDS, level });
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
    super({ weaponSkillType: WeaponSkillType.FLOW_REINCARNATION, level });
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
}

export class InflictionLongTimeWish extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_LONG_TIME_WISH,
      level,
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
    super({ weaponSkillType: WeaponSkillType.FLOW_THERMAL_RELEASE, level });
  }

  /** ATK bonus granted to the wielder per stack. */
  getValue(): number {
    return FLOW_THERMAL_RELEASE_WIELDER_ATK_BONUS[this.level - 1] ?? 0;
  }

  /** ATK bonus granted to the rest of the team per stack. */
  getTeamAtkBonus(): number {
    return FLOW_THERMAL_RELEASE_TEAM_ATK_BONUS[this.level - 1] ?? 0;
  }
}

export class InflictionCovetousBuildup extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_COVETOUS_BUILDUP,
      level,
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
    });
  }
  getValue(): number {
    return INSPIRING_BACK_TO_THE_BROKEN_CITY[this.level - 1] ?? 0;
  }
}

export class TwilightImposingPeak extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_IMPOSING_PEAK, level });
  }
  getValue(): number {
    return TWILIGHT_IMPOSING_PEAK[this.level - 1] ?? 0;
  }
}

export class FlowUnbridledEdge extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.FLOW_UNBRIDLED_EDGE, level });
  }
  getValue(): number {
    return FLOW_UNBRIDLED_EDGE[this.level - 1] ?? 0;
  }
}

export class InflictionSincereInterrogation extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: WeaponSkillType.INFLICTION_SINCERE_INTERROGATION,
      level,
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
    });
  }
  getValue(): number {
    return SUPPRESSION_FIN_CHASERS_INTENT[this.level - 1] ?? 0;
  }
}

export class PursuitUnendingCycle extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.PURSUIT_UNENDING_CYCLE, level });
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
    });
  }
  getValue(): number {
    return SUPPRESSION_EMERGENCY_BOOST[this.level - 1] ?? 0;
  }
}

export class AssaultArmamentPrep extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: WeaponSkillType.ASSAULT_ARMAMENT_PREP, level });
  }
  getValue(): number {
    return ASSAULT_ARMAMENT_PREP[this.level - 1] ?? 0;
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
    super({ weaponSkillType: WeaponSkillType.TWILIGHT_LUSTROUS_PYRE, level });
  }

  /** Max HP bonus granted. */
  getValue(): number {
    return TWILIGHT_LUSTROUS_PYRE_MAX_HP_BONUS[this.level - 1] ?? 0;
  }

  /** ATK bonus granted to allies with differing elements after ultimate. */
  getUltAtkBonus(): number {
    return TWILIGHT_LUSTROUS_PYRE_ULT_ATK_BONUS[this.level - 1] ?? 0;
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
    super({ weaponSkillType: WeaponSkillType.INFLICTION_VICIOUS_PURGE, level });
  }

  /** Arts DMG bonus granted to the wielder. */
  getValue(): number {
    return INFLICTION_VICIOUS_PURGE_ARTS_DMG_BONUS[this.level - 1] ?? 0;
  }

  /** Increase to Arts DMG taken by the enemy. */
  getEnemyArtsDmgTaken(): number {
    return INFLICTION_VICIOUS_PURGE_ENEMY_ARTS_DMG_TAKEN[this.level - 1] ?? 0;
  }
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
    super({ weaponSkillType: WeaponSkillType.INFLICTION_TIDAL_MURMURS, level });
  }

  /** Secondary attribute bonus. */
  getValue(): number {
    return INFLICTION_TIDAL_MURMURS_SECONDARY_ATTR_BONUS[this.level - 1] ?? 0;
  }

  /** Increase to Arts DMG taken by the enemy (after Corrosion consumption). */
  getEnemyArtsDmgTaken(): number {
    return INFLICTION_TIDAL_MURMURS_ENEMY_ARTS_DMG_TAKEN[this.level - 1] ?? 0;
  }
}
