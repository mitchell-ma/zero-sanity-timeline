/**
 * UltimateEnergyController — reactive computation invariants
 *
 * Regression tests for Phase 9b reactive rebuilds in `_computeGraphs`:
 *  - per-event `slotEfficiencies` snapshot (captured at gain time, not applied
 *    retroactively by post-pipeline cfg.efficiency)
 *  - `spDerivedFromUid` idempotency (repeated reactive computes must not
 *    double-count SP→UE conversion)
 *  - `setIgnoreExternalGain` triggers recompute so the flag takes effect on
 *    gains already in the raw store
 */

import { UltimateEnergyController, RawUltimateEnergyGainEvent, applyGainEfficiency } from '../../controller/timeline/ultimateEnergyController';
import { SkillPointController } from '../../controller/slot/skillPointController';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [], getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {}, getDefaultLoadoutProperties: () => ({}),
}));
jest.mock('../../utils/loadoutRegistry', () => ({
  WEAPONS: [], ARMORS: [], GLOVES: [], KITS: [], CONSUMABLES: [], TACTICALS: [],
}));
jest.mock('../../controller/operators/operatorRegistry', () => ({
  ALL_SAMPLE_OPERATORS: [],
  buildViewOperatorFromJson: () => null,
}));

const SLOT = 'slot-0';
const MAX = 300;

describe('UEController — slotEfficiencies snapshot', () => {
  test('applyGainEfficiency prefers per-event snapshot over fallback efficiencyBonus', () => {
    // Event captured +0.30 efficiency at gain time. Fallback says +0.00.
    // Result should honor the snapshot (snapshot wins).
    const events: RawUltimateEnergyGainEvent[] = [
      {
        frame: 100,
        sourceSlotId: SLOT,
        selfGain: 10,
        teamGain: 0,
        slotEfficiencies: new Map([[SLOT, 0.3]]),
      },
    ];
    const gains = applyGainEfficiency(events, SLOT, 0, []);
    expect(gains).toHaveLength(1);
    expect(gains[0].amount).toBeCloseTo(10 * 1.3, 5);
  });

  test('applyGainEfficiency falls back to efficiencyBonus when no snapshot', () => {
    const events: RawUltimateEnergyGainEvent[] = [
      { frame: 100, sourceSlotId: SLOT, selfGain: 10, teamGain: 0 },
    ];
    const gains = applyGainEfficiency(events, SLOT, 0.5, []);
    expect(gains[0].amount).toBeCloseTo(10 * 1.5, 5);
  });

  test('two gains with different snapshots scale independently (no retroactive leak)', () => {
    const events: RawUltimateEnergyGainEvent[] = [
      {
        frame: 100,
        sourceSlotId: SLOT,
        selfGain: 10,
        teamGain: 0,
        slotEfficiencies: new Map([[SLOT, 0]]),   // pre-boost
      },
      {
        frame: 200,
        sourceSlotId: SLOT,
        selfGain: 10,
        teamGain: 0,
        slotEfficiencies: new Map([[SLOT, 0.5]]), // post-boost
      },
    ];
    const gains = applyGainEfficiency(events, SLOT, 0, []);
    expect(gains[0].amount).toBeCloseTo(10, 5);
    expect(gains[1].amount).toBeCloseTo(15, 5);
  });
});

describe('UEController — spDerivedFromUid idempotency', () => {
  test('repeated reactive computes do not double-count SP→UE gain', () => {
    const ue = new UltimateEnergyController();
    const sp = new SkillPointController();
    sp.setUltimateEnergyController(ue);
    ue.configureSlot(SLOT, { max: MAX, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    // Single battle skill: costs 100 SP (all natural). Triggers one SP-derived
    // gain. Any follow-on reactive calls (e.g. another state change) must
    // strip+rebuild — not append.
    sp.addCost('battle-1', 500, 100, SLOT, 500);

    // Force extra reactive recomputes by poking UE state-change setters.
    ue.addNoGainWindow(9000, 9001, SLOT);   // non-overlapping — pure recompute trigger
    ue.setIgnoreExternalGain(SLOT, false);  // no-op value change? still a setter
    ue.setIgnoreExternalGain(SLOT, false);  // confirmed no-op (value unchanged)

    const graph = ue.getGraph(SLOT)!;
    // Expected SP-derived gain: 100 * 0.065 = 6.5
    const maxVal = Math.max(...graph.points.map(p => p.value));
    expect(maxVal).toBeCloseTo(6.5, 2);
  });

  test('onNaturalSpConsumed with 0 removes the SP-derived gain', () => {
    const ue = new UltimateEnergyController();
    const sp = new SkillPointController();
    sp.setUltimateEnergyController(ue);
    ue.configureSlot(SLOT, { max: MAX, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    sp.addCost('battle-1', 500, 100, SLOT, 500);
    const before = ue.getGraph(SLOT)!;
    expect(Math.max(...before.points.map(p => p.value))).toBeGreaterThan(0);

    // Directly clear natural SP for that event uid → graph rebuild should drop
    // the SP-derived gain entirely.
    ue.onNaturalSpConsumed({ eventUid: 'battle-1', naturalConsumed: 0, returnedConsumed: 0 } as Parameters<UltimateEnergyController['onNaturalSpConsumed']>[0]);

    const after = ue.getGraph(SLOT)!;
    expect(Math.max(...after.points.map(p => p.value))).toBe(0);
  });
});

describe('UEController — setIgnoreExternalGain reactive', () => {
  test('toggling ignoreExternalGain rebuilds graph without re-adding raw gains', () => {
    const ue = new UltimateEnergyController();
    ue.configureSlot(SLOT, { max: MAX, startValue: 0, chargePerFrame: 0, efficiency: 0 });
    ue.configureSlot('slot-1', { max: MAX, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    // A team gain from a foreign slot
    ue.addUltimateEnergyGain(100, 'slot-1', 0, 20);

    // Before ignore: slot-0 sees the team gain
    let graph = ue.getGraph(SLOT)!;
    expect(Math.max(...graph.points.map(p => p.value))).toBeCloseTo(20, 2);

    // Enable ignore on slot-0 → reactive rebuild should drop the foreign gain
    ue.setIgnoreExternalGain(SLOT, true);
    graph = ue.getGraph(SLOT)!;
    expect(Math.max(...graph.points.map(p => p.value))).toBe(0);

    // Disable again → foreign gain visible once more
    ue.setIgnoreExternalGain(SLOT, false);
    graph = ue.getGraph(SLOT)!;
    expect(Math.max(...graph.points.map(p => p.value))).toBeCloseTo(20, 2);
  });

  test('setIgnoreExternalGain does not affect same-slot gains', () => {
    const ue = new UltimateEnergyController();
    ue.configureSlot(SLOT, { max: MAX, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    ue.addUltimateEnergyGain(100, SLOT, 15, 0);  // self gain

    ue.setIgnoreExternalGain(SLOT, true);
    const graph = ue.getGraph(SLOT)!;
    // Self gain not suppressed by ignoreExternalGain
    expect(Math.max(...graph.points.map(p => p.value))).toBeCloseTo(15, 2);
  });
});
