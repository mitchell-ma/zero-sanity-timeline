/**
 * Embed codec: encodes/decodes app state as a compressed URL parameter.
 *
 * Encoding: SheetData → delta-encode vs defaults → JSON → deflate-raw → base64url
 * Decoding: base64url → inflate → JSON → sanitize → apply deltas to defaults → SheetData
 *
 * SECURITY: The decoded data is purely configuration (operator IDs, numeric stats,
 * frame positions). No code is ever executed from the decoded payload. All string
 * values are validated against known enums/registries before use.
 */

import { SheetData, cleanSheetData } from './sheetStorage';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../view/OperatorLoadoutHeader';
import { LoadoutStats, DEFAULT_LOADOUT_STATS } from '../view/InformationPane';
import { EnemyStats, getDefaultEnemyStats } from '../controller/appStateController';
import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { ALL_ENEMIES } from '../utils/enemies';
import type { TimelineEvent, Column } from '../consts/viewTypes';

const EMBED_VERSION = 1;

// ── Size limits ─────────────────────────────────────────────────────────────

/** Maximum encoded URL parameter length (bytes). Reject anything larger. */
const MAX_ENCODED_LENGTH = 16384;
/** Maximum number of events in an embed. */
const MAX_EVENTS = 200;
/** Maximum number of slots. */
const MAX_SLOTS = 4;
/** Maximum frame value (120fps × 120s). */
const MAX_FRAME = 14400;

// ── Compact types ───────────────────────────────────────────────────────────

interface EmbedData {
  v: number;
  ops: (string | null)[];
  en: string;
  enD?: Record<string, number>;
  slots?: Record<number, SlotDelta>;
  evs: EventCompact[];
}

interface SlotDelta {
  eq?: Record<string, string>;
  st?: Record<string, number>;
}

interface EventCompact {
  o: number;
  s: string;
  c: string;
  f: number;
  ad?: number;
  ac?: number;
  cd?: number;
  an?: number;
  eh?: number;
  sl?: number;
  pd?: boolean;
  fc?: boolean;
  ti?: string;
}

// ── Equipment key mapping ───────────────────────────────────────────────────

const EQUIP_KEYS: [string, keyof OperatorLoadoutState][] = [
  ['w', 'weaponName'],
  ['a', 'armorName'],
  ['g', 'glovesName'],
  ['k1', 'kit1Name'],
  ['k2', 'kit2Name'],
  ['c', 'consumableName'],
  ['t', 'tacticalName'],
];

const SLOT_IDS = ['slot-0', 'slot-1', 'slot-2', 'slot-3'];

// ── Known ID sets for validation ────────────────────────────────────────────

const KNOWN_OPERATOR_IDS = new Set(ALL_OPERATORS.map(op => op.id));
const KNOWN_ENEMY_IDS = new Set(ALL_ENEMIES.map(e => e.id));

// ── Compression helpers ─────────────────────────────────────────────────────

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Sanitization helpers ────────────────────────────────────────────────────

/** Ensure value is a finite number, clamped to [min, max]. */
function sanitizeNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.round(val)));
}

/** Ensure value is a string with max length. */
function sanitizeStr(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  // Strip any non-printable/control characters
  const clean = val.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
  return clean.length > 0 ? clean : null;
}

// ── Delta helpers ───────────────────────────────────────────────────────────

function diffStats(
  stats: LoadoutStats,
  defaults: LoadoutStats,
): Record<string, number> | undefined {
  const delta: Record<string, number> = {};
  const numericKeys: (keyof LoadoutStats)[] = [
    'operatorLevel', 'potential', 'talentOneLevel', 'talentTwoLevel',
    'attributeIncreaseLevel', 'basicAttackLevel', 'battleSkillLevel',
    'comboSkillLevel', 'ultimateLevel', 'weaponLevel',
    'weaponSkill1Level', 'weaponSkill2Level', 'weaponSkill3Level',
  ];
  for (const key of numericKeys) {
    const val = stats[key] as number;
    const def = defaults[key] as number;
    if (val !== def) delta[key] = val;
  }
  for (const key of ['armorRanks', 'glovesRanks', 'kit1Ranks', 'kit2Ranks'] as const) {
    const ranks = stats[key];
    const defRanks = defaults[key];
    if (ranks && Object.keys(ranks).length > 0) {
      for (const [stat, rank] of Object.entries(ranks)) {
        if (rank !== (defRanks?.[stat] ?? 4)) {
          delta[`${key}.${stat}`] = rank;
        }
      }
    }
  }
  if (stats.tacticalMaxUses != null) {
    delta['tacticalMaxUses'] = stats.tacticalMaxUses;
  }
  return Object.keys(delta).length > 0 ? delta : undefined;
}

function applyStatDeltas(
  defaults: LoadoutStats,
  delta: Record<string, number>,
): LoadoutStats {
  const result = { ...defaults, armorRanks: { ...defaults.armorRanks }, glovesRanks: { ...defaults.glovesRanks }, kit1Ranks: { ...defaults.kit1Ranks }, kit2Ranks: { ...defaults.kit2Ranks } };
  const rankKeys = ['armorRanks', 'glovesRanks', 'kit1Ranks', 'kit2Ranks'] as const;
  for (const [key, val] of Object.entries(delta)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) continue; // sanitize
    if (key === 'tacticalMaxUses') {
      result.tacticalMaxUses = sanitizeNum(val, 0, 100, 0);
      continue;
    }
    const rankMatch = rankKeys.find(rk => key.startsWith(`${rk}.`));
    if (rankMatch) {
      const stat = key.slice(rankMatch.length + 1);
      if (sanitizeStr(stat, 50)) {
        result[rankMatch] = { ...result[rankMatch], [stat]: sanitizeNum(val, 1, 4, 4) };
      }
      continue;
    }
    // Only allow known numeric stat keys
    const knownKeys = ['operatorLevel', 'potential', 'talentOneLevel', 'talentTwoLevel',
      'attributeIncreaseLevel', 'basicAttackLevel', 'battleSkillLevel',
      'comboSkillLevel', 'ultimateLevel', 'weaponLevel',
      'weaponSkill1Level', 'weaponSkill2Level', 'weaponSkill3Level'];
    if (knownKeys.includes(key)) {
      (result as any)[key] = sanitizeNum(val, 0, 90, (defaults as any)[key]);
    }
  }
  return result;
}

function diffEnemyStats(
  stats: EnemyStats,
  enemyId: string,
): Record<string, number> | undefined {
  const defaults = getDefaultEnemyStats(enemyId);
  const delta: Record<string, number> = {};
  for (const [key, val] of Object.entries(stats)) {
    if (typeof val === 'number' && val !== (defaults as any)[key]) {
      delta[key] = val;
    }
  }
  return Object.keys(delta).length > 0 ? delta : undefined;
}

// ── Event template lookup ───────────────────────────────────────────────────

interface EventDefaults {
  activationDuration: number;
  activeDuration: number;
  cooldownDuration: number;
  animationDuration?: number;
}

function findEventTemplate(columns: Column[], columnId: string, skillName: string): EventDefaults | null {
  for (const col of columns) {
    if (col.type !== 'mini-timeline') continue;
    if (col.defaultEvent?.name === skillName) {
      return {
        activationDuration: col.defaultEvent.defaultActivationDuration,
        activeDuration: col.defaultEvent.defaultActiveDuration,
        cooldownDuration: col.defaultEvent.defaultCooldownDuration,
        animationDuration: col.defaultEvent.animationDuration,
      };
    }
    if (col.eventVariants) {
      for (const v of col.eventVariants) {
        if (v.name === skillName) {
          return {
            activationDuration: v.defaultActivationDuration,
            activeDuration: v.defaultActiveDuration,
            cooldownDuration: v.defaultCooldownDuration,
            animationDuration: v.animationDuration,
          };
        }
      }
    }
    if (col.columnId === columnId && col.defaultEvent) {
      return {
        activationDuration: col.defaultEvent.defaultActivationDuration,
        activeDuration: col.defaultEvent.defaultActiveDuration,
        cooldownDuration: col.defaultEvent.defaultCooldownDuration,
        animationDuration: col.defaultEvent.animationDuration,
      };
    }
  }
  return null;
}

// ── Encode ──────────────────────────────────────────────────────────────────

export async function encodeEmbed(
  sheetData: SheetData,
  columns: Column[],
): Promise<string> {
  const cleaned = cleanSheetData(sheetData);

  const embed: EmbedData = {
    v: EMBED_VERSION,
    ops: cleaned.operatorIds,
    en: cleaned.enemyId,
    evs: [],
  };

  // Enemy stat deltas
  if (cleaned.enemyStats) {
    embed.enD = diffEnemyStats(cleaned.enemyStats, cleaned.enemyId);
  }

  // Slot deltas
  const slots: Record<number, SlotDelta> = {};
  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slotId = SLOT_IDS[i];
    const opId = cleaned.operatorIds[i];
    if (!opId) continue;

    const loadout = cleaned.loadouts[slotId];
    const stats = cleaned.loadoutStats[slotId];
    const slotDelta: SlotDelta = {};

    if (loadout) {
      const eq: Record<string, string> = {};
      for (const [shortKey, longKey] of EQUIP_KEYS) {
        const val = loadout[longKey] as string | null;
        if (val != null) eq[shortKey] = val;
      }
      if (Object.keys(eq).length > 0) slotDelta.eq = eq;
    }

    if (stats) {
      slotDelta.st = diffStats(stats, DEFAULT_LOADOUT_STATS);
    }

    if (slotDelta.eq || slotDelta.st) {
      slots[i] = slotDelta;
    }
  }
  if (Object.keys(slots).length > 0) embed.slots = slots;

  // Events — delta against templates
  for (const ev of cleaned.events) {
    const slotIdx = SLOT_IDS.indexOf(ev.ownerId);
    const template = findEventTemplate(columns, ev.columnId, ev.name);

    const compact: EventCompact = {
      o: slotIdx >= 0 ? slotIdx : 0,
      s: ev.name,
      c: ev.columnId,
      f: ev.startFrame,
    };

    if (template) {
      if (ev.activationDuration !== template.activationDuration) compact.ad = ev.activationDuration;
      if (ev.activeDuration !== template.activeDuration) compact.ac = ev.activeDuration;
      if (ev.cooldownDuration !== template.cooldownDuration) compact.cd = ev.cooldownDuration;
      if (ev.animationDuration !== template.animationDuration) compact.an = ev.animationDuration;
    } else {
      compact.ad = ev.activationDuration;
      compact.ac = ev.activeDuration;
      compact.cd = ev.cooldownDuration;
      if (ev.animationDuration) compact.an = ev.animationDuration;
    }

    if (ev.enemiesHit != null) compact.eh = ev.enemiesHit;
    if (ev.statusLevel != null) compact.sl = ev.statusLevel;
    if (ev.isPerfectDodge) compact.pd = true;
    if (ev.isForced) compact.fc = true;
    if (ev.timeInteraction) compact.ti = ev.timeInteraction;

    embed.evs.push(compact);
  }

  const json = JSON.stringify(embed);
  const bytes = new TextEncoder().encode(json);
  const compressed = await deflateRaw(bytes);
  return toBase64Url(compressed);
}

// ── Decode ──────────────────────────────────────────────────────────────────

/**
 * Safely parse and validate an encoded embed string into raw EmbedData.
 * Throws on invalid input. No code execution — pure JSON parsing + validation.
 */
function parseAndValidate(json: string): EmbedData {
  const raw = JSON.parse(json);

  // Must be a plain object
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid embed data: not an object');
  }

  // Version check
  const v = raw.v;
  if (typeof v !== 'number' || v < 1 || v > EMBED_VERSION) {
    throw new Error(`Unsupported embed version: ${v}`);
  }

  // Operator IDs: array of (string | null), max 4 entries
  if (!Array.isArray(raw.ops) || raw.ops.length > MAX_SLOTS) {
    throw new Error('Invalid operator IDs');
  }
  const ops: (string | null)[] = raw.ops.slice(0, MAX_SLOTS).map((id: unknown) => {
    if (id === null) return null;
    const str = sanitizeStr(id, 100);
    // Only allow known operator IDs
    if (str && KNOWN_OPERATOR_IDS.has(str)) return str;
    return null; // Unknown operator → treat as empty slot
  });

  // Enemy ID: must be a known enemy
  const enRaw = sanitizeStr(raw.en, 100);
  const en = enRaw && KNOWN_ENEMY_IDS.has(enRaw) ? enRaw : 'training_dummy';

  // Enemy stat deltas: Record<string, number>, all values must be finite numbers
  let enD: Record<string, number> | undefined;
  if (raw.enD && typeof raw.enD === 'object' && !Array.isArray(raw.enD)) {
    const cleaned: Record<string, number> = {};
    for (const [key, val] of Object.entries(raw.enD)) {
      const k = sanitizeStr(key, 50);
      if (k && typeof val === 'number' && Number.isFinite(val)) {
        cleaned[k] = val;
      }
    }
    if (Object.keys(cleaned).length > 0) enD = cleaned;
  }

  // Slot deltas
  let slots: Record<number, SlotDelta> | undefined;
  if (raw.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots)) {
    const cleaned: Record<number, SlotDelta> = {};
    for (const [idxStr, slotRaw] of Object.entries(raw.slots)) {
      const idx = Number(idxStr);
      if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_SLOTS) continue;
      if (slotRaw == null || typeof slotRaw !== 'object') continue;
      const slot = slotRaw as Record<string, unknown>;

      const delta: SlotDelta = {};

      // Equipment: Record<string, string>
      if (slot.eq && typeof slot.eq === 'object' && !Array.isArray(slot.eq)) {
        const eq: Record<string, string> = {};
        for (const [k, v] of Object.entries(slot.eq as Record<string, unknown>)) {
          const key = sanitizeStr(k, 10);
          const val = sanitizeStr(v, 200);
          if (key && val) eq[key] = val;
        }
        if (Object.keys(eq).length > 0) delta.eq = eq;
      }

      // Stat deltas: Record<string, number>
      if (slot.st && typeof slot.st === 'object' && !Array.isArray(slot.st)) {
        const st: Record<string, number> = {};
        for (const [k, v] of Object.entries(slot.st as Record<string, unknown>)) {
          const key = sanitizeStr(k, 100);
          if (key && typeof v === 'number' && Number.isFinite(v)) {
            st[key] = v;
          }
        }
        if (Object.keys(st).length > 0) delta.st = st;
      }

      if (delta.eq || delta.st) cleaned[idx] = delta;
    }
    if (Object.keys(cleaned).length > 0) slots = cleaned;
  }

  // Events: array of compact events
  if (!Array.isArray(raw.evs)) {
    throw new Error('Invalid events array');
  }
  const evs: EventCompact[] = [];
  const eventList = raw.evs.slice(0, MAX_EVENTS);
  for (const evRaw of eventList) {
    if (evRaw == null || typeof evRaw !== 'object') continue;

    const o = sanitizeNum(evRaw.o, 0, MAX_SLOTS - 1, 0);
    const s = sanitizeStr(evRaw.s, 200);
    const c = sanitizeStr(evRaw.c, 200);
    const f = sanitizeNum(evRaw.f, 0, MAX_FRAME, 0);

    if (!s || !c) continue; // Skip events with invalid names/columns

    const compact: EventCompact = { o, s, c, f };
    if (typeof evRaw.ad === 'number' && Number.isFinite(evRaw.ad)) compact.ad = sanitizeNum(evRaw.ad, 0, MAX_FRAME, 0);
    if (typeof evRaw.ac === 'number' && Number.isFinite(evRaw.ac)) compact.ac = sanitizeNum(evRaw.ac, 0, MAX_FRAME, 0);
    if (typeof evRaw.cd === 'number' && Number.isFinite(evRaw.cd)) compact.cd = sanitizeNum(evRaw.cd, 0, MAX_FRAME, 0);
    if (typeof evRaw.an === 'number' && Number.isFinite(evRaw.an)) compact.an = sanitizeNum(evRaw.an, 0, MAX_FRAME, 0);
    if (typeof evRaw.eh === 'number') compact.eh = sanitizeNum(evRaw.eh, 1, 10, 1);
    if (typeof evRaw.sl === 'number') compact.sl = sanitizeNum(evRaw.sl, 1, 4, 1);
    if (evRaw.pd === true) compact.pd = true;
    if (evRaw.fc === true) compact.fc = true;
    if (typeof evRaw.ti === 'string') compact.ti = sanitizeStr(evRaw.ti, 50) ?? undefined;

    evs.push(compact);
  }

  return { v, ops, en, enD, slots, evs };
}

/**
 * Decode an embed URL parameter into a SheetData object.
 *
 * Two-phase decode:
 * 1. Parse + validate the raw data (no columns needed — just extracts operator/enemy IDs)
 * 2. Reconstruct full SheetData using column templates for event defaults
 *
 * When columns are not yet available, pass an empty array — events will use
 * their explicit durations or fall back to zero.
 */
export async function decodeEmbed(
  encoded: string,
  columns: Column[],
): Promise<SheetData> {
  // Size gate
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error(`Embed data too large (${encoded.length} chars, max ${MAX_ENCODED_LENGTH})`);
  }

  // Decompress
  const compressed = fromBase64Url(encoded);
  const bytes = await inflateRaw(compressed);
  const json = new TextDecoder().decode(bytes);

  // Parse + validate (no code execution — pure data validation)
  const embed = parseAndValidate(json);

  // Reconstruct enemy stats
  const enemyStats = getDefaultEnemyStats(embed.en);
  if (embed.enD) {
    for (const [key, val] of Object.entries(embed.enD)) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        (enemyStats as any)[key] = val;
      }
    }
  }

  // Reconstruct loadouts and stats
  const loadouts: Record<string, OperatorLoadoutState> = {};
  const loadoutStats: Record<string, LoadoutStats> = {};

  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slotId = SLOT_IDS[i];
    const opId = embed.ops[i];
    if (!opId) {
      loadouts[slotId] = { ...EMPTY_LOADOUT };
      loadoutStats[slotId] = { ...DEFAULT_LOADOUT_STATS };
      continue;
    }

    const delta = embed.slots?.[i];

    // Equipment
    const loadout: OperatorLoadoutState = { ...EMPTY_LOADOUT };
    if (delta?.eq) {
      for (const [shortKey, longKey] of EQUIP_KEYS) {
        const val = delta.eq[shortKey];
        if (typeof val === 'string' && val.length > 0) {
          (loadout as any)[longKey] = val;
        }
      }
    }
    loadouts[slotId] = loadout;

    // Stats
    loadoutStats[slotId] = delta?.st
      ? applyStatDeltas(DEFAULT_LOADOUT_STATS, delta.st)
      : { ...DEFAULT_LOADOUT_STATS };
  }

  // Reconstruct events
  const events: TimelineEvent[] = [];
  for (let i = 0; i < embed.evs.length; i++) {
    const compact = embed.evs[i];
    const ownerId = SLOT_IDS[compact.o] ?? SLOT_IDS[0];
    const template = findEventTemplate(columns, compact.c, compact.s);

    const ev: TimelineEvent = {
      id: `ev-${i + 1}`,
      name: compact.s,
      ownerId,
      columnId: compact.c,
      startFrame: compact.f,
      activationDuration: compact.ad ?? template?.activationDuration ?? 0,
      activeDuration: compact.ac ?? template?.activeDuration ?? 0,
      cooldownDuration: compact.cd ?? template?.cooldownDuration ?? 0,
    };

    if (compact.an != null) ev.animationDuration = compact.an;
    else if (template?.animationDuration != null) ev.animationDuration = template.animationDuration;

    if (compact.eh != null) ev.enemiesHit = compact.eh;
    if (compact.sl != null) ev.statusLevel = compact.sl;
    if (compact.pd) ev.isPerfectDodge = true;
    if (compact.fc) ev.isForced = true;
    if (compact.ti) ev.timeInteraction = compact.ti;

    events.push(ev);
  }

  // Build visible skills (all visible for shared URLs)
  const visibleSkills: Record<string, Record<string, boolean>> = {};
  for (const slotId of SLOT_IDS) {
    visibleSkills[slotId] = { basic: true, battle: true, combo: true, ultimate: true };
  }

  return {
    version: 2,
    operatorIds: embed.ops,
    enemyId: embed.en,
    enemyStats,
    events,
    loadouts,
    loadoutStats,
    visibleSkills,
    nextEventId: events.length + 1,
  };
}

// ── URL helpers ─────────────────────────────────────────────────────────────

export async function buildShareUrl(
  sheetData: SheetData,
  columns: Column[],
  loadoutName: string,
): Promise<string> {
  const encoded = await encodeEmbed(sheetData, columns);
  const base = window.location.origin + window.location.pathname;
  const name = encodeURIComponent(loadoutName.slice(0, 32));
  return `${base}?d=${encoded}&n=${name}`;
}

export function getEmbedParams(): { data: string; name: string } | null {
  const params = new URLSearchParams(window.location.search);
  const data = params.get('d');
  if (!data) return null;
  return { data, name: params.get('n') || 'Shared Loadout' };
}
