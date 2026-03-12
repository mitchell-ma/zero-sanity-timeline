import { WeaponSkillType, WeaponType } from "../../consts/enums";
import { WeaponRarity } from "../../consts/types";
import { WeaponBaseAttack, Weapon } from "./weapon";
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
  // Named skills
  [WeaponSkillType.BRUTALITY_DISCIPLINARIAN]: BrutalityDisciplinarian,
  [WeaponSkillType.TWILIGHT_BLAZING_WAIL]: TwilightBlazingWail,
  [WeaponSkillType.TWILIGHT_AZURE_CLOUDS]: TwilightAzureClouds,
  [WeaponSkillType.INFLICTION_WHITE_NIGHT_NOVA]: InflictionWhiteNightNova,
  [WeaponSkillType.FLOW_REINCARNATION]: FlowReincarnation,
  [WeaponSkillType.INFLICTION_LONG_TIME_WISH]: InflictionLongTimeWish,
  [WeaponSkillType.FLOW_THERMAL_RELEASE]: FlowThermalRelease,
  [WeaponSkillType.INFLICTION_COVETOUS_BUILDUP]: InflictionCovetousBuildup,
  [WeaponSkillType.COMBATIVE_ANTHEM_OF_CINDER]: CombativeAnthemOfCinder,
  [WeaponSkillType.INSPIRING_BACK_TO_THE_BROKEN_CITY]: InspiringBackToTheBrokenCity,
  [WeaponSkillType.TWILIGHT_IMPOSING_PEAK]: TwilightImposingPeak,
  [WeaponSkillType.FLOW_UNBRIDLED_EDGE]: FlowUnbridledEdge,
  [WeaponSkillType.INFLICTION_SINCERE_INTERROGATION]: InflictionSincereInterrogation,
  [WeaponSkillType.SUPPRESSION_FIN_CHASERS_INTENT]: SuppressionFinChasersIntent,
  [WeaponSkillType.PURSUIT_UNENDING_CYCLE]: PursuitUnendingCycle,
  [WeaponSkillType.SUPPRESSION_EMERGENCY_BOOST]: SuppressionEmergencyBoost,
  [WeaponSkillType.ASSAULT_ARMAMENT_PREP]: AssaultArmamentPrep,
  [WeaponSkillType.TWILIGHT_LUSTROUS_PYRE]: TwilightLustrousPyre,
  [WeaponSkillType.INFLICTION_VICIOUS_PURGE]: InflictionViciousPurge,
  [WeaponSkillType.INFLICTION_TIDAL_MURMURS]: InflictionTidalMurmurs,
  [WeaponSkillType.CRUSHER_PRINCELY_DETERRENCE]: CrusherPrincelyDeterrence,
  [WeaponSkillType.CRUSHER_HONED_INTO_LEGION]: CrusherHonedIntoLegion,
  [WeaponSkillType.SUPPRESSION_STACKED_HEW]: SuppressionStackedHew,
  [WeaponSkillType.SUPPRESSION_ASTROPHYSICS]: SuppressionAstrophysics,
  [WeaponSkillType.SUPPRESSION_CONCENTRIC_CIRCLES]: SuppressionConcentricCircles,
  [WeaponSkillType.COMBATIVE_VIRTUOUS_GAIN]: CombativeVirtuousGain,
  [WeaponSkillType.BRUTALITY_CEMENTED_FURY]: BrutalityCementedFury,
  [WeaponSkillType.BRUTALITY_LANDS_OF_YORE]: BrutalityLandsOfYore,
  [WeaponSkillType.DETONATE_BONECHILLING]: DetonateBonechilling,
  [WeaponSkillType.DETONATE_SEEKER_OF_THE_ESOTERIC]: DetonateSeekerOfTheEsoteric,
  [WeaponSkillType.DETONATE_IMPOSING_CHAMPION]: DetonateImposingChampion,
  [WeaponSkillType.EFFICACY_TENACIOUS_WILL]: EfficacyTenaciousWill,
  [WeaponSkillType.FRACTURE_ARTZY_EXAGGERATION]: FractureArtzyExaggeration,
  [WeaponSkillType.PURSUIT_AID_FROM_THE_PAST]: PursuitAidFromThePast,
  [WeaponSkillType.PURSUIT_DUTY_FULFILLED]: PursuitDutyFulfilled,
  [WeaponSkillType.PURSUIT_TRANSCENDENT_ARTS]: PursuitTranscendentArts,
  [WeaponSkillType.INFLICTION_ROAD_HOME_FOR_ALL_LIFE]: InflictionRoadHomeForAllLife,
  [WeaponSkillType.INFLICTION_WILDERNESS_CLUSTER]: InflictionWildernessCluster,
  [WeaponSkillType.INFLICTION_WEDGE_OF_CIVILIZATION]: InflictionWedgeOfCivilization,
  [WeaponSkillType.INFLICTION_CONQUEST_OF_ICY_PEAKS]: InflictionConquestOfIcyPeaks,
  [WeaponSkillType.TWILIGHT_HUMILIATION]: TwilightHumiliation,
  [WeaponSkillType.MEDICANT_BLIGHT_FERVOR]: MedicantBlightFervor,
  [WeaponSkillType.MEDICANT_EYE_OF_TALOS]: MedicantEyeOfTalos,
  [WeaponSkillType.MEDICANT_REDEMPTION_OF_FAITH]: MedicantRedemptionOfFaith,
  [WeaponSkillType.MINCING_THERAPY]: MincingTherapy,
  [WeaponSkillType.MEDICANT_GLORY_OF_KNIGHTHOOD]: MedicantGloryOfKnighthood,
  [WeaponSkillType.WEIGHT_OF_MOUNTAIN]: WeightOfMountain,
  [WeaponSkillType.INSPIRING_START_OF_A_SAGA]: InspiringStartOfASaga,
  [WeaponSkillType.INFLICTION_LONE_AND_DISTANT_SAIL]: InflictionLoneAndDistantSail,
  [WeaponSkillType.DETONATE_RAPID_STRIKE]: DetonateRapidStrike,
  [WeaponSkillType.SUPPRESSION_TILLITE_ETCHINGS]: SuppressionTilliteEtchings,
  [WeaponSkillType.INSPIRING_MORTISE_AND_TENON_ANALYSIS]: InspiringMortiseAndTenonAnalysis,
};

export function createSkillFromType(type: WeaponSkillType, level: number): WeaponSkill {
  const Ctor = SKILL_CONSTRUCTORS[type];
  if (!Ctor) return new PlaceholderSkill();
  return new Ctor(level);
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
  "Eminent Repute":     { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.PHYSICAL_DAMAGE_BOOST_L,         skill3: S.BRUTALITY_DISCIPLINARIAN },
  "Rapid Ascent":       { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.CRITICAL_RATE_BOOST_L,           skill3: S.TWILIGHT_AZURE_CLOUDS },
  "White Night Nova":   { type: T.SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 505 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.ARTS_INTENSITY_BOOST_L,          skill3: S.INFLICTION_WHITE_NIGHT_NOVA },
  "Grand Vision":       { type: T.SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.AGILITY_BOOST_L,         skill2: S.ATTACK_BOOST_L,                  skill3: S.INFLICTION_LONG_TIME_WISH },
  "Umbral Torch":       { type: T.SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.INTELLECT_BOOST_L,       skill2: S.HEAT_DAMAGE_BOOST_L,             skill3: S.INFLICTION_COVETOUS_BUILDUP },
  "Sundering Steel":    { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,         skill2: S.PHYSICAL_DAMAGE_BOOST_M,         skill3: S.COMBATIVE_ANTHEM_OF_CINDER },
  "Fortmaker":          { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.INSPIRING_BACK_TO_THE_BROKEN_CITY },
  "Aspirant":           { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,         skill2: S.PHYSICAL_DAMAGE_BOOST_M,         skill3: S.TWILIGHT_IMPOSING_PEAK },
  "Twelve Questions":   { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,         skill2: S.ATTACK_BOOST_M,                  skill3: S.INFLICTION_SINCERE_INTERROGATION },
  "Finchaser 3.0":      { type: T.SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,        skill2: S.CRYO_DAMAGE_BOOST_M,             skill3: S.SUPPRESSION_FIN_CHASERS_INTENT },
  "Wave Tide":          { type: T.SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.INTELLECT_BOOST_S,       skill2: S.ATTACK_BOOST_S,                  skill3: S.PURSUIT_UNENDING_CYCLE },
  "Contingent Measure": { type: T.SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.AGILITY_BOOST_S,         skill2: S.PHYSICAL_DAMAGE_BOOST_S,         skill3: S.SUPPRESSION_EMERGENCY_BOOST },

  // ── Great Sword ────────────────────────────────────────────────────────────
  "Former Finery":       { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.WILL_BOOST_L,           skill2: S.HP_BOOST_L,                       skill3: S.MINCING_THERAPY },
  "Sundered Prince":     { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.STRENGTH_BOOST_L,       skill2: S.CRITICAL_RATE_BOOST_L,            skill3: S.CRUSHER_PRINCELY_DETERRENCE },
  "Thunderberge":        { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.STRENGTH_BOOST_L,       skill2: S.HP_BOOST_L,                       skill3: S.MEDICANT_EYE_OF_TALOS },
  "Exemplar":            { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.ATTACK_BOOST_L,                   skill3: S.SUPPRESSION_STACKED_HEW },
  "Khravengger":         { type: T.GREAT_SWORD, rarity: 6, baseAtk: { lv1: 51, lv90: 505 }, skill1: S.STRENGTH_BOOST_L,       skill2: S.ATTACK_BOOST_L,                   skill3: S.DETONATE_BONECHILLING },
  "OBJ Heavy Burden":    { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.HP_BOOST_M,                       skill3: S.EFFICACY_TENACIOUS_WILL },
  "Finishing Call":       { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.HP_BOOST_M,                       skill3: S.MEDICANT_GLORY_OF_KNIGHTHOOD },
  "Ancient Canal":       { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.ARTS_INTENSITY_BOOST_M,           skill3: S.BRUTALITY_LANDS_OF_YORE },
  "Seeker of Dark Lung": { type: T.GREAT_SWORD, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.DETONATE_SEEKER_OF_THE_ESOTERIC },
  "Industry 0.1":        { type: T.GREAT_SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.STRENGTH_BOOST_S,       skill2: S.ATTACK_BOOST_S,                   skill3: S.SUPPRESSION_EMERGENCY_BOOST },
  "Quencher":            { type: T.GREAT_SWORD, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.WILL_BOOST_S,           skill2: S.HP_BOOST_S,                       skill3: S.CRUSHER_HONED_INTO_LEGION },
  "Darhoff 7":           { type: T.GREAT_SWORD, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S, skill2: S.ASSAULT_ARMAMENT_PREP },

  // ── Polearm ────────────────────────────────────────────────────────────────
  "JET":                  { type: T.POLEARM, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.ATTACK_BOOST_L,                   skill3: S.SUPPRESSION_ASTROPHYSICS },
  "Mountain Bearer":      { type: T.POLEARM, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.AGILITY_BOOST_L,        skill2: S.PHYSICAL_DAMAGE_BOOST_L,         skill3: S.WEIGHT_OF_MOUNTAIN },
  "Valiant":              { type: T.POLEARM, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.AGILITY_BOOST_L,        skill2: S.PHYSICAL_DAMAGE_BOOST_L,         skill3: S.COMBATIVE_VIRTUOUS_GAIN },
  "Cohesive Traction":    { type: T.POLEARM, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,           skill2: S.ELECTRIC_DAMAGE_BOOST_M,         skill3: S.SUPPRESSION_CONCENTRIC_CIRCLES },
  "Chimeric Justice":     { type: T.POLEARM, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.BRUTALITY_CEMENTED_FURY },
  "OBJ Razorhorn":        { type: T.POLEARM, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,           skill2: S.PHYSICAL_DAMAGE_BOOST_M,         skill3: S.INFLICTION_CONQUEST_OF_ICY_PEAKS },
  "Pathfinder's Beacon":  { type: T.POLEARM, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.AGILITY_BOOST_S,        skill2: S.ATTACK_BOOST_S,                  skill3: S.INSPIRING_START_OF_A_SAGA },
  "Aggeloslayer":         { type: T.POLEARM, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.WILL_BOOST_S,           skill2: S.ARTS_BOOST_S,                    skill3: S.SUPPRESSION_EMERGENCY_BOOST },
  "Opero 77":             { type: T.POLEARM, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S, skill2: S.ASSAULT_ARMAMENT_PREP },

  // ── Handcannon ─────────────────────────────────────────────────────────────
  "Wedge":             { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L, skill2: S.CRITICAL_RATE_BOOST_L,            skill3: S.INFLICTION_WEDGE_OF_CIVILIZATION },
  "Navigator":         { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.INTELLECT_BOOST_L,      skill2: S.CRYO_DAMAGE_BOOST_L,             skill3: S.INFLICTION_LONE_AND_DISTANT_SAIL },
  "Artzy Tyrannical":  { type: T.HANDCANNON, rarity: 6, baseAtk: { lv1: 51, lv90: 505 }, skill1: S.INTELLECT_BOOST_L,      skill2: S.CRITICAL_RATE_BOOST_L,           skill3: S.FRACTURE_ARTZY_EXAGGERATION },
  "Rational Farewell": { type: T.HANDCANNON, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.STRENGTH_BOOST_M,       skill2: S.HEAT_DAMAGE_BOOST_M,             skill3: S.PURSUIT_AID_FROM_THE_PAST },
  "Opus: The Living":  { type: T.HANDCANNON, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,        skill2: S.ARTS_BOOST_M,                    skill3: S.INFLICTION_ROAD_HOME_FOR_ALL_LIFE },
  "OBJ Velocitous":    { type: T.HANDCANNON, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.AGILITY_BOOST_M,        skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.DETONATE_RAPID_STRIKE },
  "Howling Guard":     { type: T.HANDCANNON, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.INTELLECT_BOOST_S,      skill2: S.ATTACK_BOOST_S,                  skill3: S.SUPPRESSION_EMERGENCY_BOOST },
  "Long Road":         { type: T.HANDCANNON, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.STRENGTH_BOOST_S,       skill2: S.ARTS_BOOST_S,                    skill3: S.PURSUIT_UNENDING_CYCLE },
  "Peco 5":            { type: T.HANDCANNON, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S, skill2: S.ASSAULT_ARMAMENT_PREP },

  // ── Arts Unit ──────────────────────────────────────────────────────────────
  "Chivalric Virtues":      { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 49, lv90: 485 }, skill1: S.WILL_BOOST_L,            skill2: S.HP_BOOST_L,                       skill3: S.MEDICANT_BLIGHT_FERVOR },
  "Detonation Unit":        { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 50, lv90: 490 }, skill1: S.MAIN_ATTRIBUTE_BOOST_L,  skill2: S.ARTS_INTENSITY_BOOST_L,           skill3: S.DETONATE_IMPOSING_CHAMPION },
  "Oblivion":               { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 50, lv90: 495 }, skill1: S.INTELLECT_BOOST_L,       skill2: S.ARTS_BOOST_L,                     skill3: S.TWILIGHT_HUMILIATION },
  "Opus: Etch Figure":      { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 49, lv90: 485 }, skill1: S.WILL_BOOST_L,            skill2: S.NATURE_DAMAGE_BOOST_L,            skill3: S.SUPPRESSION_TILLITE_ETCHINGS },
  "Delivery Guaranteed":    { type: T.ARTS_UNIT, rarity: 6, baseAtk: { lv1: 51, lv90: 500 }, skill1: S.WILL_BOOST_L,            skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_L, skill3: S.PURSUIT_DUTY_FULFILLED },
  "OBJ Arts Identifier":    { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ARTS_INTENSITY_BOOST_M,           skill3: S.PURSUIT_TRANSCENDENT_ARTS },
  "Freedom to Proselytize": { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,            skill2: S.TREATMENT_EFFICIENCY_BOOST_M,     skill3: S.MEDICANT_REDEMPTION_OF_FAITH },
  "Wild Wanderer":          { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.INTELLECT_BOOST_M,       skill2: S.ELECTRIC_DAMAGE_BOOST_M,          skill3: S.INFLICTION_WILDERNESS_CLUSTER },
  "Monaihe":                { type: T.ARTS_UNIT, rarity: 5, baseAtk: { lv1: 42, lv90: 411 }, skill1: S.WILL_BOOST_M,            skill2: S.ULTIMATE_GAIN_EFFICIENCY_BOOST_M, skill3: S.INSPIRING_MORTISE_AND_TENON_ANALYSIS },
  "Fluorescent Roc":        { type: T.ARTS_UNIT, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.WILL_BOOST_S,            skill2: S.ATTACK_BOOST_S,                   skill3: S.SUPPRESSION_EMERGENCY_BOOST },
  "Hypernova Auto":         { type: T.ARTS_UNIT, rarity: 4, baseAtk: { lv1: 34, lv90: 341 }, skill1: S.INTELLECT_BOOST_S,       skill2: S.ARTS_BOOST_S,                     skill3: S.INSPIRING_START_OF_A_SAGA },
  "Jiminy 12":              { type: T.ARTS_UNIT, rarity: 3, baseAtk: { lv1: 29, lv90: 283 }, skill1: S.MAIN_ATTRIBUTE_BOOST_S,  skill2: S.ASSAULT_ARMAMENT_PREP },
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
      skill3: WeaponSkillType.ASSAULT_ARMAMENT_PREP,
    });
  }
  return new DataDrivenWeapon({
    weaponType: config.type,
    weaponRarity: config.rarity,
    level: 90,
    baseAttack: config.baseAtk,
    skill1: config.skill1,
    skill2: config.skill2,
    skill3: config.skill3,
  });
}
