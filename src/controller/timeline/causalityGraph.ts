/**
 * CausalityGraph — side-car DAG store tracking which events caused which.
 *
 * Each event uid maps to an ordered list of parent uids. The first parent
 * (parents[0]) is the "primary" / most-recent triggering event — this is
 * what `DeterminerType.TRIGGER` resolves to. Additional parents capture
 * multi-source causality (e.g. a reaction whose parents are the incoming
 * infliction AND the active other-element inflictions it consumed).
 *
 * The graph is a side-car (owned by DEC) rather than a field on
 * TimelineEvent for three reasons:
 *   1. Events can be mutated/pooled without dangling refs — the graph
 *      holds uid strings, not object references.
 *   2. Multi-parent (A + B → C) is natively representable; any tree-shaped
 *      per-event representation would require reshaping on every A+B case.
 *   3. Ancestor queries (`ancestorsOf`) become cheap set operations
 *      instead of per-event array copies.
 */

export class CausalityGraph {
  /** child uid → ordered parent uids (parents[0] = primary/most-recent). */
  private parents = new Map<string, readonly string[]>();

  /**
   * Record that `childUid` was caused by `parentUids`. First uid in the
   * array is the primary parent by convention — ingress sites should pass
   * the most-recent triggering event first.
   *
   * No-op if `parentUids` is empty (chain root).
   */
  link(childUid: string, parentUids: readonly string[]): void {
    if (parentUids.length === 0) return;
    this.parents.set(childUid, parentUids);
  }

  /** All parent uids for `uid` in primary-first order. Empty = chain root. */
  parentsOf(uid: string): readonly string[] {
    return this.parents.get(uid) ?? [];
  }

  /**
   * The "main" parent of `uid` — used by `DeterminerType.TRIGGER`.
   * Returns null when `uid` is a chain root.
   */
  primaryParentOf(uid: string): string | null {
    const arr = this.parents.get(uid);
    return arr && arr.length > 0 ? arr[0] : null;
  }

  /**
   * Walk primary-parent edges to the chain root. Used by
   * `DeterminerType.SOURCE`. Returns null if `uid` is itself the root
   * (no parents). Cycle-guarded by a `seen` set — chains are acyclic by
   * construction but the guard is cheap insurance against malformed input.
   */
  rootOf(uid: string): string | null {
    let current: string | null = this.primaryParentOf(uid);
    if (current === null) return null;
    const seen = new Set<string>([uid]);
    let next = this.primaryParentOf(current);
    while (next !== null) {
      if (seen.has(next)) return current; // cycle — stop at last safe node
      seen.add(current);
      current = next;
      next = this.primaryParentOf(current);
    }
    return current;
  }

  /**
   * Full ancestor set across all parent edges (BFS across the DAG).
   * Used for "is X descended from Y" queries. Cycle-safe via the `out` set.
   */
  ancestorsOf(uid: string): ReadonlySet<string> {
    const out = new Set<string>();
    const stack: string[] = [...this.parentsOf(uid)];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (out.has(cur)) continue;
      out.add(cur);
      for (const p of this.parentsOf(cur)) stack.push(p);
    }
    return out;
  }

  /** Drop an event from the graph (called when an event is evicted). */
  unlink(uid: string): void {
    this.parents.delete(uid);
  }

  /** Reset for the next pipeline run. Called from DEC.reset(). */
  clear(): void {
    this.parents.clear();
  }

  /** Number of events with parent records. Primarily for tests / invariants. */
  size(): number {
    return this.parents.size;
  }
}
