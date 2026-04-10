/**
 * Unit tests for CausalityGraph — the side-car DAG store that DEC uses
 * to track which events caused which. Pins:
 *   - link/parentsOf/primaryParentOf basic behavior
 *   - rootOf walks CREATION edges to the chain root
 *   - rootOf is cycle-guarded against malformed input
 *   - ancestorsOf BFS across multi-parent edges (all kinds)
 *   - Typed edges: CREATION vs TRANSITION
 *   - Bidirectional: childrenOf
 *   - descendantsOf BFS down children
 *   - lastTransitionSource convenience method
 *   - Kind-filtered queries
 *   - unlink/clear/size housekeeping
 */

import { CausalityGraph } from '../../controller/timeline/causalityGraph';
import { EdgeKind } from '../../consts/enums';

describe('CausalityGraph', () => {
  let g: CausalityGraph;
  beforeEach(() => { g = new CausalityGraph(); });

  test('empty graph — root/parent queries return null/empty', () => {
    expect(g.primaryParentOf('a')).toBe(null);
    expect(g.rootOf('a')).toBe(null);
    expect(g.parentsOf('a')).toEqual([]);
    expect(g.childrenOf('a')).toEqual([]);
    expect(g.ancestorsOf('a')).toEqual(new Set());
    expect(g.descendantsOf('a')).toEqual(new Set());
    expect(g.lastTransitionSource('a')).toBe(null);
    expect(g.size()).toBe(0);
  });

  test('link with empty parents is a no-op', () => {
    g.link('a', [], EdgeKind.CREATION);
    expect(g.size()).toBe(0);
    expect(g.primaryParentOf('a')).toBe(null);
  });

  test('single-parent chain: rootOf walks CREATION edges to the leaf', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('c', ['b'], EdgeKind.CREATION);
    g.link('d', ['c'], EdgeKind.CREATION);
    expect(g.primaryParentOf('d')).toBe('c');
    expect(g.primaryParentOf('a')).toBe(null);
    expect(g.rootOf('d')).toBe('a');
    expect(g.rootOf('c')).toBe('a');
    expect(g.rootOf('b')).toBe('a');
    expect(g.rootOf('a')).toBe(null);
  });

  test('multi-parent: primary is first CREATION parent, ancestorsOf walks all edges', () => {
    g.link('c', ['a', 'b'], EdgeKind.CREATION);
    expect(g.primaryParentOf('c')).toBe('a');
    expect(g.parentsOf('c')).toEqual(['a', 'b']);
    const anc = g.ancestorsOf('c');
    expect(anc.has('a')).toBe(true);
    expect(anc.has('b')).toBe(true);
    expect(anc.size).toBe(2);
  });

  test('ancestorsOf traverses multi-parent DAG transitively', () => {
    g.link('a', ['root'], EdgeKind.CREATION);
    g.link('b', ['root2'], EdgeKind.CREATION);
    g.link('c', ['a', 'b'], EdgeKind.CREATION);
    g.link('d', ['c'], EdgeKind.CREATION);
    const anc = g.ancestorsOf('d');
    expect(anc).toEqual(new Set(['c', 'a', 'b', 'root', 'root2']));
  });

  test('rootOf is cycle-guarded (malformed input does not infinite-loop)', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('a', ['b'], EdgeKind.CREATION);
    const root = g.rootOf('b');
    expect(root === 'a' || root === 'b').toBe(true);
  });

  test('ancestorsOf is cycle-safe', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('a', ['b'], EdgeKind.CREATION);
    const anc = g.ancestorsOf('b');
    expect(anc).toEqual(new Set(['a', 'b']));
  });

  test('unlink removes an entry from both maps', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('c', ['b'], EdgeKind.CREATION);
    g.unlink('b');
    expect(g.primaryParentOf('b')).toBe(null);
    expect(g.primaryParentOf('c')).toBe('b');
    expect(g.childrenOf('b')).toEqual([]);
    expect(g.size()).toBe(1);
  });

  test('clear empties the graph', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('c', ['a', 'b'], EdgeKind.CREATION);
    g.clear();
    expect(g.size()).toBe(0);
    expect(g.parentsOf('c')).toEqual([]);
    expect(g.childrenOf('a')).toEqual([]);
  });

  test('reaction multi-parent case: incoming + activeOther', () => {
    g.link('reaction-1', ['incoming-infl', 'active-infl-1', 'active-infl-2'], EdgeKind.CREATION);
    expect(g.primaryParentOf('reaction-1')).toBe('incoming-infl');
    expect(g.ancestorsOf('reaction-1')).toEqual(
      new Set(['incoming-infl', 'active-infl-1', 'active-infl-2']),
    );
  });

  // ── Typed edges ────────────────────────────────────────────────────────────

  test('typed edges: CREATION vs TRANSITION are stored separately', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('b', ['x'], EdgeKind.TRANSITION);
    expect(g.parentsOf('b')).toEqual(['a', 'x']);
    expect(g.parentsOf('b', EdgeKind.CREATION)).toEqual(['a']);
    expect(g.parentsOf('b', EdgeKind.TRANSITION)).toEqual(['x']);
  });

  test('primaryParentOf returns first CREATION parent, ignoring TRANSITION', () => {
    g.link('ev', ['transition-src'], EdgeKind.TRANSITION);
    g.link('ev', ['creation-src'], EdgeKind.CREATION);
    expect(g.primaryParentOf('ev')).toBe('creation-src');
  });

  test('rootOf walks only CREATION edges', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('c', ['b'], EdgeKind.CREATION);
    g.link('c', ['t'], EdgeKind.TRANSITION);
    expect(g.rootOf('c')).toBe('a');
  });

  // ── Bidirectional: childrenOf ──────────────────────────────────────────────

  test('childrenOf returns children from bidirectional links', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('c', ['a'], EdgeKind.CREATION);
    g.link('d', ['a'], EdgeKind.TRANSITION);
    expect(g.childrenOf('a')).toEqual(['b', 'c', 'd']);
    expect(g.childrenOf('a', EdgeKind.CREATION)).toEqual(['b', 'c']);
    expect(g.childrenOf('a', EdgeKind.TRANSITION)).toEqual(['d']);
  });

  // ── descendantsOf ──────────────────────────────────────────────────────────

  test('descendantsOf BFS down children', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('c', ['b'], EdgeKind.CREATION);
    g.link('d', ['c'], EdgeKind.TRANSITION);
    expect(g.descendantsOf('a')).toEqual(new Set(['b', 'c', 'd']));
    expect(g.descendantsOf('b')).toEqual(new Set(['c', 'd']));
    expect(g.descendantsOf('d')).toEqual(new Set());
  });

  test('descendantsOf is cycle-safe', () => {
    g.link('b', ['a'], EdgeKind.CREATION);
    g.link('a', ['b'], EdgeKind.CREATION);
    const desc = g.descendantsOf('a');
    expect(desc).toEqual(new Set(['b', 'a']));
  });

  // ── lastTransitionSource ──────────────────────────────────────────────────

  test('lastTransitionSource returns most recent TRANSITION parent', () => {
    g.link('ev', ['t1'], EdgeKind.TRANSITION);
    g.link('ev', ['t2'], EdgeKind.TRANSITION);
    expect(g.lastTransitionSource('ev')).toBe('t2');
  });

  test('lastTransitionSource returns null when no TRANSITION edges', () => {
    g.link('ev', ['a'], EdgeKind.CREATION);
    expect(g.lastTransitionSource('ev')).toBe(null);
  });

  test('lastTransitionSource returns null for unknown uid', () => {
    expect(g.lastTransitionSource('unknown')).toBe(null);
  });
});
