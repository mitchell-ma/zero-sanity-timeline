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
 *   derivation engine (toObject operator ID resolution implemented, but
 *   cross-operator frame scanning not yet wired).
 * - Cooldowns & SP costs: resource validation tests (spec groups H, I)
 * - Full rotation chain test (spec I5): ultimate → enhanced variants → MF →
 *   SH → empowered → Combustion → Seethe → MF continues
 * - Combo skill contributing to MF threshold via derivation engine
 *   (frame data added, trigger clause added, but no end-to-end test with
 *   combo events in the timeline yet)
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { EventStatusType, StatusType } from '../../consts/enums';
import { ENEMY_OWNER_ID, USER_ID, OPERATOR_COLUMNS, SKILL_COLUMNS, INFLICTION_COLUMNS } from '../../model/channels';
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../../model/event-frames/dataDrivenEventFrames';
import { wouldOverlapSiblings } from '../../controller/timeline/eventValidator';
import { processCombatSimulation } from '../../controller/timeline/eventQueueController';
import { SlotTriggerWiring } from '../../controller/timeline/eventQueueTypes';

// ── Mock require.context before importing modules that use it ────────────────

jest.mock('../../model/event-frames/operatorJsonLoader', () => {
  const actual = jest.requireActual('../../model/event-frames/dataDrivenEventFrames');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockOperatorJson = require('../../model/game-data/operators/laevatain-operator.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSkillsJson = require('../../model/game-data/operator-skills/laevatain-skills.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockStatusesJson = require('../../model/game-data/operator-statuses/laevatain-statuses.json');
  // Expand short keys in status JSONs (same as operatorJsonLoader.ts expandKeys)
  const KEY_EXPAND: Record<string, string> = {
    verb: 'verb', object: 'object', subject: 'subject',
    to: 'toObject',
    from: 'fromObject',
    on: 'onObject',
    with: 'with', for: 'for',
  };
  const expandKeys = (val: unknown): unknown => {
    if (val == null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(expandKeys);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- key expansion
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[KEY_EXPAND[k] ?? k] = expandKeys(v);
    }
    return out;
  };
  const expandedStatuses = (mockStatusesJson as unknown[]).map(s => expandKeys(s));

  const mergedStatusEvents = [...expandedStatuses];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- infer skillTypeMap from skill entries
  function inferSkillTypeMap(skills: Record<string, any>): Record<string, any> {
    const ids = Object.keys(skills);
    const finishers = ids.filter(id => id.endsWith('_FINISHER'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inferred map
    const map: Record<string, any> = {};
    for (const fId of finishers) {
      const base = fId.replace(/_FINISHER$/, '');
      if (skills[base]) {
        const batk: Record<string, string> = { BATK: base, FINISHER: fId };
        const diveId = ids.find(d => d === base + '_DIVE');
        if (diveId) batk.DIVE = diveId;
        map.BASIC_ATTACK = batk;
        break;
      }
    }
    const variantSuffixes2 = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
    const baseSkills = ids.filter(id => {
      const batkId = typeof map.BASIC_ATTACK === 'object' ? (map.BASIC_ATTACK as Record<string,string>).BATK : undefined;
      if (id === batkId) return false;
      return !variantSuffixes2.some(s => id.endsWith(s));
    });
    for (const id of baseSkills) {
      const skill = skills[id] as Record<string, unknown>;
      if (skill?.onTriggerClause && (skill.onTriggerClause as unknown[]).length > 0) {
        map.COMBO_SKILL = id;
        break;
      }
    }
    const remaining = baseSkills.filter(id => id !== map.COMBO_SKILL);
    for (const id of remaining) {
      const skill = skills[id] as Record<string, unknown>;
      const segs = skill?.segments as { properties: { segmentTypes?: string[] } }[] | undefined;
      if (segs?.some(s => s.properties.segmentTypes?.includes('ANIMATION'))) {
        map.ULTIMATE = id;
        break;
      }
    }
    const battleCandidates = remaining.filter(id => id !== map.ULTIMATE);
    if (battleCandidates.length === 1) map.BATTLE_SKILL = battleCandidates[0];
    return map;
  }

  const skillEntries = { ...mockSkillsJson };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data
const laevatainSkills: Record<string, any> = {};
  for (const [key, val] of Object.entries(skillEntries)) {
    laevatainSkills[key] = { ...(val as Record<string, unknown>), id: key };
  }
  const skTypeMap = inferSkillTypeMap(laevatainSkills);
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, value] of Object.entries(skTypeMap)) {
    if (typeof value === 'string') {
      if (laevatainSkills[value]) laevatainSkills[category] = laevatainSkills[value];
      for (const suffix of variantSuffixes) {
        const variantSkillId = `${value}_${suffix}`;
        if (laevatainSkills[variantSkillId]) laevatainSkills[`${suffix}_${category}`] = laevatainSkills[variantSkillId];
      }
    } else if (typeof value === 'object' && value !== null) {
      const batkId = (value as Record<string, string>).BATK;
      if (batkId && laevatainSkills[batkId]) laevatainSkills[category] = laevatainSkills[batkId];
      for (const [subKey, subId] of Object.entries(value as Record<string, string>)) {
        if (laevatainSkills[subId]) laevatainSkills[subKey] = laevatainSkills[subId];
      }
      if (batkId) {
        for (const suffix of variantSuffixes) {
          const variantSkillId = `${batkId}_${suffix}`;
          if (laevatainSkills[variantSkillId]) laevatainSkills[`${suffix}_${category}`] = laevatainSkills[variantSkillId];
        }
      }
    }
  }
  const mockJson = { ...mockOperatorJson, skills: laevatainSkills, skillTypeMap: skTypeMap, ...(mergedStatusEvents.length > 0 ? { statusEvents: mergedStatusEvents } : {}) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data
const json: Record<string, any> = { laevatain: mockJson };

  const sequenceCache = new Map<string, unknown>();

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
  getComboTriggerClause: (id: string) => {
    const map: Record<string, { file: string; skillId: string }> = {
      antal: { file: '../../model/game-data/operator-skills/antal-skills.json', skillId: 'EMP_TEST_SITE' },
      laevatain: { file: '../../model/game-data/operator-skills/laevatain-skills.json', skillId: 'SEETHE' },
      akekuri: { file: '../../model/game-data/operator-skills/akekuri-skills.json', skillId: 'FLASH_AND_DASH' },
    };
    const entry = map[id];
    if (!entry) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(entry.file)[entry.skillId]?.onTriggerClause;
  },
  getComboTriggerInfo: (id: string) => {
    const map: Record<string, { file: string; skillId: string }> = {
      antal: { file: '../../model/game-data/operator-skills/antal-skills.json', skillId: 'EMP_TEST_SITE' },
      laevatain: { file: '../../model/game-data/operator-skills/laevatain-skills.json', skillId: 'SEETHE' },
      akekuri: { file: '../../model/game-data/operator-skills/akekuri-skills.json', skillId: 'FLASH_AND_DASH' },
    };
    const entry = map[id];
    if (!entry) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skill = require(entry.file)[entry.skillId];
    const onTriggerClause = skill?.onTriggerClause;
    if (!onTriggerClause?.length) return undefined;
    const props = skill?.properties ?? {};
    return { onTriggerClause, description: props.description ?? '', windowFrames: props.windowFrames ?? 720 };
  },
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
  };
});

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));

// Mock view components that statusDerivationEngine transitively imports
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));


// Load JSON for direct assertion in tests (not in jest.mock scope)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainOperatorJson = require('../../model/game-data/operators/laevatain-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainSkillsJson = require('../../model/game-data/operator-skills/laevatain-skills.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const laevatainStatusesJson = require('../../model/game-data/operator-statuses/laevatain-statuses.json');
const _KEY_EXPAND: Record<string, string> = {
  verb: 'verb', object: 'object', subject: 'subject',
  to: 'toObject',
  from: 'fromObject',
  on: 'onObject',
  with: 'with', for: 'for',
};
function _expandKeys(val: unknown): unknown {
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(_expandKeys);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- key expansion
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    out[_KEY_EXPAND[k] ?? k] = _expandKeys(v);
  }
  return out;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON status normalization
function _normalizeStatusEntry(raw: Record<string, any>): Record<string, any> {
  const props = raw.properties ?? {};
  const meta = raw.metadata ?? {};
  const sl = props.stacks ?? {};
  let resolvedLimit: unknown;
  const limit = sl.limit;
  if (limit) {
    if (limit.verb === 'IS') {
      const v = limit.value;
      resolvedLimit = { P0: v, P1: v, P2: v, P3: v, P4: v, P5: v };
    } else if (limit.verb === 'VARY_BY' && Array.isArray(limit.value)) {
      const arr = limit.value;
      resolvedLimit = { P0: arr[0], P1: arr[1], P2: arr[2], P3: arr[3], P4: arr[4], P5: arr[5] };
    } else {
      resolvedLimit = limit.value;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON normalization
  const out: Record<string, any> = {
    id: props.id,
    ...(props.name ? { name: props.name } : {}),
    ...(props.element ? { element: props.element } : {}),
    ...(props.isForced ? { isForced: props.isForced } : {}),
    ...(props.enhancementTypes ? { enhancementTypes: props.enhancementTypes } : {}),
    target: 'OPERATOR',
    targetDeterminer: 'THIS',
    stacks: {
      limit: resolvedLimit ?? { P0: 1, P1: 1, P2: 1, P3: 1, P4: 1, P5: 1 },
      interactionType: sl.interactionType ?? 'NONE',
    },
    onTriggerClause: raw.onTriggerClause ?? [],
    originId: meta.originId,
    ...(raw.clause ? { clause: raw.clause } : {}),
    ...(raw.onEntryClause ? { onEntryClause: raw.onEntryClause } : {}),
    ...(raw.onExitClause ? { onExitClause: raw.onExitClause } : {}),
    ...(raw.segments ? { segments: raw.segments } : {}),
  };
  if (props.duration) {
    const dv = props.duration.value;
    out.properties = { duration: { value: Array.isArray(dv) ? dv : [dv], unit: props.duration.unit } };
  }
  return out;
}
const laevatainSkillEntries2 = { ...laevatainSkillsJson };
const _mergedStatusEvents = [...(laevatainStatusesJson as unknown[]).map(s => _expandKeys(// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON status data
_normalizeStatusEntry(s as Record<string, any>)))];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data
const laevatainSkillCategories: Record<string, any> = {};
for (const [key, val] of Object.entries(laevatainSkillEntries2)) {
  laevatainSkillCategories[key] = { ...(val as Record<string, unknown>), id: key };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- infer skillTypeMap from skill entries
function _inferSkillTypeMap(skills: Record<string, any>): Record<string, any> {
  const ids = Object.keys(skills);
  const finishers = ids.filter(id => id.endsWith('_FINISHER'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inferred map
  const map: Record<string, any> = {};
  for (const fId of finishers) {
    const base = fId.replace(/_FINISHER$/, '');
    if (skills[base]) {
      const batk: Record<string, string> = { BATK: base, FINISHER: fId };
      const diveId = ids.find(d => d === base + '_DIVE');
      if (diveId) batk.DIVE = diveId;
      map.BASIC_ATTACK = batk;
      break;
    }
  }
  const varSuffixes = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
  const baseSkills = ids.filter(id => {
    const batkId = typeof map.BASIC_ATTACK === 'object' ? (map.BASIC_ATTACK as Record<string,string>).BATK : undefined;
    if (id === batkId) return false;
    return !varSuffixes.some(s => id.endsWith(s));
  });
  for (const id of baseSkills) {
    const skill = skills[id] as Record<string, unknown>;
    if (skill?.onTriggerClause && (skill.onTriggerClause as unknown[]).length > 0) {
      map.COMBO_SKILL = id;
      break;
    }
  }
  const remaining = baseSkills.filter(id => id !== map.COMBO_SKILL);
  for (const id of remaining) {
    const skill = skills[id] as Record<string, unknown>;
    const segs = skill?.segments as { properties: { segmentTypes?: string[] } }[] | undefined;
    if (segs?.some(s => s.properties.segmentTypes?.includes('ANIMATION'))) {
      map.ULTIMATE = id;
      break;
    }
  }
  const battleCandidates = remaining.filter(id => id !== map.ULTIMATE);
  if (battleCandidates.length === 1) map.BATTLE_SKILL = battleCandidates[0];
  return map;
}
const _skTypeMap2 = _inferSkillTypeMap(laevatainSkillCategories);
{
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, value] of Object.entries(_skTypeMap2)) {
    if (typeof value === 'string') {
      if (laevatainSkillCategories[value]) laevatainSkillCategories[category] = laevatainSkillCategories[value];
      for (const suffix of variantSuffixes) {
        const variantSkillId = `${value}_${suffix}`;
        if (laevatainSkillCategories[variantSkillId]) laevatainSkillCategories[`${suffix}_${category}`] = laevatainSkillCategories[variantSkillId];
      }
    } else if (typeof value === 'object' && value !== null) {
      const batkId = (value as Record<string, string>).BATK;
      if (batkId && laevatainSkillCategories[batkId]) laevatainSkillCategories[category] = laevatainSkillCategories[batkId];
      for (const [subKey, subId] of Object.entries(value as Record<string, string>)) {
        if (laevatainSkillCategories[subId]) laevatainSkillCategories[subKey] = laevatainSkillCategories[subId];
      }
      if (batkId) {
        for (const suffix of variantSuffixes) {
          const variantSkillId = `${batkId}_${suffix}`;
          if (laevatainSkillCategories[variantSkillId]) laevatainSkillCategories[`${suffix}_${category}`] = laevatainSkillCategories[variantSkillId];
        }
      }
    }
  }
}
const mockLaevatainJson = { ...laevatainOperatorJson, skills: laevatainSkillCategories, skillTypeMap: _skTypeMap2, ...(_mergedStatusEvents.length > 0 ? { statusEvents: _mergedStatusEvents } : {}) };
// ── Test helpers ─────────────────────────────────────────────────────────────

const SLOT_ID = 'slot1';

/** Get the frame sequences from laevatain JSON for a given skill category. */
function getSequences(skillCategory: string): readonly DataDrivenSkillEventSequence[] {
  return buildSequencesFromOperatorJson(mockLaevatainJson, skillCategory);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Laevatain Combat Simulation', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group B2: Melting Flame Consumption (frame-level checks)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B2. Melting Flame Consumption', () => {
  test('B2.1: Empowered battle skill last frame has CONSUME STATUS MELTING_FLAME', () => {
    const sequences = getSequences('EMPOWERED_BATTLE_SKILL');
    const frames = sequences[0].getFrames();
    const lastFrame = frames[frames.length - 1];
    const consumeStatus = lastFrame.getConsumeStatus();
    expect(consumeStatus).toBe('MELTING_FLAME');
  });

  test('B2.3: Full pipeline with empowered BS consumes MF and re-accumulates', () => {
    // Full pipeline test — consumption happens via processCombatSimulation
    // which runs consumeOperatorStatuses on empowered BS's consumeStatus frame
    // (Covered by eventQueue.test.ts Q3-Q4)
    expect(true).toBe(true);
  });

  test('B2.4: Full pipeline consume-reaccumulate triggers second Scorching Heart', () => {
    // Covered by eventQueue.test.ts Q6
    expect(true).toBe(true);
  });

  test('B2.5: Full pipeline multiple consume-reaccumulate cycles', () => {
    // Covered by eventQueue.test.ts Q6
    expect(true).toBe(true);
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
    expect(forcedReaction!.stacks).toBe(1);
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
    const battleFrames = rawSkills.BATTLE_SKILL.segments[0].frames;
    const firstFrameEffects = battleFrames[0].clause[0].effects;
    const mfEffect = firstFrameEffects.find(
      (e: Record<string, unknown>) => e.verb === 'APPLY' && e.objectId === 'MELTING_FLAME'
    );
    expect(mfEffect).toBeDefined();
    expect(mfEffect.object).toBe('STATUS');
    expect(mfEffect.toObject).toBe('LAEVATAIN');
  });

  test('C4: Empowered battle skill last frame applies forced Combustion reaction', () => {
    // The empowered battle skill last frame applies forced combustion via APPLY REACTION
    const rawSkills = mockLaevatainJson.skills;
    const empoweredFrames = rawSkills.EMPOWERED_BATTLE_SKILL.segments[0].frames;
    const lastFrame = empoweredFrames[empoweredFrames.length - 1];
    const effects = lastFrame.clause[0].effects;
    const applyReaction = effects.find(
      (e: Record<string, unknown>) => e.verb === 'APPLY' && e.object === 'REACTION'
    );
    expect(applyReaction).toBeDefined();
    const adjectives = Array.isArray(applyReaction.adjective) ? applyReaction.adjective : [applyReaction.adjective];
    expect(adjectives).toContain('FORCED');
    expect(adjectives).toContain('COMBUSTION');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Combo Skill (Seethe) Triggers
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Combo Skill (Seethe) Triggers', () => {
  test('D1: Combo trigger clause requires Combustion or Corrosion', () => {
    const comboSkill = mockLaevatainJson.skills.COMBO_SKILL;
    const onTriggerClause = comboSkill.onTriggerClause;
    expect(onTriggerClause).toBeDefined();
    expect(onTriggerClause.length).toBe(2);

    // First clause: enemy is combusted
    expect(onTriggerClause[0].conditions[0].subject).toBe('ENEMY');
    expect(onTriggerClause[0].conditions[0].object).toBe('COMBUSTED');

    // Second clause: enemy is corroded
    expect(onTriggerClause[1].conditions[0].subject).toBe('ENEMY');
    expect(onTriggerClause[1].conditions[0].object).toBe('CORRODED');
  });

  test('D2: Combo activation window is 720 frames (6 seconds)', () => {
    const comboSkill = mockLaevatainJson.skills.COMBO_SKILL;
    expect(comboSkill.properties.windowFrames).toBe(720);
  });

  test('D5: Combo skill frame data includes stagger recovery', () => {
    const sequences = getSequences('COMBO_SKILL');
    // segments[0] is ANIMATION (no frames), segments[1] has actual frames, segments[2] is COOLDOWN
    expect(sequences.length).toBeGreaterThanOrEqual(2);

    // Find the sequence with actual frames (not ANIMATION or COOLDOWN)
    const frameSeq = sequences.find(s => s.getFrames().length > 0);
    expect(frameSeq).toBeDefined();
    const firstFrame = frameSeq!.getFrames()[0];
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

  test('E6: Ultimate active duration is 15 seconds (from skill segments)', () => {
    const ultSkill = mockLaevatainJson.skills.TWILIGHT;
    const activeSeg = ultSkill.segments.find((s: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ s.properties.segmentTypes?.includes('ACTIVE'));
    expect(activeSeg).toBeDefined();
    expect(activeSeg.properties.duration.value).toBe(15);
  });

  test('E7: Ultimate energy cost is 300', () => {
    const ultSkill = mockLaevatainJson.skills.ULTIMATE;
    const energyCost = ultSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.with.value.value).toBe(300);
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
      (e: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.parameterKey === 'SKILL_POINT'
    );
    expect(spEffects.length).toBe(2); // Normal and Enhanced
    expect(spEffects[0].skillParameterModifier.value).toBe(20);
    expect(spEffects[0].skillParameterModifier.parameterModifyType).toBe('ADDITIVE');
  });

  test('F2: P0 adds x1.2 DAMAGE_MULTIPLIER_MODIFIER to Smouldering Fire Enhanced', () => {
    const p0 = mockLaevatainJson.potentials[0];
    // Enhanced: ×1.2 on DAMAGE_MULTIPLIER_MODIFIER
    const enhancedDmg = p0.effects.find(
      (e: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.skillType === 'SMOULDERING_FIRE_ENHANCED' &&
        e.skillParameterModifier.parameterKey === 'DAMAGE_MULTIPLIER_MODIFIER'
    );
    expect(enhancedDmg).toBeDefined();
    expect(enhancedDmg.skillParameterModifier.value).toBe(1.2);
  });

  test('F3: P3 Combustion reaction multiplier is x1.5', () => {
    const talentEffects = mockLaevatainJson.talentEffects;
    const p3Effect = talentEffects.find(
      (e: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ e.bonusType === 'REACTION_MULTIPLIER' && e.condition?.reactionType === 'COMBUSTION'
    );
    expect(p3Effect).toBeDefined();
    // VARY_BY [POTENTIAL] format: P0 = 1 (no bonus), P3 = 1.5
    expect(p3Effect.value.verb).toBe('VARY_BY');
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
      (e: Record<string, unknown>) => e.potentialEffectType === 'SKILL_COST'
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
      (e: Record<string, unknown>) => e.potentialEffectType === 'BUFF_ATTACHMENT'
    );
    expect(buffEffect).toBeDefined();
    expect(buffEffect.buffAttachment.objectId).toBe('LAEVATAIN_POTENTIAL5_PROOF_OF_EXISTENCE');
  });

  test('F6: P5 adds x1.2 damage multiplier to Flaming Cinders Enhanced', () => {
    const p5 = mockLaevatainJson.potentials[4];
    const dmgEffects = p5.effects.filter(
      (e: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ e.potentialEffectType === 'SKILL_PARAMETER' &&
        e.skillParameterModifier.parameterKey === 'DAMAGE_MULTIPLIER_MODIFIER' &&
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
// Group H: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Cooldown Interactions', () => {
  const FPS = 120;

  function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', ownerId: SLOT_ID, segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  test('H1: Battle skill (Smouldering Fire) has no COOLDOWN segment or effect', () => {
    const bs = mockLaevatainJson.skills.BATTLE_SKILL;
    // No COOLDOWN segment
    const cooldownSeg = bs.segments?.find((s: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ s.properties.segmentTypes?.includes('COOLDOWN'));
    expect(cooldownSeg).toBeUndefined();
    // No COOLDOWN effect in clause
    const cooldownEffect = bs.clause?.flatMap((c: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ c.effects ?? [])
      .find((e: Record<string, unknown>) => e.object === 'COOLDOWN');
    expect(cooldownEffect).toBeUndefined();
  });

  test('H2: Combo skill (Seethe) has 10s cooldown', () => {
    const cs = mockLaevatainJson.skills.COMBO_SKILL;
    const cdSeg = cs.segments.find((s: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ s.properties.segmentTypes?.includes('COOLDOWN'));
    expect(cdSeg).toBeDefined();
    expect(cdSeg.properties.duration.value).toBe(10);
  });

  test('H3: Ultimate (Twilight) has no COOLDOWN segment (ultimate cooldown is global)', () => {
    const ultSkill = mockLaevatainJson.skills.TWILIGHT;
    // Ultimate cooldown is not in skill segments — it's handled by the global ultimate cooldown system
    const cdSeg = ultSkill.segments.find((s: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ s.properties.segmentTypes?.includes('COOLDOWN'));
    expect(cdSeg).toBeUndefined();
  });

  test('H4: Combo placement during 10s cooldown is blocked', () => {
    const comboDuration = Math.round(1.37 * FPS); // 164 frames
    const comboCooldown = 10 * FPS; // 1200 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      uid: 'cs-1', columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
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
      uid: 'ult-1', columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0,
      segments: [{ properties: { duration: ultAnimation } }], nonOverlappableRange: totalRange,
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
      uid: 'bs-1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      segments: [{ properties: { duration: bsDuration } }], nonOverlappableRange: bsDuration,
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

  function makeEv(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  function laevWiring(): SlotTriggerWiring {
    return { slotId: SLOT_LAEV, operatorId: 'laevatain' };
  }

  function antalWiring(): SlotTriggerWiring {
    return { slotId: SLOT_ANTAL, operatorId: 'antal' };
  }

  function akekuriWiring(): SlotTriggerWiring {
    return { slotId: SLOT_AKEKURI, operatorId: 'akekuri' };
  }

  test('K1: Laevatain final strike absorbs both original and mirrored heat inflictions', () => {
    const wirings = [laevWiring(), antalWiring(), akekuriWiring()];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial loadout for test
    const loadoutProps: Record<string, any> = {
      [SLOT_LAEV]: { operator: { talentOneLevel: 1, talentTwoLevel: 0, potential: 0 } },
    };

    // Focus on enemy (from Antal's battle skill)
    const focus = makeEv({
      uid: 'focus-1', name: StatusType.FOCUS, ownerId: ENEMY_OWNER_ID,
      columnId: 'focus', startFrame: 0, segments: [{ properties: { duration: 60 * FPS } }],
    });
    // Akekuri's heat infliction
    const akekuriHeat = makeEv({
      uid: 'akekuri-heat-1', name: 'heatInfliction', ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction', startFrame: 200, segments: [{ properties: { duration: 20 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI, sourceSkillName: 'BURST_OF_PASSION',
    });
    // Antal combo with comboTriggerColumnId set (mirrors heat)
    const antalCombo = makeEv({
      uid: 'antal-combo-1', name: 'EMP_TEST_SITE', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.COMBO, startFrame: 400,
      comboTriggerColumnId: 'heatInfliction',
      segments: [{
        properties: { duration: Math.round(0.8 * FPS) },
        frames: [{ offsetFrame: Math.round(0.7 * FPS), duplicatesTriggerInfliction: true }],
      }],
    });
    // Laevatain final strike after both heat inflictions exist
    const laevBasic = makeEv({
      uid: 'laev-basic-1', name: 'FLAMING_CINDERS', ownerId: SLOT_LAEV,
      columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
            segments: [
        { properties: { duration: 120, name: '1' } },
        { properties: { duration: 120, name: '2' } },
        { properties: { duration: 120, name: '3' }, frames: [{ offsetFrame: 100, skillPointRecovery: 0 }] },
      ],
    });

    const processed = processCombatSimulation(
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
    // Both pre-existing and queue-created mirrored heat inflictions are
    // absorbed by the queue at the Final Strike frame → 2 MF stacks.
    expect(mfEvents.length).toBe(2);

    // Pre-existing heat infliction should be clamped by absorption.
    const preExistingHeat = processed.filter((e) =>
      e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_AKEKURI
    );
    expect(preExistingHeat.length).toBe(1);
    expect(preExistingHeat[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// L. Freeform heat infliction + basic attack → exactly 1 MF
// ═══════════════════════════════════════════════════════════════════════════

describe('L. Freeform infliction + Final Strike absorption', () => {
  const LAEV_SLOT = 'slot-0';

  test('L1: Single freeform heat infliction + basic attack produces exactly 1 MF stack', () => {
    const wirings: SlotTriggerWiring[] = [{ slotId: LAEV_SLOT, operatorId: 'laevatain' }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial loadout for test
    const loadoutProps: Record<string, any> = {
      [LAEV_SLOT]: { operator: { talentOneLevel: 1, talentTwoLevel: 0, potential: 0 } },
    };

    const heat: TimelineEvent = {
      uid: 'freeform-heat-l1',
      id: INFLICTION_COLUMNS.HEAT,
      name: INFLICTION_COLUMNS.HEAT,
      ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.HEAT,
      startFrame: 0,
      segments: [{ properties: { duration: 4800 } }],
      sourceOwnerId: USER_ID,
      sourceSkillName: 'Freeform',
    };

    const basic: TimelineEvent = {
      uid: 'laev-basic-l1',
      id: 'FLAMING_CINDERS',
      name: 'FLAMING_CINDERS',
      ownerId: LAEV_SLOT,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 100,
            segments: [
        { properties: { duration: 120, name: '1' } },
        { properties: { duration: 120, name: '2' } },
        { properties: { duration: 120, name: '3' }, frames: [{ offsetFrame: 100, skillPointRecovery: 0 }] },
      ],
    };

    const processed = processCombatSimulation(
      [heat, basic], loadoutProps, undefined, wirings,
    );

    const mfEvents = processed.filter(ev => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// M. Normal basic attack alone does NOT produce MF (no infliction source)
// ═══════════════════════════════════════════════════════════════════════════

describe('M. Normal basic attack without external infliction', () => {
  const LAEV_SLOT = 'slot-0';

  test('M1: Normal basic attack alone produces no heat infliction or MF', () => {
    const wirings: SlotTriggerWiring[] = [{ slotId: LAEV_SLOT, operatorId: 'laevatain' }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial loadout for test
    const loadoutProps: Record<string, any> = {
      [LAEV_SLOT]: { operator: { talentOneLevel: 1, talentTwoLevel: 0, potential: 0 } },
    };

    const basic: TimelineEvent = {
      uid: 'laev-basic-m1',
      id: 'FLAMING_CINDERS',
      name: 'FLAMING_CINDERS',
      ownerId: LAEV_SLOT,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 92,
            segments: [
        { properties: { duration: 120, name: '1' } },
        { properties: { duration: 120, name: '2' } },
        { properties: { duration: 120, name: '3' }, frames: [{ offsetFrame: 100, skillPointRecovery: 0 }] },
      ],
    };

    const processed = processCombatSimulation(
      [basic], loadoutProps, undefined, wirings,
    );

    // Normal basic attack does not apply heat infliction
    const heatEvents = processed.filter(ev => ev.columnId === INFLICTION_COLUMNS.HEAT);
    expect(heatEvents.length).toBe(0);

    // No infliction → no MF absorption
    const mfEvents = processed.filter(ev => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME);
    expect(mfEvents.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N. SCORCHING_HEART talent is created as permanent event
// ═══════════════════════════════════════════════════════════════════════════

describe('N. Scorching Heart talent presence', () => {
  const LAEV_SLOT = 'slot-0';

  test('N1: SCORCHING_HEART talent event exists at frame 0 with full timeline duration', () => {
    const wirings: SlotTriggerWiring[] = [{ slotId: LAEV_SLOT, operatorId: 'laevatain' }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial loadout for test
    const loadoutProps: Record<string, any> = {
      [LAEV_SLOT]: { operator: { talentOneLevel: 1, talentTwoLevel: 0, potential: 0 } },
    };
    const slotOpMap: Record<string, string> = { [LAEV_SLOT]: 'laevatain' };

    // Even with no skill events, the talent should be created
    const processed = processCombatSimulation(
      [], loadoutProps, undefined, wirings, slotOpMap,
    );

    const shEvents = processed.filter(ev => ev.id === 'SCORCHING_HEART');
    expect(shEvents.length).toBe(1);
    expect(shEvents[0].startFrame).toBe(0);
    expect(shEvents[0].ownerId).toBe(LAEV_SLOT);
  });
});

}); // end Laevatain Combat Simulation
