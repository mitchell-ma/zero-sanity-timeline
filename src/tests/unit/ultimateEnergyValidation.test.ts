/**
 * Ultimate Energy Validation Tests
 *
 * Verifies that ultimate energy from battle skill gauge gains
 * is correctly accounted for when validating ultimate placement.
 */

import { computeUltimateEnergyGraph, UltEnergyEvent } from '../../controller/timeline/ultimateEnergyTimeline';
import { NounType } from '../../dsl/semantics';
import { preConsumptionValue, validateResources, hasEnableClauseAtFrame, checkVariantAvailability, validateEnhanced, validateDisabledVariants } from '../../controller/timeline/eventValidator';
import { applyGainEfficiency, collectNoGainWindowsForEvent, UltimateEnergyController, RawGaugeGainEvent } from '../../controller/timeline/ultimateEnergyController';
import { SkillPointController } from '../../controller/slot/skillPointController';
import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { EnhancementType, SegmentType } from '../../consts/enums';

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


describe('Ultimate Energy Validation', () => {
  const MAX_ENERGY = 300;

  test('Battle skill gauge gain at frame X is visible to ultimate at frame X+1', () => {
    const timeline: UltEnergyEvent[] = [
      { frame: 100, type: 'gain', amount: 15 },
      { frame: 101, type: 'consume', amount: MAX_ENERGY },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, 290, 0);
    const val = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 101);
    expect(val).toBeGreaterThanOrEqual(MAX_ENERGY);
  });

  test('Battle skill gauge gain at same frame as ultimate is processed first', () => {
    // Timeline sorted: gains before consumes at same frame
    const timeline: UltEnergyEvent[] = [
      { frame: 100, type: 'gain', amount: 15 },
      { frame: 100, type: 'consume', amount: MAX_ENERGY },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, 290, 0);
    const val = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 100);
    expect(val).toBeGreaterThanOrEqual(MAX_ENERGY);
  });

  test('Ultimate placed immediately after battle skill end has sufficient energy', () => {
    const battleFirstHitFrame = 24;
    const battleEndFrame = 132;

    const timeline: UltEnergyEvent[] = [
      { frame: battleFirstHitFrame, type: 'gain', amount: 15 },
      { frame: battleEndFrame, type: 'consume', amount: MAX_ENERGY },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, 290, 0);
    const val = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, battleEndFrame);
    expect(val).toBeGreaterThanOrEqual(MAX_ENERGY);
  });

  test('Multiple gauge gains accumulate before ultimate validation', () => {
    const timeline: UltEnergyEvent[] = [
      { frame: 50, type: 'gain', amount: 25 },
      { frame: 150, type: 'gain', amount: 25 },
      { frame: 200, type: 'consume', amount: MAX_ENERGY },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, 260, 0);
    const val = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 200);
    expect(val).toBeGreaterThanOrEqual(MAX_ENERGY);
  });

  test('Insufficient energy correctly detected', () => {
    const timeline: UltEnergyEvent[] = [
      { frame: 50, type: 'gain', amount: 10 },
      { frame: 200, type: 'consume', amount: MAX_ENERGY },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, 280, 0);
    const val = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 200);
    expect(val).toBeLessThan(MAX_ENERGY);
  });

  test('Passive regen fills gap to max before ultimate', () => {
    const regenPerFrame = 0.5;
    const timeline: UltEnergyEvent[] = [
      { frame: 100, type: 'consume', amount: MAX_ENERGY },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, 290, regenPerFrame);
    const val = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 100);
    expect(val).toBeGreaterThanOrEqual(MAX_ENERGY);
  });

  test('Gauge gain during ACTIVE phase is suppressed (no energy gain)', () => {
    // Ultimate consumes at frame 0, no gains during active (filtered by no-gain windows)
    const timeline: UltEnergyEvent[] = [
      { frame: 0, type: 'consume', amount: MAX_ENERGY },
      { frame: 2000, type: 'gain', amount: 50 },
    ];
    const result = computeUltimateEnergyGraph(timeline, MAX_ENERGY, MAX_ENERGY, 0);

    const mid = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 1000);
    expect(mid).toBe(0);

    const post = preConsumptionValue({ points: result.points, min: 0, max: MAX_ENERGY }, 2000);
    expect(post).toBeGreaterThanOrEqual(50);
  });

  test('E2E: empowered battle skill frame-level gaugeGain at same frame as ultimate consume', () => {
    // Simulate: energy at 290, empowered battle skill has gaugeGain=15 on its last hit at frame 500
    // Ultimate is placed at exactly frame 500
    const SLOT_ID = 'slot-0';
    const lastHitFrame = 500;

    // Use UltimateEnergyController + SkillPointController for gauge gain collection
    const ueController = new UltimateEnergyController();
    const spController = new SkillPointController();
    spController.setUltimateEnergyController(ueController);
    ueController.configureSlot(SLOT_ID, { max: MAX_ENERGY, startValue: 290, chargePerFrame: 0, efficiency: 0 });

    // Battle skill SP cost
    spController.addCost('battle-1', 400, 100, SLOT_ID, lastHitFrame);

    // Frame-level gaugeGain from the battle skill
    ueController.addGaugeGain(lastHitFrame, SLOT_ID, 15, 0);

    // Ultimate consume
    ueController.addConsume(lastHitFrame, SLOT_ID);

    // Ultimate no-gain window (fallback: event duration + 1800 frames)
    ueController.addNoGainWindow(lastHitFrame + 249, lastHitFrame + 249 + 1800, SLOT_ID);

    spController.finalize([]);
    ueController.finalize(spController.getBattleSkillGainFrames());

    const graph = ueController.getGraph(SLOT_ID)!;
    const val = preConsumptionValue({ points: graph.points, min: 0, max: MAX_ENERGY }, lastHitFrame);
    expect(val).toBeGreaterThanOrEqual(MAX_ENERGY);
  });

  test('E2E: gauge gain at exact start of no-gain window is NOT filtered out', () => {
    // Bug repro: battle skill gaugeGain at frame 500, ultimate starts at frame 500.
    // The ultimate's Animation segment has IGNORE ULTIMATE_ENERGY, creating a no-gain window
    // starting at frame 500. The gauge gain at frame 500 should NOT be filtered because
    // it happens at the boundary (exclusive start).
    const SLOT_ID = 'slot-0';
    const sharedFrame = 500;

    const noGainWindows = [{ start: sharedFrame, end: sharedFrame + 249 }]; // Animation segment
    const gaugeEvents: RawGaugeGainEvent[] = [
      { frame: sharedFrame, sourceSlotId: SLOT_ID, selfGain: 15, teamGain: 0 },
    ];

    const gains = applyGainEfficiency(gaugeEvents, SLOT_ID, 0, noGainWindows);
    expect(gains.length).toBe(1);
    expect(gains[0].amount).toBe(15);
  });

  test('E2E: gauge gain inside no-gain window IS filtered out', () => {
    const SLOT_ID = 'slot-0';
    const noGainWindows = [{ start: 500, end: 749 }];
    const gaugeEvents: RawGaugeGainEvent[] = [
      { frame: 600, sourceSlotId: SLOT_ID, selfGain: 15, teamGain: 0 },
    ];

    const gains = applyGainEfficiency(gaugeEvents, SLOT_ID, 0, noGainWindows);
    expect(gains.length).toBe(0);
  });

  test('E2E: validateResources shows no warning when energy is sufficient at ult frame', () => {
    const SLOT_ID = 'slot-0';
    const lastHitFrame = 500;

    // Use UltimateEnergyController + SkillPointController
    const ueController = new UltimateEnergyController();
    const spController = new SkillPointController();
    spController.setUltimateEnergyController(ueController);
    ueController.configureSlot(SLOT_ID, { max: MAX_ENERGY, startValue: 290, chargePerFrame: 0, efficiency: 0 });

    // Battle skill SP cost + frame-level gaugeGain
    spController.addCost('battle-1', 400, 100, SLOT_ID, lastHitFrame);
    ueController.addGaugeGain(lastHitFrame, SLOT_ID, 15, 0);

    // Ultimate consume + no-gain window
    ueController.addConsume(lastHitFrame, SLOT_ID);
    ueController.addNoGainWindow(lastHitFrame + 249, lastHitFrame + 249 + 1800, SLOT_ID);

    spController.finalize([]);
    ueController.finalize(spController.getBattleSkillGainFrames());

    const graph = ueController.getGraph(SLOT_ID)!;
    const resourceGraphs = new Map();
    resourceGraphs.set(`${SLOT_ID}-ultimate`, { points: graph.points, min: 0, max: MAX_ENERGY });

    const ultEvent = {
      uid: 'ult-1',
      name: 'TWILIGHT',
      ownerId: SLOT_ID,
      columnId: NounType.ULTIMATE,
      startFrame: lastHitFrame,
      segments: [{ properties: { duration: 249 } }],
    } as TimelineEvent;

    // Validate — should NOT produce a warning for the ultimate
    const warnings = validateResources([ultEvent], resourceGraphs, [{ slotId: SLOT_ID, operator: null }]);
    expect(warnings.has('ult-1')).toBe(false);
  });
});

describe('preConsumptionValue — MAX-at-frame logic', () => {
  const graph = (pts: { frame: number; value: number }[]) =>
    ({ points: pts, min: 0, max: 300 } as import('../../app/useResourceGraphs').ResourceGraphData);

  test('returns max value when multiple points exist at same frame (gain + consume)', () => {
    // Graph: at frame 100 → pre-gain 290, post-gain 300, post-consume 0
    const g = graph([
      { frame: 0, value: 290 },
      { frame: 100, value: 290 },  // pre-gain regen point
      { frame: 100, value: 300 },  // post-gain
      { frame: 100, value: 0 },    // post-consume
    ]);
    expect(preConsumptionValue(g, 100)).toBe(300);
  });

  test('returns max value even if post-consume point comes last', () => {
    const g = graph([
      { frame: 0, value: 0 },
      { frame: 50, value: 300 },  // post-gain
      { frame: 50, value: 0 },    // post-consume
    ]);
    expect(preConsumptionValue(g, 50)).toBe(300);
  });

  test('interpolates between points when hover is between frames', () => {
    const g = graph([
      { frame: 0, value: 0 },
      { frame: 100, value: 100 },
    ]);
    expect(preConsumptionValue(g, 50)).toBe(50);
  });

  test('returns value at frame when only one point exists', () => {
    const g = graph([
      { frame: 0, value: 200 },
      { frame: 100, value: 300 },
    ]);
    expect(preConsumptionValue(g, 100)).toBe(300);
  });

  test('returns last value before frame when no point at exact frame', () => {
    const g = graph([
      { frame: 0, value: 100 },
      { frame: 200, value: 300 },
    ]);
    // At frame 150: interpolate between (0,100) and (200,300) → 100 + 150/200 * 200 = 250
    expect(preConsumptionValue(g, 150)).toBe(250);
  });

  test('hover and validation see the same value at a gain+consume frame', () => {
    // Simulate the exact scenario: energy at 290, gain 15 at frame 500, consume 300 at frame 500
    const timeline: UltEnergyEvent[] = [
      { frame: 500, type: 'gain', amount: 15 },
      { frame: 500, type: 'consume', amount: 300 },
    ];
    const result = computeUltimateEnergyGraph(timeline, 300, 290, 0);
    const g = graph(result.points);

    // Both validation (preConsumptionValue) and hover (MAX-at-frame) should see 300
    const val = preConsumptionValue(g, 500);
    expect(val).toBe(300);
  });
});

// ── Helper to build minimal TimelineEvents ─────────────────────────────────
function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; ownerId: string; columnId: string; startFrame: number }): TimelineEvent {
  return {
    id: overrides.name ?? '',
    name: '',
    segments: [{ properties: { duration: 0 } }],
    ...overrides,
  } as TimelineEvent;
}

// ── Helper to convert raw JSON segments to EventSegmentData ─────────────────
const FPS = 120;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const twilightSkill = require('../../model/game-data/operators/laevatain/skills/ultimate-twilight.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawSegmentsToEventSegments(rawSegments: any[]): EventSegmentData[] {
  return rawSegments.map((seg) => ({
    properties: {
      ...seg.properties,
      duration: Math.round((seg.properties.duration?.value?.value ?? 0) * FPS),
    },
    ...(seg.clause ? { clause: seg.clause } : {}),
  }));
}
const twilightSegments = rawSegmentsToEventSegments(twilightSkill.segments);

// ── hasEffectClauseAtFrame / hasEnableClauseAtFrame ────────────────────────
// Uses real TWILIGHT segments from laevatain-skills.json
describe('hasEnableClauseAtFrame', () => {
  const SLOT = 'slot-0';

  function ultWithSegments(startFrame: number, segments: EventSegmentData[]): TimelineEvent {
    return makeEvent({
      uid: 'ult-1',
      ownerId: SLOT,
      columnId: NounType.ULTIMATE,
      startFrame,
      segments,
    });
  }

  test('returns true when frame falls within a segment with ENABLE clause', () => {
    const ev = ultWithSegments(0, twilightSegments);
    // All three pre-cooldown segments (Animation, Stasis, Active) have ENABLE ENHANCED BATK
    expect(hasEnableClauseAtFrame([ev], SLOT, 'BATK', 100)).toBe(true);
    expect(hasEnableClauseAtFrame([ev], SLOT, 'BATK', 500)).toBe(true);
  });

  test('returns false after ultimate ends (past all segments)', () => {
    const ev = ultWithSegments(0, twilightSegments);
    const totalDuration = twilightSegments.reduce((s, seg) => s + seg.properties.duration, 0);
    expect(hasEnableClauseAtFrame([ev], SLOT, 'BATK', totalDuration + 100)).toBe(false);
  });

  test('returns false before ultimate starts', () => {
    const ev = ultWithSegments(1000, twilightSegments);
    expect(hasEnableClauseAtFrame([ev], SLOT, 'BATK', 500)).toBe(false);
  });

  test('returns false for wrong skill object type', () => {
    const ev = ultWithSegments(0, twilightSegments);
    // ENABLE ENHANCED BATK/BATTLE_SKILL doesn't match COMBO_SKILL
    expect(hasEnableClauseAtFrame([ev], SLOT, 'COMBO_SKILL', 500)).toBe(false);
  });

  test('returns false for different owner', () => {
    const ev = ultWithSegments(0, twilightSegments);
    expect(hasEnableClauseAtFrame([ev], 'slot-1', 'BATK', 500)).toBe(false);
  });

  test('returns false when event has no segments', () => {
    const ev = makeEvent({ uid: 'ult-1', ownerId: SLOT, columnId: NounType.ULTIMATE, startFrame: 0 });
    expect(hasEnableClauseAtFrame([ev], SLOT, 'BATK', 0)).toBe(false);
  });
});

// ── collectNoGainWindowsForEvent ─────────────────────────────────────────────
describe('collectNoGainWindowsForEvent', () => {
  const SLOT = 'slot-0';

  test('collects ACTIVE segment as no-gain window', () => {
    const ev = makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: NounType.ULTIMATE, startFrame: 0,
      segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: 249, name: 'Animation' } },
        { properties: { segmentTypes: [SegmentType.STASIS], duration: 36, name: 'Stasis' } },
        { properties: { segmentTypes: [SegmentType.ACTIVE], duration: 1800, name: 'Active' } },
        { properties: { segmentTypes: [SegmentType.COOLDOWN], duration: 1200, name: 'Cooldown' } },
      ],
    });
    const windows = collectNoGainWindowsForEvent(ev);
    const activeWindow = windows.find(w => w.start === 285);
    expect(activeWindow).toBeDefined();
    expect(activeWindow!.end).toBe(285 + 1800);
  });

  test('collects IGNORE ULTIMATE_ENERGY clause segment as no-gain window', () => {
    const ev = makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: NounType.ULTIMATE, startFrame: 0,
      segments: [
        {
          properties: { segmentTypes: [SegmentType.ANIMATION], duration: 249, name: 'Animation' },
          clause: [{ conditions: [], effects: [{ verb: 'IGNORE', object: 'ULTIMATE_ENERGY' }] }],
        },
        { properties: { segmentTypes: [SegmentType.ACTIVE], duration: 1800, name: 'Active' } },
      ],
    });
    const windows = collectNoGainWindowsForEvent(ev);
    // Both Animation (IGNORE clause) and Active (segmentType) should be no-gain windows
    expect(windows.length).toBe(2);
    expect(windows[0]).toEqual({ start: 0, end: 249 });
    expect(windows[1]).toEqual({ start: 249, end: 249 + 1800 });
  });

  test('fallback for non-segmented ultimate events', () => {
    const ev = makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: NounType.ULTIMATE, startFrame: 100,
      segments: [{ properties: { duration: 249 } }],
    });
    const windows = collectNoGainWindowsForEvent(ev);
    expect(windows.length).toBe(1);
    expect(windows[0]).toEqual({ start: 349, end: 349 + 1800 });
  });
});

// ── UE gauge gains via UltimateEnergyController + SkillPointController ──────
describe('UE gauge gains — natural SP consumption via controllers', () => {
  const SLOT = 'slot-0';
  const NATURAL_SP_RATIO = 0.065; // NATURAL_SP_TO_ULTIMATE_RATIO

  test('battle skill SP cost converts to gauge gain via natural SP', () => {
    const ueController = new UltimateEnergyController();
    const spController = new SkillPointController();
    spController.setUltimateEnergyController(ueController);
    ueController.configureSlot(SLOT, { max: 300, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    spController.addCost('battle-1', 500, 100, SLOT, 500);
    spController.finalize([]);
    ueController.finalize(spController.getBattleSkillGainFrames());

    const graph = ueController.getGraph(SLOT)!;
    // SP starts at 200 (all natural), cost 100 → 100 natural consumed
    // 100 * 0.065 = 6.5 per pool (selfGain + teamGain for same slot = 13)
    const gainPoint = graph.points.find(p => p.frame === 500 && p.value > 0);
    expect(gainPoint).toBeDefined();
    expect(gainPoint!.value).toBeCloseTo(13, 1);
  });

  test('frame-level gaugeGain is collected separately from SP-based gain', () => {
    const ueController = new UltimateEnergyController();
    const spController = new SkillPointController();
    spController.setUltimateEnergyController(ueController);
    ueController.configureSlot(SLOT, { max: 300, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    // Battle skill SP cost
    spController.addCost('battle-1', 400, 100, SLOT, 500);
    // Frame-level gaugeGain from a battle skill hit (selfGain only)
    ueController.addGaugeGain(500, SLOT, 15, 0);

    spController.finalize([]);
    ueController.finalize(spController.getBattleSkillGainFrames());

    const graph = ueController.getGraph(SLOT)!;
    // SP-based: 100 * 0.065 = 6.5 (self+team for same slot = 13) + frame-level: 15 = 28
    const gainPoints = graph.points.filter(p => p.frame === 500);
    const maxVal = Math.max(...gainPoints.map(p => p.value));
    expect(maxVal).toBeCloseTo(13 + 15, 1);
  });

  test('SP return reduces natural SP consumed (returned consumed first)', () => {
    const ueController = new UltimateEnergyController();
    const spController = new SkillPointController();
    spController.setUltimateEnergyController(ueController);
    ueController.configureSlot(SLOT, { max: 300, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    // First battle skill: costs 100 SP (all natural), returns 50 SP
    spController.addCost('battle-1', 0, 100, SLOT, 0);
    spController.addRecovery(100, 50, SLOT, 'B1');
    // Second battle skill: costs 100 SP — 50 from returned pool, 50 from natural
    spController.addCost('battle-2', 200, 100, SLOT, 200);

    spController.finalize([]);
    ueController.finalize(spController.getBattleSkillGainFrames());

    const graph = ueController.getGraph(SLOT)!;
    // First battle: 100 natural consumed → 6.5 per pool (self+team for same slot = 13)
    const gainAt0 = graph.points.find(p => p.frame === 0 && p.value > 0);
    expect(gainAt0).toBeDefined();
    expect(gainAt0!.value).toBeCloseTo(100 * NATURAL_SP_RATIO * 2, 1);
    // Second battle: 50 returned + ~50 natural → 50 * 0.065 * 2 = 6.5 per slot
    // The graph accumulates, so at frame 200 the total should be ~13 + ~6.5 = ~19.5
    const pointsAt200 = graph.points.filter(p => p.frame === 200);
    const maxAt200 = Math.max(...pointsAt200.map(p => p.value));
    expect(maxAt200).toBeCloseTo(100 * NATURAL_SP_RATIO * 2 + 50 * NATURAL_SP_RATIO * 2, 1);
  });

  test('combo skill gauge gain is collected directly', () => {
    const ueController = new UltimateEnergyController();
    ueController.configureSlot(SLOT, { max: 300, startValue: 0, chargePerFrame: 0, efficiency: 0 });

    ueController.addGaugeGain(350, SLOT, 20, 10);
    ueController.finalize(new Map());

    const graph = ueController.getGraph(SLOT)!;
    // selfGain=20 + teamGain=10 = 30 total for this slot
    const gainPoint = graph.points.find(p => p.frame === 350 && p.value > 0);
    expect(gainPoint).toBeDefined();
    expect(gainPoint!.value).toBe(30);
  });
});

// ── ENABLE/DISABLE clause variant validation ──────────────────────────────
// Uses real TWILIGHT segments from laevatain-skills.json
describe('ENABLE/DISABLE clause variant validation', () => {
  const SLOT = 'slot-0';
  const totalDuration = twilightSegments.reduce((s: number, seg: EventSegmentData) => s + seg.properties.duration, 0);

  function ultEvent(startFrame: number): TimelineEvent {
    return makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: NounType.ULTIMATE, startFrame,
      segments: twilightSegments,
    });
  }

  test('enhanced variant is available during ENABLE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS_ENHANCED', SLOT, events, 500, NounType.BASIC_ATTACK, undefined, EnhancementType.ENHANCED);
    expect(result.disabled).toBe(false);
  });

  test('enhanced variant is disabled outside ENABLE window (past ultimate)', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS_ENHANCED', SLOT, events, totalDuration + 100, NounType.BASIC_ATTACK, undefined, EnhancementType.ENHANCED);
    expect(result.disabled).toBe(true);
    expect(result.reason).toContain('Activation condition not met');
  });

  test('enhanced variant is disabled when no ultimate placed', () => {
    const result = checkVariantAvailability('FLAMING_CINDERS_ENHANCED', SLOT, [], 500, NounType.BASIC_ATTACK, undefined, EnhancementType.ENHANCED);
    expect(result.disabled).toBe(true);
  });

  test('regular basic is blocked during DISABLE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS', SLOT, events, 500, NounType.BASIC_ATTACK, undefined, EnhancementType.NORMAL);
    expect(result.disabled).toBe(true);
    expect(result.reason).toContain('NORMAL');
  });

  test('regular basic is allowed outside DISABLE window (past ultimate)', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS', SLOT, events, totalDuration + 100, NounType.BASIC_ATTACK, undefined, EnhancementType.NORMAL);
    expect(result.disabled).toBe(false);
  });

  test('finisher is disabled during ultimate (DISABLE FINISHER clause)', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FINISHER', SLOT, events, 500, NounType.BASIC_ATTACK);
    expect(result.disabled).toBe(true);
  });

  test('dive is allowed during ENABLE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('DIVE', SLOT, events, 500, NounType.BASIC_ATTACK);
    expect(result.disabled).toBe(false);
  });
});

// ── validateEnhanced / validateDisabledVariants ──────────────────
// Uses real TWILIGHT segments from laevatain-skills.json
describe('validateEnhanced and validateDisabledVariants', () => {
  const SLOT = 'slot-0';
  const totalDuration = twilightSegments.reduce((s: number, seg: EventSegmentData) => s + seg.properties.duration, 0);

  function ultEvent(startFrame: number): TimelineEvent {
    return makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: NounType.ULTIMATE, startFrame,
      segments: twilightSegments,
    });
  }

  test('enhanced basic during ENABLE window: no warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: NounType.BASIC_ATTACK, name: 'FLAMING_CINDERS_ENHANCED', startFrame: 500, enhancementType: EnhancementType.ENHANCED }),
    ];
    const warnings = validateEnhanced(events);
    expect(warnings.has('basic-1')).toBe(false);
  });

  test('enhanced basic outside ENABLE window: warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: NounType.BASIC_ATTACK, name: 'FLAMING_CINDERS_ENHANCED', startFrame: totalDuration + 100, enhancementType: EnhancementType.ENHANCED }),
    ];
    const warnings = validateEnhanced(events);
    expect(warnings.has('basic-1')).toBe(true);
  });

  test('regular basic during DISABLE window: warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: NounType.BASIC_ATTACK, name: 'FLAMING_CINDERS', startFrame: 500 }),
    ];
    const warnings = validateDisabledVariants(events);
    expect(warnings.has('basic-1')).toBe(true);
  });

  test('regular basic outside DISABLE window (past ultimate): no warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: NounType.BASIC_ATTACK, name: 'FLAMING_CINDERS', startFrame: totalDuration + 100 }),
    ];
    const warnings = validateDisabledVariants(events);
    expect(warnings.has('basic-1')).toBe(false);
  });

  test('finisher during DISABLE window: warning (DISABLE FINISHER in Laevatain ultimate)', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: NounType.BASIC_ATTACK, name: 'FINISHER', startFrame: 500 }),
    ];
    const warnings = validateDisabledVariants(events);
    expect(warnings.has('basic-1')).toBe(true);
  });
});
