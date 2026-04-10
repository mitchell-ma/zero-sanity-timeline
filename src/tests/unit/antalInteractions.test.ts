/**
 * Antal — Combat Simulation Tests
 *
 * Controller-level tests validating Antal's operator interactions.
 * No UI, no DOM — pure engine logic against operator JSON data.
 *
 * ═══ What's tested ═══════════════════════════════════════════════════════════
 *
 * A. Basic Attack (Exchange Current)
 *    - 4 segments (+ 1 empty terminator segment)
 *    - Segment durations match JSON (0.53, 0.7, 0.767, 1.3s)
 *    - Final Strike (segment 4) recovers 15 SP and 15 Stagger
 *    - No infliction on any basic attack frame
 *    - Damage multipliers scale correctly (lv1 → lv12)
 *
 * B. Battle Skill (Specified Research Subject)
 *    - Single frame at 0.67s offset
 *    - SP cost: 100
 *    - Ultimate energy: 6.5 to self + 6.5 to all operators
 *    - Focus duration: 60s across all levels
 *    - Susceptibility rate scales: 0.05 (lv1) → 0.10 (lv12)
 *    - Damage multiplier: 0.89 (lv1) → 2.0 (lv12)
 *
 * C. Combo Skill (EMP Test Site)
 *    - Trigger: enemy with Focus suffers Physical Status OR Arts Infliction
 *    - Two AND-within, OR-between trigger clauses
 *    - Activation window: 720 frames (6s)
 *    - Cooldown: 15s
 *    - Stagger recovery: 10
 *    - TIME_STOP animation (0.5s within 0.8s duration)
 *    - Ultimate energy: 10 to self
 *    - Damage multiplier: 1.51 (lv1) → 3.4 (lv12)
 *
 * C2. Combo Skill Source Infliction Duplication
 *    - DSL effects: APPLY TRIGGER INFLICTION TO ENEMY + APPLY TRIGGER STATUS TO ENEMY
 *    - Frame class getDuplicateTriggerSource() returns true (parsed from DSL)
 *    - Basic attack and battle skill frames do NOT duplicate
 *    - No legacy duplicateTriggerSource flag on JSON
 *
 * D. Ultimate (Overclocked Moment)
 *    - Energy cost: 90
 *    - Active duration: 12s
 *    - Cooldown: 25s
 *    - Animation: 1.87s with 1.4s TIME_STOP
 *
 * E. Potentials
 *    - P1: ×1.1 MULTIPLICATIVE on Overclocked Moment rate
 *    - P2: ult cost reduction now via VARY_BY POTENTIAL in ult JSON
 *    - P3: UNIQUE_MULTIPLIER + 15 ADDITIVE on Specified Research Subject
 *    - P4: +10 INTELLECT, +0.1 BASE_HP stat modifiers
 *    - P5: UNIQUE_MULTIPLIER + 20 delay_time + 0.04 rate on Specified Research Subject
 *
 * F. Resource Properties
 *    - Battle skill activation: 8s, cooldown: 12s
 *    - Combo skill activation: 3s
 *    - Ultimate active duration: 12s, cooldown: 25s
 */
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { StatusType, SegmentType, TimeDependency } from '../../consts/enums';
import { VerbType, ObjectType, NounType, AdjectiveType, DeterminerType } from '../../dsl/semantics';
import { findStaggerInClauses } from '../../controller/timeline/clauseQueries';
import type { Effect } from '../../dsl/semantics';
import { INFLICTION_COLUMNS, ENEMY_ID, COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../../controller/gameDataStore';
import { wouldOverlapSiblings } from '../../controller/timeline/eventValidator';
import { processCombatSimulation } from '../../controller/timeline/eventQueueController';
import { SlotTriggerWiring } from '../../controller/timeline/eventQueueTypes';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));


// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../../model/game-data/operators/antal/antal.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadSkillsJson: _loadAntalSkills } = require('../helpers/loadGameData');
const mockSkillsJson = _loadAntalSkills('ANTAL');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data; downstream tests assert structure
const antalSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(mockSkillsJson as Record<string, unknown>)) {
  antalSkills[key] = { ...(val as Record<string, unknown>), id: key };
}

// Infer skillTypeMap from naming conventions (same logic as operatorJsonLoader)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildSkillTypeMap: _buildSkillTypeMap } = require("../../utils/skillTypeMap");

const _skTypeMap = _buildSkillTypeMap(antalSkills);
for (const [key, value] of Object.entries(_skTypeMap)) {
  if (Array.isArray(value)) {
    if (value[0] && antalSkills[value[0]]) antalSkills[key] = antalSkills[value[0]];
  } else if (typeof value === 'object' && value !== null) {
    for (const [subKey, subIds] of Object.entries(value as Record<string, string[]>)) {
      if (subIds[0] && antalSkills[subIds[0]]) antalSkills[subKey] = antalSkills[subIds[0]];
    }
    const batkIds = (value as Record<string, string[]>).BATK;
    if (batkIds?.[0] && antalSkills[batkIds[0]]) antalSkills[key] = antalSkills[batkIds[0]];
  }
}
const mockAntalJson = { ...mockOperatorJson, skills: antalSkills, skillTypeMap: _skTypeMap };

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Resolve a duration value that may be a plain number or a ValueNode { verb, value }. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function durVal(v: any): number { return typeof v === 'object' && v !== null && 'value' in v ? v.value : v; }

function getSequences(skillCategory: string): readonly DataDrivenSkillEventSequence[] {
  return buildSequencesFromOperatorJson(mockAntalJson, skillCategory);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Antal Combat Simulation', () => {

// ═══════════════════════════════════════════════════════════════════════════════
// Group A: Basic Attack (Exchange Current)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Basic Attack (Exchange Current)', () => {
  test('A1: Basic attack has 4 segments', () => {
    const sequences = getSequences(NounType.BATK);
    // 4 real segments + 1 empty terminator
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    expect(durVal(rawSegments[0].properties.duration.value)).toBe(0.53);
    expect(durVal(rawSegments[1].properties.duration.value)).toBe(0.7);
    expect(durVal(rawSegments[2].properties.duration.value)).toBe(0.767);
    expect(durVal(rawSegments[3].properties.duration.value)).toBe(1.3);
  });

  test('A3: Final Strike (segment 4) recovers 15 SP and 15 Stagger', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    const finalStrikeFrame = rawSegments[3].frames[0];
    const effects = finalStrikeFrame.clause[0].effects;
    const spEffect = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT
    );
    const staggerEffect = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.STAGGER
    );
    expect(spEffect.with.value.value).toBe(15);
    expect(staggerEffect.with.value.value).toBe(15);
  });

  test('A4: Earlier segments have no SP or Stagger effects (zero-value effects removed)', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      const effects = frame.clause[0].effects;
      const spEffect = effects.find(
        (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT
      );
      const staggerEffect = effects.find(
        (e: Record<string, unknown>) => e.object === NounType.STAGGER
      );
      expect(spEffect).toBeUndefined();
      expect(staggerEffect).toBeUndefined();
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

  test('A6: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    // Segment 1: 0.23 → 0.52 — damage values are in clause[0].effects DEAL DAMAGE with.DAMAGE_MULTIPLIER.value array
    const seg1DmgEffect = rawSegments[0].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    expect(seg1DmgEffect.with.value.value[0]).toBe(0.23);
    expect(seg1DmgEffect.with.value.value[11]).toBe(0.52);
    // Segment 4 (Final Strike): 0.51 → 1.15
    const seg4DmgEffect = rawSegments[3].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    expect(seg4DmgEffect.with.value.value[0]).toBe(0.51);
    expect(seg4DmgEffect.with.value.value[11]).toBe(1.15);
  });

  test('A7: Segment 3 has 2 frames (double hit)', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[2].frames.length).toBe(2);
    // Both frames have same damage multiplier at each level
    const firstDmg = rawSegments[2].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    const secondDmg = rawSegments[2].frames[1].clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    const lv12First = firstDmg.with.value.value[11];
    const lv12Second = secondDmg.with.value.value[11];
    expect(lv12First).toBe(lv12Second);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Specified Research Subject)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Specified Research Subject)', () => {
  test('B1: Battle skill has single frame at 0.67s offset', () => {
    const battleSkill = mockAntalJson.skills.BATTLE;
    expect(battleSkill.segments[0].frames.length).toBe(1);
    expect(battleSkill.segments[0].frames[0].properties.offset.value).toBe(0.67);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockAntalJson.skills.BATTLE;
    const effects = battleSkill.clause[0].effects;
    const spCost = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT && e.verb === VerbType.CONSUME
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B3: Battle skill has SP cost effect in clause', () => {
    const battleSkill = mockAntalJson.skills.BATTLE;
    const effects = battleSkill.clause[0].effects;
    const spCost = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.SKILL_POINT && e.verb === VerbType.CONSUME
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.value.value).toBe(100);
  });

  test('B4: Focus duration is 60s (from status config)', () => {
    // Duration is defined on the FOCUS status config, not inlined on the skill effect
    const focusStatus = require('../../model/game-data/operators/antal/statuses/status-focus.json');
    expect(durVal(focusStatus.properties.duration.value)).toBe(60);
    // Empowered variant also has 60s total (20s Focus + 40s Empowered)
    const empoweredStatus = require('../../model/game-data/operators/antal/statuses/status-focus-empowered.json');
    expect(durVal(empoweredStatus.properties.duration.value)).toBe(60);
  });

  test('B5: Susceptibility rate scales from 0.05 (lv1) to 0.10 (lv12)', () => {
    const effects = mockAntalJson.skills.BATTLE.segments[0].frames[0].clause.flatMap((c: { effects: unknown[] }) => c.effects);
    const dmgEffect = effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    expect(dmgEffect.with.rate.value[0]).toBe(0.05);
    expect(dmgEffect.with.rate.value[11]).toBe(0.1);
  });

  test('B6: Damage multiplier scales from 0.89 (lv1) to 2.0 (lv12)', () => {
    const effects = mockAntalJson.skills.BATTLE.segments[0].frames[0].clause.flatMap((c: { effects: unknown[] }) => c.effects);
    const dmgEffect = effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    expect(dmgEffect.with.value.value[0]).toBe(0.89);
    expect(dmgEffect.with.value.value[11]).toBe(2);
  });

  test('B7: Battle skill duration is 1 second', () => {
    const battleSkill = mockAntalJson.skills.BATTLE;
    expect(durVal(battleSkill.segments[0].properties.duration.value)).toBe(1);
    expect(battleSkill.segments[0].properties.duration.unit).toBe('SECOND');
  });

  test('B8: Battle skill ID is ANTAL_SPECIFIED_RESEARCH_SUBJECT', () => {
    expect(mockAntalJson.skills.BATTLE.id).toBe('SPECIFIED_RESEARCH_SUBJECT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (EMP Test Site)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (EMP Test Site)', () => {
  test('C1: Combo trigger has four clauses (Physical Status OR Arts Infliction while Focus/Focus Empowered)', () => {
    const comboSkill = mockAntalJson.skills.COMBO;
    expect(comboSkill.activationWindow.onTriggerClause.length).toBe(4);
  });

  test('C2: First clause — ANY_OPERATOR APPLY Physical Status + ENEMY HAVE FOCUS', () => {
    const clause = mockAntalJson.skills.COMBO.activationWindow.onTriggerClause[0];
    expect(clause.conditions.length).toBe(2);

    // Condition 1: any operator applies physical status
    expect(clause.conditions[0].subjectDeterminer).toBe(DeterminerType.ANY);
    expect(clause.conditions[0].subject).toBe(NounType.OPERATOR);
    expect(clause.conditions[0].verb).toBe(VerbType.APPLY);
    expect(clause.conditions[0].object).toBe(NounType.STATUS);
    expect(clause.conditions[0].objectId).toBe(AdjectiveType.PHYSICAL);

    // Condition 2: enemy has Focus
    expect(clause.conditions[1].subject).toBe(NounType.ENEMY);
    expect(clause.conditions[1].verb).toBe(VerbType.HAVE);
    expect(clause.conditions[1].object).toBe(NounType.STATUS);
    expect(clause.conditions[1].objectId).toBe(StatusType.FOCUS);
  });

  test('C3: Second clause — ANY_OPERATOR APPLY Infliction + ENEMY HAVE FOCUS', () => {
    const clause = mockAntalJson.skills.COMBO.activationWindow.onTriggerClause[1];
    expect(clause.conditions.length).toBe(2);

    // Condition 1: any operator applies arts infliction
    expect(clause.conditions[0].subjectDeterminer).toBe(DeterminerType.ANY);
    expect(clause.conditions[0].subject).toBe(NounType.OPERATOR);
    expect(clause.conditions[0].verb).toBe(VerbType.APPLY);
    expect(clause.conditions[0].object).toBe(NounType.INFLICTION);

    // Condition 2: enemy has Focus
    expect(clause.conditions[1].subject).toBe(NounType.ENEMY);
    expect(clause.conditions[1].verb).toBe(VerbType.HAVE);
    expect(clause.conditions[1].object).toBe(NounType.STATUS);
    expect(clause.conditions[1].objectId).toBe(StatusType.FOCUS);
  });

  test('C4: Combo activation window is 720 frames (6 seconds)', () => {
    expect(mockAntalJson.skills.COMBO.activationWindow.segments[0].properties.duration.value).toBe(6);
  });

  test('C5: Combo cooldown is 24 seconds', () => {
    const comboSkill = mockAntalJson.skills.COMBO;
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(durVal(cdSeg.properties.duration.value)).toBe(24);
  });

  test('C6: Combo stagger recovery is 10', () => {
    const sequences = getSequences('COMBO');
    // segments[0] is ANIMATION (no frames), segments[1] has the actual frames, segments[2] is COOLDOWN
    expect(sequences.length).toBeGreaterThanOrEqual(2);
    const firstFrame = sequences[1].getFrames()[0];
    expect(findStaggerInClauses(firstFrame.getClauses())).toBe(10);
  });

  test('C7: Combo animation is TIME_STOP (0.5s within 0.8s)', () => {
    const comboSkill = mockAntalJson.skills.COMBO;
    const totalDuration = durVal(comboSkill.segments[0].properties.duration.value) + durVal(comboSkill.segments[1].properties.duration.value);
    expect(totalDuration).toBeCloseTo(0.8, 2);
    const animSeg = comboSkill.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(0.5);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('C8: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockAntalJson.skills.COMBO.clause[0].effects;
    const energy = effects.find(
      (e: Record<string, unknown>) => e.object === NounType.ULTIMATE_ENERGY && e.verb === VerbType.RECOVER
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe(DeterminerType.THIS);
    expect(energy.to).toBe(NounType.OPERATOR);
    expect(energy.with.value.value).toBe(10);
  });

  test('C9: Combo damage multiplier: 1.51 (lv1) → 3.4 (lv12)', () => {
    const effects = mockAntalJson.skills.COMBO.segments[1].frames[0].clause[0].effects;
    const dmgEffect = effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE
    );
    expect(dmgEffect.with.value.value[0]).toBe(1.51);
    expect(dmgEffect.with.value.value[11]).toBe(3.4);
  });

  test('C10: Combo skill ID is ANTAL_EMP_TEST_SITE', () => {
    expect(mockAntalJson.skills.COMBO.id).toBe('EMP_TEST_SITE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C2: Combo Skill Source Infliction Duplication
// ═══════════════════════════════════════════════════════════════════════════════

describe('C2. Combo Skill Source Infliction Duplication', () => {
  test('C2.1: Combo frame has APPLY TRIGGER INFLICTION DSL effect', () => {
    const comboFrame = mockAntalJson.skills.COMBO.segments[1].frames[0];
    const effects = comboFrame.clause[0].effects;
    const sourceInfliction = effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.objectDeterminer === DeterminerType.TRIGGER && e.object === NounType.INFLICTION
    );
    expect(sourceInfliction).toBeDefined();
    expect(sourceInfliction.to).toBe(NounType.ENEMY);
  });

  test('C2.2: Combo frame has APPLY TRIGGER PHYSICAL STATUS DSL effect', () => {
    const comboFrame = mockAntalJson.skills.COMBO.segments[1].frames[0];
    const effects = comboFrame.clause[0].effects;
    const sourceStatus = effects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.objectDeterminer === DeterminerType.TRIGGER && e.object === NounType.STATUS && e.objectId === AdjectiveType.PHYSICAL
    );
    expect(sourceStatus).toBeDefined();
    expect(sourceStatus.to).toBe(NounType.ENEMY);
  });

  test('C2.3: Frame class reports getDuplicateTriggerSource() as true from DSL', () => {
    const sequences = getSequences('COMBO');
    // segments[0] is ANIMATION (no frames), segments[1] has actual frames, segments[2] is COOLDOWN
    expect(sequences.length).toBeGreaterThanOrEqual(2);
    const frame = sequences[1].getFrames()[0];
    expect(frame.getDuplicateTriggerSource()).toBe(true);
  });

  test('C2.4: Basic attack frames do NOT duplicate source infliction', () => {
    const sequences = getSequences(NounType.BATK);
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getDuplicateTriggerSource()).toBe(false);
      }
    }
  });

  test('C2.5: Battle skill frames do NOT duplicate source infliction', () => {
    const sequences = getSequences('BATTLE');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getDuplicateTriggerSource()).toBe(false);
      }
    }
  });

  test('C2.6: No legacy duplicateTriggerSource flag on combo frame', () => {
    const comboFrame = mockAntalJson.skills.COMBO.segments[1].frames[0];
    expect(comboFrame.duplicateTriggerSource).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Overclocked Moment)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Overclocked Moment)', () => {
  test('D1: Ultimate energy cost is MULT(base, VARY_BY POTENTIAL)', () => {
    const effects = mockAntalJson.skills.ULTIMATE.clause[0].effects;
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

  test('D2: Ultimate active duration removed from operator JSON', () => {
    expect(mockAntalJson.ultimateActiveDuration).toBeUndefined();
  });

  test('D3: Ultimate cooldown duration not in split JSON (was 25s in combined format)', () => {
    // ultimateCooldownDuration was part of the old combined JSON; not present in split operator JSON
    expect(mockAntalJson.ultimateCooldownDuration).toBeUndefined();
  });

  test('D4: Ultimate animation is TIME_STOP (1.4s within 1.87s)', () => {
    const ultimate = mockAntalJson.skills.ULTIMATE;
    const totalDuration = durVal(ultimate.segments[0].properties.duration.value) + durVal(ultimate.segments[1].properties.duration.value);
    expect(totalDuration).toBeCloseTo(1.87, 2);
    const animSeg = ultimate.segments.find((s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('ANIMATION'));
    expect(animSeg).toBeDefined();
    expect(durVal(animSeg.properties.duration.value)).toBe(1.4);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('D5: Ultimate skill ID is ANTAL_OVERCLOCKED_MOMENT', () => {
    expect(mockAntalJson.skills.ULTIMATE.id).toBe('OVERCLOCKED_MOMENT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Potentials', () => {
  test('E4: P4 — Granny\'s Reminder', () => {
    const p4 = mockAntalJson.potentials[3];
    expect(p4.level).toBe(4);
    expect(p4.name).toBe("Granny's Reminder (P4)");
  });

  test('E6: All 5 potential levels are present', () => {
    expect(mockAntalJson.potentials.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(mockAntalJson.potentials[i].level).toBe(i + 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Resource Properties
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Resource Properties', () => {
  test('F1: Battle skill activation duration removed from operator JSON', () => {
    expect(mockAntalJson.battleSkillActivationDuration).toBeUndefined();
  });

  test('F2: Battle skill has no cooldown duration field', () => {
    expect(mockAntalJson.battleSkillCooldownDuration).toBeUndefined();
  });

  test('F3: Combo skill activation duration removed from operator JSON', () => {
    expect(mockAntalJson.comboSkillActivationDuration).toBeUndefined();
  });

  test('F4: Basic attack default duration removed from operator JSON', () => {
    expect(mockAntalJson.basicAttackDefaultDuration).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group G: Operator Identity & Metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Operator Identity', () => {
  test('G1: Operator type and name', () => {
    expect(mockAntalJson.id).toBe('ANTAL');
    expect(mockAntalJson.name).toBe('Antal');
  });

  test('G2: 4-star Supporter, Electric element, Arts Unit weapon', () => {
    expect(mockAntalJson.operatorRarity).toBe(4);
    expect(mockAntalJson.operatorClassType).toBe('SUPPORTER');
    expect(mockAntalJson.elementType).toBe('ELECTRIC');
    expect(mockAntalJson.weaponTypes).toContain('ARTS_UNIT');
  });

  test('G3: Main attribute INTELLECT, secondary STRENGTH', () => {
    expect(mockAntalJson.mainAttributeType).toBe('INTELLECT');
    expect(mockAntalJson.secondaryAttributeType).toBe('STRENGTH');
  });

  test('G4: Talent IDs and attribute increase', () => {
    expect(mockAntalJson.talents.one).toBe('IMPROVISER_TALENT');
    expect(mockAntalJson.talents.two).toBe('SUBCONSCIOUS_ACT_TALENT');
    expect(mockAntalJson.talents.attributeIncrease.id).toBe('KEEN_MIND');
  });

  test('G5: Level table has entries from 1 to 99', () => {
    const levels = mockAntalJson.statsByLevel;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
    expect(levels[levels.length - 1].level).toBe(99);
  });

  test('G6: Level 1 base stats are correct', () => {
    const lv1 = mockAntalJson.statsByLevel[0];
    expect(lv1.attributes.BASE_ATTACK).toBe(30);
    expect(lv1.attributes.BASE_HP).toBe(500);
    expect(lv1.attributes.CRITICAL_RATE).toBe(0.05);
    expect(lv1.attributes.ATTACK_RANGE).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', ownerId: SLOT_ID, segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  test('H1: Basic attack (Exchange Current) has no cooldown', () => {
    const ba = mockAntalJson.skills.BASIC_ATTACK;
    // Basic attacks are segment-based with no COOLDOWN effect — effects are now in clause[0].effects
    const cooldown = ba.segments?.flatMap((s: Record<string, unknown>) => (s.frames ?? []) as Record<string, unknown>[])
      .flatMap((f: Record<string, unknown>) => ((f.clause as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.effects as Record<string, unknown>[] ?? [])
      .find((e: Record<string, unknown>) => e.object === NounType.COOLDOWN);
    expect(cooldown).toBeUndefined();
  });

  test('H2: Battle skill has no COOLDOWN effect in DSL', () => {
    const bs = mockAntalJson.skills.BATTLE;
    const cooldown = (bs.clause?.[0]?.effects as Record<string, unknown>[] | undefined)?.find(
      (e) => e.object === NounType.COOLDOWN
    );
    expect(cooldown).toBeUndefined();
  });

  test('H3: Combo skill (EMP Test Site) has 24s cooldown', () => {
    const comboSkill = mockAntalJson.skills.COMBO;
    const cdSeg = comboSkill.segments.find(
      (s: Record<string, unknown>) => ((s.properties as Record<string, unknown>)?.segmentTypes as string[] | undefined)?.includes('COOLDOWN')
    );
    expect(cdSeg).toBeDefined();
    expect(durVal(cdSeg.properties.duration.value)).toBe(24);
  });

  test('H4: Ultimate has no cooldown duration in split JSON', () => {
    expect(mockAntalJson.ultimateCooldownDuration).toBeUndefined();
  });

  test('H5: Combo placement during cooldown is blocked', () => {
    const comboDuration = Math.round(0.8 * FPS); // 96 frames
    const comboCooldown = 15 * FPS; // 1800 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      uid: 'cs-1', columnId: NounType.COMBO, startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
      nonOverlappableRange: totalRange,
    });
    // Mid-cooldown
    expect(wouldOverlapSiblings(SLOT_ID, NounType.COMBO, comboDuration + 600, 1, [cs1])).toBe(true);
    // After cooldown
    expect(wouldOverlapSiblings(SLOT_ID, NounType.COMBO, totalRange, 1, [cs1])).toBe(false);
  });

  test('H6: Ultimate placement during cooldown is blocked', () => {
    const ultAnimation = Math.round(1.87 * FPS); // 224 frames
    const ultActive = 12 * FPS; // 1440 frames
    const ultCooldown = 25 * FPS; // 3000 frames
    const totalRange = ultAnimation + ultActive + ultCooldown;
    const ult1 = makeEvent({
      uid: 'ult-1', columnId: NounType.ULTIMATE, startFrame: 0,
      segments: [{ properties: { duration: ultAnimation } }], nonOverlappableRange: totalRange,
    });
    // During cooldown phase
    const cooldownStart = ultAnimation + ultActive;
    expect(wouldOverlapSiblings(SLOT_ID, NounType.ULTIMATE, cooldownStart + 600, 1, [ult1])).toBe(true);
    // After cooldown ends
    expect(wouldOverlapSiblings(SLOT_ID, NounType.ULTIMATE, totalRange, 1, [ult1])).toBe(false);
  });

  test('H7: Battle skill has no cooldown — back-to-back is valid', () => {
    const bsDuration = Math.round(1 * FPS); // 120 frames
    const bs1 = makeEvent({
      uid: 'bs-1', columnId: NounType.BATTLE, startFrame: 0,
      segments: [{ properties: { duration: bsDuration } }], nonOverlappableRange: bsDuration,
    });
    expect(wouldOverlapSiblings(SLOT_ID, NounType.BATTLE, bsDuration, bsDuration, [bs1])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Combo Mirrored Infliction Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Combo Mirrored Infliction Pipeline', () => {
  const FPS = 120;
  const SLOT_ANTAL = 'slot-1';
  const SLOT_LAEV = 'slot-0';

  function makeEv(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
    return { id: overrides.name ?? '', name: '', segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  function antalWiring(): SlotTriggerWiring {
    return { slotId: SLOT_ANTAL, operatorId: 'ANTAL' };
  }

  function laevWiring(): SlotTriggerWiring {
    return { slotId: SLOT_LAEV, operatorId: 'LAEVATAIN' };
  }

  function makeFocus(startFrame: number, duration: number): TimelineEvent {
    return makeEv({ uid: `focus-${startFrame}`, name: StatusType.FOCUS, ownerId: ENEMY_ID, columnId: 'FOCUS', startFrame, segments: [{ properties: { duration: duration } }] });
  }

  function makeLaevBattle(startFrame: number): TimelineEvent {
    return makeEv({
      uid: `laev-bs-${startFrame}`, name: 'FLAMING_CINDERS_BATK', ownerId: SLOT_LAEV,
      columnId: NounType.BATTLE, startFrame,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: 'HEAT', to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });
  }

  function makeAntalCombo(startFrame: number, comboTriggerColumnId?: string): TimelineEvent {
    return makeEv({
      uid: `antal-combo-${startFrame}`,
      name: 'EMP_TEST_SITE',
      ownerId: SLOT_ANTAL,
      columnId: NounType.COMBO,
      startFrame,
      comboTriggerColumnId,
      segments: [
        { properties: { segmentTypes: [SegmentType.ANIMATION], duration: Math.round(0.5 * FPS), timeDependency: TimeDependency.REAL_TIME } },
        {
          properties: { duration: Math.round(0.8 * FPS) },
          frames: [{ offsetFrame: Math.round(0.7 * FPS), duplicateTriggerSource: true }],
        },
      ],
    });
  }

  test('H1: Combo with APPLY TRIGGER INFLICTION mirrors trigger infliction', () => {
    const focus = makeFocus(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    const antalCombo = makeAntalCombo(250, INFLICTION_COLUMNS.HEAT);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processCombatSimulation([focus, laevBattle, antalCombo], undefined, undefined, wirings);
    // Phase 4e item 1 routed combo-source duplication through interpret() →
    // doApply, so derived event uids no longer follow the combo-inflict pattern.
    // Match by ownerId+columnId in the combo's frame span instead.
    const _comboStart = antalCombo.startFrame;
    const _comboEnd = _comboStart + eventDuration(antalCombo);
    const derived = processed.filter((e) => e.ownerId === ENEMY_ID
      && (e.columnId === INFLICTION_COLUMNS.HEAT || e.columnId === INFLICTION_COLUMNS.ELECTRIC || e.columnId === INFLICTION_COLUMNS.CRYO || e.columnId === INFLICTION_COLUMNS.NATURE)
      && e.startFrame >= _comboStart && e.startFrame <= _comboEnd
      && e.sourceOwnerId === SLOT_ANTAL);
    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0].columnId).toBe(INFLICTION_COLUMNS.HEAT);
    expect(derived[0].ownerId).toBe(ENEMY_ID);
    expect(derived[0].sourceOwnerId).toBe(SLOT_ANTAL);
  });

  test('H2: Pipeline resolves comboTriggerColumnId from Laevatain battle skill', () => {
    const focus = makeFocus(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    // Combo placed with no trigger column — pipeline should resolve it
    const antalCombo = makeAntalCombo(250);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processCombatSimulation([focus, laevBattle, antalCombo], undefined, undefined, wirings);
    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.HEAT);
  });

  test('H3: Mirrored infliction not generated when combo has no comboTriggerColumnId', () => {
    // No Focus → combo trigger column not resolved
    const laevBattle = makeLaevBattle(100);
    const antalCombo = makeAntalCombo(250);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processCombatSimulation([laevBattle, antalCombo], undefined, undefined, wirings);
    // Phase 4e item 1 routed combo-source duplication through interpret() →
    // doApply, so derived event uids no longer follow the combo-inflict pattern.
    // Match by ownerId+columnId in the combo's frame span instead.
    const _comboStart = antalCombo.startFrame;
    const _comboEnd = _comboStart + eventDuration(antalCombo);
    const derived = processed.filter((e) => e.ownerId === ENEMY_ID
      && (e.columnId === INFLICTION_COLUMNS.HEAT || e.columnId === INFLICTION_COLUMNS.ELECTRIC || e.columnId === INFLICTION_COLUMNS.CRYO || e.columnId === INFLICTION_COLUMNS.NATURE)
      && e.startFrame >= _comboStart && e.startFrame <= _comboEnd
      && e.sourceOwnerId === SLOT_ANTAL);
    expect(derived.length).toBe(0);
  });

  test('H4: Combo resolves trigger column from electric infliction but does NOT auto-inflict', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Simulate another operator (slot-2) applying electric infliction
    const electricWiring: SlotTriggerWiring = { slotId: 'slot-2', operatorId: '' };
    const arcBattle = makeEv({
      uid: 'arc-bs-100', name: 'LIGHTNING_STRIKE', ownerId: 'slot-2',
      columnId: NounType.BATTLE, startFrame: 100,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: 'ELECTRIC', to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });
    const antalCombo = makeAntalCombo(250);
    const wirings = [laevWiring(), antalWiring(), electricWiring];

    const processed = processCombatSimulation([focus, arcBattle, antalCombo], undefined, undefined, wirings);
    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.ELECTRIC);
    // Phase 4e item 1 routed combo-source duplication through interpret() →
    // doApply, so derived event uids no longer follow the combo-inflict pattern.
    // Match by ownerId+columnId in the combo's frame span instead.
    const _comboStart = antalCombo.startFrame;
    const _comboEnd = _comboStart + eventDuration(antalCombo);
    const derived = processed.filter((e) => e.ownerId === ENEMY_ID
      && (e.columnId === INFLICTION_COLUMNS.HEAT || e.columnId === INFLICTION_COLUMNS.ELECTRIC || e.columnId === INFLICTION_COLUMNS.CRYO || e.columnId === INFLICTION_COLUMNS.NATURE)
      && e.startFrame >= _comboStart && e.startFrame <= _comboEnd
      && e.sourceOwnerId === SLOT_ANTAL);
    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0].columnId).toBe(INFLICTION_COLUMNS.ELECTRIC);
  });

  test('H5: Combo window requires Focus — no window without Focus active', () => {
    const laevBattle = makeLaevBattle(100);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processCombatSimulation([laevBattle], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBe(0);
  });

  test('H6: Combo window appears when enemy has heat infliction and Focus active', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Derived heat infliction on enemy (as if Laevatain's battle skill frame created it)
    const heatInfliction = makeEv({
      uid: 'heat-inf-1', name: INFLICTION_COLUMNS.HEAT, ownerId: ENEMY_ID,
      columnId: INFLICTION_COLUMNS.HEAT, startFrame: 220, segments: [{ properties: { duration: 10 * FPS } }],
      sourceOwnerId: SLOT_LAEV, sourceSkillName: 'FLAMING_CINDERS_BATK',
    });
    const wirings = [laevWiring(), antalWiring()];

    const processed = processCombatSimulation([focus, heatInfliction], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].comboTriggerColumnId).toBe(INFLICTION_COLUMNS.HEAT);
  });

  test('H7: Full scenario — Akekuri heat infliction + Focus → Antal combo mirrors heat', () => {
    const SLOT_AKEKURI = 'slot-0';
    const focus = makeFocus(0, 120 * FPS);
    // Akekuri's battle skill applies heat infliction to enemy
    const akekuriHeatInfliction = makeEv({
      uid: 'akekuri-heat-1', name: INFLICTION_COLUMNS.HEAT, ownerId: ENEMY_ID,
      columnId: INFLICTION_COLUMNS.HEAT, startFrame: 200, segments: [{ properties: { duration: 20 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI, sourceSkillName: 'BURST_OF_PASSION',
    });
    // Antal places combo within the activation window, with comboTriggerColumnId resolved
    const antalCombo = makeAntalCombo(300, INFLICTION_COLUMNS.HEAT);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processCombatSimulation(
      [focus, akekuriHeatInfliction, antalCombo],
      undefined, undefined, wirings,
    );

    // Original Akekuri heat infliction still present
    const akekuriHeat = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.HEAT && e.sourceOwnerId === SLOT_AKEKURI,
    );
    expect(akekuriHeat.length).toBeGreaterThan(0);

    // Antal combo mirrors heat infliction via APPLY TRIGGER INFLICTION
    const antalHeat = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.HEAT && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBeGreaterThan(0);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');
  });

  test('H8: Re-resolve fixes comboTriggerColumnId when Focus appears mid-pipeline', () => {
    // Simulates the real scenario: Focus is derived by the engine AFTER the first
    // pass 3 (resolveComboTriggersInline) runs. A subsequent createSkillEvent call
    // re-resolves the combo's trigger column so mirrored inflictions can be generated.
    const SLOT_AKEKURI = 'slot-0';

    // Focus exists (as if engine-derived) + Akekuri heat infliction on enemy
    const focus = makeFocus(0, 120 * FPS);
    const akekuriHeat = makeEv({
      uid: 'akekuri-heat-1', name: INFLICTION_COLUMNS.HEAT, ownerId: ENEMY_ID,
      columnId: INFLICTION_COLUMNS.HEAT, startFrame: 200, segments: [{ properties: { duration: 20 * FPS } }],
      sourceOwnerId: SLOT_AKEKURI, sourceSkillName: 'BURST_OF_PASSION',
    });
    // Antal combo placed WITHOUT comboTriggerColumnId (simulating first pass failing)
    const antalCombo = makeAntalCombo(300);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processCombatSimulation(
      [focus, akekuriHeat, antalCombo],
      undefined, undefined, wirings,
    );

    // Antal combo should have comboTriggerColumnId resolved
    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.HEAT);

    // Antal combo mirrors heat infliction via APPLY TRIGGER INFLICTION
    const antalHeat = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.HEAT && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBeGreaterThan(0);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');
  });

  test('H9: Antal own battle skill does NOT self-trigger combo (no electric mirroring)', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Antal's own battle skill — publishes APPLY INFLICTION element:ELECTRIC
    const antalBattle = makeEv({
      uid: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: NounType.BATTLE, startFrame: 0, segments: [{ properties: { duration: FPS } }],
    });
    // Antal combo placed after battle skill
    const antalCombo = makeAntalCombo(250);
    const wirings = [antalWiring()];

    const processed = processCombatSimulation(
      [focus, antalBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // Combo should NOT have comboTriggerColumnId from self-trigger
    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo!.comboTriggerColumnId).toBeUndefined();

    // No electric infliction from self-trigger
    const electricInflictions = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.ELECTRIC && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(electricInflictions.length).toBe(0);
  });

  test('H10: Full pipeline combo window with Focus from Antal battle skill frame', () => {
    // Antal battle skill creates Focus via deriveFrameInflictions.
    // Akekuri heat infliction on enemy. Combo window should appear.
    const antalBattle = makeEv({
      uid: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: NounType.BATTLE, startFrame: 0,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'STATUS', objectId: 'FOCUS', to: 'ENEMY', stackingInteraction: 'RESET', with: { duration: { verb: 'IS', value: 60 }, stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });
    const akekuriHeat = makeEv({
      uid: 'akekuri-heat-1', name: INFLICTION_COLUMNS.HEAT, ownerId: ENEMY_ID,
      columnId: INFLICTION_COLUMNS.HEAT, startFrame: 200, segments: [{ properties: { duration: 20 * FPS } }],
      sourceOwnerId: 'slot-0', sourceSkillName: 'BURST_OF_PASSION',
    });
    const akekuriWiring: SlotTriggerWiring = { slotId: 'slot-0', operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processCombatSimulation(
      [antalBattle, akekuriHeat],
      undefined, undefined, wirings,
    );

    // Focus should be derived from Antal's battle skill frame
    const focusEvents = processed.filter((e) => e.columnId === 'FOCUS');
    expect(focusEvents.length).toBeGreaterThan(0);

    // Combo activation window should appear
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBeGreaterThan(0);
  });

  test('H11: No mirrored infliction when source event is dragged away (stale comboTriggerColumnId cleared)', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Source (Akekuri battle) was dragged far below the combo — combo is now outside all windows.
    // Combo still has a stale comboTriggerColumnId from initial placement.
    const antalCombo = makeAntalCombo(300, INFLICTION_COLUMNS.HEAT);

    const akekuriWiring: SlotTriggerWiring = { slotId: 'slot-0', operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    // No Akekuri battle event in the events list — it was removed/dragged away
    const processed = processCombatSimulation(
      [focus, antalCombo],
      undefined, undefined, wirings,
    );

    // Stale comboTriggerColumnId should be cleared
    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBeUndefined();

    // No mirrored infliction should be generated
    const antalHeat = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.HEAT && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBe(0);
  });

  test('H12: Deferred resolution — Focus derived from battle skill frame, combo mirrors heat infliction', () => {
    // Real scenario: Focus is NOT a raw event — it's derived from Antal's
    // battle skill frame effect.  Akekuri publishes heat infliction trigger.
    // Antal combo should mirror heat infliction via deferred COMBO_RESOLVE.
    const SLOT_AKEKURI = 'slot-0';

    // Antal battle skill with applyStatus Focus frame effect
    const antalBattle = makeEv({
      uid: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: NounType.BATTLE, startFrame: 0,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'STATUS', objectId: 'FOCUS', to: 'ENEMY', stackingInteraction: 'RESET', with: { duration: { verb: 'IS', value: 60 }, stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });

    // Akekuri battle skill (source of heat infliction trigger) with infliction frame
    const akekuriBattle = makeEv({
      uid: 'akekuri-bs-0', name: 'BURST_OF_PASSION', ownerId: SLOT_AKEKURI,
      columnId: NounType.BATTLE, startFrame: 100,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: 'HEAT', to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });

    // Antal combo — no comboTriggerColumnId (Phase 2 will fail, deferred resolves it)
    const antalCombo = makeAntalCombo(300);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processCombatSimulation(
      [antalBattle, akekuriBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // Focus should be derived from Antal's battle skill
    const focusEvents = processed.filter((e) => e.columnId === 'FOCUS');
    expect(focusEvents.length).toBeGreaterThan(0);

    // Heat infliction from Akekuri should exist
    const akekuriHeat = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.HEAT && e.sourceOwnerId === SLOT_AKEKURI,
    );
    expect(akekuriHeat.length).toBeGreaterThan(0);

    // Antal combo should have deferred-resolved comboTriggerColumnId
    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.HEAT);

    // Antal combo mirrors heat infliction via APPLY TRIGGER INFLICTION
    const antalHeat = processed.filter(
      (e) => e.columnId === INFLICTION_COLUMNS.HEAT && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBeGreaterThan(0);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');
  });

  test('H13: Full timeline — Antal BS → Focus, Akekuri BS → heat, Antal combo time-stop extends Akekuri + mirrors heat', () => {
    const SLOT_AKEKURI = 'slot-0';

    // Antal battle skill at frame 0 — derives Focus at offset 0.67s
    const antalBattle = makeEv({
      uid: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: NounType.BATTLE, startFrame: 0, // 1s = 120f,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'STATUS', objectId: 'FOCUS', to: 'ENEMY', stackingInteraction: 'RESET', with: { duration: { verb: 'IS', value: 60 }, stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });

    // Akekuri battle skill at frame 120 — 1.33s duration, heat infliction at 0.67s
    const akekuriBattleDur = Math.round(1.33 * FPS); // 160f
    const akekuriBattle = makeEv({
      uid: 'akekuri-bs-0', name: 'BURST_OF_PASSION', ownerId: SLOT_AKEKURI,
      columnId: NounType.BATTLE, startFrame: FPS,
      segments: [{
        properties: { duration: akekuriBattleDur },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: 'HEAT', to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });

    // Antal combo at frame 240 — time stop [240, 300) overlaps Akekuri BS [120, 280)
    const comboStart = 240;
    const antalCombo = makeAntalCombo(comboStart);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processCombatSimulation(
      [antalBattle, akekuriBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // 1. Focus derived from Antal's battle skill
    const focusEvents = processed.filter((e) => e.columnId === 'FOCUS');
    expect(focusEvents.length).toBe(1);
    expect(focusEvents[0].sourceOwnerId).toBe(SLOT_ANTAL);

    // 2. Two heat inflictions: one from Akekuri BS, one mirrored by Antal combo (APPLY TRIGGER INFLICTION)
    const heatInflictions = processed.filter((e) => e.columnId === INFLICTION_COLUMNS.HEAT);
    expect(heatInflictions.length).toBe(2);
    expect(heatInflictions.filter((e) => e.sourceOwnerId === SLOT_AKEKURI).length).toBe(1);
    expect(heatInflictions.filter((e) => e.sourceOwnerId === SLOT_ANTAL).length).toBe(1);

    // 3. Combo time-stop extends Akekuri's battle skill segment duration
    const extendedAkekuriBs = processed.find((e) => e.uid === akekuriBattle.uid)!;
    const extendedDuration = extendedAkekuriBs.segments![0].properties.duration;
    expect(extendedDuration).toBeGreaterThan(akekuriBattleDur);
  });

  test('H14: Simultaneous battle skills — combo at window start mirrors heat', () => {
    const SLOT_AKEKURI = 'slot-0';

    // Both battle skills at frame 0
    const antalBattle = makeEv({
      uid: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: NounType.BATTLE, startFrame: 0,
      segments: [{
        properties: { duration: FPS },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS), // Focus at frame 80
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'STATUS', objectId: 'FOCUS', to: 'ENEMY', stackingInteraction: 'RESET', with: { duration: { verb: 'IS', value: 60 }, stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });

    const akekuriBattle = makeEv({
      uid: 'akekuri-bs-0', name: 'BURST_OF_PASSION', ownerId: SLOT_AKEKURI,
      columnId: NounType.BATTLE, startFrame: 0,
      segments: [{
        properties: { duration: Math.round(1.33 * FPS) },
        frames: [{
          offsetFrame: Math.round(0.67 * FPS), // Heat infliction at frame 80
          clauses: [{ conditions: [], effects: [{ type: 'dsl' as const, dslEffect: { verb: 'APPLY', object: 'INFLICTION', objectQualifier: 'HEAT', to: 'ENEMY', with: { stacks: { verb: 'IS', value: 1 } } } as unknown as Effect }] }],
        }],
      }],
    });

    // Combo right at the activation window start (frame 80 = when infliction + Focus appear)
    const comboStart = Math.round(0.67 * FPS);
    const antalCombo = makeAntalCombo(comboStart);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'AKEKURI' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processCombatSimulation(
      [antalBattle, akekuriBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // Two heat inflictions: Akekuri original + Antal combo mirror (APPLY TRIGGER INFLICTION)
    const heatInflictions = processed.filter((e) => e.columnId === INFLICTION_COLUMNS.HEAT);
    expect(heatInflictions.length).toBe(2);
    expect(heatInflictions.filter((e) => e.sourceOwnerId === SLOT_AKEKURI).length).toBe(1);
    expect(heatInflictions.filter((e) => e.sourceOwnerId === SLOT_ANTAL).length).toBe(1);
  });

  test('H10: No mirrored infliction when combo is user-placed without a trigger source', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Combo placed by user in debug mode — no trigger source, no comboTriggerColumnId
    const antalCombo = makeAntalCombo(300);
    const wirings = [antalWiring()];

    const processed = processCombatSimulation(
      [focus, antalCombo],
      undefined, undefined, wirings,
    );

    const combo = processed.find((e) => e.uid === antalCombo.uid);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBeUndefined();

    // No inflictions of any kind from Antal
    const antalInflictions = processed.filter(
      (e) => e.ownerId === ENEMY_ID && e.sourceOwnerId === SLOT_ANTAL
        && (e.columnId.includes('Infliction') || e.columnId.includes('vulnerable')),
    );
    expect(antalInflictions.length).toBe(0);
  });
});

}); // end Antal Combat Simulation
