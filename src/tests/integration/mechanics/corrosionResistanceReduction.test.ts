/**
 * @jest-environment jsdom
 */

/**
 * Corrosion → ARTS_RESISTANCE_REDUCTION + PHYSICAL_RESISTANCE_REDUCTION via
 * per-segment APPLY clauses. Together ARTS (umbrella over HEAT/CRYO/NATURE/
 * ELECTRIC) + PHYSICAL cover every damage type — Corrosion reduces resistance
 * for all incoming damage without needing per-element entries.
 *
 * Pins the engine unification — Corrosion no longer uses a closed-form
 * `getCorrosionResistanceReduction` read in the damage formula; instead each
 * of its 1-second ramp segments carries two
 * `APPLY <ARTS|PHYSICAL> RESISTANCE_REDUCTION STAT to ENEMY` effects that flow
 * through the normal `runStatusCreationLifecycle` segment-clause dispatch and
 * write to the enemy stat accumulator for the segment's lifetime.
 *
 * Also pins segment structure: 15s Corrosion = 9 ramp ticks + 1 final hold
 * segment, named "Corrosion <statusLevelRoman>" then sequential "II", "III", …
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { VerbType, NounType, AdjectiveType } from '../../../dsl/semantics';
import { FPS } from '../../../utils/timeline';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';

beforeEach(() => { localStorage.clear(); });

/** Place a level-1 Corrosion reaction on the enemy timeline via freeform mode.
 *  (Defaults to level 1 because the bare `handleAddEvent` path doesn't thread
 *  through the context-menu's `with.statusLevel` baking — the engine picks the
 *  default statusLevel.) */
function placeFreeformCorrosion(view: ReturnType<typeof renderHook<ReturnType<typeof useApp>, unknown>>, atFrame: number) {
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    view.result.current.handleAddEvent(
      ENEMY_ID,
      REACTION_COLUMNS.CORROSION,
      atFrame,
      {
        name: REACTION_COLUMNS.CORROSION,
        id: REACTION_COLUMNS.CORROSION,
        segments: [{ properties: { duration: 15 * FPS } }],
      },
    );
  });
}

describe('Corrosion — per-segment APPLY ARTS + PHYSICAL RESISTANCE_REDUCTION', () => {
  it('produces 9 ramp ticks + 1 final hold segment (10 total) for 15s corrosion', () => {
    const view = renderHook(() => useApp());
    placeFreeformCorrosion(view, 1 * FPS);

    const corrosion = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.CORROSION,
    );
    expect(corrosion).toBeDefined();
    expect(corrosion!.segments).toHaveLength(10);

    // First 9 segments are 1s ramp ticks; the 10th is the hold at max (6s).
    for (let i = 0; i < 9; i++) {
      expect(corrosion!.segments[i].properties.duration).toBe(FPS);
    }
    expect(corrosion!.segments[9].properties.duration).toBe(6 * FPS);
  });

  it('each segment carries APPLY RESISTANCE_REDUCTION effects for both ARTS and PHYSICAL', () => {
    const view = renderHook(() => useApp());
    placeFreeformCorrosion(view, 1 * FPS);

    const corrosion = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.CORROSION,
    );
    expect(corrosion).toBeDefined();

    for (const seg of corrosion!.segments) {
      expect(seg.clause).toBeDefined();
      expect(seg.clause).toHaveLength(1);
      const predicate = seg.clause![0];
      expect(predicate.conditions).toHaveLength(0);
      expect(predicate.effects).toHaveLength(2);

      const qualifiers = predicate.effects.map(e => e.objectQualifier).sort();
      expect(qualifiers).toEqual([AdjectiveType.ARTS, AdjectiveType.PHYSICAL].sort());

      for (const effect of predicate.effects) {
        expect(effect.verb).toBe(VerbType.APPLY);
        expect(effect.object).toBe(NounType.STAT);
        expect(effect.objectId).toBe(NounType.RESISTANCE_REDUCTION);
        expect(effect.to).toBe(NounType.ENEMY);

        // Each effect's clause carries a positive, non-zero reduction value.
        const withNode = effect.with as { value: { verb: string; value: number } } | undefined;
        expect(withNode).toBeDefined();
        expect(withNode!.value.verb).toBe(VerbType.IS);
        expect(withNode!.value.value).toBeGreaterThan(0);
      }
    }
  });

  it('ramp segment clauses carry monotonically increasing values; final hold is max', () => {
    const view = renderHook(() => useApp());
    placeFreeformCorrosion(view, 1 * FPS);

    const corrosion = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.CORROSION,
    );
    expect(corrosion).toBeDefined();

    // ARTS and PHYSICAL effects share the same reduction value per segment;
    // sample the first effect.
    const values = corrosion!.segments.map(seg => {
      const effect = seg.clause![0].effects[0];
      const withNode = effect.with as { value: { value: number } };
      return withNode.value.value;
    });

    // First 9 ramp values are strictly increasing
    for (let i = 1; i < 9; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    // Final hold value equals the max reduction for status level 1 (decimal): 0.12.
    expect(values[9]).toBeCloseTo(0.12, 5);
  });

  it('segment names follow skill-card convention — "Corrosion <level>" then sequential 1-based indices', () => {
    const view = renderHook(() => useApp());
    placeFreeformCorrosion(view, 1 * FPS);

    const corrosion = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.CORROSION,
    );
    expect(corrosion).toBeDefined();

    // Roman numerals are reserved for StatusLevel display only.
    expect(corrosion!.segments[0].properties.name).toBe('Corrosion I');
    expect(corrosion!.segments[1].properties.name).toBe('2');
    expect(corrosion!.segments[2].properties.name).toBe('3');
    expect(corrosion!.segments[8].properties.name).toBe('9');
    expect(corrosion!.segments[9].properties.name).toBe('10');
  });

});
