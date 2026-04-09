/**
 * Unit tests for CausalityGraph — the side-car DAG store that DEC uses
 * to track which events caused which. Pins:
 *   - link/parentsOf/primaryParentOf basic behavior
 *   - rootOf walks primary-parent edges to the chain root
 *   - rootOf is cycle-guarded against malformed input
 *   - ancestorsOf BFS across multi-parent edges
 *   - unlink/clear/size housekeeping
 */

import { CausalityGraph } from '../../controller/timeline/causalityGraph';

describe('CausalityGraph', () => {
  let g: CausalityGraph;
  beforeEach(() => { g = new CausalityGraph(); });

  test('empty graph — root/parent queries return null/empty', () => {
    expect(g.primaryParentOf('a')).toBe(null);
    expect(g.rootOf('a')).toBe(null);
    expect(g.parentsOf('a')).toEqual([]);
    expect(g.ancestorsOf('a')).toEqual(new Set());
    expect(g.size()).toBe(0);
  });

  test('link with empty parents is a no-op', () => {
    g.link('a', []);
    expect(g.size()).toBe(0);
    expect(g.primaryParentOf('a')).toBe(null);
  });

  test('single-parent chain: rootOf walks to the leaf', () => {
    // a <- b <- c <- d
    g.link('b', ['a']);
    g.link('c', ['b']);
    g.link('d', ['c']);
    expect(g.primaryParentOf('d')).toBe('c');
    expect(g.primaryParentOf('a')).toBe(null);
    expect(g.rootOf('d')).toBe('a');
    expect(g.rootOf('c')).toBe('a');
    expect(g.rootOf('b')).toBe('a');
    expect(g.rootOf('a')).toBe(null);
  });

  test('multi-parent: primary is parents[0], ancestorsOf walks all edges', () => {
    // a, b -> c (a is primary)
    g.link('c', ['a', 'b']);
    expect(g.primaryParentOf('c')).toBe('a');
    expect(g.parentsOf('c')).toEqual(['a', 'b']);
    const anc = g.ancestorsOf('c');
    expect(anc.has('a')).toBe(true);
    expect(anc.has('b')).toBe(true);
    expect(anc.size).toBe(2);
  });

  test('ancestorsOf traverses multi-parent DAG transitively', () => {
    // root <- a
    // root2 <- b
    // a, b -> c
    // c <- d
    g.link('a', ['root']);
    g.link('b', ['root2']);
    g.link('c', ['a', 'b']);
    g.link('d', ['c']);
    const anc = g.ancestorsOf('d');
    expect(anc).toEqual(new Set(['c', 'a', 'b', 'root', 'root2']));
  });

  test('rootOf is cycle-guarded (malformed input does not infinite-loop)', () => {
    // a <- b <- a (cycle)
    g.link('b', ['a']);
    g.link('a', ['b']);
    const root = g.rootOf('b');
    // Should terminate and return some node in the cycle, not throw/hang
    expect(root === 'a' || root === 'b').toBe(true);
  });

  test('ancestorsOf is cycle-safe', () => {
    g.link('b', ['a']);
    g.link('a', ['b']);
    const anc = g.ancestorsOf('b');
    expect(anc).toEqual(new Set(['a', 'b']));
  });

  test('unlink removes an entry', () => {
    g.link('b', ['a']);
    g.link('c', ['b']);
    g.unlink('b');
    expect(g.primaryParentOf('b')).toBe(null);
    expect(g.primaryParentOf('c')).toBe('b'); // c's edge is unaffected
    expect(g.size()).toBe(1);
  });

  test('clear empties the graph', () => {
    g.link('b', ['a']);
    g.link('c', ['a', 'b']);
    g.clear();
    expect(g.size()).toBe(0);
    expect(g.parentsOf('c')).toEqual([]);
  });

  test('reaction multi-parent case: incoming + activeOther', () => {
    // Models the deriveReactions.ts scenario: a new incoming infliction
    // finds two active other-element inflictions; the generated reaction
    // has all three as parents, with incoming as primary (most recent).
    g.link('reaction-1', ['incoming-infl', 'active-infl-1', 'active-infl-2']);
    expect(g.primaryParentOf('reaction-1')).toBe('incoming-infl');
    expect(g.ancestorsOf('reaction-1')).toEqual(
      new Set(['incoming-infl', 'active-infl-1', 'active-infl-2']),
    );
  });
});
