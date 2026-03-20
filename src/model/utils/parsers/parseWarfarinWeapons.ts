/**
 * Fetches weapon data from the Warfarin API and outputs structured data
 * for src/model/game-data/weapons/<slug>.json.
 *
 * Usage:
 *   npx tsx src/model/utils/parsers/parseWarfarinWeapons.ts <slug>
 *   npx tsx src/model/utils/parsers/parseWarfarinWeapons.ts --all
 *
 * Examples:
 *   npx tsx src/model/utils/parsers/parseWarfarinWeapons.ts forgeborn-scathe
 *   npx tsx src/model/utils/parsers/parseWarfarinWeapons.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';

const WEAPONS_LIST_URL = 'https://api.warfarin.wiki/v1/en/weapons?version=1.1';
const WEAPONS_DETAIL_URL = 'https://api.warfarin.wiki/v1/en/weapons';
const WEAPONS_DIR = path.resolve(__dirname, '../../game-data/weapons');

// ── Warfarin weaponType → WeaponType enum mapping ────────────────────────────

const WARFARIN_WEAPON_TYPE: Record<number, string> = {
  1: 'SWORD',
  2: 'ARTS_UNIT',
  3: 'GREAT_SWORD',
  5: 'POLEARM',
  6: 'HANDCANNON',
};

// ── Warfarin blackboard key → StatType mapping ──────────────────────────────
// Maps weapon skill blackboard keys to our StatType enum values.
// Keys not in this map are non-stat parameters (duration, max_stack, lv, cd, etc.)
// and are kept as-is in the blackboard.

const BLACKBOARD_KEY_TO_STAT: Record<string, string> = {
  // ── Base attributes (flat) ────────────────────────────────────────────────
  str: 'STRENGTH',
  agi: 'AGILITY',
  wisd: 'INTELLECT',
  will: 'WILL',
  mainattr: 'MAIN_ATTRIBUTE',               // resolves at runtime to operator's main attribute

  // ── Attribute bonuses (%) ─────────────────────────────────────────────────
  primary_attr_up: 'PRIMARY_ATTRIBUTE_BONUS', // resolves at runtime
  second_attr_up: 'SECONDARY_ATTRIBUTE_BONUS', // resolves at runtime
  all_attr_up: 'ALL_ATTRIBUTE_BONUS',         // all four attributes

  // ── Attack / ATK ──────────────────────────────────────────────────────────
  atk: 'ATTACK_BONUS',                       // percentage (0.05 = 5%)
  atk_up: 'ATTACK_BONUS',                    // alt key, same meaning

  // ── HP ────────────────────────────────────────────────────────────────────
  hp: 'HP_BONUS',                             // percentage
  hp_up: 'HP_BONUS',                          // alt key

  // ── Critical ──────────────────────────────────────────────────────────────
  crirate: 'CRITICAL_RATE',
  crit_up: 'CRITICAL_DAMAGE',

  // ── Healing / shield ──────────────────────────────────────────────────────
  heal_up: 'TREATMENT_BONUS',
  shield_up: 'SHIELD_BONUS',

  // ── Physical damage ───────────────────────────────────────────────────────
  phy_dmg_up: 'PHYSICAL_DAMAGE_BONUS',
  phy_damage_up: 'PHYSICAL_DAMAGE_BONUS',     // alt key
  phydam: 'PHYSICAL_DAMAGE_BONUS',            // alt key
  physpell: 'ARTS_INTENSITY',                 // physical + spell infliction enhance
  phy_spell_up: 'ARTS_INTENSITY',             // alt key

  // ── Elemental damage ──────────────────────────────────────────────────────
  fire_dmg_up: 'HEAT_DAMAGE_BONUS',
  firedam: 'HEAT_DAMAGE_BONUS',              // alt key
  pulse_dmg_up: 'ELECTRIC_DAMAGE_BONUS',
  electrondam: 'ELECTRIC_DAMAGE_BONUS',       // alt key
  cryst_dmg_up: 'CRYO_DAMAGE_BONUS',
  crystdam: 'CRYO_DAMAGE_BONUS',              // alt key
  nature_dmg_up: 'NATURE_DAMAGE_BONUS',
  naturaldam: 'NATURE_DAMAGE_BONUS',          // alt key

  // ── Arts / spell damage ───────────────────────────────────────────────────
  spell_dmg_up: 'ARTS_DAMAGE_BONUS',
  spelldam: 'ARTS_DAMAGE_BONUS',              // alt key

  // ── Skill-type damage ─────────────────────────────────────────────────────
  normal_atk_up: 'BASIC_ATTACK_DAMAGE_BONUS',

  // ── Stagger ───────────────────────────────────────────────────────────────
  poise_up: 'STAGGER_EFFICIENCY_BONUS',

  // ── Defense / resistance ──────────────────────────────────────────────────
  def_up: 'DEFENSE_BONUS',

  // ── Ultimate energy ───────────────────────────────────────────────────────
  usgs: 'ULTIMATE_GAIN_EFFICIENCY',
};

// ── Non-stat blackboard keys ────────────────────────────────────────────────
// These keys are metadata, not stats — they control effect duration, stacking, etc.

const NON_STAT_KEYS = new Set([
  'duration', 'max_stack', 'cd', 'lv', 'cooldown',
]);

// ── Warfarin skill ID → WeaponSkillType mapping ─────────────────────────────
// Stat boost skill IDs follow: wpn_attr_<stat>_<size> / wpn_sp_attr_<stat>_<size>
// where low → _S, mid → _M, high → _L

const SKILL_ID_TO_WEAPON_SKILL_TYPE: Record<string, string> = {
  // ── Attribute boosts ──────────────────────────────────────────────────────
  wpn_attr_str_low: 'STRENGTH_BOOST_S',
  wpn_attr_str_mid: 'STRENGTH_BOOST_M',
  wpn_attr_str_high: 'STRENGTH_BOOST_L',
  wpn_attr_agi_low: 'AGILITY_BOOST_S',
  wpn_attr_agi_mid: 'AGILITY_BOOST_M',
  wpn_attr_agi_high: 'AGILITY_BOOST_L',
  wpn_attr_wisd_low: 'INTELLECT_BOOST_S',
  wpn_attr_wisd_mid: 'INTELLECT_BOOST_M',
  wpn_attr_wisd_high: 'INTELLECT_BOOST_L',
  wpn_attr_will_low: 'WILL_BOOST_S',
  wpn_attr_will_mid: 'WILL_BOOST_M',
  wpn_attr_will_high: 'WILL_BOOST_L',
  wpn_attr_main_low: 'MAIN_ATTRIBUTE_BOOST_S',
  wpn_attr_main_mid: 'MAIN_ATTRIBUTE_BOOST_M',  // not yet seen in API
  wpn_attr_main_high: 'MAIN_ATTRIBUTE_BOOST_L',

  // ── ATK boosts ────────────────────────────────────────────────────────────
  wpn_sp_attr_atk_low: 'ATTACK_BOOST_S',
  wpn_sp_attr_atk_mid: 'ATTACK_BOOST_M',
  wpn_sp_attr_atk_high: 'ATTACK_BOOST_L',

  // ── HP boosts ─────────────────────────────────────────────────────────────
  wpn_sp_attr_hp_low: 'HP_BOOST_S',
  wpn_sp_attr_hp_mid: 'HP_BOOST_M',
  wpn_sp_attr_hp_high: 'HP_BOOST_L',

  // ── Critical rate boosts ──────────────────────────────────────────────────
  wpn_sp_attr_crirate_high: 'CRITICAL_RATE_BOOST_L',

  // ── Healing boosts ────────────────────────────────────────────────────────
  wpn_sp_attr_heal_mid: 'TREATMENT_EFFICIENCY_BOOST_M',
  wpn_sp_attr_heal_high: 'TREATMENT_EFFICIENCY_BOOST_L',

  // ── Physical damage boosts ────────────────────────────────────────────────
  wpn_sp_attr_phydam_low: 'PHYSICAL_DAMAGE_BOOST_S',
  wpn_sp_attr_phydam_mid: 'PHYSICAL_DAMAGE_BOOST_M',
  wpn_sp_attr_phydam_high: 'PHYSICAL_DAMAGE_BOOST_L',

  // ── Elemental damage boosts ───────────────────────────────────────────────
  wpn_sp_attr_firedam_mid: 'HEAT_DAMAGE_BOOST_M',
  wpn_sp_attr_firedam_high: 'HEAT_DAMAGE_BOOST_L',
  wpn_sp_attr_crystdam_mid: 'CRYO_DAMAGE_BOOST_M',
  wpn_sp_attr_crystdam_high: 'CRYO_DAMAGE_BOOST_L',
  wpn_sp_attr_electrondam_mid: 'ELECTRIC_DAMAGE_BOOST_M',
  wpn_sp_attr_naturaldam_high: 'NATURE_DAMAGE_BOOST_L',

  // ── Arts damage boosts ────────────────────────────────────────────────────
  wpn_sp_attr_magicdam_low: 'ARTS_BOOST_S',
  wpn_sp_attr_magicdam_mid: 'ARTS_BOOST_M',
  wpn_sp_attr_magicdam_high: 'ARTS_BOOST_L',

  // ── Arts intensity boosts ─────────────────────────────────────────────────
  wpn_sp_attr_phy_spell_mid: 'ARTS_INTENSITY_BOOST_M',
  wpn_sp_attr_phy_spell_high: 'ARTS_INTENSITY_BOOST_L',

  // ── Ultimate gain efficiency boosts ───────────────────────────────────────
  wpn_sp_attr_usgs_mid: 'ULTIMATE_GAIN_EFFICIENCY_BOOST_M',
  wpn_sp_attr_usgs_high: 'ULTIMATE_GAIN_EFFICIENCY_BOOST_L',
};

// ── Warfarin named skill ID → WeaponSkillType mapping ───────────────────────
// Named weapon skills have unique IDs like sk_wpn_sword_0006.
// Some skills share the same WeaponSkillType across different weapon types
// (e.g. Assault: Armament Prep appears on swords, greatswords, polearms, etc.)

const NAMED_SKILL_ID_TO_WEAPON_SKILL_TYPE: Record<string, string> = {
  // ── Sword ─────────────────────────────────────────────────────────────────
  sk_wpn_sword_0003: 'TARR_11_ASSAULT_ARMAMENT_PREP',
  sk_wpn_sword_0005: 'SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER',
  sk_wpn_sword_0006: 'FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL',
  sk_wpn_sword_0007: 'FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY',
  sk_wpn_sword_0008: 'CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST',
  sk_wpn_sword_0009: 'WAVE_TIDE_PURSUIT_UNENDING_CYCLE',
  sk_wpn_sword_0010: 'UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP',
  sk_wpn_sword_0011: 'RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS',
  sk_wpn_sword_0012: 'THERMITE_CUTTER_FLOW_THERMAL_RELEASE',
  sk_wpn_sword_0013: 'EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN',
  sk_wpn_sword_0014: 'WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA',
  sk_wpn_sword_0015: 'ASPIRANT_TWILIGHT_IMPOSING_PEAK',
  sk_wpn_sword_0016: 'NEVER_REST_FLOW_REINCARNATION',
  sk_wpn_sword_0018: 'TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION',
  sk_wpn_sword_0019: 'OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE',
  sk_wpn_sword_0020: 'FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT',
  sk_wpn_sword_0021: 'GRAND_VISION_INFLICTION_LONG_TIME_WISH',

  // ── Great Sword ───────────────────────────────────────────────────────────
  sk_wpn_claym_0003: 'INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST',
  sk_wpn_claym_0004: 'EXEMPLAR_SUPPRESSION_STACKED_HEW',
  sk_wpn_claym_0006: 'FORMER_FINERY_MINCING_THERAPY',
  sk_wpn_claym_0007: 'THUNDERBERGE_MEDICANT_EYE_OF_TALOS',
  sk_wpn_claym_0008: 'SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE',
  sk_wpn_claym_0009: 'QUENCHER_CRUSHER_HONED_INTO_LEGION',
  sk_wpn_claym_0010: 'DARHOFF_7_ASSAULT_ARMAMENT_PREP',
  sk_wpn_claym_0011: 'SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC',
  sk_wpn_claym_0012: 'FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD',
  sk_wpn_claym_0013: 'KHRAVENGGER_DETONATE_BONECHILLING',
  sk_wpn_claym_0014: 'ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE',
  sk_wpn_claym_0015: 'OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL',

  // ── Polearm ───────────────────────────────────────────────────────────────
  sk_wpn_lance_0003: 'PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA',
  sk_wpn_lance_0004: 'CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY',
  sk_wpn_lance_0006: 'COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES',
  sk_wpn_lance_0008: 'AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST',
  sk_wpn_lance_0009: 'OPERO_77_ASSAULT_ARMAMENT_PREP',
  sk_wpn_lance_0010: 'VALIANT_COMBATIVE_VIRTUOUS_GAIN',
  sk_wpn_lance_0011: 'JET_SUPPRESSION_ASTROPHYSICS',
  sk_wpn_lance_0012: 'MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN',
  sk_wpn_lance_0013: 'OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS',

  // ── Arts Unit ─────────────────────────────────────────────────────────────
  sk_wpn_funnel_0001: 'HYPERNOVA_AUTO_INSPIRING_START_OF_A_SAGA',
  sk_wpn_funnel_0002: 'JIMINY_12_ASSAULT_ARMAMENT_PREP',
  sk_wpn_funnel_0003: 'FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST',
  sk_wpn_funnel_0004: 'WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER',
  sk_wpn_funnel_0005: 'STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE',
  sk_wpn_funnel_0006: 'OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS',
  sk_wpn_funnel_0007: 'MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS',
  sk_wpn_funnel_0008: 'DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION',
  sk_wpn_funnel_0009: 'OBLIVION_TWILIGHT_HUMILIATION',
  sk_wpn_funnel_0010: 'CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR',
  sk_wpn_funnel_0011: 'DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED',
  sk_wpn_funnel_0012: 'FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH',
  sk_wpn_funnel_0013: 'DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS',
  sk_wpn_funnel_0014: 'OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS',

  // ── Handcannon ────────────────────────────────────────────────────────────
  sk_wpn_pistol_0001: 'PECO_5_ASSAULT_ARMAMENT_PREP',
  sk_wpn_pistol_0002: 'HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST',
  sk_wpn_pistol_0003: 'LONG_ROAD_PURSUIT_UNENDING_CYCLE',
  sk_wpn_pistol_0004: 'RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST',
  sk_wpn_pistol_0005: 'NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL',
  sk_wpn_pistol_0006: 'OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE',
  sk_wpn_pistol_0008: 'WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION',
  sk_wpn_pistol_0009: 'CLANNIBAL_INFLICTION_VICIOUS_PURGE',
  sk_wpn_pistol_0010: 'ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION',
  sk_wpn_pistol_0012: 'OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE',
};

// ── Description trigger phrase → TriggerConditionType mapping ────────────────
// Order matters: more specific patterns must come before general ones.

const TRIGGER_PATTERNS: { pattern: RegExp; trigger: string }[] = [
  { pattern: /casts an ultimate/i, trigger: 'CAST_ULTIMATE' },
  { pattern: /ultimate hits/i, trigger: 'CAST_ULTIMATE' },
  { pattern: /casts a battle skill/i, trigger: 'CAST_BATTLE_SKILL' },
  { pattern: /battle skill hits/i, trigger: 'CAST_BATTLE_SKILL' },
  { pattern: /battle skill applies/i, trigger: 'CAST_BATTLE_SKILL' },
  { pattern: /casts a combo skill/i, trigger: 'CAST_COMBO_SKILL' },
  { pattern: /combo skill applies/i, trigger: 'CAST_COMBO_SKILL' },
  { pattern: /combo skill/i, trigger: 'CAST_COMBO_SKILL' },
  { pattern: /skill recovers SP/i, trigger: 'SKILL_POINT_RECOVERY_FROM_SKILL' },
  { pattern: /recovers SP/i, trigger: 'SKILL_POINT_RECOVERY_FROM_SKILL' },
  { pattern: /grants a Link state/i, trigger: 'SKILL_POINT_RECOVERY_FROM_SKILL' },
  { pattern: /Final Strike/i, trigger: 'FINAL_STRIKE' },
  { pattern: /critical/i, trigger: 'CRITICAL_HIT' },
  { pattern: /HP is above/i, trigger: 'HP_ABOVE_THRESHOLD' },
  { pattern: /HP is below/i, trigger: 'HP_BELOW_THRESHOLD' },
  { pattern: /consumes? Vulnerability/i, trigger: 'CONSUME_VULNERABILITY' },
  { pattern: /applies? Vulnerability/i, trigger: 'APPLY_VULNERABILITY' },
  { pattern: /applies? Physical Susceptibility/i, trigger: 'APPLY_VULNERABILITY' },
  { pattern: /consumes? an Arts Reaction/i, trigger: 'CONSUME_ARTS_REACTION' },
  { pattern: /applies? an Arts Reaction/i, trigger: 'APPLY_ARTS_REACTION' },
  { pattern: /consumes? an Arts Infliction/i, trigger: 'CONSUME_ARTS_INFLICTION' },
  { pattern: /consumes? Corrosion/i, trigger: 'CONSUME_CORROSION' },
  { pattern: /consuming Solidification/i, trigger: 'CONSUME_SOLIDIFICATION' },
  { pattern: /consumes? Solidification/i, trigger: 'CONSUME_SOLIDIFICATION' },
  { pattern: /Combustion.*is applied/i, trigger: 'COMBUSTION' },
  { pattern: /applies? Combustion/i, trigger: 'COMBUSTION' },
  { pattern: /applies? Combusted/i, trigger: 'COMBUSTION' },
  { pattern: /Corrosion.*is applied/i, trigger: 'CORROSION' },
  { pattern: /applies? Corrosion/i, trigger: 'CORROSION' },
  { pattern: /applies? Solidification/i, trigger: 'SOLIDIFICATION' },
  { pattern: /applies? Originium Crystals/i, trigger: 'SOLIDIFICATION' },
  { pattern: /applies? Electrification/i, trigger: 'ELECTRIFICATION' },
  { pattern: /applies? an Arts Burst/i, trigger: 'APPLY_ARTS_BURST' },
  { pattern: /applies? Lifted/i, trigger: 'APPLY_LIFTED' },
  { pattern: /applies? Knocked Down/i, trigger: 'APPLY_KNOCKED_DOWN' },
  { pattern: /applies? Weakened/i, trigger: 'APPLY_KNOCKED_DOWN' },
  { pattern: /applies? Cryo Infliction/i, trigger: 'APPLY_CRYO_INFLICTION' },
  { pattern: /applies? Heat Infliction/i, trigger: 'APPLY_HEAT_INFLICTION' },
  { pattern: /applies? Electric Infliction/i, trigger: 'APPLY_ELECTRIC_INFLICTION' },
  { pattern: /applies? Nature Infliction/i, trigger: 'APPLY_NATURE_INFLICTION' },
  { pattern: /(?:applies?|deals) (?:a )?Physical Status/i, trigger: 'APPLY_PHYSICAL_STATUS' },
  { pattern: /against Vulnerable/i, trigger: 'APPLY_VULNERABILITY' },
  { pattern: /HP treatment/i, trigger: 'HP_TREATMENT' },
  { pattern: /team.*casts? battle skill/i, trigger: 'TEAM_CAST_BATTLE_SKILL' },
  { pattern: /operator.*attacked/i, trigger: 'OPERATOR_ATTACKED' },
  { pattern: /Protected operator takes DMG/i, trigger: 'OPERATOR_ATTACKED' },
  { pattern: /Stagger Node/i, trigger: 'STAGGER_NODE' },
  { pattern: /stagger/i, trigger: 'STAGGER' },
];

// ── Trigger source detection ─────────────────────────────────────────────────

/** Detect who receives the conditional buff from the description text. */
function detectTriggerSources(text: string): string[] {
  const sources: string[] = [];

  // "other operators in the team" / "other operators" patterns
  if (/other operators/i.test(text)) {
    sources.push('OTHER_OPERATORS');
  }

  // "the wielder gains" / "wielder's" / "the wielder receives"
  if (/\bwielder\b/i.test(text)) {
    if (!sources.includes('SELF')) sources.push('SELF');
  }

  // "teammates" without "other operators" already matched
  if (/\bteammates?\b/i.test(text) && !sources.includes('OTHER_OPERATORS')) {
    sources.push('OTHER_OPERATORS');
  }

  // "team DMG" / "team gains" — whole team including self
  if (/\bteam\b(?!\s*cast)/i.test(text) && sources.length === 0) {
    sources.push('TEAM');
  }

  // Default to SELF if nothing detected
  if (sources.length === 0) {
    sources.push('SELF');
  }

  return sources;
}

// ── Rich text formatting ────────────────────────────────────────────────────

/** Strip rich text tags but keep {variable:format} placeholders for runtime interpolation. */
function formatDescription(text: string): string {
  return text
    .replace(/<[#@][^>]*>/g, '')     // Remove rich text tags like <@ba.vup>, <#ba.consume>
    .replace(/<\/>/g, '')            // Remove closing tags
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Strip rich text tags AND remove {variable} placeholders (for stat boost descriptions). */
function stripRichText(text: string): string {
  return formatDescription(text)
    .replace(/\{[^}]+\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Types ────────────────────────────────────────────────────────────────────

interface WarfarinWeaponListEntry {
  id: string;
  slug: string;
  name: string;
  rarity: number;
  weaponType: number;
}

interface BlackboardEntry {
  key: string;
  value: number;
  valueStr: string;
}

interface SkillLevelEntry {
  skillId: string;
  skillName: string;
  description: string;
  level: number;
  blackboard: BlackboardEntry[];
  tagId: string;
  coolDown: number;
  maxChargeTime: number;
}

interface UpgradeEntry {
  weaponLv: number;
  baseAtk: number;
}

// ── Name → enum conversion ───────────────────────────────────────────────────

/** Convert weapon display name to enum-style identifier (e.g. "Never Rest" → "NEVER_REST") */
function nameToEnumKey(name: string): string {
  return name
    .replace(/['']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}

/** Convert enum-style identifier to display name (e.g. "NEVER_REST" → "Never Rest") */
function enumKeyToName(key: string): string {
  return key
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Named skill description analysis ────────────────────────────────────────

/** Extract all {variable_name} references from a description substring. */
function extractVarRefs(text: string): string[] {
  const results: string[] = [];
  const re = /\{(\w+)(?::[^}]*)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results;
}

/**
 * Detect the trigger conditions from a description's conditional section.
 * Returns all matching TriggerConditionType values (deduplicated).
 */
function detectTriggerConditions(text: string): string[] {
  const triggers: string[] = [];
  for (const { pattern, trigger } of TRIGGER_PATTERNS) {
    if (pattern.test(text) && !triggers.includes(trigger)) {
      triggers.push(trigger);
    }
  }
  return triggers;
}

/**
 * Split a named skill description into permanent (pre-trigger) and conditional
 * (post-trigger) sections.
 *
 * Rules:
 * - If the description starts with a stat boost (e.g., "ATK +{atk_up}..."),
 *   the first sentence is permanent. Everything after the first period is conditional.
 * - If the description starts with a trigger phrase ("When", "After", "Whenever"),
 *   there are no permanent stats — everything is conditional.
 */
function splitDescription(rawDesc: string): { permanent: string; conditional: string } {
  // Strip rich text tags for analysis but keep {var} placeholders
  const desc = formatDescription(rawDesc);

  // Check if first sentence starts with a trigger phrase
  const startsWithTrigger = /^(When|After|Whenever|Every time)\b/i.test(desc);

  if (startsWithTrigger) {
    return { permanent: '', conditional: desc };
  }

  // Find the split point: first sentence ends at the first ". " followed by a trigger
  // or at the first ". " if followed by "When"/"After"/etc.
  const splitMatch = desc.match(/\.\s+(When|After|Whenever|Every time)\b/i);
  if (splitMatch && splitMatch.index !== undefined) {
    const splitIdx = splitMatch.index + 1; // include the period
    return {
      permanent: desc.substring(0, splitIdx).trim(),
      conditional: desc.substring(splitIdx).trim(),
    };
  }

  // No trigger phrase found — treat entire description as permanent
  return { permanent: desc, conditional: '' };
}

/**
 * Build a flattened level entry for a named skill.
 * Permanent stats go at the root, conditional stats go in conditionalStats[].
 */
function buildNamedLevelEntry(
  bb: BlackboardEntry[],
  level: number,
  permanentVarRefs: Set<string>,
  conditionalVarRefs: Set<string>,
  triggerConditions: string[],
  triggerSources: string[],
  durationValue: number | undefined,
  maxStacks: number | undefined,
) {
  const entry: Record<string, unknown> = { level };

  // Permanent stats: var refs found in the permanent section
  for (const { key, value } of bb) {
    if (NON_STAT_KEYS.has(key)) continue;
    if (permanentVarRefs.has(key)) {
      const statKey = BLACKBOARD_KEY_TO_STAT[key] ?? key;
      entry[statKey] = value;
    }
  }

  // Conditional stats: var refs found in the conditional section
  if (triggerConditions.length > 0 && conditionalVarRefs.size > 0) {
    const conditional: Record<string, unknown> = {
      triggerConditions,
      triggerSources,
    };

    if (durationValue !== undefined) {
      conditional.duration = { value: durationValue, unit: 'SECOND' };
    }
    if (maxStacks !== undefined && maxStacks > 1) {
      conditional.maxStacks = maxStacks;
    }

    for (const { key, value } of bb) {
      if (NON_STAT_KEYS.has(key)) continue;
      if (conditionalVarRefs.has(key)) {
        const statKey = BLACKBOARD_KEY_TO_STAT[key] ?? key;
        conditional[statKey] = value;
      }
    }

    entry.conditionalStats = [conditional];
  }

  return entry;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function classifySkill(skillId: string, tagId: string): string {
  if (skillId.startsWith('wpn_attr_') || skillId.startsWith('wpn_sp_attr_')) {
    return 'STAT_BOOST';
  }
  if (tagId.startsWith('attr_')) {
    return 'STAT_BOOST';
  }
  return 'NAMED';
}

function flattenBlackboard(bb: BlackboardEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of bb) {
    const key = BLACKBOARD_KEY_TO_STAT[entry.key] ?? entry.key;
    result[key] = entry.value;
  }
  return result;
}

function parseWeaponSkill(
  skillId: string,
  levels: SkillLevelEntry[],
  slot: number,
) {
  const first = levels[0];
  const skillCategory = classifySkill(skillId, first.tagId);
  const weaponSkillType = SKILL_ID_TO_WEAPON_SKILL_TYPE[skillId]
    ?? NAMED_SKILL_ID_TO_WEAPON_SKILL_TYPE[skillId];

  if (!weaponSkillType) {
    console.warn(`    Unmapped skill ID: ${skillId} (${first.skillName})`);
  }

  // ── Stat boost skills: simple flatten ───────────────────────────────────
  if (skillCategory === 'STAT_BOOST') {
    return {
      weaponSkillType: weaponSkillType ?? skillId,
      name: first.skillName,
      description: stripRichText(first.description),
      skillSlot: slot,
      skillCategory,
      allLevels: levels.map(lv => {
        const flat = flattenBlackboard(lv.blackboard);
        return { level: lv.level, ...flat };
      }),
    };
  }

  // ── Named skills: split permanent vs conditional stats ──────────────────
  const rawDesc = first.description;
  const { permanent, conditional } = splitDescription(rawDesc);

  const permanentVarRefs = new Set(extractVarRefs(permanent));
  const conditionalVarRefs = new Set(extractVarRefs(conditional));

  // Remove non-stat vars from conditional refs
  NON_STAT_KEYS.forEach(key => {
    conditionalVarRefs.delete(key);
    permanentVarRefs.delete(key);
  });

  // Detect trigger conditions and sources from the conditional text
  const triggerConditions = detectTriggerConditions(conditional);
  const triggerSources = conditional ? detectTriggerSources(conditional) : [];
  if (conditional && triggerConditions.length === 0) {
    console.warn(`    Could not detect trigger condition for ${first.skillName}: "${conditional.substring(0, 80)}..."`);
  }

  // Extract duration and max_stack from first level's blackboard
  const firstBb = first.blackboard;
  const durationEntry = firstBb.find(e => e.key === 'duration');
  const maxStackEntry = firstBb.find(e => e.key === 'max_stack');

  return {
    weaponSkillType: weaponSkillType ?? skillId,
    name: first.skillName,
    description: formatDescription(rawDesc),
    skillSlot: slot,
    skillCategory,
    allLevels: levels.map(lv => buildNamedLevelEntry(
      lv.blackboard,
      lv.level,
      permanentVarRefs,
      conditionalVarRefs,
      triggerConditions,
      triggerSources,
      durationEntry?.value,
      maxStackEntry?.value,
    )),
  };
}

export async function fetchWeaponList(): Promise<WarfarinWeaponListEntry[]> {
  console.log(`Fetching weapon list from Warfarin API...`);
  const res = await fetch(WEAPONS_LIST_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json() as { data: WarfarinWeaponListEntry[] };
  return json.data;
}

export async function fetchWeaponDetail(slug: string): Promise<Record<string, unknown>> {
  const url = `${WEAPONS_DETAIL_URL}/${slug}`;
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json() as { data: Record<string, unknown> };
  return json.data;
}

export function buildWeaponEntry(data: Record<string, unknown>) {
  const wbt = data.weaponBasicTable as Record<string, unknown>;
  const upgradeList = (data.weaponUpgradeTemplateTable as Record<string, unknown>).list as UpgradeEntry[];
  const skillPatchTable = data.skillPatchTable as Record<string, { SkillPatchDataBundle: SkillLevelEntry[] }>;

  const weaponType = WARFARIN_WEAPON_TYPE[wbt.weaponType as number];
  if (!weaponType) {
    console.warn(`    Unknown weaponType ${wbt.weaponType} for ${wbt.engName as string}`);
  }

  // All levels with base attack
  const allLevels = upgradeList.map(u => ({
    level: u.weaponLv,
    baseAttack: u.baseAtk,
  }));

  // Parse skills in order of weaponSkillList
  const skillIds = wbt.weaponSkillList as string[];
  const skills = skillIds.map((skillId: string, idx: number) => {
    const skillData = skillPatchTable[skillId];
    if (!skillData) {
      console.warn(`    Skill ${skillId} not found in skillPatchTable`);
      return null;
    }
    return parseWeaponSkill(skillId, skillData.SkillPatchDataBundle, idx + 1);
  }).filter(Boolean);

  const weaponEnumKey = nameToEnumKey(wbt.engName as string);

  return {
    weaponId: weaponEnumKey,
    name: enumKeyToName(weaponEnumKey),
    weaponType: weaponType ?? `UNKNOWN_${wbt.weaponType as number}`,
    weaponRarity: wbt.rarity as number,
    allLevels,
    skills,
    dataSources: ['WARFARIN'],
  };
}

// ── Data source preservation ─────────────────────────────────────────────────

function hasSelfDataSource(obj: unknown): boolean {
  if (obj == null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some(item => hasSelfDataSource(item));
  const record = obj as Record<string, unknown>;
  if (Array.isArray(record.dataSources) && record.dataSources.includes('SELF')) return true;
  return Object.values(record).some(v => hasSelfDataSource(v));
}

// ── Main ─────────────────────────────────────────────────────────────────────

function weaponFilePath(slug: string): string {
  return path.join(WEAPONS_DIR, `${slug}.json`);
}

async function parseOne(slug: string) {
  console.log(`\n── Parsing weapon: ${slug} ──`);
  const data = await fetchWeaponDetail(slug);
  const entry = buildWeaponEntry(data);

  const filePath = weaponFilePath(slug);

  // Preserve SELF entries
  if (fs.existsSync(filePath)) {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (hasSelfDataSource(existing)) {
      console.log(`  Preserving SELF data for ${slug}`);
      return;
    }
  }

  if (!fs.existsSync(WEAPONS_DIR)) {
    fs.mkdirSync(WEAPONS_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n');
  console.log(`  Wrote ${slug} (${entry.name}) to ${filePath}`);
  const lv1 = entry.allLevels[0]?.baseAttack ?? 0;
  const lv90 = entry.allLevels[entry.allLevels.length - 1]?.baseAttack ?? 0;
  console.log(`  Type: ${entry.weaponType}, Rarity: ${entry.weaponRarity}, ATK: ${lv1}→${lv90}`);
  console.log(`  Skills: ${entry.skills.map((s: { name: string } | null) => s?.name).join(', ')}`);
}

async function parseAll() {
  const weaponList = await fetchWeaponList();
  console.log(`Found ${weaponList.length} weapons`);

  if (!fs.existsSync(WEAPONS_DIR)) {
    fs.mkdirSync(WEAPONS_DIR, { recursive: true });
  }

  let count = 0;
  for (const weapon of weaponList) {
    console.log(`\n── Parsing weapon: ${weapon.slug} ──`);
    try {
      const data = await fetchWeaponDetail(weapon.slug);
      const entry = buildWeaponEntry(data);

      const filePath = weaponFilePath(weapon.slug);
      if (fs.existsSync(filePath)) {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (hasSelfDataSource(existing)) {
          console.log(`  Preserving SELF data for ${weapon.slug}`);
          continue;
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n');
      count++;
      const lv1 = entry.allLevels[0]?.baseAttack ?? 0;
      const lv90 = entry.allLevels[entry.allLevels.length - 1]?.baseAttack ?? 0;
      console.log(`  ${entry.name}: ${entry.weaponType} r${entry.weaponRarity}, ATK ${lv1}→${lv90}, ${entry.skills.length} skills`);
    } catch (err) {
      console.warn(`  Failed: ${(err as Error).message}`);
    }
  }

  console.log(`\n── Done ──`);
  console.log(`Wrote ${count} weapons to ${WEAPONS_DIR}/`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx src/model/utils/parsers/parseWarfarinWeapons.ts <slug | --all>');
    process.exit(1);
  }

  if (arg === '--all') {
    await parseAll();
  } else {
    await parseOne(arg);
  }
}

const isDirectRun = process.argv[1]?.includes('parseWarfarinWeapons');
if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
