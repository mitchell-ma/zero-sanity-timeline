/**
 * Ultimate Energy Validation Tests
 *
 * Verifies that ultimate energy from battle skill gauge gains
 * is correctly accounted for when validating ultimate placement.
 */

// Mock operatorJsonLoader to handle require.context (loads real JSON data)
jest.mock('../../model/event-frames/operatorJsonLoader', () => {
  const actual = jest.requireActual('../../model/event-frames/dataDrivenEventFrames');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const opJson = require('../../model/game-data/operators/laevatain-operator.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skillsJson = require('../../model/game-data/operator-skills/laevatain-skills.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const statusesJson = require('../../model/game-data/operator-statuses/laevatain-statuses.json');
  const { statusEvents: skStatusEvents, skillTypeMap: skTypeMap, ...skillEntries } = skillsJson;
  const KEY_EXPAND: Record<string, string> = {
    verb: 'verb', object: 'object', subject: 'subject',
    to: 'toObject', from: 'fromObject',
    on: 'onObject', with: 'with', for: 'for',
  };
  const expandKeys = (val: unknown): unknown => {
    if (val == null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(expandKeys);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) { out[KEY_EXPAND[k] ?? k] = expandKeys(v); }
    return out;
  };
  const expandedStatuses = (statusesJson as unknown[]).map(expandKeys);
  const mergedStatusEvents = [...expandedStatuses, ...(skStatusEvents ?? [])];
  const skills: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(skillEntries as Record<string, unknown>)) {
    skills[key] = { ...(val as Record<string, unknown>), id: key };
  }
  if (skTypeMap) {
    for (const [category, skillId] of Object.entries(skTypeMap as Record<string, string>)) {
      if (skills[skillId]) skills[category] = skills[skillId];
      for (const suffix of ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED']) {
        const vid = `${skillId}_${suffix}`;
        if (skills[vid]) skills[`${suffix}_${category}`] = skills[vid];
      }
    }
  }
  const merged = { ...opJson, skills, skillTypeMap: skTypeMap, ...(mergedStatusEvents.length > 0 ? { statusEvents: mergedStatusEvents } : {}) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data
  const json: Record<string, any> = { laevatain: merged };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sequence cache
  const seqCache = new Map<string, any>();
  return {
    getOperatorJson: (id: string) => json[id],
    getAllOperatorIds: () => Object.keys(json),
    getSkillIds: () => new Set<string>(),
    getSkillTypeMap: (id: string) => json[id]?.skillTypeMap ?? {},
    resolveSkillType: () => null,
    getFrameSequences: (opId: string, skillId: string) => {
      const k = `${opId}:${skillId}`;
      if (seqCache.has(k)) return seqCache.get(k);
      const seqs = actual.buildSequencesFromOperatorJson(json[opId] ?? {}, skillId);
      seqCache.set(k, seqs);
      return seqs;
    },
    getSegmentLabels: () => undefined,
    getSkillTimings: () => undefined,
    getUltimateEnergyCost: () => 0,
    getSkillGaugeGains: () => undefined,
    getBattleSkillSpCost: () => undefined,
    getSkillCategoryData: () => undefined,
    getBasicAttackDurations: () => undefined,
  getComboTriggerClause: () => undefined,
    getDelayedHitLabel: () => undefined,
    getExchangeStatusConfig: () => ({}),
    getExchangeStatusIds: () => new Set(),
  };
});

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

// eslint-disable-next-line import/first
import { computeUltimateEnergyGraph, UltEnergyEvent } from '../../controller/timeline/ultimateEnergyTimeline';
// eslint-disable-next-line import/first
import { preConsumptionValue, validateResources, hasEnhanceClauseAtFrame, checkVariantAvailability, validateEnhanced, validateDisabledVariants } from '../../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { applyGainEfficiency, collectNoGainWindowsForEvent, UltimateEnergyController, RawGaugeGainEvent } from '../../controller/timeline/ultimateEnergyController';
// eslint-disable-next-line import/first
import { SkillPointController } from '../../controller/slot/skillPointController';
// eslint-disable-next-line import/first
import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
// eslint-disable-next-line import/first
import { SKILL_COLUMNS } from '../../model/channels';
// eslint-disable-next-line import/first
import { SegmentType } from '../../consts/enums';

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
      columnId: SKILL_COLUMNS.ULTIMATE,
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

// ── hasEnhanceClauseAtFrame ────────────────────────────────────────────────
describe('hasEnhanceClauseAtFrame', () => {
  const SLOT = 'slot-0';

  function ultWithSegments(startFrame: number, segments: EventSegmentData[]): TimelineEvent {
    return makeEvent({
      uid: 'ult-1',
      ownerId: SLOT,
      columnId: SKILL_COLUMNS.ULTIMATE,
      startFrame,
      segments,
    });
  }

  const enhanceClause = [{ conditions: [], effects: [{ verb: 'ENHANCE', object: 'BASIC_ATTACK' }] }];

  test('returns true when frame falls within a segment with ENHANCE clause', () => {
    const ev = ultWithSegments(0, [
      { properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION }, clause: enhanceClause },
      { properties: { duration: 36, name: 'Stasis' }, metadata: { segmentType: SegmentType.STASIS }, clause: enhanceClause },
      { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: enhanceClause },
      { properties: { duration: 1200, name: 'Cooldown' }, metadata: { segmentType: SegmentType.COOLDOWN } },
    ]);
    // During Animation (0-248)
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BASIC_ATTACK', 100)).toBe(true);
    // During Stasis (249-284)
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BASIC_ATTACK', 260)).toBe(true);
    // During Active (285-2084)
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BASIC_ATTACK', 500)).toBe(true);
  });

  test('returns false during Cooldown (no ENHANCE clause)', () => {
    const ev = ultWithSegments(0, [
      { properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION }, clause: enhanceClause },
      { properties: { duration: 36, name: 'Stasis' }, metadata: { segmentType: SegmentType.STASIS }, clause: enhanceClause },
      { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: enhanceClause },
      { properties: { duration: 1200, name: 'Cooldown' }, metadata: { segmentType: SegmentType.COOLDOWN } },
    ]);
    // During Cooldown (2085-3284)
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BASIC_ATTACK', 2100)).toBe(false);
  });

  test('returns false before ultimate starts', () => {
    const ev = ultWithSegments(1000, [
      { properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION }, clause: enhanceClause },
      { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: enhanceClause },
    ]);
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BASIC_ATTACK', 500)).toBe(false);
  });

  test('returns false for wrong enhance object type', () => {
    const ev = ultWithSegments(0, [
      { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: enhanceClause },
    ]);
    // ENHANCE BASIC_ATTACK doesn't match BATTLE_SKILL
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BATTLE_SKILL', 500)).toBe(false);
  });

  test('returns false for different owner', () => {
    const ev = ultWithSegments(0, [
      { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: enhanceClause },
    ]);
    expect(hasEnhanceClauseAtFrame([ev], 'slot-1', 'BASIC_ATTACK', 500)).toBe(false);
  });

  test('returns false when event has no segments', () => {
    const ev = makeEvent({ uid: 'ult-1', ownerId: SLOT, columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0 });
    expect(hasEnhanceClauseAtFrame([ev], SLOT, 'BASIC_ATTACK', 0)).toBe(false);
  });
});

// ── collectNoGainWindowsForEvent ─────────────────────────────────────────────
describe('collectNoGainWindowsForEvent', () => {
  const SLOT = 'slot-0';

  test('collects ACTIVE segment as no-gain window', () => {
    const ev = makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0,
      segments: [
        { properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION } },
        { properties: { duration: 36, name: 'Stasis' }, metadata: { segmentType: SegmentType.STASIS } },
        { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE } },
        { properties: { duration: 1200, name: 'Cooldown' }, metadata: { segmentType: SegmentType.COOLDOWN } },
      ],
    });
    const windows = collectNoGainWindowsForEvent(ev);
    const activeWindow = windows.find(w => w.start === 285);
    expect(activeWindow).toBeDefined();
    expect(activeWindow!.end).toBe(285 + 1800);
  });

  test('collects IGNORE ULTIMATE_ENERGY clause segment as no-gain window', () => {
    const ev = makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0,
      segments: [
        {
          properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION },
          clause: [{ conditions: [], effects: [{ verb: 'IGNORE', object: 'ULTIMATE_ENERGY' }] }],
        },
        { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE } },
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
      uid: 'ult-1', ownerId: SLOT, columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 100,
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

// ── ENHANCE clause variant validation ──────────────────────────────────────
describe('ENHANCE clause variant validation', () => {
  const SLOT = 'slot-0';
  const enhanceClause = [{ conditions: [], effects: [{ verb: 'ENHANCE', object: 'BASIC_ATTACK' }] }];
  const enhanceAndDisableClause = [{ conditions: [], effects: [
    { verb: 'ENHANCE', object: 'BASIC_ATTACK' },
    { verb: 'DISABLE', adjective: 'NORMAL', object: 'BASIC_ATTACK' },
  ] }];

  function ultEvent(startFrame: number): TimelineEvent {
    return makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: SKILL_COLUMNS.ULTIMATE, startFrame,
      segments: [
        { properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION }, clause: enhanceClause },
        { properties: { duration: 36, name: 'Stasis' }, metadata: { segmentType: SegmentType.STASIS }, clause: enhanceClause },
        { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: enhanceAndDisableClause },
        { properties: { duration: 1200, name: 'Cooldown' }, metadata: { segmentType: SegmentType.COOLDOWN } },
      ],
    });
  }

  test('enhanced variant is available during ENHANCE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS_ENHANCED', SLOT, events, 500, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(false);
  });

  test('enhanced variant is disabled outside ENHANCE window', () => {
    const events = [ultEvent(0)];
    // Frame 3000 is during Cooldown (no ENHANCE clause)
    const result = checkVariantAvailability('FLAMING_CINDERS_ENHANCED', SLOT, events, 3000, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(true);
    expect(result.reason).toContain('ENHANCE');
  });

  test('enhanced variant is disabled when no ultimate placed', () => {
    const result = checkVariantAvailability('FLAMING_CINDERS_ENHANCED', SLOT, [], 500, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(true);
  });

  test('regular basic is blocked during DISABLE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS', SLOT, events, 500, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(true);
    expect(result.reason).toContain('NORMAL');
  });

  test('regular basic is allowed outside DISABLE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FLAMING_CINDERS', SLOT, events, 3000, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(false);
  });

  test('finisher is allowed during DISABLE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('FINISHER', SLOT, events, 500, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(false);
  });

  test('dive is allowed during ENHANCE window', () => {
    const events = [ultEvent(0)];
    const result = checkVariantAvailability('DIVE', SLOT, events, 500, SKILL_COLUMNS.BASIC);
    expect(result.disabled).toBe(false);
  });
});

// ── validateEnhanced / validateDisabledVariants ──────────────────
describe('validateEnhanced and validateDisabledVariants', () => {
  const SLOT = 'slot-0';
  const enhanceClause = [{ conditions: [], effects: [{ verb: 'ENHANCE', object: 'BASIC_ATTACK' }] }];
  const disableClause = [{ conditions: [], effects: [
    { verb: 'ENHANCE', object: 'BASIC_ATTACK' },
    { verb: 'DISABLE', adjective: 'NORMAL', object: 'BASIC_ATTACK' },
  ] }];

  function ultEvent(startFrame: number): TimelineEvent {
    return makeEvent({
      uid: 'ult-1', ownerId: SLOT, columnId: SKILL_COLUMNS.ULTIMATE, startFrame,
      segments: [
        { properties: { duration: 249, name: 'Animation' }, metadata: { segmentType: SegmentType.ANIMATION }, clause: enhanceClause },
        { properties: { duration: 1800, name: 'Active' }, metadata: { segmentType: SegmentType.ACTIVE }, clause: disableClause },
        { properties: { duration: 1200, name: 'Cooldown' }, metadata: { segmentType: SegmentType.COOLDOWN } },
      ],
    });
  }

  test('enhanced basic during ENHANCE window: no warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: SKILL_COLUMNS.BASIC, name: 'FLAMING_CINDERS_ENHANCED', startFrame: 500 }),
    ];
    const warnings = validateEnhanced(events);
    expect(warnings.has('basic-1')).toBe(false);
  });

  test('enhanced basic outside ENHANCE window: warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: SKILL_COLUMNS.BASIC, name: 'FLAMING_CINDERS_ENHANCED', startFrame: 3000 }),
    ];
    const warnings = validateEnhanced(events);
    expect(warnings.has('basic-1')).toBe(true);
  });

  test('regular basic during ENHANCE window: warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: SKILL_COLUMNS.BASIC, name: 'FLAMING_CINDERS', startFrame: 500 }),
    ];
    const warnings = validateDisabledVariants(events);
    expect(warnings.has('basic-1')).toBe(true);
  });

  test('regular basic outside ENHANCE window: no warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: SKILL_COLUMNS.BASIC, name: 'FLAMING_CINDERS', startFrame: 3000 }),
    ];
    const warnings = validateDisabledVariants(events);
    expect(warnings.has('basic-1')).toBe(false);
  });

  test('finisher during ENHANCE window: no warning', () => {
    const events = [
      ultEvent(0),
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: SKILL_COLUMNS.BASIC, name: 'FINISHER', startFrame: 500 }),
    ];
    const warnings = validateDisabledVariants(events);
    expect(warnings.has('basic-1')).toBe(false);
  });
});
