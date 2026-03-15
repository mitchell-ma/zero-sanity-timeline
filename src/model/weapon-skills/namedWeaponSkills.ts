import { StatType, WeaponSkillType } from "../../consts/enums";
import { NamedEffectGroup, WeaponSkill } from "./weaponSkill";
import { getSkillValues, getConditionalValues, getConditionalScalar } from "../game-data/weaponGameData";

// ── Helper ───────────────────────────────────────────────────────────────────

const sv = getSkillValues;
const cv = getConditionalValues;

function durationSeconds(skillType: string, condIndex = 0): number {
  return getConditionalScalar(skillType, "duration", condIndex)?.value ?? 0;
}
function maxStacks(skillType: string, condIndex = 0): number {
  return getConditionalScalar(skillType, "maxStacks", condIndex) ?? 1;
}

// ── Unique named skills ──────────────────────────────────────────────────────

const S = WeaponSkillType;

export class BrutalityDisciplinarian extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: S.EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN, level,
      description: 'After consuming Vulnerability stacks, wielder gains ATK bonus scaling with consumed stacks for 20s. Team gets half. Does not stack.',
    });
  }
  getValue(): number {
    return sv(S.EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

export class TwilightBlazingWail extends WeaponSkill {
  static readonly DURATION_SECONDS = durationSeconds(S.FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL);

  constructor(level: number) {
    super({ weaponSkillType: S.FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL, level,
      description: 'When the wielder casts an ultimate, gains Basic ATK DMG Dealt and Heat DMG Dealt bonus for 20s. Does not stack.',
    });
  }

  getValue(): number {
    return sv(S.FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL, "HEAT_DAMAGE_BONUS")[this.level - 1] ?? 0;
  }

  getBasicAtkDmgBonus(): number {
    return cv(S.FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL, "BASIC_ATTACK_DAMAGE_BONUS")[this.level - 1] ?? 0;
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
    super({ weaponSkillType: S.RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS, level,
      description: 'Battle skills and ultimates gain Physical DMG Dealt bonus. Against Staggered enemies, gains additional Physical DMG Dealt bonus.',
    });
  }
  getValue(): number {
    return sv(S.RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS, "PHYSICAL_DAMAGE_BONUS")[this.level - 1] ?? 0;
  }
}

export class InflictionWhiteNightNova extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: S.WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA,
      level,
      description: 'After applying Combustion or Electrification, wielder gains Arts DMG Dealt and Arts Intensity bonus for 15s. Does not stack.',
    });
  }
  getValue(): number {
    return sv(S.WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA, "ARTS_DAMAGE_BONUS")[this.level - 1] ?? 0;
  }
}

export class FlowReincarnation extends WeaponSkill {
  static readonly TRIGGER_INTERVAL_SECONDS = 0.1;
  static readonly MAX_STACKS = maxStacks(S.NEVER_REST_FLOW_REINCARNATION);
  static readonly DURATION_SECONDS = durationSeconds(S.NEVER_REST_FLOW_REINCARNATION);

  constructor(level: number) {
    super({ weaponSkillType: S.NEVER_REST_FLOW_REINCARNATION, level,
      description: "After the wielder's skill recovers SP, wielder gains Physical DMG Dealt bonus and team gains ATK bonus for 30s. Max 5 stacks, duration counted separately.",
    });
  }

  getValue(): number {
    return sv(S.NEVER_REST_FLOW_REINCARNATION, "PHYSICAL_DAMAGE_BONUS")[this.level - 1] ?? 0;
  }

  getWielderAtkBonus(): number {
    return cv(S.NEVER_REST_FLOW_REINCARNATION, "phy_dmg_up2")[this.level - 1] ?? 0;
  }

  getTeamAtkBonus(): number {
    return cv(S.NEVER_REST_FLOW_REINCARNATION, "phy_dmg_up3")[this.level - 1] ?? 0;
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
      weaponSkillType: S.GRAND_VISION_INFLICTION_LONG_TIME_WISH,
      level,
      description: 'When applying Originium Crystals or Solidification, during the next battle skill or ultimate within 20s, wielder gains Physical DMG Dealt bonus. Does not stack.',
    });
  }
  getValue(): number {
    return sv(S.GRAND_VISION_INFLICTION_LONG_TIME_WISH, "ARTS_INTENSITY")[this.level - 1] ?? 0;
  }
}

export class FlowThermalRelease extends WeaponSkill {
  static readonly DURATION_SECONDS = durationSeconds(S.THERMITE_CUTTER_FLOW_THERMAL_RELEASE);
  static readonly MAX_STACKS = maxStacks(S.THERMITE_CUTTER_FLOW_THERMAL_RELEASE);

  constructor(level: number) {
    super({ weaponSkillType: S.THERMITE_CUTTER_FLOW_THERMAL_RELEASE, level,
      description: "After the wielder's skill recovers SP or grants Link state, wielder and team gain ATK bonus for 20s. Max 2 stacks.",
    });
  }

  getValue(): number {
    return sv(S.THERMITE_CUTTER_FLOW_THERMAL_RELEASE, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }

  getTeamAtkBonus(): number {
    return cv(S.THERMITE_CUTTER_FLOW_THERMAL_RELEASE, "atk_up2")[this.level - 1] ?? 0;
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
      weaponSkillType: S.UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP,
      level,
      description: 'When Combustion or Corrosion is applied, wielder gains Heat DMG, Nature DMG, and ATK bonus for 20s. Max 2 stacks.',
    });
  }
  getValue(): number {
    return sv(S.UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

export class CombativeAnthemOfCinder extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: S.SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER,
      level,
      description: 'When applying a Physical Status, wielder gains ATK bonus for 20s. Max 2 stacks.',
    });
  }
  getValue(): number {
    return sv(S.SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER, "atk_up1")[this.level - 1] ?? 0;
  }
}

export class InspiringBackToTheBrokenCity extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: S.FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY,
      level,
      description: 'ATK bonus and Arts Intensity bonus (passive).',
    });
  }
  getValue(): number {
    return sv(S.FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

export class TwilightImposingPeak extends WeaponSkill {
  constructor(level: number) {
    super({ weaponSkillType: S.ASPIRANT_TWILIGHT_IMPOSING_PEAK, level,
      description: 'After applying Lifted, during the next ultimate within 30s, wielder gains Physical DMG Dealt bonus. Max 3 stacks, duration counted separately.',
    });
  }
  getValue(): number {
    return sv(S.ASPIRANT_TWILIGHT_IMPOSING_PEAK, "dmg_up")[this.level - 1] ?? 0;
  }
}

export class FlowUnbridledEdge extends WeaponSkill {
  static readonly DURATION_SECONDS = durationSeconds(S.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE);
  static readonly MAX_STACKS = maxStacks(S.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE);

  constructor(level: number) {
    super({ weaponSkillType: S.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE, level,
      description: "Secondary attribute bonus (passive). After the wielder's skill recovers SP, team gains Heat and Electric DMG Dealt bonus for 20s. Max 3 stacks.",
    });
  }

  getValue(): number {
    return sv(S.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE, "SECONDARY_ATTRIBUTE_BONUS")[this.level - 1] ?? 0;
  }

  getElementDmgBonus(): number {
    return cv(S.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE, "dmg_up")[this.level - 1] ?? 0;
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
      weaponSkillType: S.TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION,
      level,
      description: 'After consuming an Arts Reaction, wielder gains ATK bonus for 20s. Max 2 stacks, duration counted separately.',
    });
  }
  getValue(): number {
    return sv(S.TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION, "SECONDARY_ATTRIBUTE_BONUS")[this.level - 1] ?? 0;
  }
}

export class SuppressionFinChasersIntent extends WeaponSkill {
  constructor(level: number) {
    super({
      weaponSkillType: S.FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT,
      level,
      description: "When battle skill applies Solidification, enemy suffers Cryo DMG Taken bonus for 15s. Does not stack.",
    });
  }
  getValue(): number {
    return sv(S.FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

// ── Shared skills (appear on multiple weapons) ──────────────────────────────

export class PursuitUnendingCycle extends WeaponSkill {
  constructor(level: number, type: WeaponSkillType = S.WAVE_TIDE_PURSUIT_UNENDING_CYCLE) {
    super({ weaponSkillType: type, level,
      description: 'When casting a combo skill, wielder gains ATK bonus for 20s. Does not stack.',
    });
  }
  getValue(): number {
    return cv(S.WAVE_TIDE_PURSUIT_UNENDING_CYCLE, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

export class SuppressionEmergencyBoost extends WeaponSkill {
  constructor(level: number, type: WeaponSkillType = S.CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST) {
    super({
      weaponSkillType: type,
      level,
      description: 'When battle skill hits enemy, wielder gains ATK bonus for 20s. Does not stack.',
    });
  }
  getValue(): number {
    return cv(S.CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

export class AssaultArmamentPrep extends WeaponSkill {
  constructor(level: number, type: WeaponSkillType = S.TARR_11_ASSAULT_ARMAMENT_PREP) {
    super({ weaponSkillType: type, level,
      description: 'Flat ATK bonus (passive).',
    });
  }
  getValue(): number {
    return sv(S.TARR_11_ASSAULT_ARMAMENT_PREP, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
  getPassiveStats(): Partial<Record<StatType, number>> {
    return { [StatType.BASE_ATTACK]: this.getValue() };
  }
}

export class InspiringStartOfASaga extends WeaponSkill {
  constructor(level: number, type: WeaponSkillType = S.PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA) {
    super({ weaponSkillType: type, level,
      description: 'When wielder HP is above 80%, gains ATK bonus (passive conditional).',
    });
  }
  getValue(): number {
    return cv(S.PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA, "ATTACK_BONUS")[this.level - 1] ?? 0;
  }
}

// Twilight: Lustrous Pyre
export class TwilightLustrousPyre extends WeaponSkill {
  static readonly DURATION_SECONDS = durationSeconds(S.STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE);

  constructor(level: number) {
    super({ weaponSkillType: S.STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE, level,
      description: 'Max HP bonus (passive). When the wielder casts an ultimate, operators with differing elements gain ATK bonus for 20s. Does not stack.',
    });
  }

  getValue(): number {
    return sv(S.STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE, "HP_BONUS")[this.level - 1] ?? 0;
  }

  getUltAtkBonus(): number {
    return cv(S.STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE, "ATTACK_BONUS")[this.level - 1] ?? 0;
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

// Infliction: Vicious Purge
export class InflictionViciousPurge extends WeaponSkill {
  static readonly DURATION_SECONDS = durationSeconds(S.CLANNIBAL_INFLICTION_VICIOUS_PURGE);
  static readonly COOLDOWN_SECONDS = 25;

  constructor(level: number) {
    super({ weaponSkillType: S.CLANNIBAL_INFLICTION_VICIOUS_PURGE, level,
      description: 'After consuming an Arts Reaction, wielder gains Arts DMG Dealt bonus and enemy suffers Arts DMG Taken increase for 15s. 25s cooldown.',
    });
  }

  getValue(): number {
    return sv(S.CLANNIBAL_INFLICTION_VICIOUS_PURGE, "ARTS_DAMAGE_BONUS")[this.level - 1] ?? 0;
  }

  getEnemyArtsDmgTaken(): number {
    return cv(S.CLANNIBAL_INFLICTION_VICIOUS_PURGE, "dmg_taken_up")[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [
      { stats: [{ stat: StatType.ARTS_DAMAGE_BONUS, value: this.getValue() }] },
      { stats: [{ stat: StatType.ARTS_DAMAGE_BONUS, value: this.getEnemyArtsDmgTaken() }] },
    ];
  }
}

// ── Stub named skills (data sourced from JSON where available) ──────────────

export class CrusherPrincelyDeterrence extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE, level,
    description: 'On Final Strike, wielder gains ATK and Stagger Efficiency bonus for 8s. ATK doubled when controlled. Does not stack.',
  }); }
  getValue(): number { return sv(S.SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class CrusherHonedIntoLegion extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.QUENCHER_CRUSHER_HONED_INTO_LEGION, level,
    description: 'On Final Strike, wielder gains ATK bonus for 10s. Does not stack.',
  }); }
  getValue(): number { return sv(S.QUENCHER_CRUSHER_HONED_INTO_LEGION, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class SuppressionStackedHew extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.EXEMPLAR_SUPPRESSION_STACKED_HEW, level,
    description: 'When battle skill or ultimate hits enemy, wielder gains Physical DMG Dealt bonus for 30s. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return sv(S.EXEMPLAR_SUPPRESSION_STACKED_HEW, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class SuppressionAstrophysics extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.JET_SUPPRESSION_ASTROPHYSICS, level,
    description: 'When casting battle skill or combo skill, wielder gains Arts DMG Dealt bonus for 15s. The two effects apply separately and do not stack with themselves.',
  }); }
  getValue(): number { return sv(S.JET_SUPPRESSION_ASTROPHYSICS, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class SuppressionConcentricCircles extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES, level,
    description: 'When casting combo skill, during the next battle skill within 30s, wielder gains Combo Skill DMG and Electric DMG bonus. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return sv(S.COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class CombativeVirtuousGain extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.VALIANT_COMBATIVE_VIRTUOUS_GAIN, level,
    description: 'After applying Physical Status, wielder deals additional Physical DMG hit and gains ATK bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.VALIANT_COMBATIVE_VIRTUOUS_GAIN, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class BrutalityCementedFury extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY, level,
    description: 'When applying Vulnerability to 0-stack enemy, wielder gains ATK and Crit Rate bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class BrutalityLandsOfYore extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE, level,
    description: 'After consuming Vulnerability stacks, wielder gains Physical DMG Dealt bonus scaling with consumed stacks for 20s. Does not stack.',
  }); }
  getValue(): number { return sv(S.ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class DetonateBonechilling extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.KHRAVENGGER_DETONATE_BONECHILLING, level,
    description: 'When battle skill applies Cryo Infliction, wielder gains Cryo DMG Dealt bonus for 15s. Combo on Cryo-inflicted enemy doubles the bonus. Does not stack.',
  }); }
  getValue(): number { return sv(S.KHRAVENGGER_DETONATE_BONECHILLING, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class DetonateSeekerOfTheEsoteric extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC, level,
    description: 'When applying Arts Burst, wielder gains ATK bonus for 30s. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return sv(S.SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class DetonateImposingChampion extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION, level,
    description: 'When applying Arts Burst, wielder gains secondary attribute bonus and enemy suffers Arts DMG Taken increase for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class EfficacyTenaciousWill extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL, level,
    description: 'When applying Knocked Down or Weakened, wielder gains DEF bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class FractureArtzyExaggeration extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION, level,
    description: 'After scoring a critical hit with battle or combo skill, wielder gains Cryo DMG Dealt bonus for 30s. Max 3 stacks, duration counted separately.',
  }); }
  getValue(): number { return sv(S.ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class PursuitAidFromThePast extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST, level,
    description: 'When combo skill applies Arts Burst or Combustion, wielder gains Battle Skill DMG and ATK bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class PursuitDutyFulfilled extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED, level,
    description: 'After combo skill applies Lifted, team gains Arts DMG and Nature DMG Dealt bonus for 15s. Additional Arts DMG per enemy Lifted. Does not stack.',
  }); }
  getValue(): number { return sv(S.DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class PursuitTranscendentArts extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS, level,
    description: 'When combo skill applies Arts Burst or Physical Status, team gains Heat and Electric DMG Dealt bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class InflictionRoadHomeForAllLife extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE, level,
    description: 'When applying an Arts Reaction, wielder gains ATK bonus for 20s. Max 2 stacks, duration counted separately.',
  }); }
  getValue(): number { return sv(S.OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class InflictionWildernessCluster extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER, level,
    description: 'When applying Electrification, team gains Physical and Electric DMG Dealt bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class InflictionWedgeOfCivilization extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION, level,
    description: 'When casting battle skill, wielder gains Arts DMG Dealt bonus for 15s. If battle skill applies Arts Reaction, bonus doubles. Does not stack with itself.',
  }); }
  getValue(): number { return sv(S.WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class InflictionConquestOfIcyPeaks extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS, level,
    description: 'Against enemies with Cryo Infliction or Solidification, wielder gains Cryo DMG bonus. After consuming Solidification, wielder gains ATK bonus for 15s.',
  }); }
  getValue(): number { return sv(S.OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class TwilightHumiliation extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OBLIVION_TWILIGHT_HUMILIATION, level,
    description: 'When casting ultimate or combo skill, wielder gains Arts DMG Dealt bonus for 15s. Ultimate grants double bonus. The two effects apply separately.',
  }); }
  getValue(): number { return sv(S.OBLIVION_TWILIGHT_HUMILIATION, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class MedicantBlightFervor extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR, level,
    description: 'After skill provides HP treatment, team gains ATK bonus for 15s. Does not stack.',
  }); }
  getValue(): number { return sv(S.CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class MedicantEyeOfTalos extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.THUNDERBERGE_MEDICANT_EYE_OF_TALOS, level,
    description: "After combo skill provides HP treatment, controlled operator gains Shield based on wielder's Max HP for 15s. 15s cooldown.",
  }); }
  getValue(): number { return sv(S.THUNDERBERGE_MEDICANT_EYE_OF_TALOS, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class MedicantRedemptionOfFaith extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH, level,
    description: 'When battle skill provides HP treatment, controlled operator is restored for additional HP. 15s cooldown.',
  }); }
  getValue(): number { return sv(S.FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class MincingTherapy extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.FORMER_FINERY_MINCING_THERAPY, level,
    description: "After a Protected operator takes DMG, wielder restores that operator's HP. 15s cooldown.",
  }); }
  getValue(): number { return sv(S.FORMER_FINERY_MINCING_THERAPY, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class MedicantGloryOfKnighthood extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD, level,
    description: 'Secondary attribute bonus and Combo Skill HP Treatment enhancement (passive).',
  }); }
  getValue(): number { return sv(S.FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class WeightOfMountain extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN, level,
    description: 'Against vulnerable enemies, DMG Dealt increases. When battle skill applies Vulnerability or Physical Susceptibility, all attributes increase for 15s. Effects apply separately.',
  }); }
  getValue(): number { return sv(S.MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class InflictionLoneAndDistantSail extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL, level,
    description: 'When Solidification or Corrosion is applied, wielder gains Cryo DMG, Nature DMG, and Crit Rate bonus for 15s. Self-triggered doubles bonuses. Does not stack.',
  }); }
  getValue(): number { return sv(S.NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class DetonateRapidStrike extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE, level,
    description: 'After consuming Arts Infliction, wielder gains Nature DMG bonus for 20s. Does not stack.',
  }); }
  getValue(): number { return sv(S.OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class SuppressionTilliteEtchings extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS, level,
    description: 'When battle skill applies Nature Infliction, other operators gain Arts DMG Dealt bonus for 15s. Stacking bonus per enemy with Nature Infliction. Does not stack.',
  }); }
  getValue(): number { return sv(S.OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}
export class InspiringMortiseAndTenonAnalysis extends WeaponSkill {
  constructor(level: number) { super({ weaponSkillType: S.MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS, level,
    description: 'Main attribute bonus and Arts Intensity bonus (passive).',
  }); }
  getValue(): number { return sv(S.MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS, "ATTACK_BONUS")[this.level - 1] ?? 0; }
}

// Infliction: Tidal Murmurs
export class InflictionTidalMurmurs extends WeaponSkill {
  static readonly DURATION_SECONDS = durationSeconds(S.DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS);

  constructor(level: number) {
    super({ weaponSkillType: S.DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS, level,
      description: 'After consuming Corrosion, wielder gains secondary attribute bonus and enemy suffers Arts DMG Taken increase for 25s. Does not stack.',
    });
  }

  getValue(): number {
    return sv(S.DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS, "SECONDARY_ATTRIBUTE_BONUS")[this.level - 1] ?? 0;
  }

  getEnemyArtsDmgTaken(): number {
    return cv(S.DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS, "spell_dmg_taken_up")[this.level - 1] ?? 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] {
    return [
      { stats: [{ stat: StatType.WILL_BONUS, value: this.getValue() }] },
      { stats: [{ stat: StatType.ARTS_DAMAGE_BONUS, value: this.getEnemyArtsDmgTaken() }] },
    ];
  }
}
