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
const WARFARIN_API_BASE = 'https://api.warfarin.wiki/v1/en/operators';
const OPERATORS_DIR = path.resolve(__dirname, '../../game-data/operators');

function operatorFilePath(operatorType: string): string {
  const slug = operatorType.toLowerCase().replace(/_/g, '-');
  return path.join(OPERATORS_DIR, `${slug}.json`);
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
};

/** All known Warfarin slugs in order. */
const ALL_WARFARIN_SLUGS = Object.keys(WARFARIN_SLUG_TO_GAMEDATA_ID);

// ── Override comparison ──────────────────────────────────────────────────────

/**
 * Extracts comparable numeric values from a skill category for override comparison.
 * Returns a flat map of dot-path → value for diffing.
 */
function extractComparableValues(obj: unknown, prefix = ''): Map<string, number> {
  const values = new Map<string, number>();
  if (obj == null || typeof obj !== 'object') return values;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      extractComparableValues(item, `${prefix}[${i}]`).forEach((v, k) => {
        values.set(k, v);
      });
    });
    return values;
  }
  const record = obj as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if (key === 'dataSources' || key === 'eventComponentType') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'number') {
      values.set(path, val);
    } else if (typeof val === 'object' && val != null) {
      extractComparableValues(val, path).forEach((v, k) => {
        values.set(k, v);
      });
    }
  }
  return values;
}

/**
 * Compares incoming base skill data against existing overrides.
 * Logs warnings when new source data differs from override values,
 * since the updated source data may be more accurate than the overrides.
 */
function compareAgainstOverrides(
  operatorType: string,
  incoming: Record<string, unknown>,
  overrides: Record<string, unknown>,
): void {
  for (const [categoryKey, overrideCategory] of Object.entries(overrides)) {
    const incomingCategory = incoming[categoryKey];
    if (!incomingCategory) continue;

    const overrideValues = extractComparableValues(overrideCategory);
    const incomingValues = extractComparableValues(incomingCategory);

    overrideValues.forEach((overrideVal, path) => {
      const incomingVal = incomingValues.get(path);
      if (incomingVal !== undefined && Math.abs(incomingVal - overrideVal) > 0.0001) {
        console.warn(
          `    ⚠ OVERRIDE CONFLICT in ${operatorType} ${categoryKey}.${path}: ` +
          `source=${incomingVal}, override=${overrideVal} — new source data may be more accurate`
        );
      }
    });
  }
}

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
  eventComponentType: string;
  offset: { value: number; unit: string };
  resourceInteractions: unknown[];
  statusInteractions?: unknown[];
  dataSources?: string[];
  multipliers?: FlatMultiplierEntry[];
}

interface SegmentData {
  eventComponentType: string;
  duration: { value: number; unit: string };
  frames: FrameData[];
  dataSources?: string[];
}

interface SkillCategoryData {
  duration?: { value: number; unit: string };
  frames?: FrameData[];
  segments?: SegmentData[];
  resourceInteractions?: unknown[];
  animation?: unknown;
  name?: string;
  description?: string;
  multipliers?: MultiplierLevelEntry[];
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
    const skill = skills[category] as SkillCategoryData | undefined;
    if (!skill) continue;

    if (skill.segments) {
      // Segmented skill (basic attacks, multi-part skills)
      for (const [indexStr, levelEntries] of Object.entries(subIndexMap)) {
        const segIndex = parseInt(indexStr, 10);
        const segment = skill.segments[segIndex];
        if (!segment) continue;

        assignMultipliersToFrames(segment.frames, levelEntries);
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
        // Positional atk_scale for this frame (normalized to "atk_scale")
        if (entry.blackboard[scaleKey] !== undefined) {
          mult.atk_scale = entry.blackboard[scaleKey];
        }
        // Named atk_scale variants on every frame
        for (const key of namedScaleKeys) {
          if (entry.blackboard[key] !== undefined) {
            mult[key] = entry.blackboard[key];
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
            mult[key] = entry.blackboard[key];
          }
        }
        return mult;
      });
    }
  }

  // Store non-scale keys (poise, duration, etc.) on the first frame
  if (nonScaleKeys.length > 0 && frames[0]?.multipliers) {
    for (let i = 0; i < levelEntries.length; i++) {
      for (const key of nonScaleKeys) {
        if (levelEntries[i].blackboard[key] !== undefined) {
          (frames[0].multipliers[i] as Record<string, number>)[key] = levelEntries[i].blackboard[key];
        }
      }
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
    return await parseEndAxisOperator(roster as any[], gamedataId);
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
      merged[key] = value;
    }
    console.log(`  Warfarin: operator info merged`);
  }

  // Merge End-Axis data (skills)
  if (endAxisData) {
    // Compare incoming data against existing overrides before merging
    const existingOverrides = existing.skillOverrides as Record<string, unknown> | undefined;
    if (existingOverrides) {
      compareAgainstOverrides(operatorType, endAxisData.skills, existingOverrides);
    }

    merged.skills = mergeSkills(
      existing.skills as Record<string, unknown> | undefined,
      endAxisData.skills,
    );
    console.log(`  End-Axis: ${Object.keys(endAxisData.skills).length} skill categories merged`);

    // Preserve existing skillOverrides (never modified by parser)
    if (existingOverrides) {
      merged.skillOverrides = existingOverrides;
    }
  }

  // Merge skill descriptions from Warfarin into skill categories
  if (skillDescriptions && merged.skills) {
    const skills = merged.skills as Record<string, Record<string, unknown>>;
    for (const [categoryKey, desc] of Object.entries(skillDescriptions)) {
      if (skills[categoryKey]) {
        skills[categoryKey].name = desc.name;
        skills[categoryKey].description = desc.description;
      }
    }
    console.log(`  Warfarin: ${Object.keys(skillDescriptions).length} skill descriptions merged`);
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
        merged[key] = value;
      }
      console.log(`  Warfarin: operator info merged`);
    }

    if (endAxisData) {
      // Compare incoming data against existing overrides before merging
      const existingOverrides = existing.skillOverrides as Record<string, unknown> | undefined;
      if (existingOverrides) {
        compareAgainstOverrides(operatorType, endAxisData.skills, existingOverrides);
      }

      merged.skills = mergeSkills(
        existing.skills as Record<string, unknown> | undefined,
        endAxisData.skills,
      );
      console.log(`  End-Axis: ${Object.keys(endAxisData.skills).length} skill categories merged`);

      // Preserve existing skillOverrides (never modified by parser)
      if (existingOverrides) {
        merged.skillOverrides = existingOverrides;
      }
    }

    if (skillDescriptions && merged.skills) {
      const skills = merged.skills as Record<string, Record<string, unknown>>;
      for (const [categoryKey, desc] of Object.entries(skillDescriptions)) {
        if (skills[categoryKey]) {
          skills[categoryKey].name = desc.name;
          skills[categoryKey].description = desc.description;
        }
      }
      console.log(`  Warfarin: ${Object.keys(skillDescriptions).length} skill descriptions merged`);
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
      hasLevels: !!(merged as any).allLevels,
      skillCount: Object.keys((merged as any).skills ?? {}).length,
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
