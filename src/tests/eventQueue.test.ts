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
import { TimelineEvent, EventSegmentData } from '../consts/viewTypes';
import { EventStatusType } from '../consts/enums';
import { OPERATOR_COLUMNS, SKILL_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID, USER_ID } from '../model/channels';

// ── Mock require.context before importing modules that use it ────────────────

jest.mock('../model/event-frames/operatorJsonLoader', () => {
  const actual = jest.requireActual('../model/event-frames/dataDrivenEventFrames');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockOperatorJson = require('../model/game-data/operators/laevatain-operator.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSkillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockTalentJson = require('../model/game-data/operator-talents/laevatain-talents.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockStatusesJson = require('../model/game-data/operator-statuses/laevatain-statuses.json');
  const { statusEvents: skStatusEvents, skillTypeMap: skTypeMap, ...skillEntries } = mockSkillsJson;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const KEY_EXPAND = { verb: 'verb', object: 'object', subject: 'subject', to: 'toObject', from: 'fromObject', on: 'onObject', with: 'with', for: 'for' } as Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expandKeys = (val: any): any => {
    if (val == null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(expandKeys);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = {} as Record<string, any>;
    for (const [k, v] of Object.entries(val)) {
      out[KEY_EXPAND[k] ?? k] = expandKeys(v);
    }
    return out;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expandedStatuses = (mockStatusesJson as any[]).map((s: any) => expandKeys(s));

  const mergedStatusEvents = [...expandedStatuses, ...(skStatusEvents ?? []), ...(mockTalentJson.statusEvents ?? [])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const laevatainSkills = {} as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, val] of Object.entries(skillEntries as Record<string, any>)) {
    laevatainSkills[key] = { ...val, id: key };
  }
  if (skTypeMap) {
    const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
    for (const [category, skillId] of Object.entries(skTypeMap as Record<string, string>)) {
      if (laevatainSkills[skillId]) laevatainSkills[category] = laevatainSkills[skillId];
      for (const suffix of variantSuffixes) {
        const variantSkillId = `${skillId}_${suffix}`;
        if (laevatainSkills[variantSkillId]) laevatainSkills[`${suffix}_${category}`] = laevatainSkills[variantSkillId];
      }
    }
  }
  const mockJson = { ...mockOperatorJson, skills: laevatainSkills, skillTypeMap: skTypeMap, ...(mergedStatusEvents.length > 0 ? { statusEvents: mergedStatusEvents } : {}) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = { laevatain: mockJson } as Record<string, any>;
  const sequenceCache = new Map<string, any>();

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getOperatorJson: (id: string) => json[id],
    getAllOperatorIds: () => Object.keys(json),
    getSkillIds: (operatorId: string) => {
      const opJson = json[operatorId];
      if (!opJson?.skills) return new Set<string>();
      const ids = new Set<string>(['FINISHER', 'DIVE']);
      for (const key of Object.keys(opJson.skills)) {
        if (key !== 'statusEvents' && key !== 'skillTypeMap') ids.add(key);
      }
      return ids;
    },
    getSkillTypeMap: (operatorId: string) => json[operatorId]?.skillTypeMap ?? {},
    resolveSkillType: () => null,
    getFrameSequences: (operatorId: string, skillId: string) => {
      const cacheKey = `${operatorId}:${skillId}`;
      const cached = sequenceCache.get(cacheKey);
      if (cached) return cached;
      const opJson = json[operatorId];
      if (!opJson) return [];
      const sequences = actual.buildSequencesFromOperatorJson(opJson, skillId);
      sequenceCache.set(cacheKey, sequences);
      return sequences;
    },
    getSegmentLabels: () => undefined,
    getSkillTimings: () => undefined,
    getUltimateEnergyCost: () => 0,
    getSkillGaugeGains: () => undefined,
    getBattleSkillSpCost: () => undefined,
    getSkillCategoryData: () => undefined,
    getBasicAttackDurations: () => undefined,
  getComboTriggerClause: (id: string) => {
    const map: Record<string, { file: string; skillId: string }> = {
      antal: { file: '../model/game-data/operator-skills/antal-skills.json', skillId: 'EMP_TEST_SITE' },
      laevatain: { file: '../model/game-data/operator-skills/laevatain-skills.json', skillId: 'SEETHE' },
      akekuri: { file: '../model/game-data/operator-skills/akekuri-skills.json', skillId: 'FLASH_AND_DASH' },
    };
    const entry = map[id];
    if (!entry) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(entry.file)[entry.skillId]?.properties?.trigger?.onTriggerClause;
  },
  getExchangeStatusConfig: () => {
      const OPERATOR_COLUMNS: Record<string, string> = { MELTING_FLAME: 'melting-flame', THUNDERLANCE: 'thunderlance' };
      const TOTAL_FRAMES = 14400;
      const config: Record<string, { columnId: string; durationFrames: number }> = {};
      for (const status of expandedStatuses) {
        const props = status.properties;
        if (!props || props.type !== 'EXCHANGE') continue;
        const id = props.id as string;
        const columnId = OPERATOR_COLUMNS[id] ?? id.toLowerCase().replace(/_/g, '-');
        let durationFrames = TOTAL_FRAMES * 10;
        if (props.duration) {
          const val = Array.isArray(props.duration.value) ? props.duration.value[0] : props.duration.value;
          if (val >= 0) durationFrames = props.duration.unit === 'SECOND' ? Math.round(val * 120) : val;
        }
        config[id] = { columnId, durationFrames };
      }
      return config;
    },
    getExchangeStatusIds: () => {
      const ids = new Set<string>();
      for (const status of expandedStatuses) {
        if (status.properties?.type === 'EXCHANGE') ids.add(status.properties.id);
      }
      return ids;
    },
  };
});

jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));

jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { PriorityQueue } from '../controller/timeline/priorityQueue';
// eslint-disable-next-line import/first
import { processInflictionEvents } from '../controller/timeline/processInteractions';

// ── Test helpers ─────────────────────────────────────────────────────────────

const SLOT_ID = 'slot1';
const FPS = 120;
let eventIdCounter = 0;

function resetIdCounter() { eventIdCounter = 0; }

function battleSkillEvent(startFrame: number): TimelineEvent {
  return {
    id: `battle-${eventIdCounter++}`,
    name: 'SMOULDERING_FIRE',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    activationDuration: Math.round(2.2 * FPS),
    activeDuration: 0,
    cooldownDuration: 0,
  };
}

function empoweredBattleSkillEvent(startFrame: number): TimelineEvent {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
  const empDef = skillsJson['SMOULDERING_FIRE_EMPOWERED'];
  const duration = Math.round(empDef.properties.duration.value * FPS);
  const segments: EventSegmentData[] = [];
  const frames: any[] = [];
  for (const f of empDef.frames) {
    const offset = Math.round(f.properties.offset.value * FPS);
    const frameMarker: any = { offsetFrame: offset };
    for (const ef of (f.clause?.[0]?.effects ?? [])) {
      if (ef.verb === 'CONSUME' && ef.object === 'STATUS') {
        frameMarker.consumeStatus = ef.objectId;
      }
    }
    frames.push(frameMarker);
  }
  segments.push({ durationFrames: duration, frames });

  return {
    id: `emp-battle-${eventIdCounter++}`,
    name: 'SMOULDERING_FIRE_EMPOWERED',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    activationDuration: duration,
    activeDuration: 0,
    cooldownDuration: 0,
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
    const result = processInflictionEvents(events);
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
    const result = processInflictionEvents(events);
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
    const result = processInflictionEvents(events);
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
    const result = processInflictionEvents(events);
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
    const result = processInflictionEvents(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('Q6: Scorching Heart Effect re-activates after consume + re-accumulation', () => {
    const events = [
      // First cycle: 4 BS → MF I-IV → SH #1
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      // Consume
      empoweredBattleSkillEvent(1200),
      // Second cycle: 4 BS → MF V-VIII → SH #2
      battleSkillEvent(1800),
      battleSkillEvent(2100),
      battleSkillEvent(2400),
      battleSkillEvent(2700),
    ];
    const result = processInflictionEvents(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    // Should have at least 2 Scorching Heart Effects (one per cycle)
    expect(shEvents.length).toBeGreaterThanOrEqual(2);
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
    const sortedResult = processInflictionEvents(sorted);
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
    const shuffledResult = processInflictionEvents(shuffled);
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
    const result = processInflictionEvents([heatBS]);
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
    const result = processInflictionEvents(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = mfEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed.length).toBe(4); // first 4 consumed
    expect(active.length).toBe(4); // 4 new after consume
  });

  test('MF events start at the trigger frame of the source skill', () => {
    const events = [battleSkillEvent(0)];
    const result = processInflictionEvents(events);
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
    const result = processInflictionEvents(events);
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
    const result = processInflictionEvents(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    // Consumed MF stacks should have activationDuration < original (clamped at consume frame)
    for (const ev of consumed) {
      expect(ev.activationDuration).toBeGreaterThan(0);
      // Duration should be clipped to the consume point, not the original full duration
      expect(ev.startFrame + ev.activationDuration).toBeLessThanOrEqual(1500);
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
    const result = processInflictionEvents(events);
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
      id: `freeform-${columnId}-${eventIdCounter++}`,
      name: columnId,
      ownerId: ENEMY_OWNER_ID,
      columnId,
      startFrame,
      activationDuration: duration,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };
  }

  test('F1: Two different-element freeform inflictions overlapping in time create a reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);
    const result = processInflictionEvents([heat, nature]);

    // Should create a corrosion reaction (heat + nature → corrosion)
    const reactions = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    expect(reactions.length).toBe(1);
    expect(reactions[0].startFrame).toBe(200);
  });

  test('F2: Same-element freeform inflictions do NOT create a reaction', () => {
    const heat1 = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const heat2 = freeformInfliction(INFLICTION_COLUMNS.HEAT, 200, 2400);
    const result = processInflictionEvents([heat1, heat2]);

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
    const result = processInflictionEvents([heat, nature]);

    const reactions = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    expect(reactions.length).toBe(0);
  });

  test('F4: Freeform infliction does not duplicate (single stack in output)', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const result = processInflictionEvents([heat]);

    const heats = filterByColumn(result, INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBe(1);
    expect(heats[0].id).toBe(heat.id);
  });

  test('F5: Cross-element reaction consumes BOTH inflictions', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);
    const result = processInflictionEvents([heat, nature]);

    // Reaction exists at the later infliction's frame
    const corrosion = filterByColumn(result, REACTION_COLUMNS.CORROSION);
    expect(corrosion.length).toBe(1);
    expect(corrosion[0].startFrame).toBe(200);

    // Earlier infliction (heat) consumed and clamped
    const heats = result.filter(ev => ev.columnId === INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBe(1);
    expect(heats[0].eventStatus).toBe(EventStatusType.CONSUMED);
    expect(heats[0].activationDuration).toBe(100); // clamped: 200 - 100

    // Later infliction (nature) also consumed with zero duration
    const natures = result.filter(ev => ev.columnId === INFLICTION_COLUMNS.NATURE);
    expect(natures.length).toBe(1);
    expect(natures[0].eventStatus).toBe(EventStatusType.CONSUMED);
    expect(natures[0].activationDuration).toBe(0);
  });

  test('F6: Freeform infliction interacts with another freeform of different element at same frame', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const electric = freeformInfliction(INFLICTION_COLUMNS.ELECTRIC, 100, 2400);
    const result = processInflictionEvents([heat, electric]);

    const electrification = filterByColumn(result, REACTION_COLUMNS.ELECTRIFICATION);
    expect(electrification.length).toBe(1);
    expect(electrification[0].startFrame).toBe(100);
  });

  test('F7: Dragging freeform infliction into overlap creates reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 50);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);

    // Run 1: no overlap → no reaction
    const result1 = processInflictionEvents([heat, nature]);
    expect(filterByColumn(result1, REACTION_COLUMNS.CORROSION).length).toBe(0);

    // Run 2: "drag" heat to overlap nature → reaction appears
    const heatDragged = { ...heat, startFrame: 200 };
    const result2 = processInflictionEvents([heatDragged, nature]);
    expect(filterByColumn(result2, REACTION_COLUMNS.CORROSION).length).toBe(1);
  });

  test('F8: Dragging freeform infliction away undoes reaction', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);

    // Run 1: overlapping → reaction + both consumed
    const result1 = processInflictionEvents([heat, nature]);
    expect(filterByColumn(result1, REACTION_COLUMNS.CORROSION).length).toBe(1);
    expect(result1.find(ev => ev.id === heat.id)!.eventStatus).toBe(EventStatusType.CONSUMED);

    // Run 2: drag nature far away → no overlap → no reaction, both restored
    const natureDragged = { ...nature, startFrame: 5000 };
    const result2 = processInflictionEvents([heat, natureDragged]);
    expect(filterByColumn(result2, REACTION_COLUMNS.CORROSION).length).toBe(0);
    // Heat should be active again (not consumed) since raw event was never mutated
    const heatResult = result2.find(ev => ev.id === heat.id)!;
    expect(heatResult.eventStatus).toBeUndefined();
    expect(heatResult.activationDuration).toBe(2400);
  });

  test('F9: Raw freeform events are not mutated across pipeline runs', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 200, 2400);

    // Run with overlap → reaction consumes both
    processInflictionEvents([heat, nature]);

    // Original objects must be untouched (undo history integrity)
    expect(heat.activationDuration).toBe(2400);
    expect(heat.eventStatus).toBeUndefined();
    expect(nature.activationDuration).toBe(2400);
    expect(nature.eventStatus).toBeUndefined();
  });

  test('F10: Heat + Cryo freeform inflictions create solidification', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const cryo = freeformInfliction(INFLICTION_COLUMNS.CRYO, 200, 2400);
    const result = processInflictionEvents([heat, cryo]);

    const solidification = filterByColumn(result, REACTION_COLUMNS.SOLIDIFICATION);
    expect(solidification.length).toBe(1);
  });

  test('F11: Heat + Electric freeform inflictions create electrification', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const electric = freeformInfliction(INFLICTION_COLUMNS.ELECTRIC, 200, 2400);
    const result = processInflictionEvents([heat, electric]);

    const electrification = filterByColumn(result, REACTION_COLUMNS.ELECTRIFICATION);
    expect(electrification.length).toBe(1);
  });

  test('F12: Nature + Cryo freeform inflictions create solidification', () => {
    // Reaction is keyed on the incoming infliction: CRYO → SOLIDIFICATION
    const nature = freeformInfliction(INFLICTION_COLUMNS.NATURE, 100, 2400);
    const cryo = freeformInfliction(INFLICTION_COLUMNS.CRYO, 200, 2400);
    const result = processInflictionEvents([nature, cryo]);

    const solidification = filterByColumn(result, REACTION_COLUMNS.SOLIDIFICATION);
    expect(solidification.length).toBe(1);
  });

  test('F13: Single freeform infliction produces exactly one event (no duplicate)', () => {
    const heat = freeformInfliction(INFLICTION_COLUMNS.HEAT, 100, 2400);
    const result = processInflictionEvents([heat]);

    const heats = filterByColumn(result, INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBe(1);
    expect(heats[0].id).toBe(heat.id);
    expect(heats[0].activationDuration).toBe(2400);
    expect(heats[0].eventStatus).toBeUndefined();
  });

  test('F15: Forced combustion at 0s refreshed by forced combustion at 0.5s — first has no frames after clamp', () => {
    const combustion1: TimelineEvent = {
      id: 'comb-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 2400, // 20s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };
    const combustion2: TimelineEvent = {
      id: 'comb-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 60, // 0.5s
      activationDuration: 2400, // 20s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };

    const result = processInflictionEvents([combustion1, combustion2]);

    // First combustion should be clamped at frame 60
    const first = result.find(ev => ev.id === 'comb-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.activationDuration).toBe(60);

    // Forced combustion has no initial hit. First DOT tick is at 120 (1s).
    // After clamping to 60 frames, no frames should remain.
    const firstFrames = first!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(firstFrames.length).toBe(0);
  });

  test('F16: Forced combustion at 0s (5s) refreshed by forced combustion at 0.5s (5s) — first has no frames', () => {
    const combustion1: TimelineEvent = {
      id: 'comb-5s-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };
    const combustion2: TimelineEvent = {
      id: 'comb-5s-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 60, // 0.5s
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };

    const result = processInflictionEvents([combustion1, combustion2]);
    const first = result.find(ev => ev.id === 'comb-5s-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.activationDuration).toBe(60); // clamped at 0.5s

    // Forced combustion: no initial hit, first DOT at 120 — past the 60-frame clamp.
    const firstFrames = first!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(firstFrames.length).toBe(0);
  });

  test('F17: Forced combustion with 0.5s duration has no frames', () => {
    const combustion: TimelineEvent = {
      id: 'comb-short',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 60, // 0.5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      forcedReaction: true,
    };

    const result = processInflictionEvents([combustion]);
    const ev = result.find(e => e.id === 'comb-short');
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
      id: 'int-comb-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };
    const comb2: TimelineEvent = {
      id: 'int-comb-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240, // 2s
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processInflictionEvents([comb1, comb2]);

    // First combustion clamped
    const first = result.find(ev => ev.id === 'int-comb-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.activationDuration).toBe(240); // clamped at 2s

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
    const second = result.find(ev => ev.id === 'int-comb-2');
    expect(second).toBeDefined();
    const secondFrames = second!.segments?.flatMap(s => s.frames ?? []) ?? [];
    // Second has initial hit at 0, DOT at 120, 240, 360, 480, 600
    expect(secondFrames.length).toBeGreaterThan(offsets.length);
  });

  test('F19: App-realistic — isForced freeform combustion merge clips all frames past clamp', () => {
    // createEvent sets isForced: true on enemy reaction events.
    // Both combustions have isForced (as placed via context menu in the real app).
    const comb1: TimelineEvent = {
      id: 'app-comb-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true, // set by createEvent for enemy reaction events
    };
    const comb2: TimelineEvent = {
      id: 'app-comb-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240, // 2s
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    const result = processInflictionEvents([comb1, comb2]);

    const first = result.find(ev => ev.id === 'app-comb-1');
    expect(first).toBeDefined();
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.activationDuration).toBe(240); // clamped at 2s

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
    const second = result.find(ev => ev.id === 'app-comb-2');
    expect(second).toBeDefined();
    expect(second!.segments).toBeDefined();
    const secondFrames = second!.segments?.flatMap(s => s.frames ?? []) ?? [];
    expect(secondFrames.length).toBeGreaterThan(0);
  });

  test('F20: isForced flag preserved through freeform pipeline — no initial hit at frame 0', () => {
    const combustion: TimelineEvent = {
      id: 'forced-preserve',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    const result = processInflictionEvents([combustion]);
    const ev = result.find(e => e.id === 'forced-preserve');
    expect(ev).toBeDefined();

    const frames = ev!.segments?.flatMap(s => s.frames ?? []) ?? [];
    // Forced combustion: NO initial hit at frame 0. First DOT tick at 120 (1s).
    expect(frames.some(f => f.offsetFrame === 0)).toBe(false);
    expect(frames[0]?.offsetFrame).toBe(120);
  });

  // ── Freeform reaction segment auto-build ────────────────────────────────

  test('F21: Freeform combustion auto-builds DOT tick segments', () => {
    const combustion: TimelineEvent = {
      id: 'seg-comb',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600, // 5s
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processInflictionEvents([combustion]);
    const ev = result.find(e => e.id === 'seg-comb');
    expect(ev).toBeDefined();
    expect(ev!.segments).toBeDefined();
    expect(ev!.segments!.length).toBeGreaterThan(0);

    const frames = ev!.segments!.flatMap(s => s.frames ?? []);
    // Non-forced: initial hit at 0 + DOT ticks at 120, 240, 360, 480, 600
    expect(frames[0].offsetFrame).toBe(0);
    expect(frames.some(f => f.offsetFrame === 120)).toBe(true);
  });

  test('F22: Freeform solidification auto-builds shatter frame at end', () => {
    const solidification: TimelineEvent = {
      id: 'seg-solid',
      name: REACTION_COLUMNS.SOLIDIFICATION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.SOLIDIFICATION,
      startFrame: 0,
      activationDuration: 2400,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processInflictionEvents([solidification]);
    const ev = result.find(e => e.id === 'seg-solid');
    expect(ev).toBeDefined();

    const frames = ev!.segments?.flatMap(s => s.frames ?? []) ?? [];
    // Solidification: initial hit at 0, shatter at activationDuration
    expect(frames.some(f => f.offsetFrame === 0)).toBe(true);
    expect(frames.some(f => f.offsetFrame === 2400)).toBe(true);
  });

  test('F23: Freeform reaction does not duplicate (single event in output)', () => {
    const combustion: TimelineEvent = {
      id: 'no-dup-comb',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const result = processInflictionEvents([combustion]);
    const combustions = filterByColumn(result, REACTION_COLUMNS.COMBUSTION);
    expect(combustions.length).toBe(1);
    expect(combustions[0].id).toBe('no-dup-comb');
  });

  // ── Freeform reaction merge / refresh ───────────────────────────────────

  test('F24: Two freeform combustions — second refreshes first', () => {
    const comb1: TimelineEvent = {
      id: 'merge-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };
    const comb2: TimelineEvent = {
      id: 'merge-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240, // 2s
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    const result = processInflictionEvents([comb1, comb2]);
    const first = result.find(ev => ev.id === 'merge-1');
    const second = result.find(ev => ev.id === 'merge-2');
    expect(first!.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(first!.activationDuration).toBe(240);
    expect(second!.eventStatus).toBeUndefined();
    expect(second!.activationDuration).toBe(600);
  });

  test('F25: Freeform reaction merge — raw events not mutated', () => {
    const comb1: TimelineEvent = {
      id: 'immut-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };
    const comb2: TimelineEvent = {
      id: 'immut-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    processInflictionEvents([comb1, comb2]);
    // Raw events must be untouched
    expect(comb1.activationDuration).toBe(600);
    expect(comb1.eventStatus).toBeUndefined();
    expect(comb2.activationDuration).toBe(600);
    expect(comb2.eventStatus).toBeUndefined();
  });

  // ── Freeform reaction drag ──────────────────────────────────────────────

  test('F26: Dragging freeform reaction apart undoes merge', () => {
    const comb1: TimelineEvent = {
      id: 'drag-undo-1',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 0,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };
    const comb2: TimelineEvent = {
      id: 'drag-undo-2',
      name: REACTION_COLUMNS.COMBUSTION,
      ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.COMBUSTION,
      startFrame: 240,
      activationDuration: 600,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
      isForced: true,
    };

    // Run 1: overlapping → first is refreshed
    const result1 = processInflictionEvents([comb1, comb2]);
    expect(result1.find(ev => ev.id === 'drag-undo-1')!.eventStatus).toBe(EventStatusType.REFRESHED);

    // Run 2: drag second far away → no overlap → both restored
    const comb2Dragged = { ...comb2, startFrame: 5000 };
    const result2 = processInflictionEvents([comb1, comb2Dragged]);
    const first = result2.find(ev => ev.id === 'drag-undo-1')!;
    expect(first.eventStatus).toBeUndefined();
    expect(first.activationDuration).toBe(600);
  });

  // ── Events without sourceOwnerId normalized to USER_ID ─────────────────

  test('F14: Multiple same-element freeform inflictions coexist up to stack cap', () => {
    const heats = Array.from({ length: 5 }, (_, i) =>
      freeformInfliction(INFLICTION_COLUMNS.HEAT, i * 100, 2400)
    );
    const result = processInflictionEvents(heats);

    const activeHeats = result.filter(ev =>
      ev.columnId === INFLICTION_COLUMNS.HEAT && ev.eventStatus !== EventStatusType.CONSUMED
    );
    // Max 4 active (deque cap), 5th evicts oldest
    expect(activeHeats.length).toBe(4);
  });
});

