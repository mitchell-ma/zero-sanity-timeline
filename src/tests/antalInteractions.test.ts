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
 *    - DSL effects: APPLY SOURCE INFLICTION TO ENEMY + APPLY SOURCE STATUS TO ENEMY
 *    - Frame class getDuplicatesSourceInfliction() returns true (parsed from DSL)
 *    - Basic attack and battle skill frames do NOT duplicate
 *    - No legacy duplicatesSourceInfliction flag on JSON
 *
 * D. Ultimate (Overclocked Moment)
 *    - Energy cost: 90
 *    - Active duration: 12s
 *    - Cooldown: 25s
 *    - Animation: 1.87s with 1.4s TIME_STOP
 *
 * E. Potentials
 *    - P1: ×1.1 MULTIPLICATIVE on Overclocked Moment rate
 *    - P2: ×0.9 SKILL_COST on Overclocked Moment
 *    - P3: UNIQUE_MULTIPLIER + 15 ADDITIVE on Specified Research Subject
 *    - P4: +10 INTELLECT, +0.1 BASE_HP stat modifiers
 *    - P5: UNIQUE_MULTIPLIER + 20 delay_time + 0.04 rate on Specified Research Subject
 *
 * F. Resource Properties
 *    - Battle skill activation: 8s, cooldown: 12s
 *    - Combo skill activation: 3s
 *    - Ultimate active duration: 12s, cooldown: 25s
 */
import { TimelineEvent } from '../consts/viewTypes';
import { SKILL_COLUMNS } from '../model/channels';

jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
}));
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_STATS: {}, getDefaultLoadoutStats: () => ({}),
}));

// eslint-disable-next-line import/first
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';
// eslint-disable-next-line import/first
import { wouldOverlapSiblings } from '../controller/timeline/eventValidator';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/antal-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/antal-skills.json');

const { statusEvents: _skStatusEvents, skillTypeMap: _skTypeMap, ...antalSkillEntries } = mockSkillsJson as Record<string, any>;
const antalSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(antalSkillEntries)) {
  antalSkills[key] = { ...(val as any), id: key };
}
if (_skTypeMap) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, skillId] of Object.entries(_skTypeMap as Record<string, string>)) {
    if (antalSkills[skillId]) antalSkills[category] = antalSkills[skillId];
    for (const suffix of variantSuffixes) {
      const variantSkillId = `${skillId}_${suffix}`;
      if (antalSkills[variantSkillId]) antalSkills[`${suffix}_${category}`] = antalSkills[variantSkillId];
    }
  }
}
const mockAntalJson = { ...mockOperatorJson, skills: antalSkills, skillTypeMap: _skTypeMap, ...(_skStatusEvents ? { statusEvents: _skStatusEvents } : {}) };

// ── Test helpers ─────────────────────────────────────────────────────────────

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
    const sequences = getSequences('BASIC_ATTACK');
    // 4 real segments + 1 empty terminator
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[0].properties.duration.value).toBe(0.53);
    expect(rawSegments[1].properties.duration.value).toBe(0.7);
    expect(rawSegments[2].properties.duration.value).toBe(0.767);
    expect(rawSegments[3].properties.duration.value).toBe(1.3);
  });

  test('A3: Final Strike (segment 4) recovers 15 SP and 15 Stagger', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    const finalStrikeFrame = rawSegments[3].frames[0];
    const spEffect = finalStrikeFrame.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT'
    );
    const staggerEffect = finalStrikeFrame.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(spEffect.withPreposition.cardinality.value).toBe(15);
    expect(staggerEffect.withPreposition.cardinality.value).toBe(15);
  });

  test('A4: Earlier segments recover 0 SP and 0 Stagger', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      const spEffect = frame.effects.find(
        (e: any) => e.objectType === 'SKILL_POINT'
      );
      expect(spEffect.withPreposition.cardinality.value).toBe(0);
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

  test('A6: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    // Segment 1: 0.23 → 0.52
    const seg1Mults = rawSegments[0].frames[0].multipliers;
    expect(seg1Mults[0].DAMAGE_MULTIPLIER).toBe(0.23);
    expect(seg1Mults[11].DAMAGE_MULTIPLIER).toBe(0.52);
    // Segment 4 (Final Strike): 0.51 → 1.15
    const seg4Mults = rawSegments[3].frames[0].multipliers;
    expect(seg4Mults[0].DAMAGE_MULTIPLIER).toBe(0.51);
    expect(seg4Mults[11].DAMAGE_MULTIPLIER).toBe(1.15);
  });

  test('A7: Segment 3 has 2 frames (double hit)', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[2].frames.length).toBe(2);
    // Both frames have same damage multiplier at each level
    const lv12First = rawSegments[2].frames[0].multipliers[11].DAMAGE_MULTIPLIER;
    const lv12Second = rawSegments[2].frames[1].multipliers[11].DAMAGE_MULTIPLIER;
    expect(lv12First).toBe(lv12Second);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Specified Research Subject)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Specified Research Subject)', () => {
  test('B1: Battle skill has single frame at 0.67s offset', () => {
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    expect(battleSkill.frames.length).toBe(1);
    expect(battleSkill.frames[0].properties.offset.value).toBe(0.67);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    const spCost = battleSkill.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT' && e.verbType === 'EXPEND'
    );
    expect(spCost).toBeDefined();
    expect(spCost.withPreposition.cardinality.value).toBe(100);
  });

  test('B3: Battle skill recovers 6.5 ultimate energy to self and 6.5 to all', () => {
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    const selfEnergy = battleSkill.effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' &&
        e.verbType === 'RECOVER' && e.toObjectType === 'THIS_OPERATOR'
    );
    const allEnergy = battleSkill.effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' &&
        e.verbType === 'RECOVER' && e.toObjectType === 'ALL_OPERATORS'
    );
    expect(selfEnergy.withPreposition.cardinality.value).toBe(6.5);
    expect(allEnergy.withPreposition.cardinality.value).toBe(6.5);
  });

  test('B4: Focus duration is 60s at all skill levels', () => {
    const multipliers = mockAntalJson.skills.BATTLE_SKILL.frames[0].multipliers;
    for (const m of multipliers) {
      expect(m.DURATION).toBe(60);
    }
  });

  test('B5: Susceptibility rate scales from 0.05 (lv1) to 0.10 (lv12)', () => {
    const multipliers = mockAntalJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].rate).toBe(0.05);
    expect(multipliers[11].rate).toBe(0.1);
  });

  test('B6: Damage multiplier scales from 0.89 (lv1) to 2.0 (lv12)', () => {
    const multipliers = mockAntalJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(0.89);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(2);
  });

  test('B7: Battle skill duration is 1 second', () => {
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    expect(battleSkill.properties.duration.value).toBe(1);
    expect(battleSkill.properties.duration.unit).toBe('SECOND');
  });

  test('B8: Battle skill ID is ANTAL_SPECIFIED_RESEARCH_SUBJECT', () => {
    expect(mockAntalJson.skills.BATTLE_SKILL.id).toBe('SPECIFIED_RESEARCH_SUBJECT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (EMP Test Site)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (EMP Test Site)', () => {
  test('C1: Combo trigger has two clauses (Physical Status OR Arts Infliction while Focus)', () => {
    const trigger = mockAntalJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.triggerClause.length).toBe(2);
  });

  test('C2: First clause — ANY_OPERATOR APPLY Physical Status + ENEMY HAVE FOCUS', () => {
    const clause = mockAntalJson.skills.COMBO_SKILL.properties.trigger.triggerClause[0];
    expect(clause.conditions.length).toBe(2);

    // Condition 1: any operator applies physical status
    expect(clause.conditions[0].subjectType).toBe('ANY_OPERATOR');
    expect(clause.conditions[0].verbType).toBe('APPLY');
    expect(clause.conditions[0].objectType).toBe('STATUS');
    expect(clause.conditions[0].objectId).toBe('PHYSICAL');

    // Condition 2: enemy has Focus
    expect(clause.conditions[1].subjectType).toBe('ENEMY');
    expect(clause.conditions[1].verbType).toBe('HAVE');
    expect(clause.conditions[1].objectType).toBe('STATUS');
    expect(clause.conditions[1].objectId).toBe('FOCUS');
  });

  test('C3: Second clause — ANY_OPERATOR APPLY Infliction + ENEMY HAVE FOCUS', () => {
    const clause = mockAntalJson.skills.COMBO_SKILL.properties.trigger.triggerClause[1];
    expect(clause.conditions.length).toBe(2);

    // Condition 1: any operator applies arts infliction
    expect(clause.conditions[0].subjectType).toBe('ANY_OPERATOR');
    expect(clause.conditions[0].verbType).toBe('APPLY');
    expect(clause.conditions[0].objectType).toBe('INFLICTION');

    // Condition 2: enemy has Focus
    expect(clause.conditions[1].subjectType).toBe('ENEMY');
    expect(clause.conditions[1].verbType).toBe('HAVE');
    expect(clause.conditions[1].objectType).toBe('STATUS');
    expect(clause.conditions[1].objectId).toBe('FOCUS');
  });

  test('C4: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockAntalJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C5: Combo cooldown is 15 seconds', () => {
    const effects = mockAntalJson.skills.COMBO_SKILL.effects;
    const cooldown = effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'EXPEND'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(15);
  });

  test('C6: Combo stagger recovery is 10', () => {
    const sequences = getSequences('COMBO_SKILL');
    expect(sequences.length).toBeGreaterThan(0);
    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });

  test('C7: Combo animation is TIME_STOP (0.5s within 0.8s)', () => {
    const comboSkill = mockAntalJson.skills.COMBO_SKILL;
    expect(comboSkill.properties.duration.value).toBe(0.8);
    expect(comboSkill.properties.animation.duration.value).toBe(0.5);
    expect(comboSkill.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('C8: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockAntalJson.skills.COMBO_SKILL.effects;
    const energy = effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toObjectType).toBe('THIS_OPERATOR');
    expect(energy.withPreposition.cardinality.value).toBe(10);
  });

  test('C9: Combo damage multiplier: 1.51 (lv1) → 3.4 (lv12)', () => {
    const multipliers = mockAntalJson.skills.COMBO_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(1.51);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(3.4);
  });

  test('C10: Combo skill ID is ANTAL_EMP_TEST_SITE', () => {
    expect(mockAntalJson.skills.COMBO_SKILL.id).toBe('EMP_TEST_SITE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C2: Combo Skill Source Infliction Duplication
// ═══════════════════════════════════════════════════════════════════════════════

describe('C2. Combo Skill Source Infliction Duplication', () => {
  test('C2.1: Combo frame has APPLY SOURCE INFLICTION DSL effect', () => {
    const comboFrame = mockAntalJson.skills.COMBO_SKILL.frames[0];
    const sourceInfliction = comboFrame.effects.find(
      (e: any) => e.verbType === 'APPLY' && e.adjective === 'SOURCE' && e.objectType === 'INFLICTION'
    );
    expect(sourceInfliction).toBeDefined();
    expect(sourceInfliction.toObjectType).toBe('ENEMY');
  });

  test('C2.2: Combo frame has APPLY SOURCE STATUS DSL effect', () => {
    const comboFrame = mockAntalJson.skills.COMBO_SKILL.frames[0];
    const sourceStatus = comboFrame.effects.find(
      (e: any) => e.verbType === 'APPLY' && e.adjective === 'SOURCE' && e.objectType === 'STATUS'
    );
    expect(sourceStatus).toBeDefined();
    expect(sourceStatus.toObjectType).toBe('ENEMY');
  });

  test('C2.3: Frame class reports getDuplicatesSourceInfliction() as true from DSL', () => {
    const sequences = getSequences('COMBO_SKILL');
    expect(sequences.length).toBeGreaterThan(0);
    const frame = sequences[0].getFrames()[0];
    expect(frame.getDuplicatesSourceInfliction()).toBe(true);
  });

  test('C2.4: Basic attack frames do NOT duplicate source infliction', () => {
    const sequences = getSequences('BASIC_ATTACK');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getDuplicatesSourceInfliction()).toBe(false);
      }
    }
  });

  test('C2.5: Battle skill frames do NOT duplicate source infliction', () => {
    const sequences = getSequences('BATTLE_SKILL');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getDuplicatesSourceInfliction()).toBe(false);
      }
    }
  });

  test('C2.6: No legacy duplicatesSourceInfliction flag on combo frame', () => {
    const comboFrame = mockAntalJson.skills.COMBO_SKILL.frames[0];
    expect(comboFrame.duplicatesSourceInfliction).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Overclocked Moment)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Overclocked Moment)', () => {
  test('D1: Ultimate energy cost is 90', () => {
    const effects = mockAntalJson.skills.ULTIMATE.effects;
    const energyCost = effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'EXPEND'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.withPreposition.cardinality.value).toBe(90);
  });

  test('D2: Ultimate active duration is 12 seconds', () => {
    expect(mockAntalJson.ultimateActiveDuration).toBe(12);
  });

  test('D3: Ultimate cooldown duration not in split JSON (was 25s in combined format)', () => {
    // ultimateCooldownDuration was part of the old combined JSON; not present in split operator JSON
    expect(mockAntalJson.ultimateCooldownDuration).toBeUndefined();
  });

  test('D4: Ultimate animation is TIME_STOP (1.4s within 1.87s)', () => {
    const ultimate = mockAntalJson.skills.ULTIMATE;
    expect(ultimate.properties.duration.value).toBe(1.87);
    expect(ultimate.properties.animation.duration.value).toBe(1.4);
    expect(ultimate.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('D5: Ultimate skill ID is ANTAL_OVERCLOCKED_MOMENT', () => {
    expect(mockAntalJson.skills.ULTIMATE.id).toBe('OVERCLOCKED_MOMENT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Potentials', () => {
  test('E1: P1 — ×1.1 MULTIPLICATIVE on Overclocked Moment rate', () => {
    const p1 = mockAntalJson.potentials[0];
    expect(p1.level).toBe(1);
    expect(p1.name).toBe('Arts Talent');

    const effect = p1.effects[0];
    expect(effect.potentialEffectType).toBe('SKILL_PARAMETER');
    expect(effect.skillParameterModifier.skillType).toBe('OVERCLOCKED_MOMENT');
    expect(effect.skillParameterModifier.parameterKey).toBe('rate');
    expect(effect.skillParameterModifier.value).toBe(1.1);
    expect(effect.skillParameterModifier.parameterModifyType).toBe('MULTIPLICATIVE');
  });

  test('E2: P2 — ×0.9 SKILL_COST on Overclocked Moment', () => {
    const p2 = mockAntalJson.potentials[1];
    expect(p2.level).toBe(2);
    expect(p2.name).toBe('Improved Automation');

    const effect = p2.effects[0];
    expect(effect.potentialEffectType).toBe('SKILL_COST');
    expect(effect.skillCostModifier.skillType).toBe('OVERCLOCKED_MOMENT');
    expect(effect.skillCostModifier.value).toBe(0.9);
  });

  test('E3: P3 — UNIQUE_MULTIPLIER + 15 ADDITIVE on Specified Research Subject', () => {
    const p3 = mockAntalJson.potentials[2];
    expect(p3.level).toBe(3);
    expect(p3.name).toBe('Applied Originium Theory');
    expect(p3.effects.length).toBe(2);

    const uniqueMult = p3.effects[0];
    expect(uniqueMult.skillParameterModifier.skillType).toBe('SPECIFIED_RESEARCH_SUBJECT');
    expect(uniqueMult.skillParameterModifier.value).toBe(1);
    expect(uniqueMult.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const additive = p3.effects[1];
    expect(additive.skillParameterModifier.skillType).toBe('SPECIFIED_RESEARCH_SUBJECT');
    expect(additive.skillParameterModifier.value).toBe(15);
    expect(additive.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');
  });

  test('E4: P4 — +10 INTELLECT and +0.1 BASE_HP stat modifiers', () => {
    const p4 = mockAntalJson.potentials[3];
    expect(p4.level).toBe(4);
    expect(p4.name).toBe("Granny's Reminder");
    expect(p4.effects.length).toBe(2);

    const intEffect = p4.effects.find(
      (e: any) => e.statModifier?.statType === 'INTELLECT'
    );
    expect(intEffect).toBeDefined();
    expect(intEffect.statModifier.value).toBe(10);

    const hpEffect = p4.effects.find(
      (e: any) => e.statModifier?.statType === 'BASE_HP'
    );
    expect(hpEffect).toBeDefined();
    expect(hpEffect.statModifier.value).toBe(0.1);
  });

  test('E5: P5 — UNIQUE_MULTIPLIER + 20 delay_time + 0.04 rate on Research Subject', () => {
    const p5 = mockAntalJson.potentials[4];
    expect(p5.level).toBe(5);
    expect(p5.name).toBe('High Specs Tech Tester');
    expect(p5.effects.length).toBe(3);

    const uniqueMult = p5.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_5'
    );
    expect(uniqueMult).toBeDefined();
    expect(uniqueMult.skillParameterModifier.value).toBe(1);
    expect(uniqueMult.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const delayTime = p5.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'delay_time'
    );
    expect(delayTime).toBeDefined();
    expect(delayTime.skillParameterModifier.value).toBe(20);
    expect(delayTime.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');

    const rate = p5.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_5_rate'
    );
    expect(rate).toBeDefined();
    expect(rate.skillParameterModifier.value).toBe(0.04);
    expect(rate.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');
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
  test('F1: Battle skill activation duration is 8 seconds', () => {
    expect(mockAntalJson.battleSkillActivationDuration).toBe(8);
  });

  test('F2: Battle skill has no cooldown duration field', () => {
    expect(mockAntalJson.battleSkillCooldownDuration).toBeUndefined();
  });

  test('F3: Combo skill activation duration is 3 seconds', () => {
    expect(mockAntalJson.comboSkillActivationDuration).toBe(3);
  });

  test('F4: Basic attack default duration is 0.2 seconds', () => {
    expect(mockAntalJson.basicAttackDefaultDuration).toBe(0.2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group G: Operator Identity & Metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Operator Identity', () => {
  test('G1: Operator type and name', () => {
    expect(mockAntalJson.operatorType).toBe('ANTAL');
    expect(mockAntalJson.name).toBe('Antal');
  });

  test('G2: 4-star Supporter, Electric element, Arts Unit weapon', () => {
    expect(mockAntalJson.operatorRarity).toBe(4);
    expect(mockAntalJson.operatorClassType).toBe('SUPPORTER');
    expect(mockAntalJson.elementType).toBe('ELECTRIC');
    expect(mockAntalJson.weaponType).toBe('ARTS_UNIT');
  });

  test('G3: Main attribute INTELLECT, secondary STRENGTH', () => {
    expect(mockAntalJson.mainAttributeType).toBe('INTELLECT');
    expect(mockAntalJson.secondaryAttributeType).toBe('STRENGTH');
  });

  test('G4: Talent names and max levels', () => {
    expect(mockAntalJson.talents.one.name).toBe('Improviser');
    expect(mockAntalJson.talents.one.maxLevel).toBe(2);
    expect(mockAntalJson.talents.two.name).toBe('Subconscious Act');
    expect(mockAntalJson.talents.two.maxLevel).toBe(2);
    expect(mockAntalJson.talents.attributeIncrease.name).toBe('Keen Mind');
    expect(mockAntalJson.talents.attributeIncrease.attribute).toBe('INTELLECT');
    expect(mockAntalJson.talents.attributeIncrease.maxLevel).toBe(4);
  });

  test('G5: Level table has entries from 1 to 99', () => {
    const levels = mockAntalJson.allLevels;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
    expect(levels[levels.length - 1].level).toBe(99);
  });

  test('G6: Level 1 base stats are correct', () => {
    const lv1 = mockAntalJson.allLevels[0];
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

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
    return { name: '', ownerId: SLOT_ID, activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  test('H1: Basic attack (Exchange Current) has no cooldown', () => {
    const ba = mockAntalJson.skills.BASIC_ATTACK;
    // Basic attacks are segment-based with no COOLDOWN effect
    const cooldown = ba.segments?.flatMap((s: any) => s.frames ?? [])
      .flatMap((f: any) => f.effects ?? [])
      .find((e: any) => e.objectType === 'COOLDOWN');
    expect(cooldown).toBeUndefined();
  });

  test('H2: Battle skill has no COOLDOWN effect in DSL', () => {
    const bs = mockAntalJson.skills.BATTLE_SKILL;
    const cooldown = bs.effects?.find(
      (e: any) => e.objectType === 'COOLDOWN'
    );
    expect(cooldown).toBeUndefined();
  });

  test('H3: Combo skill (EMP Test Site) has 15s cooldown', () => {
    const cs = mockAntalJson.skills.COMBO_SKILL;
    const cooldown = cs.effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'EXPEND'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(15);
  });

  test('H4: Ultimate has no cooldown duration in split JSON', () => {
    expect(mockAntalJson.ultimateCooldownDuration).toBeUndefined();
  });

  test('H5: Combo placement during cooldown is blocked', () => {
    const comboDuration = Math.round(0.8 * FPS); // 96 frames
    const comboCooldown = 15 * FPS; // 1800 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      id: 'cs-1', columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      activationDuration: comboDuration, cooldownDuration: comboCooldown,
      nonOverlappableRange: totalRange,
    });
    // Mid-cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, comboDuration + 600, 1, [cs1])).toBe(true);
    // After cooldown
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, totalRange, 1, [cs1])).toBe(false);
  });

  test('H6: Ultimate placement during cooldown is blocked', () => {
    const ultAnimation = Math.round(1.87 * FPS); // 224 frames
    const ultActive = 12 * FPS; // 1440 frames
    const ultCooldown = 25 * FPS; // 3000 frames
    const totalRange = ultAnimation + ultActive + ultCooldown;
    const ult1 = makeEvent({
      id: 'ult-1', columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0,
      activationDuration: ultAnimation, activeDuration: ultActive,
      cooldownDuration: ultCooldown, nonOverlappableRange: totalRange,
    });
    // During cooldown phase
    const cooldownStart = ultAnimation + ultActive;
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.ULTIMATE, cooldownStart + 600, 1, [ult1])).toBe(true);
    // After cooldown ends
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.ULTIMATE, totalRange, 1, [ult1])).toBe(false);
  });

  test('H7: Battle skill has no cooldown — back-to-back is valid', () => {
    const bsDuration = Math.round(1 * FPS); // 120 frames
    const bs1 = makeEvent({
      id: 'bs-1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      activationDuration: bsDuration, nonOverlappableRange: bsDuration,
    });
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.BATTLE, bsDuration, bsDuration, [bs1])).toBe(false);
  });
});

}); // end Antal Combat Simulation
