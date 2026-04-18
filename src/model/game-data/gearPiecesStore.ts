/**
 * GearPiecesController — loads and deserializes gear piece JSON configs
 * into typed GearPiece class instances.
 *
 * Auto-discovers gears/gear-pieces/*.json via require.context.
 * Each file is an array of gear pieces belonging to a single gear set.
 */
import { VerbType, type ValueNode } from '../../dsl/semantics';
import { StatType } from '../enums/stats';
import { resolveEffectStat } from '../enums/stats';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../../controller/calculation/valueResolver';
import { checkKeys, checkIdAndName, VALID_VALUE_NODE_KEYS, VALID_CLAUSE_KEYS, VALID_EFFECT_KEYS, VALID_EFFECT_WITH_KEYS, validateEffect as validateEffectSemantics, validateNonNegativeValues } from './validationUtils';

// ── Validation ──────────────────────────────────────────────────────────────
const VALID_PROPERTIES_KEYS = new Set(['id', 'name', 'gearType', 'gearSet']);
const VALID_TOP_KEYS = new Set(['clause', 'properties', 'metadata']);

function validateValueNode(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_VALUE_NODE_KEYS, path);
  if ('verb' in wv && typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if ('operator' in wv && typeof wv.operator !== 'string') errors.push(`${path}.operator: must be a string`);
  return errors;
}

function validateLocalEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  errors.push(...validateEffectSemantics(ef, path));
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    if (w.value) errors.push(...validateValueNode(w.value as Record<string, unknown>, `${path}.with.value`));
  }
  return errors;
}

/** Validate a raw gear piece JSON entry. Returns an array of error messages (empty = valid). */
export function validateGearPiece(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

  if (json.clause) {
    if (!Array.isArray(json.clause)) errors.push('root.clause: must be an array');
    else (json.clause as Record<string, unknown>[]).forEach((c, i) => {
      const clauseErrors = checkKeys(c, VALID_CLAUSE_KEYS, `clause[${i}]`);
      errors.push(...clauseErrors);
      if (Array.isArray(c.effects)) {
        (c.effects as Record<string, unknown>[]).forEach((ef, j) => errors.push(...validateLocalEffect(ef, `clause[${i}].effects[${j}]`)));
      }
    });
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  errors.push(...checkIdAndName(props, 'properties'));
  if (typeof props.gearType !== 'string') errors.push('properties.gearType: must be a string');
  if (typeof props.gearSet !== 'string') errors.push('properties.gearSet: must be a string');

  return errors;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface ClauseEffect {
  verb: string;
  object: string;
  toDeterminer?: string;
  to?: string;
  with?: { value: ValueNode };
}

interface ClausePredicate {
  conditions: unknown[];
  effects: ClauseEffect[];
}

// ── GearPiece class ─────────────────────────────────────────────────────────

/** A gear piece definition. Maps 1:1 to the JSON shape. */
export class GearPiece {
  readonly clause: ClausePredicate[];
  readonly id: string;
  readonly name: string;
  readonly gearType: string;
  readonly gearSet: string;
  /** Resolved icon URL (set by loader after construction). */
  icon?: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;

    this.clause = (json.clause ?? []) as ClausePredicate[];
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    this.gearType = (props.gearType ?? '') as string;
    this.gearSet = (props.gearSet ?? '') as string;
  }

  /** Get defense value (from clause APPLY STAT objectId=BASE_DEFENSE with IS verb). */
  get defense(): number {
    for (const pred of this.clause) {
      for (const ef of pred.effects) {
        const statKey = resolveEffectStat(ef);
        if (ef.verb === VerbType.APPLY && statKey === StatType.BASE_DEFENSE) {
          return ef.with?.value ? resolveValueNode(ef.with.value, DEFAULT_VALUE_CONTEXT) : 0;
        }
      }
    }
    return 0;
  }

  /** Get stat values at a specific rank (1-indexed). Returns stat → value map. */
  getStats(rank: number): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const pred of this.clause) {
      for (const ef of pred.effects) {
        const wvNode = ef.with?.value as { value?: number | number[] } | undefined;
        const values = wvNode?.value != null ? (Array.isArray(wvNode.value) ? wvNode.value : [wvNode.value]) : undefined;
        if (!values) continue;
        const statKey = resolveEffectStat(ef) ?? ef.object;
        stats[statKey] = values.length === 1 ? values[0] : (values[rank - 1] ?? 0);
      }
    }
    return stats;
  }

  /** Get all stat types this piece provides. */
  get statKeys(): string[] {
    const keys: string[] = [];
    for (const pred of this.clause) {
      for (const ef of pred.effects) {
        keys.push(resolveEffectStat(ef) ?? ef.object);
      }
    }
    return keys;
  }

  /** Get stats with per-stat-line ranks. Missing keys default to given defaultRank. */
  getStatsPerLine(ranks: Record<string, number>, defaultRank = 4): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const pred of this.clause) {
      for (const ef of pred.effects) {
        const wvNode = ef.with?.value as { value?: number | number[] } | undefined;
        const values = wvNode?.value != null ? (Array.isArray(wvNode.value) ? wvNode.value : [wvNode.value]) : undefined;
        if (!values) continue;
        const statKey = resolveEffectStat(ef) ?? ef.object;
        const lineRank = ranks[statKey] ?? defaultRank;
        stats[statKey] = values.length === 1 ? values[0] : (values[lineRank - 1] ?? 0);
      }
    }
    return stats;
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      clause: this.clause,
      properties: {
        id: this.id,
        name: this.name,
        gearType: this.gearType,
        gearSet: this.gearSet,
      },
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): GearPiece {
    const errors = validateGearPiece(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[GearPiece] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new GearPiece(json);
  }
}

// ── Icon auto-discovery ─────────────────────────────────────────────────────

const gearIconContext = require.context('../../assets/gears', false, /\.(png|webp)$/);
const GEAR_ICONS: Record<string, string> = {};
for (const key of gearIconContext.keys()) {
  const match = key.match(/\.\/(.+)\.(png|webp)$/);
  if (match) {
    GEAR_ICONS[match[1].toLowerCase()] = gearIconContext(key);
  }
}

function resolveGearIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_').toLowerCase();
  if (GEAR_ICONS[key]) return GEAR_ICONS[key];
  return undefined;
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All gear pieces indexed by ID (e.g. "HOT_WORK_EXOSKELETON"). */
const gearPieceCache = new Map<string, GearPiece>();
/** Gear set → piece IDs index. */
const gearSetIndex = new Map<string, string[]>();
/** Name → ID index for legacy name-based lookups. */
const gearNameIndex = new Map<string, string>();
/** Custom gear piece overlay. */
const customGearPieceCache = new Map<string, GearPiece>();

// Load individual piece files from gears/<set>/pieces/
const gearPiecesContext = require.context('./gears', true, /\/pieces\/[^/]+\.json$/);
for (const key of gearPiecesContext.keys()) {
  const raw = gearPiecesContext(key) as Record<string, unknown>;
  const piece = GearPiece.deserialize(raw, key);
  if (piece.id) {
    piece.icon = resolveGearIcon(piece.name);
    gearPieceCache.set(piece.id, piece);
    gearNameIndex.set(piece.name, piece.id);
    const list = gearSetIndex.get(piece.gearSet) ?? [];
    list.push(piece.id);
    gearSetIndex.set(piece.gearSet, list);
  }
}

/** Get a gear piece by ID. Checks custom first, then built-in. */
export function getGearPiece(pieceId: string): GearPiece | undefined {
  return customGearPieceCache.get(pieceId) ?? gearPieceCache.get(pieceId);
}

/** Get a gear piece ID by display name. */
export function getGearPieceIdByName(name: string): string | undefined {
  let customMatch: string | undefined;
  customGearPieceCache.forEach((p, id) => { if (p.name === name) customMatch = id; });
  if (customMatch) return customMatch;
  return gearNameIndex.get(name);
}

/** Get all gear piece IDs (custom + built-in). */
export function getAllGearPieceIds(): string[] {
  const ids = new Set(customGearPieceCache.keys());
  gearPieceCache.forEach((_, id) => ids.add(id));
  return Array.from(ids);
}

/** Get all gear pieces (custom + built-in). */
export function getAllGearPieces(): readonly GearPiece[] {
  const merged = new Map<string, GearPiece>();
  gearPieceCache.forEach((p, id) => merged.set(id, p));
  customGearPieceCache.forEach((p, id) => merged.set(id, p));
  const result: GearPiece[] = [];
  merged.forEach(p => result.push(p));
  return result;
}

/** Get all gear pieces for a specific gear set (e.g. "HOT_WORK"). */
export function getGearPiecesBySet(gearSet: string): readonly GearPiece[] {
  // Include custom pieces for this set
  const pieces: GearPiece[] = [];
  customGearPieceCache.forEach(p => { if (p.gearSet === gearSet) pieces.push(p); });
  const ids = gearSetIndex.get(gearSet) ?? [];
  for (const id of ids) {
    if (!customGearPieceCache.has(id)) {
      const p = gearPieceCache.get(id);
      if (p) pieces.push(p);
    }
  }
  return pieces;
}

/** Get all gear pieces filtered by type (ARMOR, GLOVES, KIT). */
export function getGearPiecesByType(pieceType: string): readonly GearPiece[] {
  return getAllGearPieces().filter(p => p.gearType === pieceType);
}

// ── Custom registration ─────────────────────────────────────────────────────

/** Register a custom gear piece (overlay — takes priority over built-in). */
export function registerCustomGearPiece(json: Record<string, unknown>, icon?: string): GearPiece {
  const piece = GearPiece.deserialize(json, 'custom');
  piece.icon = icon ?? resolveGearIcon(piece.name);
  customGearPieceCache.set(piece.id, piece);
  gearNameIndex.set(piece.name, piece.id);
  return piece;
}

/** Deregister a custom gear piece by ID. */
export function deregisterCustomGearPiece(pieceId: string): void {
  const piece = customGearPieceCache.get(pieceId);
  if (piece) {
    customGearPieceCache.delete(pieceId);
    if (gearNameIndex.get(piece.name) === pieceId) {
      gearNameIndex.delete(piece.name);
      gearPieceCache.forEach((p, id) => { if (p.name === piece.name) gearNameIndex.set(p.name, id); });
    }
  }
}
