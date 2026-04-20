/**
 * @jest-environment jsdom
 *
 * POTENTIAL vs TALENT stat-application paths
 *
 * Locks in the invariant that POTENTIAL segment-clause APPLY STAT effects are
 * applied ONLY through `loadoutAggregator.getPotentialStats` (baked into
 * `StatAccumulator.base` at init), while TALENT segment-clause APPLY STAT
 * effects are applied ONLY through the frame-0 interpretor loop in
 * `eventQueueController.ts`. Firing both paths for the same def doubles the
 * stat application — a pre-existing bug caught during the AUTOMATIC migration.
 *
 * The filter guarding this lives at the top of the
 * `triggerIdx.getTalents(slotId)` loop in eventQueueController.ts — skips
 * entries where `eventCategoryType === POTENTIAL`. These tests fail if that
 * filter is removed.
 *
 * See: feedback_potential_vs_talent_stat_paths.md
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { EventType, StatType } from '../../consts/enums';
import { NounType, VerbType } from '../../dsl/semantics';
import { aggregateLoadoutStats } from '../../controller/calculation/loadoutAggregator';
import {
  getLastStatAccumulator,
  getLastTriggerIndex,
} from '../../controller/timeline/eventQueueController';
import type { AppResult } from './helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../model/game-data/operators/wulfgard/wulfgard.json').id;
const LIFENG_ID: string = require('../../model/game-data/operators/lifeng/lifeng.json').id;
const LONE_WOLF_P1 = require('../../model/game-data/operators/wulfgard/potentials/potential-1-lone-wolf.json');
const LIFENG_ILLUMINATION = require('../../model/game-data/operators/lifeng/talents/talent-illumination-talent.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

function setPotential(app: AppResult, slotId: string, potential: number) {
  const props = app.loadoutProperties[slotId];
  app.handleStatsChange(slotId, { ...props, operator: { ...props.operator, potential } });
}

// ── Fixture sanity checks ──────────────────────────────────────────────────

describe('fixture invariants (test setup sanity)', () => {
  it('Wulfgard P1 Lone Wolf is an AUTOMATIC POTENTIAL with APPLY STAT segment clauses', () => {
    const props = LONE_WOLF_P1.properties;
    expect(props.eventCategoryType).toBe(NounType.POTENTIAL);
    expect(props.eventTypes).toContain(EventType.AUTOMATIC);
    const effects = LONE_WOLF_P1.segments[0].clause[0].effects;
    expect(effects.some((e: { verb: string; object: string }) => e.verb === VerbType.APPLY && e.object === NounType.STAT)).toBe(true);
  });

  it('Lifeng Illumination is an AUTOMATIC TALENT with APPLY STAT segment clauses', () => {
    const props = LIFENG_ILLUMINATION.properties;
    expect(props.eventCategoryType).toBe(NounType.TALENT);
    expect(props.eventTypes).toContain(EventType.AUTOMATIC);
    const effects = LIFENG_ILLUMINATION.segments[0].clause[0].effects;
    expect(effects.some((e: { verb: string; object: string }) => e.verb === VerbType.APPLY && e.object === NounType.STAT)).toBe(true);
  });
});

// ── POTENTIAL path: loadoutAggregator only ─────────────────────────────────

describe('POTENTIAL APPLY STAT is NOT double-counted', () => {
  it('Wulfgard STRENGTH matches aggregator at every potential level', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, WULFGARD_ID); });

    for (const p of [0, 1, 2, 3, 4, 5]) {
      act(() => { setPotential(result.current, SLOT, p); });
      const loadout = result.current.loadouts[SLOT];
      const props = result.current.loadoutProperties[SLOT];
      const agg = aggregateLoadoutStats(WULFGARD_ID, loadout, props)!;
      const accSTR = getLastStatAccumulator()!.getStat(SLOT, StatType.STRENGTH);
      expect(accSTR).toBe(agg.stats[StatType.STRENGTH]);
    }
  });

  it('Wulfgard AGILITY matches aggregator at every potential level', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, WULFGARD_ID); });

    for (const p of [0, 1, 2, 3, 4, 5]) {
      act(() => { setPotential(result.current, SLOT, p); });
      const loadout = result.current.loadouts[SLOT];
      const props = result.current.loadoutProperties[SLOT];
      const agg = aggregateLoadoutStats(WULFGARD_ID, loadout, props)!;
      const accAGI = getLastStatAccumulator()!.getStat(SLOT, StatType.AGILITY);
      expect(accAGI).toBe(agg.stats[StatType.AGILITY]);
    }
  });

  it('locked P1 potential does NOT contribute stats at P0', () => {
    // At P0 the potential is locked — the aggregator correctly excludes it.
    // Pre-fix, the interpretor fired the potential's segment-clause APPLY STAT
    // at frame 0 regardless of level, adding +15 STR to a P0 operator.
    // This test catches that specifically.
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
    act(() => { setPotential(result.current, SLOT, 0); });

    const loadout = result.current.loadouts[SLOT];
    const props = result.current.loadoutProperties[SLOT];
    const aggP0 = aggregateLoadoutStats(WULFGARD_ID, loadout, props)!;
    const accP0 = getLastStatAccumulator()!.getStat(SLOT, StatType.STRENGTH);

    expect(accP0).toBe(aggP0.stats[StatType.STRENGTH]);
  });
});

// ── TALENT path: frame-0 interpretor only ──────────────────────────────────

describe('TALENT APPLY STAT still fires at frame 0', () => {
  it('Lifeng Illumination contributes ATTACK_BONUS that aggregator does NOT supply', () => {
    // Illumination grants an ATTACK_BONUS scaled by WILL + INTELLECT. The
    // aggregator does NOT include talent APPLY STAT — only potentials go
    // there. So the accumulator's ATTACK_BONUS must exceed the aggregator's.
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, LIFENG_ID); });

    const loadout = result.current.loadouts[SLOT];
    const props = result.current.loadoutProperties[SLOT];
    const agg = aggregateLoadoutStats(LIFENG_ID, loadout, props)!;
    const accATK = getLastStatAccumulator()!.getStat(SLOT, StatType.ATTACK_BONUS);

    expect(accATK).toBeGreaterThan(agg.stats[StatType.ATTACK_BONUS] ?? 0);
  });
});

// ── Presence events survive the POTENTIAL skip ─────────────────────────────

describe('POTENTIAL skip does NOT remove the frame-0 presence event', () => {
  it('Wulfgard P1 Lone Wolf still appears in the trigger index talents list', () => {
    // The eventQueueController filter only skips the stat-interpret loop —
    // `triggerIdx.getTalents` still contains the POTENTIAL so columnBuilder
    // can hug-left it in the status column.
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
    act(() => { setPotential(result.current, SLOT, 1); });

    const idx = getLastTriggerIndex()!;
    const talentIds = idx.getTalents(SLOT).map(t => t.def.properties.id);
    expect(talentIds).toContain(LONE_WOLF_P1.properties.id);
  });
});
