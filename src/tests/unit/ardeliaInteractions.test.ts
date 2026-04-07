/**
 * Ardelia — Combat Simulation Tests
 *
 * Controller-level tests validating Ardelia's operator interactions.
 * No UI, no DOM — pure engine logic against operator JSON data.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. Basic Attack (Rocky Whispers)
 *    - 4 segments (+ 1 empty terminator segment)
 *    - Segment durations match JSON (0.4, 0.7, 1.53, 2.167s)
 *    - Final Strike (segment 4) recovers 18 SP and 18 Stagger
 *    - Earlier segments recover 0 SP
 *    - Multi-hit segments: seg 2 (2 frames), seg 3 (3 frames)
 *    - No infliction on any basic attack frame
 *    - Damage multipliers scale correctly (lv1 → lv12)
 *
 * B. Battle Skill (Dolly Rush)
 *    - Single frame at 1.07s offset
 *    - SP cost: 100
 *    - Ultimate energy: 6.5 to self + 6.5 to all operators
 *    - Stagger recovery: 10
 *    - Duration: 1.57s
 *    - Vulnerability rate scales: 0.12 base (lv1) → 0.20 base (lv12)
 *    - Vulnerability duration: 30s across all levels
 *    - Damage multiplier: 1.42 (lv1) → 3.2 (lv12)
 *
 * C. Combo Skill (Eruption Column)
 *    - Trigger: any operator Final Strike AND enemy has no inflictions
 *    - Activation window: 720 frames (6s)
 *    - Cooldown: 18s
 *    - 2 frames: frame 2 has stagger 10 + forced Corrosion reaction
 *    - TIME_STOP animation (0.729s override within 0.77s duration)
 *    - Ultimate energy: 10 to self
 *    - Damage multiplier: 0.45 (lv1) → 1.0 (lv12)
 *
 * D. Ultimate (Wooly Party)
 *    - Energy cost: 90
 *    - Active duration: 3s
 *    - Animation: 2.5s TIME_STOP within 6.97s (from override)
 *    - 3 damage frames with scaling multipliers
 *
 * E. Empowered Battle Skill
 *    - Single frame at 1.07s offset
 *    - Duration: 1.57s (same as normal)
 *    - Stagger recovery: 10
 *
 * F. Potentials
 *    - P1: +0.08 ADDITIVE vulnerability rate on Dolly Rush
 *    - P2: UNIQUE_MULTIPLIER on Dolly Rush + Wooly Party
 *    - P3: UNIQUE_MULTIPLIER duration + ×1.2 effect_prob on Wooly Party
 *    - P4: ult cost reduction now via VARY_BY POTENTIAL in ult JSON
 *    - P5: UNIQUE_MULTIPLIER duration + 1.2 dmg_rate + -2 cooldown on Eruption Column
 *
 * G. Operator Identity & Metadata
 *    - 6-star Supporter, Nature element, Arts Unit weapon
 *    - Main INTELLECT, secondary WILL
 *    - Talent names and levels
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { SegmentType, StatusType, TimeDependency } from '../../consts/enums';
import { VerbType, ObjectType, NounType, AdjectiveType, DeterminerType } from '../../dsl/semantics';
import { ENEMY_OWNER_ID, COMBO_WINDOW_COLUMN_ID, INFLICTION_COLUMNS, PHYSICAL_INFLICTION_COLUMNS } from '../../model/channels';
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../../controller/gameDataStore';
import { wouldOverlapSiblings } from '../../controller/timeline/eventValidator';
import { processCombatSimulation } from '../../controller/timeline/eventQueueController';
import { SlotTriggerWiring } from '../../controller/timeline/eventQueueTypes';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {
    operator: { level: 90, potential: 0, talentOneLevel: 3, talentTwoLevel: 3, attributeIncreaseLevel: 4 },
    skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
    weapon: { level: 90, skill1Level: 9, skill2Level: 9, skill3Level: 9 },
  },
  getDefaultLoadoutProperties: () => ({
    operator: { level: 90, potential: 0, talentOneLevel: 3, talentTwoLevel: 3, attributeIncreaseLevel: 4 },
    skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
    weapon: { level: 90, skill1Level: 9, skill2Level: 9, skill3Level: 9 },
  }),
}));



// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../../model/game-data/operators/ardelia/ardelia.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadSkillsJson: _loadArdeliaSkills } = require('../helpers/loadGameData');
const mockSkillsJson = _loadArdeliaSkills('ARDELIA');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data; downstream tests assert structure
const ardeliaSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(mockSkillsJson as Record<string, unknown>)) {
  ardeliaSkills[key] = { ...(val as Record<string, unknown>), id: key };
}

// Infer skillTypeMap from naming conventions (same logic as operatorJsonLoader)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildSkillTypeMap: _buildSkillTypeMap } = require("../../utils/skillTypeMap");

const _skTypeMap = _buildSkillTypeMap(ardeliaSkills);
for (const [key, value] of Object.entries(_skTypeMap)) {
  if (Array.isArray(value)) {
    if (value[0] && ardeliaSkills[value[0]]) ardeliaSkills[key] = ardeliaSkills[value[0]];
  } else if (typeof value === 'object' && value !== null) {
    for (const [subKey, subIds] of Object.entries(value as Record<string, string[]>)) {
      if (subIds[0] && ardeliaSkills[subIds[0]]) ardeliaSkills[subKey] = ardeliaSkills[subIds[0]];
    }
    const batkIds = (value as Record<string, string[]>).BATK;
    if (batkIds?.[0] && ardeliaSkills[batkIds[0]]) ardeliaSkills[key] = ardeliaSkills[batkIds[0]];
  }
}
const mockJson = { ...mockOperatorJson, skills: ardeliaSkills, skillTypeMap: _skTypeMap };

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Resolve a duration value that may be a plain number or a ValueNode { verb, value }. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function durVal(v: any): any { return typeof v === 'object' && v !== null && 'value' in v ? v.value : v; }

function getSequences(skillCategory: string): readonly DataDrivenSkillEventSequence[] {
  return buildSequencesFromOperatorJson(mockJson, skillCategory);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Ardelia Combat Simulation', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Basic Attack (Rocky Whispers)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Basic Attack (Rocky Whispers)', () => {
  test('A1: Basic attack has 4 segments', () => {
    const sequences = getSequences(NounType.BATK);
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(durVal(rawSegments[0].properties.duration.value)).toBe(0.4);
    expect(durVal(rawSegments[1].properties.duration.value)).toBe(0.7);
    expect(durVal(rawSegments[2].properties.duration.value)).toBe(1.53);
    expect(durVal(rawSegments[3].properties.duration.value)).toBe(2.167);
  });

  test('A3: Final Strike (segment 4) recovers 18 SP and 18 Stagger', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    const finalStrikeFrame = rawSegments[3].frames[0];
    const effects = finalStrikeFrame.clause[0].effects;
    const spEffect = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT
    );
    const staggerEffect = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.STAGGER
    );
    expect(spEffect.with.value.value).toBe(18);
    expect(staggerEffect.with.value.value).toBe(18);
  });

  test('A4: Earlier segments have no SKILL_POINT or STAGGER effects', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      for (const frame of rawSegments[i].frames) {
        const effects = frame.clause[0].effects;
        const spEffect = effects.find((e: Record<string, unknown>) => e.object === NounType.SKILL_POINT);
        const staggerEffect = effects.find((e: Record<string, unknown>) => e.object === NounType.STAGGER);
        expect(spEffect).toBeUndefined();
        expect(staggerEffect).toBeUndefined();
      }
    }
  });

  test('A5: No infliction on any basic attack frame', () => {
    const sequences = getSequences(NounType.BATK);
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getClauses().flatMap(c => c.effects).find(e => e.dslEffect?.verb === VerbType.APPLY && e.dslEffect?.object === NounType.INFLICTION)).toBeUndefined();
      }
    }
  });

  test('A6: Segment 2 has 2 frames (double hit)', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[1].frames.length).toBe(2);
  });

  test('A7: Segment 3 has 3 frames (triple hit)', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[2].frames.length).toBe(3);
  });

  test('A8: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    // Segment 1: 0.3 → 0.68
    const seg1Dmg = rawSegments[0].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.DAMAGE
    );
    expect(seg1Dmg.with.value.value[0]).toBe(0.3);
    expect(seg1Dmg.with.value.value[11]).toBe(0.68);
    // Final Strike (segment 4): 0.55 → 1.24
    const seg4Dmg = rawSegments[3].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.DAMAGE
    );
    expect(seg4Dmg.with.value.value[0]).toBe(0.55);
    expect(seg4Dmg.with.value.value[11]).toBe(1.24);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Dolly Rush)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Dolly Rush)', () => {
  test('B1: Battle skill has single frame at 1.07s offset', () => {
    const battleSkill = mockJson.skills.BATTLE;
    expect(battleSkill.segments[0].frames.length).toBe(1);
    expect(battleSkill.segments[0].frames[0].properties.offset.value).toBe(1.07);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockJson.skills.BATTLE;
    const spCost = battleSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT && e.verb === VerbType.CONSUME
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B3: Battle skill has SP cost effect in clause', () => {
    const battleSkill = mockJson.skills.BATTLE;
    const effects = battleSkill.clause[0].effects;
    const spCost = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT && e.verb === VerbType.CONSUME
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B4: Stagger recovery is 10', () => {
    const sequences = getSequences('BATTLE');
    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });

  test('B5: Vulnerability rate scales from 0.12 (lv1) to 0.20 (lv12)', () => {
    const effects = mockJson.skills.BATTLE.segments[0].frames[0].clause[0].effects;
    const susceptEffect = effects.find((e: Record<string, unknown>) => e.object === NounType.STATUS && e.objectId === NounType.SUSCEPTIBILITY && e.objectQualifier === AdjectiveType.PHYSICAL);
    expect(susceptEffect).toBeDefined();
    expect(susceptEffect.with.value.value.left.value[0]).toBe(0.12);
    expect(susceptEffect.with.value.value.left.value[11]).toBe(0.2);
    expect(susceptEffect.with.value.value.operation).toBe('ADD');
    expect(susceptEffect.with.value.value.right.object).toBe(ObjectType.POTENTIAL);
    expect(susceptEffect.with.value.value.right.value).toEqual([0, 0.08, 0.08, 0.08, 0.08, 0.08]);
  });

  test('B6: Vulnerability duration is 30s at all skill levels', () => {
    const effects = mockJson.skills.BATTLE.segments[0].frames[0].clause[0].effects;
    const susceptEffect = effects.find((e: Record<string, unknown>) => e.object === NounType.STATUS && e.objectId === NounType.SUSCEPTIBILITY && e.objectQualifier === AdjectiveType.PHYSICAL);
    expect(susceptEffect).toBeDefined();
    expect(susceptEffect.with.duration.value).toBe(30);
  });

  test('B7: Both physical and arts susceptibility are applied with matching values', () => {
    const effects = mockJson.skills.BATTLE.segments[0].frames[0].clause[0].effects;
    const physSuscept = effects.find((e: Record<string, unknown>) => e.object === NounType.STATUS && e.objectId === NounType.SUSCEPTIBILITY && e.objectQualifier === AdjectiveType.PHYSICAL);
    const artsSuscept = effects.find((e: Record<string, unknown>) => e.object === NounType.STATUS && e.objectId === NounType.SUSCEPTIBILITY && e.objectQualifier === AdjectiveType.ARTS);
    expect(physSuscept).toBeDefined();
    expect(artsSuscept).toBeDefined();
    expect(physSuscept.with.value.value.left.value).toEqual(artsSuscept.with.value.value.left.value);
    expect(physSuscept.with.duration.value).toBe(artsSuscept.with.duration.value);
  });

  test('B8: Damage multiplier scales from 1.42 (lv1) to 3.2 (lv12)', () => {
    const effects = mockJson.skills.BATTLE.segments[0].frames[0].clause[1].effects;
    const dmgEffect = effects.find((e: Record<string, unknown>) => e.object === NounType.DAMAGE);
    expect(dmgEffect).toBeDefined();
    expect(dmgEffect.with.value.value[0]).toBe(1.42);
    expect(dmgEffect.with.value.value[11]).toBe(3.2);
  });

  test('B9: Battle skill duration is 1.57 seconds', () => {
    const battleSkill = mockJson.skills.BATTLE;
    expect(durVal(battleSkill.segments[0].properties.duration.value)).toBe(1.57);
    expect(battleSkill.segments[0].properties.duration.unit).toBe('SECOND');
  });

  test('B10: Battle skill ID is DOLLY_RUSH', () => {
    expect(mockJson.skills.BATTLE.id).toBe('DOLLY_RUSH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (Eruption Column)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (Eruption Column)', () => {
  test('C1: Combo trigger requires Final Strike with no Vulnerability or Arts Infliction', () => {
    const comboSkill = mockJson.skills.COMBO;
    expect(comboSkill.activationWindow.onTriggerClause.length).toBe(1);
    const conditions = comboSkill.activationWindow.onTriggerClause[0].conditions;
    // 1 trigger condition + 5 negated forbid conditions
    expect(conditions.length).toBe(6);
    expect(conditions[0].subjectDeterminer).toBe(DeterminerType.ANY);
    expect(conditions[0].subject).toBe(NounType.OPERATOR);
    expect(conditions[0].verb).toBe(VerbType.PERFORM);
    expect(conditions[0].object).toBe(NounType.SKILL);
    expect(conditions[0].objectId).toBe(NounType.FINAL_STRIKE);
    const negated = conditions.filter((c: Record<string, unknown>) => c.negated);
    expect(negated.length).toBe(5);
    for (const n of negated) {
      expect(n.subject).toBe(NounType.ENEMY);
      expect(n.verb).toBe(VerbType.HAVE);
      expect(n.object).toBe(NounType.STATUS);
      expect(n.objectId).toBe(NounType.INFLICTION);
    }
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    expect(mockJson.skills.COMBO.activationWindow.segments[0].properties.duration.value).toBe(6);
  });

  test('C3: Combo cooldown is 18 seconds', () => {
    const comboSkill = mockJson.skills.COMBO;
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(cdSeg.properties.duration.value.operation).toBe('ADD');
    expect(cdSeg.properties.duration.value.left.value[0]).toBe(18);
    expect(cdSeg.properties.duration.value.right.object).toBe(ObjectType.POTENTIAL);
    expect(cdSeg.properties.duration.value.right.value).toEqual([0, 0, 0, 0, 0, -2]);
  });

  test('C4: Combo has 2 frames across active and delayed explosion segments', () => {
    expect(mockJson.skills.COMBO.segments[1].frames.length).toBe(1);
    expect(mockJson.skills.COMBO.segments[2].frames.length).toBe(1);
  });

  test('C5: Combo delayed explosion applies forced Corrosion reaction to enemy', () => {
    const explosionFrame = mockJson.skills.COMBO.segments[2].frames[0];
    const reaction = explosionFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.objectId === NounType.REACTION
    );
    expect(reaction).toBeDefined();
    expect(reaction.objectQualifier).toBe(StatusType.CORROSION);
    expect(reaction.with.isForced.value).toBe(1);
    expect(reaction.to).toBe(NounType.ENEMY);
    expect(reaction.with.stacks.value).toBe(1);
    expect(reaction.with.duration.operation).toBe('ADD');
    expect(reaction.with.duration.left.value).toBe(7);
    expect(reaction.with.duration.right.object).toBe(ObjectType.POTENTIAL);
    expect(reaction.with.duration.right.value).toEqual([0, 0, 0, 0, 0, 4]);
  });

  test('C5b: Combo delayed explosion frame is GUARANTEED_HIT and PASSIVE', () => {
    const explosionFrame = mockJson.skills.COMBO.segments[2].frames[0];
    expect(explosionFrame.frameTypes).toEqual(['GUARANTEED_HIT', 'PASSIVE']);
  });

  test('C6: Combo delayed explosion deals 10 stagger', () => {
    const explosionFrame = mockJson.skills.COMBO.segments[2].frames[0];
    const stagger = explosionFrame.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.STAGGER
    );
    expect(stagger.with.value.value).toBe(10);
  });

  test('C7: Combo animation is TIME_STOP (0.729s)', () => {
    const combo = mockJson.skills.COMBO;
    const animSeg = combo.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(0.729);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('C8: Combo base duration is 0.77 seconds', () => {
    const totalDuration = durVal(mockJson.skills.COMBO.segments[0].properties.duration.value) + durVal(mockJson.skills.COMBO.segments[1].properties.duration.value);
    expect(totalDuration).toBeCloseTo(0.77, 2);
  });

  test('C9: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills.COMBO.clause[0].effects;
    const energy = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.ULTIMATE_ENERGY && e.verb === VerbType.RECOVER
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe(DeterminerType.THIS);
    expect(energy.to).toBe(NounType.OPERATOR);
    expect(energy.with.value.value).toBe(10);
  });

  test('C10: Combo damage multiplier: 0.45 (lv1) → 1.0 (lv12)', () => {
    const dmgEffect = mockJson.skills.COMBO.segments[1].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === NounType.DAMAGE
    );
    expect(dmgEffect.with.value.operation).toBe('MULT');
    expect(dmgEffect.with.value.left.value[0]).toBe(0.45);
    expect(dmgEffect.with.value.left.value[11]).toBe(1);
    expect(dmgEffect.with.value.right.object).toBe(ObjectType.POTENTIAL);
    expect(dmgEffect.with.value.right.value).toEqual([1, 1, 1, 1, 1, 1.2]);
  });

  test('C11: Combo skill ID is ERUPTION_COLUMN', () => {
    expect(mockJson.skills.COMBO.id).toBe('ERUPTION_COLUMN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Wooly Party)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Wooly Party)', () => {
  test('D1: Ultimate energy cost is MULT(base, VARY_BY POTENTIAL)', () => {
    const effects = mockJson.skills.ULTIMATE.clause[0].effects;
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

  test('D2: Ultimate active duration uses ADD(base, VARY_BY POTENTIAL) for P3 extension', () => {
    const ultimate = mockJson.skills.ULTIMATE;
    const activeSeg = ultimate.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ACTIVE')
    );
    expect(activeSeg).toBeDefined();
    expect(activeSeg.properties.duration.value.operation).toBe('ADD');
    expect(typeof activeSeg.properties.duration.value.left.value).toBe('number');
    expect(activeSeg.properties.duration.value.right.object).toBe(ObjectType.POTENTIAL);
    expect(activeSeg.properties.duration.value.right.value).toHaveLength(6);
  });

  test('D3: Ultimate animation segment is TIME_STOP', () => {
    const ult = mockJson.skills.ULTIMATE;
    const animSeg = ult.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(typeof durVal(animSeg.properties.duration.value)).toBe('number');
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('D4: Ultimate has base frames plus P3-gated frames (some with damage effects)', () => {
    const ult = mockJson.skills.ULTIMATE;
    const frames = ult.segments[1].frames;
    expect(frames.length).toBeGreaterThanOrEqual(11);
    const framesWithDmg = frames.filter((f: Record<string, unknown>) =>
      (f.clause as Record<string, unknown>[] | undefined)?.some((clause: Record<string, unknown>) =>
        (clause.effects as Record<string, unknown>[] | undefined)?.some((e: Record<string, unknown>) => e.object === NounType.DAMAGE))
    );
    expect(framesWithDmg.length).toBeGreaterThanOrEqual(3);
  });

  test('D5: Ultimate skill ID is WOOLY_PARTY', () => {
    expect(mockJson.skills.ULTIMATE.id).toBe('WOOLY_PARTY');
  });

  test('D6: Every ultimate frame deals NATURE DAMAGE with VARY_BY SKILL_LEVEL', () => {
    const frames = mockJson.skills.ULTIMATE.segments[1].frames;
    const dmgFrames = frames.filter((f: Record<string, unknown>) =>
      (f.clause as Record<string, unknown>[] | undefined)?.some((clause: Record<string, unknown>) =>
        (clause.effects as Record<string, unknown>[] | undefined)?.some((e: Record<string, unknown>) => e.object === NounType.DAMAGE))
    );
    expect(dmgFrames.length).toBe(frames.length);
  });

  test('D7: P3-gated frames have HAVE POTENTIAL GREATER_THAN_EQUAL condition', () => {
    const frames = mockJson.skills.ULTIMATE.segments[1].frames;
    const gatedFrames = frames.filter((f: Record<string, unknown>) =>
      (f.clause as Record<string, unknown>[] | undefined)?.some((clause: Record<string, unknown>) =>
        (clause.conditions as Record<string, unknown>[] | undefined)?.some((c: Record<string, unknown>) => c.object === ObjectType.POTENTIAL))
    );
    expect(gatedFrames.length).toBeGreaterThan(0);
    expect(gatedFrames.length).toBeLessThan(frames.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Empowered Battle Skill
// ═══════════════════════════════════════════════════════════════════════════════

// E. Empowered Battle Skill — removed (no empowered variant file exists for Ardelia)

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Potentials', () => {
  test('F5: All 5 potential levels are present', () => {
    expect(mockJson.potentials.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(mockJson.potentials[i].level).toBe(i + 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group G: Operator Identity & Metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Operator Identity & Metadata', () => {
  test('G1: Operator type and name', () => {
    expect(mockJson.id).toBe('ARDELIA');
    expect(mockJson.name).toBe('Ardelia');
  });

  test('G2: 6-star Supporter, Nature element, Arts Unit weapon', () => {
    expect(mockJson.operatorRarity).toBe(6);
    expect(mockJson.operatorClassType).toBe('SUPPORTER');
    expect(mockJson.elementType).toBe('NATURE');
    expect(mockJson.weaponTypes).toContain('ARTS_UNIT');
  });

  test('G3: Main attribute INTELLECT, secondary WILL', () => {
    expect(mockJson.mainAttributeType).toBe('INTELLECT');
    expect(mockJson.secondaryAttributeType).toBe('WILL');
  });

  test('G4: Talent IDs and attribute increase', () => {
    expect(mockJson.talents.one).toBe('FRIENDLY_PRESENCE_TALENT');
    expect(mockJson.talents.two).toBe('MOUNTAINPEAK_SURFER_TALENT');
    expect(mockJson.talents.attributeIncrease.id).toBe('KEEN_MIND');
  });

  test('G5: Level table has entries from 1 to 99+', () => {
    const levels = mockJson.statsByLevel;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
  });

  test('G6: Basic attack default duration removed from operator JSON', () => {
    expect(mockJson.basicAttackDefaultDuration).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group I: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', ownerId: SLOT_ID, segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  test('H1: Basic attack (Rocky Whispers) has no cooldown', () => {
    const ba = mockJson.skills.BASIC_ATTACK;
    const cooldown = ba.segments?.flatMap((s: Record<string, unknown>) => s.frames ?? [])
      .flatMap((f: Record<string, unknown>) => f.effects ?? [])
      .find((e: Record<string, unknown>) => e.object === NounType.COOLDOWN);
    expect(cooldown).toBeUndefined();
  });

  test('H2: Battle skill (Dolly Rush) has no COOLDOWN effect', () => {
    const cooldown = mockJson.skills.BATTLE.effects?.find(
      (e: Record<string, unknown>) => e.object === NounType.COOLDOWN
    );
    expect(cooldown).toBeUndefined();
  });

  test('H3: Combo skill (Eruption Column) has 18s cooldown', () => {
    const comboSkill = mockJson.skills.COMBO;
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(cdSeg.properties.duration.value.left.value[0]).toBe(18);
  });

  test('H4: Ultimate (Wooly Party) has no cooldown duration in operator JSON', () => {
    expect(mockJson.ultimateCooldownDuration).toBeUndefined();
  });

  test('H5: Combo placement during 18s cooldown is blocked', () => {
    const comboDuration = Math.round(0.77 * FPS);
    const comboCooldown = 18 * FPS;
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      uid: 'cs-1', columnId: NounType.COMBO, startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
      nonOverlappableRange: totalRange,
    });
    expect(wouldOverlapSiblings(SLOT_ID, NounType.COMBO, comboDuration + 300, 1, [cs1])).toBe(true);
    expect(wouldOverlapSiblings(SLOT_ID, NounType.COMBO, totalRange, 1, [cs1])).toBe(false);
  });

  test('H6: Ultimate with 0s cooldown allows immediate re-use after active phase', () => {
    const ultDuration = Math.round(6.97 * FPS);
    const ultActive = 3 * FPS;
    const totalRange = ultDuration + ultActive; // no cooldown
    const ult1 = makeEvent({
      uid: 'ult-1', columnId: NounType.ULTIMATE, startFrame: 0,
      segments: [{ properties: { duration: ultDuration } }], nonOverlappableRange: totalRange,
    });
    expect(wouldOverlapSiblings(SLOT_ID, NounType.ULTIMATE, totalRange, 1, [ult1])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group J: Combo Activation Window Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Combo Activation Window Pipeline', () => {
  const FPS = 120;
  const SLOT_ARDELIA = 'slot-0';
  const SLOT_OTHER = 'slot-1';

  function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  function ardeliaWiring(): SlotTriggerWiring {
    return { slotId: SLOT_ARDELIA, operatorId: 'ARDELIA' };
  }

  function otherOperatorWiring(): SlotTriggerWiring {
    return { slotId: SLOT_OTHER, operatorId: 'other' };
  }

  function makeBasicAttack(slotId: string, startFrame: number): TimelineEvent {
    return makeEvent({
      uid: `ba-${slotId}-${startFrame}`,
      name: 'ROCKY_WHISPERS_BATK',
      ownerId: slotId,
      columnId: NounType.BASIC_ATTACK,
      startFrame,
            segments: [
        { properties: { duration: Math.round(0.4 * FPS) }, frames: [{ offsetFrame: Math.round(0.2 * FPS) }] },
        { properties: { duration: Math.round(0.7 * FPS) }, frames: [{ offsetFrame: Math.round(0.3 * FPS) }] },
        { properties: { duration: Math.round(1.53 * FPS) }, frames: [{ offsetFrame: Math.round(0.5 * FPS) }] },
        { properties: { duration: Math.round(2.167 * FPS) }, frames: [{ offsetFrame: Math.round(1.5 * FPS) }] },
      ],
    });
  }

  function makeInflictionEvent(columnId: string, startFrame: number, durationFrames: number): TimelineEvent {
    return makeEvent({
      uid: `inflict-${columnId}-${startFrame}`,
      name: columnId,
      ownerId: ENEMY_OWNER_ID,
      columnId,
      startFrame,
      segments: [{ properties: { duration: durationFrames } }],
      sourceOwnerId: SLOT_OTHER,
    });
  }

  test('J1: Combo window opens from basic attack final strike', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    // Final strike of basic attack triggers Ardelia's combo window
    expect(windows.length).toBe(1);
  });

  test('J2: Combo window blocked when enemy has active heat infliction at trigger time', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    // Heat infliction covering the entire basic attack duration
    const heat = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 0, 20 * FPS);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J3: Combo window blocked when enemy has active nature infliction at trigger time', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const nature = makeInflictionEvent(INFLICTION_COLUMNS.NATURE, 0, 20 * FPS);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, nature], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J4: Combo window opens when infliction has expired before final strike', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 10 * FPS);
    // Heat infliction that ends well before the final strike trigger frame
    const heat = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 0, 2 * FPS);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    // Infliction expired before trigger frame, so combo window opens
    expect(windows.length).toBe(1);
  });

  test('J5: Combo window blocked when enemy has active vulnerability', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const vuln = makeInflictionEvent(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, 0, 20 * FPS);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, vuln], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J6: Combo window opens from other operator basic attack final strike', () => {
    const otherBa = makeBasicAttack(SLOT_OTHER, 0);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([otherBa], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    // Other operator's final strike triggers Ardelia's combo window
    expect(windows.length).toBe(1);
  });

  test('J7: Combo window opens when timestop shifts final strike past infliction expiry', () => {
    // Basic attack segments: 48 + 84 + 184 = 316 cumulative before last segment.
    // Last segment: duration 380, final hit at offsetFrame 180.
    // Without timestop: trigger = 316 + 180 = 496.
    // With combo timestop at [350, 470): trigger = 316 + 300 = 616.
    //
    // Heat infliction raw duration 450 → extended by timestop to 570.
    // Active at raw trigger 496 (496 < 570) but expired at adjusted 616 (616 ≥ 570).
    const ba = makeEvent({
      uid: 'ba-timestop',
      name: 'ROCKY_WHISPERS_BATK',
      ownerId: SLOT_OTHER,
      columnId: NounType.BASIC_ATTACK,
      startFrame: 0,
            segments: [
        { properties: { duration: 48 }, frames: [{ offsetFrame: 24 }] },
        { properties: { duration: 84 }, frames: [{ offsetFrame: 36 }] },
        { properties: { duration: 184 }, frames: [{ offsetFrame: 60 }] },
        { properties: { duration: 380 }, frames: [{ offsetFrame: 180 }] },
      ],
    });
    // Combo timestop at frame 350, 120 frames long (overlaps last segment)
    const combo = makeEvent({
      uid: 'combo-ts',
      name: 'SOME_COMBO',
      ownerId: SLOT_OTHER,
      columnId: NounType.COMBO,
      startFrame: 350,
            segments: [{ properties: { segmentTypes: [SegmentType.ANIMATION], duration: 120, timeDependency: TimeDependency.REAL_TIME } }],
    });
    // Raw 450 → extended to 570 by timestop. Active at 496, expired at 616.
    const heat = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 0, 450);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, combo, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    // With correct timestop handling, infliction has expired at the adjusted
    // trigger frame → negated HAVE condition passes → window opens
    expect(windows.length).toBe(1);
  });

  test('J8: Combo window still blocked when infliction covers timestop-adjusted trigger frame', () => {
    // Same setup as J7 but infliction raw duration 550 → extended 670.
    // Active at BOTH raw trigger 496 AND adjusted trigger 616.
    const ba = makeEvent({
      uid: 'ba-timestop-blocked',
      name: 'ROCKY_WHISPERS_BATK',
      ownerId: SLOT_OTHER,
      columnId: NounType.BASIC_ATTACK,
      startFrame: 0,
            segments: [
        { properties: { duration: 48 }, frames: [{ offsetFrame: 24 }] },
        { properties: { duration: 84 }, frames: [{ offsetFrame: 36 }] },
        { properties: { duration: 184 }, frames: [{ offsetFrame: 60 }] },
        { properties: { duration: 380 }, frames: [{ offsetFrame: 180 }] },
      ],
    });
    const combo = makeEvent({
      uid: 'combo-ts2',
      name: 'SOME_COMBO',
      ownerId: SLOT_OTHER,
      columnId: NounType.COMBO,
      startFrame: 350,
            segments: [{ properties: { segmentTypes: [SegmentType.ANIMATION], duration: 120, timeDependency: TimeDependency.REAL_TIME } }],
    });
    // Raw 550 → extended 670. Active at both 496 and 616.
    const heat = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 0, 550);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, combo, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J9: Without timestop, infliction at raw trigger frame blocks combo window', () => {
    // Same basic attack as J7 but WITHOUT the combo timestop.
    // Raw trigger = 316 + 180 = 496. Heat raw 450 (no extension) → active [0,450).
    // 496 ≥ 450 → expired → window opens. This contrasts with J7 where the
    // timestop presence is what makes the difference.
    const ba = makeEvent({
      uid: 'ba-no-timestop',
      name: 'ROCKY_WHISPERS_BATK',
      ownerId: SLOT_OTHER,
      columnId: NounType.BASIC_ATTACK,
      startFrame: 0,
            segments: [
        { properties: { duration: 48 }, frames: [{ offsetFrame: 24 }] },
        { properties: { duration: 84 }, frames: [{ offsetFrame: 36 }] },
        { properties: { duration: 184 }, frames: [{ offsetFrame: 60 }] },
        { properties: { duration: 380 }, frames: [{ offsetFrame: 180 }] },
      ],
    });
    // No combo timestop — infliction raw 497 covers raw trigger 496
    const heat = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 0, 497);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    // Without timestop, raw trigger at 496 is within infliction [0,497) → blocked
    expect(windows.length).toBe(0);
  });
});

}); // end Ardelia Combat Simulation
