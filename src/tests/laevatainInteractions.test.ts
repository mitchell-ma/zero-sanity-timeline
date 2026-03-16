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
 *    - EMPOWERED_BASIC_ATTACK: 4 segments, segment 3 applies HEAT infliction
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
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, SKILL_COLUMNS } from '../model/channels';

// ── Mock require.context before importing modules that use it ────────────────

jest.mock('../model/event-frames/operatorJsonLoader', () => {
  const actual = jest.requireActual('../model/event-frames/dataDrivenEventFrames');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockOperatorJson = require('../model/game-data/operators/laevatain-operator.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSkillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
  const { statusEvents: skStatusEvents, ...skillCategories } = mockSkillsJson;
  const mockJson = { ...mockOperatorJson, skills: skillCategories, ...(skStatusEvents ? { statusEvents: skStatusEvents } : {}) };
  const json: Record<string, any> = { laevatain: mockJson };

  const sequenceCache = new Map<string, any>();
  const skillNameMapCache = new Map<string, Record<string, string>>();

  return {
    getOperatorJson: (id: string) => json[id],
    getAllOperatorIds: () => Object.keys(json),
    getSkillNameMap: (operatorId: string) => {
      if (skillNameMapCache.has(operatorId)) return skillNameMapCache.get(operatorId);
      const opJson = json[operatorId];
      if (!opJson?.skills) return {};
      const map: Record<string, string> = { FINISHER: 'BASIC_ATTACK', DIVE: 'BASIC_ATTACK' };
      for (const [category, skill] of Object.entries(opJson.skills) as [string, any][]) {
        if (skill.id) map[skill.id] = category;
      }
      skillNameMapCache.set(operatorId, map);
      return map;
    },
    getFrameSequences: (operatorId: string, skillCategory: string) => {
      const cacheKey = `${operatorId}:${skillCategory}`;
      const cached = sequenceCache.get(cacheKey);
      if (cached) return cached;
      const opJson = json[operatorId];
      if (!opJson) return [];
      const sequences = actual.buildSequencesFromOperatorJson(opJson, skillCategory);
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
  DEFAULT_LOADOUT_STATS: {},
  getDefaultLoadoutStats: () => ({}),
}));

// eslint-disable-next-line import/first
import { deriveStatusesFromEngine } from '../controller/timeline/statusDerivationEngine';
// eslint-disable-next-line import/first
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';

// Load JSON for direct assertion in tests (not in jest.mock scope)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainOperatorJson = require('../model/game-data/operators/laevatain-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainSkillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
const { statusEvents: _skStatusEvents, ...laevatainSkillCategories } = laevatainSkillsJson;
const mockLaevatainJson = { ...laevatainOperatorJson, skills: laevatainSkillCategories, ...(_skStatusEvents ? { statusEvents: _skStatusEvents } : {}) };
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
    const shEvents = filterByColumn(result, 'scorching-heart');
    expect(shEvents.length).toBe(0);
  });

  test('B2: 4 Melting Flame stacks → exactly 1 Scorching Heart on enemy', () => {
    const events: TimelineEvent[] = [
      battleSkillEvent(0),
      battleSkillEvent(300),
      battleSkillEvent(600),
      battleSkillEvent(900),
    ];
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].ownerId).toBe(ENEMY_OWNER_ID);
  });

  test('B3: 10 battle skills → Scorching Heart triggers once per accumulation cycle', () => {
    const events: TimelineEvent[] = Array.from({ length: 10 }, (_, i) =>
      battleSkillEvent(i * 300)
    );
    const result = deriveStatusesFromEngine(events);
    const shEvents = filterByColumn(result, 'scorching-heart');
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
    const shEvents = filterByColumn(result, 'scorching-heart');
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
    const shEvents = filterByColumn(result, 'scorching-heart');
    expect(shEvents.length).toBe(1);
    const mfEvents = filterByColumn(result, OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(4);
  });

  test('B6: Scorching Heart has Heat Resistance Ignore stats in JSON', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const shDef = statusEvents.find((d: any) => d.name === 'SCORCHING_HEART');
    expect(shDef).toBeDefined();
    expect(shDef.stats).toBeDefined();
    expect(shDef.stats.length).toBeGreaterThan(0);
    expect(shDef.stats[0].statType).toBe('HEAT_RESISTANCE_IGNORE');
    // Values scale by talent level: [10, 15, 20]
    expect(shDef.stats[0].value).toEqual([10, 15, 20]);
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

    const shEvents = filterByColumn(result, 'scorching-heart');
    // Two Scorching Hearts: first from initial accumulation, second from re-accumulation
    expect(shEvents.length).toBe(2);
    // Both target enemy
    expect(shEvents[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(shEvents[1].ownerId).toBe(ENEMY_OWNER_ID);
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
    const shEvents = filterByColumn(result, 'scorching-heart');
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

  test('C3: Normal (non-override) battle skill first frame has MELTING_FLAME infliction', () => {
    // The raw BATTLE_SKILL (before override) has APPLY INFLICTION MELTING_FLAME
    // This tests the raw skills definition
    const rawSkills = mockLaevatainJson.skills;
    const battleFrames = rawSkills.BATTLE_SKILL.frames;
    const firstFrameEffects = battleFrames[0].effects;
    const mfEffect = firstFrameEffects.find(
      (e: any) => e.verbType === 'APPLY' && e.adjective === 'MELTING_FLAME'
    );
    expect(mfEffect).toBeDefined();
    expect(mfEffect.objectType).toBe('INFLICTION');
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
  test('E1: Enhanced basic attack (EMPOWERED_BASIC_ATTACK) has 4 segments', () => {
    const sequences = getSequences('EMPOWERED_BASIC_ATTACK');
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
    const sequences = getSequences('EMPOWERED_BASIC_ATTACK');
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
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'EXPEND'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.withPreposition.cardinality.value).toBe(300);
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

  test('F2: P1 adds x1.2 damage multiplier to Smouldering Fire', () => {
    const p1 = mockLaevatainJson.potentials[0];
    const dmgEffects = p1.effects.filter(
      (e: any) => e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.parameterKey === 'DAMAGE_MULTIPLIER'
    );
    expect(dmgEffects.length).toBe(2); // Normal and Enhanced
    for (const eff of dmgEffects) {
      expect(eff.skillParameterModifier.value).toBe(1.2);
      expect(eff.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
    }
  });

  test('F3: P3 Combustion reaction multiplier is x1.5', () => {
    const talentEffects = mockLaevatainJson.talentEffects;
    const p3Effect = talentEffects.find(
      (e: any) => e.bonusType === 'REACTION_MULTIPLIER' && e.condition?.reactionType === 'COMBUSTION'
    );
    expect(p3Effect).toBeDefined();
    expect(p3Effect.source).toBe('POTENTIAL');
    expect(p3Effect.minPotential).toBe(3);
    expect(p3Effect.values[0]).toBe(1.5);
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
    const shEvents = filterByColumn(result, 'scorching-heart');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].ownerId).toBe(ENEMY_OWNER_ID);
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
    const shEvents = filterByColumn(result, 'scorching-heart');

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
    expect(clause.effects[0].objectId).toBe('SCORCHING_HEART');
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

  test('G6: Scorching Heart RESET interaction — second trigger clamps previous', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const shDef = statusEvents.find((d: any) => d.name === 'SCORCHING_HEART');
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

  test('G9: Scorching Heart target is ENEMY', () => {
    const statusEvents = mockLaevatainJson.statusEvents as any[];
    const shDef = statusEvents.find((d: any) => d.name === 'SCORCHING_HEART');
    expect(shDef.target).toBe('ENEMY');
  });
});

}); // end Laevatain Combat Simulation
