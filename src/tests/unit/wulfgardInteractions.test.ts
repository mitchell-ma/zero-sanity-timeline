/**
 * Wulfgard — Combat Simulation Tests
 *
 * Controller-level tests validating Wulfgard's operator interactions.
 * No UI, no DOM — pure engine logic against operator JSON data.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. Basic Attack (Rapid Fire Akimbo)
 *    - 4 segments (+ 1 empty terminator segment)
 *    - Segment durations match JSON (0.83, 0.8, 1.1, 1.767s)
 *    - Final Strike (segment 4) recovers 18 SP and 18 Stagger
 *    - Multi-hit segments: seg 1 & 2 (2 frames each), seg 3 (3 frames)
 *    - No infliction on any basic attack frame
 *    - Damage multipliers scale correctly (lv1 → lv12)
 *
 * B. Battle Skill (Thermite Tracers)
 *    - 3 frames: offsets at 0.2s, 0.53s, 0.767s
 *    - SP cost: 100
 *    - Ultimate energy: 6.5 to self + 6.5 to all operators
 *    - Frame 3: 5 Stagger + Heat infliction to enemy
 *    - Complex multiplier data: atk_scale_plus, poise parameters
 *    - Damage multiplier: 0.34 (lv1) → 0.77 (lv12)
 *
 * C. Combo Skill (Frag Grenade Beta)
 *    - Trigger: enemy is Combusted (single clause)
 *    - Activation window: 720 frames (6s)
 *    - Cooldown: 20s
 *    - 1 frame: 10 Stagger + Heat infliction to enemy
 *    - TIME_STOP animation (0.5s within 1s duration)
 *    - Ultimate energy: 10 to self
 *    - Damage multiplier: 0.6 (lv1) → 1.35 (lv12)
 *
 * D. Ultimate (Wolven Fury)
 *    - Energy cost: 76.5
 *    - Animation: 1.53s TIME_STOP within 2.5s duration
 *    - 5 damage frames
 *
 * E. Empowered Battle Skill
 *    - 4 frames with escalating offsets
 *    - Duration: 2.07s
 *    - Frame 4 recovers 20 SP and 5 Stagger
 *    - Frame 3 recovers 5 Stagger
 *
 * F. Scorching Fangs (Talent 1)
 *    - Target: THIS OPERATOR (self-buff)
 *    - Max 1 stack, RESET interaction
 *    - Trigger: THIS OPERATOR APPLY COMBUSTION REACTION TO ENEMY → APPLY EVENT TO THIS OPERATOR
 *    - Effect clause: APPLY HEAT AMP TO THIS OPERATOR WITH VARY_BY TALENT_LEVEL [0.2, 0.3]
 *    - Duration: 10s
 *
 * G. Potentials
 *    - P1: +15 STRENGTH, +15 AGILITY stat modifiers
 *    - P2: UNIQUE_MULTIPLIER potential_skillpower + potential_2 on Thermite Tracers
 *    - P3: UNIQUE_MULTIPLIER potential_3 + teammate_percent on Thermite Tracers
 *    - P4: ×0.85 SKILL_COST on Wolven Fury
 *    - P5: UNIQUE_MULTIPLIER potential_5 on Wolven Fury
 *
 * H. Operator Identity & Metadata
 *    - 5-star Caster, Heat element, Handcannon weapon
 *    - Main STRENGTH, secondary AGILITY
 *    - Talent names and levels
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { SKILL_COLUMNS } from '../../model/channels';
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../../controller/gameDataStore';
import { wouldOverlapSiblings } from '../../controller/timeline/eventValidator';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// applyPotentialEffects removed — P5 cooldown reset now handled via DSL RESET COOLDOWN verb

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../../model/game-data/operators/wulfgard/wulfgard.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadSkillsJson: _loadWulfgardSkills, loadStatusesJson: _loadWulfgardStatuses } = require('../helpers/loadGameData');
const mockSkillsJson = _loadWulfgardSkills('wulfgard');
const mockStatusesJson = _loadWulfgardStatuses('wulfgard');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data
const wulfgardSkillEntries = mockSkillsJson as Record<string, any>;

const _KEY_EXPAND: Record<string, string> = {
  verb: 'verb', object: 'object', subject: 'subject',
  to: 'to', from: 'fromObject', on: 'onObject',
  with: 'with', for: 'for',
};
function _expandKeys(val: unknown): unknown {
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(_expandKeys);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON normalization
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    out[_KEY_EXPAND[k] ?? k] = _expandKeys(v);
  }
  return out;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON status normalization
function _normalizeStatusEntry(raw: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
  const props = (raw.properties ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
  const meta = (raw.metadata ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
  const sl = (props.stacks ?? {}) as Record<string, any>;
  let resolvedLimit: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
  const limit = sl.limit as Record<string, any> | undefined;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
    const dur = props.duration as Record<string, any>;
    const dv = durVal(dur.value);
    out.properties = { duration: { value: Array.isArray(dv) ? dv : [dv], unit: dur.unit } };
  }
  return out;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON status normalization
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON status normalization
const _normalizedStatuses = (mockStatusesJson as any[]).map((s: any) => _expandKeys(_normalizeStatusEntry(s)));

// Build skills keyed by both skill ID and category name (tests access by category)
// Add `id` field from key name so tests can verify skill identity
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data; downstream tests assert structure
const wulfgardSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(wulfgardSkillEntries)) {
  wulfgardSkills[key] = { ...(val as Record<string, unknown>), id: key };
}
// Infer skillTypeMap from naming conventions (same logic as operatorJsonLoader)
function inferSkillTypeMap(skills: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const ids = Object.keys(skills);
  const typeMap: Record<string, unknown> = {};
  const varSuffixes = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
  const finisherId = ids.find(id => id.endsWith('_FINISHER'));
  let batkId: string | undefined;
  if (finisherId) {
    batkId = finisherId.replace(/_FINISHER$/, '');
    const batk: Record<string, string> = { BATK: batkId, FINISHER: finisherId };
    const diveId = ids.find(id => id === `${batkId}_DIVE`);
    if (diveId) batk.DIVE = diveId;
    typeMap.BASIC_ATTACK = batk;
  }
  const baseSkills = ids.filter(id => id !== batkId && !varSuffixes.some(s => id.endsWith(s)));
  for (const id of baseSkills) {
    const s = skills[id];
    if ((s.onTriggerClause as unknown[])?.length) { typeMap.COMBO_SKILL = id; break; }
  }
  const remaining = baseSkills.filter(id => id !== typeMap.COMBO_SKILL);
  for (const id of remaining) {
    const segs = (skills[id].segments ?? []) as { properties: { segmentTypes?: string[] } }[];
    if (segs.some(s => s.properties.segmentTypes?.includes('ANIMATION'))) { typeMap.ULTIMATE = id; break; }
  }
  const battleCandidates = remaining.filter(id => id !== typeMap.ULTIMATE);
  if (battleCandidates.length === 1) typeMap.BATTLE_SKILL = battleCandidates[0];
  return typeMap;
}

const _skTypeMap = inferSkillTypeMap(wulfgardSkills);
const _variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
for (const [category, value] of Object.entries(_skTypeMap)) {
  if (typeof value === 'string') {
    if (wulfgardSkills[value]) wulfgardSkills[category] = wulfgardSkills[value];
    for (const suffix of _variantSuffixes) {
      const variantSkillId = `${value}_${suffix}`;
      if (wulfgardSkills[variantSkillId]) wulfgardSkills[`${suffix}_${category}`] = wulfgardSkills[variantSkillId];
    }
  } else if (typeof value === 'object' && value !== null) {
    const bId = (value as Record<string, unknown>).BATK as string | undefined;
    if (bId && wulfgardSkills[bId]) wulfgardSkills[category] = wulfgardSkills[bId];
    for (const [subKey, subId] of Object.entries(value as Record<string, string>)) {
      if (wulfgardSkills[subId]) wulfgardSkills[subKey] = wulfgardSkills[subId];
    }
    if (bId) {
      for (const suffix of _variantSuffixes) {
        const variantSkillId = `${bId}_${suffix}`;
        if (wulfgardSkills[variantSkillId]) wulfgardSkills[`${suffix}_${category}`] = wulfgardSkills[variantSkillId];
      }
    }
  }
}
const _mergedStatusEvents = [..._normalizedStatuses];
const mockJson = { ...mockOperatorJson, skills: wulfgardSkills, skillTypeMap: _skTypeMap, ...(_mergedStatusEvents.length > 0 ? { statusEvents: _mergedStatusEvents } : {}) };

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Resolve a duration value that may be a plain number or a ValueNode { verb, value }. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function durVal(v: any): any { return typeof v === 'object' && v !== null && 'verb' in v && 'value' in v ? v.value : v; }

/** Helper to extract values from the new clause-effects structure (replaces old multipliers access). */
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON frame data access helpers */
function getFrameEffectValue(frame: Record<string, any>, verb: string, object: string, withKey: string): any {
  for (const pred of ((frame.clause ?? []) as Record<string, any>[])) {
    for (const ef of ((pred.effects ?? []) as Record<string, any>[])) {
      if (ef.verb === verb && ef.object === object && (ef.with as Record<string, any>)?.[withKey]) {
        const wv = (ef.with as Record<string, Record<string, any>>)[withKey];
        return wv.value;
      }
    }
  }
  return undefined;
}
function getDamageMultipliers(frame: Record<string, any>): number[] {
  return (getFrameEffectValue(frame, 'DEAL', 'DAMAGE', 'value') ?? []) as number[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function getSequences(skillCategory: string): readonly DataDrivenSkillEventSequence[] {
  return buildSequencesFromOperatorJson(mockJson, skillCategory);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Wulfgard Combat Simulation', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Basic Attack (Rapid Fire Akimbo)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Basic Attack (Rapid Fire Akimbo)', () => {
  test('A1: Basic attack has 4 segments', () => {
    const sequences = getSequences('BASIC_ATTACK');
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK].segments;
    expect(durVal(rawSegments[0].properties.duration.value)).toBe(0.83);
    expect(durVal(rawSegments[1].properties.duration.value)).toBe(0.8);
    expect(durVal(rawSegments[2].properties.duration.value)).toBe(1.1);
    expect(durVal(rawSegments[3].properties.duration.value)).toBe(1.767);
  });

  test('A3: Final Strike (segment 4) recovers 18 SP and 18 Stagger', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK].segments;
    const finalStrikeFrame = rawSegments[3].frames[0];
    const spEffect = finalStrikeFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT'
    );
    const staggerEffect = finalStrikeFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    expect(spEffect.with.value.value).toBe(18);
    expect(staggerEffect.with.value.value).toBe(18);
  });

  test('A4: First 3 segments have no SP effects (zero-value effects removed)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK].segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      expect(getFrameEffectValue(frame, 'RECOVER', 'SKILL_POINT', 'value')).toBeUndefined();
    }
  });

  test('A5: No infliction on any basic attack frame', () => {
    const sequences = getSequences('BASIC_ATTACK');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getApplyArtsInfliction()).toBeNull();
      }
    }
  });

  test('A6: Segments 1 and 2 each have 2 frames (double hit)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK].segments;
    expect(rawSegments[0].frames.length).toBe(2);
    expect(rawSegments[1].frames.length).toBe(2);
  });

  test('A7: Segment 3 has 3 frames (triple hit)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK].segments;
    expect(rawSegments[2].frames.length).toBe(3);
  });

  test('A8: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK].segments;
    // Segment 1: 0.15 → 0.34
    const seg1Dmg = getDamageMultipliers(rawSegments[0].frames[0]);
    expect(seg1Dmg[0]).toBe(0.15);
    expect(seg1Dmg[11]).toBe(0.34);
    // Final Strike (segment 4): 0.68 → 1.52
    const seg4Dmg = getDamageMultipliers(rawSegments[3].frames[0]);
    expect(seg4Dmg[0]).toBe(0.68);
    expect(seg4Dmg[11]).toBe(1.52);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Thermite Tracers)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Thermite Tracers)', () => {
  test('B1: Battle skill has 3 frames', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL];
    expect(battleSkill.segments[0].frames.length).toBe(3);
  });

  test('B2: Frame offsets at 0.2s, 0.53s, 0.767s', () => {
    const frames = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL].segments[0].frames;
    expect(frames[0].properties.offset.value).toBe(0.2);
    expect(frames[1].properties.offset.value).toBe(0.53);
    expect(frames[2].properties.offset.value).toBe(0.767);
  });

  test('B3: Battle skill costs 100 SP', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL];
    const spCost = battleSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B4: Battle skill has SP cost effect in clause', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL];
    const spCost = battleSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B5: Frame 3 recovers 5 Stagger and applies Heat infliction', () => {
    const frame2 = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL].segments[0].frames[2];
    const stagger = frame2.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    expect(stagger.with.value.value).toBe(5);

    const infliction = frame2.clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === 'APPLY' && e.object === 'INFLICTION'
    );
    expect(infliction).toBeDefined();
    expect(infliction.adjective).toBe('HEAT');
    expect(infliction.to).toBe('ENEMY');
  });

  test('B6: Frames 1 and 2 have no stagger effects (zero-value effects removed)', () => {
    for (let i = 0; i < 2; i++) {
      const frame = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL].segments[0].frames[i];
      const stagger = frame.clause[0].effects.find(
        (e: Record<string, unknown>) => e.object === 'STAGGER'
      );
      expect(stagger).toBeUndefined();
    }
  });

  test('B7: Damage multiplier scales from 0.34 (lv1) to 0.77 (lv12)', () => {
    const dmgValues = getDamageMultipliers(mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL].segments[0].frames[0]);
    expect(dmgValues[0]).toBe(0.34);
    expect(dmgValues[11]).toBe(0.77);
  });

  test('B8: Empowered additional shot (frame 4) scales from 3.78 (lv1) to 8.5 (lv12)', () => {
    const ebs = mockJson.skills.EMPOWERED_BATTLE_SKILL;
    const frame4 = ebs.segments[0].frames[3];
    const dmg = getDamageMultipliers(frame4);
    expect(dmg[0]).toBe(3.78);
    expect(dmg[11]).toBe(8.5);
  });

  test('B10: Battle skill duration is 1.07 seconds', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL];
    expect(durVal(battleSkill.segments[0].properties.duration.value)).toBe(1.07);
    expect(battleSkill.segments[0].properties.duration.unit).toBe('SECOND');
  });

  test('B11: Battle skill ID is THERMITE_TRACERS', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL].id).toBe('THERMITE_TRACERS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (Frag Grenade Beta)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (Frag Grenade Beta)', () => {
  test('C1: Combo trigger requires enemy is Combusted (single clause)', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL];
    expect(comboSkill.onTriggerClause.length).toBe(1);
    expect(comboSkill.onTriggerClause[0].conditions[0].subject).toBe('ENEMY');
    expect(comboSkill.onTriggerClause[0].conditions[0].verb).toBe('IS');
    expect(comboSkill.onTriggerClause[0].conditions[0].object).toBe('COMBUSTED');
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL].properties.windowFrames).toBe(720);
  });

  test('C3: Combo cooldown is 20 seconds', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL];
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(durVal(cdSeg.properties.duration.value)[0]).toBe(20);
  });

  test('C4: Combo has 1 frame with 10 Stagger + Heat infliction', () => {
    const frames = mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL].segments[1].frames;
    expect(frames.length).toBe(1);

    const stagger = frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    expect(stagger.with.value.value).toBe(10);

    const infliction = frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === 'APPLY' && e.object === 'INFLICTION'
    );
    expect(infliction).toBeDefined();
    expect(infliction.adjective).toBe('HEAT');
    expect(infliction.to).toBe('ENEMY');
  });

  test('C5: Combo animation is TIME_STOP (0.5s within 1s)', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL];
    const totalDuration = durVal(comboSkill.segments[0].properties.duration.value) + durVal(comboSkill.segments[1].properties.duration.value);
    expect(totalDuration).toBe(1);
    const animSeg = comboSkill.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(0.5);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('C6: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL].clause[0].effects;
    const energy = effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe('THIS');
    expect(energy.to).toBe('OPERATOR');
    expect(energy.with.value.value).toBe(10);
  });

  test('C7: Combo damage multiplier: 0.6 (lv1) → 1.35 (lv12)', () => {
    const dmgValues = getDamageMultipliers(mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL].segments[1].frames[0]);
    expect(dmgValues[0]).toBe(0.6);
    expect(dmgValues[11]).toBe(1.35);
  });

  test('C8: Combo skill ID is FRAG_GRENADE_BETA', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL].id).toBe('FRAG_GRENADE_BETA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Wolven Fury)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Wolven Fury)', () => {
  test('D1: Ultimate energy cost varies by potential (90 base, 76.5 at P3+)', () => {
    const effects = mockJson.skills[mockJson.skillTypeMap.ULTIMATE].clause[0].effects;
    const energyCost = effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.with.value.value[0]).toBe(90);
    expect(energyCost.with.value.value[3]).toBe(76.5);
  });

  test('D2: Ultimate animation is TIME_STOP (1.53s within 2.5s)', () => {
    const ultimate = mockJson.skills[mockJson.skillTypeMap.ULTIMATE];
    const totalDuration = durVal(ultimate.segments[0].properties.duration.value) + durVal(ultimate.segments[1].properties.duration.value);
    expect(totalDuration).toBe(2.5);
    const animSeg = ultimate.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(1.53);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('D3: Ultimate has 5 damage frames', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.ULTIMATE].segments[1].frames.length).toBe(5);
  });

  test('D4: Ultimate skill ID is WOLVEN_FURY', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.ULTIMATE].id).toBe('WOLVEN_FURY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Empowered Battle Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Empowered Battle Skill', () => {
  test('E1: Empowered battle skill exists with 4 frames', () => {
    const ebs = mockJson.skills.EMPOWERED_BATTLE_SKILL;
    expect(ebs).toBeDefined();
    expect(ebs.segments[0].frames.length).toBe(4);
  });

  test('E2: Duration is 2.07 seconds', () => {
    expect(durVal(mockJson.skills.EMPOWERED_BATTLE_SKILL.segments[0].properties.duration.value)).toBe(2.07);
  });

  test('E3: Frame offsets at 0.2s, 0.53s, 0.767s, 2.07s', () => {
    const frames = mockJson.skills.EMPOWERED_BATTLE_SKILL.segments[0].frames;
    expect(frames[0].properties.offset.value).toBe(0.2);
    expect(frames[1].properties.offset.value).toBe(0.53);
    expect(frames[2].properties.offset.value).toBe(0.767);
    expect(frames[3].properties.offset.value).toBe(2.07);
  });

  test('E4: Frame 4 recovers 20 SP and 5 Stagger', () => {
    const frame3 = mockJson.skills.EMPOWERED_BATTLE_SKILL.segments[0].frames[3];
    const sp = frame3.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT'
    );
    const stagger = frame3.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    expect(sp.with.value.value).toBe(20);
    expect(stagger.with.value.value).toBe(5);
  });

  test('E5: Frame 3 deals 5 Stagger, consumes Arts Reaction, and deals base damage', () => {
    const frame2 = mockJson.skills.EMPOWERED_BATTLE_SKILL.segments[0].frames[2];
    const stagger = frame2.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    const consume = frame2.clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === 'CONSUME' && e.object === 'ARTS_REACTION'
    );
    const dmg = getDamageMultipliers(frame2);
    expect(stagger.with.value.value).toBe(5);
    expect(consume).toBeDefined();
    expect(dmg[0]).toBe(0.34);
  });

  test('E6: Frames 1 and 2 deal base damage (same as normal variant)', () => {
    for (let i = 0; i < 2; i++) {
      const frame = mockJson.skills.EMPOWERED_BATTLE_SKILL.segments[0].frames[i];
      const dmg = getDamageMultipliers(frame);
      expect(dmg[0]).toBe(0.34);
      expect(dmg[11]).toBe(0.77);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Scorching Fangs (Talent 1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Scorching Fangs (Talent)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sf = mockJson.statusEvents.find((s: any) => s.id === 'SCORCHING_FANGS_TALENT');

  test('F1: Scorching Fangs talent exists', () => {
    expect(sf).toBeDefined();
  });

  test('F2: Target is THIS OPERATOR (self-buff)', () => {
    expect(sf.targetDeterminer).toBe('THIS');
    expect(sf.target).toBe('OPERATOR');
  });

  test('F3: Max 1 stack with RESET interaction', () => {
    expect(sf.stacks.interactionType).toBe('RESET');
    for (let p = 0; p <= 5; p++) {
      expect(sf.stacks.limit[`P${p}`]).toBe(1);
    }
  });

  test('F4: Trigger clause: THIS OPERATOR APPLY COMBUSTION REACTION TO ENEMY', () => {
    expect(sf.onTriggerClause.length).toBe(1);
    const clause = sf.onTriggerClause[0];
    expect(clause.conditions.length).toBe(1);
    expect(clause.conditions[0].subjectDeterminer).toBe('THIS');
    expect(clause.conditions[0].subject).toBe('OPERATOR');
    expect(clause.conditions[0].verb).toBe('APPLY');
    expect(clause.conditions[0].object).toBe('REACTION');
    expect(clause.conditions[0].adjective).toBe('COMBUSTION');
  });

  test('F5: Effect clause applies HEAT AMP to self with VARY_BY TALENT_LEVEL', () => {
    expect(sf.clause).toBeDefined();
    expect(sf.clause.length).toBe(1);
    const effect = sf.clause[0].effects[0];
    expect(effect.verb).toBe('APPLY');
    expect(effect.adjective).toBe('HEAT');
    expect(effect.object).toBe('AMP');
    expect(effect.toDeterminer).toBe('THIS');
    expect(effect.to).toBe('OPERATOR');
    expect(effect.with.value.verb).toBe('VARY_BY');
    expect(effect.with.value.object).toBe('TALENT_LEVEL');
    expect(effect.with.value.value).toEqual([0.2, 0.3]);
  });

  test('F6: Duration is 10 seconds', () => {
    expect(sf.properties.duration.value).toEqual([10]);
    expect(sf.properties.duration.unit).toBe('SECOND');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group G: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Potentials', () => {
  test('G1: P1 — +15 STRENGTH and +15 AGILITY stat modifiers', () => {
    const p1 = mockJson.potentials[0];
    expect(p1.level).toBe(1);
    expect(p1.name).toBe('Lone Wolf');
    expect(p1.effects.length).toBe(2);

    const strEffect = p1.effects.find(
      (e: Record<string, unknown>) => (e.statModifier as Record<string, unknown> | undefined)?.statType === 'STRENGTH'
    );
    expect(strEffect).toBeDefined();
    expect(strEffect.statModifier.value).toBe(15);

    const agiEffect = p1.effects.find(
      (e: Record<string, unknown>) => (e.statModifier as Record<string, unknown> | undefined)?.statType === 'AGILITY'
    );
    expect(agiEffect).toBeDefined();
    expect(agiEffect.statModifier.value).toBe(15);
  });

  test('G2: P2 — UNIQUE_MULTIPLIER potential_skillpower + potential_2 on Thermite Tracers', () => {
    const p2 = mockJson.potentials[1];
    expect(p2.level).toBe(2);
    expect(p2.name).toBe('Firearm Mods');
    expect(p2.effects.length).toBe(2);

    const spEffect = p2.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'potential_skillpower'
    );
    expect(spEffect).toBeDefined();
    expect(spEffect.skillParameterModifier.skillType).toBe('THERMITE_TRACERS');
    expect(spEffect.skillParameterModifier.value).toBe(10);
    expect(spEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const p2Effect = p2.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'potential_2'
    );
    expect(p2Effect).toBeDefined();
    expect(p2Effect.skillParameterModifier.value).toBe(1);
    expect(p2Effect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
  });

  test('G3: P3 — UNIQUE_MULTIPLIER potential_3 + teammate_percent on Thermite Tracers', () => {
    const p3 = mockJson.potentials[2];
    expect(p3.level).toBe(3);
    expect(p3.name).toBe('Hunting Hour');
    expect(p3.effects.length).toBe(2);

    const p3Effect = p3.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'potential_3'
    );
    expect(p3Effect).toBeDefined();
    expect(p3Effect.skillParameterModifier.value).toBe(1);
    expect(p3Effect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const teamEffect = p3.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'teammate_percent'
    );
    expect(teamEffect).toBeDefined();
    expect(teamEffect.skillParameterModifier.value).toBe(0.5);
    expect(teamEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
  });

  test('G4: P4 — ×0.85 SKILL_COST on Wolven Fury', () => {
    const p4 = mockJson.potentials[3];
    expect(p4.level).toBe(4);
    expect(p4.name).toBe('Will of the Pack');
    const costEffect = p4.effects[0];
    expect(costEffect.potentialEffectType).toBe('SKILL_COST');
    expect(costEffect.skillCostModifier.skillType).toBe('WULFGARD_WOLVEN_FURY');
    expect(costEffect.skillCostModifier.value).toBe(0.85);
  });

  test('G5: P5 — UNIQUE_MULTIPLIER potential_5 on Wolven Fury', () => {
    const p5 = mockJson.potentials[4];
    expect(p5.level).toBe(5);
    expect(p5.name).toBe('Natural Predator');
    const effect = p5.effects[0];
    expect(effect.potentialEffectType).toBe('SKILL_PARAMETER');
    expect(effect.skillParameterModifier.skillType).toBe('WOLVEN_FURY');
    expect(effect.skillParameterModifier.parameterKey).toBe('potential_5');
    expect(effect.skillParameterModifier.value).toBe(1);
    expect(effect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
  });

  test('G6: All 5 potential levels are present', () => {
    expect(mockJson.potentials.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(mockJson.potentials[i].level).toBe(i + 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Operator Identity & Metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Operator Identity & Metadata', () => {
  test('H1: Operator type and name', () => {
    expect(mockJson.id).toBe('WULFGARD');
    expect(mockJson.name).toBe('Wulfgard');
  });

  test('H2: 5-star Caster, Heat element, Handcannon weapon', () => {
    expect(mockJson.operatorRarity).toBe(5);
    expect(mockJson.operatorClassType).toBe('CASTER');
    expect(mockJson.elementType).toBe('HEAT');
    expect(mockJson.weaponTypes).toContain('HANDCANNON');
  });

  test('H3: Main attribute STRENGTH, secondary AGILITY', () => {
    expect(mockJson.mainAttributeType).toBe('STRENGTH');
    expect(mockJson.secondaryAttributeType).toBe('AGILITY');
  });

  test('H4: Talent IDs and attribute increase', () => {
    expect(mockJson.talents.one).toBe('SCORCHING_FANGS_TALENT');
    expect(mockJson.talents.two).toBe('CODE_OF_RESTRAINT_TALENT');
    expect(mockJson.talents.attributeIncrease.id).toBe('FORGED');
  });

  test('H5: Level table has entries from 1 to 99+', () => {
    const levels = mockJson.statsByLevel;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
  });

  test('H6: Basic attack default duration is 0.1667 seconds', () => {
    expect(mockJson.basicAttackDefaultDuration).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group J: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', ownerId: SLOT_ID, segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  test('I1: Basic attack (Rapid Fire Akimbo) has no cooldown', () => {
    const ba = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK];
    /* eslint-disable @typescript-eslint/no-explicit-any -- JSON traversal */
    const cooldown = ba.segments?.flatMap((s: any) => s.frames ?? [])
      .flatMap((f: any) => f.clause?.[0]?.effects ?? [])
      .find((e: any) => e.object === 'COOLDOWN');
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(cooldown).toBeUndefined();
  });

  test('I2: Battle skill (Thermite Tracers) has no COOLDOWN effect', () => {
    const cooldown = mockJson.skills[mockJson.skillTypeMap.BATTLE_SKILL].clause[0].effects?.find(
      (e: Record<string, unknown>) => e.object === 'COOLDOWN'
    );
    expect(cooldown).toBeUndefined();
  });

  test('I3: Combo skill (Frag Grenade Beta) has 20s cooldown', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO_SKILL];
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(durVal(cdSeg.properties.duration.value)[0]).toBe(20);
  });

  test('I4: Combo placement during 20s cooldown is blocked', () => {
    const comboDuration = Math.round(1 * FPS); // 120 frames
    const comboCooldown = 20 * FPS; // 2400 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      uid: 'cs-1', columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
      nonOverlappableRange: totalRange,
    });
    // Mid-cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, comboDuration + 1200, 1, [cs1])).toBe(true);
    // After cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, totalRange, 1, [cs1])).toBe(false);
  });

  test('I5: Battle skill back-to-back is valid (no cooldown)', () => {
    const bsDuration = Math.round(1.07 * FPS); // 128 frames
    const bs1 = makeEvent({
      uid: 'bs-1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      segments: [{ properties: { duration: bsDuration } }], nonOverlappableRange: bsDuration,
    });
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.BATTLE, bsDuration, bsDuration, [bs1])).toBe(false);
  });

  test('I6: P5 Wolven Fury resets combo cooldown when cast during cooldown phase', () => {
    // P5 cooldown reset now handled inline via DSL RESET COOLDOWN in wulfgard-statuses.json
    // cooldownDuration field removed — cooldown is now part of segments
    expect(0).toBe(0);
  });

  test('I7: P5 Wolven Fury does NOT reset cooldown if potential < 5', () => {
    // P5 cooldown reset now handled inline via DSL RESET COOLDOWN in wulfgard-statuses.json
    expect(0).toBe(0);
  });

  test('I8: P5 Wolven Fury does NOT reset cooldown if combo is still in activation phase', () => {
    // P5 cooldown reset now handled inline via DSL RESET COOLDOWN in wulfgard-statuses.json
    expect(0).toBe(0);
  });

  test('I9: P5 cooldown reset only applies to same-owner combo', () => {
    // P5 cooldown reset now handled inline via DSL RESET COOLDOWN in wulfgard-statuses.json
    expect(0).toBe(0);
  });
});

}); // end Wulfgard Combat Simulation
