/**
 * WeaponsController — loads and deserializes weapon JSON configs
 * into typed Weapon class instances.
 *
 * Auto-discovers weapons/weapon-pieces/*.json via require.context.
 */
import type { ClausePredicate } from './weaponStatusesController';

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_VALUE_NODE_KEYS = new Set(['verb', 'value', 'object', 'objectId', 'operator', 'left', 'right', 'ofDeterminer', 'of']);
const VALID_EFFECT_KEYS = new Set(['verb', 'object', 'toDeterminer', 'to', 'with']);
const VALID_EFFECT_WITH_KEYS = new Set(['value']);
const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);
const VALID_PROPERTIES_KEYS = new Set(['id', 'name', 'type', 'rarity']);
const VALID_METADATA_KEYS = new Set(['originId', 'dataSources', 'icon', 'nameId']);
const VALID_TOP_KEYS = new Set(['skills', 'properties', 'metadata', 'clause']);

function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

function validateValueNode(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_VALUE_NODE_KEYS, path);
  if ('verb' in wv && typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if ('operator' in wv && typeof wv.operator !== 'string') errors.push(`${path}.operator: must be a string`);
  return errors;
}

function validateEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    if (w.value) errors.push(...validateValueNode(w.value as Record<string, unknown>, `${path}.with.value`));
  }
  return errors;
}

/** Validate a raw weapon JSON entry. Returns an array of error messages (empty = valid). */
export function validateWeapon(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');

  if (!Array.isArray(json.skills)) errors.push('root.skills: must be an array');
  else if (json.skills.some(s => typeof s !== 'string')) errors.push('root.skills: all entries must be strings');

  if (json.clause) {
    if (!Array.isArray(json.clause)) errors.push('root.clause: must be an array');
    else (json.clause as Record<string, unknown>[]).forEach((c, i) => {
      const clauseErrors = checkKeys(c, VALID_CLAUSE_KEYS, `clause[${i}]`);
      errors.push(...clauseErrors);
      if (Array.isArray(c.effects)) {
        (c.effects as Record<string, unknown>[]).forEach((ef, j) => errors.push(...validateEffect(ef, `clause[${i}].effects[${j}]`)));
      }
    });
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  if (typeof props.id !== 'string') errors.push('properties.id: must be a string');
  if (typeof props.name !== 'string') errors.push('properties.name: must be a string');
  if (typeof props.type !== 'string') errors.push('properties.type: must be a string');
  if (typeof props.rarity !== 'number') errors.push('properties.rarity: must be a number');

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));
  }

  return errors;
}

// ── Weapon class ────────────────────────────────────────────────────────────

/** A weapon definition. Maps 1:1 to the JSON shape. */
export class Weapon {
  readonly skills: string[];
  readonly clause: ClausePredicate[];
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly rarity: number;
  readonly dataSources: string[];
  readonly originId: string;
  /** Resolved icon URL (set by loader after construction). */
  icon?: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.skills = (json.skills ?? []) as string[];
    this.clause = (json.clause ?? []) as ClausePredicate[];
    this.id = (props.id ?? '') as string;
    this.name = (props.name ?? '') as string;
    this.type = (props.type ?? '') as string;
    this.rarity = (props.rarity ?? 0) as number;
    this.dataSources = (meta.dataSources ?? []) as string[];
    this.originId = (meta.originId ?? '') as string;
  }

  /** Get base attack values (from clause APPLY BASE_ATTACK). */
  get baseAttackValues(): number[] {
    for (const clause of this.clause) {
      for (const ef of clause.effects) {
        if (ef.verb === 'APPLY' && ef.object === 'BASE_ATTACK') {
          const wv = (ef.with as Record<string, unknown>)?.value as { value?: number | number[] } | undefined;
          const v = wv?.value;
          return v == null ? [] : Array.isArray(v) ? v : [v];
        }
      }
    }
    return [];
  }

  /** Get base attack at a specific weapon level (1-indexed). */
  getBaseAttack(level: number): number {
    return this.baseAttackValues[level - 1] ?? 0;
  }

  /** Get the generic skill IDs (slots 1 and 2). */
  get genericSkillIds(): string[] {
    return this.skills.slice(0, 2);
  }

  /** Get the named skill ID (slot 3), if present. */
  get namedSkillId(): string | undefined {
    return this.skills[2];
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      skills: this.skills,
      properties: {
        id: this.id,
        name: this.name,
        type: this.type,
        rarity: this.rarity,
      },
      metadata: {
        ...(this.dataSources.length > 0 ? { dataSources: this.dataSources } : {}),
        originId: this.originId,
      },
      clause: this.clause,
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): Weapon {
    const errors = validateWeapon(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[Weapon] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new Weapon(json);
  }
}

// ── Icon auto-discovery ─────────────────────────────────────────────────────

const weaponIconContext = require.context('../../assets/weapons', false, /\.(png|webp)$/);
const WEAPON_ICONS: Record<string, string> = {};
for (const key of weaponIconContext.keys()) {
  const match = key.match(/\.\/(.+)\.(png|webp)$/);
  if (match) {
    const assetName = match[1].replace(/_icon$/, '');
    WEAPON_ICONS[assetName] = weaponIconContext(key);
  }
}

function resolveWeaponIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_').toLowerCase();
  if (WEAPON_ICONS[key]) return WEAPON_ICONS[key];
  const encoded = key.replace(/'/g, '%27');
  if (WEAPON_ICONS[encoded]) return WEAPON_ICONS[encoded];
  return undefined;
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All weapons indexed by ID (e.g. "FORGEBORN_SCATHE"). */
const weaponCache = new Map<string, Weapon>();
/** Name → ID index for legacy name-based lookups. */
const weaponNameIndex = new Map<string, string>();
/** Custom weapon overlay (takes priority over built-in). */
const customWeaponCache = new Map<string, Weapon>();

const weaponContext = require.context('./weapons/weapon-pieces', false, /\.json$/);
for (const key of weaponContext.keys()) {
  const json = weaponContext(key) as Record<string, unknown>;
  const weapon = Weapon.deserialize(json, key);
  if (weapon.id) {
    weapon.icon = resolveWeaponIcon(weapon.name);
    weaponCache.set(weapon.id, weapon);
    weaponNameIndex.set(weapon.name, weapon.id);
  }
}

/** Get a weapon by ID (e.g. "FORGEBORN_SCATHE"). Checks custom first, then built-in. */
export function getWeapon(weaponId: string): Weapon | undefined {
  return customWeaponCache.get(weaponId) ?? weaponCache.get(weaponId);
}

/** Get a weapon ID by display name. Returns undefined if not found. */
export function getWeaponIdByName(name: string): string | undefined {
  // Check custom first
  let customMatch: string | undefined;
  customWeaponCache.forEach((w, id) => { if (w.name === name) customMatch = id; });
  if (customMatch) return customMatch;
  return weaponNameIndex.get(name);
}

/** Get all weapon IDs (custom + built-in, custom overrides built-in). */
export function getAllWeaponIds(): string[] {
  const ids = new Set(customWeaponCache.keys());
  weaponCache.forEach((_, id) => ids.add(id));
  return Array.from(ids);
}

/** Get all weapons (custom + built-in). */
export function getAllWeapons(): readonly Weapon[] {
  const merged = new Map<string, Weapon>();
  weaponCache.forEach((w, id) => merged.set(id, w));
  customWeaponCache.forEach((w, id) => merged.set(id, w));
  const result: Weapon[] = [];
  merged.forEach(w => result.push(w));
  return result;
}

/** Get all weapons filtered by weapon type. */
export function getWeaponsByType(weaponType: string): readonly Weapon[] {
  return getAllWeapons().filter(w => w.type === weaponType);
}

// ── Custom registration ─────────────────────────────────────────────────────

/** Register a custom weapon (overlay — takes priority over built-in). */
export function registerCustomWeapon(json: Record<string, unknown>, icon?: string): Weapon {
  const weapon = Weapon.deserialize(json, 'custom');
  weapon.icon = icon ?? resolveWeaponIcon(weapon.name);
  customWeaponCache.set(weapon.id, weapon);
  weaponNameIndex.set(weapon.name, weapon.id);
  return weapon;
}

/** Deregister a custom weapon by ID. */
export function deregisterCustomWeapon(weaponId: string): void {
  const weapon = customWeaponCache.get(weaponId);
  if (weapon) {
    customWeaponCache.delete(weaponId);
    // Only remove name index if it pointed to the custom entry
    if (weaponNameIndex.get(weapon.name) === weaponId) {
      weaponNameIndex.delete(weapon.name);
      // Re-index built-in if one exists with that name
      weaponCache.forEach((w, id) => { if (w.name === weapon.name) weaponNameIndex.set(w.name, id); });
    }
  }
}
