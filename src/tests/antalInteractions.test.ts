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
import { StatusType } from '../consts/enums';
import { SKILL_COLUMNS, ENEMY_OWNER_ID } from '../model/channels';

jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
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
  getComboTriggerInfo: (id: string) => {
    const map: Record<string, { file: string; skillId: string }> = {
      antal: { file: '../model/game-data/operator-skills/antal-skills.json', skillId: 'EMP_TEST_SITE' },
      laevatain: { file: '../model/game-data/operator-skills/laevatain-skills.json', skillId: 'SEETHE' },
      akekuri: { file: '../model/game-data/operator-skills/akekuri-skills.json', skillId: 'FLASH_AND_DASH' },
    };
    const entry = map[id];
    if (!entry) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trigger = require(entry.file)[entry.skillId]?.properties?.trigger;
    if (!trigger?.onTriggerClause?.length) return undefined;
    return { onTriggerClause: trigger.onTriggerClause, description: trigger.description ?? '', windowFrames: trigger.windowFrames ?? 720 };
  },
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
}));
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';
// eslint-disable-next-line import/first
import { wouldOverlapSiblings } from '../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { processInflictionEvents, SlotTriggerWiring } from '../controller/timeline/processInteractions';
// eslint-disable-next-line import/first
import { COMBO_WINDOW_COLUMN_ID } from '../controller/timeline/processComboSkill';
// eslint-disable-next-line import/first

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/antal-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/antal-skills.json');

const { statusEvents: _skStatusEvents, skillTypeMap: _skTypeMap, ...antalSkillEntries } = mockSkillsJson as Record<string, any>;
const antalSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(antalSkillEntries)) {
  antalSkills[key] = { ...(val as Record<string, any>), id: key };
}
if (_skTypeMap) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, value] of Object.entries(_skTypeMap as Record<string, any>)) {
    if (typeof value === 'string') {
      if (antalSkills[value]) antalSkills[category] = antalSkills[value];
      for (const suffix of variantSuffixes) {
        const variantSkillId = `${value}_${suffix}`;
        if (antalSkills[variantSkillId]) antalSkills[`${suffix}_${category}`] = antalSkills[variantSkillId];
      }
    } else if (typeof value === 'object' && value !== null) {
      // Object form: { BATK: "...", FINISHER: "...", DIVE: "..." }
      const batkId = (value as any).BATK;
      if (batkId && antalSkills[batkId]) antalSkills[category] = antalSkills[batkId];
      for (const [subKey, subId] of Object.entries(value as Record<string, string>)) {
        if (antalSkills[subId]) antalSkills[subKey] = antalSkills[subId];
      }
      if (batkId) {
        for (const suffix of variantSuffixes) {
          const variantSkillId = `${batkId}_${suffix}`;
          if (antalSkills[variantSkillId]) antalSkills[`${suffix}_${category}`] = antalSkills[variantSkillId];
        }
      }
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
    const effects = finalStrikeFrame.clause[0].effects;
    const spEffect = effects.find(
      (e: Record<string, any>) => e.object === 'SKILL_POINT'
    );
    const staggerEffect = effects.find(
      (e: Record<string, any>) => e.object === 'STAGGER'
    );
    expect(spEffect.with.cardinality.value).toBe(15);
    expect(staggerEffect.with.value.value).toBe(15);
  });

  test('A4: Earlier segments have no SP or Stagger effects (zero-value effects removed)', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      const effects = frame.clause[0].effects;
      const spEffect = effects.find(
        (e: Record<string, any>) => e.object === 'SKILL_POINT'
      );
      const staggerEffect = effects.find(
        (e: Record<string, any>) => e.object === 'STAGGER'
      );
      expect(spEffect).toBeUndefined();
      expect(staggerEffect).toBeUndefined();
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
    // Segment 1: 0.23 → 0.52 — damage values are in clause[0].effects DEAL DAMAGE with.value.value array
    const seg1DmgEffect = rawSegments[0].frames[0].clause[0].effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
    );
    expect(seg1DmgEffect.with.value.value[0]).toBe(0.23);
    expect(seg1DmgEffect.with.value.value[11]).toBe(0.52);
    // Segment 4 (Final Strike): 0.51 → 1.15
    const seg4DmgEffect = rawSegments[3].frames[0].clause[0].effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
    );
    expect(seg4DmgEffect.with.value.value[0]).toBe(0.51);
    expect(seg4DmgEffect.with.value.value[11]).toBe(1.15);
  });

  test('A7: Segment 3 has 2 frames (double hit)', () => {
    const rawSegments = mockAntalJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[2].frames.length).toBe(2);
    // Both frames have same damage multiplier at each level
    const firstDmg = rawSegments[2].frames[0].clause[0].effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
    );
    const secondDmg = rawSegments[2].frames[1].clause[0].effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
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
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    expect(battleSkill.frames.length).toBe(1);
    expect(battleSkill.frames[0].properties.offset.value).toBe(0.67);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    const effects = battleSkill.clause[0].effects;
    const spCost = effects.find(
      (e: Record<string, any>) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.cardinality.value).toBe(100);
  });

  test('B3: Battle skill includes 6.5 ultimate energy recovery to self and all operators', () => {
    const battleSkill = mockAntalJson.skills.BATTLE_SKILL;
    const effects = battleSkill.clause[0].effects;
    const selfEnergy = effects.find(
      (e: Record<string, any>) => e.object === 'ULTIMATE_ENERGY' &&
        e.verb === 'RECOVER' && e.toDeterminer === 'THIS' && e.toObject === 'OPERATOR'
    );
    const allEnergy = effects.find(
      (e: Record<string, any>) => e.object === 'ULTIMATE_ENERGY' &&
        e.verb === 'RECOVER' && e.toDeterminer === 'ALL' && e.toObject === 'OPERATOR'
    );
    expect(selfEnergy).toBeDefined();
    expect(selfEnergy.with.cardinality.value).toBe(6.5);
    expect(allEnergy).toBeDefined();
    expect(allEnergy.with.cardinality.value).toBe(6.5);
  });

  test('B4: Focus duration is 60s at all skill levels', () => {
    const effects = mockAntalJson.skills.BATTLE_SKILL.frames[0].clause[0].effects;
    const focusEffect = effects.find(
      (e: Record<string, any>) => e.verb === 'APPLY' && e.object === 'STATUS' && e.objectId === 'FOCUS'
    );
    expect(focusEffect).toBeDefined();
    expect(focusEffect.with.duration.value).toBe(60);
  });

  test('B5: Susceptibility rate scales from 0.05 (lv1) to 0.10 (lv12)', () => {
    const effects = mockAntalJson.skills.BATTLE_SKILL.frames[0].clause[0].effects;
    const dmgEffect = effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
    );
    expect(dmgEffect.with.rate.value[0]).toBe(0.05);
    expect(dmgEffect.with.rate.value[11]).toBe(0.1);
  });

  test('B6: Damage multiplier scales from 0.89 (lv1) to 2.0 (lv12)', () => {
    const effects = mockAntalJson.skills.BATTLE_SKILL.frames[0].clause[0].effects;
    const dmgEffect = effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
    );
    expect(dmgEffect.with.value.value[0]).toBe(0.89);
    expect(dmgEffect.with.value.value[11]).toBe(2);
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
    expect(trigger.onTriggerClause.length).toBe(2);
  });

  test('C2: First clause — ANY_OPERATOR APPLY Physical Status + ENEMY HAVE FOCUS', () => {
    const clause = mockAntalJson.skills.COMBO_SKILL.properties.trigger.onTriggerClause[0];
    expect(clause.conditions.length).toBe(2);

    // Condition 1: any operator applies physical status
    expect(clause.conditions[0].subjectDeterminer).toBe('ANY');
    expect(clause.conditions[0].subject).toBe('OPERATOR');
    expect(clause.conditions[0].verb).toBe('APPLY');
    expect(clause.conditions[0].object).toBe('STATUS');
    expect(clause.conditions[0].objectId).toBe('PHYSICAL');

    // Condition 2: enemy has Focus
    expect(clause.conditions[1].subject).toBe('ENEMY');
    expect(clause.conditions[1].verb).toBe('HAVE');
    expect(clause.conditions[1].object).toBe('STATUS');
    expect(clause.conditions[1].objectId).toBe('FOCUS');
  });

  test('C3: Second clause — ANY_OPERATOR APPLY Infliction + ENEMY HAVE FOCUS', () => {
    const clause = mockAntalJson.skills.COMBO_SKILL.properties.trigger.onTriggerClause[1];
    expect(clause.conditions.length).toBe(2);

    // Condition 1: any operator applies arts infliction
    expect(clause.conditions[0].subjectDeterminer).toBe('ANY');
    expect(clause.conditions[0].subject).toBe('OPERATOR');
    expect(clause.conditions[0].verb).toBe('APPLY');
    expect(clause.conditions[0].object).toBe('INFLICTION');

    // Condition 2: enemy has Focus
    expect(clause.conditions[1].subject).toBe('ENEMY');
    expect(clause.conditions[1].verb).toBe('HAVE');
    expect(clause.conditions[1].object).toBe('STATUS');
    expect(clause.conditions[1].objectId).toBe('FOCUS');
  });

  test('C4: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockAntalJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C5: Combo cooldown is 15 seconds', () => {
    const effects = mockAntalJson.skills.COMBO_SKILL.clause[0].effects;
    const cooldown = effects.find(
      (e: Record<string, any>) => e.object === 'COOLDOWN' && e.verb === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.with.cardinality.value).toBe(15);
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
    const effects = mockAntalJson.skills.COMBO_SKILL.clause[0].effects;
    const energy = effects.find(
      (e: Record<string, any>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe('THIS');
    expect(energy.toObject).toBe('OPERATOR');
    expect(energy.with.cardinality.value).toBe(10);
  });

  test('C9: Combo damage multiplier: 1.51 (lv1) → 3.4 (lv12)', () => {
    const effects = mockAntalJson.skills.COMBO_SKILL.frames[0].clause[0].effects;
    const dmgEffect = effects.find(
      (e: Record<string, any>) => e.verb === 'DEAL' && e.object === 'DAMAGE'
    );
    expect(dmgEffect.with.value.value[0]).toBe(1.51);
    expect(dmgEffect.with.value.value[11]).toBe(3.4);
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
    const effects = comboFrame.clause[0].effects;
    const sourceInfliction = effects.find(
      (e: Record<string, any>) => e.verb === 'APPLY' && e.adjective === 'SOURCE' && e.object === 'INFLICTION'
    );
    expect(sourceInfliction).toBeDefined();
    expect(sourceInfliction.toObject).toBe('ENEMY');
  });

  test('C2.2: Combo frame has APPLY SOURCE STATUS DSL effect', () => {
    const comboFrame = mockAntalJson.skills.COMBO_SKILL.frames[0];
    const effects = comboFrame.clause[0].effects;
    const sourceStatus = effects.find(
      (e: Record<string, any>) => e.verb === 'APPLY' && e.adjective === 'SOURCE' && e.object === 'STATUS'
    );
    expect(sourceStatus).toBeDefined();
    expect(sourceStatus.toObject).toBe('ENEMY');
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
    const effects = mockAntalJson.skills.ULTIMATE.clause[0].effects;
    const energyCost = effects.find(
      (e: Record<string, any>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.with.cardinality.value).toBe(90);
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
      (e: Record<string, any>) => e.statModifier?.statType === 'INTELLECT'
    );
    expect(intEffect).toBeDefined();
    expect(intEffect.statModifier.value).toBe(10);

    const hpEffect = p4.effects.find(
      (e: Record<string, any>) => e.statModifier?.statType === 'BASE_HP'
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
      (e: Record<string, any>) => e.skillParameterModifier?.parameterKey === 'potential_5'
    );
    expect(uniqueMult).toBeDefined();
    expect(uniqueMult.skillParameterModifier.value).toBe(1);
    expect(uniqueMult.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const delayTime = p5.effects.find(
      (e: Record<string, any>) => e.skillParameterModifier?.parameterKey === 'delay_time'
    );
    expect(delayTime).toBeDefined();
    expect(delayTime.skillParameterModifier.value).toBe(20);
    expect(delayTime.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');

    const rate = p5.effects.find(
      (e: Record<string, any>) => e.skillParameterModifier?.parameterKey === 'potential_5_rate'
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
    // Basic attacks are segment-based with no COOLDOWN effect — effects are now in clause[0].effects
    const cooldown = ba.segments?.flatMap((s: Record<string, any>) => s.frames ?? [])
      .flatMap((f: Record<string, any>) => f.clause?.[0]?.effects ?? [])
      .find((e: Record<string, any>) => e.object === 'COOLDOWN');
    expect(cooldown).toBeUndefined();
  });

  test('H2: Battle skill has no COOLDOWN effect in DSL', () => {
    const bs = mockAntalJson.skills.BATTLE_SKILL;
    const cooldown = bs.clause?.[0]?.effects?.find(
      (e: Record<string, any>) => e.object === 'COOLDOWN'
    );
    expect(cooldown).toBeUndefined();
  });

  test('H3: Combo skill (EMP Test Site) has 15s cooldown', () => {
    const cs = mockAntalJson.skills.COMBO_SKILL;
    const cooldown = cs.clause[0].effects.find(
      (e: Record<string, any>) => e.object === 'COOLDOWN' && e.verb === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.with.cardinality.value).toBe(15);
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

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Combo Mirrored Infliction Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Combo Mirrored Infliction Pipeline', () => {
  const FPS = 120;
  const SLOT_ANTAL = 'slot-1';
  const SLOT_LAEV = 'slot-0';

  function makeEv(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
    return { name: '', activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  function antalWiring(): SlotTriggerWiring {
    return { slotId: SLOT_ANTAL, operatorId: 'antal' };
  }

  function laevWiring(): SlotTriggerWiring {
    return { slotId: SLOT_LAEV, operatorId: 'laevatain' };
  }

  function makeFocus(startFrame: number, duration: number): TimelineEvent {
    return makeEv({ id: `focus-${startFrame}`, name: StatusType.FOCUS, ownerId: ENEMY_OWNER_ID, columnId: 'focus', startFrame, activationDuration: duration });
  }

  function makeLaevBattle(startFrame: number): TimelineEvent {
    return makeEv({
      id: `laev-bs-${startFrame}`, name: 'FLAMING_CINDERS', ownerId: SLOT_LAEV,
      columnId: SKILL_COLUMNS.BATTLE, startFrame, activationDuration: FPS,
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyArtsInfliction: { element: 'HEAT', stacks: 1 },
        }],
      }],
    });
  }

  function makeAntalCombo(startFrame: number, comboTriggerColumnId?: string): TimelineEvent {
    return makeEv({
      id: `antal-combo-${startFrame}`,
      name: 'EMP_TEST_SITE',
      ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.COMBO,
      startFrame,
      activationDuration: Math.round(0.8 * FPS),
      animationDuration: Math.round(0.5 * FPS),
      comboTriggerColumnId,
      segments: [{
        durationFrames: Math.round(0.8 * FPS),
        frames: [{ offsetFrame: Math.round(0.7 * FPS) }],
      }],
    });
  }

  test('H1: Combo with comboTriggerColumnId generates mirrored heat infliction', () => {
    const focus = makeFocus(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    const antalCombo = makeAntalCombo(250, 'heatInfliction');
    const wirings = [laevWiring(), antalWiring()];

    const processed = processInflictionEvents([focus, laevBattle, antalCombo], undefined, undefined, wirings);
    const derived = processed.filter((e) => e.id.startsWith(`${antalCombo.id}-combo-inflict`));
    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0].columnId).toBe('heatInfliction');
    expect(derived[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(derived[0].sourceOwnerId).toBe(SLOT_ANTAL);
  });

  test('H2: Pipeline resolves comboTriggerColumnId from Laevatain battle skill', () => {
    const focus = makeFocus(0, 120 * FPS);
    const laevBattle = makeLaevBattle(100);
    // Combo placed with no trigger column — pipeline should resolve it
    const antalCombo = makeAntalCombo(250);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processInflictionEvents([focus, laevBattle, antalCombo], undefined, undefined, wirings);
    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBe('heatInfliction');
  });

  test('H3: Mirrored infliction not generated when combo has no comboTriggerColumnId', () => {
    // No Focus → combo trigger column not resolved
    const laevBattle = makeLaevBattle(100);
    const antalCombo = makeAntalCombo(250);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processInflictionEvents([laevBattle, antalCombo], undefined, undefined, wirings);
    const derived = processed.filter((e) => e.id.startsWith(`${antalCombo.id}-combo-inflict`));
    expect(derived.length).toBe(0);
  });

  test('H4: Combo mirrors electric infliction when triggered by another operator', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Simulate another operator (slot-2) applying electric infliction
    const electricWiring: SlotTriggerWiring = { slotId: 'slot-2', operatorId: '' };
    const arcBattle = makeEv({
      id: 'arc-bs-100', name: 'LIGHTNING_STRIKE', ownerId: 'slot-2',
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 100, activationDuration: FPS,
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyArtsInfliction: { element: 'ELECTRIC', stacks: 1 },
        }],
      }],
    });
    const antalCombo = makeAntalCombo(250);
    const wirings = [laevWiring(), antalWiring(), electricWiring];

    const processed = processInflictionEvents([focus, arcBattle, antalCombo], undefined, undefined, wirings);
    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo!.comboTriggerColumnId).toBe('electricInfliction');
    const derived = processed.filter((e) => e.id.startsWith(`${antalCombo.id}-combo-inflict`));
    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0].columnId).toBe('electricInfliction');
  });

  test('H5: Combo window requires Focus — no window without Focus active', () => {
    const laevBattle = makeLaevBattle(100);
    const wirings = [laevWiring(), antalWiring()];

    const processed = processInflictionEvents([laevBattle], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBe(0);
  });

  test('H6: Combo window appears when enemy has heat infliction and Focus active', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Derived heat infliction on enemy (as if Laevatain's battle skill frame created it)
    const heatInfliction = makeEv({
      id: 'heat-inf-1', name: 'heatInfliction', ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction', startFrame: 220, activationDuration: 10 * FPS,
      sourceOwnerId: SLOT_LAEV, sourceSkillName: 'FLAMING_CINDERS',
    });
    const wirings = [laevWiring(), antalWiring()];

    const processed = processInflictionEvents([focus, heatInfliction], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ANTAL,
    );
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].comboTriggerColumnId).toBe('heatInfliction');
  });

  test('H7: Full scenario — Akekuri heat infliction + Focus → Antal combo mirrors heat', () => {
    const SLOT_AKEKURI = 'slot-0';
    const focus = makeFocus(0, 120 * FPS);
    // Akekuri's battle skill applies heat infliction to enemy
    const akekuriHeatInfliction = makeEv({
      id: 'akekuri-heat-1', name: 'heatInfliction', ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction', startFrame: 200, activationDuration: 20 * FPS,
      sourceOwnerId: SLOT_AKEKURI, sourceSkillName: 'BURST_OF_PASSION',
    });
    // Antal places combo within the activation window, with comboTriggerColumnId resolved
    const antalCombo = makeAntalCombo(300, 'heatInfliction');

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processInflictionEvents(
      [focus, akekuriHeatInfliction, antalCombo],
      undefined, undefined, wirings,
    );

    // Original Akekuri heat infliction still present
    const akekuriHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_AKEKURI,
    );
    expect(akekuriHeat.length).toBeGreaterThan(0);

    // Antal combo mirrored heat infliction also present
    const antalHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBeGreaterThan(0);
    expect(antalHeat[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');

    // Enemy now has 2 heat inflictions: one from Akekuri, one from Antal
    const allHeat = processed.filter((e) => e.columnId === 'heatInfliction');
    expect(allHeat.length).toBeGreaterThanOrEqual(2);
  });

  test('H8: Re-resolve fixes comboTriggerColumnId when Focus appears mid-pipeline', () => {
    // Simulates the real scenario: Focus is derived by the engine AFTER the first
    // resolveComboTriggerColumns pass. The second pass (after engine) re-resolves
    // the combo's trigger column so mirrored inflictions can be generated.
    const SLOT_AKEKURI = 'slot-0';

    // Focus exists (as if engine-derived) + Akekuri heat infliction on enemy
    const focus = makeFocus(0, 120 * FPS);
    const akekuriHeat = makeEv({
      id: 'akekuri-heat-1', name: 'heatInfliction', ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction', startFrame: 200, activationDuration: 20 * FPS,
      sourceOwnerId: SLOT_AKEKURI, sourceSkillName: 'BURST_OF_PASSION',
    });
    // Antal combo placed WITHOUT comboTriggerColumnId (simulating first pass failing)
    const antalCombo = makeAntalCombo(300);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processInflictionEvents(
      [focus, akekuriHeat, antalCombo],
      undefined, undefined, wirings,
    );

    // Antal combo should have comboTriggerColumnId resolved
    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBe('heatInfliction');

    // Mirrored heat infliction from Antal should exist
    const antalHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBeGreaterThan(0);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');
  });

  test('H9: Antal own battle skill does NOT self-trigger combo (no electric mirroring)', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Antal's own battle skill — publishes APPLY INFLICTION element:ELECTRIC
    const antalBattle = makeEv({
      id: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0, activationDuration: FPS,
    });
    // Antal combo placed after battle skill
    const antalCombo = makeAntalCombo(250);
    const wirings = [antalWiring()];

    const processed = processInflictionEvents(
      [focus, antalBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // Combo should NOT have comboTriggerColumnId from self-trigger
    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo!.comboTriggerColumnId).toBeUndefined();

    // No electric infliction from self-trigger
    const electricInflictions = processed.filter(
      (e) => e.columnId === 'electricInfliction' && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(electricInflictions.length).toBe(0);
  });

  test('H10: Full pipeline combo window with Focus from Antal battle skill frame', () => {
    // Antal battle skill creates Focus via deriveFrameInflictions.
    // Akekuri heat infliction on enemy. Combo window should appear.
    const antalBattle = makeEv({
      id: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0, activationDuration: FPS,
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyStatus: {
            target: 'ENEMY', status: StatusType.FOCUS, stacks: 1,
            durationFrames: 60 * FPS, stackingInteraction: 'RESET',
          },
        }],
      }],
    });
    const akekuriHeat = makeEv({
      id: 'akekuri-heat-1', name: 'heatInfliction', ownerId: ENEMY_OWNER_ID,
      columnId: 'heatInfliction', startFrame: 200, activationDuration: 20 * FPS,
      sourceOwnerId: 'slot-0', sourceSkillName: 'BURST_OF_PASSION',
    });
    const akekuriWiring: SlotTriggerWiring = { slotId: 'slot-0', operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processInflictionEvents(
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
    const antalCombo = makeAntalCombo(300, 'heatInfliction');

    const akekuriWiring: SlotTriggerWiring = { slotId: 'slot-0', operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    // No Akekuri battle event in the events list — it was removed/dragged away
    const processed = processInflictionEvents(
      [focus, antalCombo],
      undefined, undefined, wirings,
    );

    // Stale comboTriggerColumnId should be cleared
    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBeUndefined();

    // No mirrored infliction should be generated
    const antalHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_ANTAL,
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
      id: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0, activationDuration: FPS,
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyStatus: {
            target: 'ENEMY', status: StatusType.FOCUS, stacks: 1,
            durationFrames: 60 * FPS, stackingInteraction: 'RESET',
          },
        }],
      }],
    });

    // Akekuri battle skill (source of heat infliction trigger) with infliction frame
    const akekuriBattle = makeEv({
      id: 'akekuri-bs-0', name: 'BURST_OF_PASSION', ownerId: SLOT_AKEKURI,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 100, activationDuration: FPS,
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyArtsInfliction: { element: 'HEAT', stacks: 1 },
        }],
      }],
    });

    // Antal combo — no comboTriggerColumnId (Phase 2 will fail, deferred resolves it)
    const antalCombo = makeAntalCombo(300);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processInflictionEvents(
      [antalBattle, akekuriBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // Focus should be derived from Antal's battle skill
    const focusEvents = processed.filter((e) => e.columnId === 'FOCUS');
    expect(focusEvents.length).toBeGreaterThan(0);

    // Heat infliction from Akekuri should exist
    const akekuriHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_AKEKURI,
    );
    expect(akekuriHeat.length).toBeGreaterThan(0);

    // Antal combo should have deferred-resolved comboTriggerColumnId
    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBe('heatInfliction');

    // Mirrored heat infliction from Antal combo should exist
    const antalHeat = processed.filter(
      (e) => e.columnId === 'heatInfliction' && e.sourceOwnerId === SLOT_ANTAL,
    );
    expect(antalHeat.length).toBeGreaterThan(0);
    expect(antalHeat[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');
  });

  test('H13: Full timeline — Antal BS → Focus, Akekuri BS → heat, Antal combo time-stop extends Akekuri + mirrors heat', () => {
    const SLOT_AKEKURI = 'slot-0';

    // Antal battle skill at frame 0 — derives Focus at offset 0.67s
    const antalBattle = makeEv({
      id: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0, activationDuration: FPS, // 1s = 120f
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyStatus: {
            target: 'ENEMY', status: StatusType.FOCUS, stacks: 1,
            durationFrames: 60 * FPS, stackingInteraction: 'RESET',
          },
        }],
      }],
    });

    // Akekuri battle skill at frame 120 — 1.33s duration, heat infliction at 0.67s
    const akekuriBattleDur = Math.round(1.33 * FPS); // 160f
    const akekuriBattle = makeEv({
      id: 'akekuri-bs-0', name: 'BURST_OF_PASSION', ownerId: SLOT_AKEKURI,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: FPS, activationDuration: akekuriBattleDur,
      segments: [{
        durationFrames: akekuriBattleDur,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS),
          applyArtsInfliction: { element: 'HEAT', stacks: 1 },
        }],
      }],
    });

    // Antal combo at frame 240 — time stop [240, 300) overlaps Akekuri BS [120, 280)
    const comboStart = 240;
    const antalCombo = makeAntalCombo(comboStart);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processInflictionEvents(
      [antalBattle, akekuriBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // 1. Focus derived from Antal's battle skill
    const focusEvents = processed.filter((e) => e.columnId === 'FOCUS');
    expect(focusEvents.length).toBe(1);
    expect(focusEvents[0].sourceOwnerId).toBe(SLOT_ANTAL);

    // 2. Two heat inflictions: one from Akekuri BS, one mirrored by Antal combo
    const heatInflictions = processed.filter((e) => e.columnId === 'heatInfliction');
    expect(heatInflictions.length).toBe(2);
    const akekuriHeat = heatInflictions.filter((e) => e.sourceOwnerId === SLOT_AKEKURI);
    const antalHeat = heatInflictions.filter((e) => e.sourceOwnerId === SLOT_ANTAL);
    expect(akekuriHeat.length).toBe(1);
    expect(antalHeat.length).toBe(1);
    expect(antalHeat[0].sourceSkillName).toBe('EMP_TEST_SITE');

    // 3. Combo time-stop extends Akekuri's battle skill segment duration
    const extendedAkekuriBs = processed.find((e) => e.id === akekuriBattle.id)!;
    const extendedDuration = extendedAkekuriBs.segments![0].durationFrames;
    expect(extendedDuration).toBeGreaterThan(akekuriBattleDur);
  });

  test('H14: Simultaneous battle skills — combo at window start mirrors heat', () => {
    const SLOT_AKEKURI = 'slot-0';

    // Both battle skills at frame 0
    const antalBattle = makeEv({
      id: 'antal-bs-0', name: 'SPECIFIED_RESEARCH_SUBJECT', ownerId: SLOT_ANTAL,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0, activationDuration: FPS,
      segments: [{
        durationFrames: FPS,
        frames: [{
          offsetFrame: Math.round(0.67 * FPS), // Focus at frame 80
          applyStatus: {
            target: 'ENEMY', status: StatusType.FOCUS, stacks: 1,
            durationFrames: 60 * FPS, stackingInteraction: 'RESET',
          },
        }],
      }],
    });

    const akekuriBattle = makeEv({
      id: 'akekuri-bs-0', name: 'BURST_OF_PASSION', ownerId: SLOT_AKEKURI,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0, activationDuration: Math.round(1.33 * FPS),
      segments: [{
        durationFrames: Math.round(1.33 * FPS),
        frames: [{
          offsetFrame: Math.round(0.67 * FPS), // Heat infliction at frame 80
          applyArtsInfliction: { element: 'HEAT', stacks: 1 },
        }],
      }],
    });

    // Combo right at the activation window start (frame 80 = when infliction + Focus appear)
    const comboStart = Math.round(0.67 * FPS);
    const antalCombo = makeAntalCombo(comboStart);

    const akekuriWiring: SlotTriggerWiring = { slotId: SLOT_AKEKURI, operatorId: 'akekuri' };
    const wirings = [akekuriWiring, antalWiring()];

    const processed = processInflictionEvents(
      [antalBattle, akekuriBattle, antalCombo],
      undefined, undefined, wirings,
    );

    // Two heat inflictions: Akekuri's original + Antal combo mirror
    const heatInflictions = processed.filter((e) => e.columnId === 'heatInfliction');
    expect(heatInflictions.length).toBe(2);
    expect(heatInflictions.filter((e) => e.sourceOwnerId === SLOT_AKEKURI).length).toBe(1);
    expect(heatInflictions.filter((e) => e.sourceOwnerId === SLOT_ANTAL).length).toBe(1);
  });

  test('H10: No mirrored infliction when combo is user-placed without a trigger source', () => {
    const focus = makeFocus(0, 120 * FPS);
    // Combo placed by user in debug mode — no trigger source, no comboTriggerColumnId
    const antalCombo = makeAntalCombo(300);
    const wirings = [antalWiring()];

    const processed = processInflictionEvents(
      [focus, antalCombo],
      undefined, undefined, wirings,
    );

    const combo = processed.find((e) => e.id === antalCombo.id);
    expect(combo).toBeDefined();
    expect(combo!.comboTriggerColumnId).toBeUndefined();

    // No inflictions of any kind from Antal
    const antalInflictions = processed.filter(
      (e) => e.ownerId === ENEMY_OWNER_ID && e.sourceOwnerId === SLOT_ANTAL
        && (e.columnId.includes('Infliction') || e.columnId.includes('vulnerable')),
    );
    expect(antalInflictions.length).toBe(0);
  });
});

}); // end Antal Combat Simulation
