import { WeaponSkillType, WeaponType } from "../../consts/enums";
import { WeaponRarity } from "../../consts/types";
import { WeaponBaseAttack, Weapon } from "./weapon";
import { getAttackByLevel } from "../game-data/weaponGameData";
import { WeaponSkill } from "../weapon-skills/weaponSkill";
import { PlaceholderSkill } from "../weapon-skills/placeholderSkill";
import {
  AttackBoostS, AttackBoostM, AttackBoostL,
  StrengthBoostS, StrengthBoostM, StrengthBoostL,
  AgilityBoostS, AgilityBoostM, AgilityBoostL,
  IntellectBoostS, IntellectBoostM, IntellectBoostL,
  WillBoostS, WillBoostM, WillBoostL,
  MainAttributeBoostS, MainAttributeBoostM, MainAttributeBoostL,
  PhysicalDamageBoostS, PhysicalDamageBoostM, PhysicalDamageBoostL,
  HeatDamageBoostS, HeatDamageBoostM, HeatDamageBoostL,
  CryoDamageBoostS, CryoDamageBoostM, CryoDamageBoostL,
  NatureDamageBoostS, NatureDamageBoostM, NatureDamageBoostL,
  ElectricDamageBoostS, ElectricDamageBoostM, ElectricDamageBoostL,
  UltimateGainEfficiencyBoostS, UltimateGainEfficiencyBoostM, UltimateGainEfficiencyBoostL,
  HpBoostS, HpBoostM, HpBoostL,
  ArtsBoostS, ArtsBoostM, ArtsBoostL,
  ArtsIntensityBoostS, ArtsIntensityBoostM, ArtsIntensityBoostL,
  CriticalRateBoostS, CriticalRateBoostM, CriticalRateBoostL,
  TreatmentEfficiencyBoostS, TreatmentEfficiencyBoostM, TreatmentEfficiencyBoostL,
} from "../weapon-skills/weaponSkills";
import {
  BrutalityDisciplinarian, TwilightBlazingWail, TwilightAzureClouds,
  InflictionWhiteNightNova, FlowReincarnation, InflictionLongTimeWish,
  FlowThermalRelease, InflictionCovetousBuildup, CombativeAnthemOfCinder,
  InspiringBackToTheBrokenCity, TwilightImposingPeak, FlowUnbridledEdge,
  InflictionSincereInterrogation, SuppressionFinChasersIntent,
  PursuitUnendingCycle, SuppressionEmergencyBoost, AssaultArmamentPrep,
  TwilightLustrousPyre, InflictionViciousPurge, InflictionTidalMurmurs,
  CrusherPrincelyDeterrence, CrusherHonedIntoLegion,
  SuppressionStackedHew, SuppressionAstrophysics, SuppressionConcentricCircles,
  CombativeVirtuousGain, BrutalityCementedFury, BrutalityLandsOfYore,
  DetonateBonechilling, DetonateSeekerOfTheEsoteric, DetonateImposingChampion,
  EfficacyTenaciousWill, FractureArtzyExaggeration,
  PursuitAidFromThePast, PursuitDutyFulfilled, PursuitTranscendentArts,
  InflictionRoadHomeForAllLife, InflictionWildernessCluster,
  InflictionWedgeOfCivilization, InflictionConquestOfIcyPeaks,
  TwilightHumiliation, MedicantBlightFervor, MedicantEyeOfTalos,
  MedicantRedemptionOfFaith, MincingTherapy,
  MedicantGloryOfKnighthood, WeightOfMountain, InspiringStartOfASaga,
  InflictionLoneAndDistantSail, DetonateRapidStrike,
  SuppressionTilliteEtchings, InspiringMortiseAndTenonAnalysis,
} from "../weapon-skills/namedWeaponSkills";

// ── Helper for shared skills with weapon-specific enum values ─────────────────

/** Creates a constructor that binds a specific WeaponSkillType to a shared skill class. */
function boundType<T extends new (level: number, type?: WeaponSkillType) => WeaponSkill>(
  Cls: T, type: WeaponSkillType,
): new (level: number) => WeaponSkill {
  return class extends (Cls as any) {
    constructor(level: number) { super(level, type); }
  } as any;
}

// ── Skill factory ──────────────────────────────────────────────────────────────

const SKILL_CONSTRUCTORS: Record<WeaponSkillType, new (level: number) => WeaponSkill> = {
  // Stat boosts
  [WeaponSkillType.ATTACK_BOOST_S]: AttackBoostS,
  [WeaponSkillType.ATTACK_BOOST_M]: AttackBoostM,
  [WeaponSkillType.ATTACK_BOOST_L]: AttackBoostL,
  [WeaponSkillType.STRENGTH_BOOST_S]: StrengthBoostS,
  [WeaponSkillType.STRENGTH_BOOST_M]: StrengthBoostM,
  [WeaponSkillType.STRENGTH_BOOST_L]: StrengthBoostL,
  [WeaponSkillType.AGILITY_BOOST_S]: AgilityBoostS,
  [WeaponSkillType.AGILITY_BOOST_M]: AgilityBoostM,
  [WeaponSkillType.AGILITY_BOOST_L]: AgilityBoostL,
  [WeaponSkillType.INTELLECT_BOOST_S]: IntellectBoostS,
  [WeaponSkillType.INTELLECT_BOOST_M]: IntellectBoostM,
  [WeaponSkillType.INTELLECT_BOOST_L]: IntellectBoostL,
  [WeaponSkillType.WILL_BOOST_S]: WillBoostS,
  [WeaponSkillType.WILL_BOOST_M]: WillBoostM,
  [WeaponSkillType.WILL_BOOST_L]: WillBoostL,
  [WeaponSkillType.MAIN_ATTRIBUTE_BOOST_S]: MainAttributeBoostS,
  [WeaponSkillType.MAIN_ATTRIBUTE_BOOST_M]: MainAttributeBoostM,
  [WeaponSkillType.MAIN_ATTRIBUTE_BOOST_L]: MainAttributeBoostL,
  [WeaponSkillType.PHYSICAL_DAMAGE_BOOST_S]: PhysicalDamageBoostS,
  [WeaponSkillType.PHYSICAL_DAMAGE_BOOST_M]: PhysicalDamageBoostM,
  [WeaponSkillType.PHYSICAL_DAMAGE_BOOST_L]: PhysicalDamageBoostL,
  [WeaponSkillType.HEAT_DAMAGE_BOOST_S]: HeatDamageBoostS,
  [WeaponSkillType.HEAT_DAMAGE_BOOST_M]: HeatDamageBoostM,
  [WeaponSkillType.HEAT_DAMAGE_BOOST_L]: HeatDamageBoostL,
  [WeaponSkillType.CRYO_DAMAGE_BOOST_S]: CryoDamageBoostS,
  [WeaponSkillType.CRYO_DAMAGE_BOOST_M]: CryoDamageBoostM,
  [WeaponSkillType.CRYO_DAMAGE_BOOST_L]: CryoDamageBoostL,
  [WeaponSkillType.NATURE_DAMAGE_BOOST_S]: NatureDamageBoostS,
  [WeaponSkillType.NATURE_DAMAGE_BOOST_M]: NatureDamageBoostM,
  [WeaponSkillType.NATURE_DAMAGE_BOOST_L]: NatureDamageBoostL,
  [WeaponSkillType.ELECTRIC_DAMAGE_BOOST_S]: ElectricDamageBoostS,
  [WeaponSkillType.ELECTRIC_DAMAGE_BOOST_M]: ElectricDamageBoostM,
  [WeaponSkillType.ELECTRIC_DAMAGE_BOOST_L]: ElectricDamageBoostL,
  [WeaponSkillType.ULTIMATE_GAIN_EFFICIENCY_BOOST_S]: UltimateGainEfficiencyBoostS,
  [WeaponSkillType.ULTIMATE_GAIN_EFFICIENCY_BOOST_M]: UltimateGainEfficiencyBoostM,
  [WeaponSkillType.ULTIMATE_GAIN_EFFICIENCY_BOOST_L]: UltimateGainEfficiencyBoostL,
  [WeaponSkillType.HP_BOOST_S]: HpBoostS,
  [WeaponSkillType.HP_BOOST_M]: HpBoostM,
  [WeaponSkillType.HP_BOOST_L]: HpBoostL,
  [WeaponSkillType.ARTS_BOOST_S]: ArtsBoostS,
  [WeaponSkillType.ARTS_BOOST_M]: ArtsBoostM,
  [WeaponSkillType.ARTS_BOOST_L]: ArtsBoostL,
  [WeaponSkillType.ARTS_INTENSITY_BOOST_S]: ArtsIntensityBoostS,
  [WeaponSkillType.ARTS_INTENSITY_BOOST_M]: ArtsIntensityBoostM,
  [WeaponSkillType.ARTS_INTENSITY_BOOST_L]: ArtsIntensityBoostL,
  [WeaponSkillType.CRITICAL_RATE_BOOST_S]: CriticalRateBoostS,
  [WeaponSkillType.CRITICAL_RATE_BOOST_M]: CriticalRateBoostM,
  [WeaponSkillType.CRITICAL_RATE_BOOST_L]: CriticalRateBoostL,
  [WeaponSkillType.TREATMENT_EFFICIENCY_BOOST_S]: TreatmentEfficiencyBoostS,
  [WeaponSkillType.TREATMENT_EFFICIENCY_BOOST_M]: TreatmentEfficiencyBoostM,
  [WeaponSkillType.TREATMENT_EFFICIENCY_BOOST_L]: TreatmentEfficiencyBoostL,

  // ── Named skills (unique — one weapon each) ────────────────────────────────
  [WeaponSkillType.EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN]: BrutalityDisciplinarian,
  [WeaponSkillType.FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL]: TwilightBlazingWail,
  [WeaponSkillType.RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS]: TwilightAzureClouds,
  [WeaponSkillType.WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA]: InflictionWhiteNightNova,
  [WeaponSkillType.NEVER_REST_FLOW_REINCARNATION]: FlowReincarnation,
  [WeaponSkillType.GRAND_VISION_INFLICTION_LONG_TIME_WISH]: InflictionLongTimeWish,
  [WeaponSkillType.THERMITE_CUTTER_FLOW_THERMAL_RELEASE]: FlowThermalRelease,
  [WeaponSkillType.UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP]: InflictionCovetousBuildup,
  [WeaponSkillType.SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER]: CombativeAnthemOfCinder,
  [WeaponSkillType.FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY]: InspiringBackToTheBrokenCity,
  [WeaponSkillType.ASPIRANT_TWILIGHT_IMPOSING_PEAK]: TwilightImposingPeak,
  [WeaponSkillType.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE]: FlowUnbridledEdge,
  [WeaponSkillType.TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION]: InflictionSincereInterrogation,
  [WeaponSkillType.FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT]: SuppressionFinChasersIntent,
  [WeaponSkillType.STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE]: TwilightLustrousPyre,
  [WeaponSkillType.CLANNIBAL_INFLICTION_VICIOUS_PURGE]: InflictionViciousPurge,
  [WeaponSkillType.DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS]: InflictionTidalMurmurs,
  [WeaponSkillType.SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE]: CrusherPrincelyDeterrence,
  [WeaponSkillType.QUENCHER_CRUSHER_HONED_INTO_LEGION]: CrusherHonedIntoLegion,
  [WeaponSkillType.EXEMPLAR_SUPPRESSION_STACKED_HEW]: SuppressionStackedHew,
  [WeaponSkillType.JET_SUPPRESSION_ASTROPHYSICS]: SuppressionAstrophysics,
  [WeaponSkillType.COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES]: SuppressionConcentricCircles,
  [WeaponSkillType.VALIANT_COMBATIVE_VIRTUOUS_GAIN]: CombativeVirtuousGain,
  [WeaponSkillType.CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY]: BrutalityCementedFury,
  [WeaponSkillType.ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE]: BrutalityLandsOfYore,
  [WeaponSkillType.KHRAVENGGER_DETONATE_BONECHILLING]: DetonateBonechilling,
  [WeaponSkillType.SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC]: DetonateSeekerOfTheEsoteric,
  [WeaponSkillType.DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION]: DetonateImposingChampion,
  [WeaponSkillType.OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL]: EfficacyTenaciousWill,
  [WeaponSkillType.ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION]: FractureArtzyExaggeration,
  [WeaponSkillType.RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST]: PursuitAidFromThePast,
  [WeaponSkillType.DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED]: PursuitDutyFulfilled,
  [WeaponSkillType.OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS]: PursuitTranscendentArts,
  [WeaponSkillType.OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE]: InflictionRoadHomeForAllLife,
  [WeaponSkillType.WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER]: InflictionWildernessCluster,
  [WeaponSkillType.WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION]: InflictionWedgeOfCivilization,
  [WeaponSkillType.OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS]: InflictionConquestOfIcyPeaks,
  [WeaponSkillType.OBLIVION_TWILIGHT_HUMILIATION]: TwilightHumiliation,
  [WeaponSkillType.CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR]: MedicantBlightFervor,
  [WeaponSkillType.THUNDERBERGE_MEDICANT_EYE_OF_TALOS]: MedicantEyeOfTalos,
  [WeaponSkillType.FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH]: MedicantRedemptionOfFaith,
  [WeaponSkillType.FORMER_FINERY_MINCING_THERAPY]: MincingTherapy,
  [WeaponSkillType.FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD]: MedicantGloryOfKnighthood,
  [WeaponSkillType.MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN]: WeightOfMountain,
  [WeaponSkillType.NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL]: InflictionLoneAndDistantSail,
  [WeaponSkillType.OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE]: DetonateRapidStrike,
  [WeaponSkillType.OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS]: SuppressionTilliteEtchings,
  [WeaponSkillType.MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS]: InspiringMortiseAndTenonAnalysis,

  // ── Named skills (shared — bound to weapon-specific enum values) ───────────

  // Suppression: Emergency Boost (5 weapons)
  [WeaponSkillType.CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST]: SuppressionEmergencyBoost,
  [WeaponSkillType.INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST]: boundType(SuppressionEmergencyBoost, WeaponSkillType.INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST),
  [WeaponSkillType.AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST]: boundType(SuppressionEmergencyBoost, WeaponSkillType.AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST),
  [WeaponSkillType.HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST]: boundType(SuppressionEmergencyBoost, WeaponSkillType.HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST),
  [WeaponSkillType.FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST]: boundType(SuppressionEmergencyBoost, WeaponSkillType.FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST),

  // Pursuit: Unending Cycle (2 weapons)
  [WeaponSkillType.WAVE_TIDE_PURSUIT_UNENDING_CYCLE]: PursuitUnendingCycle,
  [WeaponSkillType.LONG_ROAD_PURSUIT_UNENDING_CYCLE]: boundType(PursuitUnendingCycle, WeaponSkillType.LONG_ROAD_PURSUIT_UNENDING_CYCLE),

  // Assault: Armament Prep (5 weapons)
  [WeaponSkillType.TARR_11_ASSAULT_ARMAMENT_PREP]: AssaultArmamentPrep,
  [WeaponSkillType.DARHOFF_7_ASSAULT_ARMAMENT_PREP]: boundType(AssaultArmamentPrep, WeaponSkillType.DARHOFF_7_ASSAULT_ARMAMENT_PREP),
  [WeaponSkillType.OPERO_77_ASSAULT_ARMAMENT_PREP]: boundType(AssaultArmamentPrep, WeaponSkillType.OPERO_77_ASSAULT_ARMAMENT_PREP),
  [WeaponSkillType.PECO_5_ASSAULT_ARMAMENT_PREP]: boundType(AssaultArmamentPrep, WeaponSkillType.PECO_5_ASSAULT_ARMAMENT_PREP),
  [WeaponSkillType.JIMINY_12_ASSAULT_ARMAMENT_PREP]: boundType(AssaultArmamentPrep, WeaponSkillType.JIMINY_12_ASSAULT_ARMAMENT_PREP),

  // Inspiring: Start of a Saga (2 weapons)
  [WeaponSkillType.PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA]: InspiringStartOfASaga,
  [WeaponSkillType.HYPERNOVA_AUTO_INSPIRING_START_OF_A_SAGA]: boundType(InspiringStartOfASaga, WeaponSkillType.HYPERNOVA_AUTO_INSPIRING_START_OF_A_SAGA),
};

/** Runtime-extensible skill factory lookup (for custom weapons). */
const CUSTOM_SKILL_FACTORIES: Record<string, (level: number) => WeaponSkill> = {};

export function registerCustomSkillFactory(key: string, factory: (level: number) => WeaponSkill): void {
  CUSTOM_SKILL_FACTORIES[key] = factory;
}

export function deregisterCustomSkillFactory(key: string): void {
  delete CUSTOM_SKILL_FACTORIES[key];
}

export function createSkillFromType(type: WeaponSkillType, level: number): WeaponSkill {
  const Ctor = SKILL_CONSTRUCTORS[type];
  if (Ctor) return new Ctor(level);
  const factory = CUSTOM_SKILL_FACTORIES[type as string];
  if (factory) return factory(level);
  return new PlaceholderSkill();
}

// ── Weapon data table ──────────────────────────────────────────────────────────

export interface WeaponConfig {
  type: WeaponType;
  rarity: WeaponRarity;
  baseAtk: WeaponBaseAttack;
  skill1: WeaponSkillType;
  skill2: WeaponSkillType;
  skill3?: WeaponSkillType;
}

const S = WeaponSkillType;
const T = WeaponType;

export const WEAPON_DATA: Record<string, WeaponConfig> = {
  // ── Sword ──────────────────────────────────────────────────────────────────
  "Never Rest":         { type: T.SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.WILL_BOOST_L,            skill2: S.ATTACK_BOOST_L,                  skill3: S.NEVER_REST_FLOW_REINCARNATION },
  "Thermite Cutter":    { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.WILL_BOOST_L,            skill2: S.ATTACK_BOOST_L,                  skill3: S.THERMITE_CUTTER_FLOW_THERMAL_RELEASE },
  "Forgeborn Scathe":   { type: T.SWORD, rarity: 6, baseAtk: { lv1: 52, lv90: 510 }, skill1: S.INTELLECT_BOOST_L,       skill2: S.ATTACK_BOOST_L,                  skill3: S.FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL },
  "Eminent Repute":     { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.PHYSICAL_DAMAGE_BOOST_L,         skill3: S.EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN },
  "Rapid Ascent":       { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.CRITICAL_RATE_BOOST_L,           skill3: S.RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS },
  "White Night Nova":   { type: T.SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 505 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.ARTS_INTENSITY_BOOST_L,          skill3: S.WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA },
  "Grand Vision":       { type: T.SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.AGILITY_BOOST_L,         skill2: S.ATTACK_BOOST_L,                  skill3: S.GRAND_VISION_INFLICTION_LONG_TIME_WISH },
  "Umbral Torch":       { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.INTELLECT_BOOST_L,       skill2: S.HEAT_DAMAGE_BOOST_L,             skill3: S.UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP },
  "Sundering Steel":    { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,         skill2: S.PHYSICAL_DAMAGE_BOOST_M,         skill3: S.SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER },
  "Fortmaker":          { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY },
  "Aspirant":           { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,         skill2: S.PHYSICAL_DAMAGE_BOOST_M,         skill3: S.ASPIRANT_TWILIGHT_IMPOSING_PEAK },
  "Twelve Questions":   { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,         skill2: S.ATTACK_BOOST_M,                  skill3: S.TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION },
  "Finchaser 3.0":      { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,        skill2: S.CRYO_DAMAGE_BOOST_M,             skill3: S.FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT },
  "OBJ Edge of Lightness": { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,      skill2: S.ATTACK_BOOST_M,                  skill3: S.OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE },
  "Wave Tide":          { type: T.SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.INTELLECT_BOOST_S,       skill2: S.ATTACK_BOOST_S,                  skill3: S.WAVE_TIDE_PURSUIT_UNENDING_CYCLE },
  "Contingent Measure": { type: T.SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.AGILITY_BOOST_S,         skill2: S.PHYSICAL_DAMAGE_BOOST_S,         skill3: S.CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST },
  "Tarr 11":            { type: T.SWORD, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S,  skill2: S.TARR_11_ASSAULT_ARMAMENT_PREP },

  // ── Great Sword ────────────────────────────────────────────────────────────
  "Former Finery":       { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.WILL_BOOST_L,           skill2: S.HP_BOOST_L,                       skill3: S.FORMER_FINERY_MINCING_THERAPY },
  "Sundered Prince":     { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.STRENGTH_BOOST_L,       skill2: S.CRITICAL_RATE_BOOST_L,            skill3: S.SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE },
  "Thunderberge":        { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.STRENGTH_BOOST_L,       skill2: S.HP_BOOST_L,                       skill3: S.THUNDERBERGE_MEDICANT_EYE_OF_TALOS },
  "Exemplar":            { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.ATTACK_BOOST_L,                   skill3: S.EXEMPLAR_SUPPRESSION_STACKED_HEW },
  "Khravengger":         { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 505 }, skill1: S.STRENGTH_BOOST_L,       skill2: S.ATTACK_BOOST_L,                   skill3: S.KHRAVENGGER_DETONATE_BONECHILLING },
  "OBJ Heavy Burden":    { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.HP_BOOST_M,                       skill3: S.OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL },
  "Finishing Call":       { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.HP_BOOST_M,                       skill3: S.FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD },
  "Ancient Canal":       { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.ARTS_INTENSITY_BOOST_M,           skill3: S.ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE },
  "Seeker of Dark Lung": { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC },
  "Industry 0.1":        { type: T.GREAT_SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.STRENGTH_BOOST_S,       skill2: S.ATTACK_BOOST_S,                   skill3: S.INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST },
  "Quencher":            { type: T.GREAT_SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.WILL_BOOST_S,           skill2: S.HP_BOOST_S,                       skill3: S.QUENCHER_CRUSHER_HONED_INTO_LEGION },
  "Darhoff 7":           { type: T.GREAT_SWORD, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S, skill2: S.DARHOFF_7_ASSAULT_ARMAMENT_PREP },

  // ── Polearm ────────────────────────────────────────────────────────────────
  "JET":                  { type: T.POLEARM, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.ATTACK_BOOST_L,                   skill3: S.JET_SUPPRESSION_ASTROPHYSICS },
  "Mountain Bearer":      { type: T.POLEARM, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.AGILITY_BOOST_L,        skill2: S.PHYSICAL_DAMAGE_BOOST_L,         skill3: S.MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN },
  "Valiant":              { type: T.POLEARM, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.AGILITY_BOOST_L,        skill2: S.PHYSICAL_DAMAGE_BOOST_L,         skill3: S.VALIANT_COMBATIVE_VIRTUOUS_GAIN },
  "Cohesive Traction":    { type: T.POLEARM, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,           skill2: S.ELECTRIC_DAMAGE_BOOST_M,         skill3: S.COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES },
  "Chimeric Justice":     { type: T.POLEARM, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY },
  "OBJ Razorhorn":        { type: T.POLEARM, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,           skill2: S.PHYSICAL_DAMAGE_BOOST_M,         skill3: S.OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS },
  "Pathfinder's Beacon":  { type: T.POLEARM, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.AGILITY_BOOST_S,        skill2: S.ATTACK_BOOST_S,                  skill3: S.PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA },
  "Aggeloslayer":         { type: T.POLEARM, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.WILL_BOOST_S,           skill2: S.ARTS_BOOST_S,                    skill3: S.AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST },
  "Opero 77":             { type: T.POLEARM, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S, skill2: S.OPERO_77_ASSAULT_ARMAMENT_PREP },

  // ── Handcannon ─────────────────────────────────────────────────────────────
  "Clannibal":         { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.ARTS_BOOST_L,                    skill3: S.CLANNIBAL_INFLICTION_VICIOUS_PURGE },
  "Wedge":             { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.CRITICAL_RATE_BOOST_L,            skill3: S.WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION },
  "Navigator":         { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.INTELLECT_BOOST_L,      skill2: S.CRYO_DAMAGE_BOOST_L,             skill3: S.NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL },
  "Artzy Tyrannical":  { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 51, lv90: 505 }, skill1: S.INTELLECT_BOOST_L,      skill2: S.CRITICAL_RATE_BOOST_L,           skill3: S.ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION },
  "Rational Farewell": { type: T.HANDCANNON, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.HEAT_DAMAGE_BOOST_M,             skill3: S.RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST },
  "Opus: The Living":  { type: T.HANDCANNON, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,        skill2: S.ARTS_BOOST_M,                    skill3: S.OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE },
  "OBJ Velocitous":    { type: T.HANDCANNON, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,        skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE },
  "Howling Guard":     { type: T.HANDCANNON, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.INTELLECT_BOOST_S,      skill2: S.ATTACK_BOOST_S,                  skill3: S.HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST },
  "Long Road":         { type: T.HANDCANNON, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.STRENGTH_BOOST_S,       skill2: S.ARTS_BOOST_S,                    skill3: S.LONG_ROAD_PURSUIT_UNENDING_CYCLE },
  "Peco 5":            { type: T.HANDCANNON, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S, skill2: S.PECO_5_ASSAULT_ARMAMENT_PREP },

  // ── Arts Unit ──────────────────────────────────────────────────────────────
  "Dreams of the Starry Beach": { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.INTELLECT_BOOST_L,   skill2: S.TREATMENT_EFFICIENCY_BOOST_L,     skill3: S.DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS },
  "Chivalric Virtues":      { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 49, lv90: 485 }, skill1: S.WILL_BOOST_L,            skill2: S.HP_BOOST_L,                       skill3: S.CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR },
  "Detonation Unit":        { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.ARTS_INTENSITY_BOOST_L,           skill3: S.DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION },
  "Oblivion":               { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.INTELLECT_BOOST_L,       skill2: S.ARTS_BOOST_L,                     skill3: S.OBLIVION_TWILIGHT_HUMILIATION },
  "Opus: Etch Figure":      { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 49, lv90: 485 }, skill1: S.WILL_BOOST_L,            skill2: S.NATURE_DAMAGE_BOOST_L,            skill3: S.OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS },
  "Delivery Guaranteed":    { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.WILL_BOOST_L,            skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_L, skill3: S.DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED },
  "OBJ Arts Identifier":    { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ARTS_INTENSITY_BOOST_M,           skill3: S.OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS },
  "Freedom to Proselytize": { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,            skill2: S.TREATMENT_EFFICIENCY_BOOST_M,     skill3: S.FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH },
  "Stanza of Memorials":    { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ATTACK_BOOST_M,                   skill3: S.STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE },
  "Wild Wanderer":          { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ELECTRIC_DAMAGE_BOOST_M,          skill3: S.WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER },
  "Monaihe":                { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,            skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS },
  "Fluorescent Roc":        { type: T.ARTS_UNIT, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.WILL_BOOST_S,            skill2: S.ATTACK_BOOST_S,                   skill3: S.FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST },
  "Hypernova Auto":         { type: T.ARTS_UNIT, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.INTELLECT_BOOST_S,       skill2: S.ARTS_BOOST_S,                     skill3: S.HYPERNOVA_AUTO_INSPIRING_START_OF_A_SAGA },
  "Jiminy 12":              { type: T.ARTS_UNIT, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S,  skill2: S.JIMINY_12_ASSAULT_ARMAMENT_PREP },
};

// ── Data-driven weapon class ───────────────────────────────────────────────────

class DataDrivenWeapon extends Weapon {
  constructor(params: {
    weaponType: WeaponType;
    weaponRarity: WeaponRarity;
    level: number;
    baseAttack: WeaponBaseAttack;
    skill1: WeaponSkillType;
    skill2: WeaponSkillType;
    skill3?: WeaponSkillType;
    skillLevel?: number;
  }) {
    const sl = params.skillLevel ?? 1;
    super({
      weaponType: params.weaponType,
      weaponRarity: params.weaponRarity,
      level: params.level,
      baseAttack: params.baseAttack,
      weaponSkillOne: createSkillFromType(params.skill1, sl),
      weaponSkillTwo: createSkillFromType(params.skill2, sl),
      ...(params.weaponRarity >= 4 && params.skill3
        ? { weaponSkillThree: createSkillFromType(params.skill3, sl) }
        : {}),
    });
  }
}

/**
 * Create a weapon from the data table by name.
 * Falls back to GenericWeapon-like behavior if the name is not in the table.
 */
export function createWeaponFromData(name: string, fallbackType?: WeaponType): Weapon {
  const config = WEAPON_DATA[name];
  if (!config) {
    // Fallback for unknown weapons
    return new DataDrivenWeapon({
      weaponType: fallbackType ?? WeaponType.SWORD,
      weaponRarity: 6,
      level: 90,
      baseAttack: { lv1: 100, lv90: 1000 },
      skill1: WeaponSkillType.ATTACK_BOOST_L,
      skill2: WeaponSkillType.ATTACK_BOOST_L,
      skill3: WeaponSkillType.TARR_11_ASSAULT_ARMAMENT_PREP,
    });
  }
  const abl = getAttackByLevel(name);
  const baseAttack: WeaponBaseAttack = Object.keys(abl).length > 0
    ? { ...config.baseAtk, attackByLevel: abl }
    : config.baseAtk;
  return new DataDrivenWeapon({
    weaponType: config.type,
    weaponRarity: config.rarity,
    level: 90,
    baseAttack,
    skill1: config.skill1,
    skill2: config.skill2,
    skill3: config.skill3,
  });
}
