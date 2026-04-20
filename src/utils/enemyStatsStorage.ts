/**
 * Per-enemy stat override persistence.
 *
 * When the user edits an enemy's stats in the info pane (HP, DEF, resistances,
 * stagger, level, etc.) those edits are stored as a full EnemyStats snapshot
 * keyed by enemy id. `getDefaultEnemyStats` consults this store before falling
 * back to model-derived defaults, so edits survive sheet reloads and enemy
 * swaps. Resetting the pane clears the override for that enemy.
 */
import type { EnemyStats } from '../controller/appStateController';

const STORAGE_KEY = 'zst-enemy-stat-overrides';

type OverrideMap = Record<string, EnemyStats>;

function loadAll(): OverrideMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as OverrideMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: OverrideMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage quota / private mode — silently skip; overrides remain in-memory
    // for the current session only.
  }
}

/** Get the override for an enemy, or null if none. */
export function getEnemyStatsOverride(enemyId: string): EnemyStats | null {
  return loadAll()[enemyId] ?? null;
}

/** Save an override for an enemy, replacing any prior entry. */
export function saveEnemyStatsOverride(enemyId: string, stats: EnemyStats): void {
  const all = loadAll();
  all[enemyId] = stats;
  saveAll(all);
}

/** Clear the override for an enemy (restores model-derived defaults). */
export function clearEnemyStatsOverride(enemyId: string): void {
  const all = loadAll();
  if (!(enemyId in all)) return;
  delete all[enemyId];
  saveAll(all);
}
