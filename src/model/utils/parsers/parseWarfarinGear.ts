/**
 * Fetches gear data from the Warfarin API and outputs structured data
 * for src/model/game-data/gears/<set-slug>.json.
 *
 * Usage:
 *   npx tsx src/model/utils/parsers/parseWarfarinGear.ts --all
 *   npx tsx src/model/utils/parsers/parseWarfarinGear.ts <suitID>
 *
 * Examples:
 *   npx tsx src/model/utils/parsers/parseWarfarinGear.ts --all
 *   npx tsx src/model/utils/parsers/parseWarfarinGear.ts suit_fire_natr01
 */

import * as fs from 'fs';
import * as path from 'path';
import { StatType } from '../../enums/stats';
import { WarfarinAttributeType, WARFARIN_TO_STAT } from './warfarin';

const GEAR_LIST_URL = 'https://api.warfarin.wiki/v1/en/gear?version=1.1';
const GEAR_DETAIL_URL = 'https://api.warfarin.wiki/v1/en/gear';
const GEARS_DIR = path.resolve(__dirname, '../../game-data/gears');

// ── partType → GearCategory mapping ──────────────────────────────────────────────

const PART_TYPE_MAP: Record<number, string> = {
  0: 'ARMOR',
  1: 'GLOVES',
  2: 'KIT',
};

const GEAR_CATEGORY_LABELS: Record<string, string> = {
  ARMOR: 'Armor',
  GLOVES: 'Gloves',
  KIT: 'Kit',
};

// ── suitID → GearSetType mapping ──────────────────────────────────────────

const SUIT_ID_TO_GEAR_EFFECT_TYPE: Record<string, string> = {
  suit_fire_natr01: 'HOT_WORK',
  suit_pulse_cryst01: 'PULSER_LABS',
  suit_poise01: 'AETHERTECH',
  suit_phy01: 'SWORDMANCER',
  suit_criti01: 'MI_SECURITY',
  suit_atb01: 'FRONTIERS',
  suit_atk02: 'TYPE_50_YINGLUNG',
  suit_heal01: 'LYNX',
  suit_usp02: 'ETERNAL_XIRANITE',
  suit_attri01: 'BONEKRUSHA',
  suit_usp01: 'CATASTROPHE',
  suit_atk01: 'ABURREY_LEGACY',
  suit_str01: 'ARMORED_MSGR',
  suit_agi01: 'ROVING_MSGR',
  suit_wisd01: 'MORDVOLT_INSULATION',
  suit_will01: 'MORDVOLT_RESISTANT',
  suit_stragi01: 'AIC_HEAVY',
  suit_wisdwill01: 'AIC_LIGHT',
  suit_burst01: 'TIDE_SURGE',
};

// Reverse for filename generation
const GEAR_EFFECT_TO_SLUG: Record<string, string> = {
  HOT_WORK: 'hot-work',
  PULSER_LABS: 'pulser-labs',
  AETHERTECH: 'aethertech',
  SWORDMANCER: 'swordmancer',
  MI_SECURITY: 'mi-security',
  FRONTIERS: 'frontiers',
  TYPE_50_YINGLUNG: 'type-50-yinglung',
  LYNX: 'lynx',
  ETERNAL_XIRANITE: 'eternal-xiranite',
  BONEKRUSHA: 'bonekrusha',
  CATASTROPHE: 'catastrophe',
  ABURREY_LEGACY: 'aburrey-legacy',
  ARMORED_MSGR: 'armored-msgr',
  ROVING_MSGR: 'roving-msgr',
  MORDVOLT_INSULATION: 'mordvolt-insulation',
  MORDVOLT_RESISTANT: 'mordvolt-resistant',
  AIC_HEAVY: 'aic-heavy',
  AIC_LIGHT: 'aic-light',
  TIDE_SURGE: 'tide-surge',
  NONE: 'no-set',
};

// ── Composite attribute → StatType mapping ───────────────────────────────────

const COMPOSITE_ATTR_MAP: Record<string, StatType[]> = {
  FireAndNaturalDamageIncrease: [StatType.HEAT_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS],
  CrystAndPulseDamageIncrease: [StatType.CRYO_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS],
  AllSkillDamageIncrease: [StatType.SKILL_DAMAGE_BONUS],
  SpellDamageIncrease: [StatType.ARTS_DAMAGE_BONUS],
};

// ── Types ────────────────────────────────────────────────────────────────────

interface GearListItem {
  slug: string;
  id: string;
  name: string;
  iconId: string;
  rarity: number;
  minWearLv: number;
  partType: number;
  suitID: string;
  displayBaseAttrModifier: {
    attrIndex: number;
    attrType: number;
    attrValue: number;
    compositeAttr: string;
    enhancedAttrValues: number[];
    modifierType: number;
  };
  displayAttrModifiers: AttrModifier[];
}

interface AttrModifier {
  attrIndex: number;
  attrType: number;
  attrValue: number;
  compositeAttr: string;
  enhancedAttrValues: number[];
  modifierType: number;
}

interface GearSetJSON {
  gearSetType: string;
  name: string;
  suitID: string;
  rarity: number;
  setEffect: {
    piecesRequired: number;
    gearSetEffectType: string;
    description: string;
  } | null;
  pieces: GearPieceJSON[];
  dataSources: string[];
}

interface GearPieceJSON {
  gearType: string;
  name: string;
  gearCategory: string;
  defense: number;
  allLevels: Record<string, Record<string, number>>;
}

// ── Stat resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a single attrType + compositeAttr + modifierType into
 * an array of [StatType, value] pairs.
 */
function resolveStats(
  attrType: number,
  value: number,
  compositeAttr: string,
  modifierType: number,
): [string, number][] {
  // ── Composite attributes (attrType 0) ──────────────────────────────────
  if (attrType === 0 && compositeAttr) {
    // AllDamageTakenScalar needs conversion: value is a multiplier (0.961 = 3.9% reduction)
    if (compositeAttr === 'AllDamageTakenScalar') {
      return [[StatType.FINAL_DAMAGE_REDUCTION, round(1 - value)]];
    }

    const statTypes = COMPOSITE_ATTR_MAP[compositeAttr];
    if (statTypes) {
      return statTypes.map(st => [st, round(value)]);
    }

    // "Main" / "Sub" = runtime-resolved attribute bonuses (like weapon's MAIN_ATTRIBUTE)
    // These resolve to the operator's main/secondary attribute at runtime.
    if (compositeAttr === 'Main') {
      return [['PRIMARY_ATTRIBUTE_BONUS' as any, round(value)]];
    }
    if (compositeAttr === 'Sub') {
      return [['SECONDARY_ATTRIBUTE_BONUS' as any, round(value)]];
    }

    // Unknown composite — warn and skip
    console.warn(`    Unknown compositeAttr: "${compositeAttr}" (value: ${value})`);
    return [];
  }

  // ── HP / ATK: modifierType determines flat vs percentage ───────────────
  if (attrType === WarfarinAttributeType.MaxHp) {
    const stat = modifierType === 6 ? StatType.HP_BONUS : StatType.FLAT_HP;
    return [[stat, round(value)]];
  }
  if (attrType === WarfarinAttributeType.Atk) {
    const stat = modifierType === 6 ? StatType.ATTACK_BONUS : StatType.BASE_ATTACK;
    return [[stat, round(value)]];
  }

  // ── Standard attribute lookup ──────────────────────────────────────────
  const statType = WARFARIN_TO_STAT[attrType as WarfarinAttributeType];
  if (statType) {
    return [[statType, round(value)]];
  }

  console.warn(`    Unmapped attrType: ${attrType} (value: ${value})`);
  return [];
}

/**
 * Round to clean floating point noise.
 * Uses 3 decimal digits for percentages (< 1).
 * Uses 1 decimal for flat stats with decimals (e.g., 41.4).
 * Keeps integers as-is.
 * Adds tiny epsilon before rounding to fix floating point edge cases
 * (e.g., 0.114999... → 0.115 instead of 0.114).
 */
function round(v: number): number {
  if (Number.isInteger(v)) return v;
  const eps = 1e-9;
  // Flat stats (>= 1): round to 1 decimal place
  if (Math.abs(v) >= 1) return Math.round((v + eps) * 10) / 10;
  // Percentages (< 1): round to 3 decimal places
  return Math.round((v + eps) * 1000) / 1000;
}

// ── Piece parsing ────────────────────────────────────────────────────────────

/** Convert API name to SCREAMING_SNAKE_CASE enum value. */
function toEnumValue(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase().replace(/^_|_$/g, '');
}

/** Convert SCREAMING_SNAKE_CASE to Title Case. */
function formatEnumName(enumValue: string): string {
  return enumValue
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function parsePiece(item: GearListItem): GearPieceJSON {
  const defense = item.displayBaseAttrModifier.attrValue;
  const gearCategory = PART_TYPE_MAP[item.partType] ?? `UNKNOWN_${item.partType}`;
  const gearType = toEnumValue(item.name);

  // Build stats for each rank (1-4)
  // Rank 1 = attrValue, Ranks 2-4 = enhancedAttrValues[0..2]
  const allLevels: Record<string, Record<string, number>> = {};

  for (let rank = 1; rank <= 4; rank++) {
    const rankStats: Record<string, number> = {};

    for (const mod of item.displayAttrModifiers) {
      const value = rank === 1
        ? mod.attrValue
        : (mod.enhancedAttrValues?.[rank - 2] ?? mod.attrValue);

      const resolved = resolveStats(mod.attrType, value, mod.compositeAttr, mod.modifierType);
      for (const [statKey, statVal] of resolved) {
        rankStats[statKey] = statVal;
      }
    }

    allLevels[String(rank)] = rankStats;
  }

  return {
    gearType,
    name: formatEnumName(gearType),
    gearCategory,
    defense: round(defense),
    allLevels,
  };
}

// ── Set effect fetching ──────────────────────────────────────────────────────

/** Strip rich text tags from API descriptions. */
function stripRichText(text: string): string {
  return text
    .replace(/<[#@][^>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchSetEffect(slug: string): Promise<{
  name: string;
  skillId: string;
  description: string;
  piecesRequired: number;
} | null> {
  const url = `${GEAR_DETAIL_URL}/${slug}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as { data: Record<string, any> };
    const data = json.data;

    const suitTable = data.equipSuitTable;
    if (!suitTable) return null;

    const skillId = suitTable.skillID || '';
    const piecesRequired = suitTable.equipCnt || 3;
    const name = suitTable.suitName || '';

    // Get description from skillPatchTable
    // Gear skillPatchTable has SkillPatchDataBundle directly at root (not keyed by skillId)
    let description = '';
    const bundle = data.skillPatchTable?.SkillPatchDataBundle?.[0];
    if (bundle) {
      description = stripRichText(bundle.description);
    }

    return { name, skillId, description, piecesRequired };
  } catch {
    return null;
  }
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

async function fetchGearList(): Promise<GearListItem[]> {
  console.log('Fetching gear list from Warfarin API...');
  const res = await fetch(GEAR_LIST_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json() as { meta: any; data: GearListItem[] };
  console.log(`  Found ${json.data.length} gear items`);
  return json.data;
}

function groupBySuit(items: GearListItem[]): Map<string, GearListItem[]> {
  const groups = new Map<string, GearListItem[]>();
  for (const item of items) {
    const key = item.suitID || '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

function setFilePath(gearSetType: string, suitID: string): string {
  const slug = GEAR_EFFECT_TO_SLUG[gearSetType] ?? suitID.replace(/_/g, '-');
  return path.join(GEARS_DIR, `${slug}.json`);
}

async function buildSetEntry(suitID: string, items: GearListItem[]): Promise<GearSetJSON> {
  const gearSetType = suitID === '__none__' ? 'NONE'
    : (SUIT_ID_TO_GEAR_EFFECT_TYPE[suitID] ?? `UNKNOWN_${suitID.toUpperCase()}`);
  const rarity = Math.max(...items.map(i => i.rarity));

  // Parse all pieces
  const pieces = items.map(parsePiece);

  // Sort pieces: ARMOR first, then GLOVES, then KIT
  const order = { ARMOR: 0, GLOVES: 1, KIT: 2 };
  pieces.sort((a, b) => (order[a.gearCategory as keyof typeof order] ?? 9) - (order[b.gearCategory as keyof typeof order] ?? 9));

  // Fetch set effect from detail endpoint (use first piece)
  let setEffect: GearSetJSON['setEffect'] = null;
  let name = gearSetType.replace(/_/g, ' ');

  if (suitID !== '__none__') {
    console.log(`  Fetching set effect for ${suitID}...`);
    const effect = await fetchSetEffect(items[0].slug);
    if (effect) {
      name = effect.name || name;
      if (effect.skillId) {
        setEffect = {
          piecesRequired: effect.piecesRequired,
          gearSetEffectType: gearSetType,
          description: effect.description,
        };
      }
    }
  }

  return {
    gearSetType,
    name,
    suitID,
    rarity,
    setEffect,
    pieces,
    dataSources: ['WARFARIN'],
  };
}

async function parseOne(suitID: string, items: GearListItem[]) {
  console.log(`\n── Parsing gear set: ${suitID} (${items.length} pieces) ──`);

  const entry = await buildSetEntry(suitID, items);
  const filePath = setFilePath(entry.gearSetType, suitID);

  // Preserve SELF entries
  if (fs.existsSync(filePath)) {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (hasSelfDataSource(existing)) {
      console.log(`  Preserving SELF data for ${suitID}`);
      return;
    }
  }

  if (!fs.existsSync(GEARS_DIR)) {
    fs.mkdirSync(GEARS_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n');
  console.log(`  Wrote ${entry.name} (${entry.gearSetType}) → ${path.basename(filePath)}`);
  console.log(`  Rarity: ${entry.rarity}, Pieces: ${entry.pieces.length}`);
  console.log(`  Set effect: ${entry.setEffect ? 'yes' : 'none'}`);
  for (const p of entry.pieces) {
    const stats = Object.keys(p.allLevels['1'] || {}).join(', ');
    console.log(`    ${p.gearCategory} "${p.name}" — DEF ${p.defense}, stats: ${stats}`);
  }
}

async function parseAll() {
  const items = await fetchGearList();
  const groups = groupBySuit(items);

  if (!fs.existsSync(GEARS_DIR)) {
    fs.mkdirSync(GEARS_DIR, { recursive: true });
  }

  const entries = Array.from(groups.entries());
  console.log(`\nGrouped into ${groups.size} sets:`);
  for (const [suitID, groupItems] of entries) {
    const gearSetType = suitID === '__none__'
      ? 'NONE'
      : (SUIT_ID_TO_GEAR_EFFECT_TYPE[suitID] ?? `UNKNOWN_${suitID}`);
    console.log(`  ${suitID} → ${gearSetType} (${groupItems.length} pieces)`);
  }

  let count = 0;
  for (const [suitID, groupItems] of entries) {
    try {
      await parseOne(suitID, groupItems);
      count++;
    } catch (err) {
      console.warn(`  Failed ${suitID}: ${(err as Error).message}`);
    }
  }

  console.log(`\n── Done ──`);
  console.log(`Wrote ${count} gear sets to ${GEARS_DIR}/`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx src/model/utils/parsers/parseWarfarinGear.ts <suitID | --all>');
    process.exit(1);
  }

  if (arg === '--all') {
    await parseAll();
  } else {
    // Fetch all and filter to the requested suitID
    const items = await fetchGearList();
    const matching = items.filter(i => i.suitID === arg);
    if (matching.length === 0) {
      console.error(`No gear items found with suitID "${arg}"`);
      console.error(`Available suitIDs: ${Array.from(new Set(items.map(i => i.suitID).filter(Boolean))).join(', ')}`);
      process.exit(1);
    }
    await parseOne(arg, matching);
  }
}

const isDirectRun = process.argv[1]?.includes('parseWarfarinGear');
if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
