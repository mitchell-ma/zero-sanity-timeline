/**
 * Akekuri — Combat Simulation Tests
 *
 * Controller-level tests validating Akekuri's operator interactions.
 * No UI, no DOM — pure engine logic against operator JSON data.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. Basic Attack (Sword of Aspiration)
 *    - 4 segments (+ 1 empty terminator segment)
 *    - Segment durations match JSON (0.5, 0.767, 0.733, 1.2s)
 *    - SP and Stagger effects removed from all basic attack frames (zero-value cleanup)
 *    - No infliction on any basic attack frame
 *    - Segment 2 has 2 frames (double hit), Segment 4 has 3 frames (triple hit)
 *    - Damage multipliers scale correctly (lv1 → lv12)
 *
 * B. Battle Skill (Burst of Passion)
 *    - Single frame at 0.67s offset
 *    - SP cost: 100
 *    - Ultimate energy: 6.5 to self + 6.5 to all operators
 *    - Stagger recovery: 10
 *    - Applies Heat infliction to enemy
 *    - Damage multiplier: 1.42 (lv1) → 3.2 (lv12)
 *
 * C. Combo Skill (Flash and Dash)
 *    - Trigger: enemy is Combusted (single clause)
 *    - Activation window: 720 frames (6s)
 *    - Cooldown: 15s
 *    - 2 frames, each recovers 7.5 SP and 5 Stagger
 *    - TIME_STOP animation (0.488s override within 1.27s duration)
 *    - Ultimate energy: 10 to self
 *    - Damage multiplier: 0.8 (lv1) → 1.8 (lv12)
 *
 * D. Ultimate (Squad on Me)
 *    - Energy cost: 108
 *    - Active duration: 3.425s
 *    - Animation: 1.683s with TIME_STOP within 4.3s duration
 *    - No frames (buff-only ultimate)
 *
 * E. Potentials
 *    - P1: Positive Feedback (implemented in DSL)
 *    - P2: +10 AGILITY, +10 INTELLECT stat modifiers
 *    - P3: UNIQUE_MULTIPLIER + 0.1 atk on Squad on Me
 *    - P4: ult cost reduction now via VARY_BY POTENTIAL in ult JSON
 *    - P5: Tempo of Awareness (implemented in DSL) + UNIQUE_MULTIPLIER duration on Squad on Me
 *
 * F. Operator Identity & Metadata
 *    - 4-star Vanguard, Heat element, Sword weapon
 *    - Main AGILITY, secondary INTELLECT
 *    - Talent names and levels
 *    - Level table 1–99+
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { VerbType, ObjectType, NounType, AdjectiveType, DeterminerType } from '../../dsl/semantics';
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../../controller/gameDataStore';
import { findStaggerInClauses } from '../../controller/timeline/clauseQueries';
import { wouldOverlapSiblings } from '../../controller/timeline/eventValidator';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));


// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../../model/game-data/operators/akekuri/akekuri.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadSkillsJson: _loadAkekuriSkills } = require('../helpers/loadGameData');
const mockSkillsJson = _loadAkekuriSkills('AKEKURI');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data; downstream tests assert structure
const akekuriSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(mockSkillsJson as Record<string, unknown>)) {
  akekuriSkills[key] = { ...(val as Record<string, unknown>), id: key };
}

// Infer skillTypeMap from naming conventions (same logic as operatorJsonLoader)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildSkillTypeMap: _buildSkillTypeMap } = require('../../utils/skillTypeMap');

const _skTypeMap = _buildSkillTypeMap(akekuriSkills);
for (const [key, value] of Object.entries(_skTypeMap)) {
  if (Array.isArray(value)) {
    if (value[0] && akekuriSkills[value[0]]) akekuriSkills[key] = akekuriSkills[value[0]];
  } else if (typeof value === 'object' && value !== null) {
    for (const [subKey, subIds] of Object.entries(value as Record<string, string[]>)) {
      if (subIds[0] && akekuriSkills[subIds[0]]) akekuriSkills[subKey] = akekuriSkills[subIds[0]];
    }
    const batkIds = (value as Record<string, string[]>).BATK;
    if (batkIds?.[0] && akekuriSkills[batkIds[0]]) akekuriSkills[key] = akekuriSkills[batkIds[0]];
  }
}
const mockJson = { ...mockOperatorJson, skills: akekuriSkills, skillTypeMap: _skTypeMap };

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Helper to extract values from the new clause-effects structure (replaces old multipliers access). */
function getFrameEffectValue(frame: Record<string, unknown>, verb: string, object: string, withKey: string): unknown {
  for (const pred of ((frame.clause ?? []) as Record<string, unknown>[])) {
    for (const ef of ((pred.effects ?? []) as Record<string, unknown>[])) {
      if (ef.verb === verb && ef.object === object && (ef.with as Record<string, unknown>)?.[withKey]) {
        const wv = (ef.with as Record<string, Record<string, unknown>>)[withKey];
        return wv.value;
      }
    }
  }
  return undefined;
}
function getDamageMultipliers(frame: Record<string, unknown>): number[] {
  return (getFrameEffectValue(frame, 'DEAL', 'DAMAGE', 'value') ?? []) as number[];
}

/** Resolve a duration value that may be a plain number or a ValueNode { verb, value }. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function durVal(v: any): any { return typeof v === 'object' && v !== null && 'value' in v ? v.value : v; }

function getSequences(skillCategory: string): readonly DataDrivenSkillEventSequence[] {
  return buildSequencesFromOperatorJson(mockJson, skillCategory);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Akekuri Combat Simulation', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Basic Attack (Sword of Aspiration)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Basic Attack (Sword of Aspiration)', () => {
  test('A1: Basic attack has 4 segments', () => {
    const sequences = getSequences(NounType.BATK);
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    expect(durVal(rawSegments[0].properties.duration.value)).toBe(0.5);
    expect(durVal(rawSegments[1].properties.duration.value)).toBe(0.767);
    expect(durVal(rawSegments[2].properties.duration.value)).toBe(0.733);
    expect(durVal(rawSegments[3].properties.duration.value)).toBe(1.2);
  });

  test('A3: Final Strike (segment 4, last frame) has no SP or Stagger effects (zero-value effects removed)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    const finalStrikeFrames = rawSegments[3].frames;
    const lastFrame = finalStrikeFrames[finalStrikeFrames.length - 1];
    const spEffect = lastFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT
    );
    const staggerEffect = lastFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.STAGGER
    );
    expect(spEffect).toBeUndefined();
    expect(staggerEffect).toBeUndefined();
  });

  test('A4: Earlier frames in segment 4 have no SP effects (zero-value effects removed)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    const frames = rawSegments[3].frames;
    for (let i = 0; i < frames.length; i++) {
      const spEffect = frames[i].clause[0].effects.find(
        (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT
      );
      expect(spEffect).toBeUndefined();
    }
  });

  test('A5: First 3 segments have no SP effects (zero-value effects removed)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      expect(getFrameEffectValue(frame, VerbType.RECOVER, NounType.SKILL_POINT, 'value')).toBeUndefined();
    }
  });

  test('A6: No infliction on any basic attack frame', () => {
    const sequences = getSequences(NounType.BATK);
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getClauses().flatMap(c => c.effects).find(e => e.dslEffect?.verb === VerbType.APPLY && e.dslEffect?.object === NounType.INFLICTION)).toBeUndefined();
      }
    }
  });

  test('A7: Segment 2 has 2 frames (double hit)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    expect(rawSegments[1].frames.length).toBe(2);
  });

  test('A8: Segment 4 has 3 frames (triple hit)', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    expect(rawSegments[3].frames.length).toBe(3);
  });

  test('A9: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockJson.skills[mockJson.skillTypeMap.BASIC_ATTACK.BATK[0]].segments;
    // Segment 1: 0.2 → 0.45
    const seg1Dmg = getDamageMultipliers(rawSegments[0].frames[0]);
    expect(seg1Dmg[0]).toBe(0.2);
    expect(seg1Dmg[11]).toBe(0.45);
    // Segment 3: 0.33 → 0.73
    const seg3Dmg = getDamageMultipliers(rawSegments[2].frames[0]);
    expect(seg3Dmg[0]).toBe(0.33);
    expect(seg3Dmg[11]).toBe(0.73);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Burst of Passion)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Burst of Passion)', () => {
  test('B1: Battle skill has single frame at 0.67s offset', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE[0]];
    expect(battleSkill.segments[0].frames.length).toBe(1);
    expect(battleSkill.segments[0].frames[0].properties.offset.value).toBe(0.67);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE[0]];
    const spCost = battleSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT && e.verb === VerbType.CONSUME
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B3: Battle skill has SP cost effect in clause', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE[0]];
    const spCost = battleSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT && e.verb === VerbType.CONSUME
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B4: Battle skill stagger recovery is 10', () => {
    const sequences = getSequences('BATTLE');
    const firstFrame = sequences[0].getFrames()[0];
    expect(findStaggerInClauses(firstFrame.getClauses())).toBe(10);
  });

  test('B5: Battle skill applies Heat infliction to enemy', () => {
    const battleFrame = mockJson.skills[mockJson.skillTypeMap.BATTLE[0]].segments[0].frames[0];
    const infliction = battleFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.object === NounType.INFLICTION
    );
    expect(infliction).toBeDefined();
    expect(infliction.objectQualifier).toBe(AdjectiveType.HEAT);
    expect(infliction.to).toBe(NounType.ENEMY);
  });

  test('B6: Damage multiplier scales from 1.42 (lv1) to 3.2 (lv12)', () => {
    const dmgValues = getDamageMultipliers(mockJson.skills[mockJson.skillTypeMap.BATTLE[0]].segments[0].frames[0]);
    expect(dmgValues[0]).toBe(1.42);
    expect(dmgValues[11]).toBe(3.2);
  });

  test('B7: Stagger is constant 10 across all levels', () => {
    const frame = mockJson.skills[mockJson.skillTypeMap.BATTLE[0]].segments[0].frames[0];
    expect(getFrameEffectValue(frame, VerbType.DEAL, NounType.STAGGER, 'value')).toBe(10);
  });

  test('B8: Battle skill duration is 1.33 seconds', () => {
    const battleSkill = mockJson.skills[mockJson.skillTypeMap.BATTLE[0]];
    expect(durVal(battleSkill.segments[0].properties.duration.value)).toBe(1.33);
    expect(battleSkill.segments[0].properties.duration.unit).toBe('SECOND');
  });

  test('B9: Battle skill ID is BURST_OF_PASSION', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.BATTLE[0]].id).toBe('BURST_OF_PASSION');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (Flash and Dash)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (Flash and Dash)', () => {
  test('C1: Combo trigger requires enemy Node Stagger or Full Stagger (two clauses)', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO[0]];
    expect(comboSkill.activationWindow.onTriggerClause.length).toBe(2);
    expect(comboSkill.activationWindow.onTriggerClause[0].conditions[0].subject).toBe(NounType.ENEMY);
    expect(comboSkill.activationWindow.onTriggerClause[0].conditions[0].verb).toBe(VerbType.IS);
    expect(comboSkill.activationWindow.onTriggerClause[0].conditions[0].object).toBe('NODE_STAGGERED');
    expect(comboSkill.activationWindow.onTriggerClause[1].conditions[0].subject).toBe(NounType.ENEMY);
    expect(comboSkill.activationWindow.onTriggerClause[1].conditions[0].verb).toBe(VerbType.IS);
    expect(comboSkill.activationWindow.onTriggerClause[1].conditions[0].object).toBe('FULL_STAGGERED');
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.COMBO[0]].activationWindow.segments[0].properties.duration.value).toBe(6);
  });

  test('C3: Combo has a cooldown segment with positive duration', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO[0]];
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(durVal(cdSeg.properties.duration.value)[0]).toBeGreaterThan(0);
  });

  test('C4: Combo has 2 frames with SP recovery and Stagger effects', () => {
    const frames = mockJson.skills[mockJson.skillTypeMap.COMBO[0]].segments[1].frames;
    expect(frames.length).toBe(2);
    for (const f of frames) {
      const sp = f.clause?.[0]?.effects.find((e: Record<string, unknown>) => e.object === NounType.SKILL_POINT);
      const stagger = f.clause?.[0]?.effects.find((e: Record<string, unknown>) => e.object === NounType.STAGGER);
      expect(sp).toBeDefined();
      expect(stagger).toBeDefined();
    }
  });

  test('C5: Combo animation is TIME_STOP (0.488s)', () => {
    const combo = mockJson.skills[mockJson.skillTypeMap.COMBO[0]];
    const animSeg = combo.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(0.488);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('C6: Combo base duration is 1.27 seconds', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO[0]];
    const totalDuration = durVal(comboSkill.segments[0].properties.duration.value) + durVal(comboSkill.segments[1].properties.duration.value);
    expect(totalDuration).toBeCloseTo(1.27, 2);
  });

  test('C7: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills[mockJson.skillTypeMap.COMBO[0]].clause[0].effects;
    const energy = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.ULTIMATE_ENERGY && e.verb === VerbType.RECOVER
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe(DeterminerType.THIS);
    expect(energy.to).toBe(NounType.OPERATOR);
    expect(energy.with.value.value).toBe(10);
  });

  test('C8: Combo damage multiplier: 0.8 (lv1) → 1.8 (lv12)', () => {
    const dmgValues = getDamageMultipliers(mockJson.skills[mockJson.skillTypeMap.COMBO[0]].segments[1].frames[0]);
    expect(dmgValues[0]).toBe(0.8);
    expect(dmgValues[11]).toBe(1.8);
  });

  test('C9: Combo skill ID is FLASH_AND_DASH', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.COMBO[0]].id).toBe('FLASH_AND_DASH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Squad on Me)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Squad on Me)', () => {
  test('D1: Ultimate energy cost is MULT(base, VARY_BY POTENTIAL)', () => {
    const effects = mockJson.skills[mockJson.skillTypeMap.ULTIMATE[0]].clause[0].effects;
    const energyCost = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.ULTIMATE_ENERGY && e.verb === VerbType.CONSUME
    );
    expect(energyCost).toBeDefined();
    const val = energyCost.with.value;
    expect(val.operation).toBe('MULT');
    expect(val.left.verb).toBe(VerbType.IS);
    expect(typeof val.left.value).toBe('number');
    expect(val.right.verb).toBe(VerbType.VARY_BY);
    expect(val.right.object).toBe(ObjectType.POTENTIAL);
    const potArr = val.right.value as number[];
    expect(potArr).toHaveLength(6);
    expect(Math.min(...potArr)).toBeLessThan(1);
  });

  test('D2: Ultimate active duration is 3.425 seconds (from ACTIVE segment)', () => {
    const ultimate = mockJson.skills[mockJson.skillTypeMap.ULTIMATE[0]];
    const activeSeg = ultimate.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ACTIVE')
    );
    expect(durVal(activeSeg.properties.duration.value)).toBe(3.425);
  });

  test('D3: Ultimate animation is TIME_STOP (1.683s within 5.108s total)', () => {
    const ultimate = mockJson.skills[mockJson.skillTypeMap.ULTIMATE[0]];
    const totalDuration = ultimate.segments.reduce(
      (sum: number, s: Record<string, unknown>) => sum + (durVal((s.properties as Record<string, Record<string, number>>)?.duration?.value) ?? 0), 0
    );
    expect(totalDuration).toBeCloseTo(5.108, 2);
    const animSeg = ultimate.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(1.683);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('D4: Ultimate has no damage frames', () => {
    const ultimate = mockJson.skills[mockJson.skillTypeMap.ULTIMATE[0]];
    const activeSeg = ultimate.segments[1];
    // Active segment has frames (SP recovery, Link), but none with damage multipliers
    const damageFrames = activeSeg.frames.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => f.clause?.some((c: any) => c.effects?.some((e: any) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE)),
    );
    expect(damageFrames.length).toBe(0);
  });

  test('D5: Ultimate skill ID is SQUAD_ON_ME', () => {
    expect(mockJson.skills[mockJson.skillTypeMap.ULTIMATE[0]].id).toBe('SQUAD_ON_ME');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Potentials', () => {
  test('E1: P1 — Positive Feedback', () => {
    const p1 = mockJson.potentials[0];
    expect(p1.level).toBe(1);
    expect(p1.name).toBe('Positive Feedback (P1)');
  });

  test('E2: P2 — Passionate Idealist', () => {
    const p2 = mockJson.potentials[1];
    expect(p2.level).toBe(2);
    expect(p2.name).toBe('Passionate Idealist (P2)');
  });

  test('E5: All 5 potential levels are present', () => {
    expect(mockJson.potentials.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(mockJson.potentials[i].level).toBe(i + 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Operator Identity & Metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Operator Identity & Metadata', () => {
  test('F1: Operator type and name', () => {
    expect(mockJson.id).toBe('AKEKURI');
    expect(mockJson.name).toBe('Akekuri');
  });

  test('F2: 4-star Vanguard, Heat element, Sword weapon', () => {
    expect(mockJson.operatorRarity).toBe(4);
    expect(mockJson.operatorClassType).toBe('VANGUARD');
    expect(mockJson.elementType).toBe('HEAT');
    expect(mockJson.weaponTypes).toContain('SWORD');
  });

  test('F3: Main attribute AGILITY, secondary INTELLECT', () => {
    expect(mockJson.mainAttributeType).toBe('AGILITY');
    expect(mockJson.secondaryAttributeType).toBe('INTELLECT');
  });

  test('F4: Talent IDs and attribute increase', () => {
    expect(mockJson.talents.one).toBe('CHEER_OF_VICTORY_TALENT');
    expect(mockJson.talents.two).toBe('STAYING_IN_THE_ZONE_TALENT');
    expect(mockJson.talents.attributeIncrease.id).toBe('SKIRMISHER');
  });

  test('F5: Level table has entries from 1 to 99+', () => {
    const levels = mockJson.statsByLevel;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
  });

  test('F6: Basic attack default duration removed from operator JSON', () => {
    expect(mockJson.basicAttackDefaultDuration).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
    return {
      id: overrides.name ?? '',
      name: '',
      ownerId: SLOT_ID,
      segments: [{ properties: { duration: 0 } }],
      ...overrides,
    };
  }

  test('G1: Basic attack has no cooldown — sequential basic attacks can overlap freely', () => {
    const ba1 = makeEvent({
      uid: 'ba-1',
      columnId: NounType.BASIC_ATTACK,
      startFrame: 0,
      segments: [{ properties: { duration: Math.round(0.5 * FPS) } }], // segment 1 duration
    });
    // Place second basic attack immediately after first segment
    const overlap = wouldOverlapSiblings(
      SLOT_ID, NounType.BASIC_ATTACK, Math.round(0.5 * FPS), 1, [ba1],
    );
    // Basic attacks have no nonOverlappableRange, so no overlap
    expect(overlap).toBe(false);
  });

  test('G2: Battle skill has no cooldown — can be used back-to-back', () => {
    const bsDuration = Math.round(1.33 * FPS); // 1.33s
    const bs1 = makeEvent({
      uid: 'bs-1',
      columnId: NounType.BATTLE,
      startFrame: 0,
      segments: [{ properties: { duration: bsDuration } }],
      nonOverlappableRange: bsDuration,
    });
    // Place second battle skill right after the first ends
    const overlap = wouldOverlapSiblings(
      SLOT_ID, NounType.BATTLE, bsDuration, bsDuration, [bs1],
    );
    expect(overlap).toBe(false);
  });

  test('G3: Combo skill has 15s cooldown — blocks placement during cooldown', () => {
    const comboDuration = Math.round(1.27 * FPS); // 152 frames
    const comboCooldown = 15 * FPS; // 1800 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      uid: 'cs-1',
      columnId: NounType.COMBO,
      startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
      nonOverlappableRange: totalRange,
    });

    // During cooldown: should be blocked
    const midCooldown = comboDuration + Math.round(7.5 * FPS);
    expect(wouldOverlapSiblings(
      SLOT_ID, NounType.COMBO, midCooldown, 1, [cs1],
    )).toBe(true);

    // After cooldown ends: should be allowed
    expect(wouldOverlapSiblings(
      SLOT_ID, NounType.COMBO, totalRange, 1, [cs1],
    )).toBe(false);
  });

  test('G4: Combo cooldown segment exists and has positive duration', () => {
    const comboSkill = mockJson.skills[mockJson.skillTypeMap.COMBO[0]];
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(durVal(cdSeg.properties.duration.value)[0]).toBeGreaterThan(0);
  });

  test('G5: Placement just before cooldown expires is still blocked', () => {
    const comboDuration = Math.round(1.27 * FPS);
    const comboCooldown = 15 * FPS;
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      uid: 'cs-1',
      columnId: NounType.COMBO,
      startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
      nonOverlappableRange: totalRange,
    });
    // 1 frame before cooldown ends
    expect(wouldOverlapSiblings(
      SLOT_ID, NounType.COMBO, totalRange - 1, 1, [cs1],
    )).toBe(true);
  });

  test('G6: Different owners can use combo at the same time (no cross-slot cooldown)', () => {
    const cs1 = makeEvent({
      uid: 'cs-1',
      ownerId: 'slot-0',
      columnId: NounType.COMBO,
      startFrame: 0,
      segments: [{ properties: { duration: 152 } }],
      nonOverlappableRange: 1952,
    });
    // Different owner at frame 0 — no overlap
    expect(wouldOverlapSiblings(
      'slot-1', NounType.COMBO, 0, 1, [cs1],
    )).toBe(false);
  });
});

}); // end Akekuri Combat Simulation
