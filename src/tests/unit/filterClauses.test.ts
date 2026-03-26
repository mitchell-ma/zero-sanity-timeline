/**
 * filterClauses — clause evaluation mode tests.
 *
 * Validates ALL vs FIRST_MATCH behavior:
 *
 *   Clauses in order:
 *     IF A → effect A    (conditional, A=false)
 *     → effect B         (unconditional)
 *     IF C → effect C    (conditional, C=true)
 *     → effect D         (unconditional)
 *     IF E → effect E    (conditional, E=true)
 *     → effect F         (unconditional)
 *
 *   FIRST_MATCH outcome: B C D F   (E skipped — C already matched)
 *   ALL outcome:         B C D E F (both C and E fire)
 */

import { filterClauses } from '../../controller/timeline/eventInterpretorController';
import type { FrameClausePredicate } from '../../model/event-frames/skillEventFrame';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a conditional clause with a named tag for identification. */
function cond(tag: string): FrameClausePredicate {
  return {
    conditions: [{ subject: 'TEST', verb: 'HAVE', object: tag }],
    effects: [{ type: 'dsl', dslEffect: { verb: 'APPLY' as never, object: tag } as never }],
  };
}

/** Build an unconditional clause with a named tag. */
function uncond(tag: string): FrameClausePredicate {
  return {
    conditions: [],
    effects: [{ type: 'dsl', dslEffect: { verb: 'APPLY' as never, object: tag } as never }],
  };
}

/** Extract the tag from each accepted clause for assertion. */
function tags(clauses: readonly FrameClausePredicate[]): string[] {
  return clauses.map(c => (c.effects[0].dslEffect as { object: string })?.object);
}

// ── Condition truth table: A=false, C=true, E=true ──────────────────────

const truthTable: Record<string, boolean> = { A: false, C: true, E: true };

function evalConditions(pred: FrameClausePredicate): boolean {
  const tag = pred.conditions[0]?.object;
  return tag ? (truthTable[tag] ?? false) : true;
}

// ── Clause definitions ──────────────────────────────────────────────────

const clauses: FrameClausePredicate[] = [
  cond('A'),     // IF A → effect A
  uncond('B'),   // → effect B
  cond('C'),     // IF C → effect C
  uncond('D'),   // → effect D
  cond('E'),     // IF E → effect E
  uncond('F'),   // → effect F
];

// ── Tests ────────────────────────────────────────────────────────────────

describe('filterClauses', () => {
  test('ALL mode: executes every passing clause (B, C, D, E, F)', () => {
    const result = filterClauses(clauses, 'ALL', evalConditions);
    expect(tags(result)).toEqual(['B', 'C', 'D', 'E', 'F']);
  });

  test('ALL mode: undefined clauseType defaults to ALL behavior', () => {
    const result = filterClauses(clauses, undefined, evalConditions);
    expect(tags(result)).toEqual(['B', 'C', 'D', 'E', 'F']);
  });

  test('FIRST_MATCH mode: stops conditional matching after C, unconditionals still fire (B, C, D, F)', () => {
    const result = filterClauses(clauses, 'FIRST_MATCH', evalConditions);
    expect(tags(result)).toEqual(['B', 'C', 'D', 'F']);
  });

  test('FIRST_MATCH mode: no conditionals match → all unconditionals fire', () => {
    const allFalse = () => false;
    const result = filterClauses(clauses, 'FIRST_MATCH', allFalse);
    expect(tags(result)).toEqual(['B', 'D', 'F']);
  });

  test('FIRST_MATCH mode: first conditional matches → only that conditional fires', () => {
    const allTrue = () => true;
    const result = filterClauses(clauses, 'FIRST_MATCH', allTrue);
    // A matches first → A fires, C and E skipped
    expect(tags(result)).toEqual(['A', 'B', 'D', 'F']);
  });

  test('ALL mode: no conditionals match → only unconditionals fire', () => {
    const allFalse = () => false;
    const result = filterClauses(clauses, 'ALL', allFalse);
    expect(tags(result)).toEqual(['B', 'D', 'F']);
  });

  test('ALL mode: all conditionals match → everything fires', () => {
    const allTrue = () => true;
    const result = filterClauses(clauses, 'ALL', allTrue);
    expect(tags(result)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  test('FIRST_MATCH with only conditionals: first match wins', () => {
    const onlyConditionals: FrameClausePredicate[] = [
      cond('A'),
      cond('C'),
      cond('E'),
    ];
    const result = filterClauses(onlyConditionals, 'FIRST_MATCH', evalConditions);
    expect(tags(result)).toEqual(['C']);
  });

  test('FIRST_MATCH with only unconditionals: all fire', () => {
    const onlyUnconditionals: FrameClausePredicate[] = [
      uncond('B'),
      uncond('D'),
      uncond('F'),
    ];
    const result = filterClauses(onlyUnconditionals, 'FIRST_MATCH', () => true);
    expect(tags(result)).toEqual(['B', 'D', 'F']);
  });
});
