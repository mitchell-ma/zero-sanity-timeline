/**
 * EnemiesStore — loads enemy JSON configs from src/model/game-data/enemies/
 * and instantiates Enemy model instances.
 *
 * Mirrors operatorsStore: each enemy has a directory <slug>/ with a single
 * <slug>.json whose `id` is the SCREAMING_SNAKE form of the slug. Names live
 * in src/locales/game-data/<locale>/enemies/*.json and are resolved via
 * LocaleKey.enemy(id). Custom overlays (user-edited enemy stats persisted
 * in localStorage) take priority over built-in configs.
 */
import { Enemy, EnemyJsonConfig } from '../enemies/enemy';

interface RawEnemyConfig {
  id: unknown;
  tier: unknown;
  race: unknown;
  location: unknown;
  attackElement: unknown;
  baseStats?: unknown;
  statsByLevel: unknown;
  staggerNodes?: unknown;
  staggerNodeRecoverySeconds?: unknown;
}

function validateEnemyConfig(json: unknown, key: string): string[] {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') {
    errors.push(`${key}: enemy config must be an object`);
    return errors;
  }
  const c = json as RawEnemyConfig;
  if (typeof c.id !== 'string') errors.push(`${key}.id: must be a string`);
  if (typeof c.tier !== 'string') errors.push(`${key}.tier: must be a string`);
  if (typeof c.race !== 'string') errors.push(`${key}.race: must be a string`);
  if (typeof c.location !== 'string') errors.push(`${key}.location: must be a string`);
  if (c.attackElement !== null && typeof c.attackElement !== 'string') {
    errors.push(`${key}.attackElement: must be a string or null`);
  }
  if (!Array.isArray(c.statsByLevel)) errors.push(`${key}.statsByLevel: must be an array`);
  if ('name' in (json as Record<string, unknown>)) {
    errors.push(`${key}.name: enemy JSON must not carry "name" — strings live in src/locales/game-data/<locale>/enemies/`);
  }
  return errors;
}

// ── Cache + insertion order ────────────────────────────────────────────────

/** Built-in JSON config cache keyed by id (SCREAMING_SNAKE, e.g. RHODAGN). */
const configCache = new Map<string, EnemyJsonConfig>();
/** Custom user overlay (takes priority over built-in). */
const customConfigCache = new Map<string, EnemyJsonConfig>();
/** Insertion order of built-in ids, used for deterministic listing. */
const builtInOrder: string[] = [];

const enemyContext = require.context('./enemies', true, /\/[^/]+\/[^/]+\.json$/);
for (const key of enemyContext.keys()) {
  const match = key.match(/^\.\/([^/]+)\/[^/]+\.json$/);
  if (!match) continue;
  const json = enemyContext(key) as unknown;
  const errors = validateEnemyConfig(json, key);
  if (errors.length > 0) {
    console.warn(`[EnemiesStore] Validation errors in ${key}:\n  ${errors.join('\n  ')}`);
    continue;
  }
  const config = json as EnemyJsonConfig;
  configCache.set(config.id, config);
  builtInOrder.push(config.id);
}

// ── Public API ──────────────────────────────────────────────────────────────

function resolveConfig(enemyId: string): EnemyJsonConfig | undefined {
  return customConfigCache.get(enemyId) ?? configCache.get(enemyId);
}

/** Get a model enemy instance by enemy id (custom overlay takes priority). */
export function getModelEnemy(enemyId: string, level: number = 90): Enemy | null {
  const config = resolveConfig(enemyId);
  if (!config) return null;
  return new Enemy(config, level);
}

/** Get available level options for an enemy (from its statsByLevel keys). */
export function getEnemyLevels(enemyId: string): number[] {
  const config = resolveConfig(enemyId);
  if (!config) return [90];
  return config.statsByLevel.map((entry) => entry.level).sort((a, b) => a - b);
}

/** List of every enemy id (built-ins + customs), in insertion order. */
export function getAllEnemyIds(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of builtInOrder) {
    if (!seen.has(id)) { out.push(id); seen.add(id); }
  }
  customConfigCache.forEach((_, id) => {
    if (!seen.has(id)) { out.push(id); seen.add(id); }
  });
  return out;
}

/** Lookup raw JSON config by id (for view-layer metadata like tier/race). */
export function getEnemyConfigById(enemyId: string): EnemyJsonConfig | null {
  return resolveConfig(enemyId) ?? null;
}

// ── Custom overlay registration ────────────────────────────────────────────

/** Register a custom enemy overlay (takes priority over built-in). */
export function registerCustomEnemy(config: EnemyJsonConfig): void {
  customConfigCache.set(config.id, config);
}

/** Remove a custom enemy overlay, restoring the built-in if present. */
export function deregisterCustomEnemy(enemyId: string): void {
  customConfigCache.delete(enemyId);
}

/** Snapshot of registered custom overlays (for persistence). */
export function getAllCustomEnemies(): EnemyJsonConfig[] {
  return Array.from(customConfigCache.values());
}
