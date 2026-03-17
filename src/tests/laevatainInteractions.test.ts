/**
 * Laevatain — Combat Simulation Tests
 *
 * Controller-level tests validating Laevatain's operator interactions.
 * No UI, no DOM — pure engine logic against operator JSON data.
 * See combatTestingSpec.md for the full specification and exploration strategy.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. Melting Flame Stacking
 *    - Battle skill frame 1 applies MELTING_FLAME to LAEVATAIN (operator-targeted)
 *    - Combo skill frame applies MELTING_FLAME to LAEVATAIN
 *    - Max 4 stacks enforced by derivation engine
 *    - Indefinite duration (TOTAL_FRAMES = 108000)
 *    - 5th battle skill at max stacks triggers consumption (empowered path)
 *    - Active count never exceeds 4 across any number of battle skills
 *
 * B. Scorching Heart Threshold (Talent 1 — Resistance Ignore)
 *    - 4 MF stacks → exactly 1 Scorching Heart on enemy (RESET interaction)
 *    - Below 4 stacks → no Scorching Heart
 *    - No re-trigger on wasted stacks (only on 3→4 crossing)
 *    - Duration: 20s (2400 frames)
 *    - Heat Resistance Ignore scales by talent level: [10, 15, 20]
 *    - Accumulation cycles: consume → re-accumulate → new SH (RESET clamps previous)
 *
 * B2. Melting Flame Consumption
 *    - Empowered battle skill last frame: CONSUME STATUS MELTING_FLAME
 *    - Battle skill at max stacks clamps all 4 MF event durations
 *    - Post-consumption: new battle skills create fresh MF stacks
 *    - Consume-reaccumulate cycle triggers new Scorching Heart
 *    - Multiple cycles work (3 cycles → 3 Scorching Hearts)
 *
 * C. Empowered Battle Skill & Combustion
 *    - Empowered BS last frame: APPLY FORCED COMBUSTION to enemy
 *    - Normal BS: no forced Combustion on any frame
 *    - Raw BS frame has MELTING_FLAME infliction (End-Axis data)
 *    - Combustion duration: 5s (from multiplier data)
 *
 * D. Combo Skill (Seethe) Triggers
 *    - Trigger clause: ENEMY IS COMBUSTED or ENEMY IS CORRODED (OR logic)
 *    - Activation window: 720 frames (6s)
 *    - Stagger recovery: 10 on first frame
 *
 * E. Ultimate & Enhanced Variants
 *    - ENHANCED_BASIC_ATTACK: 4 segments, segment 3 applies HEAT infliction
 *    - ENHANCED_BATTLE_SKILL: exists with correct ID
 *    - ENHANCED_EMPOWERED_BATTLE_SKILL: exists
 *    - Normal basic attack: no Heat infliction
 *    - Ultimate: 15s active, 300 energy cost
 *
 * F. Potentials
 *    - P1: +20 SP Return (ADDITIVE) + ×1.2 UNIQUE_MULTIPLIER on Smouldering Fire
 *    - P3: ×1.5 Combustion REACTION_MULTIPLIER
 *    - P4: ×0.85 Twilight energy cost
 *    - P5: Proof of Existence BUFF_ATTACHMENT + ×1.2 on enhanced basic
 *
 * G. Chain Interactions
 *    - Full chain: 4× BS → 4 MF → Scorching Heart on enemy (source tracked)
 *    - SH starts at same frame as 4th MF threshold crossing
 *    - Threshold clause structure: THIS_EVENT HAVE STACKS EXACTLY MAX → APPLY SCORCHING_HEART
 *    - Empowered BS → Combustion → Seethe trigger chain verified
 *    - Cross-operator Corrosion satisfies Seethe trigger
 *    - SH RESET interaction, MF NONE interaction, MF max 4 across all potentials
 *
 * ═══ Known gaps (not yet tested) ════════════════════════════════════════════
 *
 * - Scorching Heart Part 1 (absorption): Any operator's Final Strike absorbs
 *   Heat Infliction from enemy → MF on Laevatain. Requires frame-effect-driven
 *   derivation engine (toObjectType operator ID resolution implemented, but
 *   cross-operator frame scanning not yet wired).
 * - Cooldowns & SP costs: resource validation tests (spec groups H, I)
 * - Full rotation chain test (spec I5): ultimate → enhanced variants → MF →
 *   SH → empowered → Combustion → Seethe → MF continues
 * - Combo skill contributing to MF threshold via derivation engine
 *   (frame data added, trigger clause added, but no end-to-end test with
 *   combo events in the timeline yet)
 */
import { TimelineEvent } from '../consts/viewTypes';
import { EventStatusType } from '../consts/enums';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, SKILL_COLUMNS } from '../model/channels';

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

  // Expand short keys in status JSONs (same as operatorJsonLoader.ts expandKeys)
  const KEY_EXPAND: Record<string, string> = {
    verb: 'verbType', object: 'objectType', subject: 'subjectType',
    subjectDet: 'subjectDeterminer',
    to: 'toObjectType', toDet: 'toObjectDeterminer',
    from: 'fromObjectType', fromDet: 'fromObjectDeterminer',
    on: 'onObjectType', onDet: 'onObjectDeterminer',
    with: 'withPreposition', for: 'forPreposition',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expandKeys = (val: any): any => {
    if (val == null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(expandKeys);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[KEY_EXPAND[k] ?? k] = expandKeys(v);
    }
    return out;
  };
  const expandedStatuses = (mockStatusesJson as any[]).map(expandKeys);

  const mergedStatusEvents = [...expandedStatuses, ...(skStatusEvents ?? []), ...(mockTalentJson.statusEvents ?? [])];
  const laevatainSkills: Record<string, any> = {};
  for (const [key, val] of Object.entries(skillEntries as Record<string, any>)) {
    laevatainSkills[key] = { ...(val as any), id: key };
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
  const json: Record<string, any> = { laevatain: mockJson };

  const sequenceCache = new Map<string, any>();

  return {
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
  };
});

jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));

// Mock view components that statusDerivationEngine transitively imports
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { deriveStatusesFromEngine } from '../controller/timeline/statusDerivationEngine';
// eslint-disable-next-line import/first
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';
// eslint-disable-next-line import/first
import { wouldOverlapSiblings } from '../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { processInflictionEvents, SlotTriggerWiring } from '../controller/timeline/processInteractions';
// eslint-disable-next-line import/first
import { SubjectType, VerbType, ObjectType, DeterminerType } from '../consts/semantics';
// eslint-disable-next-line import/first
import { StatusType } from '../consts/enums';

// Load JSON for direct assertion in tests (not in jest.mock scope)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainOperatorJson = require('../model/game-data/operators/laevatain-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainSkillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainTalentJson = require('../model/game-data/operator-talents/laevatain-talents.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainStatusesJson = require('../model/game-data/operator-statuses/laevatain-statuses.json');
const _KEY_EXPAND: Record<string, string> = {
  verb: 'verbType', object: 'objectType', subject: 'subjectType',
  subjectDet: 'subjectDeterminer',
  to: 'toObjectType', toDet: 'toObjectDeterminer',
  from: 'fromObjectType', fromDet: 'fromObjectDeterminer',
  on: 'onObjectType', onDet: 'onObjectDeterminer',
  with: 'withPreposition', for: 'forPreposition',
};
function _expandKeys(val: any): any {
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(_expandKeys);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    out[_KEY_EXPAND[k] ?? k] = _expandKeys(v);
  }
  return out;
}
const { statusEvents: _skStatusEvents2, skillTypeMap: _skTypeMap2, ...laevatainSkillEntries2 } = laevatainSkillsJson;
const _mergedStatusEvents = [...(laevatainStatusesJson as any[]).map(_expandKeys), ...(_skStatusEvents2 ?? []), ...(laevatainTalentJson.statusEvents ?? [])];
const laevatainSkillCategories: Record<string, any> = {};
for (const [key, val] of Object.entries(laevatainSkillEntries2 as Record<string, any>)) {
  laevatainSkillCategories[key] = { ...(val as any), id: key };
}
if (_skTypeMap2) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, skillId] of Object.entries(_skTypeMap2 as Record<string, string>)) {
    if (laevatainSkillCategories[skillId]) laevatainSkillCategories[category] = laevatainSkillCategories[skillId];
    for (const suffix of variantSuffixes) {
      const variantSkillId = `${skillId}_${suffix}`;
      if (laevatainSkillCategories[variantSkillId]) laevatainSkillCategories[`${suffix}_${category}`] = laevatainSkillCategories[variantSkillId];
    }
  }
}
const mockLaevatainJson = { ...laevatainOperatorJson, skills: laevatainSkillCategories, skillTypeMap: _skTypeMap2, ...(_mergedStatusEvents.length > 0 ? { statusEvents: _mergedStatusEvents } : {}) };
// ── Test helpers ─────────────────────────────────────────────────────────────

const SLOT_ID = 'slot1';
let eventIdCounter = 0;

function resetIdCounter() { eventIdCounter = 0; }

/** Create a battle skill event at the given start frame. */
function battleSkillEvent(startFrame: number): TimelineEvent {
  return {
    id: `battle-${eventIdCounter++}`,
    name: 'SMOULDERING_FIRE',
    ownerId: SLOT_ID,
    columnId: SKILL_COLUMNS.BATTLE,
    startFrame,
    activationDuration: Math.round(2.2 * 120), // 264 frames
    activeDuration: 0,
    cooldownDuration: 0,
  };
}

/** Filter derived events by columnId. */
function filterByColumn(events: TimelineEvent[], columnId: string): TimelineEvent[] {
  return events.filter(ev => ev.columnId === columnId);
}

/** Get the frame sequences from laevatain JSON for a given skill category. */
function getSequences(skillCategory: string): readonly DataDrivenSkillEventSequence[] {
  return buildSequencesFromOperatorJson(mockLaevatainJson, skillCategory);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => resetIdCounter());

describe('Laevatain Combat Simulation', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Melting Flame Stacking
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Melting Flame Stacking', () => {
  test('A1: Battle skill override first frame applies MELTING_FLAME to LAEVATAIN', () => {
    const sequences = getSequences('BATTLE_SKILL');
    expect(sequences.length).toBeGreaterThan(0);

    const firstFrame = sequences[0].getFrames()[0];
    const applyStatus = firstFrame.getApplyStatus();
    expect(applyStatus).not.toBeNull();
    expect(applyStatus!.status).toBe('MELTING_FLAME');
    expect(applyStatus!.targetOperatorId).toBe('LAEVATAIN');
  });

  test('A1b: Combo skill frame applies MELTING_FLAME to LAEVATAIN', () => {
    const sequences = getSequences('COMBO_SKILL');
    expect(sequences.length).toBeGreaterThan(0);

    // Last frame (only 1 frame for combo) should have APPLY STATUS MELTING_FLAME
    const frames = sequences[0].getFrames();
    const lastFrame = frames[frames.length - 1];
    const applyStatus = lastFrame.getApplyStatus();
    expect(applyStatus).not.toBeNull();
    expect(applyStatus!.status).toBe('MELTING_FLAME');
    expect(applyStatus!.targetOperatorId).toBe('LAEVATAIN');
  });

  test('A2: Single battle skill → 1 Melting Flame event', () => {
    const events: TimelineEvent[] = [battleSkillEvent(0)];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(1);
  });

  test('A3: 4 battle skills → exactly 4 Melting Flame events', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(4);
  });

  test('A4: 5 battle skills → 5th consumes all 4 stacks (empowered), no new MF from consume skill', () => {
    const events: TimelineEvent[] = Array.from({ length: 5 }, (_, i) =>
      battleSkillEvent(i * 300)
    );
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    // 4 MF created by skills 1-4, all consumed by skill 5. Skill 5 is empowered (consumes only, no new MF).
    expect(mfEvents.length).toBe(4);
    // All consumed — no active MF after frame 1200
    const activeAfterConsume = mfEvents.filter(ev =>
      ev.startFrame + ev.activationDuration > 1200
    );
    expect(activeAfterConsume.length).toBe(0);
  });

  test('A5: Never more than 4 active MF stacks at any frame', () => {
    const events: TimelineEvent[] = Array.from({ length: 20 }, (_, i) =>
      battleSkillEvent(i * 300)
    );
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);

    // Check that at every battle skill frame, active MF count ≤ 4
    for (let i = 0; i < 20; i++) {
      const frame = i * 300;
      const activeAtFrame = mfEvents.filter(ev =>
        ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration
      ).length;
      expect(activeAtFrame).toBeLessThanOrEqual(4);
    }
  });

  test('A6: Melting Flame events are indefinite duration', () => {
    const events: TimelineEvent[] = [battleSkillEvent(0)];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(1);
    // -1 duration resolves to TOTAL_FRAMES (108000 = 900s * 120fps)
    expect(mfEvents[0].activationDuration).toBe(108000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Scorching Heart Threshold
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Scorching Heart Threshold', () => {
  test('B1: 3 Melting Flame stacks → no Scorching Heart', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
    ];
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBe(0);
  });

  test('B2: 4 Melting Flame stacks → exactly 1 Scorching Heart Effect on Laevatain', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].ownerId).toBe(SLOT_ID);
  });

  test('B3: 10 battle skills → Scorching Heart triggers once per accumulation cycle', () => {
    const events: TimelineEvent[] = Array.from({ length: 10 }, (_, i) =>
      battleSkillEvent(i * 300)
    );
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    // 10 battle skills = 2 full cycles (4 + consume + 4 + consume) → 2 Scorching Hearts
    expect(shEvents.length).toBe(2);
  });

  test('B4: Scorching Heart duration is 20 seconds (2400 frames)', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].activationDuration).toBe(2400);
  });

  test('B5: 4 battle skills → exactly 1 Scorching Heart (no extra triggers without consumption)', () => {
    // Exactly 4 battle skills — reaches max, triggers SH, but no 5th skill to consume
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBe(1);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(4);
  });

  test('B6: Scorching Heart Effect has Heat Resistance Ignore clause in JSON', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const shDef = statusEvents.find((d: any) => d.name === 'SCORCHING_HEART_EFFECT');
    expect(shDef).toBeDefined();
    // Clause-based format: IGNORE HEAT RESISTANCE with BASED_ON TALENT_LEVEL
    expect(shDef.clause).toBeDefined();
    expect(shDef.clause.length).toBeGreaterThan(0);
    const ignoreEffect = shDef.clause[0].effects[0];
    expect(ignoreEffect.verbType ?? ignoreEffect.verb).toBe('IGNORE');
    expect(ignoreEffect.adjective).toBe('HEAT');
    expect(ignoreEffect.objectType ?? ignoreEffect.object).toBe('RESISTANCE');
    const withBlock = ignoreEffect.withPreposition ?? ignoreEffect.with;
    expect(withBlock.value.objectType ?? withBlock.value.object).toBe('TALENT_LEVEL');
    expect(withBlock.value.value).toEqual([10, 15, 20]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B2: Melting Flame Consumption
// ═══════════════════════════════════════════════════════════════════════════════

describe('B2. Melting Flame Consumption', () => {
  test('B2.1: Empowered battle skill last frame has CONSUME STATUS MELTING_FLAME', () => {
    const sequences = getSequences('EMPOWERED_BATTLE_SKILL');
    const frames = sequences[0].getFrames();
    const lastFrame = frames[frames.length - 1];
    const consumeStatus = lastFrame.getConsumeStatus();
    expect(consumeStatus).toBe('MELTING_FLAME');
  });

  test('B2.2: Battle skill at max stacks consumes all MF events', () => {
    // 4 battle skills to reach max, then a 5th that should consume
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      battleSkillEvent(1200), // empowered — should consume all MF at frame 1200
    ];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);

    // All 4 MF events should be consumed (clamped at frame 1200)
    const consumed = mfEvents.filter(ev =>
      ev.startFrame + ev.activationDuration <= 1200
    );
    expect(consumed.length).toBe(4);
  });

  test('B2.3: After consumption, new MF stacks can accumulate', () => {
    // 4 battle skills → max → 5th consumes → 6th should create new MF
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      battleSkillEvent(1200), // consumes all
      battleSkillEvent(1500), // should create new MF
    ];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);

    // 4 consumed + 1 new = 5 total MF events
    expect(mfEvents.length).toBe(5);

    // The new one starts at or after the consumption frame
    const postConsume = mfEvents.filter(ev => ev.startFrame >= 1500);
    expect(postConsume.length).toBe(1);
  });

  test('B2.4: Consume-reaccumulate cycle triggers second Scorching Heart', () => {
    // 4 battle skills → SH → 5th consumes → 4 more battle skills → second SH
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),    // 4th MF → Scorching Heart #1
      battleSkillEvent(1200),   // consumes all MF
      battleSkillEvent(1500),   // new MF #1
      battleSkillEvent(1800),   // new MF #2
      battleSkillEvent(2100),   // new MF #3
      battleSkillEvent(2400),   // new MF #4 → Scorching Heart #2
    ];
    const result = deriveStatusesFromEngine(events);

    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    // Two Scorching Hearts: first from initial accumulation, second from re-accumulation
    expect(shEvents.length).toBe(2);
    // Both target Laevatain (self-buff)
    expect(shEvents[0].ownerId).toBe(SLOT_ID);
    expect(shEvents[1].ownerId).toBe(SLOT_ID);
    // Second one should RESET (clamp) the first if still active
    expect(shEvents[0].activationDuration).toBeLessThan(2400);
  });

  test('B2.5: Multiple consume-reaccumulate cycles work', () => {
    // Two full cycles: 4 + consume + 4 + consume + 4
    const events: TimelineEvent[] = [
      // Cycle 1: accumulate 4
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      battleSkillEvent(1200),   // consume
      // Cycle 2: accumulate 4
      battleSkillEvent(1500),
      battleSkillEvent(1800),
      battleSkillEvent(2100),
      battleSkillEvent(2400),
      battleSkillEvent(2700),   // consume
      // Cycle 3: accumulate 4
      battleSkillEvent(3000),
      battleSkillEvent(3300),
      battleSkillEvent(3600),
      battleSkillEvent(3900),
    ];
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    // 3 Scorching Hearts from 3 threshold crossings
    expect(shEvents.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Empowered Battle Skill & Combustion
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Empowered Battle Skill & Combustion', () => {
  test('C1: Empowered battle skill last frame applies forced Combustion', () => {
    const sequences = getSequences('EMPOWERED_BATTLE_SKILL');
    expect(sequences.length).toBeGreaterThan(0);

    // Single-segment skill — get all frames
    const frames = sequences[0].getFrames();
    const lastFrame = frames[frames.length - 1];
    const forcedReaction = lastFrame.getApplyForcedReaction();
    expect(forcedReaction).not.toBeNull();
    expect(forcedReaction!.reaction).toBe('COMBUSTION');
    expect(forcedReaction!.statusLevel).toBe(1);
  });

  test('C2: Normal battle skill does NOT have forced Combustion on any frame', () => {
    const sequences = getSequences('BATTLE_SKILL');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getApplyForcedReaction()).toBeNull();
      }
    }
  });

  test('C3: Battle skill first frame applies MELTING_FLAME status to Laevatain', () => {
    const rawSkills = mockLaevatainJson.skills;
    const battleFrames = rawSkills.BATTLE_SKILL.frames;
    const firstFrameEffects = battleFrames[0].effects;
    const mfEffect = firstFrameEffects.find(
      (e: any) => e.verbType === 'APPLY' && e.objectId === 'MELTING_FLAME'
    );
    expect(mfEffect).toBeDefined();
    expect(mfEffect.objectType).toBe('STATUS');
    expect(mfEffect.toObjectType).toBe('LAEVATAIN');
  });

  test('C4: Empowered battle skill forced Combustion has 5s duration in multipliers', () => {
    // The multiplier data for battle skill includes DURATION: 5 seconds
    const rawSkills = mockLaevatainJson.skills;
    const battleFrames = rawSkills.BATTLE_SKILL.frames;
    const multipliers = battleFrames[0].multipliers;
    expect(multipliers[0].DURATION).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Combo Skill (Seethe) Triggers
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Combo Skill (Seethe) Triggers', () => {
  test('D1: Combo trigger clause requires Combustion or Corrosion', () => {
    const comboSkill = mockLaevatainJson.skills.COMBO_SKILL;
    const trigger = comboSkill.properties.trigger;
    expect(trigger).toBeDefined();
    expect(trigger.triggerClause.length).toBe(2);

    // First clause: enemy is combusted
    expect(trigger.triggerClause[0].conditions[0].subjectType).toBe('ENEMY');
    expect(trigger.triggerClause[0].conditions[0].objectType).toBe('COMBUSTED');

    // Second clause: enemy is corroded
    expect(trigger.triggerClause[1].conditions[0].subjectType).toBe('ENEMY');
    expect(trigger.triggerClause[1].conditions[0].objectType).toBe('CORRODED');
  });

  test('D2: Combo activation window is 720 frames (6 seconds)', () => {
    const comboSkill = mockLaevatainJson.skills.COMBO_SKILL;
    const trigger = comboSkill.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('D5: Combo skill frame data includes stagger recovery', () => {
    const sequences = getSequences('COMBO_SKILL');
    expect(sequences.length).toBeGreaterThan(0);

    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Ultimate & Enhanced Variants
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Ultimate & Enhanced Variants', () => {
  test('E1: Enhanced basic attack (ENHANCED_BASIC_ATTACK) has 4 segments', () => {
    const sequences = getSequences('ENHANCED_BASIC_ATTACK');
    expect(sequences.length).toBe(4);
  });

  test('E2: Enhanced battle skill (ENHANCED_BATTLE_SKILL) exists in JSON', () => {
    expect(mockLaevatainJson.skills.ENHANCED_BATTLE_SKILL).toBeDefined();
    expect(mockLaevatainJson.skills.ENHANCED_BATTLE_SKILL.id).toBe('SMOULDERING_FIRE_ENHANCED');
  });

  test('E3: Enhanced + Empowered battle skill variant exists', () => {
    expect(mockLaevatainJson.skills.ENHANCED_EMPOWERED_BATTLE_SKILL).toBeDefined();
  });

  test('E4: Enhanced basic segment 3 applies Heat Infliction to enemy', () => {
    const sequences = getSequences('ENHANCED_BASIC_ATTACK');
    // Segment 3 (index 2) — "BATK sequence 3 also applies Heat Infliction"
    const segment3 = sequences[2];
    const frames = segment3.getFrames();
    expect(frames.length).toBeGreaterThan(0);

    const frame = frames[0];
    const infliction = frame.getApplyArtsInfliction();
    expect(infliction).not.toBeNull();
    expect(infliction!.element).toBe('HEAT');
    expect(infliction!.stacks).toBe(1);
  });

  test('E5: Normal basic attack segments do NOT have Heat infliction', () => {
    const sequences = getSequences('BASIC_ATTACK');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getApplyArtsInfliction()).toBeNull();
      }
    }
  });

  test('E6: Ultimate active duration is 15 seconds', () => {
    expect(mockLaevatainJson.ultimateActiveDuration).toBe(15);
  });

  test('E7: Ultimate energy cost is 300', () => {
    const ultSkill = mockLaevatainJson.skills.ULTIMATE;
    const energyCost = ultSkill.effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.withPreposition.cardinality.value).toBe(300);
  });

  test('E8: SMOULDERING_FIRE has 11 frames and second frame has no RECOVER ULTIMATE_ENERGY', () => {
    const sequences = getSequences('BATTLE_SKILL');
    const allFrames = sequences.flatMap(s => s.getFrames());
    expect(allFrames.length).toBe(11);

    // Second frame (index 1) is a damage frame — it should not have gauge gain
    expect(allFrames[1].getGaugeGain()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Potentials', () => {
  test('F1: P1 adds SP Return (+20) to Smouldering Fire variants', () => {
    const p1 = mockLaevatainJson.potentials[0];
    expect(p1.level).toBe(1);
    expect(p1.name).toBe('Heart of Melting Flame');

    const spEffects = p1.effects.filter(
      (e: any) => e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.parameterKey === 'SKILL_POINT'
    );
    expect(spEffects.length).toBe(2); // Normal and Enhanced
    expect(spEffects[0].skillParameterModifier.value).toBe(20);
    expect(spEffects[0].skillParameterModifier.parameterModifyType).toBe('ADDITIVE');
  });

  test('F2: P0 adds x1.2 DAMAGE_MULTIPLIER to Smouldering Fire Enhanced', () => {
    const p0 = mockLaevatainJson.potentials[0];
    // Enhanced: ×1.2 on DAMAGE_MULTIPLIER
    const enhancedDmg = p0.effects.find(
      (e: any) => e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.skillType === 'SMOULDERING_FIRE_ENHANCED' &&
        e.skillParameterModifier.parameterKey === 'DAMAGE_MULTIPLIER'
    );
    expect(enhancedDmg).toBeDefined();
    expect(enhancedDmg.skillParameterModifier.value).toBe(1.2);
  });

  test('F3: P3 Combustion reaction multiplier is x1.5', () => {
    const talentEffects = mockLaevatainJson.talentEffects;
    const p3Effect = talentEffects.find(
      (e: any) => e.bonusType === 'REACTION_MULTIPLIER' && e.condition?.reactionType === 'COMBUSTION'
    );
    expect(p3Effect).toBeDefined();
    // BASED_ON [POTENTIAL] format: P0 = 1 (no bonus), P3 = 1.5
    expect(p3Effect.value.verb).toBe('BASED_ON');
    expect(p3Effect.value.object).toEqual(['POTENTIAL']);
    expect(p3Effect.value.value.P0).toBe(1);
    expect(p3Effect.value.value.P2).toBe(1);
    expect(p3Effect.value.value.P3).toBe(1.5);
    expect(p3Effect.value.value.P5).toBe(1.5);
  });

  test('F4: P4 reduces Twilight cost by x0.85', () => {
    const p4 = mockLaevatainJson.potentials[3];
    expect(p4.level).toBe(4);
    expect(p4.name).toBe('Ice Cream Furnace');
    const costEffect = p4.effects.find(
      (e: any) => e.potentialEffectType === 'SKILL_COST'
    );
    expect(costEffect).toBeDefined();
    expect(costEffect.skillCostModifier.skillType).toBe('LAEVATAIN_TWILIGHT');
    expect(costEffect.skillCostModifier.value).toBe(0.85);
  });

  test('F5: P5 attaches Proof of Existence buff', () => {
    const p5 = mockLaevatainJson.potentials[4];
    expect(p5.level).toBe(5);
    expect(p5.name).toBe('Proof of Existence');
    const buffEffect = p5.effects.find(
      (e: any) => e.potentialEffectType === 'BUFF_ATTACHMENT'
    );
    expect(buffEffect).toBeDefined();
    expect(buffEffect.buffAttachment.objectId).toBe('LAEVATAIN_POTENTIAL5_PROOF_OF_EXISTENCE');
  });

  test('F6: P5 adds x1.2 damage multiplier to Flaming Cinders Enhanced', () => {
    const p5 = mockLaevatainJson.potentials[4];
    const dmgEffects = p5.effects.filter(
      (e: any) => e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.parameterKey === 'DAMAGE_MULTIPLIER' &&
        e.skillParameterModifier.skillType === 'FLAMING_CINDERS_ENHANCED'
    );
    // P5 has two UNIQUE_MULTIPLIER entries for enhanced basic (multiplicative stacking)
    expect(dmgEffects.length).toBeGreaterThanOrEqual(1);
    for (const eff of dmgEffects) {
      expect(eff.skillParameterModifier.value).toBe(1.2);
      expect(eff.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group G: Chain Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Chain Interactions', () => {
  test('G1: 4 battle skills → MF stacks → Scorching Heart on enemy with source tracking', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);

    // MF events present
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(4);

    // Scorching Heart derived
    const shEvents = filterByColumn(result, 'scorching-heart-effect');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].ownerId).toBe(SLOT_ID);
    // Source operator tracked
    expect(shEvents[0].sourceOwnerId).toBe(SLOT_ID);
  });

  test('G2: Scorching Heart starts at the same frame as the 4th battle skill', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);
    const shEvents = filterByColumn(result, 'scorching-heart-effect');

    // Scorching Heart should start at the frame of the 4th MF event (the one that crosses threshold)
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].startFrame).toBe(mfEvents[3].startFrame);
  });

  test('G3: Melting Flame statusEvent definition has threshold clause for Scorching Heart', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const mfDef = statusEvents.find((d: any) => d.name === 'MELTING_FLAME');
    expect(mfDef).toBeDefined();
    expect(mfDef.clause).toBeDefined();
    expect(mfDef.clause.length).toBe(1);

    const clause = mfDef.clause[0];
    // Condition: THIS_EVENT HAVE STACKS EXACTLY MAX
    expect(clause.conditions[0].subjectType).toBe('THIS_EVENT');
    expect(clause.conditions[0].verbType).toBe('HAVE');
    expect(clause.conditions[0].objectType).toBe('STACKS');
    expect(clause.conditions[0].cardinality).toBe('MAX');

    // Effect: APPLY STATUS SCORCHING_HEART
    expect(clause.effects[0].verbType).toBe('APPLY');
    expect(clause.effects[0].objectType).toBe('STATUS');
    expect(clause.effects[0].objectId).toBe('SCORCHING_HEART_EFFECT');
  });

  test('G4: Empowered battle skill has forced Combustion on last frame → Seethe trigger data present', () => {
    // Verify the empowered battle skill → combustion → seethe chain is structurally possible
    const empSequences = getSequences('EMPOWERED_BATTLE_SKILL');
    const lastFrame = empSequences[0].getFrames().slice(-1)[0];
    const reaction = lastFrame.getApplyForcedReaction();
    expect(reaction).not.toBeNull();
    expect(reaction!.reaction).toBe('COMBUSTION');

    // Seethe trigger accepts Combustion
    const trigger = mockLaevatainJson.skills.COMBO_SKILL.properties.trigger;
    const combustionClause = trigger.triggerClause.find(
      (c: any) => c.conditions.some((cond: any) => cond.objectType === 'COMBUSTED')
    );
    expect(combustionClause).toBeDefined();
  });

  test('G5: Corrosion from teammate satisfies Seethe trigger (cross-operator)', () => {
    // Verify Seethe trigger clause includes CORRODED
    const trigger = mockLaevatainJson.skills.COMBO_SKILL.properties.trigger;
    const corrosionClause = trigger.triggerClause.find(
      (c: any) => c.conditions.some((cond: any) => cond.objectType === 'CORRODED')
    );
    expect(corrosionClause).toBeDefined();
    // Both clauses are OR conditions (separate entries in triggerClause array)
    expect(trigger.triggerClause.length).toBe(2);
  });

  test('G6: Scorching Heart Effect RESET interaction — second trigger clamps previous', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const shDef = statusEvents.find((d: any) => d.name === 'SCORCHING_HEART_EFFECT');
    expect(shDef).toBeDefined();
    expect(shDef.stack.verbType).toBe('RESET');
    expect(shDef.stack.instances).toBe(1);
  });

  test('G7: Melting Flame max stacks is 4 across all potentials', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const mfDef = statusEvents.find((d: any) => d.name === 'MELTING_FLAME');
    expect(mfDef).toBeDefined();
    for (let p = 0; p <= 5; p++) {
      expect(mfDef.stack.max[`P${p}`]).toBe(4);
    }
    expect(mfDef.stack.instances).toBe(4);
  });

  test('G8: Melting Flame interaction type is NONE (independent stacks)', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const mfDef = statusEvents.find((d: any) => d.name === 'MELTING_FLAME');
    expect(mfDef.stack.verbType).toBe('NONE');
  });

  test('G9: Scorching Heart Effect target is THIS OPERATOR (self-buff)', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const shDef = statusEvents.find((d: any) => d.name === 'SCORCHING_HEART_EFFECT');
    expect(shDef.targetDeterminer).toBe('THIS');
    expect(shDef.target).toBe('OPERATOR');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group I: Final Strike → Melting Flame Conversion
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Final Strike → Melting Flame Conversion', () => {
  const SLOT2_ID = 'slot2';

  /** Loadout properties with talent 1 unlocked (required for Scorching Heart talent processing). */
  const LOADOUT_STATS: Record<string, any> = {
    [SLOT_ID]: { operator: { talentOneLevel: 1, talentTwoLevel: 0, potential: 0 } },
  };

  /** Create a basic attack event with 3 segments (final strike on segment 3). */
  function basicAttackWithFinalStrike(startFrame: number, ownerId = SLOT_ID): TimelineEvent {
    return {
      id: `basic-${eventIdCounter++}`,
      name: 'FLAMING_CINDERS',
      ownerId,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame,
      activationDuration: 360, // 3 segments × 120 frames
      activeDuration: 0,
      cooldownDuration: 0,
      segments: [
        { durationFrames: 120, label: '1' },
        { durationFrames: 120, label: '2' },
        { durationFrames: 120, label: '3', frames: [{ offsetFrame: 100, skillPointRecovery: 0 }] },
      ],
    };
  }

  /** Create a heat infliction event on the enemy. */
  function heatInflictionEvent(startFrame: number, duration = 600): TimelineEvent {
    return {
      id: `heat-${eventIdCounter++}`,
      name: 'HEAT',
      ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction',
      startFrame,
      activationDuration: duration,
      activeDuration: 0,
      cooldownDuration: 0,
    };
  }

  test('I1: Final strike with active heat infliction → creates Melting Flame', () => {
    // Final strike lands at startFrame + 240 + 100 = 340
    // Heat infliction active from frame 0 to 600
    const events: TimelineEvent[] = [
      basicAttackWithFinalStrike(0),
      heatInflictionEvent(0),
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(1);
    expect(mfEvents[0].startFrame).toBe(340); // seg offset 240 + frame offset 100
  });

  test('I2: Final strike without heat infliction → no Melting Flame from that trigger', () => {
    // Heat infliction ends before final strike
    const events: TimelineEvent[] = [
      basicAttackWithFinalStrike(0),
      heatInflictionEvent(0, 200), // ends at frame 200, before final strike at 340
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(0);
  });

  test('I3: Cross-operator final strike creates MF on Laevatain', () => {
    // Another operator's basic attack triggers MF on Laevatain.
    // A Laevatain battle skill is needed so findOperatorSlot can map Laevatain to slot1.
    const events: TimelineEvent[] = [
      battleSkillEvent(0), // Laevatain event for slot detection
      basicAttackWithFinalStrike(600, SLOT2_ID),
      heatInflictionEvent(600),
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    // 1 from battle skill + 1 from final strike = 2
    expect(mfEvents.length).toBe(2);
    // Both MF events are on Laevatain's slot
    expect(mfEvents.every(ev => ev.ownerId === SLOT_ID)).toBe(true);
  });

  test('I4: Final strike MF stacks with battle skill MF', () => {
    // 2 battle skills + 1 final strike with heat → 3 total MF
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      basicAttackWithFinalStrike(600),
      heatInflictionEvent(600, 600),
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(3);
  });

  test('I5: Final strike MF respects max 4 stacks', () => {
    // 4 battle skills fill max, final strike should not add more
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      basicAttackWithFinalStrike(1200),
      heatInflictionEvent(1200, 600),
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(4); // capped at 4
  });

  test('I6: FINISHER and DIVE basic attacks do NOT trigger final strike', () => {
    const finisher: TimelineEvent = {
      id: `basic-${eventIdCounter++}`,
      name: 'FINISHER',
      ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 0,
      activationDuration: 120,
      activeDuration: 0,
      cooldownDuration: 0,
      segments: [
        { durationFrames: 60, label: '1' },
        { durationFrames: 60, label: '2', frames: [{ offsetFrame: 30, skillPointRecovery: 0 }] },
      ],
    };
    const events: TimelineEvent[] = [finisher, heatInflictionEvent(0)];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(0);
  });

  test('I7: Final strike absorbs heat infliction (infliction clamped, status CONSUMED)', () => {
    // Final strike lands at frame 340 (240 seg offset + 100 frame offset)
    // Heat infliction active from 0 to 600
    const heat = heatInflictionEvent(0);
    const events: TimelineEvent[] = [
      basicAttackWithFinalStrike(0),
      heat,
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);

    // MF created
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(1);

    // Heat infliction should be clamped at trigger frame (340)
    const clampedHeat = result.find(ev => ev.id === heat.id)!;
    expect(clampedHeat.activationDuration).toBe(340); // triggerFrame - startFrame
    expect(clampedHeat.eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('I8: ALL multiplicity — 2 inflictions + 2 slots = 2 absorptions', () => {
    // 2 battle skills fill 2 MF slots, leaving 2 open (max 4)
    // Final strike with 2 active heat inflictions → absorb 2
    const heat1 = heatInflictionEvent(0, 1200);
    const heat2 = heatInflictionEvent(200, 1200);
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      heat1,
      heat2,
      basicAttackWithFinalStrike(600),
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    // 2 from battle skills + 2 from final strike absorption = 4
    expect(mfEvents.length).toBe(4);

    // Both inflictions should be clamped
    const clamped1 = result.find(ev => ev.id === heat1.id)!;
    const clamped2 = result.find(ev => ev.id === heat2.id)!;
    expect(clamped1.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(clamped2.eventStatus).toBe(EventStatusType.CONSUMED);
    // Final strike at frame 940 (600 + 240 seg offset + 100 frame offset)
    expect(clamped1.activationDuration).toBe(940);
    expect(clamped2.activationDuration).toBe(940 - 200);
  });

  test('I9: Slot cap — 3 inflictions + 1 available slot = 1 absorption', () => {
    // 3 battle skills fill 3 MF slots, leaving 1 open
    // Final strike with 3 active heat inflictions → absorb only 1
    const heat1 = heatInflictionEvent(0, 2400);
    const heat2 = heatInflictionEvent(100, 2400);
    const heat3 = heatInflictionEvent(200, 2400);
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      heat1,
      heat2,
      heat3,
      basicAttackWithFinalStrike(900),
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    // 3 from battle skills + 1 from absorption = 4 (capped at max)
    expect(mfEvents.length).toBe(4);

    // Only the oldest infliction should be consumed (oldest first)
    const clamped1 = result.find(ev => ev.id === heat1.id)!;
    const clamped2 = result.find(ev => ev.id === heat2.id)!;
    expect(clamped1.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(clamped2.eventStatus).toBeUndefined(); // not consumed
  });

  test('I10: Cross-operator final strike absorbs heat infliction', () => {
    // Another operator (slot2) performs the final strike.
    // Laevatain battle skill needed for slot detection.
    const heat = heatInflictionEvent(600);
    const events: TimelineEvent[] = [
      battleSkillEvent(0), // Laevatain slot detection
      basicAttackWithFinalStrike(600, SLOT2_ID),
      heat,
    ];
    const result = deriveStatusesFromEngine(events, LOADOUT_STATS);

    // 1 MF from battle skill + 1 MF from cross-operator final strike = 2
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(2);
    // Both MF events belong to Laevatain's slot
    expect(mfEvents.every(ev => ev.ownerId === SLOT_ID)).toBe(true);

    // Heat infliction should be consumed at trigger frame (600 + 240 + 100 = 940)
    const clampedHeat = result.find(ev => ev.id === heat.id)!;
    expect(clampedHeat.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(clampedHeat.activationDuration).toBe(940 - 600); // 340 frames
    // Absorption source is the other operator's basic attack
    expect(clampedHeat.eventStatusOwnerId).toBe(SLOT2_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Cooldown Interactions', () => {
  const FPS = 120;

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
    return { name: '', ownerId: SLOT_ID, activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  test('H1: Battle skill (Smouldering Fire) has no COOLDOWN effect', () => {
    const bs = mockLaevatainJson.skills.BATTLE_SKILL;
    const cooldown = bs.effects?.find((e: any) => e.objectType === 'COOLDOWN');
    expect(cooldown).toBeUndefined();
  });

  test('H2: Combo skill (Seethe) has 10s cooldown', () => {
    const cs = mockLaevatainJson.skills.COMBO_SKILL;
    const cooldown = cs.effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(10);
  });

  test('H3: Ultimate (Twilight) has 10s cooldown from operator JSON', () => {
    expect(mockLaevatainJson.ultimateCooldownDuration).toBe(10);
  });

  test('H4: Combo placement during 10s cooldown is blocked', () => {
    const comboDuration = Math.round(1.37 * FPS); // 164 frames
    const comboCooldown = 10 * FPS; // 1200 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      id: 'cs-1', columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      activationDuration: comboDuration, cooldownDuration: comboCooldown,
      nonOverlappableRange: totalRange,
    });
    // During cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, comboDuration + 300, 1, [cs1])).toBe(true);
    // After cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, totalRange, 1, [cs1])).toBe(false);
  });

  test('H5: Ultimate placement during cooldown is blocked', () => {
    const ultAnimation = Math.round(2.37 * FPS); // 284 frames
    const ultActive = 15 * FPS; // 1800 frames
    const ultCooldown = 10 * FPS; // 1200 frames
    const totalRange = ultAnimation + ultActive + ultCooldown;
    const ult1 = makeEvent({
      id: 'ult-1', columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0,
      activationDuration: ultAnimation, activeDuration: ultActive,
      cooldownDuration: ultCooldown, nonOverlappableRange: totalRange,
    });
    // During cooldown phase
    const cooldownStart = ultAnimation + ultActive;
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.ULTIMATE, cooldownStart + 300, 1, [ult1])).toBe(true);
    // After cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.ULTIMATE, totalRange, 1, [ult1])).toBe(false);
  });

  test('H6: Battle skill back-to-back is valid (no cooldown)', () => {
    const bsDuration = Math.round(2.2 * FPS); // 264 frames
    const bs1 = makeEvent({
      id: 'bs-1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      activationDuration: bsDuration, nonOverlappableRange: bsDuration,
    });
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.BATTLE, bsDuration, bsDuration, [bs1])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group K: Scorching Heart + Antal Combo Mirrored Heat (Full Pipeline)
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Scorching Heart absorbs Antal combo mirrored heat', () => {
  const FPS = 120;
  const SLOT_LAEV = 'slot-0';
  const SLOT_ANTAL = 'slot-1';
  const SLOT_AKEKURI = 'slot-2';

  function makeEv(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
    return { name: '', activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  function laevWiring(): SlotTriggerWiring {
    return {
      slotId: SLOT_LAEV,
      capability: {
        publishesTriggers: {
          [SKILL_COLUMNS.BASIC]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE },
          ],
          [SKILL_COLUMNS.BATTLE]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL },
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, element: 'HEAT' },
          ],
        },
        comboRequires: [],
        comboDescription: '',
        comboWindowFrames: 720,
      },
    };
  }

  function antalWiring(): SlotTriggerWiring {
    return {
      slotId: SLOT_ANTAL,
      capability: {
        publishesTriggers: {
          [SKILL_COLUMNS.BASIC]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE },
          ],
          [SKILL_COLUMNS.BATTLE]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL },
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, element: 'ELECTRIC' },
          ],
        },
        comboRequires: [
          { subjectDeterminer: DeterminerType.ANY, subjectType: SubjectType.OPERATOR, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION },
        ],
        comboDescription: 'any infliction with Focus',
        comboWindowFrames: 720,
        comboRequiresActiveColumns: [StatusType.FOCUS],
      },
    };
  }

  function akekuriWiring(): SlotTriggerWiring {
    return {
      slotId: SLOT_AKEKURI,
      capability: {
        publishesTriggers: {
          [SKILL_COLUMNS.BASIC]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE },
          ],
          [SKILL_COLUMNS.BATTLE]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL },
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, element: 'HEAT' },
          ],
        },
        comboRequires: [],
        comboDescription: '',
        comboWindowFrames: 720,
      },
    };
  }

  test('K1: Laevatain final strike absorbs both original and mirrored heat inflictions', () => {
    const wirings = [laevWiring(), antalWiring(), akekuriWiring()];
    const loadoutProps: Record<string, any> = {
      [SLOT_LAEV]: { operator: { talentOneLevel: 1, talentTwoLevel: 0, potential: 0 } },
    };

    // Focus on enemy (from Antal's battle skill)
    const focus = makeEv({
      id: 'focus-1', name: StatusType.FOCUS, ownerId: ENEMY_OWNER_ID,
      columnId: StatusType.FOCUS, startFrame: 0, activationDuration: 60 * FPS,
    });
    // Akekuri's heat infliction
    const akekuriHeat = makeEv({
      id: 'akekuri-heat-1', name: 'heatInfliction', ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction', startFrame: 200, activationDuration: 20 * FPS,
      sourceOwnerId: SLOT_AKEKURI, sourceSkillName: 'BURST_OF_PASSION',
    });
    // Antal combo with comboTriggerColumnId set (mirrors heat)
    const antalCombo = makeEv({
      id: 'antal-combo-1', name: 'EMP_TEST_SITE', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.COMBO, startFrame: 400,
      activationDuration: Math.round(0.8 * FPS),
      comboTriggerColumnId: 'heatInfliction',
      segments: [{
        durationFrames: Math.round(0.8 * FPS),
        frames: [{ offsetFrame: Math.round(0.7 * FPS) }],
      }],
    });
    // Laevatain final strike after both heat inflictions exist
    const laevBasic = makeEv({
      id: 'laev-basic-1', name: 'FLAMING_CINDERS', ownerId: SLOT_LAEV,
      columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
      activationDuration: 360,
      segments: [
        { durationFrames: 120, label: '1' },
        { durationFrames: 120, label: '2' },
        { durationFrames: 120, label: '3', frames: [{ offsetFrame: 100, skillPointRecovery: 0 }] },
      ],
    });

    const processed = processInflictionEvents(
      [focus, akekuriHeat, antalCombo, laevBasic],
      loadoutProps, undefined, wirings,
    );

    // Mirrored heat infliction should have been generated
    const mirroredHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(mirroredHeat.length).toBeGreaterThan(0);

    // Melting Flame events should be generated from absorption
    const mfEvents = processed.filter(
      (e) => e.columnId === OPERATOR_COLUMNS.MELTING_FLAME,
    );
    // Both heat inflictions should be absorbed → 2 MF stacks
    expect(mfEvents.length).toBe(2);

    // Heat inflictions should be clamped (consumed by absorption)
    const activeHeatAtFinalStrike = processed.filter((e) => {
      if (e.columnId !== 'heatInfliction') return false;
      const end = e.startFrame + e.activationDuration;
      // Final strike frame = 600 + 240 + 100 = 940
      return end > 940;
    });
    expect(activeHeatAtFinalStrike.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Chronological Ordering & Event Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Chronological Ordering & Event Lifecycle', () => {
  test('H1: No MF events when timeline has zero events', () => {
    const result = deriveStatusesFromEngine([]);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(0);
  });

  test('H2: Battle skills in reverse array order produce same MF stacking as chronological', () => {
    // Chronological order
    const chronoEvents = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    resetIdCounter();
    // Reverse array order (simulates dragging events around)
    const reverseEvents = [
      battleSkillEvent(900),
      battleSkillEvent(600),
      battleSkillEvent(300),
      battleSkillEvent(0),
    ];

    resetIdCounter();
    const chronoResult = deriveStatusesFromEngine(chronoEvents);
    const chronoMF = filterByColumn(chronoResult, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);

    resetIdCounter();
    const reverseResult = deriveStatusesFromEngine(reverseEvents);
    const reverseMF = filterByColumn(reverseResult, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);

    expect(reverseMF.length).toBe(chronoMF.length);
    expect(reverseMF.length).toBe(4);
    for (let i = 0; i < chronoMF.length; i++) {
      expect(reverseMF[i].startFrame).toBe(chronoMF[i].startFrame);
      expect(reverseMF[i].activationDuration).toBe(chronoMF[i].activationDuration);
      expect(reverseMF[i].eventStatus).toBe(chronoMF[i].eventStatus);
    }
  });

  test('H3: 5 battle skills in reverse order — consumption fires at correct chronological point', () => {
    // In chronological order: skills at 0,300,600,900,1200
    // Skill 5 (at 1200) should consume all 4 MF stacks
    // Array is reversed to test that consumeClause sorts by frame
    const events = [
      battleSkillEvent(1200),
      battleSkillEvent(900),
      battleSkillEvent(600),
      battleSkillEvent(300),
      battleSkillEvent(0),
    ];
    const result = deriveStatusesFromEngine(events);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);

    // All 4 MF stacks from skills 1-4 should be consumed at frame 1200
    const consumed = mfEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBe(4);
    consumed.forEach(ev => {
      expect(ev.startFrame + ev.activationDuration).toBe(1200);
    });
  });

  test('H4: Shuffled battle skill order produces same result as sorted', () => {
    // Shuffled array order (e.g. after multiple drag operations)
    const shuffled = [
      battleSkillEvent(600),
      battleSkillEvent(0),
      battleSkillEvent(900),
      battleSkillEvent(300),
      battleSkillEvent(1200),
    ];
    resetIdCounter();
    const sorted = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
      battleSkillEvent(1200),
    ];

    resetIdCounter();
    const shuffledResult = deriveStatusesFromEngine(shuffled);
    const shuffledMF = filterByColumn(shuffledResult, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);

    resetIdCounter();
    const sortedResult = deriveStatusesFromEngine(sorted);
    const sortedMF = filterByColumn(sortedResult, OPERATOR_COLUMNS.MELTING_FLAME)
      .sort((a, b) => a.startFrame - b.startFrame);

    expect(shuffledMF.length).toBe(sortedMF.length);
    for (let i = 0; i < sortedMF.length; i++) {
      expect(shuffledMF[i].startFrame).toBe(sortedMF[i].startFrame);
      expect(shuffledMF[i].activationDuration).toBe(sortedMF[i].activationDuration);
      expect(shuffledMF[i].eventStatus).toBe(sortedMF[i].eventStatus);
    }
  });
});

}); // end Laevatain Combat Simulation
