/**
 * CausalityGraph — side-car DAG store tracking which events caused which.
 *
 * Bidirectional with typed edges (CREATION / TRANSITION). Each event uid
 * maps to ordered parent edges and child edges. The first CREATION parent
 * (parents filtered by CREATION, [0]) is the "primary" / most-recent
 * triggering event — this is what `DeterminerType.TRIGGER` resolves to.
 *
 * TRANSITION edges replace the old eventStatusEntityId / eventStatusSkillName
 * denormalized fields — they record which source event caused a status
 * transition (consume, refresh, extend, clamp) on a target event.
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

import { EdgeKind } from '../../consts/enums';

export interface CausalEdge {
  uid: string;
  kind: EdgeKind;
}

export class CausalityGraph {
  /** child uid → ordered parent edges (parents[0] = primary/most-recent). */
  private parents = new Map<string, readonly CausalEdge[]>();
  /** parent uid → ordered child edges. */
  private children = new Map<string, readonly CausalEdge[]>();

  /**
   * Record that `childUid` was caused by `parentUids` with the given edge kind.
   * First uid in the array is the primary parent by convention — ingress sites
   * should pass the most-recent triggering event first.
   *
   * No-op if `parentUids` is empty (chain root).
   */
  link(childUid: string, parentUids: readonly string[], kind: EdgeKind): void {
    if (parentUids.length === 0) return;
    const parentEdges = parentUids.map(uid => ({ uid, kind }));
    // Append to existing parent edges (a node can have both CREATION and TRANSITION parents)
    const existing = this.parents.get(childUid);
    this.parents.set(childUid, existing ? [...existing, ...parentEdges] : parentEdges);
    // Bidirectional: add child edges on each parent
    for (const pUid of parentUids) {
      const childEdge: CausalEdge = { uid: childUid, kind };
      const existingChildren = this.children.get(pUid);
      this.children.set(pUid, existingChildren ? [...existingChildren, childEdge] : [childEdge]);
    }
  }

  /**
   * All parent uids for `uid`, optionally filtered by edge kind.
   * Without filter, returns all parents. Empty = chain root.
   */
  parentsOf(uid: string, kind?: EdgeKind): readonly string[] {
    const edges = this.parents.get(uid) ?? [];
    if (kind === undefined) return edges.map(e => e.uid);
    return edges.filter(e => e.kind === kind).map(e => e.uid);
  }

  /**
   * All child uids for `uid`, optionally filtered by edge kind.
   * Without filter, returns all children.
   */
  childrenOf(uid: string, kind?: EdgeKind): readonly string[] {
    const edges = this.children.get(uid) ?? [];
    if (kind === undefined) return edges.map(e => e.uid);
    return edges.filter(e => e.kind === kind).map(e => e.uid);
  }

  /**
   * The "main" parent of `uid` — used by `DeterminerType.TRIGGER`.
   * Returns the first CREATION parent, or null when `uid` is a chain root.
   */
  primaryParentOf(uid: string): string | null {
    const edges = this.parents.get(uid);
    if (!edges) return null;
    for (const e of edges) {
      if (e.kind === EdgeKind.CREATION) return e.uid;
    }
    return null;
  }

  /**
   * Walk primary-parent (CREATION) edges to the chain root. Used by
   * `DeterminerType.SOURCE`. Returns null if `uid` is itself the root
   * (no CREATION parents). Cycle-guarded by a `seen` set.
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
   * Full ancestor set across ALL edge kinds (BFS across the DAG).
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

  /**
   * Full descendant set (BFS down children edges, all kinds). Cycle-safe.
   */
  descendantsOf(uid: string): ReadonlySet<string> {
    const out = new Set<string>();
    const stack: string[] = [...this.childrenOf(uid)];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (out.has(cur)) continue;
      out.add(cur);
      for (const c of this.childrenOf(cur)) stack.push(c);
    }
    return out;
  }

  /**
   * Convenience: returns the uid of the most recent TRANSITION parent.
   * Returns null if none exist.
   */
  lastTransitionSource(uid: string): string | null {
    const edges = this.parents.get(uid);
    if (!edges) return null;
    let last: string | null = null;
    for (const e of edges) {
      if (e.kind === EdgeKind.TRANSITION) last = e.uid;
    }
    return last;
  }

  /** Drop an event from the graph (called when an event is evicted). */
  unlink(uid: string): void {
    this.parents.delete(uid);
    this.children.delete(uid);
  }

  /** Reset for the next pipeline run. Called from DEC.reset(). */
  clear(): void {
    this.parents.clear();
    this.children.clear();
  }

  /** Number of events with parent records. Primarily for tests / invariants. */
  size(): number {
    return this.parents.size;
  }
}
