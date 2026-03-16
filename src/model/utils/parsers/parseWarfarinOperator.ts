/**
 * Fetches operator data from the Warfarin API and outputs a JSON blob
 * for src/model/game-data/operators/<slug>.json.
 *
 * Usage:
 *   npx tsx src/model/utils/parsers/parseWarfarinOperator.ts <slug>
 *
 * Example:
 *   npx tsx src/model/utils/parsers/parseWarfarinOperator.ts laevatain
 */

import * as fs from 'fs';
import * as path from 'path';
import { OperatorInformationType, PotentialEffectType, ParameterModifyType } from '../../enums/operators';
import { WarfarinAttributeType, warfarinToStat } from './warfarin';

const API_BASE = 'https://api.warfarin.wiki/v1/en/operators';
const OPERATORS_DIR = path.resolve(__dirname, '../../game-data/operators');

// ── Warfarin → our enum mappings ────────────────────────────────────────────

const CHAR_ID_TO_OPERATOR: Record<string, string> = {
  'chr_0016_laevat': 'LAEVATAIN',
  'chr_0019_karin': 'AKEKURI',
  'chr_0023_antal': 'ANTAL',
  'chr_0025_ardelia': 'ARDELIA',
  'chr_0006_wolfgd': 'WULFGARD',
  'chr_0003_endminf': 'ENDMINISTRATOR',
  'chr_0015_lifeng': 'LIFENG',
  'chr_0005_chen': 'CHEN_QIANYU',
  'chr_0021_whiten': 'ESTELLA',
  'chr_0009_azrila': 'EMBER',
  'chr_0014_aurora': 'SNOWSHINE',
  'chr_0020_meurs': 'CATCHER',
  'chr_0013_aglina': 'GILBERTA',
  'chr_0011_seraph': 'XAIHI',
  'chr_0004_pelica': 'PERLICA',
  'chr_0022_bounda': 'FLUORITE',
  'chr_0026_lastrite': 'LAST_RITE',
  'chr_0017_yvonne': 'YVONNE',
  'chr_0012_avywen': 'AVYWENNA',
  'chr_0018_dapan': 'DA_PAN',
  'chr_0029_pograni': 'POGRANICHNIK',
  'chr_0024_deepfin': 'ALESH',
  'chr_0007_ikut': 'ARCLIGHT',
  'chr_0027_tangtang': 'TANGTANG',
};

const PROFESSION_MAP: Record<number, string> = {
  0: 'GUARD',
  2: 'DEFENDER',
  4: 'SUPPORTER',
  5: 'CASTER',
  7: 'VANGUARD',
  8: 'STRIKER',
};

const WEAPON_TYPE_MAP: Record<number, string> = {
  1: 'SWORD',
  2: 'ARTS_UNIT',
  3: 'GREAT_SWORD',
  5: 'POLEARM',
  6: 'HANDCANNON',
};

const ELEMENT_MAP: Record<string, string> = {
  'Fire': 'HEAT',
  'Pulse': 'ELECTRIC',
  'Natural': 'NATURE',
  'Cryst': 'CRYO',
  'Physical': 'PHYSICAL',
};

/**
 * Maps warfarin skill IDs → CombatSkillsType enum values.
 * Warfarin uses: {charId}_{suffix} where suffix is attack/normal_skill/combo_skill/ultimate_skill.
 * Variants: _during_ult (enhanced), ult_attack1-4 (enhanced basic sequences).
 */
const WARFARIN_SKILL_ID_MAP: Record<string, string> = {
  // Laevatain
  'chr_0016_laevat_attack': 'FLAMING_CINDERS',
  'chr_0016_laevat_normal_skill': 'SMOULDERING_FIRE',
  'chr_0016_laevat_normal_skill_during_ult': 'SMOULDERING_FIRE_ENHANCED',
  'chr_0016_laevat_combo_skill': 'SEETHE',
  'chr_0016_laevat_ultimate_skill': 'TWILIGHT',
  'chr_0016_laevat_ult_attack1': 'FLAMING_CINDERS_ENHANCED',
  'chr_0016_laevat_ult_attack2': 'FLAMING_CINDERS_ENHANCED',
  'chr_0016_laevat_ult_attack3': 'FLAMING_CINDERS_ENHANCED',
  'chr_0016_laevat_ult_attack4': 'FLAMING_CINDERS_ENHANCED',
  // Antal
  'chr_0023_antal_attack': 'EXCHANGE_CURRENT',
  'chr_0023_antal_normal_skill': 'SPECIFIED_RESEARCH_SUBJECT',
  'chr_0023_antal_combo_skill': 'EMP_TEST_SITE',
  'chr_0023_antal_ultimate_skill': 'OVERCLOCKED_MOMENT',
  // Akekuri
  'chr_0019_karin_attack': 'SWORD_OF_ASPIRATION',
  'chr_0019_karin_normal_skill': 'BURST_OF_PASSION',
  'chr_0019_karin_combo_skill': 'FLASH_AND_DASH',
  'chr_0019_karin_ultimate_skill': 'SQUAD_ON_ME',
  // Wulfgard
  'chr_0006_wolfgd_attack': 'RAPID_FIRE_AKIMBO',
  'chr_0006_wolfgd_normal_skill': 'THERMITE_TRACERS',
  'chr_0006_wolfgd_combo_skill': 'FRAG_GRENADE_BETA',
  'chr_0006_wolfgd_ultimate_skill': 'WOLVEN_FURY',
  // Ardelia
  'chr_0025_ardelia_attack': 'ROCKY_WHISPERS',
  'chr_0025_ardelia_normal_skill': 'DOLLY_RUSH',
  'chr_0025_ardelia_combo_skill': 'ERUPTION_COLUMN',
  'chr_0025_ardelia_ultimate_skill': 'WOOLY_PARTY',
  // Endministrator
  'chr_0003_endminf_attack': 'DESTRUCTIVE_SEQUENCE',
  'chr_0003_endminf_normal_skill': 'CONSTRUCTIVE_SEQUENCE',
  'chr_0003_endminf_combo_skill': 'SEALING_SEQUENCE',
  'chr_0003_endminf_ultimate_skill': 'BOMBARDMENT_SEQUENCE',
  // Lifeng
  'chr_0015_lifeng_attack': 'RUINATION',
  'chr_0015_lifeng_normal_skill': 'TURBID_AVATAR',
  'chr_0015_lifeng_combo_skill': 'ASPECT_OF_WRATH',
  'chr_0015_lifeng_ultimate_skill': 'HEART_OF_THE_UNMOVING',
  // Chen Qianyu
  'chr_0005_chen_attack': 'SOARING_BREAK',
  'chr_0005_chen_normal_skill': 'ASCENDING_STRIKE',
  'chr_0005_chen_combo_skill': 'SOAR_TO_THE_STARS',
  'chr_0005_chen_ultimate_skill': 'BLADE_GALE',
  // Estella
  'chr_0021_whiten_attack': 'AUDIO_NOISE',
  'chr_0021_whiten_normal_skill': 'ONOMATOPOEIA',
  'chr_0021_whiten_combo_skill': 'DISTORTION',
  'chr_0021_whiten_ultimate_skill': 'TREMOLO',
  // Ember
  'chr_0009_azrila_attack': 'SWORD_ART_OF_ASSAULT',
  'chr_0009_azrila_normal_skill': 'FORWARD_MARCH',
  'chr_0009_azrila_combo_skill': 'FRONTLINE_SUPPORT',
  'chr_0009_azrila_ultimate_skill': 'RE_IGNITED_OATH',
  // Snowshine
  'chr_0014_aurora_attack': 'HYPOTHERMIC_ASSAULT',
  'chr_0014_aurora_normal_skill': 'SATURATED_DEFENSE',
  'chr_0014_aurora_combo_skill': 'POLAR_RESCUE',
  'chr_0014_aurora_ultimate_skill': 'FRIGID_SNOWFIELD',
  // Catcher
  'chr_0020_meurs_attack': 'RIGID_INTERDICTION_BASIC',
  'chr_0020_meurs_normal_skill': 'RIGID_INTERDICTION',
  'chr_0020_meurs_combo_skill': 'TIMELY_SUPPRESSION',
  'chr_0020_meurs_ultimate_skill': 'TEXTBOOK_ASSAULT',
  // Gilberta
  'chr_0013_aglina_attack': 'BEAM_COHESION_ARTS',
  'chr_0013_aglina_normal_skill': 'GRAVITY_MODE',
  'chr_0013_aglina_combo_skill': 'MATRIX_DISPLACEMENT',
  'chr_0013_aglina_ultimate_skill': 'GRAVITY_FIELD',
  // Xaihi
  'chr_0011_seraph_attack': 'BASIC_ATTACK',
  'chr_0011_seraph_normal_skill': 'DISTRIBUTED_DOS',
  'chr_0011_seraph_combo_skill': 'STRESS_TESTING',
  'chr_0011_seraph_ultimate_skill': 'STACK_OVERFLOW',
  // Perlica
  'chr_0004_pelica_attack': 'PROTOCOL_ALPHA_BREACH',
  'chr_0004_pelica_normal_skill': 'PROTOCOL_OMEGA_STRIKE',
  'chr_0004_pelica_combo_skill': 'INSTANT_PROTOCOL_CHAIN',
  'chr_0004_pelica_ultimate_skill': 'PROTOCOL_EPSILON',
  // Fluorite
  'chr_0022_bounda_attack': 'SIGNATURE_GUN_KATA',
  'chr_0022_bounda_normal_skill': 'TINY_SURPRISE',
  'chr_0022_bounda_combo_skill': 'FREE_GIVEAWAY',
  'chr_0022_bounda_ultimate_skill': 'APEX_PRANKSTER',
  // Last Rite
  'chr_0026_lastrite_attack': 'DANCE_OF_RIME',
  'chr_0026_lastrite_normal_skill': 'ESOTERIC_LEGACY',
  'chr_0026_lastrite_combo_skill': 'WINTERS_DEVOURER',
  'chr_0026_lastrite_ultimate_skill': 'VIGIL_SERVICES',
  // Yvonne
  'chr_0017_yvonne_attack': 'EXUBERANT_TRIGGER',
  'chr_0017_yvonne_normal_skill': 'BRR_BRR_BOMB',
  'chr_0017_yvonne_combo_skill': 'FLASHFREEZER',
  'chr_0017_yvonne_ultimate_skill': 'CRYOBLASTING_PISTOLIER',
  // Avywenna
  'chr_0012_avywen_attack': 'THUNDERLANCE_BLITZ',
  'chr_0012_avywen_normal_skill': 'THUNDERLANCE_INTERDICTION',
  'chr_0012_avywen_combo_skill': 'THUNDERLANCE_STRIKE',
  'chr_0012_avywen_ultimate_skill': 'THUNDERLANCE_FINAL_SHOCK',
  // Da Pan
  'chr_0018_dapan_attack': 'ROLLING_CUT',
  'chr_0018_dapan_normal_skill': 'FLIP_DA_WOK',
  'chr_0018_dapan_combo_skill': 'MORE_SPICE',
  'chr_0018_dapan_ultimate_skill': 'CHOP_N_DUNK',
  // Pogranichnik
  'chr_0029_pograni_attack': 'ALL_OUT_OFFENSIVE',
  'chr_0029_pograni_normal_skill': 'THE_PULVERIZING_FRONT',
  'chr_0029_pograni_combo_skill': 'FULL_MOON_SLASH',
  'chr_0029_pograni_ultimate_skill': 'SHIELDGUARD_BANNER',
  // Alesh
  'chr_0024_deepfin_attack': 'ROD_CASTING',
  'chr_0024_deepfin_normal_skill': 'UNCONVENTIONAL_LURE',
  'chr_0024_deepfin_combo_skill': 'AUGER_ANGLING',
  'chr_0024_deepfin_ultimate_skill': 'ONE_MONSTER_CATCH',
  // Arclight
  'chr_0007_ikut_attack': 'SEEK_AND_HUNT',
  'chr_0007_ikut_normal_skill': 'TEMPESTUOUS_ARC',
  'chr_0007_ikut_combo_skill': 'PEAL_OF_THUNDER',
  'chr_0007_ikut_ultimate_skill': 'EXPLODING_BLITZ',
  // Tangtang
  'chr_0027_tangtang_attack': 'BASIC_ATTACK',
  'chr_0027_tangtang_normal_skill': 'BATTLE_SKILL',
  'chr_0027_tangtang_combo_skill': 'COMBO_SKILL',
  'chr_0027_tangtang_ultimate_skill': 'ULTIMATE',
};

/** Maps warfarin buff IDs → StatusType enum values. */
const BUFF_ID_TO_STATUS: Record<string, string> = {
  'buff_chr_0016_laevat_potential_5': 'LAEVATAIN_POTENTIAL5_PROOF_OF_EXISTENCE',
  'buff_chr_0019_karin_potential_1': 'AKEKURI_POTENTIAL1_POSITIVE_FEEDBACK',
  'buff_chr_0019_karin_potential_5': 'AKEKURI_POTENTIAL5_TEMPO_OF_AWARENESS',
  'buff_chr_0025_ardelia_potential5_vfx': 'ARDELIA_POTENTIAL5_VOLCANIC_STEAM',
  'buff_chr_0003_endminf_potential1': 'ENDMINISTRATOR_POTENTIAL1_FINAL_AWAKENING',
  'buff_chr_0003_endminf_potential2': 'ENDMINISTRATOR_POTENTIAL2_REFLECTION_OF_AUTHORITY',
  'buff_chr_0003_endminf_potential5': 'ENDMINISTRATOR_POTENTIAL5',
  'buff_chr_0005_chen_potential_1': 'CHEN_QIANYU_POTENTIAL1_SHADOWLESS',
  'buff_chr_0013_aglina_potential_5': 'GILBERTA_POTENTIAL5_SPECIAL_MAIL',
  'buff_chr_0015_lifeng_potential_5': 'LIFENG_POTENTIAL5_UNREMITTING',
  'buff_chr_0015_lifeng_potential_5_vfx': 'LIFENG_POTENTIAL5_UNREMITTING',
  'buff_chr_0009_azrila_potential_5': 'EMBER_POTENTIAL5_THE_STEEL_OATH',
  'buff_chr_0004_pelica_potential_3': 'PERLICA_POTENTIAL3_SUPERVISORY_DUTIES',
  'buff_chr_0007_ikut_finish_count_p5': 'ARCLIGHT_POTENTIAL5_SERVANT_OF_THE_WILDLANDS',
  'buff_chr_0021_whiten_potential_5': 'ESTELLA_POTENTIAL5_SURVIVAL_IS_A_WIN',
  'buff_chr_0020_meurs_potential_1': 'CATCHER_POTENTIAL1_MULTI_LAYERED_READINESS',
  'buff_chr_0022_bounda_potential_5_auro': 'FLUORITE_POTENTIAL5_CRAVER_OF_CHAOS',
  'buff_chr_0026_lastrite_potential5_vfx': 'LAST_RITE_POTENTIAL5_WINTER_IS_RETURNING',
  'buff_chr_0017_yvonne_potential_5_effect': 'YVONNE_POTENTIAL5_EXPERT_MECHCRAFTER',
  'buff_chr_0029_pograni_potential_5_effect': 'POGRANICHNIK_POTENTIAL5_NEWLY_FORGED_BLADE',
};

function mapBuffId(buffId: string): string {
  return BUFF_ID_TO_STATUS[buffId] ?? buffId;
}

function mapSkillId(warfarinSkillId: string): string {
  return WARFARIN_SKILL_ID_MAP[warfarinSkillId] ?? warfarinSkillId;
}

const BB_KEY_MAP: Record<string, string> = {
  'atb': 'SKILL_POINT',
  'ratio': 'DAMAGE_MULTIPLIER',
  'atk_scale': 'DAMAGE_MULTIPLIER',
  'duration': 'DURATION',
  'extra_scaling': 'EXTRA_SCALING',
};

function mapBbKey(bbKey: string): string {
  return BB_KEY_MAP[bbKey] ?? bbKey;
}

/** Maps warfarin outer modifyType → PotentialEffectType. */
const POTENTIAL_EFFECT_TYPE_MAP: Record<number, PotentialEffectType> = {
  2: PotentialEffectType.SKILL_COST,
  3: PotentialEffectType.SKILL_PARAMETER,
  4: PotentialEffectType.STAT_MODIFIER,
  5: PotentialEffectType.BUFF_ATTACHMENT,
};

/** Maps warfarin inner parameter modifyType → ParameterModifyType. */
const PARAMETER_MODIFY_TYPE_MAP: Record<number, ParameterModifyType> = {
  1: ParameterModifyType.ADDITIVE,
  2: ParameterModifyType.MULTIPLICATIVE,
  3: ParameterModifyType.UNIQUE_MULTIPLIER,
};

// ── Warfarin API types ──────────────────────────────────────────────────────

interface WarfarinAttr {
  attrType: number;
  attrValue: number;
}

interface WarfarinLevelEntry {
  Attribute: { attrs: WarfarinAttr[] };
  breakStage: number;
}

interface WarfarinAttrModifier {
  attrType: number;
  attrValue: number;
  modifierType: number;
  modifyAttributeType: number;
}

interface WarfarinSkillBbModifier {
  bbKey: string;
  floatValue: number;
  modifyType: number;
  skillId: string;
  stringValue: string;
}

interface WarfarinSkillParamModifier {
  modifyType: number;
  paramType: number;
  paramValue: number;
  skillId: string;
}

interface WarfarinPotentialEffect {
  attrModifier: WarfarinAttrModifier;
  modifyType: number;
  skillBbModifier: WarfarinSkillBbModifier;
  skillParamModifier: WarfarinSkillParamModifier;
  attachBuff: { buffId: string; blackboard: { key: string; value: number }[] };
}

interface WarfarinPotentialEntry {
  dataList: WarfarinPotentialEffect[];
  desc: string;
  id: string;
}

interface WarfarinPotentialUnlock {
  level: number;
  name: string;
  potentialEffectId: string;
}

interface WarfarinSkillGroup {
  desc: string;
  icon: string;
  name: string;
  skillGroupId: string;
  skillGroupType: number;
  skillIdList: string[];
}

interface WarfarinBlackboardEntry {
  key: string;
  value: number;
  valueStr: string;
}

interface WarfarinSkillPatchBundle {
  skillId: string;
  skillName: string;
  description: string;
  level: number;
  blackboard: WarfarinBlackboardEntry[];
  tagId: string;
  coolDown: number;
  maxChargeTime: number;
}

interface WarfarinPassiveSkillNodeInfo {
  breakStage: number;
  iconId: string;
  index: number;
  level: number;
  name: string;
  talentEffectId: string;
}

interface WarfarinAttributeNodeInfo {
  attributeModifier: { attrType: number; attrValue: number; modifierType: number; modifyAttributeType: number };
  breakStage: number;
  desc: string;
  favorability: number;
  title: string;
}

interface WarfarinTalentNode {
  nodeId: string;
  nodeType: number;
  passiveSkillNodeInfo: WarfarinPassiveSkillNodeInfo;
  attributeNodeInfo: WarfarinAttributeNodeInfo;
}

interface WarfarinApiResponse {
  meta: unknown;
  data: {
    characterTable: {
      attributes: WarfarinLevelEntry[];
      charId: string;
      charTypeId: string;
      engName: string;
      mainAttrType: number;
      name: string;
      profession: number;
      rarity: number;
      subAttrType: number;
      weaponType: number;
    };
    charGrowthTable: {
      skillGroupMap: Record<string, WarfarinSkillGroup>;
      talentNodeMap: Record<string, WarfarinTalentNode>;
    };
    characterPotentialTable: {
      potentialUnlockBundle: WarfarinPotentialUnlock[];
    };
    potentialTalentEffectTable: Record<string, WarfarinPotentialEntry>;
    skillPatchTable: Record<string, { SkillPatchDataBundle: WarfarinSkillPatchBundle[] }>;
  };
}

// ── Attrs to track ──────────────────────────────────────────────────────────

const TRACKED_ATTRS = new Set<number>([
  WarfarinAttributeType.MaxHp,
  WarfarinAttributeType.Atk,
  WarfarinAttributeType.Def,
  WarfarinAttributeType.Str,
  WarfarinAttributeType.Agi,
  WarfarinAttributeType.Wisd,
  WarfarinAttributeType.Will,
  WarfarinAttributeType.CriticalRate,
  WarfarinAttributeType.CriticalDamageIncrease,
  WarfarinAttributeType.Weight,
  WarfarinAttributeType.NormalAttackRange,
  WarfarinAttributeType.MaxPoise,
  WarfarinAttributeType.PoiseRecTime,
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapAttrType(attrType: number): string {
  const stat = warfarinToStat(attrType);
  if (stat != null) return stat;
  return String(attrType);
}

function extractAttrs(attrs: WarfarinAttr[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const { attrType, attrValue } of attrs) {
    if (TRACKED_ATTRS.has(attrType)) {
      result[mapAttrType(attrType)] = attrValue;
    }
  }
  return result;
}

function buildPotentials(
  unlocks: WarfarinPotentialUnlock[],
  effects: Record<string, WarfarinPotentialEntry>,
) {
  return unlocks.map(unlock => {
    const effect = effects[unlock.potentialEffectId];
    if (!effect) return { level: unlock.level, name: unlock.name, effects: [] };

    const parsed = effect.dataList.map(d => {
      const effectType = POTENTIAL_EFFECT_TYPE_MAP[d.modifyType] ?? d.modifyType;
      const result: Record<string, unknown> = { potentialEffectType: effectType };

      // Stat modifier
      if (d.attrModifier.attrType !== 0 || d.attrModifier.attrValue !== 0) {
        result.statModifier = {
          statType: mapAttrType(d.attrModifier.attrType),
          value: d.attrModifier.attrValue,
        };
      }

      // Skill parameter modifier
      if (d.skillBbModifier.bbKey) {
        result.skillParameterModifier = {
          skillType: mapSkillId(d.skillBbModifier.skillId),
          parameterKey: mapBbKey(d.skillBbModifier.bbKey),
          value: d.skillBbModifier.floatValue,
          parameterModifyType: PARAMETER_MODIFY_TYPE_MAP[d.skillBbModifier.modifyType] ?? d.skillBbModifier.modifyType,
        };
      }

      // Skill cost modifier
      if (d.skillParamModifier.skillId) {
        result.skillCostModifier = {
          skillType: mapSkillId(d.skillParamModifier.skillId),
          parameterType: d.skillParamModifier.paramType,
          value: d.skillParamModifier.paramValue,
        };
      }

      // Buff attachment
      if (d.attachBuff.buffId) {
        result.buffAttachment = {
          objectId: mapBuffId(d.attachBuff.buffId),
          parameters: d.attachBuff.blackboard,
        };
      }

      return result;
    });

    return {
      level: unlock.level,
      name: unlock.name,
      effects: parsed,
    };
  });
}

// ── Skill descriptions ──────────────────────────────────────────────────────

/** Warfarin skillGroupType → CombatSkillType mapping. */
const SKILL_GROUP_TYPE_MAP: Record<number, string> = {
  0: 'BASIC_ATTACK',
  1: 'BATTLE_SKILL',
  2: 'ULTIMATE',
  3: 'COMBO_SKILL',
};

// ── Skill multiplier extraction ────────────────────────────────────────────

/**
 * Classifies a Warfarin skill ID into a skill category and sub-index.
 * Returns { category, index } where:
 *   - category: BASIC_ATTACK, BATTLE_SKILL, COMBO_SKILL, ULTIMATE, or variant keys
 *   - index: segment index for basic attacks (0-based), 0 for other skills
 *
 * Warfarin skill ID suffixes:
 *   attack1..attackN     → BASIC_ATTACK segments 0..N-1
 *   normal_skill         → BATTLE_SKILL
 *   normal_skill_during_ult → ENHANCED_BATTLE_SKILL
 *   combo_skill          → COMBO_SKILL
 *   ultimate_skill       → ULTIMATE
 *   ult_attack1..N       → ENHANCED_BASIC_ATTACK segments 0..N-1
 *   dash_attack          → DASH_ATTACK (special)
 *   plunging_attack_end  → DIVE_ATTACK (special)
 *   power_attack         → FINISHER (special)
 */
interface SkillClassification {
  category: string;
  index: number;
}

function classifyWarfarinSkillId(skillId: string): SkillClassification | null {
  // Extract suffix after the char ID prefix (e.g. chr_0016_laevat_attack1 → attack1)
  const parts = skillId.split('_');
  // Char IDs are like chr_NNNN_name, so suffix starts at index 3
  const suffix = parts.slice(3).join('_');

  // Basic attack sequences: attack1, attack2, ..., attack4_1 (Fluorite special)
  const attackMatch = suffix.match(/^attack(\d+)(?:_(\d+))?$/);
  if (attackMatch) {
    const seqNum = parseInt(attackMatch[1], 10);
    const subIndex = attackMatch[2] ? parseInt(attackMatch[2], 10) : 0;
    return { category: 'BASIC_ATTACK', index: (seqNum - 1) + subIndex };
  }

  // Enhanced basic attack (during ult): ult_attack1..N
  const ultAttackMatch = suffix.match(/^ult_attack(\d+)(?:_(\d+))?$/);
  if (ultAttackMatch) {
    const seqNum = parseInt(ultAttackMatch[1], 10);
    const subIndex = ultAttackMatch[2] ? parseInt(ultAttackMatch[2], 10) : 0;
    return { category: 'ENHANCED_BASIC_ATTACK', index: (seqNum - 1) + subIndex };
  }

  // Ultimate enhanced end attack (Yvonne)
  if (suffix === 'ult_attack_end') {
    return { category: 'ENHANCED_BASIC_ATTACK_END', index: 0 };
  }

  // Battle skill
  if (suffix === 'normal_skill') {
    return { category: 'BATTLE_SKILL', index: 0 };
  }

  // Enhanced battle skill (during ult)
  if (suffix === 'normal_skill_during_ult') {
    return { category: 'ENHANCED_BATTLE_SKILL', index: 0 };
  }

  // Combo skill
  if (suffix === 'combo_skill') {
    return { category: 'COMBO_SKILL', index: 0 };
  }

  // Ultimate
  if (suffix === 'ultimate_skill') {
    return { category: 'ULTIMATE', index: 0 };
  }

  // Special attacks
  if (suffix === 'dash_attack') {
    return { category: 'DASH_ATTACK', index: 0 };
  }
  if (suffix === 'plunging_attack_end') {
    return { category: 'DIVE_ATTACK', index: 0 };
  }
  if (suffix === 'power_attack' || suffix === 'power_attack2') {
    return { category: 'FINISHER', index: 0 };
  }

  // Talent entries (no multipliers we need)
  if (suffix.startsWith('talent_')) return null;

  return null;
}

/**
 * Blackboard keys that represent display-only values (not used in damage calc).
 * These are totals shown in skill descriptions, not per-hit values.
 */
const DISPLAY_ONLY_BB_KEYS = new Set([
  'display_atk_scale_pull',
  'atk_scale_display_ex',
]);

/**
 * Extracts per-level multiplier data from the Warfarin skillPatchTable.
 *
 * Returns a map of skill category → sub-index → level → blackboard entries.
 * For basic attacks, sub-index corresponds to the segment index.
 * For other skills, sub-index is always 0.
 *
 * Only non-display atk_scale keys and other gameplay-relevant keys are included.
 */
export interface SkillMultiplierEntry {
  level: number;
  blackboard: Record<string, number>;
}

export interface SkillMultiplierData {
  /** Skill category → segment/sub-index → level entries */
  [category: string]: Record<number, SkillMultiplierEntry[]>;
}

function buildSkillMultipliers(
  skillPatchTable: Record<string, { SkillPatchDataBundle: WarfarinSkillPatchBundle[] }>,
): SkillMultiplierData {
  const result: SkillMultiplierData = {};

  for (const [skillId, patchData] of Object.entries(skillPatchTable)) {
    const classification = classifyWarfarinSkillId(skillId);
    if (!classification) continue;

    const { category, index } = classification;

    if (!result[category]) result[category] = {};
    if (!result[category][index]) result[category][index] = [];

    const bundles = patchData.SkillPatchDataBundle;
    for (const bundle of bundles) {
      const blackboard: Record<string, number> = {};

      for (const entry of bundle.blackboard) {
        // Skip display-only keys
        if (DISPLAY_ONLY_BB_KEYS.has(entry.key)) continue;
        blackboard[entry.key] = entry.value;
      }

      if (Object.keys(blackboard).length > 0) {
        result[category][index].push({
          level: bundle.level,
          blackboard,
        });
      }
    }
  }

  return result;
}

/**
 * Builds a map of skill category → CombatSkillsType enum ID from WARFARIN_SKILL_ID_MAP.
 * For segmented skills (basic attacks), uses the first segment's ID.
 */
function buildSkillIds(
  skillPatchTable: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const skillId of Object.keys(skillPatchTable)) {
    const classification = classifyWarfarinSkillId(skillId);
    if (!classification) continue;
    const { category, index } = classification;
    // Look up in WARFARIN_SKILL_ID_MAP — for numbered attacks (attack1, attack2),
    // also try the base form (attack) since the map uses the unnumbered suffix
    let mappedName = WARFARIN_SKILL_ID_MAP[skillId];
    if (!mappedName) {
      const baseId = skillId.replace(/\d+$/, '');
      mappedName = WARFARIN_SKILL_ID_MAP[baseId];
    }
    // Use the first (index 0) entry, or any non-segmented skill
    if (mappedName && (index === 0 || !result[category])) {
      result[category] = mappedName;
    }
  }
  return result;
}

/**
 * Extracts deterministic skill timing overrides from the Warfarin skillPatchTable.
 *
 * Only extracts values that are unambiguously timeline-relevant:
 *   - ultimateActiveDuration: from ultimate_skill.blackboard.duration (seconds, when present)
 *
 * NOT extracted:
 *   - ultimateCooldownDuration: Warfarin's ultimate coolDown represents energy recharge lockout,
 *     not a timeline cooldown. Ultimates are gated by energy, not cooldown timers.
 */
export interface SkillTimingOverrides {
  ultimateActiveDuration?: number;
}

function buildSkillTimingOverrides(
  skillPatchTable: Record<string, { SkillPatchDataBundle: WarfarinSkillPatchBundle[] }>,
): SkillTimingOverrides {
  const overrides: SkillTimingOverrides = {};

  for (const [skillId, patchData] of Object.entries(skillPatchTable)) {
    const classification = classifyWarfarinSkillId(skillId);
    if (!classification) continue;

    const bundles = patchData.SkillPatchDataBundle;
    if (!bundles.length) continue;
    const first = bundles[0];

    if (classification.category === 'ULTIMATE') {
      const duration = first.blackboard.find(b => b.key === 'duration');
      if (duration) overrides.ultimateActiveDuration = duration.value;
    }
  }

  return overrides;
}

/** Strip Warfarin rich text tags and template variables from skill descriptions. */
function stripRichText(text: string): string {
  return text
    .replace(/<[#@][^>]*>/g, '')   // <#ba.burning>, <@ba.fire>, etc.
    .replace(/<\/>/g, '')           // closing tags
    .replace(/\{[^}]+\}/g, '');    // {poise:0}, {count:0}, etc.
}

function buildSkillDescriptions(
  skillGroupMap: Record<string, WarfarinSkillGroup>,
): Record<string, { name: string; description: string }> {
  const result: Record<string, { name: string; description: string }> = {};
  for (const group of Object.values(skillGroupMap)) {
    const categoryKey = SKILL_GROUP_TYPE_MAP[group.skillGroupType];
    if (!categoryKey) continue;
    result[categoryKey] = {
      name: group.name,
      description: stripRichText(group.desc),
    };
  }
  return result;
}

// ── Talent extraction ────────────────────────────────────────────────────────

const ATTRIBUTE_TYPE_TO_STAT: Record<number, string> = {
  39: 'STRENGTH',
  40: 'AGILITY',
  41: 'INTELLECT',
  42: 'WILL',
};

function buildTalents(talentNodeMap: Record<string, WarfarinTalentNode>) {
  // nodeType 4 = passive skill (talents), nodeType 3 = attribute increase
  const passiveSkills: Record<number, { name: string; maxLevel: number }> = {};
  let attributeIncrease: { name: string; attribute: string; maxLevel: number } | undefined;

  for (const node of Object.values(talentNodeMap)) {
    if (node.nodeType === 4) {
      const ps = node.passiveSkillNodeInfo;
      if (!ps.name) continue;
      if (!passiveSkills[ps.index]) {
        passiveSkills[ps.index] = { name: ps.name, maxLevel: 0 };
      }
      passiveSkills[ps.index].maxLevel = Math.max(passiveSkills[ps.index].maxLevel, ps.level);
    } else if (node.nodeType === 3) {
      const ai = node.attributeNodeInfo;
      if (!ai.title) continue;
      const stat = ATTRIBUTE_TYPE_TO_STAT[ai.attributeModifier.attrType] ?? String(ai.attributeModifier.attrType);
      if (!attributeIncrease) {
        attributeIncrease = { name: ai.title, attribute: stat, maxLevel: 0 };
      }
      attributeIncrease.maxLevel++;
    }
  }

  const result: Record<string, unknown> = {};
  if (passiveSkills[0]) result.one = passiveSkills[0];
  if (passiveSkills[1]) result.two = passiveSkills[1];
  if (attributeIncrease) result.attributeIncrease = attributeIncrease;

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function fetchOperator(slug: string): Promise<WarfarinApiResponse> {
  const url = `${API_BASE}/${slug}`;
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<WarfarinApiResponse>;
}

export function buildOperatorEntry(raw: WarfarinApiResponse) {
  const ct = raw.data.characterTable;
  const levels = ct.attributes;

  const potentials = buildPotentials(
    raw.data.characterPotentialTable.potentialUnlockBundle,
    raw.data.potentialTalentEffectTable,
  );

  const operatorType = CHAR_ID_TO_OPERATOR[ct.charId] ?? ct.charId;
  const element = ELEMENT_MAP[ct.charTypeId] ?? ct.charTypeId;
  const profession = PROFESSION_MAP[ct.profession] ?? String(ct.profession);
  const weaponType = WEAPON_TYPE_MAP[ct.weaponType] ?? String(ct.weaponType);
  const mainAttr = mapAttrType(ct.mainAttrType);
  const subAttr = mapAttrType(ct.subAttrType);

  const skillMultipliers = buildSkillMultipliers(raw.data.skillPatchTable ?? {});
  const skillIds = buildSkillIds(raw.data.skillPatchTable ?? {});
  const talents = buildTalents(raw.data.charGrowthTable.talentNodeMap ?? {});
  const timingOverrides = buildSkillTimingOverrides(raw.data.skillPatchTable ?? {});

  return {
    [OperatorInformationType.OPERATOR_TYPE]: operatorType,
    [OperatorInformationType.NAME]: ct.engName || ct.name,
    [OperatorInformationType.OPERATOR_RARITY]: ct.rarity,
    [OperatorInformationType.OPERATOR_CLASS_TYPE]: profession,
    [OperatorInformationType.ELEMENT_TYPE]: element,
    [OperatorInformationType.WEAPON_TYPE]: weaponType,
    [OperatorInformationType.MAIN_ATTRIBUTE_TYPE]: mainAttr,
    [OperatorInformationType.SECONDARY_ATTRIBUTE_TYPE]: subAttr,
    [OperatorInformationType.POTENTIALS]: potentials,
    [OperatorInformationType.ALL_LEVELS]: levels.map(entry => {
      const levelAttr = entry.Attribute.attrs.find(a => a.attrType === WarfarinAttributeType.Level);
      return {
        level: levelAttr?.attrValue ?? 0,
        operatorPromotionStage: entry.breakStage,
        attributes: extractAttrs(entry.Attribute.attrs),
      };
    }),
    skillDescriptions: buildSkillDescriptions(raw.data.charGrowthTable.skillGroupMap),
    skillMultipliers,
    skillIds,
    talents,
    ...timingOverrides,
    dataSources: ['WARFARIN'],
  };
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: npx tsx src/model/utils/parsers/parseWarfarinOperator.ts <slug>');
    process.exit(1);
  }

  const raw = await fetchOperator(slug);
  const entry = buildOperatorEntry(raw);

  const I = OperatorInformationType;
  const operatorType = entry[I.OPERATOR_TYPE];
  const fileSlug = operatorType.toLowerCase().replace(/_/g, '-');
  const filePath = path.join(OPERATORS_DIR, `${fileSlug}-operator.json`);

  // Load existing or create new
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  const merged = { ...existing, ...entry };

  if (!fs.existsSync(OPERATORS_DIR)) {
    fs.mkdirSync(OPERATORS_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Wrote ${operatorType} to ${filePath}`);

  // Print summary
  const allLevels = entry[I.ALL_LEVELS];
  const lv1 = allLevels.find(l => l.level === 1)?.attributes ?? {};
  const lv90 = allLevels.find(l => l.level === 90)?.attributes ?? {};
  console.log(`\n${entry[I.NAME]} (${entry[I.OPERATOR_TYPE]})`);
  console.log(`  Rarity: ${entry[I.OPERATOR_RARITY]}, Class: ${entry[I.OPERATOR_CLASS_TYPE]}, Element: ${entry[I.ELEMENT_TYPE]}`);
  console.log(`  Weapon: ${entry[I.WEAPON_TYPE]}, Main: ${entry[I.MAIN_ATTRIBUTE_TYPE]}, Sub: ${entry[I.SECONDARY_ATTRIBUTE_TYPE]}`);
  console.log(`  Lv1:  ATK=${lv1.BASE_ATTACK}, HP=${lv1.BASE_HP}, STR=${lv1.STRENGTH?.toFixed(1)}, AGI=${lv1.AGILITY?.toFixed(1)}, INT=${lv1.INTELLECT?.toFixed(1)}, WILL=${lv1.WILL?.toFixed(1)}`);
  console.log(`  Lv90: ATK=${lv90.BASE_ATTACK}, HP=${lv90.BASE_HP}, STR=${lv90.STRENGTH?.toFixed(1)}, AGI=${lv90.AGILITY?.toFixed(1)}, INT=${lv90.INTELLECT?.toFixed(1)}, WILL=${lv90.WILL?.toFixed(1)}`);
  console.log(`  Potentials: ${entry[I.POTENTIALS].length}`);
  for (const p of entry[I.POTENTIALS]) {
    console.log(`    P${p.level}: ${p.name} (${p.effects.length} effects)`);
  }
}

// Only run CLI when executed directly
const isDirectRun = process.argv[1]?.includes('parseWarfarinOperator');
if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
