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

import { NounType } from '../dsl/semantics';
import { SheetData, cleanSheetData } from './sheetStorage';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../view/OperatorLoadoutHeader';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../view/InformationPane';
import { EnemyStats, getDefaultEnemyStats } from '../controller/appStateController';
import { COMMON_OWNER_ID } from '../controller/slot/commonSlotController';
import { ENEMY_OWNER_ID } from '../model/channels';
import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { ALL_ENEMIES } from '../utils/enemies';
import type { TimelineEvent, Column, EventSegmentData } from '../consts/viewTypes';
import { eventDuration, durationSegment, computeSegmentsSpan } from '../consts/viewTypes';
import { ColumnType, SegmentType } from '../consts/enums';
import type { OverrideStore, EventOverride } from '../consts/overrideTypes';
import { buildOverrideKey } from '../controller/overrideController';

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
  /** Resource config overrides (SP start, ult gauge start, etc.). */
  rc?: Record<string, { s: number; m: number; r: number }>;
  /** Event overrides keyed by composite key. */
  ov?: OverrideCompact[];
}

interface OverrideCompact {
  /** Index into the evs array identifying which event this override applies to. */
  i: number;
  /** Segment duration overrides: [segIdx, duration] pairs. */
  sd?: number[][];
  /** Frame offset overrides: [segIdx, frameIdx, offsetFrame] triples. */
  fo?: number[][];
  /** Crit pins: [segIdx, frameIdx, 0|1] triples. */
  cr?: number[][];
  /** Chance pins: [clausePathHash, 0|1] pairs. */
  ch?: number[][];
  /** Deleted segment indices. */
  ds?: number[];
  /** Deleted frames: [segIdx, frameIdx] pairs. */
  df?: number[][];
  /** Additional segments: [insertAfter, duration] pairs. */
  as?: number[][];
  /** Additional frames: [segIdx, offsetFrame] pairs. */
  af?: number[][];
  /** Property overrides (sparse). */
  po?: Record<string, unknown>;
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
  /** Segment origin indices from the full variant chain. Absent = full chain. */
  so?: number[];
}

// ── Hash helpers ────────────────────────────────────────────────────────────

/** FNV-1a hash for compact clause path encoding. */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

// ── Equipment key mapping ───────────────────────────────────────────────────

const EQUIP_KEYS: [string, keyof OperatorLoadoutState][] = [
  ['w', 'weaponId'],
  ['a', 'armorId'],
  ['g', 'glovesId'],
  ['k1', 'kit1Id'],
  ['k2', 'kit2Id'],
  ['c', 'consumableId'],
  ['t', 'tacticalId'],
];

const SLOT_IDS = ['slot-0', 'slot-1', 'slot-2', 'slot-3'];

// Sentinel owner indices for non-slot owners (100+ to avoid collision with slot indices)
const COMMON_OWNER_IDX = 100;
const ENEMY_OWNER_IDX = 101;

// ── Known ID sets for validation ────────────────────────────────────────────

const KNOWN_OPERATOR_IDS = new Set(ALL_OPERATORS.map(op => op.id));
const KNOWN_ENEMY_IDS = new Set(ALL_ENEMIES.map(e => e.id));

// ── Compression helpers ─────────────────────────────────────────────────────

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data as Uint8Array<ArrayBuffer>);
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
  writer.write(data as Uint8Array<ArrayBuffer>);
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
  stats: LoadoutProperties,
  defaults: LoadoutProperties,
): Record<string, number> | undefined {
  const delta: Record<string, number> = {};
  // Operator properties
  const opKeys: (keyof LoadoutProperties['operator'])[] = [
    'level', 'potential', 'talentOneLevel', 'talentTwoLevel', 'attributeIncreaseLevel',
  ];
  for (const key of opKeys) {
    if (stats.operator[key] !== defaults.operator[key]) delta[`operator.${key}`] = stats.operator[key];
  }
  // Skill properties
  const skillKeys: (keyof LoadoutProperties['skills'])[] = [
    'basicAttackLevel', 'battleSkillLevel', 'comboSkillLevel', 'ultimateLevel',
  ];
  for (const key of skillKeys) {
    if (stats.skills[key] !== defaults.skills[key]) delta[`skills.${key}`] = stats.skills[key];
  }
  // Weapon properties
  const weaponKeys: (keyof LoadoutProperties['weapon'])[] = [
    'level', 'skill1Level', 'skill2Level', 'skill3Level',
  ];
  for (const key of weaponKeys) {
    if (stats.weapon[key] !== defaults.weapon[key]) delta[`weapon.${key}`] = stats.weapon[key];
  }
  // Gear ranks
  for (const key of ['armorRanks', 'glovesRanks', 'kit1Ranks', 'kit2Ranks'] as const) {
    const ranks = stats.gear[key];
    const defRanks = defaults.gear[key];
    if (ranks && Object.keys(ranks).length > 0) {
      for (const [stat, rank] of Object.entries(ranks)) {
        if (rank !== (defRanks?.[stat] ?? 4)) {
          delta[`gear.${key}.${stat}`] = rank;
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
  defaults: LoadoutProperties,
  delta: Record<string, number>,
): LoadoutProperties {
  const result: LoadoutProperties = {
    ...defaults,
    operator: { ...defaults.operator },
    skills: { ...defaults.skills },
    weapon: { ...defaults.weapon },
    gear: {
      armorRanks: { ...defaults.gear.armorRanks },
      glovesRanks: { ...defaults.gear.glovesRanks },
      kit1Ranks: { ...defaults.gear.kit1Ranks },
      kit2Ranks: { ...defaults.gear.kit2Ranks },
    },
  };
  const opKeys = new Set(['level', 'potential', 'talentOneLevel', 'talentTwoLevel', 'attributeIncreaseLevel']);
  const skillKeys = new Set(['basicAttackLevel', 'battleSkillLevel', 'comboSkillLevel', 'ultimateLevel']);
  const weaponKeys = new Set(['level', 'skill1Level', 'skill2Level', 'skill3Level']);
  const gearRankKeys = ['armorRanks', 'glovesRanks', 'kit1Ranks', 'kit2Ranks'] as const;

  for (const [key, val] of Object.entries(delta)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    if (key === 'tacticalMaxUses') {
      result.tacticalMaxUses = sanitizeNum(val, 0, 100, 0);
      continue;
    }
    // Nested paths: operator.*, skills.*, weapon.*, gear.*
    if (key.startsWith('operator.')) {
      const prop = key.slice('operator.'.length);
      if (opKeys.has(prop)) {
        (result.operator as unknown as Record<string, number>)[prop] = sanitizeNum(val, 0, 90, (defaults.operator as unknown as Record<string, number>)[prop]);
      }
    } else if (key.startsWith('skills.')) {
      const prop = key.slice('skills.'.length);
      if (skillKeys.has(prop)) {
        (result.skills as unknown as Record<string, number>)[prop] = sanitizeNum(val, 0, 90, (defaults.skills as unknown as Record<string, number>)[prop]);
      }
    } else if (key.startsWith('weapon.')) {
      const prop = key.slice('weapon.'.length);
      if (weaponKeys.has(prop)) {
        (result.weapon as unknown as Record<string, number>)[prop] = sanitizeNum(val, 0, 90, (defaults.weapon as unknown as Record<string, number>)[prop]);
      }
    } else if (key.startsWith('gear.')) {
      const rest = key.slice('gear.'.length);
      const rankMatch = gearRankKeys.find(rk => rest.startsWith(`${rk}.`));
      if (rankMatch) {
        const stat = rest.slice(rankMatch.length + 1);
        if (sanitizeStr(stat, 50)) {
          result.gear[rankMatch] = { ...result.gear[rankMatch], [stat]: sanitizeNum(val, 1, 4, 4) };
        }
      }
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
    if (typeof val === 'number' && val !== (defaults as Record<string, number>)[key]) {
      delta[key] = val;
    }
  }
  return Object.keys(delta).length > 0 ? delta : undefined;
}

// ── Event template lookup ───────────────────────────────────────────────────

interface EventDefaults {
  segments?: EventSegmentData[];
}

function findEventTemplate(columns: Column[], columnId: string, skillName: string): EventDefaults | null {
  for (const col of columns) {
    if (col.type !== ColumnType.MINI_TIMELINE) continue;
    if (col.defaultEvent?.id === skillName) {
      return { segments: col.defaultEvent.segments };
    }
    if (col.eventVariants) {
      for (const v of col.eventVariants) {
        if (v.id === skillName) {
          return { segments: v.segments };
        }
      }
    }
    if (col.columnId === columnId && col.defaultEvent) {
      return { segments: col.defaultEvent.segments };
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
    const stats = cleaned.loadoutProperties[slotId];
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
      slotDelta.st = diffStats(stats, DEFAULT_LOADOUT_PROPERTIES);
    }

    if (slotDelta.eq || slotDelta.st) {
      slots[i] = slotDelta;
    }
  }
  if (Object.keys(slots).length > 0) embed.slots = slots;

  // Resource configs (SP start value, ult gauge overrides)
  if (cleaned.resourceConfigs && Object.keys(cleaned.resourceConfigs).length > 0) {
    const rc: Record<string, { s: number; m: number; r: number }> = {};
    for (const [key, cfg] of Object.entries(cleaned.resourceConfigs)) {
      rc[key] = { s: cfg.startValue, m: cfg.max, r: cfg.regenPerSecond };
    }
    embed.rc = rc;
  }

  // Events — delta against templates
  // Use original events (before cleanSheetData strips segments) for segment delta computation
  for (let ei = 0; ei < cleaned.events.length; ei++) {
    const ev = cleaned.events[ei];
    const origEv = sheetData.events[ei];
    const slotIdx = ev.ownerId === COMMON_OWNER_ID ? COMMON_OWNER_IDX
      : ev.ownerId === ENEMY_OWNER_ID ? ENEMY_OWNER_IDX
      : SLOT_IDS.indexOf(ev.ownerId);
    const template = findEventTemplate(columns, ev.columnId, ev.name);

    const compact: EventCompact = {
      o: slotIdx >= 0 ? slotIdx : 0,
      s: ev.name,
      c: ev.columnId,
      f: ev.startFrame,
    };

    const evDuration = eventDuration(ev);
    const templateDuration = template?.segments ? computeSegmentsSpan(template.segments) : 0;
    if (template) {
      if (evDuration !== templateDuration) compact.ad = evDuration;
    } else {
      compact.ad = evDuration;
    }

    if (ev.enemiesHit != null) compact.eh = ev.enemiesHit;
    if (ev.stacks != null) compact.sl = ev.stacks;
    if (ev.isPerfectDodge) compact.pd = true;
    if (ev.isForced) compact.fc = true;
    if (ev.timeInteraction) compact.ti = ev.timeInteraction;

    // Encode ANIMATION segment duration so it survives round-trip even without column templates
    const animSeg = origEv?.segments.find(s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION));
    if (animSeg?.properties.duration) compact.an = animSeg.properties.duration;

    if (origEv?.segmentOrigin) compact.so = origEv.segmentOrigin;

    embed.evs.push(compact);
  }

  // Encode override store — map composite keys to event indices
  if (cleaned.overrides && Object.keys(cleaned.overrides).length > 0) {
    // Build key → event index lookup from the encoded events
    const keyToIdx = new Map<string, number>();
    for (let ei = 0; ei < cleaned.events.length; ei++) {
      const ev = cleaned.events[ei];
      keyToIdx.set(buildOverrideKey(ev), ei);
    }
    const ov: OverrideCompact[] = [];
    for (const [key, entry] of Object.entries(cleaned.overrides)) {
      const evIdx = keyToIdx.get(key);
      if (evIdx === undefined) continue; // override for a non-existent event — skip
      const oc: OverrideCompact = { i: evIdx };

      if (entry.segments) {
        const sd: number[][] = [];
        const fo: number[][] = [];
        const cr: number[][] = [];
        for (const [segIdxStr, seg] of Object.entries(entry.segments)) {
          const segIdx = Number(segIdxStr);
          if (seg.deleted) {
            if (!oc.ds) oc.ds = [];
            oc.ds.push(segIdx);
          }
          if (seg.duration !== undefined) sd.push([segIdx, seg.duration]);
          if (seg.frames) {
            for (const [frameIdxStr, frame] of Object.entries(seg.frames)) {
              const frameIdx = Number(frameIdxStr);
              if (frame.offsetFrame !== undefined) fo.push([segIdx, frameIdx, frame.offsetFrame]);
              if (frame.isCritical !== undefined) cr.push([segIdx, frameIdx, frame.isCritical ? 1 : 0]);
            }
          }
        }
        if (sd.length > 0) oc.sd = sd;
        if (fo.length > 0) oc.fo = fo;
        if (cr.length > 0) oc.cr = cr;
      }

      if (entry.deletedFrames && entry.deletedFrames.length > 0) oc.df = entry.deletedFrames;
      if (entry.additionalSegments && entry.additionalSegments.length > 0) {
        oc.as = entry.additionalSegments.map((s) => [s.insertAfter, s.duration]);
      }
      if (entry.additionalFrames && entry.additionalFrames.length > 0) {
        oc.af = entry.additionalFrames.map((f) => [f.segmentIndex, f.offsetFrame]);
      }
      if (entry.chanceOverrides && entry.chanceOverrides.length > 0) {
        oc.ch = entry.chanceOverrides.map((c) => [fnv1aHash(c.clausePath), c.outcome ? 1 : 0]);
      }
      if (entry.propertyOverrides && Object.keys(entry.propertyOverrides).length > 0) {
        oc.po = entry.propertyOverrides;
      }

      // Only emit if there's actual override data
      const hasData = oc.sd || oc.fo || oc.cr || oc.ds || oc.df || oc.as || oc.af || oc.ch || oc.po;
      if (hasData) ov.push(oc);
    }
    if (ov.length > 0) embed.ov = ov;
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

  // Resource configs
  let rc: Record<string, { s: number; m: number; r: number }> | undefined;
  if (raw.rc && typeof raw.rc === 'object' && !Array.isArray(raw.rc)) {
    const cleaned: Record<string, { s: number; m: number; r: number }> = {};
    for (const [key, val] of Object.entries(raw.rc)) {
      const k = sanitizeStr(key, 100);
      if (!k || val == null || typeof val !== 'object') continue;
      const v = val as Record<string, unknown>;
      if (typeof v.s === 'number' && typeof v.m === 'number' && typeof v.r === 'number') {
        cleaned[k] = {
          s: sanitizeNum(v.s, 0, 100000, 0),
          m: sanitizeNum(v.m, 0, 100000, 0),
          r: sanitizeNum(v.r, 0, 1000, 0),
        };
      }
    }
    if (Object.keys(cleaned).length > 0) rc = cleaned;
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

    // Segment origin indices
    if (Array.isArray(evRaw.so)) {
      const so: number[] = [];
      for (const v of evRaw.so.slice(0, 20)) {
        if (typeof v === 'number' && Number.isFinite(v)) so.push(sanitizeNum(v, 0, 19, 0));
      }
      if (so.length > 0) compact.so = so;
    }

    evs.push(compact);
  }

  // Override store entries
  let ov: OverrideCompact[] | undefined;
  if (Array.isArray(raw.ov)) {
    ov = [];
    for (const ovRaw of raw.ov.slice(0, MAX_EVENTS)) {
      if (ovRaw == null || typeof ovRaw !== 'object') continue;
      if (typeof ovRaw.i !== 'number' || !Number.isFinite(ovRaw.i)) continue;
      const i = sanitizeNum(ovRaw.i, 0, MAX_EVENTS - 1, 0);
      const oc: OverrideCompact = { i };
      if (Array.isArray(ovRaw.sd)) {
        oc.sd = ovRaw.sd.slice(0, 20).filter((p: unknown) =>
          Array.isArray(p) && p.length === 2 && p.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
        ).map((p: number[]) => [sanitizeNum(p[0], 0, 19, 0), sanitizeNum(p[1], 0, MAX_FRAME, 0)]);
      }
      if (Array.isArray(ovRaw.fo)) {
        oc.fo = ovRaw.fo.slice(0, 100).filter((t: unknown) =>
          Array.isArray(t) && t.length === 3 && t.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
        ).map((t: number[]) => [sanitizeNum(t[0], 0, 19, 0), sanitizeNum(t[1], 0, 99, 0), sanitizeNum(t[2], 0, MAX_FRAME, 0)]);
      }
      if (Array.isArray(ovRaw.cr)) {
        oc.cr = ovRaw.cr.slice(0, 500).filter((t: unknown) =>
          Array.isArray(t) && t.length === 3 && t.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
        ).map((t: number[]) => [sanitizeNum(t[0], 0, 19, 0), sanitizeNum(t[1], 0, 99, 0), t[2] ? 1 : 0]);
      }
      if (Array.isArray(ovRaw.ch)) {
        oc.ch = ovRaw.ch.slice(0, 50).filter((p: unknown) =>
          Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number',
        );
      }
      if (Array.isArray(ovRaw.ds)) {
        oc.ds = ovRaw.ds.slice(0, 20).filter((v: unknown) => typeof v === 'number' && Number.isFinite(v))
          .map((v: number) => sanitizeNum(v, 0, 19, 0));
      }
      if (Array.isArray(ovRaw.df)) {
        oc.df = ovRaw.df.slice(0, 100).filter((p: unknown) =>
          Array.isArray(p) && p.length === 2 && p.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
        ).map((p: number[]) => [sanitizeNum(p[0], 0, 19, 0), sanitizeNum(p[1], 0, 99, 0)]);
      }
      if (Array.isArray(ovRaw.as)) {
        oc.as = ovRaw.as.slice(0, 20).filter((p: unknown) =>
          Array.isArray(p) && p.length === 2 && p.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
        ).map((p: number[]) => [sanitizeNum(p[0], -1, 19, -1), sanitizeNum(p[1], 0, MAX_FRAME, 0)]);
      }
      if (Array.isArray(ovRaw.af)) {
        oc.af = ovRaw.af.slice(0, 100).filter((p: unknown) =>
          Array.isArray(p) && p.length === 2 && p.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
        ).map((p: number[]) => [sanitizeNum(p[0], 0, 19, 0), sanitizeNum(p[1], 0, MAX_FRAME, 0)]);
      }
      if (ovRaw.po != null && typeof ovRaw.po === 'object' && !Array.isArray(ovRaw.po)) {
        oc.po = ovRaw.po as Record<string, unknown>;
      }
      ov.push(oc);
    }
    if (ov.length === 0) ov = undefined;
  }

  return { v, ops, en, enD, slots, evs, rc, ov };
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
        (enemyStats as Record<string, number>)[key] = val;
      }
    }
  }

  // Reconstruct loadouts and properties
  const loadouts: Record<string, OperatorLoadoutState> = {};
  const loadoutProperties: Record<string, LoadoutProperties> = {};

  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slotId = SLOT_IDS[i];
    const opId = embed.ops[i];
    if (!opId) {
      loadouts[slotId] = { ...EMPTY_LOADOUT };
      loadoutProperties[slotId] = { ...DEFAULT_LOADOUT_PROPERTIES, operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator }, skills: { ...DEFAULT_LOADOUT_PROPERTIES.skills }, weapon: { ...DEFAULT_LOADOUT_PROPERTIES.weapon }, gear: { ...DEFAULT_LOADOUT_PROPERTIES.gear } };
      continue;
    }

    const delta = embed.slots?.[i];

    // Equipment
    const loadout: OperatorLoadoutState = { ...EMPTY_LOADOUT };
    if (delta?.eq) {
      for (const [shortKey, longKey] of EQUIP_KEYS) {
        const val = delta.eq[shortKey];
        if (typeof val === 'string' && val.length > 0) {
          (loadout as unknown as Record<string, string | null>)[longKey] = val;
        }
      }
    }
    loadouts[slotId] = loadout;

    // Properties
    loadoutProperties[slotId] = delta?.st
      ? applyStatDeltas(DEFAULT_LOADOUT_PROPERTIES, delta.st)
      : { ...DEFAULT_LOADOUT_PROPERTIES, operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator }, skills: { ...DEFAULT_LOADOUT_PROPERTIES.skills }, weapon: { ...DEFAULT_LOADOUT_PROPERTIES.weapon }, gear: { ...DEFAULT_LOADOUT_PROPERTIES.gear } };
  }

  // Reconstruct events
  const events: TimelineEvent[] = [];
  for (let i = 0; i < embed.evs.length; i++) {
    const compact = embed.evs[i];
    const ownerId = compact.o === COMMON_OWNER_IDX ? COMMON_OWNER_ID
      : compact.o === ENEMY_OWNER_IDX ? ENEMY_OWNER_ID
      : SLOT_IDS[compact.o] ?? SLOT_IDS[0];
    const template = findEventTemplate(columns, compact.c, compact.s);

    const templateDuration = template?.segments ? computeSegmentsSpan(template.segments) : 0;
    const totalDuration = compact.ad ?? templateDuration;
    const ev: TimelineEvent = {
      uid: `ev-${i + 1}`,
      id: compact.s,
      name: compact.s,
      ownerId,
      columnId: compact.c,
      startFrame: compact.f,
      segments: durationSegment(totalDuration),
    };

    // Legacy: convert compact.an (animationDuration) into an ANIMATION segment
    if (compact.an != null) {
      const segs = ev.segments;
      const hasAnim = segs.some(s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION));
      if (!hasAnim) {
        ev.segments = [{ properties: { segmentTypes: [SegmentType.ANIMATION], duration: compact.an, name: 'Animation' } }, ...segs];
      }
    }

    if (compact.eh != null) ev.enemiesHit = compact.eh;
    if (compact.sl != null) ev.stacks = compact.sl;
    if (compact.pd) ev.isPerfectDodge = true;
    if (compact.fc) ev.isForced = true;
    if (compact.ti) ev.timeInteraction = compact.ti;

    if (compact.so) ev.segmentOrigin = compact.so;

    events.push(ev);
  }

  // Build visible skills (all visible for shared URLs)
  const visibleSkills: Record<string, Record<string, boolean>> = {};
  for (const slotId of SLOT_IDS) {
    visibleSkills[slotId] = {
      [NounType.BASIC_ATTACK]: true,
      [NounType.BATTLE_SKILL]: true,
      [NounType.COMBO_SKILL]: true,
      [NounType.ULTIMATE]: true,
    };
  }

  // Reconstruct resource configs (migrate legacy lowercase '-ultimate' keys)
  const resourceConfigs: Record<string, import('../consts/viewTypes').ResourceConfig> = {};
  if (embed.rc) {
    for (const [key, val] of Object.entries(embed.rc)) {
      const migratedKey = key.replace(/-ultimate$/, `-${NounType.ULTIMATE}`);
      resourceConfigs[migratedKey] = { startValue: val.s, max: val.m, regenPerSecond: val.r };
    }
  }

  // Reconstruct override store from compact entries
  const overrides: OverrideStore = {};
  if (embed.ov) {
    for (const oc of embed.ov) {
      const entry: EventOverride = {};

      // Segment duration and frame overrides
      if (oc.sd || oc.fo || oc.cr || oc.ds) {
        const segments: Record<number, import('../consts/overrideTypes').SegmentOverride> = {};
        if (oc.sd) {
          for (const [segIdx, duration] of oc.sd) {
            segments[segIdx] = { ...segments[segIdx], duration };
          }
        }
        if (oc.fo) {
          for (const [segIdx, frameIdx, offsetFrame] of oc.fo) {
            const seg = segments[segIdx] ?? {};
            const frames = { ...seg.frames, [frameIdx]: { ...seg.frames?.[frameIdx], offsetFrame } };
            segments[segIdx] = { ...seg, frames };
          }
        }
        if (oc.cr) {
          for (const [segIdx, frameIdx, crit] of oc.cr) {
            const seg = segments[segIdx] ?? {};
            const frames = { ...seg.frames, [frameIdx]: { ...seg.frames?.[frameIdx], isCritical: crit === 1 } };
            segments[segIdx] = { ...seg, frames };
          }
        }
        if (oc.ds) {
          for (const segIdx of oc.ds) {
            segments[segIdx] = { ...segments[segIdx], deleted: true };
          }
        }
        if (Object.keys(segments).length > 0) entry.segments = segments;
      }

      if (oc.df && oc.df.length > 0) entry.deletedFrames = oc.df as [number, number][];
      if (oc.as && oc.as.length > 0) {
        entry.additionalSegments = oc.as.map(([insertAfter, duration]) => ({ insertAfter, duration }));
      }
      if (oc.af && oc.af.length > 0) {
        entry.additionalFrames = oc.af.map(([segmentIndex, offsetFrame]) => ({ segmentIndex, offsetFrame }));
      }
      // Note: chance overrides use hashed clause paths — stored as-is for round-trip
      if (oc.ch && oc.ch.length > 0) {
        entry.chanceOverrides = oc.ch.map(([hash, outcome]) => ({ clausePath: String(hash), outcome: outcome === 1 }));
      }
      if (oc.po) entry.propertyOverrides = oc.po;

      // Resolve event index to composite key
      const ev = events[oc.i];
      if (ev) overrides[buildOverrideKey(ev)] = entry;
    }
  }

  return {
    version: 2,
    operatorIds: embed.ops,
    enemyId: embed.en,
    enemyStats,
    events,
    loadouts,
    loadoutProperties,
    visibleSkills,
    nextEventId: events.length + 1,
    ...(Object.keys(resourceConfigs).length > 0 ? { resourceConfigs } : {}),
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}

// ── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Check whether this sheet references any custom (user-created) operators or skills.
 * Returns a warning string if custom content is detected, null otherwise.
 */
export function detectCustomContent(sheetData: SheetData): string | null {
  const customOpNames: string[] = [];
  const customSlotIds = new Set<string>();

  for (let i = 0; i < sheetData.operatorIds.length; i++) {
    const opId = sheetData.operatorIds[i];
    if (opId && opId.startsWith('custom_')) {
      const entry = ALL_OPERATORS.find((o) => o.id === opId);
      customOpNames.push(entry?.name ?? opId);
      customSlotIds.add(SLOT_IDS[i]);
    }
  }

  if (customOpNames.length === 0) return null;

  const opList = customOpNames.join(', ');
  return `This loadout uses custom operators (${opList}) that only exist in your browser. `
    + 'Recipients without the same custom content will see empty slots. '
    + 'Use File Export instead to share custom content.';
}

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
