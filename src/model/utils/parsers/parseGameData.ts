/**
 * Orchestrator that runs both Warfarin and End-Axis parsers, merges results
 * into per-operator files under game-data/operators/, and preserves
 * manually-verified (SELF) data.
 *
 * Usage:
 *   npx tsx src/model/utils/parsers/parseGameData.ts <slug>
 *   npx tsx src/model/utils/parsers/parseGameData.ts --all
 *
 * Examples:
 *   npx tsx src/model/utils/parsers/parseGameData.ts laevatain
 *   npx tsx src/model/utils/parsers/parseGameData.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';

const GAMEDATA_URL = 'https://raw.githubusercontent.com/Lieyuan621/Endaxis/main/public/gamedata.json';

const OPERATORS_DIR = path.resolve(__dirname, '../../game-data/operators');

function operatorFilePath(operatorType: string): string {
  const slug = operatorType.toLowerCase().replace(/_/g, '-');
  return path.join(OPERATORS_DIR, `${slug}-operator.json`);
}

function loadOperator(operatorType: string): Record<string, unknown> {
  const filePath = operatorFilePath(operatorType);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return {};
}

function saveOperator(operatorType: string, data: Record<string, unknown>): void {
  if (!fs.existsSync(OPERATORS_DIR)) {
    fs.mkdirSync(OPERATORS_DIR, { recursive: true });
  }
  const filePath = operatorFilePath(operatorType);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  Wrote ${operatorType} to ${filePath}`);
}

// ── Warfarin slug → gamedata ID mapping ──────────────────────────────────────

/** Maps Warfarin API slugs to gamedata.json operator IDs. */
const WARFARIN_SLUG_TO_GAMEDATA_ID: Record<string, string> = {
  laevatain: 'LAEVATAIN',
  akekuri: 'AKEKURI',
  antal: 'ANTAL',
  ardelia: 'ARDELIA',
  wulfgard: 'WULFGARD',
  endministrator: 'ENDMINISTRATOR',
  lifeng: 'LIFENG',
  'chen-qianyu': 'CHENQIANYU',
  estella: 'ESTELLA',
  ember: 'EMBER',
  snowshine: 'SNOWSHINE',
  catcher: 'CATCHER',
  gilberta: 'GILBERTA',
  xaihi: 'XAIHI',
  perlica: 'PERLICA',
  fluorite: 'FLUORITE',
  'last-rite': 'LASTRITE',
  yvonne: 'YVONNE',
  avywenna: 'AVYWENNA',
  'da-pan': 'DAPAN',
  pogranichnik: 'POGRANICHNK',
  alesh: 'ALESH',
  arclight: 'ARCLIGHT',
  tangtang: 'TANGTANG',
};

/** All known Warfarin slugs in order. */
const ALL_WARFARIN_SLUGS = Object.keys(WARFARIN_SLUG_TO_GAMEDATA_ID);

/**
 * Merges incoming skill data as the new base. Always overwrites base skills.
 * Overrides (skillOverrides) are preserved separately and never touched.
 */
function mergeSkills(
  _existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  // Always use incoming as the new base — overrides are stored separately
  return incoming;
}

// ── Multiplier merging ──────────────────────────────────────────────────────

interface MultiplierLevelEntry {
  level: number;
  blackboard: Record<string, number>;
}

interface SkillMultiplierData {
  [category: string]: Record<number, MultiplierLevelEntry[]>;
}

/** Flattened multiplier output: level + all scale/param keys at top level. */
interface FlatMultiplierEntry {
  level: number;
  [key: string]: number;
}

interface FrameData {
  metadata: {
    eventComponentType: string;
    dataSources?: string[];
  };
  properties: {
    offset: { value: number; unit: string };
  };
  effects: unknown[];
  multipliers?: FlatMultiplierEntry[];
}

interface SegmentData {
  metadata: {
    eventComponentType: string;
    dataSources?: string[];
  };
  properties: {
    duration: { value: number; unit: string };
    name?: string;
  };
  frames: FrameData[];
}

interface SkillCategoryData {
  properties?: {
    duration?: { value: number; unit: string };
  };
  frames?: FrameData[];
  segments?: SegmentData[];
  effects?: unknown[];
  name?: string;
  description?: string;
  multipliers?: MultiplierLevelEntry[];
}

/** Maps raw blackboard keys to codebase-standard names. */
const MULTIPLIER_KEY_MAP: Record<string, string> = {
  'atk_scale': 'DAMAGE_MULTIPLIER',
  'atk_scale1': 'DAMAGE_MULTIPLIER',
  'atk_scale_1': 'DAMAGE_MULTIPLIER',
  'atk_scale_2': 'DAMAGE_MULTIPLIER_INCREMENT',
  'atk_scale2': 'DAMAGE_MULTIPLIER_INCREMENT',
  'poise': 'STAGGER',
  'attack_poise': 'STAGGER',
  'duration': 'DURATION',
  'atb': 'SKILL_POINT',
};

function mapMultiplierKey(rawKey: string): string {
  return MULTIPLIER_KEY_MAP[rawKey] ?? rawKey;
}

/**
 * Extracts the ordered list of atk_scale keys from a blackboard that represent
 * per-hit multipliers. These keys map positionally to End-Axis damage frames.
 *
 * Returns the keys in the order they should be assigned to frames.
 * The naming convention varies per operator but follows these patterns:
 *   - Single hit: atk_scale
 *   - Multi-hit numbered: atk_scale, atk_scale_2, atk_scale_3 OR atk_scale, atk_scale2, atk_scale3
 *   - Named phases: atk_scale_pre, atk_scale (pre hit first, then main)
 *   - Loop/end: atk_scale_loop, atk_scale_end
 *   - Named: atk_scale_boom, atk_scale_tick, atk_scale_lance, etc.
 *
 * Named keys that can't be reliably ordered are NOT assigned positionally.
 * Instead they are kept as-is in the blackboard for the consumer to interpret.
 */
function extractAtkScaleKeys(blackboard: Record<string, number>): string[] {
  const allKeys = Object.keys(blackboard);
  const scaleKeys = allKeys.filter(k =>
    k.startsWith('atk_scale') && !k.startsWith('atk_scale_display') && !k.startsWith('display_')
  );

  if (scaleKeys.length === 0) return [];

  // Classify keys into orderable vs named
  const orderable: { key: string; priority: number }[] = [];
  const named: string[] = [];

  for (const key of scaleKeys) {
    if (key === 'atk_scale_pre') {
      orderable.push({ key, priority: 0 });
    } else if (key === 'atk_scale' || key === 'atk_scale1') {
      orderable.push({ key, priority: 1 });
    } else {
      // Numbered: atk_scale_2, atk_scale2, atk_scale_1, atk_scale_1ex, etc.
      const numMatch = key.match(/^atk_scale_?(\d+)(ex)?$/);
      if (numMatch) {
        const idx = parseInt(numMatch[1], 10);
        const exBonus = numMatch[2] ? 0.5 : 0; // _1ex comes after _1
        orderable.push({ key, priority: 1 + idx + exBonus });
      } else {
        // Named variants (loop, end, boom, tick, lance, etc.) — don't positionally assign
        named.push(key);
      }
    }
  }

  // If there are ONLY named keys (no orderable ones), don't try to map positionally
  if (orderable.length === 0) return [];

  orderable.sort((a, b) => a.priority - b.priority);
  return orderable.map(o => o.key);
}

/**
 * Derives the number of hits (frames) for a skill from Warfarin multiplier data.
 *
 * Procedure:
 * 1. Find display_atk_scale (the total shown in-game)
 * 2. Identify the base key (atk_scale) and variant keys (atk_scale_2, _3, etc.)
 * 3. Subtract all variant values from display_atk_scale
 * 4. Divide remainder by atk_scale → number of regular (base) frames
 * 5. Add the number of variant keys → total frame count
 *
 * If display_atk_scale is unavailable, fall back to one frame per atk_scale key (base + variants).
 */
function deriveHitCount(levelEntries: MultiplierLevelEntry[]): number {
  if (!levelEntries.length) return 1;
  const bb = levelEntries[0].blackboard;

  // Find display total — may be display_atk_scale, atk_scale_display, or display_atk_scale1
  const displayKey = Object.keys(bb).find(k =>
    k === 'display_atk_scale' || k === 'atk_scale_display' || k === 'display_atk_scale1'
  );
  const displayTotal = displayKey ? bb[displayKey] : 0;

  // Separate base key from variant keys
  // Base key: atk_scale (the repeated per-hit multiplier), or atk_scale_1/atk_scale1 if no bare atk_scale
  // Variant keys: atk_scale_2, atk_scale_3, atk_scale_pre, etc. (unique hits with distinct multipliers)
  const baseKey = bb['atk_scale'] !== undefined ? 'atk_scale'
    : bb['atk_scale_1'] !== undefined ? 'atk_scale_1'
    : bb['atk_scale1'] !== undefined ? 'atk_scale1'
    : null;
  const variantKeys = Object.keys(bb).filter(k =>
    k.startsWith('atk_scale') &&
    k !== baseKey &&
    !k.startsWith('display_') &&
    !k.startsWith('atk_scale_display')
  );

  if (displayTotal > 0 && baseKey) {
    const baseValue = bb[baseKey];
    if (baseValue > 0) {
      // Subtract variant values from display total
      const variantSum = variantKeys.reduce((sum, k) => sum + (bb[k] || 0), 0);
      const remainder = displayTotal - variantSum;
      if (remainder >= baseValue * 0.5) {
        // Positive remainder: base key represents repeated hits
        const regularFrames = Math.round(remainder / baseValue);
        return regularFrames + variantKeys.length;
      }
      // Negative/tiny remainder: all keys are distinct hits (base isn't repeating)
      // Fall through to orderable key count
    }
  }

  // No display total, no base key, or all-distinct keys — one frame per atk_scale key
  const allScaleKeys = Object.keys(bb).filter(k =>
    k.startsWith('atk_scale') && !k.startsWith('display_') && !k.startsWith('atk_scale_display')
  );
  if (allScaleKeys.length > 0) return allScaleKeys.length;

  // No atk_scale data at all — 1 frame
  return 1;
}

/** Fallback category names when Warfarin and End-Axis disagree on variant classification. */
const CATEGORY_FALLBACKS: Record<string, string> = {
  'ENHANCED_BASIC_ATTACK': 'EMPOWERED_BASIC_ATTACK',
  'EMPOWERED_BASIC_ATTACK': 'ENHANCED_BASIC_ATTACK',
  'ENHANCED_BATTLE_SKILL': 'EMPOWERED_BATTLE_SKILL',
  'EMPOWERED_BATTLE_SKILL': 'ENHANCED_BATTLE_SKILL',
};

/**
 * Merges Warfarin multiplier data into End-Axis skill frames.
 *
 * For basic attacks: each segment index corresponds to a Warfarin attack sequence.
 * For other skills: all frames belong to sub-index 0.
 *
 * Within a skill/segment, the atk_scale keys are assigned positionally to frames.
 * If there are more atk_scale keys than frames, the extra multipliers are stored
 * as skill-level multipliers on the category or segment.
 */
function mergeMultipliersIntoSkills(
  skills: Record<string, SkillCategoryData>,
  multiplierData: SkillMultiplierData,
): void {
  for (const [category, subIndexMap] of Object.entries(multiplierData)) {
    let skill = skills[category] as SkillCategoryData | undefined;
    // Fallback: ENHANCED ↔ EMPOWERED variants may differ between Warfarin and End-Axis
    if (!skill) {
      const fallback = CATEGORY_FALLBACKS[category];
      if (fallback) skill = skills[fallback] as SkillCategoryData | undefined;
    }
    if (!skill) continue;

    if (skill.segments) {
      // Segmented skill (basic attacks, multi-part skills)
      for (const [indexStr, levelEntries] of Object.entries(subIndexMap)) {
        const segIndex = parseInt(indexStr, 10);
        const segment = skill.segments[segIndex];
        if (!segment) continue;

        if (segment.frames.length > 0) {
          assignMultipliersToFrames(segment.frames, levelEntries);
        } else {
          // Empty segment (e.g. final strike with no End-Axis frames) —
          // redistribute non-scale keys (stagger, SP) to the last segment with frames
          const lastNonEmpty = [...skill.segments].slice(0, segIndex).reverse()
            .find(s => s.frames.length > 0);
          if (lastNonEmpty) {
            assignNonScaleKeysToFrames(lastNonEmpty.frames, levelEntries);
          }
        }
      }
    } else if (skill.frames) {
      // Flat skill (battle, combo, ultimate)
      const levelEntries = subIndexMap[0];
      if (levelEntries) {
        assignMultipliersToFrames(skill.frames, levelEntries);
      }
    }
  }
}

/**
 * Assigns only non-scale keys (stagger, SP, duration, etc.) from multiplier data
 * onto the first frame of an existing segment. Used when a Warfarin segment has
 * no corresponding End-Axis frames — the non-scale values represent the entire
 * attack chain's resource generation and belong on the last active segment.
 */
function assignNonScaleKeysToFrames(
  frames: FrameData[],
  levelEntries: MultiplierLevelEntry[],
): void {
  if (!frames.length || !levelEntries.length) return;

  const sampleBb = levelEntries[0].blackboard;
  const nonScaleKeys = Object.keys(sampleBb).filter(k =>
    !k.startsWith('atk_scale') && !k.startsWith('display_')
  );
  if (nonScaleKeys.length === 0) return;

  // Ensure the first frame has multipliers array (it should from prior assignment)
  const firstFrame = frames[0];
  if (!firstFrame.multipliers) {
    firstFrame.multipliers = levelEntries.map(entry => ({ level: entry.level }));
  }

  for (let i = 0; i < levelEntries.length; i++) {
    const mult = firstFrame.multipliers[i] as Record<string, number> | undefined;
    if (!mult) continue;
    for (const key of nonScaleKeys) {
      if (levelEntries[i].blackboard[key] !== undefined) {
        mult[mapMultiplierKey(key)] = levelEntries[i].blackboard[key];
      }
    }
  }
}

/**
 * Assigns multiplier data to frames positionally by matching atk_scale keys to frames.
 *
 * For each level, extracts the ordered atk_scale keys and assigns them to frames
 * in order. Each frame gets a `multipliers` array with one entry per skill level,
 * containing the blackboard values relevant to that specific frame/hit.
 *
 * Named atk_scale variants (atk_scale_loop, atk_scale_end, atk_scale_boom, etc.)
 * that cannot be reliably ordered are stored as-is in the blackboard of every frame.
 */
function assignMultipliersToFrames(
  frames: FrameData[],
  levelEntries: MultiplierLevelEntry[],
): void {
  if (!frames.length || !levelEntries.length) return;

  // Use level 1 to determine the atk_scale key mapping
  const sampleBb = levelEntries[0].blackboard;
  const scaleKeys = extractAtkScaleKeys(sampleBb);

  // Identify named atk_scale keys that weren't positionally ordered
  const allScaleKeys = Object.keys(sampleBb).filter(k =>
    k.startsWith('atk_scale') && !k.startsWith('atk_scale_display') && !k.startsWith('display_')
  );
  const positionalSet = new Set(scaleKeys);
  const namedScaleKeys = allScaleKeys.filter(k => !positionalSet.has(k));

  // Non-scale keys (poise, duration, etc.)
  const nonScaleKeys = Object.keys(sampleBb).filter(k =>
    !k.startsWith('atk_scale') && !k.startsWith('display_')
  );

  // Collect all scale keys (positional + named) for non-positional fallback
  const allRelevantScaleKeys = [...scaleKeys, ...namedScaleKeys];

  // Positional assignment is only valid when scale key count matches frame count exactly.
  // When they don't match, the keys represent different skill phases (not sequential hits)
  // and must be stored as-is on every frame for the consumer to interpret.
  const canAssignPositionally = scaleKeys.length > 0 && scaleKeys.length === frames.length;

  if (canAssignPositionally) {
    // Exact match: assign positional atk_scale keys to frames 1:1
    for (let frameIdx = 0; frameIdx < frames.length; frameIdx++) {
      const frame = frames[frameIdx];
      const scaleKey = scaleKeys[frameIdx];

      frame.multipliers = levelEntries.map(entry => {
        const mult: FlatMultiplierEntry = { level: entry.level };
        // Positional scale key for this frame (normalized to DAMAGE_MULTIPLIER)
        if (entry.blackboard[scaleKey] !== undefined) {
          mult.DAMAGE_MULTIPLIER = entry.blackboard[scaleKey];
        }
        // Named scale variants on every frame (mapped to codebase names)
        for (const key of namedScaleKeys) {
          if (entry.blackboard[key] !== undefined) {
            mult[mapMultiplierKey(key)] = entry.blackboard[key];
          }
        }
        return mult;
      });
    }
  } else {
    // Mismatch or no orderable keys: store all scale keys as-is on every frame
    for (const frame of frames) {
      frame.multipliers = levelEntries.map(entry => {
        const mult: FlatMultiplierEntry = { level: entry.level };
        for (const key of allRelevantScaleKeys) {
          if (entry.blackboard[key] !== undefined) {
            mult[mapMultiplierKey(key)] = entry.blackboard[key];
          }
        }
        return mult;
      });
    }
  }

  // Store non-scale keys (STAGGER, DURATION, etc.) on the first frame
  if (nonScaleKeys.length > 0 && frames[0]?.multipliers) {
    for (let i = 0; i < levelEntries.length; i++) {
      for (const key of nonScaleKeys) {
        if (levelEntries[i].blackboard[key] !== undefined) {
          (frames[0].multipliers[i] as Record<string, number>)[mapMultiplierKey(key)] = levelEntries[i].blackboard[key];
        }
      }
    }
  }

  // Convert extra_usp multiplier to RECOVER ULTIMATE_ENERGY effect on the last frame
  const extraUsp = sampleBb['extra_usp'];
  if (extraUsp !== undefined && extraUsp > 0 && frames.length > 0) {
    const lastFrame = frames[frames.length - 1];
    if (!lastFrame.effects) lastFrame.effects = [];
    const hasUltEffect = (lastFrame.effects as { verb: string; object: string }[]).some((e) =>
      e.verb === 'RECOVER' && e.object === 'ULTIMATE_ENERGY'
    );
    if (!hasUltEffect) {
      (lastFrame.effects as unknown[]).push({
        verb: 'RECOVER',
        object: 'ULTIMATE_ENERGY',
        with: { cardinality: { verb: 'IS', value: extraUsp } },
      });
    }
  }

  // Convert usp_1_display to RECOVER ULTIMATE_ENERGY effect on the first frame
  const uspDisplay = sampleBb['usp_1_display'];
  if (uspDisplay !== undefined && uspDisplay > 0 && frames.length > 0) {
    const firstFrame = frames[0];
    if (!firstFrame.effects) firstFrame.effects = [];
    const hasUltEffect = (firstFrame.effects as { verb: string; object: string }[]).some((e) =>
      e.verb === 'RECOVER' && e.object === 'ULTIMATE_ENERGY'
    );
    if (!hasUltEffect) {
      (firstFrame.effects as unknown[]).push({
        verb: 'RECOVER',
        object: 'ULTIMATE_ENERGY',
        with: { cardinality: { verb: 'IS', value: uspDisplay } },
      });
    }
  }
}

// ── Import parsers dynamically to avoid circular deps ────────────────────────

async function runWarfarinParser(slug: string): Promise<Record<string, unknown> | null> {
  try {
    // Dynamic import to keep this file as the orchestrator
    const { buildOperatorEntry, fetchOperator } = await import('./parseWarfarinOperator');
    const raw = await fetchOperator(slug);
    return buildOperatorEntry(raw);
  } catch (err) {
    console.warn(`  Warfarin parser failed for ${slug}: ${(err as Error).message}`);
    return null;
  }
}

async function runEndAxisParser(
  roster: unknown[],
  gamedataId: string,
): Promise<{ operatorType: string; skills: Record<string, unknown> } | null> {
  try {
    const { parseEndAxisOperator } = await import('./parseEndAxisGameData');
    return await parseEndAxisOperator(roster as Parameters<typeof parseEndAxisOperator>[0], gamedataId);
  } catch (err) {
    console.warn(`  End-Axis parser failed for ${gamedataId}: ${(err as Error).message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function fetchGameData(): Promise<{ characterRoster: unknown[] }> {
  console.log(`Fetching gamedata.json from End-Axis...`);
  const res = await fetch(GAMEDATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<{ characterRoster: unknown[] }>;
}

async function parseOne(slug: string, roster: unknown[]) {
  console.log(`\n── Parsing ${slug} ──`);

  const gamedataId = WARFARIN_SLUG_TO_GAMEDATA_ID[slug];
  if (!gamedataId) {
    console.error(`  Unknown slug: ${slug}`);
    return;
  }

  // Run both parsers
  const [warfarinData, endAxisData] = await Promise.all([
    runWarfarinParser(slug),
    runEndAxisParser(roster, gamedataId),
  ]);

  if (!warfarinData && !endAxisData) {
    console.error(`  Both parsers failed for ${slug}`);
    return;
  }

  // Determine operator key
  const operatorType = endAxisData?.operatorType
    ?? (warfarinData as Record<string, unknown>)?.operatorType as string
    ?? gamedataId;

  // Load existing operator file
  const existing = loadOperator(operatorType);
  const merged: Record<string, unknown> = { ...existing };

  // Merge Warfarin data (operator info, stats, potentials, levels)
  let skillDescriptions: Record<string, { name: string; description: string }> | undefined;
  let skillMultipliers: SkillMultiplierData | undefined;
  let skillIds: Record<string, string> | undefined;
  if (warfarinData) {
    for (const [key, value] of Object.entries(warfarinData)) {
      if (key === 'skills') continue; // Warfarin doesn't produce skills
      if (key === 'skillDescriptions') {
        skillDescriptions = value as Record<string, { name: string; description: string }>;
        continue; // Merged into skills below
      }
      if (key === 'skillMultipliers') {
        skillMultipliers = value as SkillMultiplierData;
        continue; // Merged into skill frames below
      }
      if (key === 'skillIds') {
        skillIds = value as Record<string, string>;
        continue; // Merged into skills below
      }
      merged[key] = value;
    }
    console.log(`  Warfarin: operator info merged`);
  }

  // Merge End-Axis data (skills)
  if (endAxisData) {
    merged.skills = mergeSkills(
      existing.skills as Record<string, unknown> | undefined,
      endAxisData.skills,
    );
    console.log(`  End-Axis: ${Object.keys(endAxisData.skills).length} skill categories merged`);
  }

  // Warfarin-only fallback: create skeleton skills from multiplier data when End-Axis has none
  if (!merged.skills && (skillMultipliers || skillDescriptions)) {
    const skeleton: Record<string, Record<string, unknown>> = {};
    // Create categories from multiplier data (has segment structure info)
    if (skillMultipliers) {
      for (const [category, subIndexMap] of Object.entries(skillMultipliers)) {
        const indices = Object.keys(subIndexMap).map(Number);
        if (category === 'BASIC_ATTACK' || category === 'ENHANCED_BASIC_ATTACK' || category === 'EMPOWERED_BASIC_ATTACK') {
          // Segmented: create segments with frames derived from hit count
          skeleton[category] = {
            segments: indices.map(idx => {
              const levelEntries = subIndexMap[idx];
              const hitCount = deriveHitCount(levelEntries);
              return {
                metadata: {
                  eventComponentType: 'SEGMENT',
                  dataSources: ['WARFARIN'],
                },
                properties: {
                  duration: { value: 0, unit: 'SECOND' },
                },
                frames: Array.from({ length: hitCount }, () => ({
                  metadata: {
                    eventComponentType: 'FRAME',
                    dataSources: ['WARFARIN'],
                  },
                  properties: {
                    offset: { value: 0, unit: 'SECOND' },
                  },
                  effects: [],
                })),
              };
            }),
          };
        } else {
          // Flat: create frames from hit count
          const levelEntries = subIndexMap[0];
          if (levelEntries) {
            const hitCount = deriveHitCount(levelEntries);
            skeleton[category] = {
              frames: Array.from({ length: hitCount }, () => ({
                metadata: {
                  eventComponentType: 'FRAME',
                  dataSources: ['WARFARIN'],
                },
                properties: {
                  offset: { value: 0, unit: 'SECOND' },
                },
                effects: [],
              })),
            };
          }
        }
      }
    }
    // Also create entries for described skills that aren't in multipliers
    if (skillDescriptions) {
      for (const categoryKey of Object.keys(skillDescriptions)) {
        if (!skeleton[categoryKey]) {
          skeleton[categoryKey] = {};
        }
      }
    }
    merged.skills = skeleton;
    console.log(`  Warfarin fallback: created skeleton skills for ${Object.keys(skeleton).length} categories`);
  }

  // Merge skill descriptions from Warfarin into skill categories
  if (skillDescriptions && merged.skills) {
    const skills = merged.skills as Record<string, Record<string, unknown>>;
    for (const [categoryKey, desc] of Object.entries(skillDescriptions)) {
      if (skills[categoryKey]) {
        if (!skills[categoryKey].properties) skills[categoryKey].properties = {};
        const props = skills[categoryKey].properties as Record<string, unknown>;
        props.name = desc.name;
        props.description = desc.description;
      }
    }
    console.log(`  Warfarin: ${Object.keys(skillDescriptions).length} skill descriptions merged`);
  }

  // Merge skill IDs (CombatSkillsType enum values) from Warfarin into skill categories
  if (skillIds && merged.skills) {
    const skills = merged.skills as Record<string, Record<string, unknown>>;
    for (const [categoryKey, id] of Object.entries(skillIds)) {
      if (skills[categoryKey]) {
        skills[categoryKey].id = id;
      }
    }
  }

  // Merge Warfarin multipliers into End-Axis frames
  if (skillMultipliers && merged.skills) {
    mergeMultipliersIntoSkills(
      merged.skills as Record<string, SkillCategoryData>,
      skillMultipliers,
    );
    const categories = Object.keys(skillMultipliers);
    console.log(`  Warfarin: multipliers merged into ${categories.length} skill categories (${categories.join(', ')})`);
  }

  // Write back
  saveOperator(operatorType, merged);
}

async function parseAll(roster: unknown[]) {
  const results: { key: string; hasLevels: boolean; skillCount: number }[] = [];

  for (const slug of ALL_WARFARIN_SLUGS) {
    console.log(`\n── Parsing ${slug} ──`);

    const gamedataId = WARFARIN_SLUG_TO_GAMEDATA_ID[slug];

    // Run both parsers
    const [warfarinData, endAxisData] = await Promise.all([
      runWarfarinParser(slug),
      runEndAxisParser(roster, gamedataId),
    ]);

    const operatorType = endAxisData?.operatorType
      ?? (warfarinData as Record<string, unknown>)?.operatorType as string
      ?? gamedataId;

    const existing = loadOperator(operatorType);
    const merged: Record<string, unknown> = { ...existing };

    let skillDescriptions: Record<string, { name: string; description: string }> | undefined;
    let skillMultipliers: SkillMultiplierData | undefined;
    let skillIds: Record<string, string> | undefined;
    if (warfarinData) {
      for (const [key, value] of Object.entries(warfarinData)) {
        if (key === 'skills') continue;
        if (key === 'skillDescriptions') {
          skillDescriptions = value as Record<string, { name: string; description: string }>;
          continue;
        }
        if (key === 'skillMultipliers') {
          skillMultipliers = value as SkillMultiplierData;
          continue;
        }
        if (key === 'skillIds') {
          skillIds = value as Record<string, string>;
          continue;
        }
        merged[key] = value;
      }
      console.log(`  Warfarin: operator info merged`);
    }

    if (endAxisData) {
      merged.skills = mergeSkills(
        existing.skills as Record<string, unknown> | undefined,
        endAxisData.skills,
      );
      console.log(`  End-Axis: ${Object.keys(endAxisData.skills).length} skill categories merged`);
    }

    if (skillDescriptions && merged.skills) {
      const skills = merged.skills as Record<string, Record<string, unknown>>;
      for (const [categoryKey, desc] of Object.entries(skillDescriptions)) {
        if (skills[categoryKey]) {
          if (!skills[categoryKey].properties) skills[categoryKey].properties = {};
          const props = skills[categoryKey].properties as Record<string, unknown>;
          props.name = desc.name;
          props.description = desc.description;
        }
      }
      console.log(`  Warfarin: ${Object.keys(skillDescriptions).length} skill descriptions merged`);
    }

    if (skillIds && merged.skills) {
      const skills = merged.skills as Record<string, Record<string, unknown>>;
      for (const [categoryKey, id] of Object.entries(skillIds)) {
        if (skills[categoryKey]) skills[categoryKey].id = id;
      }
    }

    // Merge Warfarin multipliers into End-Axis frames
    if (skillMultipliers && merged.skills) {
      mergeMultipliersIntoSkills(
        merged.skills as Record<string, SkillCategoryData>,
        skillMultipliers,
      );
      console.log(`  Warfarin: multipliers merged into ${Object.keys(skillMultipliers).length} skill categories`);
    }

    saveOperator(operatorType, merged);
    results.push({
      key: operatorType,
      hasLevels: !!merged.allLevels,
      skillCount: Object.keys((merged.skills as Record<string, unknown>) ?? {}).length,
    });
  }

  console.log(`\n── Done ──`);
  console.log(`Wrote ${results.length} operators to ${OPERATORS_DIR}/`);

  // Summary
  for (const r of results) {
    console.log(`  ${r.key}: ${r.hasLevels ? 'info+stats' : 'skills only'}, ${r.skillCount} skill categories`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx src/model/utils/parsers/parseGameData.ts <slug | --all>');
    console.error('\nAvailable slugs:');
    for (const slug of ALL_WARFARIN_SLUGS) {
      console.error(`  ${slug}`);
    }
    process.exit(1);
  }

  const gameData = await fetchGameData();
  const roster = gameData.characterRoster;
  console.log(`Loaded ${roster.length} characters from End-Axis`);

  if (arg === '--all') {
    await parseAll(roster);
  } else {
    await parseOne(arg, roster);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
