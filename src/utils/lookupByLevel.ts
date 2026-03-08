/**
 * Look up a value from a sparse level→T table.
 * If the exact level is absent, returns the value at the next higher level.
 * Throws if no level in the table is ≥ the requested level.
 */
export function lookupByLevel<T>(
  table: Readonly<Record<number, T>>,
  level: number,
): T {
  if (level in table) return table[level];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const next = keys.find((k) => k > level);
  if (next !== undefined) return table[next];
  throw new RangeError(
    `No entry found for level ${level} (max in table: ${keys[keys.length - 1] ?? "none"})`,
  );
}
