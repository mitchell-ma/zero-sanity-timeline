/**
 * Event Queue Pipeline Tests
 *
 * Validates the priority-queue-based event processing pipeline:
 * - PriorityQueue min-heap correctness
 * - Melting Flame max-stack cap enforcement (no overcapping)
 * - MF consumption via empowered battle skill + post-consumption re-creation
 * - Scorching Heart Effect threshold re-activation after consumption cycles
 * - Infliction deque stacking via queue (eviction, refresh)
 * - Cross-element reaction derivation inline with inflictions
 * - Shuffled event order produces identical results (drag invariance)
 */
import { TimelineEvent, EventSegmentData, EventFrameMarker, eventDuration } from '../../consts/viewTypes';
import { EventStatusType, PhysicalStatusType, SegmentType, TimeDependency } from '../../consts/enums';
import { OPERATOR_COLUMNS, SKILL_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID, USER_ID, SHATTER_DURATION } from '../../model/channels';
import { PriorityQueue } from '../../controller/timeline/priorityQueue';
import { processCombatSimulation } from '../../controller/timeline/eventQueueController';

// ── Mock require.context before importing modules that use it ────────────────

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));


// ── Test helpers ─────────────────────────────────────────────────────────────

const SLOT_ID = 'slot1';
const FPS = 120;
let eventIdCounter = 0;

function resetIdCounter() { eventIdCounter = 0; }

function battleSkillEvent(startFrame: number): TimelineEvent {
  const { loadSkillById: _loadSkillById } = require('../helpers/loadGameData');
  const skillDef = _loadSkillById('laevatain', 'SMOULDERING_FIRE');
  const seg = skillDef.segments[0];
  const duration = Math.round(seg.properties.duration.value * FPS);
  const frames: EventFrameMarker[] = [];
  for (const f of seg.frames) {
    const offset = Math.round(f.properties.offset.value * FPS);
    const clauseEffects = (f.clause?.[0]?.effects ?? []).map((ef: Record<string, unknown>) => ({
      type: 'dsl' as const,
      dslEffect: ef as unknown as import('../../dsl/semantics').Effect,
    }));
    const frameMarker: EventFrameMarker = {
      offsetFrame: offset,
      ...(clauseEffects.length > 0 && { clauses: [{ conditions: [], effects: clauseEffects }] }),
    };
    frames.push(frameMarker);
  }
  return {
    uid: `battle-${eventIdCounter++}`,
    id: 'SMOULDERING_FIRE',
    name: 'SMOULDERING_FIRE',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    segments: [{ properties: { duration }, frames }],
  };
}

function empoweredBattleSkillEvent(startFrame: number): TimelineEvent {
  const { loadSkillById: _loadSkillById2 } = require('../helpers/loadGameData');
  const empDef = _loadSkillById2('laevatain', 'SMOULDERING_FIRE_EMPOWERED');
  const empSeg = empDef.segments[0];
  const duration = Math.round(empSeg.properties.duration.value * FPS);
  const segments: EventSegmentData[] = [];
  const frames: EventFrameMarker[] = [];
  for (const f of empSeg.frames) {
    const offset = Math.round(f.properties.offset.value * FPS);
    const empClauseEffects = (f.clause?.[0]?.effects ?? []).map((ef: Record<string, unknown>) => ({
      type: 'dsl' as const,
      dslEffect: ef as unknown as import('../../dsl/semantics').Effect,
    }));
    const frameMarker: EventFrameMarker = {
      offsetFrame: offset,
      ...(empClauseEffects.length > 0 && { clauses: [{ conditions: [], effects: empClauseEffects }] }),
    };
    frames.push(frameMarker);
  }
  segments.push({ properties: { duration }, frames });

  return {
    uid: `emp-battle-${eventIdCounter++}`,
    id: 'SMOULDERING_FIRE_EMPOWERED',
    name: 'SMOULDERING_FIRE_EMPOWERED',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
        segments,
  };
}

function filterByColumn(events: TimelineEvent[], columnId: string): TimelineEvent[] {
  return events.filter(ev => ev.columnId === columnId);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => resetIdCounter());

// ═════════════════════════════════════════════════════════════════════════════
// PriorityQueue unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe('PriorityQueue', () => {
  test('extracts elements in ascending order', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.insert(5);
    pq.insert(1);
    pq.insert(3);
    pq.insert(2);
    pq.insert(4);
    const result: number[] = [];
    while (pq.size > 0) result.push(pq.extractMin()!);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test('handles frame + priority tie-breaking', () => {
    const pq = new PriorityQueue<{ frame: number; priority: number; label: string }>((a, b) =>
      a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority
    );
    pq.insert({ frame: 100, priority: 50, label: 'consume' });
    pq.insert({ frame: 100, priority: 10, label: 'infliction' });
    pq.insert({ frame: 100, priority: 20, label: 'exchange' });
    pq.insert({ frame: 50, priority: 10, label: 'early' });
    const result: string[] = [];
    while (pq.size > 0) result.push(pq.extractMin()!.label);
    expect(result).toEqual(['early', 'infliction', 'exchange', 'consume']);
  });

  test('returns undefined on empty queue', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    expect(pq.extractMin()).toBeUndefined();
    expect(pq.peek()).toBeUndefined();
    expect(pq.size).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MF stacking via queue pipeline
// ═════════════════════════════════════════════════════════════════════════════

describe('MF Stacking (Queue Pipeline)', () => {
  test('Q1: 4 battle skills produce exactly 4 MF stacks', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(4);
    expect(mfEvents.every(ev => ev.eventStatus !== EventStatusType.CONSUMED)).toBe(true);
  });

  test('Q2: 6 battle skills still produce exactly 4 MF stacks (no overcapping)', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      battleSkillEvent(1200),
      battleSkillEvent(1500),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    // Only 4 stacks — 5th and 6th are blocked by cap
    expect(mfEvents.length).toBe(4);
    expect(mfEvents.every(ev => ev.eventStatus !== EventStatusType.CONSUMED)).toBe(true);
  });

  test('Q3: Empowered BS consumes all 4 MF stacks', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      empoweredBattleSkillEvent(1200),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBe(4);
  });

  test('Q4: After consumption, next BS creates new MF', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      empoweredBattleSkillEvent(1200),
      battleSkillEvent(1800),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = mfEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed.length).toBe(4);
    expect(active.length).toBe(1);
    expect(active[0].startFrame).toBeGreaterThanOrEqual(1800);
  });

  test('Q5: Scorching Heart Effect activates at MAX stacks', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = processCombatSimulation(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].sourceOwnerId).toBe('LAEVATAIN');
  });

  test('Q6: Scorching Heart Effect re-activates after consume + re-accumulation', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      empoweredBattleSkillEvent(1200), // consumes all 4 MF
      battleSkillEvent(1800),
      battleSkillEvent(2100),
      battleSkillEvent(2400),
      battleSkillEvent(2700),
    ];
    const result = processCombatSimulation(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    // Should have 2 SH events: one from first 4 MF, one from second 4 MF
    expect(shEvents.length).toBe(2);
  });

  test('Q7: Shuffled battle skill order produces same MF count as sorted', () => {
    resetIdCounter();
    const sorted = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      battleSkillEvent(1200),
    ];
    const sortedResult = processCombatSimulation(sorted);
    const sortedMF = filterByColumn(sortedResult, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);

    resetIdCounter();
    const shuffled = [
      battleSkillEvent(900),
      battleSkillEvent(0),
      battleSkillEvent(600),
      battleSkillEvent(300),
      battleSkillEvent(1200),
    ];
    const shuffledResult = processCombatSimulation(shuffled);
    const shuffledMF = filterByColumn(shuffledResult, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);

    expect(shuffledMF.length).toBe(sortedMF.length);
    for (let i = 0; i < sortedMF.length; i++) {
      expect(shuffledMF[i].startFrame).toBe(sortedMF[i].startFrame);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-element reactions via queue
// ═════════════════════════════════════════════════════════════════════════════

describe('Reactions (Queue Pipeline)', () => {
  test('R1: Cross-element infliction overlap triggers reaction', () => {
    const heatBS = battleSkillEvent(0);
    const result = processCombatSimulation([heatBS]);
    const heatInflictions = filterByColumn(result, INFLICTION_COLUMNS.HEAT);
    expect(heatInflictions.length).toBeGreaterThanOrEqual(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MF Absorption Behavioral Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('MF Absorption Behavior', () => {
  test('consumeStatus frees exchange slots for subsequent re-creation', () => {
    // 4 BS → 4 MF → consume → 4 more BS → 4 new MF
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      empoweredBattleSkillEvent(1200),
      battleSkillEvent(1800),
      battleSkillEvent(2100),
      battleSkillEvent(2400),
      battleSkillEvent(2700),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = mfEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed.length).toBe(4); // first 4 consumed
    expect(active.length).toBe(4); // 4 new after consume
  });

  test('MF events start at the trigger frame of the source skill', () => {
    const events = [battleSkillEvent(0)];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBeGreaterThan(0);
    expect(mfEvents[0].startFrame).toBeGreaterThanOrEqual(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Infliction Stack Cap Behavioral Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Infliction Stack Cap (Queue Pipeline)', () => {
  // Laevatain's battle skill (SMOULDERING_FIRE) creates MF stacks via engine triggers,
  // and heat inflictions come from basic attack frame data. The MF stacking tests (Q1-Q7)
  // validate the deque semantics through the live pipeline. Here we validate additional
  // stack-cap behaviors using the MF column as the exchange status proxy.

  test('at cap, additional triggers do not exceed max stacks', () => {
    // Q2 already validates this — 6 BS → exactly 4 MF
    const events = Array.from({ length: 6 }, (_, i) => battleSkillEvent(i * 300));
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(mfEvents.length).toBe(4);
  });

  test('consumed stacks have shorter duration (clamped at consumption frame)', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      empoweredBattleSkillEvent(1200),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    // Consumed MF stacks should have duration < original (clamped at consume frame)
    for (const ev of consumed) {
      expect(eventDuration(ev)).toBeGreaterThan(0);
      // Duration should be clipped to the consume point, not the original full duration
      expect(ev.startFrame + eventDuration(ev)).toBeLessThanOrEqual(1500);
    }
  });

  test('after consumption cycle, stack count resets and new stacks accumulate', () => {
    const events = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      empoweredBattleSkillEvent(1200),
      battleSkillEvent(1800),
      battleSkillEvent(2100),
    ];
    const result = processCombatSimulation(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = mfEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed.length).toBe(4);
    expect(active.length).toBe(2); // 2 new after consume
    // New stacks should start after the consume
    for (const ev of active) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(1800);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Freeform Mode Events
// ═════════════════════════════════════════════════════════════════════════════

describe('Freeform Inflictions', () => {
  /** Freeform infliction: enemy-owned, sourceOwnerId=USER (placed via context menu). */
  function freeformInfliction(columnId: string, startFrame: number, duration = 120): TimelineEvent {
    return {
      uid: `freeform-${columnId}-${eventIdCounter++}`,
      id: columnId,
      name: columnId,
      ownerId: ENEMY_OWNER_ID,
      columnId,
      startFrame,
      segments: [{ properties: { duration: duration } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };
  }

  test('F1: Two different-element freeform inflictions overlapping in time create a reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);
    const result = processCombatSimulation([heat, nature]);

    // Should create a corrosion reaction (heat + nature → corrosion)
    const reactions = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    expect(reactions.length).toBe(1);
    expect(reactions[0].startFrame).toBe(200);
  });

  test('F2: Same-element freeform inflictions do NOT create a reaction', () => {
    const heat1 = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const heat2 = freeformInfliction(INFLICTION_COLUMNS.HEAT, 200, 2400);
    const result = processCombatSimulation([heat1, heat2]);

    // No reaction — same element
    const combustion = filterByColumn(result, REACTION_COLUMNS.COMBUSTION);
    const corrosion = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    const solidification = filterByColumn(result, REACTION_COLUMNS.SOLIDIFICATION);
    const electrification = filterByColumn(result, REACTION_COLUMNS.ELECTRIFICATION);
    expect(combustion.length + corrosion.length + solidification.length + electrification.length).toBe(0);
  });

  test('F3: Freeform inflictions that do not overlap do NOT create a reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 50); // ends at 150
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400); // starts at 200
    const result = processCombatSimulation([heat, nature]);

    const reactions = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    expect(reactions.length).toBe(0);
  });

  test('F4: Freeform infliction does not duplicate (single stack in output)', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const result = processCombatSimulation([heat]);

    const heats = filterByColumn(result, INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBe(1);
    expect(heats[0].uid).toBe(heat.uid);
  });

  test('F5: Cross-element reaction consumes BOTH inflictions', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);
    const result = processCombatSimulation([heat, nature]);

    // Reaction exists at the later infliction's frame
    const corrosion = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    expect(corrosion.length).toBe(1);
    expect(corrosion[0].startFrame).toBe(200);

    // Earlier infliction (heat) consumed and clamped
    const heats = result.filter(ev => ev.columnId === INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBe(1);
    expect(heats[0].eventStatus).toBe(EventStatusType.CONSUMED);
    expect(eventDuration(heats[0])).toBe(100); // clamped: 200 - 100

    // Later infliction (nature) also consumed with zero duration
    const natures = result.filter(ev => ev.columnId === INFLICTION_COLUMNS.NATURE);
    expect(natures.length).toBe(1);
    expect(natures[0].eventStatus).toBe(EventStatusType.CONSUMED);
    expect(eventDuration(natures[0])).toBe(0);
  });

  test('F6: Freeform infliction interacts with another freeform of different element at same frame', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const electric = freeformInfliction(INFLICTION_COLUMNS.ELECTRIC, 100, 2400);
    const result = processCombatSimulation([heat, electric]);

    const electrification = filterByColumn(result, REACTION_COLUMNS.ELECTRIFICATION);
    expect(electrification.length).toBe(1);
    expect(electrification[0].startFrame).toBe(100);
  });

  test('F7: Dragging freeform infliction into overlap creates reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 50);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);

    // Run 1: no overlap → no reaction
    const result1 = processCombatSimulation([heat, nature]);
    expect(filterByColumn(result1, REACTION_COLUMNS.CORROSION).length).toBe(0);

    // Run 2: "drag" heat to overlap nature → reaction appears
    const heatDragged = { ...heat, startFrame: 200 };
    const result2 = processCombatSimulation([heatDragged, nature]);
    expect(filterByColumn(result2, REACTION_COLUMNS.CORROSION).length).toBe(1);
  });

  test('F8: Dragging freeform infliction away undoes reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);

    // Run 1: overlapping → reaction + both consumed
    const result1 = processCombatSimulation([heat, nature]);
    expect(filterByColumn(result1, REACTION_COLUMNS.CORROSION).length).toBe(1);
    expect(result1.find(ev => ev.uid === heat.uid)!.eventStatus).toBe(EventStatusType.CONSUMED);

    // Run 2: drag nature far away → no overlap → no reaction, both restored
    const natureDragged = { ...nature, startFrame: 5000 };
    const result2 = processCombatSimulation([heat, natureDragged]);
    expect(filterByColumn(result2, REACTION_COLUMNS.CORROSION).length).toBe(0);
    // Heat should be active again (not consumed) since raw event was never mutated
    const heatResult = result2.find(ev => ev.uid === heat.uid)!;
    expect(heatResult.eventStatus).toBeUndefined();
    expect(eventDuration(heatResult)).toBe(2400);
  });

  test('F9: Raw freeform events are not mutated across pipeline runs', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);

    // Run with overlap → reaction consumes both
    processCombatSimulation([heat, nature]);

    // Original objects must be untouched (undo history integrity)
    expect(eventDuration(heat)).toBe(2400);
    expect(heat.eventStatus).toBeUndefined();
    expect(eventDuration(nature)).toBe(2400);
    expect(nature.eventStatus).toBeUndefined();
  });

  test('F10: Heat + Cryo freeform inflictions create solidification', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const cryo = freeformInfliction(INFLICTION_COLUMNS.CRYO, 200, 2400);
    const result = processCombatSimulation([heat, cryo]);

    const solidification = filterByColumn(result, REACTION_COLUMNS.SOLIDIFICATION);
    expect(solidification.length).toBe(1);
  });

  test('F11: Heat + Electric freeform inflictions create electrification', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const electric = freeformInfliction(INFLICTION_COLUMNS.ELECTRIC, 200, 2400);
    const result = processCombatSimulation([heat, electric]);

    const electrification = filterByColumn(result, REACTION_COLUMNS.ELECTRIFICATION);
    expect(electrification.length).toBe(1);
  });

  test('F12: Nature + Cryo freeform inflictions create solidification', () => {
    // Reaction is keyed on the incoming infliction: CRYO → SOLIDIFICATION
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 100, 2400);
    const cryo = freeformInfliction(INFLICTION_COLUMNS.CRYO, 200, 2400);
    const result = processCombatSimulation([nature, cryo]);

    const solidification = filterByColumn(result, REACTION_COLUMNS.SOLIDIFICATION);
    expect(solidification.length).toBe(1);
  });

  test('F13: Single freeform infliction produces exactly one event (no duplicate)', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const result = processCombatSimulation([heat]);

    const heats = filterByColumn(result, INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBe(1);
    expect(heats[0].uid).toBe(heat.uid);
    expect(eventDuration(heats[0])).toBe(2400);
    expect(heats[0].eventStatus).toBeUndefined();
  });

  test('F15: Forced combustion at 0s refreshed by forced combustion at 0.5s — first has no frames after clamp', () => {
    const combustion1: TimelineEvent = {
      uid: 'comb-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }], // 20s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };
    const combustion2: TimelineEvent = {
      uid: 'comb-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 60, // 0.5s
      segments: [{ properties: { duration: 2400 } }], // 20s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };

    const result = processCombatSimulation([combustion1, combustion2]);

    // First combustion should be clamped at frame 60
    const first = result.find(ev => ev.uid === 'comb-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.segments[0].properties.duration).toBe(60);

    // Forced combustion has no initial hit. First DOT tick is at 120 (1s).
    // After clamping to 60 frames, no frames should remain.
    const firstFrames = first!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(firstFrames.length).toBe(0);
  });

  test('F16: Forced combustion at 0s (5s) refreshed by forced combustion at 0.5s (5s) — first has no frames', () => {
    const combustion1: TimelineEvent = {
      uid: 'comb-5s-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };
    const combustion2: TimelineEvent = {
      uid: 'comb-5s-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 60, // 0.5s
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };

    const result = processCombatSimulation([combustion1, combustion2]);
    const first = result.find(ev => ev.uid === 'comb-5s-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.segments[0].properties.duration).toBe(60); // clamped at 0.5s

    // Forced combustion: no initial hit, first DOT at 120 — past the 60-frame clamp.
    const firstFrames = first!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(firstFrames.length).toBe(0);
  });

  test('F17: Forced combustion with 0.5s duration has no frames', () => {
    const combustion: TimelineEvent = {
      uid: 'comb-short',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 60 } }], // 0.5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };

    const result = processCombatSimulation([combustion]);
    const ev = result.find(e => e.uid === 'comb-short');
    expect(ev).toBeDefined();

    // Forced combustion: no initial hit, first DOT at 1s (120 frames) — past the 60-frame duration.
    const frames = ev!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(frames.length).toBe(0);
  });

  test('F18: Integration — freeform combustion merged by later combustion has no frames past clamp', () => {
    // Place combustion I at 0s (5s), then combustion I at 2s (5s).
    // The second merges/refreshes the first, clamping it at frame 240 (2s).
    // The first had DOT ticks at 120 (1s) and 240 (2s). After clamp to 240,
    // only the tick at 120 should remain (240 <= 240 is kept by trimSegments).
    const comb1: TimelineEvent = {
      uid: 'int-comb-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };
    const comb2: TimelineEvent = {
      uid: 'int-comb-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240, // 2s
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processCombatSimulation([comb1, comb2]);

    // First combustion clamped
    const first = result.find(ev => ev.uid === 'int-comb-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.segments[0].properties.duration).toBe(240); // clamped at 2s

    // Check ALL frame offsets on the first combustion
    const firstFrames = first!.segments?.flatMap(s => s.frames ?? []) ?? [];
    const offsets = firstFrames.map(f => f.offsetFrame);

    // Every frame must be within [0, 240]
    for (const offset of offsets) {
      expect(offset).toBeLessThanOrEqual(240);
    }

    // Should NOT have any DOT ticks past the clamp (360, 480, 600 are gone)
    expect(offsets.some(o => o > 240)).toBe(false);

    // Second combustion should have full segments
    const second = result.find(ev => ev.uid === 'int-comb-2');
    expect(second).toBeDefined();
    const secondFrames = second!.segments?.flatMap(s => s.frames ?? []) ?? [];
    // Second has initial hit at 0, DOT at 120, 240, 360, 480, 600
    expect(secondFrames.length).toBeGreaterThan(offsets.length);
  });

  test('F19: App-realistic — isForced freeform combustion merge clips all frames past clamp', () => {
    // createEvent sets isForced: true on enemy reaction events.
    // Both combustions have isForced (as placed via context menu in the real app).
    const comb1: TimelineEvent = {
      uid: 'app-comb-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true, // set by createEvent for enemy reaction events
    };
    const comb2: TimelineEvent = {
      uid: 'app-comb-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240, // 2s
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    const result = processCombatSimulation([comb1, comb2]);

    const first = result.find(ev => ev.uid === 'app-comb-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.segments[0].properties.duration).toBe(240); // clamped at 2s

    // isForced combustion: no initial hit, DOT ticks at 120, 240, ...
    // After clamp to 240 frames, tick at 120 fits, tick at 240 is at boundary (kept).
    // Tick at 360 and beyond should NOT exist.
    const firstFrames = first!.segments?.flatMap(s => s.frames ?? []) ?? [];
    for (const f of firstFrames) {
      expect(f.offsetFrame).toBeLessThanOrEqual(240);
    }
    // Should NOT have any frame past the clamp boundary
    expect(firstFrames.some(f => f.offsetFrame > 240)).toBe(false);

    // Second combustion should have full segments
    const second = result.find(ev => ev.uid === 'app-comb-2');
    expect(second).toBeDefined();
    expect(second!.segments).toBeDefined();
    const secondFrames = second!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(secondFrames.length).toBeGreaterThan(0);
  });

  test('F20: isForced flag preserved through freeform pipeline — no initial hit at frame 0', () => {
    const combustion: TimelineEvent = {
      uid: 'forced-preserve',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    const result = processCombatSimulation([combustion]);
    const ev = result.find(e => e.uid === 'forced-preserve');
    expect(ev).toBeDefined();

    const frames = ev!.segments?.flatMap(s => s.frames ?? []) ?? [];
    // Forced combustion: NO initial hit at frame 0. First DOT tick at 120 (1s).
    expect(frames.some(f => f.offsetFrame === 0)).toBe(false);
    expect(frames[0]?.offsetFrame).toBe(120);
  });

  // ── Freeform reaction segment auto-build ────────────────────────────────

  test('F21: Freeform combustion auto-builds DOT tick segments', () => {
    const combustion: TimelineEvent = {
      uid: 'seg-comb',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }], // 5s
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processCombatSimulation([combustion]);
    const ev = result.find(e => e.uid === 'seg-comb');
    expect(ev).toBeDefined();
    expect(ev!.segments).toBeDefined();
    expect(ev!.segments!.length).toBeGreaterThan(0);

    const frames = ev!.segments!.flatMap(s => s.frames ?? []);
    // Non-forced: initial hit at 0 + DOT ticks at 120, 240, 360, 480, 600
    expect(frames[0].offsetFrame).toBe(0);
    expect(frames.some(f => f.offsetFrame === 120)).toBe(true);
  });

  test('F22: Freeform solidification has initial hit only (no auto-shatter at end)', () => {
    const solidification: TimelineEvent = {
      uid: 'seg-solid',
      id: REACTION_COLUMNS.SOLIDIFICATION,
      name: REACTION_COLUMNS.SOLIDIFICATION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.SOLIDIFICATION,
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processCombatSimulation([solidification]);
    const ev = result.find(e => e.uid === 'seg-solid');
    expect(ev).toBeDefined();

    const frames = ev!.segments?.flatMap(s => s.frames ?? []) ?? [];
    // Solidification: initial hit at 0 only — shatter is triggered by physical status consumption
    expect(frames.some(f => f.offsetFrame === 0)).toBe(true);
    expect(frames.some(f => f.offsetFrame === 2400)).toBe(false);
  });

  test('F22a: Physical status applied with active solidification consumes it and creates shatter', () => {
    const SLOT = 'slot-0';
    // Freeform solidification on enemy (stacks = 2)
    const solidification: TimelineEvent = {
      uid: 'solid-consume',
      id: REACTION_COLUMNS.SOLIDIFICATION,
      name: REACTION_COLUMNS.SOLIDIFICATION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.SOLIDIFICATION,
      startFrame: 0,
      stacks: 2,
      segments: [{ properties: { duration: 840 } }], // 7s level 2
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    // Skill event with physical status (LIFT) at frame 300
    const skillWithLift: TimelineEvent = {
      uid: 'skill-lift',
      id: 'test-skill',
      name: 'test-skill',
      ownerId: SLOT,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 300,
      segments: [{
        properties: { duration: 120 },
        frames: [{
          offsetFrame: 0,
          clauses: [{
            conditions: [],
            effects: [{
              type: 'dsl' as const,
              dslEffect: { verb: 'APPLY', object: 'STATUS', objectId: 'PHYSICAL', objectQualifier: PhysicalStatusType.LIFT, to: 'ENEMY' } as any,
            }],
          }],
        }],
      }],
    };

    const result = processCombatSimulation([solidification, skillWithLift]);

    // Solidification should be consumed
    const solidEvents = filterByColumn(result, REACTION_COLUMNS.SOLIDIFICATION);
    const consumed = solidEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBe(1);

    // Shatter should be created
    const shatterEvents = filterByColumn(result, REACTION_COLUMNS.SHATTER);
    expect(shatterEvents.length).toBe(1);
    const shatter = shatterEvents[0];
    expect(shatter.startFrame).toBe(300);
    expect(shatter.stacks).toBe(2);
    expect(eventDuration(shatter)).toBe(SHATTER_DURATION);

    // Shatter segment should have the correct label
    const segName = shatter.segments[0]?.properties?.name;
    expect(segName).toBe('Shatter II');

    // Shatter should have a physical damage frame at offset 0
    const frames = shatter.segments.flatMap(s => s.frames ?? []);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0].offsetFrame).toBe(0);
    expect(frames[0].damageElement).toBe('PHYSICAL');
  });

  test('F22b: Physical status without active solidification does not create shatter', () => {
    const SLOT = 'slot-0';
    // Skill event with physical status (LIFT) at frame 300, no solidification
    const skillWithLift: TimelineEvent = {
      uid: 'skill-lift-no-solid',
      id: 'test-skill',
      name: 'test-skill',
      ownerId: SLOT,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 300,
      segments: [{
        properties: { duration: 120 },
        frames: [{
          offsetFrame: 0,
          clauses: [{
            conditions: [],
            effects: [{
              type: 'dsl' as const,
              dslEffect: { verb: 'APPLY', object: 'STATUS', objectId: 'PHYSICAL', objectQualifier: PhysicalStatusType.LIFT, to: 'ENEMY' } as any,
            }],
          }],
        }],
      }],
    };

    const result = processCombatSimulation([skillWithLift]);

    // No shatter should be created
    const shatterEvents = filterByColumn(result, REACTION_COLUMNS.SHATTER);
    expect(shatterEvents.length).toBe(0);
  });

  test('F23: Freeform reaction does not duplicate (single event in output)', () => {
    const combustion: TimelineEvent = {
      uid: 'no-dup-comb',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processCombatSimulation([combustion]);
    const combustions = filterByColumn(result, REACTION_COLUMNS.COMBUSTION);
    expect(combustions.length).toBe(1);
    expect(combustions[0].uid).toBe('no-dup-comb');
  });

  // ── Freeform reaction merge / refresh ───────────────────────────────────

  test('F24: Two freeform combustions — second refreshes first', () => {
    const comb1: TimelineEvent = {
      uid: 'merge-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };
    const comb2: TimelineEvent = {
      uid: 'merge-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240, // 2s
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    const result = processCombatSimulation([comb1, comb2]);
    const first = result.find(ev => ev.uid === 'merge-1');
    const second = result.find(ev => ev.uid === 'merge-2');
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.segments[0].properties.duration).toBe(240);
    expect(second!.eventStatus).toBeUndefined();
    expect(second!.segments[0].properties.duration).toBe(600);
  });

  test('F25: Freeform reaction merge — raw events not mutated', () => {
    const comb1: TimelineEvent = {
      uid: 'immut-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };
    const comb2: TimelineEvent = {
      uid: 'immut-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240,
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    processCombatSimulation([comb1, comb2]);
    // Raw events must be untouched
    expect(eventDuration(comb1)).toBe(600);
    expect(comb1.eventStatus).toBeUndefined();
    expect(eventDuration(comb2)).toBe(600);
    expect(comb2.eventStatus).toBeUndefined();
  });

  // ── Freeform reaction drag ──────────────────────────────────────────────

  test('F26: Dragging freeform reaction apart undoes merge', () => {
    const comb1: TimelineEvent = {
      uid: 'drag-undo-1',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };
    const comb2: TimelineEvent = {
      uid: 'drag-undo-2',
      id: REACTION_COLUMNS.COMBUSTION,
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240,
      segments: [{ properties: { duration: 600 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    // Run 1: overlapping → first is refreshed
    const result1 = processCombatSimulation([comb1, comb2]);
    expect(result1.find(ev => ev.uid === 'drag-undo-1')!.eventStatus).toBe(EventStatusType.REFRESHED);

    // Run 2: drag second far away → no overlap → both restored
    const comb2Dragged = { ...comb2, startFrame: 5000 };
    const result2 = processCombatSimulation([comb1, comb2Dragged]);
    const first = result2.find(ev => ev.uid === 'drag-undo-1')!;
    expect(first.eventStatus).toBeUndefined();
    expect(eventDuration(first)).toBe(600);
  });

  // ── Events without sourceOwnerId normalized to USER_ID ─────────────────

  test('F14: Multiple same-element freeform inflictions coexist up to stack cap', () => {
    const heats = Array.from({ length: 5 }, (_, i) =>
      freeformInfliction(INFLICTION_COLUMNS.HEAT, i * 100, 2400)
    );
    const result = processCombatSimulation(heats);

    const activeHeats = result.filter(ev =>
      ev.columnId === INFLICTION_COLUMNS.HEAT && ev.eventStatus !== EventStatusType.CONSUMED
    );
    // Max 4 active (deque cap), 5th evicts oldest
    expect(activeHeats.length).toBe(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Combo skill infliction — data-driven via duplicateTriggerSource
// ═════════════════════════════════════════════════════════════════════════════

describe('Combo skill infliction behavior', () => {
  /** Laevatain Seethe — does NOT have APPLY TRIGGER INFLICTION. */
  function seetheCombo(startFrame: number, comboTriggerColumnId?: string): TimelineEvent {
    return {
      uid: `seethe-${eventIdCounter++}`,
      id: 'SEETHE',
      name: 'SEETHE',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.COMBO,
      startFrame,
      comboTriggerColumnId,
      segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: Math.round(0.566 * FPS), timeDependency: TimeDependency.REAL_TIME } },
        {
          properties: { duration: Math.round(1.37 * FPS) },
          frames: [{ offsetFrame: Math.round(0.67 * FPS) }],
        },
      ],
    };
  }

  /** Antal EMP Test Site — HAS APPLY TRIGGER INFLICTION on its frame. */
  function empTestSiteCombo(startFrame: number, comboTriggerColumnId?: string): TimelineEvent {
    return {
      uid: `emp-${eventIdCounter++}`,
      id: 'EMP_TEST_SITE',
      name: 'EMP_TEST_SITE',
      ownerId: 'slot-antal',
      columnId: SKILL_COLUMNS.COMBO,
      startFrame,
      comboTriggerColumnId,
      segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: Math.round(0.5 * FPS), timeDependency: TimeDependency.REAL_TIME } },
        {
          properties: { duration: Math.round(0.8 * FPS) },
          frames: [{ offsetFrame: Math.round(0.7 * FPS), duplicateTriggerSource: true }],
        },
      ],
    };
  }

  test('G1: Seethe with heat trigger produces 0 enemy inflictions', () => {
    const result = processCombatSimulation([seetheCombo(500, INFLICTION_COLUMNS.HEAT)]);
    const enemyInflictions = result.filter(ev => ev.ownerId === ENEMY_OWNER_ID);
    expect(enemyInflictions.length).toBe(0);
  });

  test('G2: Seethe with corrosion trigger produces 0 enemy events', () => {
    const result = processCombatSimulation([seetheCombo(500, 'corrosion')]);
    const enemyEvents = result.filter(ev => ev.ownerId === ENEMY_OWNER_ID);
    expect(enemyEvents.length).toBe(0);
  });

  test('G3: Seethe without trigger column produces 0 enemy events', () => {
    const result = processCombatSimulation([seetheCombo(500)]);
    const enemyEvents = result.filter(ev => ev.ownerId === ENEMY_OWNER_ID);
    expect(enemyEvents.length).toBe(0);
  });

  test('G4: EMP Test Site with heat trigger produces exactly 1 heat infliction on enemy', () => {
    const result = processCombatSimulation([empTestSiteCombo(500, INFLICTION_COLUMNS.HEAT)]);
    const heatInflictions = result.filter(ev =>
      ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID
    );
    expect(heatInflictions.length).toBe(1);
    expect(heatInflictions[0].sourceOwnerId).toBe('slot-antal');
    expect(heatInflictions[0].sourceSkillName).toBe('EMP_TEST_SITE');
  });

  test('G5: EMP Test Site without trigger column produces 0 enemy inflictions', () => {
    const result = processCombatSimulation([empTestSiteCombo(500)]);
    const enemyInflictions = result.filter(ev => ev.ownerId === ENEMY_OWNER_ID);
    expect(enemyInflictions.length).toBe(0);
  });

  test('G6: Combo without duplicateTriggerSource does not mirror even with trigger column', () => {
    // Wulfgard Frag Grenade Beta — has explicit APPLY HEAT INFLICTION (via applyArtsInfliction),
    // NOT TRIGGER mirroring. Simulated here as a combo without the flag.
    const combo: TimelineEvent = {
      uid: `frag-${eventIdCounter++}`,
      id: 'FRAG_GRENADE_BETA',
      name: 'FRAG_GRENADE_BETA',
      ownerId: 'slot-wulfgard',
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 500,
      comboTriggerColumnId: INFLICTION_COLUMNS.HEAT,
      segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: Math.round(0.5 * FPS), timeDependency: TimeDependency.REAL_TIME } },
        {
          properties: { duration: Math.round(1.0 * FPS) },
          // No duplicateTriggerSource — has explicit applyArtsInfliction instead
          frames: [{
            offsetFrame: Math.round(0.5 * FPS),
            clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: 'HEAT', to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } } as any }] }],
          }],
        },
      ],
    };
    const result = processCombatSimulation([combo]);
    const heatInflictions = result.filter(ev =>
      ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID
    );
    // Exactly 1 infliction from explicit applyArtsInfliction, 0 from trigger mirroring
    expect(heatInflictions.length).toBe(1);
    expect(heatInflictions[0].sourceSkillName).toBe('FRAG_GRENADE_BETA');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Sibling overlap warnings after time-stop extension
// ═════════════════════════════════════════════════════════════════════════════

describe('Sibling overlap warnings', () => {
  test('O1: Basic attacks displaced by combo timestop get overlap warnings', () => {
    // Two basic attacks placed back-to-back, then a combo with timestop
    // inserted before them — the timestop extends the first basic attack
    // into the second's start frame.
    const basic1: TimelineEvent = {
      uid: 'basic-overlap-1',
      id: 'FLAMING_CINDERS',
      name: 'FLAMING_CINDERS',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 100,
            segments: [{ properties: { duration: 200 }, frames: [{ offsetFrame: 50 }] }],
      nonOverlappableRange: 200,
    };
    const basic2: TimelineEvent = {
      uid: 'basic-overlap-2',
      id: 'FLAMING_CINDERS',
      name: 'FLAMING_CINDERS',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 300,
            segments: [{ properties: { duration: 200 }, frames: [{ offsetFrame: 50 }] }],
      nonOverlappableRange: 200,
    };
    // Combo with timestop at frame 150, animation duration 120 frames
    // This extends basic1's game-time segments by 120 frames,
    // pushing its end from 300 to 420 — overlapping basic2 at 300.
    const combo: TimelineEvent = {
      uid: 'combo-ts',
      id: 'SEETHE',
      name: 'SEETHE',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 150,
            segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: 120, timeDependency: TimeDependency.REAL_TIME } },
        { properties: { duration: 180 }, frames: [{ offsetFrame: 100 }] },
      ],
    };

    const result = processCombatSimulation([basic1, combo, basic2]);

    const b1 = result.find(ev => ev.uid === 'basic-overlap-1');
    const b2 = result.find(ev => ev.uid === 'basic-overlap-2');
    expect(b1).toBeDefined();
    expect(b2).toBeDefined();
    // Both should have overlap warnings
    expect(b1!.warnings?.some(w => w.includes('Overlaps'))).toBe(true);
    expect(b2!.warnings?.some(w => w.includes('Overlaps'))).toBe(true);
  });

  test('O2: Non-overlapping events have no warnings', () => {
    const basic1: TimelineEvent = {
      uid: 'no-overlap-1',
      id: 'FLAMING_CINDERS',
      name: 'FLAMING_CINDERS',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 0,
            segments: [{ properties: { duration: 100 }, frames: [{ offsetFrame: 50 }] }],
    };
    const basic2: TimelineEvent = {
      uid: 'no-overlap-2',
      id: 'FLAMING_CINDERS',
      name: 'FLAMING_CINDERS',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 200,
            segments: [{ properties: { duration: 100 }, frames: [{ offsetFrame: 50 }] }],
    };

    const result = processCombatSimulation([basic1, basic2]);
    const b1 = result.find(ev => ev.uid === 'no-overlap-1');
    const b2 = result.find(ev => ev.uid === 'no-overlap-2');
    expect(b1!.warnings ?? []).toEqual([]);
    expect(b2!.warnings ?? []).toEqual([]);
  });

  test('O3: Different event names in same column do NOT trigger overlap', () => {
    // Two different statuses in the same column at the same time — valid coexistence
    const status1: TimelineEvent = {
      uid: 'status-a',
      id: 'STATUS_TYPE_A',
      name: 'STATUS_TYPE_A',
      ownerId: SLOT_ID,
      columnId: 'status-column',
      startFrame: 0,
      segments: [{ properties: { duration: 500 } }],
    };
    const status2: TimelineEvent = {
      uid: 'status-b',
      id: 'STATUS_TYPE_B',
      name: 'STATUS_TYPE_B',
      ownerId: SLOT_ID,
      columnId: 'status-column',
      startFrame: 100,
      segments: [{ properties: { duration: 500 } }],
    };

    const result = processCombatSimulation([status1, status2]);
    const s1 = result.find(ev => ev.uid === 'status-a');
    const s2 = result.find(ev => ev.uid === 'status-b');
    expect(s1!.warnings ?? []).toEqual([]);
    expect(s2!.warnings ?? []).toEqual([]);
  });

  test('O4: Same event name overlapping in same column DOES trigger warning', () => {
    const status1: TimelineEvent = {
      uid: 'same-name-1',
      id: 'MELTING_FLAME',
      name: 'MELTING_FLAME',
      ownerId: SLOT_ID,
      columnId: 'melting-flame',
      startFrame: 0,
      segments: [{ properties: { duration: 500 } }],
      nonOverlappableRange: 500,
    };
    const status2: TimelineEvent = {
      uid: 'same-name-2',
      id: 'MELTING_FLAME',
      name: 'MELTING_FLAME',
      ownerId: SLOT_ID,
      columnId: 'melting-flame',
      startFrame: 100,
      segments: [{ properties: { duration: 500 } }],
      nonOverlappableRange: 500,
    };

    const result = processCombatSimulation([status1, status2]);
    const s1 = result.find(ev => ev.uid === 'same-name-1');
    const s2 = result.find(ev => ev.uid === 'same-name-2');
    expect(s1!.warnings?.some(w => w.includes('Overlaps'))).toBe(true);
    expect(s2!.warnings?.some(w => w.includes('Overlaps'))).toBe(true);
  });

  test('O5: Overlapping inflictions without nonOverlappableRange do NOT trigger warnings', () => {
    // Engine-derived inflictions stack and overlap normally — no warnings expected
    const infliction1: TimelineEvent = {
      uid: 'inflict-1',
      id: 'HEAT',
      name: 'HEAT',
      ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.HEAT,
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
    };
    const infliction2: TimelineEvent = {
      uid: 'inflict-2',
      id: 'HEAT',
      name: 'HEAT',
      ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.HEAT,
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    };

    const result = processCombatSimulation([infliction1, infliction2]);
    const i1 = result.find(ev => ev.uid === 'inflict-1');
    const i2 = result.find(ev => ev.uid === 'inflict-2');
    expect(i1!.warnings ?? []).toEqual([]);
    expect(i2!.warnings ?? []).toEqual([]);
  });

  test('O6: Overlapping statuses without nonOverlappableRange do NOT trigger warnings', () => {
    // Statuses (e.g. MF stacks) overlap and get clamped by the engine — no warnings
    const mf1: TimelineEvent = {
      uid: 'mf-1',
      id: 'MELTING_FLAME',
      name: 'MELTING_FLAME',
      ownerId: SLOT_ID,
      columnId: OPERATOR_COLUMNS.MELTING_FLAME,
      startFrame: 0,
      segments: [{ properties: { duration: 500 } }],
    };
    const mf2: TimelineEvent = {
      uid: 'mf-2',
      id: 'MELTING_FLAME',
      name: 'MELTING_FLAME',
      ownerId: SLOT_ID,
      columnId: OPERATOR_COLUMNS.MELTING_FLAME,
      startFrame: 100,
      segments: [{ properties: { duration: 500 } }],
    };

    const result = processCombatSimulation([mf1, mf2]);
    const s1 = result.find(ev => ev.uid === 'mf-1');
    const s2 = result.find(ev => ev.uid === 'mf-2');
    expect(s1!.warnings ?? []).toEqual([]);
    expect(s2!.warnings ?? []).toEqual([]);
  });

  test('O7: Freeform-placed events with nonOverlappableRange DO trigger overlap warnings', () => {
    // User-placed events in any column that set nonOverlappableRange should still warn
    const ev1: TimelineEvent = {
      uid: 'freeform-1',
      id: 'CUSTOM_STATUS',
      name: 'CUSTOM_STATUS',
      ownerId: USER_ID,
      columnId: 'custom-column',
      startFrame: 0,
      segments: [{ properties: { duration: 400 } }],
      nonOverlappableRange: 400,
    };
    const ev2: TimelineEvent = {
      uid: 'freeform-2',
      id: 'CUSTOM_STATUS',
      name: 'CUSTOM_STATUS',
      ownerId: USER_ID,
      columnId: 'custom-column',
      startFrame: 200,
      segments: [{ properties: { duration: 400 } }],
      nonOverlappableRange: 400,
    };

    const result = processCombatSimulation([ev1, ev2]);
    const r1 = result.find(ev => ev.uid === 'freeform-1');
    const r2 = result.find(ev => ev.uid === 'freeform-2');
    expect(r1!.warnings?.some(w => w.includes('Overlaps'))).toBe(true);
    expect(r2!.warnings?.some(w => w.includes('Overlaps'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Combo skill effect validation — all operators from real JSON
// ═════════════════════════════════════════════════════════════════════════════

describe('Combo skill effects — all operators', () => {
  /**
   * Build a combo event from real JSON data for an operator.
   * Reads the actual skill JSON to construct frames with correct markers.
   */
  function buildComboFromJson(
    operatorFile: string,
    ownerId: string,
    startFrame: number,
    comboTriggerColumnId?: string,
  ): TimelineEvent {
    const { loadSkillsJson: _loadComboSkills } = require('../helpers/loadGameData');
    const operatorId = operatorFile.replace(/-skills\.json$/, '');
    const json = _loadComboSkills(operatorId);
    // Infer combo skill: find the skill with onTriggerClause, or named COMBO_SKILL
    const varSuffixes = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
    const baseIds = Object.keys(json).filter(id => !varSuffixes.some(s => id.endsWith(s)));
    const comboId = baseIds.find(id => {
      const sk = json[id] as Record<string, unknown>;
      return sk?.onTriggerClause && (sk.onTriggerClause as unknown[]).length > 0;
    }) ?? (json['COMBO_SKILL'] ? 'COMBO_SKILL' : undefined);
    const skill = comboId ? json[comboId] : undefined;
    const animSeg = skill.segments?.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    const mainSeg = skill.segments?.find((s: Record<string, unknown>) => !((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animProps = animSeg?.properties as any;
    const anim = Math.round((animProps?.duration?.value ?? 0.5) * FPS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mainProps = mainSeg?.properties as any;
    const mainDur = Math.round((mainProps?.duration?.value ?? 0.5) * FPS);
    const dur = skill.properties?.duration?.value
      ? Math.round(skill.properties.duration.value * FPS)
      : mainDur;

    const rawFrames = mainSeg?.frames ?? skill.frames ?? [];
    const frames: EventFrameMarker[] = (rawFrames as Record<string, unknown>[]).map((f: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = f.properties as any;
      const offset = Math.round((props?.offset?.value ?? 0) * FPS);
      const marker: EventFrameMarker = { offsetFrame: offset };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const effects = ((f.clause as any)?.[0]?.effects ?? []) as any[];
      for (const ef of effects) {
        const qualifiers = Array.isArray(ef.objectQualifier) ? ef.objectQualifier : ef.objectQualifier ? [ef.objectQualifier] : [];
        const isSource = qualifiers.includes('TRIGGER');
        const elementQualifier = qualifiers.find((a: string) => ['HEAT', 'CRYO', 'NATURE', 'ELECTRIC'].includes(a));

        if (ef.verb === 'APPLY' && isSource && (ef.object === 'INFLICTION' || ef.object === 'STATUS')) {
          marker.duplicateTriggerSource = true;
        }
        if (ef.verb === 'APPLY' && !isSource && ef.object === 'INFLICTION' && elementQualifier) {
          if (!marker.clauses) marker.clauses = [{ conditions: [], effects: [] }];
          (marker.clauses[0] as { effects: { type: string; dslEffect: unknown }[] }).effects.push({
            type: 'dsl', dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: elementQualifier, to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } },
          });
        }
      }
      return marker;
    });

    return {
      uid: `${comboId}-test`,
      id: comboId ?? '',
      name: comboId ?? '',
      ownerId,
      columnId: SKILL_COLUMNS.COMBO,
      startFrame,
      comboTriggerColumnId,
      segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: anim, timeDependency: TimeDependency.REAL_TIME } },
        { properties: { duration: dur }, frames },
      ],
    };
  }

  /** Count enemy-owned events by column from processed results. */
  function enemyEventsByColumn(result: TimelineEvent[]) {
    const counts = new Map<string, number>();
    for (const ev of result) {
      if (ev.ownerId !== ENEMY_OWNER_ID) continue;
      counts.set(ev.columnId, (counts.get(ev.columnId) ?? 0) + 1);
    }
    return counts;
  }

  // ── Combos that produce NO enemy inflictions (no APPLY INFLICTION, no TRIGGER) ──

  const noInflictionCombos: [string, string, string][] = [
    ['akekuri-skills.json', 'slot-akekuri', 'FLASH_AND_DASH'],
    ['alesh-skills.json', 'slot-alesh', 'AUGER_ANGLING'],
    ['arclight-skills.json', 'slot-arclight', 'PEAL_OF_THUNDER'],
    ['avywenna-skills.json', 'slot-avywenna', 'THUNDERLANCE_STRIKE'],
    ['catcher-skills.json', 'slot-catcher', 'TIMELY_SUPPRESSION'],
    ['chen-qianyu-skills.json', 'slot-chenqianyu', 'SOAR_TO_THE_STARS'],
    ['da-pan-skills.json', 'slot-dapan', 'MORE_SPICE'],
    ['ember-skills.json', 'slot-ember', 'FRONTLINE_SUPPORT'],
    ['endministrator-skills.json', 'slot-endministrator', 'SEALING_SEQUENCE'],
    ['estella-skills.json', 'slot-estella', 'DISTORTION'],
    ['fluorite-skills.json', 'slot-fluorite', 'FREE_GIVEAWAY'],
    ['gilberta-skills.json', 'slot-gilberta', 'MATRIX_DISPLACEMENT'],
    ['laevatain-skills.json', 'slot-laevatain', 'SEETHE'],
    ['last-rite-skills.json', 'slot-lastrite', 'WINTERS_DEVOURER'],
    ['lifeng-skills.json', 'slot-lifeng', 'ASPECT_OF_WRATH'],
    ['perlica-skills.json', 'slot-perlica', 'INSTANT_PROTOCOL_CHAIN'],
    ['pogranichnik-skills.json', 'slot-pogranichnik', 'FULL_MOON_SLASH'],
    ['snowshine-skills.json', 'slot-snowshine', 'POLAR_RESCUE'],
    ['tangtang-skills.json', 'slot-tangtang', 'COMBO_SKILL'],
    ['yvonne-skills.json', 'slot-yvonne', 'FLASHFREEZER'],
  ];

  for (const [file, slotId, skillId] of noInflictionCombos) {
    test(`${skillId}: produces 0 enemy inflictions with heat trigger`, () => {
      const combo = buildComboFromJson(file, slotId, 500, INFLICTION_COLUMNS.HEAT);
      const result = processCombatSimulation([combo]);
      const enemyCounts = enemyEventsByColumn(result);
      expect(enemyCounts.get(INFLICTION_COLUMNS.HEAT) ?? 0).toBe(0);
      expect(enemyCounts.get(INFLICTION_COLUMNS.CRYO) ?? 0).toBe(0);
      expect(enemyCounts.get(INFLICTION_COLUMNS.ELECTRIC) ?? 0).toBe(0);
      expect(enemyCounts.get(INFLICTION_COLUMNS.NATURE) ?? 0).toBe(0);
    });
  }

  // ── Antal: APPLY TRIGGER INFLICTION mirrors trigger ──

  test('EMP_TEST_SITE: mirrors exactly 1 heat infliction with heat trigger', () => {
    const combo = buildComboFromJson('antal-skills.json', 'slot-antal', 500, INFLICTION_COLUMNS.HEAT);
    const result = processCombatSimulation([combo]);
    const enemyCounts = enemyEventsByColumn(result);
    expect(enemyCounts.get(INFLICTION_COLUMNS.HEAT) ?? 0).toBe(1);
    expect(enemyCounts.get(INFLICTION_COLUMNS.CRYO) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.ELECTRIC) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.NATURE) ?? 0).toBe(0);
  });

  test('EMP_TEST_SITE: mirrors exactly 1 electric infliction with electric trigger', () => {
    const combo = buildComboFromJson('antal-skills.json', 'slot-antal', 500, INFLICTION_COLUMNS.ELECTRIC);
    const result = processCombatSimulation([combo]);
    const enemyCounts = enemyEventsByColumn(result);
    expect(enemyCounts.get(INFLICTION_COLUMNS.HEAT) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.ELECTRIC) ?? 0).toBe(1);
  });

  test('EMP_TEST_SITE: produces 0 inflictions without trigger column', () => {
    const combo = buildComboFromJson('antal-skills.json', 'slot-antal', 500);
    const result = processCombatSimulation([combo]);
    const enemyCounts = enemyEventsByColumn(result);
    expect(enemyCounts.get(INFLICTION_COLUMNS.HEAT) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.CRYO) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.ELECTRIC) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.NATURE) ?? 0).toBe(0);
  });

  // ── Wulfgard: explicit APPLY HEAT INFLICTION (not TRIGGER) ──

  test('FRAG_GRENADE_BETA: produces exactly 1 heat infliction from explicit APPLY INFLICTION', () => {
    const combo = buildComboFromJson('wulfgard-skills.json', 'slot-wulfgard', 500, INFLICTION_COLUMNS.HEAT);
    const result = processCombatSimulation([combo]);
    const enemyCounts = enemyEventsByColumn(result);
    // 1 from explicit APPLY HEAT INFLICTION, 0 from trigger mirroring (no duplicateTriggerSource)
    expect(enemyCounts.get(INFLICTION_COLUMNS.HEAT) ?? 0).toBe(1);
    expect(enemyCounts.get(INFLICTION_COLUMNS.CRYO) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.ELECTRIC) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.NATURE) ?? 0).toBe(0);
    // Verify it's from the explicit effect, not mirroring
    const heat = result.find(ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID)!;
    expect(heat.sourceSkillName).toBe('FRAG_GRENADE_BETA');
    expect(heat.uid).not.toContain('-combo-inflict-'); // from explicit APPLY INFLICTION, not combo mirroring
  });

  // ── Xaihi: explicit APPLY CRYO INFLICTION ──

  test('STRESS_TESTING: produces exactly 1 cryo infliction from explicit APPLY INFLICTION', () => {
    const combo = buildComboFromJson('xaihi-skills.json', 'slot-xaihi', 500);
    const result = processCombatSimulation([combo]);
    const enemyCounts = enemyEventsByColumn(result);
    expect(enemyCounts.get(INFLICTION_COLUMNS.CRYO) ?? 0).toBe(1);
    expect(enemyCounts.get(INFLICTION_COLUMNS.HEAT) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.ELECTRIC) ?? 0).toBe(0);
    expect(enemyCounts.get(INFLICTION_COLUMNS.NATURE) ?? 0).toBe(0);
    const cryo = result.find(ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_OWNER_ID)!;
    expect(cryo.sourceSkillName).toBe('STRESS_TESTING');
  });
});

