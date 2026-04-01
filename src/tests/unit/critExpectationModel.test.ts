import {
  CritExpectationModel,
  SharedTimerModel,
  FifoModel,
  LifecycleModel,
} from '../../controller/calculation/critExpectationModel';
import type { CritStatusConfig } from '../../controller/calculation/critExpectationModel';
import { StackInteractionType, PERMANENT_DURATION } from '../../consts/enums';
import { StatType } from '../../model/enums/stats';
import { FPS } from '../../utils/timeline';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<CritStatusConfig> = {}): CritStatusConfig {
  return {
    statusId: 'TEST_STATUS',
    label: 'Test Status',
    stackCap: 5,
    durationFrames: 5 * FPS, // 5 seconds
    interactionType: StackInteractionType.NONE,
    isFeedback: false,
    perStackStats: [],
    thresholdStats: [],
    ...overrides,
  };
}

/** Sum a probability distribution — should be ~1.0. */
function sumDist(dist: number[]): number {
  return dist.reduce((a, b) => a + b, 0);
}

// ── SharedTimerModel Tests ───────────────────────────────────────────────────

describe('SharedTimerModel', () => {
  it('starts with all probability at 0 stacks', () => {
    const model = new SharedTimerModel(makeConfig());
    const dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(1.0);
    expect(sumDist(dist)).toBeCloseTo(1.0);
  });

  it('shifts probability toward higher stacks with 100% crit rate', () => {
    const model = new SharedTimerModel(makeConfig());
    // 5 frames at 100% crit = guaranteed 5 stacks
    for (let i = 0; i < 5; i++) {
      model.step(i * FPS, 1.0);
    }
    const dist = model.getDistribution();
    expect(dist[5]).toBeCloseTo(1.0);
    expect(sumDist(dist)).toBeCloseTo(1.0);
  });

  it('stays at 0 stacks with 0% crit rate', () => {
    const model = new SharedTimerModel(makeConfig());
    for (let i = 0; i < 10; i++) {
      model.step(i * FPS, 0.0);
    }
    const dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(1.0);
  });

  it('produces correct distribution for 50% crit rate after 1 frame', () => {
    const model = new SharedTimerModel(makeConfig());
    model.step(0, 0.5);
    const dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(0.5);
    expect(dist[1]).toBeCloseTo(0.5);
    expect(sumDist(dist)).toBeCloseTo(1.0);
  });

  it('clamps at stack cap', () => {
    const model = new SharedTimerModel(makeConfig({ stackCap: 2 }));
    // 5 frames at 100% crit — can't exceed cap of 2
    for (let i = 0; i < 5; i++) {
      model.step(i * FPS, 1.0);
    }
    const dist = model.getDistribution();
    expect(dist[2]).toBeCloseTo(1.0);
    expect(dist.length).toBe(3); // 0, 1, 2
  });

  it('expires stacks when duration is exceeded', () => {
    const durationFrames = 3 * FPS;
    const model = new SharedTimerModel(makeConfig({ durationFrames }));
    // Crit at frame 0
    model.step(0, 1.0);
    expect(model.getDistribution()[1]).toBeCloseTo(1.0);

    // Frame at 2s — still within 3s window
    model.step(2 * FPS, 0.0);
    expect(model.getDistribution()[1]).toBeCloseTo(1.0);

    // Frame at 4s — exceeds 3s since last crit at frame 0, should expire
    model.step(4 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
  });

  it('refreshes timer on subsequent crits', () => {
    const durationFrames = 3 * FPS;
    const model = new SharedTimerModel(makeConfig({ durationFrames }));
    // Crit at frame 0
    model.step(0, 1.0);
    // Crit at frame 2s — refreshes timer
    model.step(2 * FPS, 1.0);
    expect(model.getDistribution()[2]).toBeCloseTo(1.0);

    // Frame at 4s — only 2s since last crit, should NOT expire
    model.step(4 * FPS, 0.0);
    expect(model.getDistribution()[2]).toBeCloseTo(1.0);

    // Frame at 6s — 4s since last crit at 2s, exceeds 3s, should expire
    model.step(6 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
  });

  it('maintains probability sum of 1.0 after many steps', () => {
    const model = new SharedTimerModel(makeConfig());
    for (let i = 0; i < 100; i++) {
      model.step(i * 30, 0.3); // ~4 frames per second at FPS=120
    }
    expect(sumDist(model.getDistribution())).toBeCloseTo(1.0, 6);
  });
});

// ── FifoModel Tests ──────────────────────────────────────────────────────────

describe('FifoModel', () => {
  it('starts with all probability at 0 stacks', () => {
    const model = new FifoModel(makeConfig({ interactionType: StackInteractionType.RESET, stackCap: 3 }));
    const dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(1.0);
  });

  it('produces Poisson binomial distribution for uniform crit rate', () => {
    const config = makeConfig({
      interactionType: StackInteractionType.RESET,
      stackCap: 3,
      durationFrames: 100 * FPS, // large window
    });
    const model = new FifoModel(config);
    // 3 frames at 50% crit — Poisson binomial of 3 Bernoulli(0.5)
    model.step(0, 0.5);
    model.step(FPS, 0.5);
    model.step(2 * FPS, 0.5);
    const dist = model.getDistribution();
    // P(0) = 0.125, P(1) = 0.375, P(2) = 0.375, P(3) = 0.125
    expect(dist[0]).toBeCloseTo(0.125);
    expect(dist[1]).toBeCloseTo(0.375);
    expect(dist[2]).toBeCloseTo(0.375);
    expect(dist[3]).toBeCloseTo(0.125);
    expect(sumDist(dist)).toBeCloseTo(1.0);
  });

  it('clamps to cap when more crits than cap', () => {
    const config = makeConfig({
      interactionType: StackInteractionType.RESET,
      stackCap: 2,
      durationFrames: 100 * FPS,
    });
    const model = new FifoModel(config);
    // 5 frames at 100% crit — all 5 crit but cap is 2
    for (let i = 0; i < 5; i++) {
      model.step(i * FPS, 1.0);
    }
    const dist = model.getDistribution();
    expect(dist[2]).toBeCloseTo(1.0);
  });

  it('expires old stacks outside the duration window', () => {
    const config = makeConfig({
      interactionType: StackInteractionType.RESET,
      stackCap: 3,
      durationFrames: 2 * FPS, // 2s window
    });
    const model = new FifoModel(config);
    // Crit at 0s and 1s
    model.step(0, 1.0);
    model.step(1 * FPS, 1.0);

    // At 1s: both crits in window → 2 stacks
    let dist = model.getDistribution();
    expect(dist[2]).toBeCloseTo(1.0);

    // At 4s: crit at 0s expired (4s - 0s > 2s), crit at 1s expired (4s - 1s > 2s)
    // No crit at 4s → 0 stacks
    model.step(4 * FPS, 0.0);
    dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(1.0);
  });

  it('produces non-uniform distribution with varying crit rates', () => {
    const config = makeConfig({
      interactionType: StackInteractionType.RESET,
      stackCap: 3,
      durationFrames: 100 * FPS,
    });
    const model = new FifoModel(config);
    // Frame 1: 100% crit, Frame 2: 0% crit
    model.step(0, 1.0);
    model.step(FPS, 0.0);
    const dist = model.getDistribution();
    // 1 guaranteed crit, 1 guaranteed miss → exactly 1 stack
    expect(dist[1]).toBeCloseTo(1.0);
    expect(sumDist(dist)).toBeCloseTo(1.0);
  });
});

// ── LifecycleModel Tests ─────────────────────────────────────────────────────

describe('LifecycleModel', () => {
  const lifecycleConfig = makeConfig({
    statusId: 'WOLVEN_BLOOD',
    stackCap: 4, // smaller cap for easier testing
    durationFrames: PERMANENT_DURATION * FPS,
    lifecycle: { buffStatusId: 'WOLVEN_BLOOD_MAX', buffDurationFrames: 3 * FPS }, // 3s buff
  });

  it('starts at 0 stacks, no buff', () => {
    const model = new LifecycleModel(lifecycleConfig);
    const dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(1.0);
    expect(model.getBuffProbability()).toBeCloseTo(0);
  });

  it('ramps stacks with 100% crit', () => {
    const model = new LifecycleModel(lifecycleConfig);
    model.step(0, 1.0);
    model.step(FPS, 1.0);
    model.step(2 * FPS, 1.0);
    const dist = model.getDistribution();
    expect(dist[3]).toBeCloseTo(1.0); // 3 crits → 3 stacks
    expect(model.getBuffProbability()).toBeCloseTo(0); // not at cap yet
  });

  it('triggers buff at cap and resets after buff expires', () => {
    const model = new LifecycleModel(lifecycleConfig);
    // Ramp to cap (4 stacks) with 100% crit
    for (let i = 0; i < 4; i++) {
      model.step(i * FPS, 1.0);
    }
    expect(model.getDistribution()[4]).toBeCloseTo(1.0);
    expect(model.getBuffProbability()).toBeCloseTo(1.0);

    // Buff active — frame within buff duration (2s after trigger at 3s = 5s total)
    model.step(5 * FPS, 0.0);
    expect(model.getBuffProbability()).toBeCloseTo(1.0); // still active

    // Buff expires (3s + 3s buff duration = 6s, so at 7s it should have expired)
    // Buff was triggered at frame 3*FPS. Duration is 3*FPS. Expires at 6*FPS.
    model.step(7 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0); // reset to 0
    expect(model.getBuffProbability()).toBeCloseTo(0);
  });

  it('restarts ramping after cycle reset', () => {
    const model = new LifecycleModel(lifecycleConfig);
    // First cycle: ramp to 4
    for (let i = 0; i < 4; i++) model.step(i * FPS, 1.0);
    // Wait for buff to expire
    model.step(10 * FPS, 0.0); // well past 3*FPS + 3*FPS
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);

    // Second cycle: start ramping again
    model.step(11 * FPS, 1.0);
    expect(model.getDistribution()[1]).toBeCloseTo(1.0);
  });

  it('handles probabilistic ramping correctly', () => {
    const model = new LifecycleModel(lifecycleConfig);
    // 50% crit rate over many frames — should see gradual probability shift
    for (let i = 0; i < 20; i++) {
      model.step(i * FPS, 0.5);
    }
    const dist = model.getDistribution();
    expect(sumDist(dist)).toBeCloseTo(1.0, 6);
    // With 50% crit over 20 frames and a 4-stack cap with 3s buff + reset cycle,
    // probability should be spread across multiple stacks and cycle states
    expect(dist[0]).toBeGreaterThan(0);
    expect(model.getBuffProbability()).toBeGreaterThan(0);
  });
});

// ── CritExpectationModel (orchestrator) Tests ────────────────────────────────

describe('CritExpectationModel', () => {
  it('returns base crit rate with no models', () => {
    const model = new CritExpectationModel(0.05);
    const snapshot = model.step(0);
    expect(snapshot.expectedCritRate).toBeCloseTo(0.05);
    expect(snapshot.critSources).toHaveLength(1);
    expect(snapshot.critSources[0].label).toBe('Base');
    expect(snapshot.critSources[0].value).toBeCloseTo(0.05);
  });

  it('feedback model increases E_total over time', () => {
    const model = new CritExpectationModel(0.05);
    // MI Security-like: 5 stacks, 5s duration, +5% crit at 5 stacks
    const miConfig = makeConfig({
      statusId: 'MI_SECURITY',
      label: 'MI Security',
      stackCap: 5,
      durationFrames: 5 * FPS,
      isFeedback: true,
      perStackStats: [{ stat: StatType.ATTACK_BONUS, valuePerStack: 0.05 }],
      thresholdStats: [{ stat: StatType.CRITICAL_RATE, value: 0.05, atStacks: 5 }],
    });
    model.addModel(new SharedTimerModel(miConfig));

    // Process many frames — E should increase as P(5 stacks) grows
    const eValues: number[] = [];
    for (let i = 0; i < 50; i++) {
      const snap = model.step(i * 30); // ~4 per second
      eValues.push(snap.expectedCritRate);
    }

    // E should start at base and increase (feedback loop)
    expect(eValues[0]).toBeCloseTo(0.05, 3);
    // Later frames should have higher E due to MI Security's contribution
    const laterE = eValues[eValues.length - 1];
    expect(laterE).toBeGreaterThan(0.05);
    expect(laterE).toBeLessThanOrEqual(0.10); // base 0.05 + max 0.05 from MI
  });

  it('dependent model does not affect E_total', () => {
    const model = new CritExpectationModel(0.10);
    // Artzy-like: 3 stacks, 30s duration, FIFO, no feedback
    const artzyConfig = makeConfig({
      statusId: 'ARTZY',
      label: 'Artzy',
      stackCap: 3,
      durationFrames: 30 * FPS,
      interactionType: StackInteractionType.RESET,
      isFeedback: false,
      perStackStats: [{ stat: StatType.CRYO_DAMAGE_BONUS, valuePerStack: 0.14 }],
    });
    model.addModel(new FifoModel(artzyConfig));

    // E should stay at base regardless of stacks
    for (let i = 0; i < 20; i++) {
      const snap = model.step(i * FPS);
      expect(snap.expectedCritRate).toBeCloseTo(0.10);
    }
  });

  it('computes expected stat deltas from per-stack bonuses', () => {
    const model = new CritExpectationModel(1.0); // 100% crit for deterministic testing
    const config = makeConfig({
      statusId: 'TEST',
      stackCap: 3,
      durationFrames: 100 * FPS,
      perStackStats: [{ stat: StatType.ATTACK_BONUS, valuePerStack: 0.10 }],
    });
    model.addModel(new SharedTimerModel(config));

    // 4 steps at 100% crit; snapshot-before-advance means 4th snapshot sees 3 stacks
    // → expected ATK% = 3 * 0.10 = 0.30
    model.step(0);
    model.step(FPS);
    model.step(2 * FPS);
    const snap = model.step(3 * FPS);
    expect(snap.expectedStatDeltas[StatType.ATTACK_BONUS]).toBeCloseTo(0.30);
  });

  it('computes expected stat deltas from threshold bonuses', () => {
    const model = new CritExpectationModel(1.0); // 100% crit
    const config = makeConfig({
      statusId: 'TEST',
      stackCap: 3,
      durationFrames: 100 * FPS,
      thresholdStats: [{ stat: StatType.CRITICAL_RATE, value: 0.05, atStacks: 3 }],
      isFeedback: true,
    });
    model.addModel(new SharedTimerModel(config));

    // 4 steps at 100% crit; snapshot-before-advance means 4th snapshot sees 3 stacks
    // → P(3 stacks) = 1.0 → expected crit bonus = 0.05
    model.step(0);
    model.step(FPS);
    model.step(2 * FPS);
    const snap = model.step(3 * FPS);
    // E = base(1.0) + threshold(0.05) = 1.05, clamped to 1.0
    expect(snap.expectedCritRate).toBeCloseTo(1.0);
    expect(snap.expectedStatDeltas[StatType.CRITICAL_RATE]).toBeCloseTo(0.05);
  });

  it('handles combined feedback + dependent models', () => {
    const model = new CritExpectationModel(0.10);

    // Feedback: MI Security-like
    const mi = makeConfig({
      statusId: 'MI',
      label: 'MI',
      stackCap: 5,
      durationFrames: 5 * FPS,
      isFeedback: true,
      thresholdStats: [{ stat: StatType.CRITICAL_RATE, value: 0.05, atStacks: 5 }],
    });
    model.addModel(new SharedTimerModel(mi));

    // Dependent: Artzy-like
    const artzy = makeConfig({
      statusId: 'ARTZY',
      stackCap: 3,
      durationFrames: 30 * FPS,
      interactionType: StackInteractionType.RESET,
      isFeedback: false,
      perStackStats: [{ stat: StatType.CRYO_DAMAGE_BONUS, valuePerStack: 0.14 }],
    });
    model.addModel(new FifoModel(artzy));

    // Run for many frames
    let lastSnap;
    for (let i = 0; i < 100; i++) {
      lastSnap = model.step(i * 30);
    }

    // Both status distributions should be present
    expect(lastSnap!.statusDistributions.has('MI')).toBe(true);
    expect(lastSnap!.statusDistributions.has('ARTZY')).toBe(true);

    // Distributions should sum to 1
    expect(sumDist(lastSnap!.statusDistributions.get('MI')!)).toBeCloseTo(1.0, 6);
    expect(sumDist(lastSnap!.statusDistributions.get('ARTZY')!)).toBeCloseTo(1.0, 6);

    // E should be >= base (MI feedback can only increase it)
    expect(lastSnap!.expectedCritRate).toBeGreaterThanOrEqual(0.10);

    // Expected Cryo DMG bonus should be > 0 (Artzy has some stacks)
    expect(lastSnap!.expectedStatDeltas[StatType.CRYO_DAMAGE_BONUS]).toBeGreaterThan(0);
  });

  it('lifecycle model produces buff uptime', () => {
    const model = new CritExpectationModel(0.50);
    const lsConfig = makeConfig({
      statusId: 'LS',
      label: 'Wolven Blood',
      stackCap: 4,
      durationFrames: PERMANENT_DURATION * FPS,
      lifecycle: { buffStatusId: 'LS_MAX', buffDurationFrames: 5 * FPS },
      perStackStats: [{ stat: StatType.PHYSICAL_DAMAGE_BONUS, valuePerStack: 0.02 }],
      thresholdStats: [{ stat: StatType.HEAT_DAMAGE_BONUS, value: 0.48, atStacks: 4 }],
    });
    model.addModel(new LifecycleModel(lsConfig));

    // Run for many frames — with 50% crit and cap 4, should eventually trigger buff
    let buffSeen = false;
    for (let i = 0; i < 100; i++) {
      const snap = model.step(i * FPS);
      const dist = snap.statusDistributions.get('LS')!;
      expect(sumDist(dist)).toBeCloseTo(1.0, 5);

      // Check that buff probability eventually appears
      if ((snap.expectedStatDeltas[StatType.HEAT_DAMAGE_BONUS] ?? 0) > 0.01) {
        buffSeen = true;
      }
    }
    expect(buffSeen).toBe(true);
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles very small crit rates', () => {
    const model = new CritExpectationModel(0.001);
    const config = makeConfig({
      statusId: 'TEST',
      stackCap: 5,
      durationFrames: 100 * FPS,
    });
    model.addModel(new SharedTimerModel(config));

    for (let i = 0; i < 50; i++) {
      const snap = model.step(i * FPS);
      expect(sumDist(snap.statusDistributions.get('TEST')!)).toBeCloseTo(1.0, 8);
    }
  });

  it('handles crit rate of exactly 1.0', () => {
    const model = new SharedTimerModel(makeConfig({ stackCap: 3, durationFrames: 100 * FPS }));
    for (let i = 0; i < 10; i++) {
      model.step(i * FPS, 1.0);
    }
    const dist = model.getDistribution();
    expect(dist[3]).toBeCloseTo(1.0);
    expect(sumDist(dist)).toBeCloseTo(1.0);
  });

  it('handles crit rate of exactly 0.0', () => {
    const model = new SharedTimerModel(makeConfig());
    for (let i = 0; i < 10; i++) {
      model.step(i * FPS, 0.0);
    }
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
  });

  it('FIFO model with single frame in window', () => {
    const config = makeConfig({
      interactionType: StackInteractionType.RESET,
      stackCap: 3,
      durationFrames: 1, // expires almost immediately
    });
    const model = new FifoModel(config);
    model.step(0, 0.5);
    // Only 1 frame in window → P(0) = 0.5, P(1) = 0.5
    const dist = model.getDistribution();
    expect(dist[0]).toBeCloseTo(0.5);
    expect(dist[1]).toBeCloseTo(0.5);
  });
});
