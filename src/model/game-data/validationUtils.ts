// ── Shared validation utilities for game-data config loaders ────────────────

/** Report unexpected keys in a config object. */
export function checkKeys(obj: Record<string, unknown>, valid: Set<string>, path: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
  return errors;
}

// ── Shared valid-key sets (value nodes are reused across all config types) ───

export const VALID_VALUE_NODE_KEYS = new Set([
  'verb', 'value', 'object', 'objectId', 'operator', 'left', 'right', 'ofDeterminer', 'of',
]);

export const VALID_CLAUSE_KEYS = new Set(['conditions', 'effects']);

export const VALID_METADATA_KEYS = new Set(['originId', 'dataSources']);
