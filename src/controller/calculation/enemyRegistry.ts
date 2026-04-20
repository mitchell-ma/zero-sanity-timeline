/**
 * Enemy registry — maps view-layer enemy slugs to model enemy instances.
 *
 * Thin adapter around `src/model/game-data/enemiesStore.ts`, which loads the
 * JSON configs and exposes the same API (getModelEnemy / getEnemyLevels).
 * Kept as a separate export surface so callers that imported from this
 * controller path continue to work without touching every call site.
 */
export {
  getModelEnemy,
  getEnemyLevels,
  getAllEnemyIds,
  getEnemyConfigById,
  registerCustomEnemy,
  deregisterCustomEnemy,
  getAllCustomEnemies,
} from '../../model/game-data/enemiesStore';
