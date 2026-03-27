/**
 * Fetches operator skill/frame data from the End-Axis gamedata.json and outputs
 * structured skill data for game-data/operators/<slug>.json.
 *
 * Usage:
 *   npx tsx src/model/utils/parsers/parseEndAxisGameData.ts <operator_id>
 *   npx tsx src/model/utils/parsers/parseEndAxisGameData.ts --all
 *
 * Example:
 *   npx tsx src/model/utils/parsers/parseEndAxisGameData.ts laevatain
 */

import * as fs from 'fs';
import * as path from 'path';
import { CombatResourceType, UnitType } from '../../../consts/enums';
import { DeterminerType, NounType, VerbType } from '../../../dsl/semantics';

const GAMEDATA_URL = 'https://raw.githubusercontent.com/Lieyuan621/Endaxis/main/public/gamedata.json';
const OPERATORS_DIR = path.resolve(__dirname, '../../game-data/operators');

// ── Types ────────────────────────────────────────────────────────────────────

interface Duration {
  value: number;
  unit: string;
}

interface Effect {
  verb: string;
  object: string;
  objectQualifier?: string | string[];
  toDeterminer?: string;
  to?: string;
  with?: {
    value?: { verb: string; value: number };
    stacks?: { verb: string; value: number };
    duration?: { verb: string; value: number };
  };
  conversion?: { statusType: string; ratio: string };
}

interface Frame {
  metadata: {
    eventComponentType: string;
    dataSources: string[];
  };
  properties: {
    offset: Duration;
  };
  effects: Effect[];
  multipliers?: unknown[];
}

interface Segment {
  metadata: {
    eventComponentType: string;
    dataSources: string[];
  };
  properties: {
    segmentTypes?: string[];
    duration: Duration;
    name?: string;
    timeDependency?: string;
    timeInteractionType?: string;
  };
  frames: Frame[];
}

interface SkillCategory {
  properties?: {
    duration?: Duration;
  };
  effects?: Effect[];
  frames?: Frame[];
  segments?: Segment[];
}

// ── Gamedata types ───────────────────────────────────────────────────────────

interface GameDataTick {
  offset: number;
  sp: number;
  stagger: number;
  boundEffects: string[];
}

interface GameDataAnomaly {
  _id: string;
  type: string;
  stacks: number;
  duration: number;
  offset: number;
}

interface GameDataSegment {
  duration: number;
  gaugeGain: number;
  allowed_types: string[];
  damage_ticks: GameDataTick[];
  anomalies: GameDataAnomaly[][];
  physicalAnomaly?: GameDataAnomaly[][];
}

interface GameDataVariant {
  id: string;
  name: string;
  type: 'attack' | 'skill';
  duration: number;
  damageTicks: GameDataTick[];
  allowedTypes: string[];
  physicalAnomaly?: GameDataAnomaly[][];
  attackSegments?: {
    duration: number;
    gaugeGain: number;
    allowedTypes: string[];
    damageTicks: GameDataTick[];
    physicalAnomaly?: GameDataAnomaly[][];
  }[];
}

interface GameDataCharacter {
  id: string;
  name: string;
  rarity: number;
  element: string;
  weapon: string;
  attack_segments: GameDataSegment[];
  skill_duration: number;
  skill_spCost: number;
  skill_gaugeGain: number;
  skill_teamGaugeGain: number;
  skill_damage_ticks: GameDataTick[];
  skill_anomalies: GameDataAnomaly[][];
  skill_anomaly_delays: number[];
  link_duration: number;
  link_cooldown: number;
  link_gaugeGain: number;
  link_damage_ticks: GameDataTick[];
  link_anomalies: GameDataAnomaly[][];
  link_anomaly_delays: number[];
  ultimate_duration: number;
  ultimate_gaugeMax: number;
  ultimate_gaugeReply: number;
  ultimate_animationTime: number;
  ultimate_enhancementTime: number;
  ultimate_damage_ticks: GameDataTick[];
  ultimate_anomalies: GameDataAnomaly[][];
  ultimate_anomaly_delays: number[];
  variants: GameDataVariant[];
  exclusive_buffs: unknown[];
  accept_team_gauge: boolean;
}

// ── ID mapping ───────────────────────────────────────────────────────────────

/** Maps gamedata.json operator IDs to our OperatorType enum values. */
const GAMEDATA_ID_TO_OPERATOR: Record<string, string> = {
  LAEVATAIN: 'LAEVATAIN',
  AKEKURI: 'AKEKURI',
  ANTAL: 'ANTAL',
  ARDELIA: 'ARDELIA',
  WULFGARD: 'WULFGARD',
  ENDMINISTRATOR: 'ENDMINISTRATOR',
  LIFENG: 'LIFENG',
  CHENQIANYU: 'CHEN_QIANYU',
  ESTELLA: 'ESTELLA',
  EMBER: 'EMBER',
  SNOWSHINE: 'SNOWSHINE',
  CATCHER: 'CATCHER',
  GILBERTA: 'GILBERTA',
  XAIHI: 'XAIHI',
  PERLICA: 'PERLICA',
  FLUORITE: 'FLUORITE',
  LASTRITE: 'LAST_RITE',
  YVONNE: 'YVONNE',
  AVYWENNA: 'AVYWENNA',
  DAPAN: 'DA_PAN',
  POGRANICHNK: 'POGRANICHNIK',
  ALESH: 'ALESH',
  ARCLIGHT: 'ARCLIGHT',
  TANGTANG: 'TANGTANG',
};

// ── Anomaly type mapping ─────────────────────────────────────────────────────

interface AnomalyMapping {
  verb: string;
  object: string;
  objectQualifier?: string | string[];
  isForced?: boolean;
  stacks?: number;
  conversion?: { statusType: string; ratio: string };
}

const ANOMALY_TYPE_MAP: Record<string, AnomalyMapping | null> = {
  blaze_attach:   { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'HEAT' },
  cold_attach:    { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'CRYO' },
  emag_attach:    { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'ELECTRIC' },
  nature_attach:  { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'NATURE' },
  magma_0:        { verb: VerbType.APPLY, object: NounType.REACTION, objectQualifier: ['FORCED', 'COMBUSTION'], isForced: true, stacks: 1 },
  magma_1:        { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'MELTING_FLAME' },
  magma_2:        { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'MELTING_FLAME' },
  magma_3:        { verb: VerbType.APPLY, object: NounType.INFLICTION, objectQualifier: 'MELTING_FLAME' },
  magma_4:        { verb: VerbType.CONSUME, object: NounType.INFLICTION, objectQualifier: 'HEAT', conversion: { statusType: 'MELTING_FLAME', ratio: '1:1' } },
  blaze_burst:    { verb: VerbType.APPLY, object: NounType.REACTION, objectQualifier: 'COMBUSTION' },
  burning:        { verb: VerbType.APPLY, object: NounType.REACTION, objectQualifier: 'COMBUSTION' },
  corrosion:      { verb: VerbType.APPLY, object: NounType.REACTION, objectQualifier: 'CORROSION', isForced: true },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function dur(value: number): Duration {
  return { value, unit: UnitType.SECOND };
}

const DATA_SOURCES = ['END_AXIS'];

/**
 * Builds a flat map of anomaly _id → AnomalyMapping from nested anomaly arrays.
 */
function buildAnomalyIndex(anomalyGroups: GameDataAnomaly[][]): Map<string, { mapping: AnomalyMapping; anomaly: GameDataAnomaly }> {
  const index = new Map<string, { mapping: AnomalyMapping; anomaly: GameDataAnomaly }>();
  for (const group of anomalyGroups) {
    for (const anomaly of group) {
      const mapping = ANOMALY_TYPE_MAP[anomaly.type];
      if (mapping) {
        index.set(anomaly._id, { mapping, anomaly });
      }
    }
  }
  return index;
}

/**
 * Converts a gamedata damage tick into a Frame with the new format.
 */
function convertTick(
  tick: GameDataTick,
  anomalyIndex: Map<string, { mapping: AnomalyMapping; anomaly: GameDataAnomaly }>,
): Frame {
  const effects: Effect[] = [];

  // SP recovery
  effects.push({
    verb: VerbType.RECOVER,
    object: NounType.SKILL_POINT,
    with: {
      value: { verb: VerbType.IS, value: tick.sp },
    },
  });

  // Stagger
  effects.push({
    verb: VerbType.RECOVER,
    object: NounType.STAGGER,
    with: {
      value: { verb: VerbType.IS, value: tick.stagger },
    },
  });

  // Resolve bound effects → status effects
  for (const effectId of tick.boundEffects) {
    const entry = anomalyIndex.get(effectId);
    if (!entry) continue;

    const { mapping, anomaly } = entry;
    const effect: Effect = {
      verb: mapping.verb,
      object: mapping.object,
      objectQualifier: mapping.objectQualifier,
      to: NounType.ENEMY,
    };

    const withPrep: Effect['with'] = {};
    if (anomaly.stacks > 0) withPrep.stacks = { verb: VerbType.IS, value: anomaly.stacks };
    if (mapping.stacks !== undefined) withPrep.stacks = { verb: VerbType.IS, value: mapping.stacks };
    if (anomaly.duration > 0) withPrep.duration = { verb: VerbType.IS, value: anomaly.duration };

    if (Object.keys(withPrep).length > 0) effect.with = withPrep;
    if (mapping.conversion) effect.conversion = mapping.conversion;

    effects.push(effect);
  }

  return {
    metadata: {
      eventComponentType: 'FRAME',
      dataSources: DATA_SOURCES,
    },
    properties: {
      offset: dur(tick.offset),
    },
    effects,
  };
}

// ── Effect builders for skill-level resource interactions ─────────────────────

function buildResourceEffect(
  resourceType: string,
  interactionType: string,
  value: number,
  target?: string,
): Effect {
  const effect: Effect = {
    verb: interactionType,
    object: resourceType,
    with: {
      value: { verb: VerbType.IS, value },
    },
  };

  if (resourceType === CombatResourceType.ULTIMATE_ENERGY && interactionType === VerbType.RECOVER) {
    if (target === 'SELF') {
      effect.toDeterminer = DeterminerType.THIS;
      effect.to = NounType.OPERATOR;
    } else if (target === NounType.TEAM) {
      effect.toDeterminer = DeterminerType.ALL;
      effect.to = NounType.OPERATOR;
    }
  }

  return effect;
}

// ── Skill parsers ────────────────────────────────────────────────────────────

function parseBasicAttack(char: GameDataCharacter): SkillCategory {
  const segments: Segment[] = [];

  for (const seg of char.attack_segments) {
    const anomalyIndex = buildAnomalyIndex(seg.anomalies ?? []);
    const frames = seg.damage_ticks.map(t => convertTick(t, anomalyIndex));

    segments.push({
      metadata: {
        eventComponentType: 'SEGMENT',
        dataSources: DATA_SOURCES,
      },
      properties: {
        duration: dur(seg.duration),
      },
      frames,
    });
  }

  return { segments };
}

function parseBattleSkill(char: GameDataCharacter): SkillCategory {
  const anomalyIndex = buildAnomalyIndex(char.skill_anomalies ?? []);
  const frames = char.skill_damage_ticks.map(t => convertTick(t, anomalyIndex));

  const effects: Effect[] = [];

  // SP cost
  if (char.skill_spCost) {
    effects.push(buildResourceEffect(CombatResourceType.SKILL_POINT, VerbType.CONSUME, char.skill_spCost));
  }

  // Gauge gain (self)
  if (char.skill_gaugeGain) {
    effects.push(buildResourceEffect(CombatResourceType.ULTIMATE_ENERGY, VerbType.RECOVER, char.skill_gaugeGain, 'SELF'));
  }

  // Gauge gain (team)
  if (char.skill_teamGaugeGain) {
    effects.push(buildResourceEffect(CombatResourceType.ULTIMATE_ENERGY, VerbType.RECOVER, char.skill_teamGaugeGain, NounType.TEAM));
  }

  const result: SkillCategory = {
    properties: {
      duration: dur(char.skill_duration),
    },
    frames,
  };

  if (effects.length > 0) result.effects = effects;

  return result;
}

function parseComboSkill(char: GameDataCharacter): SkillCategory {
  const anomalyIndex = buildAnomalyIndex(char.link_anomalies ?? []);
  const frames = char.link_damage_ticks.map(t => convertTick(t, anomalyIndex));

  const effects: Effect[] = [];

  // Cooldown
  if (char.link_cooldown) {
    effects.push(buildResourceEffect(CombatResourceType.COOLDOWN, VerbType.CONSUME, char.link_cooldown));
  }

  // Gauge gain
  if (char.link_gaugeGain) {
    effects.push(buildResourceEffect(CombatResourceType.ULTIMATE_ENERGY, VerbType.RECOVER, char.link_gaugeGain, 'SELF'));
  }

  const result: SkillCategory = {
    properties: {
      duration: dur(char.link_duration),
    },
    segments: [{
      metadata: { eventComponentType: 'SEGMENT', dataSources: DATA_SOURCES },
      properties: { segmentTypes: ['ANIMATION'], duration: dur(0.5), name: 'Animation', timeDependency: 'REAL_TIME', timeInteractionType: 'TIME_STOP' },
      frames: [],
    }],
    frames,
  };

  if (effects.length > 0) result.effects = effects;

  return result;
}

function parseUltimate(char: GameDataCharacter): SkillCategory {
  const anomalyIndex = buildAnomalyIndex(char.ultimate_anomalies ?? []);
  const allFrames = char.ultimate_damage_ticks.map(t => convertTick(t, anomalyIndex));

  const effects: Effect[] = [];

  // Energy cost
  if (char.ultimate_gaugeMax) {
    effects.push(buildResourceEffect(CombatResourceType.ULTIMATE_ENERGY, VerbType.CONSUME, char.ultimate_gaugeMax));
  }

  const ultimateDuration = char.ultimate_duration;

  // Check for delayed hits (offset > duration)
  const mainFrames = allFrames.filter(f => f.properties.offset.value <= ultimateDuration);
  const delayedFrames = allFrames.filter(f => f.properties.offset.value > ultimateDuration);

  if (delayedFrames.length > 0) {
    // Split into segments
    const reoffsetedDelayed = delayedFrames.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        offset: dur(f.properties.offset.value - ultimateDuration),
      },
    }));

    const maxDelayedOffset = Math.max(...reoffsetedDelayed.map(f => f.properties.offset.value));
    const delayedDuration = maxDelayedOffset + 0.1;

    const segments: Segment[] = [
      {
        metadata: {
          eventComponentType: 'SEGMENT',
          dataSources: DATA_SOURCES,
        },
        properties: {
          duration: dur(ultimateDuration),
        },
        frames: mainFrames,
      },
      {
        metadata: {
          eventComponentType: 'SEGMENT',
          dataSources: DATA_SOURCES,
        },
        properties: {
          duration: dur(delayedDuration),
          name: 'DELAYED',
        },
        frames: reoffsetedDelayed,
      },
    ];

    const result: SkillCategory = { segments };
    if (effects.length > 0) result.effects = effects;

    // Animation time-stop — prepend ANIMATION segment
    if (char.ultimate_animationTime) {
      segments.unshift({
        metadata: { eventComponentType: 'SEGMENT', dataSources: DATA_SOURCES },
        properties: { segmentTypes: ['ANIMATION'], duration: dur(char.ultimate_animationTime), name: 'Animation', timeDependency: 'REAL_TIME', timeInteractionType: 'TIME_STOP' },
        frames: [],
      });
    }

    return result;
  }

  // Single-part ultimate
  const result: SkillCategory = {
    properties: {
      duration: dur(ultimateDuration),
    },
    frames: mainFrames,
  };

  if (effects.length > 0) result.effects = effects;

  if (char.ultimate_animationTime) {
    if (!result.segments) result.segments = [];
    result.segments.unshift({
      metadata: { eventComponentType: 'SEGMENT', dataSources: DATA_SOURCES },
      properties: { segmentTypes: ['ANIMATION'], duration: dur(char.ultimate_animationTime), name: 'Animation', timeDependency: 'REAL_TIME', timeInteractionType: 'TIME_STOP' },
      frames: [],
    });
  }

  return result;
}

// ── Variant parsers ──────────────────────────────────────────────────────────

/**
 * Determines the skill category key for a variant based on its type and Chinese name.
 * Enhanced (大招内) = during ultimate
 * Empowered (强化) = from status effects
 */
function variantCategoryKey(variant: GameDataVariant): string | null {
  const name = variant.name;
  const hasDuring = name.includes('大招内');
  const hasEmpowered = name.includes('强化');

  if (variant.type === 'attack') {
    if (hasDuring) return 'ENHANCED_BASIC_ATTACK';
    if (hasEmpowered) return 'EMPOWERED_BASIC_ATTACK';
    return null;
  }

  if (variant.type === 'skill') {
    if (hasDuring && hasEmpowered) return 'ENHANCED_EMPOWERED_BATTLE_SKILL';
    if (hasDuring) return 'ENHANCED_BATTLE_SKILL';
    if (hasEmpowered) return 'EMPOWERED_BATTLE_SKILL';
    return null;
  }

  return null;
}

function parseVariantAttack(variant: GameDataVariant): SkillCategory {
  const segments: Segment[] = [];

  if (variant.attackSegments) {
    for (const seg of variant.attackSegments) {
      const anomalyIndex = buildAnomalyIndex(seg.physicalAnomaly ?? []);
      const frames = seg.damageTicks.map(t => convertTick(t, anomalyIndex));

      segments.push({
        metadata: {
          eventComponentType: 'SEGMENT',
          dataSources: DATA_SOURCES,
        },
        properties: {
          duration: dur(seg.duration),
        },
        frames,
      });
    }
  }

  return { segments };
}

function parseVariantSkill(variant: GameDataVariant): SkillCategory {
  const anomalyIndex = buildAnomalyIndex(variant.physicalAnomaly ?? []);
  const frames = variant.damageTicks.map(t => convertTick(t, anomalyIndex));

  return {
    properties: {
      duration: dur(variant.duration),
    },
    frames,
  };
}

// ── Main parser ──────────────────────────────────────────────────────────────

function parseCharacter(char: GameDataCharacter): { operatorType: string; skills: Record<string, SkillCategory> } | null {
  let operatorType = GAMEDATA_ID_TO_OPERATOR[char.id];
  if (!operatorType) {
    // Fall back to using the End-Axis ID directly for new/unmapped operators
    operatorType = char.id;
    console.warn(`  ⚠ Unmapped operator ID: ${char.id} — using as-is. Add to GAMEDATA_ID_TO_OPERATOR if name differs.`);
  }

  const skills: Record<string, SkillCategory> = {};

  // Basic attack
  if (char.attack_segments?.length > 0) {
    skills.BASIC_ATTACK = parseBasicAttack(char);
  }

  // Battle skill
  if (char.skill_duration > 0 || char.skill_damage_ticks?.length > 0) {
    skills.BATTLE_SKILL = parseBattleSkill(char);
  }

  // Combo skill
  if (char.link_duration > 0 || char.link_damage_ticks?.length > 0) {
    skills.COMBO_SKILL = parseComboSkill(char);
  }

  // Ultimate
  if (char.ultimate_duration > 0 || char.ultimate_damage_ticks?.length > 0) {
    skills.ULTIMATE = parseUltimate(char);
  }

  // Variants
  if (char.variants) {
    for (const variant of char.variants) {
      const categoryKey = variantCategoryKey(variant);
      if (!categoryKey) {
        console.warn(`  Skipping unmapped variant: ${variant.name} (type=${variant.type})`);
        continue;
      }

      // If this category already exists (multiple variants map to same key), skip
      if (skills[categoryKey]) continue;

      if (variant.type === 'attack') {
        skills[categoryKey] = parseVariantAttack(variant);
      } else {
        skills[categoryKey] = parseVariantSkill(variant);
      }
    }
  }

  return { operatorType, skills };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function fetchGameData(): Promise<{ characterRoster: GameDataCharacter[] }> {
  console.log(`Fetching ${GAMEDATA_URL}...`);
  const res = await fetch(GAMEDATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<{ characterRoster: GameDataCharacter[] }>;
}

function findCharacter(roster: GameDataCharacter[], query: string): GameDataCharacter | undefined {
  const upper = query.toUpperCase();
  return roster.find(c => c.id === upper || c.id === query);
}

export async function parseEndAxisOperator(
  roster: GameDataCharacter[],
  operatorId: string,
): Promise<{ operatorType: string; skills: Record<string, SkillCategory> } | null> {
  const char = findCharacter(roster, operatorId);
  if (!char) {
    console.error(`Operator not found: ${operatorId}`);
    return null;
  }
  return parseCharacter(char);
}

export async function parseEndAxisAll(
  roster: GameDataCharacter[],
): Promise<{ operatorType: string; skills: Record<string, SkillCategory> }[]> {
  const results: { operatorType: string; skills: Record<string, SkillCategory> }[] = [];
  for (const char of roster) {
    const result = parseCharacter(char);
    if (result) results.push(result);
  }
  return results;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx src/model/utils/parsers/parseEndAxisGameData.ts <operator_id | --all>');
    process.exit(1);
  }

  const gameData = await fetchGameData();
  const roster = gameData.characterRoster;
  console.log(`Loaded ${roster.length} characters from gamedata.json`);

  if (arg === '--all') {
    const results = await parseEndAxisAll(roster);
    console.log(`\nParsed ${results.length} operators:`);
    for (const r of results) {
      console.log(`  ${r.operatorType}: ${Object.keys(r.skills).join(', ')}`);
    }

    // Write per-operator files
    if (!fs.existsSync(OPERATORS_DIR)) {
      fs.mkdirSync(OPERATORS_DIR, { recursive: true });
    }

    for (const r of results) {
      const fileSlug = r.operatorType.toLowerCase().replace(/_/g, '-');
      const filePath = path.join(OPERATORS_DIR, `${fileSlug}.json`);

      let existing: Record<string, unknown> = {};
      if (fs.existsSync(filePath)) {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      existing.skills = r.skills;
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
    }

    console.log(`\nWrote skills to ${OPERATORS_DIR}/`);
  } else {
    const result = await parseEndAxisOperator(roster, arg);
    if (result) {
      console.log(`\n${result.operatorType}:`);
      for (const [cat, skill] of Object.entries(result.skills)) {
        const segCount = skill.segments?.length ?? 0;
        const frameCount = skill.frames?.length ?? 0;
        console.log(`  ${cat}: ${segCount > 0 ? `${segCount} segments` : `${frameCount} frames`}`);
      }
      // Print the JSON for inspection
      console.log('\n' + JSON.stringify({ [result.operatorType]: { skills: result.skills } }, null, 2));
    }
  }
}

// Only run CLI when executed directly
const isDirectRun = process.argv[1]?.includes('parseEndAxisGameData');
if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
