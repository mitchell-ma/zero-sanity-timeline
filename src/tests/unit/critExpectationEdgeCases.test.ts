/**
 * Edge case and integration tests for the crit expectation model.
 * Tests impossible states, boundary conditions, and cross-model interactions.
 */
import {
  CritExpectationModel,
  SharedTimerModel,
  FifoModel,
  LifecycleModel,
  getFrameExpectation,
  getStatusExpectation,
} from '../../controller/calculation/critExpectationModel';
import type { CritStatusConfig, CritFrameSnapshot } from '../../controller/calculation/critExpectationModel';
import { StackInteractionType, CritMode, PERMANENT_DURATION } from '../../consts/enums';
import { StatType } from '../../model/enums/stats';
import { FPS } from '../../utils/timeline';

function makeConfig(overrides: Partial<CritStatusConfig> = {}): CritStatusConfig {
  return {
    statusId: 'TEST_STATUS',
    label: 'Test Status',
    stackCap: 5,
    durationFrames: 5 * FPS,
    interactionType: StackInteractionType.NONE,
    isFeedback: false,
    perStackStats: [],
    thresholdStats: [],
    ...overrides,
  };
}

function sumDist(dist: number[]): number {
  return dist.reduce((a, b) => a + b, 0);
}

// ── Impossible state tests ───────────────────────────────────────────────────

describe('Impossible states', () => {
  it('P[16] is 0 for frames 0 through 15 (Lupine Scarlet cap=16)', () => {
    const config = makeConfig({
      statusId: 'LS',
      stackCap: 16,
      durationFrames: PERMANENT_DURATION * FPS,
      lifecycle: { buffStatusId: 'LS_MAX', buffDurationFrames: 20 * FPS },
    });
    const model = new LifecycleModel(config);

    // Even at 100% crit rate, you can only gain 1 stack per frame
    // So P[16] is impossible until frame 16 (0-indexed: after 16 steps)
    for (let i = 0; i < 15; i++) {
      model.step(i * FPS, 1.0);
      const dist = model.getDistribution();
      // At frame i, maximum possible stacks = i+1 (since we gain 1 per crit)
      // So P[16] must be 0 until we've had 16 frames
      expect(dist[16]).toBeCloseTo(0, 10);
    }

    // Frame 16: P[16] becomes possible
    model.step(15 * FPS, 1.0);
    const dist = model.getDistribution();
    expect(dist[16]).toBeCloseTo(1.0);
  });

  it('P[cap] is 0 on frame 0 for any model (impossible to start at cap)', () => {
    const sharedTimer = new SharedTimerModel(makeConfig({ stackCap: 5 }));
    const fifo = new FifoModel(makeConfig({ stackCap: 3, interactionType: StackInteractionType.RESET }));
    const lifecycle = new LifecycleModel(makeConfig({
      stackCap: 4,
      durationFrames: PERMANENT_DURATION * FPS,
      lifecycle: { buffStatusId: 'BUFF', buffDurationFrames: 10 * FPS },
    }));

    // Before any steps, all models have P[0] = 1.0
    expect(sharedTimer.getDistribution()[5]).toBeCloseTo(0);
    expect(fifo.getDistribution()[3]).toBeCloseTo(0);
    expect(lifecycle.getDistribution()[4]).toBeCloseTo(0);
  });

  it('CritMode.ALWAYS (100% crit) reaches cap in exactly cap frames', () => {
    const cap = 5;
    const model = new SharedTimerModel(makeConfig({ stackCap: cap, durationFrames: 100 * FPS }));

    for (let i = 0; i < cap; i++) {
      model.step(i * FPS, 1.0);
      const dist = model.getDistribution();
      // After i+1 frames at 100% crit, stacks = i+1
      expect(dist[i + 1]).toBeCloseTo(1.0);
      // Stack 0 is 0 (guaranteed crit moved us up)
      expect(dist[0]).toBeCloseTo(0, 10);
    }
  });

  it('CritMode.NEVER (0% crit) stays at 0 stacks forever', () => {
    const models = [
      new SharedTimerModel(makeConfig({ stackCap: 5 })),
      new FifoModel(makeConfig({ stackCap: 3, interactionType: StackInteractionType.RESET })),
      new LifecycleModel(makeConfig({
        stackCap: 4,
        durationFrames: PERMANENT_DURATION * FPS,
        lifecycle: { buffStatusId: 'BUFF', buffDurationFrames: 10 * FPS },
      })),
    ];

    for (const model of models) {
      for (let i = 0; i < 50; i++) {
        model.step(i * FPS, 0.0);
      }
      const dist = model.getDistribution();
      expect(dist[0]).toBeCloseTo(1.0);
      expect(sumDist(dist)).toBeCloseTo(1.0);
    }
  });

  it('P[s] where s > frames_processed is always 0', () => {
    const model = new SharedTimerModel(makeConfig({ stackCap: 10, durationFrames: 100 * FPS }));

    // After 3 frames, stacks 4+ are impossible regardless of crit rate
    for (let i = 0; i < 3; i++) {
      model.step(i * FPS, 0.5);
    }
    const dist = model.getDistribution();
    for (let s = 4; s <= 10; s++) {
      expect(dist[s]).toBeCloseTo(0, 10);
    }
  });
});

// ── Lifecycle cycle tests ────────────────────────────────────────────────────

describe('Lifecycle cycle edge cases', () => {
  it('buff cannot trigger before reaching cap stacks', () => {
    const config = makeConfig({
      stackCap: 4,
      durationFrames: PERMANENT_DURATION * FPS,
      lifecycle: { buffStatusId: 'BUFF', buffDurationFrames: 5 * FPS },
    });
    const model = new LifecycleModel(config);

    // 3 frames at 100% crit → 3 stacks, NOT at cap (4)
    for (let i = 0; i < 3; i++) {
      model.step(i * FPS, 1.0);
    }
    expect(model.getBuffProbability()).toBeCloseTo(0);
    expect(model.getDistribution()[3]).toBeCloseTo(1.0);
  });

  it('multiple cycles: second ramp starts from 0 after reset', () => {
    const config = makeConfig({
      stackCap: 2,
      durationFrames: PERMANENT_DURATION * FPS,
      lifecycle: { buffStatusId: 'BUFF', buffDurationFrames: 2 * FPS },
    });
    const model = new LifecycleModel(config);

    // First cycle: ramp to 2, buff triggers
    model.step(0, 1.0);
    model.step(1 * FPS, 1.0);
    expect(model.getDistribution()[2]).toBeCloseTo(1.0);
    expect(model.getBuffProbability()).toBeCloseTo(1.0);

    // Wait for buff to expire (buff was triggered at frame 1*FPS, duration = 2*FPS)
    model.step(4 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
    expect(model.getBuffProbability()).toBeCloseTo(0);

    // Second cycle: start from 0
    model.step(5 * FPS, 1.0);
    expect(model.getDistribution()[1]).toBeCloseTo(1.0);
    expect(model.getBuffProbability()).toBeCloseTo(0);

    model.step(6 * FPS, 1.0);
    expect(model.getDistribution()[2]).toBeCloseTo(1.0);
    expect(model.getBuffProbability()).toBeCloseTo(1.0);
  });
});

// ── FIFO / Poisson binomial edge cases ───────────────────────────────────────

describe('FIFO edge cases', () => {
  it('all stacks expire simultaneously when window passes', () => {
    const config = makeConfig({
      stackCap: 3,
      interactionType: StackInteractionType.RESET,
      durationFrames: 2 * FPS,
    });
    const model = new FifoModel(config);

    // 3 crits in rapid succession
    model.step(0, 1.0);
    model.step(10, 1.0);   // 10 frames later
    model.step(20, 1.0);   // 20 frames later

    const dist = model.getDistribution();
    expect(dist[3]).toBeCloseTo(1.0);

    // Jump far ahead — all should expire
    model.step(10 * FPS, 0.0);
    const dist2 = model.getDistribution();
    expect(dist2[0]).toBeCloseTo(1.0);
  });

  it('stacks with different probabilities produce correct Poisson binomial', () => {
    const config = makeConfig({
      stackCap: 10,
      interactionType: StackInteractionType.RESET,
      durationFrames: 100 * FPS,
    });
    const model = new FifoModel(config);

    // Frame 1: p=1.0 (guaranteed crit)
    // Frame 2: p=0.0 (guaranteed miss)
    // Frame 3: p=0.5 (50% chance)
    model.step(0, 1.0);
    model.step(FPS, 0.0);
    model.step(2 * FPS, 0.5);

    const dist = model.getDistribution();
    // 1 guaranteed + 0 guaranteed + 0.5 chance = P(1) = 0.5, P(2) = 0.5
    expect(dist[1]).toBeCloseTo(0.5);
    expect(dist[2]).toBeCloseTo(0.5);
    expect(dist[0]).toBeCloseTo(0);
    expect(dist[3]).toBeCloseTo(0);
  });
});

// ── Shared timer expiry edge cases ───────────────────────────────────────────

describe('SharedTimer expiry edge cases', () => {
  it('stacks gained just before expiry window are retained', () => {
    const durationFrames = 5 * FPS;
    const model = new SharedTimerModel(makeConfig({ durationFrames }));

    // Crit at T=4.9s (just before 5s window from T=0 would expire)
    model.step(0, 1.0);   // stack 1 at T=0
    model.step(Math.round(4.9 * FPS), 1.0);  // stack 2, refreshes timer

    // At T=6s: 1.1s since last crit (4.9s), well within 5s
    model.step(6 * FPS, 0.0);
    expect(model.getDistribution()[2]).toBeCloseTo(1.0);

    // At T=10s: 5.1s since last crit at 4.9s, should expire
    model.step(10 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
  });

  it('MI Security 5s duration: stacks expire after 5s+ gap between damage frames', () => {
    // Exact MI Security config: 5 stacks, 5s duration
    const model = new SharedTimerModel(makeConfig({ stackCap: 5, durationFrames: 5 * FPS }));

    // Build up 3 stacks with rapid crits
    model.step(0, 1.0);
    model.step(30, 1.0);
    model.step(60, 1.0);
    expect(model.getDistribution()[3]).toBeCloseTo(1.0);

    // 6s gap — no damage frames for 6 seconds. Last crit was at frame 60.
    // 6*FPS + 60 = 780 frames. 780 - 60 = 720 frames = 6s > 5s duration → expired
    model.step(6 * FPS + 60, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
  });

  it('MI Security 5s duration: stacks survive with 4s gap then expire with 6s gap', () => {
    const model = new SharedTimerModel(makeConfig({ stackCap: 5, durationFrames: 5 * FPS }));

    // Crit at T=0
    model.step(0, 1.0);
    expect(model.getDistribution()[1]).toBeCloseTo(1.0);

    // 4s gap — still within 5s window
    model.step(4 * FPS, 0.0);
    expect(model.getDistribution()[1]).toBeCloseTo(1.0);

    // Another 4s gap (total 8s since last crit at T=0) → expired
    model.step(8 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
  });

  it('probabilistic stacks partially expire across a gap', () => {
    // 50% crit rate, 3s duration. After a 4s gap, states where last crit was >3s ago expire.
    const model = new SharedTimerModel(makeConfig({ stackCap: 5, durationFrames: 3 * FPS }));

    // Two frames close together: T=0 and T=0.5s
    model.step(0, 0.5);
    model.step(Math.round(0.5 * FPS), 0.5);

    // Now jump to T=4s (gap of 3.5s from T=0.5s, 4s from T=0)
    // States where last crit was at T=0 → 4s > 3s → expire
    // States where last crit was at T=0.5s → 3.5s > 3s → also expire
    // So ALL stacked states should expire
    model.step(4 * FPS, 0.0);
    expect(model.getDistribution()[0]).toBeCloseTo(1.0);
    expect(sumDist(model.getDistribution())).toBeCloseTo(1.0);
  });

  it('probability sum remains 1.0 after many expiry/refresh cycles', () => {
    const model = new SharedTimerModel(makeConfig({ durationFrames: 2 * FPS }));

    // Alternate between high and low crit rates with gaps
    for (let i = 0; i < 200; i++) {
      const eCrit = i % 10 < 5 ? 0.8 : 0.05;
      model.step(i * 30, eCrit);
    }
    expect(sumDist(model.getDistribution())).toBeCloseTo(1.0, 6);
  });
});

// ── Orchestrator integration tests ───────────────────────────────────────────

describe('CritExpectationModel integration', () => {
  it('MI Security feedback converges: E(T) stabilizes after many frames', () => {
    const model = new CritExpectationModel(0.05);
    const mi = makeConfig({
      statusId: 'MI',
      label: 'MI Security',
      stackCap: 5,
      durationFrames: 5 * FPS,
      isFeedback: true,
      perStackStats: [{ stat: StatType.ATTACK_BONUS, valuePerStack: 0.05 }],
      thresholdStats: [{ stat: StatType.CRITICAL_RATE, value: 0.05, atStacks: 5 }],
    });
    model.addModel(new SharedTimerModel(mi));

    const eValues: number[] = [];
    for (let i = 0; i < 200; i++) {
      const snap = model.step(i * 30);
      eValues.push(snap.expectedCritRate);
    }

    // E should converge — later values should be roughly stable
    const last10 = eValues.slice(-10);
    const range = Math.max(...last10) - Math.min(...last10);
    expect(range).toBeLessThan(0.005); // converged within 0.5%
  });

  it('snapshot contains all registered status distributions', () => {
    const model = new CritExpectationModel(0.10);

    model.addModel(new SharedTimerModel(makeConfig({
      statusId: 'STATUS_A',
      stackCap: 3,
      durationFrames: 10 * FPS,
    })));
    model.addModel(new FifoModel(makeConfig({
      statusId: 'STATUS_B',
      stackCap: 2,
      interactionType: StackInteractionType.RESET,
      durationFrames: 20 * FPS,
    })));
    model.addModel(new LifecycleModel(makeConfig({
      statusId: 'STATUS_C',
      stackCap: 4,
      durationFrames: PERMANENT_DURATION * FPS,
      lifecycle: { buffStatusId: 'C_MAX', buffDurationFrames: 10 * FPS },
    })));

    const snap = model.step(0);
    expect(snap.statusDistributions.has('STATUS_A')).toBe(true);
    expect(snap.statusDistributions.has('STATUS_B')).toBe(true);
    expect(snap.statusDistributions.has('STATUS_C')).toBe(true);

    // Each distribution should sum to 1
    snap.statusDistributions.forEach((dist) => {
      expect(sumDist(dist)).toBeCloseTo(1.0, 8);
    });
  });

  it('E(T) is bounded between base and base + max feedback bonus', () => {
    const baseCrit = 0.08;
    const feedbackBonus = 0.07;
    const model = new CritExpectationModel(baseCrit);
    model.addModel(new SharedTimerModel(makeConfig({
      statusId: 'FB',
      stackCap: 3,
      durationFrames: 100 * FPS,
      isFeedback: true,
      thresholdStats: [{ stat: StatType.CRITICAL_RATE, value: feedbackBonus, atStacks: 3 }],
    })));

    for (let i = 0; i < 100; i++) {
      const snap = model.step(i * FPS);
      expect(snap.expectedCritRate).toBeGreaterThanOrEqual(baseCrit - 1e-10);
      expect(snap.expectedCritRate).toBeLessThanOrEqual(baseCrit + feedbackBonus + 1e-10);
    }
  });

  it('expected stat deltas are non-negative for positive per-stack bonuses', () => {
    const model = new CritExpectationModel(0.20);
    model.addModel(new SharedTimerModel(makeConfig({
      statusId: 'BUFF',
      stackCap: 5,
      durationFrames: 10 * FPS,
      perStackStats: [
        { stat: StatType.ATTACK_BONUS, valuePerStack: 0.05 },
        { stat: StatType.HEAT_DAMAGE_BONUS, valuePerStack: 0.02 },
      ],
    })));

    for (let i = 0; i < 50; i++) {
      const snap = model.step(i * 30);
      expect(snap.expectedStatDeltas[StatType.ATTACK_BONUS] ?? 0).toBeGreaterThanOrEqual(-1e-10);
      expect(snap.expectedStatDeltas[StatType.HEAT_DAMAGE_BONUS] ?? 0).toBeGreaterThanOrEqual(-1e-10);
    }
  });
});

// ── getFrameExpectation / getStatusExpectation ───────────────────────────────

describe('getFrameExpectation', () => {
  it('NEVER returns 0', () => {
    expect(getFrameExpectation(CritMode.NEVER)).toBe(0);
  });

  it('ALWAYS returns 1', () => {
    expect(getFrameExpectation(CritMode.ALWAYS)).toBe(1);
  });

  it('RANDOM returns 1 when frameCrit is true', () => {
    expect(getFrameExpectation(CritMode.RANDOM, undefined, true)).toBe(1);
  });

  it('RANDOM returns 0 when frameCrit is false', () => {
    expect(getFrameExpectation(CritMode.RANDOM, undefined, false)).toBe(0);
  });

  it('EXPECTED returns snapshot expectedCritRate', () => {
    const snap: CritFrameSnapshot = { expectedCritRate: 0.12, critSources: [], statusDistributions: new Map(), expectedStatDeltas: {}, fullStatValues: {}, statContributions: [] };
    expect(getFrameExpectation(CritMode.EXPECTED, snap)).toBeCloseTo(0.12);
  });

  it('EXPECTED returns 0 without snapshot', () => {
    expect(getFrameExpectation(CritMode.EXPECTED)).toBe(0);
  });
});

describe('getStatusExpectation', () => {
  const snap: CritFrameSnapshot = {
    expectedCritRate: 0.10,
    critSources: [],
    statusDistributions: new Map([
      ['MI', [0.3, 0.2, 0.15, 0.15, 0.1, 0.1]],
      ['EMPTY', [1.0]],
    ]),
    expectedStatDeltas: {},
    fullStatValues: {},
    statContributions: [],
  };

  it('NEVER returns 0', () => {
    expect(getStatusExpectation(CritMode.NEVER, snap, 'MI')).toBe(0);
  });

  it('ALWAYS returns 1', () => {
    expect(getStatusExpectation(CritMode.ALWAYS, snap, 'MI')).toBe(1);
  });

  it('EXPECTED returns 1 - P[0] for status with stacks', () => {
    expect(getStatusExpectation(CritMode.EXPECTED, snap, 'MI')).toBeCloseTo(0.7);
  });

  it('EXPECTED returns 0 for status at 0 stacks', () => {
    expect(getStatusExpectation(CritMode.EXPECTED, snap, 'EMPTY')).toBeCloseTo(0);
  });

  it('EXPECTED returns 1 for unknown status', () => {
    expect(getStatusExpectation(CritMode.EXPECTED, snap, 'UNKNOWN')).toBe(1);
  });

  it('RANDOM returns binary from frameCrit', () => {
    expect(getStatusExpectation(CritMode.RANDOM, snap, 'MI', true)).toBe(1);
    expect(getStatusExpectation(CritMode.RANDOM, snap, 'MI', false)).toBe(0);
  });
});

// ── EXPECTED mode clamping between NEVER and ALWAYS ──────────────────────────

describe('EXPECTED stat deltas clamped between NEVER and ALWAYS', () => {
  function runModel(baseCrit: number, frames: number) {
    const model = new CritExpectationModel(baseCrit);
    const config = makeConfig({
      statusId: 'MI',
      label: 'MI Security',
      stackCap: 5,
      durationFrames: 5 * FPS,
      isFeedback: true,
      perStackStats: [{ stat: StatType.ATTACK_BONUS, valuePerStack: 0.05 }],
      thresholdStats: [{ stat: StatType.CRITICAL_RATE, value: 0.05, atStacks: 5 }],
    });
    model.addModel(new SharedTimerModel(config));

    let lastSnap: CritFrameSnapshot | undefined;
    for (let i = 0; i < frames; i++) {
      lastSnap = model.step(i * 30);
    }
    return lastSnap!;
  }

  it('expectedStatDeltas are between 0 (NEVER) and full (ALWAYS) values', () => {
    const snap = runModel(0.10, 100);

    const expectedAtk = snap.expectedStatDeltas[StatType.ATTACK_BONUS] ?? 0;
    const fullAtk = snap.fullStatValues[StatType.ATTACK_BONUS] ?? 0;
    expect(expectedAtk).toBeGreaterThanOrEqual(0);
    expect(expectedAtk).toBeLessThanOrEqual(fullAtk + 1e-10);

    const expectedCrit = snap.expectedStatDeltas[StatType.CRITICAL_RATE] ?? 0;
    const fullCrit = snap.fullStatValues[StatType.CRITICAL_RATE] ?? 0;
    expect(expectedCrit).toBeGreaterThanOrEqual(0);
    expect(expectedCrit).toBeLessThanOrEqual(fullCrit + 1e-10);
  });

  it('crit multiplier: NEVER ≤ EXPECTED ≤ ALWAYS', () => {
    const critDamage = 0.5;
    const snap = runModel(0.15, 100);

    const neverCrit = 1 + critDamage * getFrameExpectation(CritMode.NEVER);
    const expectedCrit = 1 + critDamage * getFrameExpectation(CritMode.EXPECTED, snap);
    const alwaysCrit = 1 + critDamage * getFrameExpectation(CritMode.ALWAYS);

    expect(neverCrit).toBeCloseTo(1.0);
    expect(alwaysCrit).toBeCloseTo(1.5);
    expect(expectedCrit).toBeGreaterThanOrEqual(neverCrit - 1e-10);
    expect(expectedCrit).toBeLessThanOrEqual(alwaysCrit + 1e-10);
  });

  it('EXPECTED approaches ALWAYS as base crit rate → 1.0', () => {
    const snapLow = runModel(0.05, 100);
    const snapHigh = runModel(0.95, 100);

    const expectedAtkLow = snapLow.expectedStatDeltas[StatType.ATTACK_BONUS] ?? 0;
    const expectedAtkHigh = snapHigh.expectedStatDeltas[StatType.ATTACK_BONUS] ?? 0;
    const fullAtk = snapHigh.fullStatValues[StatType.ATTACK_BONUS] ?? 0;

    expect(expectedAtkHigh).toBeGreaterThan(expectedAtkLow);
    expect(expectedAtkHigh).toBeCloseTo(fullAtk, 1);
  });

  it('fullStatValues matches max stacks × bonus', () => {
    const snap = runModel(0.10, 1);
    expect(snap.fullStatValues[StatType.ATTACK_BONUS]).toBeCloseTo(0.25);
    expect(snap.fullStatValues[StatType.CRITICAL_RATE]).toBeCloseTo(0.05);
  });
});
