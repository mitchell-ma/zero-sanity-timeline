/**
 * Reaction statusLevel picker — unit tests.
 *
 * Narrow, fast diagnostics for the freeform reaction statusLevel pipeline.
 * The end-to-end flow is covered by
 *   `src/tests/integration/freeform/freeformReactionStatusLevel.test.ts`.
 * These unit tests exercise the two pure seams that the integration test
 * spans through, so regressions point at a specific layer:
 *
 *   A. `buildColumns` — emits the canonical freeform wrapper clause for
 *      reaction micro-columns:
 *        `APPLY STATUS REACTION <X> WITH STACKS 1, STATUS_LEVEL 1`.
 *      Non-reaction micro-columns (inflictions, physical statuses, operator
 *      statuses) are unaffected.
 *
 *   B. `injectStatusLevelIntoSegments` — the context-menu resolver's clause
 *      mutator. Swaps `with.statusLevel` on any APPLY REACTION clause inside
 *      the wrapper's segments, leaving every other effect, frame, and
 *      segment field intact; returns a new segments tree (no mutation).
 */

import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { buildColumns, Slot } from '../../controller/timeline/columnBuilder';
import { injectStatusLevelIntoSegments } from '../../controller/timeline/contextMenuController';
import { REACTION_COLUMNS } from '../../model/channels';
import type { Effect } from '../../dsl/semantics';
import { NounType, PhysicalStatusType, VerbType } from '../../dsl/semantics';
import type { Enemy, EventSegmentData, MiniTimeline, Operator, VisibleSkills } from '../../consts/viewTypes';
import type { FrameClausePredicate } from '../../model/event-frames/skillEventFrame';

// ── Test fixtures ───────────────────────────────────────────────────────────

const ENEMY: Enemy = {
  id: 'test-enemy',
  name: 'Test Enemy',
  tier: 'NORMAL',
  statuses: [],
  staggerHp: 10000,
  staggerNodes: 0,
  staggerNodeRecoverySeconds: 5,
  staggerBreakDurationSeconds: 10,
};

function findOperator(id: string): Operator {
  const op = ALL_OPERATORS.find(o => o.id === id);
  if (!op) throw new Error(`Operator ${id} not found`);
  return op;
}

function allSkillsVisible(slotId: string): VisibleSkills {
  return {
    [slotId]: {
      [NounType.BASIC_ATTACK]: true,
      [NounType.BATTLE]: true,
      [NounType.COMBO]: true,
      [NounType.ULTIMATE]: true,
    } as Record<string, boolean>,
  };
}

function makeSlot(slotId: string, operator: Operator): Slot {
  return { slotId, operator };
}

function buildTestColumns() {
  const op = findOperator('YVONNE');
  const slot = makeSlot('slot1', op);
  return buildColumns([slot], ENEMY, allSkillsVisible('slot1'));
}

function firstDslEffect(segments: EventSegmentData[] | undefined): Effect | undefined {
  const eff = segments?.[0]?.frames?.[0]?.clauses?.[0]?.effects?.[0] as
    { type?: string; dslEffect?: Effect } | undefined;
  return eff?.type === 'dsl' ? eff?.dslEffect : undefined;
}

// ═════════════════════════════════════════════════════════════════════════════
// A. buildColumns emits canonical APPLY REACTION clause on reaction micros
// ═════════════════════════════════════════════════════════════════════════════

describe('A. Freeform reaction micro-columns carry canonical APPLY REACTION clause', () => {
  const reactionIds = [
    REACTION_COLUMNS.COMBUSTION,
    REACTION_COLUMNS.SOLIDIFICATION,
    REACTION_COLUMNS.CORROSION,
    REACTION_COLUMNS.ELECTRIFICATION,
    REACTION_COLUMNS.SHATTER,
  ];

  for (const reactionId of reactionIds) {
    it(`${reactionId}: APPLY STATUS REACTION ${reactionId} WITH stacks=1, statusLevel=1`, () => {
      const columns = buildTestColumns();
      const enemyStatusCol = columns.find(
        (c): c is MiniTimeline =>
          c.type === 'mini-timeline' && c.ownerEntityId === 'enemy' && c.columnId === 'enemy-status',
      );
      expect(enemyStatusCol).toBeDefined();

      const mc = enemyStatusCol!.microColumns?.find(m => m.id === reactionId);
      expect(mc).toBeDefined();

      const dsl = firstDslEffect(mc!.defaultEvent?.segments);
      expect(dsl).toBeDefined();
      expect(dsl!.verb).toBe(VerbType.APPLY);
      expect(dsl!.object).toBe(NounType.STATUS);
      expect(dsl!.objectId).toBe(NounType.REACTION);
      expect(dsl!.objectQualifier).toBe(reactionId);

      const w = dsl!.with as Record<string, { verb: string; value: number }>;
      expect(w.stacks).toEqual({ verb: VerbType.IS, value: 1 });
      expect(w.statusLevel).toEqual({ verb: VerbType.IS, value: 1 });
    });
  }

  it('non-reaction micro-columns do not receive the reaction form (objectId !== REACTION)', () => {
    const columns = buildTestColumns();
    const enemyStatusCol = columns.find(
      (c): c is MiniTimeline =>
        c.type === 'mini-timeline' && c.ownerEntityId === 'enemy' && c.columnId === 'enemy-status',
    );
    const physicalStatus = enemyStatusCol!.microColumns?.find(m => m.id === PhysicalStatusType.LIFT);
    expect(physicalStatus).toBeDefined();
    const dsl = firstDslEffect(physicalStatus!.defaultEvent?.segments);
    // LIFT uses the PHYSICAL form, not the REACTION form
    expect(dsl!.objectId).not.toBe(NounType.REACTION);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. injectStatusLevelIntoSegments — pure clause mutator
// ═════════════════════════════════════════════════════════════════════════════

/** Build a minimal segments tree with one APPLY REACTION clause + optional
 *  second effect so we can verify selectivity. */
function segWithReaction(
  reactionId: string,
  initialLevel: number,
  sibling?: Effect,
): EventSegmentData[] {
  const applyReaction: Effect = {
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId: NounType.REACTION,
    objectQualifier: reactionId as unknown as Effect['objectQualifier'],
    to: NounType.ENEMY,
    with: {
      stacks: { verb: VerbType.IS, value: 1 },
      statusLevel: { verb: VerbType.IS, value: initialLevel },
    },
  };
  const effects = sibling ? [applyReaction, sibling] : [applyReaction];
  const clause: FrameClausePredicate = {
    conditions: [],
    effects: effects.map(dslEffect => ({ type: 'dsl' as const, dslEffect })),
  };
  return [{
    properties: { duration: 600 },
    frames: [{ offsetFrame: 0, clauses: [clause] }],
  }];
}

describe('B. injectStatusLevelIntoSegments', () => {
  it('swaps with.statusLevel on the APPLY REACTION clause (levels 1..4)', () => {
    for (const level of [1, 2, 3, 4]) {
      const segs = segWithReaction(REACTION_COLUMNS.ELECTRIFICATION, 1);
      const out = injectStatusLevelIntoSegments(segs, level);
      const dsl = firstDslEffect(out);
      expect(dsl).toBeDefined();
      expect(dsl!.with).toBeDefined();
      const w = dsl!.with as Record<string, { verb: string; value: number }>;
      expect(w.statusLevel).toEqual({ verb: VerbType.IS, value: level });
    }
  });

  it('preserves with.stacks alongside the swapped statusLevel', () => {
    const segs = segWithReaction(REACTION_COLUMNS.COMBUSTION, 1);
    const out = injectStatusLevelIntoSegments(segs, 3);
    const dsl = firstDslEffect(out);
    const w = dsl!.with as Record<string, { verb: string; value: number }>;
    expect(w.stacks).toEqual({ verb: VerbType.IS, value: 1 });
    expect(w.statusLevel).toEqual({ verb: VerbType.IS, value: 3 });
  });

  it('does not mutate the input segments (returns new tree)', () => {
    const segs = segWithReaction(REACTION_COLUMNS.SOLIDIFICATION, 1);
    const snapshot = JSON.parse(JSON.stringify(segs));
    const out = injectStatusLevelIntoSegments(segs, 4);
    expect(out).not.toBe(segs);
    expect(segs).toEqual(snapshot);
  });

  it('ignores non-dsl effects and non-APPLY-REACTION effects', () => {
    const sibling: Effect = {
      verb: VerbType.RECOVER,
      object: NounType.ULTIMATE_ENERGY,
      with: { value: { verb: VerbType.IS, value: 5 } },
    };
    const segs = segWithReaction(REACTION_COLUMNS.CORROSION, 1, sibling);
    const out = injectStatusLevelIntoSegments(segs, 2);
    const effects = out?.[0]?.frames?.[0]?.clauses?.[0]?.effects;
    expect(effects).toHaveLength(2);
    const apply = (effects![0] as { type: string; dslEffect: Effect }).dslEffect;
    const recover = (effects![1] as { type: string; dslEffect: Effect }).dslEffect;
    expect(apply.verb).toBe(VerbType.APPLY);
    expect((apply.with as Record<string, { value: number }>).statusLevel.value).toBe(2);
    // Sibling untouched
    expect(recover).toEqual(sibling);
  });

  it('leaves APPLY STATUS <non-REACTION> clauses alone', () => {
    const applyStatus: Effect = {
      verb: VerbType.APPLY,
      object: NounType.STATUS,
      objectId: 'MELTING_FLAME',
      to: NounType.OPERATOR,
      with: { stacks: { verb: VerbType.IS, value: 1 } },
    };
    const clause: FrameClausePredicate = {
      conditions: [],
      effects: [{ type: 'dsl' as const, dslEffect: applyStatus }],
    };
    const segs: EventSegmentData[] = [{
      properties: { duration: 600 },
      frames: [{ offsetFrame: 0, clauses: [clause] }],
    }];
    const out = injectStatusLevelIntoSegments(segs, 4);
    const dsl = firstDslEffect(out);
    // No statusLevel added to non-REACTION APPLY
    const w = (dsl!.with ?? {}) as Record<string, unknown>;
    expect(w.statusLevel).toBeUndefined();
  });

  it('handles undefined / empty inputs without throwing', () => {
    expect(injectStatusLevelIntoSegments(undefined, 2)).toBeUndefined();
    expect(injectStatusLevelIntoSegments([], 2)).toEqual([]);
    const segNoFrames: EventSegmentData[] = [{ properties: { duration: 600 } }];
    expect(injectStatusLevelIntoSegments(segNoFrames, 2)).toEqual(segNoFrames);
    const segNoClauses: EventSegmentData[] = [{
      properties: { duration: 600 },
      frames: [{ offsetFrame: 0 }],
    }];
    expect(injectStatusLevelIntoSegments(segNoClauses, 2)).toEqual(segNoClauses);
  });

  it('swaps statusLevel across multiple frames and segments independently', () => {
    const applyCombustion: Effect = {
      verb: VerbType.APPLY, object: NounType.STATUS,
      objectId: NounType.REACTION, objectQualifier: REACTION_COLUMNS.COMBUSTION as unknown as Effect['objectQualifier'],
      to: NounType.ENEMY,
      with: { stacks: { verb: VerbType.IS, value: 1 }, statusLevel: { verb: VerbType.IS, value: 1 } },
    };
    const clause: FrameClausePredicate = { conditions: [], effects: [{ type: 'dsl', dslEffect: applyCombustion }] };
    const segs: EventSegmentData[] = [
      { properties: { duration: 300 }, frames: [{ offsetFrame: 0, clauses: [clause] }, { offsetFrame: 60, clauses: [clause] }] },
      { properties: { duration: 300 }, frames: [{ offsetFrame: 0, clauses: [clause] }] },
    ];
    const out = injectStatusLevelIntoSegments(segs, 4)!;
    const checkFrameLevel = (seg: number, frame: number) => {
      const eff = out[seg].frames![frame].clauses![0].effects[0] as { type: string; dslEffect: Effect };
      expect((eff.dslEffect.with as Record<string, { value: number }>).statusLevel.value).toBe(4);
    };
    checkFrameLevel(0, 0);
    checkFrameLevel(0, 1);
    checkFrameLevel(1, 0);
  });
});
