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
 *    - P4: ×0.85 SKILL_COST on Wooly Party
 *    - P5: UNIQUE_MULTIPLIER duration + 1.2 dmg_rate + -2 cooldown on Eruption Column + BUFF_ATTACHMENT
 *
 * G. Operator Identity & Metadata
 *    - 6-star Supporter, Nature element, Arts Unit weapon
 *    - Main INTELLECT, secondary WILL
 *    - Talent names and levels
 */
import { TimelineEvent } from '../consts/viewTypes';
import { SegmentType, TimeDependency } from '../consts/enums';
import { SKILL_COLUMNS, ENEMY_OWNER_ID, COMBO_WINDOW_COLUMN_ID } from '../model/channels';

jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined, getAllOperatorIds: () => [],
  getFrameSequences: () => [], getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getSegmentLabels: () => undefined, getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0, getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined, getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
  getComboTriggerClause: (id: string) => id === 'ardelia'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require('../model/game-data/operator-skills/ardelia-skills.json').ERUPTION_COLUMN.properties.trigger.onTriggerClause
    : undefined,
  getComboTriggerInfo: (id: string) => {
    if (id !== 'ardelia') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trigger = require('../model/game-data/operator-skills/ardelia-skills.json').ERUPTION_COLUMN.properties.trigger;
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

// eslint-disable-next-line import/first
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';
// eslint-disable-next-line import/first
import { wouldOverlapSiblings } from '../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { processCombatSimulation } from '../controller/timeline/eventQueueController';
// eslint-disable-next-line import/first
import { SlotTriggerWiring } from '../controller/timeline/eventQueueTypes';


// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/ardelia-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/ardelia-skills.json');

const { statusEvents: _skStatusEvents, skillTypeMap: _skTypeMap, ...ardeliaSkillEntries } = mockSkillsJson;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data; downstream tests assert structure
const ardeliaSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(ardeliaSkillEntries)) {
  ardeliaSkills[key] = { ...(val as Record<string, unknown>), id: key };
}
if (_skTypeMap) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, value] of Object.entries(_skTypeMap as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (ardeliaSkills[value]) ardeliaSkills[category] = ardeliaSkills[value];
      for (const suffix of variantSuffixes) {
        const variantSkillId = `${value}_${suffix}`;
        if (ardeliaSkills[variantSkillId]) ardeliaSkills[`${suffix}_${category}`] = ardeliaSkills[variantSkillId];
      }
    } else if (typeof value === 'object' && value !== null) {
      const batkId = (value as Record<string, unknown>).BATK as string | undefined;
      if (batkId && ardeliaSkills[batkId]) ardeliaSkills[category] = ardeliaSkills[batkId];
      for (const [subKey, subId] of Object.entries(value as Record<string, string>)) {
        if (ardeliaSkills[subId]) ardeliaSkills[subKey] = ardeliaSkills[subId];
      }
      if (batkId) {
        for (const suffix of variantSuffixes) {
          const variantSkillId = `${batkId}_${suffix}`;
          if (ardeliaSkills[variantSkillId]) ardeliaSkills[`${suffix}_${category}`] = ardeliaSkills[variantSkillId];
        }
      }
    }
  }
}
const mockJson = { ...mockOperatorJson, skills: ardeliaSkills, skillTypeMap: _skTypeMap, ...(_skStatusEvents ? { statusEvents: _skStatusEvents } : {}) };

// ── Test helpers ─────────────────────────────────────────────────────────────

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
    const sequences = getSequences('BASIC_ATTACK');
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[0].properties.duration.value).toBe(0.4);
    expect(rawSegments[1].properties.duration.value).toBe(0.7);
    expect(rawSegments[2].properties.duration.value).toBe(1.53);
    expect(rawSegments[3].properties.duration.value).toBe(2.167);
  });

  test('A3: Final Strike (segment 4) recovers 18 SP and 18 Stagger', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    const finalStrikeFrame = rawSegments[3].frames[0];
    const effects = finalStrikeFrame.clause[0].effects;
    const spEffect = effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT'
    );
    const staggerEffect = effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    expect(spEffect.with.cardinality.value).toBe(18);
    expect(staggerEffect.with.value.value).toBe(18);
  });

  test('A4: Earlier segments have no SKILL_POINT or STAGGER effects', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      for (const frame of rawSegments[i].frames) {
        const effects = frame.clause[0].effects;
        const spEffect = effects.find((e: Record<string, unknown>) => e.object === 'SKILL_POINT');
        const staggerEffect = effects.find((e: Record<string, unknown>) => e.object === 'STAGGER');
        expect(spEffect).toBeUndefined();
        expect(staggerEffect).toBeUndefined();
      }
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
      (e: Record<string, unknown>) => e.object === 'DAMAGE'
    );
    expect(seg1Dmg.with.value.value[0]).toBe(0.3);
    expect(seg1Dmg.with.value.value[11]).toBe(0.68);
    // Final Strike (segment 4): 0.55 → 1.24
    const seg4Dmg = rawSegments[3].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'DAMAGE'
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
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    expect(battleSkill.frames.length).toBe(1);
    expect(battleSkill.frames[0].properties.offset.value).toBe(1.07);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    const spCost = battleSkill.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.cardinality.value).toBe(100);
  });

  test('B3: Battle skill has SP cost + 6.5 ultimate energy recovery to self and all operators', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    const effects = battleSkill.clause[0].effects;
    const spCost = effects.find(
      (e: Record<string, unknown>) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    const selfEnergy = effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' &&
        e.verb === 'RECOVER' && e.toDeterminer === 'THIS' && e.toObject === 'OPERATOR'
    );
    const allEnergy = effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' &&
        e.verb === 'RECOVER' && e.toDeterminer === 'ALL' && e.toObject === 'OPERATOR'
    );
    expect(selfEnergy).toBeDefined();
    expect(selfEnergy.with.cardinality.value).toBe(6.5);
    expect(allEnergy).toBeDefined();
    expect(allEnergy.with.cardinality.value).toBe(6.5);
  });

  test('B4: Stagger recovery is 10', () => {
    const sequences = getSequences('BATTLE_SKILL');
    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });

  test('B5: Vulnerability rate scales from 0.12 (lv1) to 0.20 (lv12)', () => {
    const effects = mockJson.skills.BATTLE_SKILL.frames[0].clause[0].effects;
    const dmgEffect = effects.find((e: Record<string, unknown>) => e.object === 'DAMAGE');
    expect(dmgEffect.with.rateVulBase.value[0]).toBe(0.12);
    expect(dmgEffect.with.rateVulBase.value[11]).toBe(0.2);
  });

  test('B6: Vulnerability duration is 30s at all skill levels', () => {
    const effects = mockJson.skills.BATTLE_SKILL.frames[0].clause[0].effects;
    const dmgEffect = effects.find((e: Record<string, unknown>) => e.object === 'DAMAGE');
    expect(dmgEffect.with.durationVul.value).toBe(30);
  });

  test('B7: Vulnerability max rate scales from 0.36 (lv1) to 0.40 (lv12)', () => {
    const effects = mockJson.skills.BATTLE_SKILL.frames[0].clause[0].effects;
    const dmgEffect = effects.find((e: Record<string, unknown>) => e.object === 'DAMAGE');
    expect(dmgEffect.with.rateVulMax.value[0]).toBe(0.36);
    expect(dmgEffect.with.rateVulMax.value[11]).toBe(0.4);
  });

  test('B8: Damage multiplier scales from 1.42 (lv1) to 3.2 (lv12)', () => {
    const effects = mockJson.skills.BATTLE_SKILL.frames[0].clause[1].effects;
    const dmgEffect = effects.find((e: Record<string, unknown>) => e.object === 'DAMAGE');
    expect(dmgEffect.with.multiplier.value[0]).toBe(1.42);
    expect(dmgEffect.with.multiplier.value[11]).toBe(3.2);
  });

  test('B9: Battle skill duration is 1.57 seconds', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    expect(battleSkill.properties.duration.value).toBe(1.57);
    expect(battleSkill.properties.duration.unit).toBe('SECOND');
  });

  test('B10: Battle skill ID is DOLLY_RUSH', () => {
    expect(mockJson.skills.BATTLE_SKILL.id).toBe('DOLLY_RUSH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (Eruption Column)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (Eruption Column)', () => {
  test('C1: Combo trigger requires Final Strike with no Vulnerability or Arts Infliction', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.onTriggerClause.length).toBe(1);
    const conditions = trigger.onTriggerClause[0].conditions;
    // 1 trigger condition + 5 negated forbid conditions
    expect(conditions.length).toBe(6);
    expect(conditions[0].subjectDeterminer).toBe('ANY');
    expect(conditions[0].subject).toBe('OPERATOR');
    expect(conditions[0].verb).toBe('PERFORM');
    expect(conditions[0].object).toBe('FINAL_STRIKE');
    const negated = conditions.filter((c: Record<string, unknown>) => c.negated);
    expect(negated.length).toBe(5);
    for (const n of negated) {
      expect(n.subject).toBe('ENEMY');
      expect(n.verb).toBe('HAVE');
      expect(n.object).toBe('STATUS');
    }
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C3: Combo cooldown is 18 seconds', () => {
    const effects = mockJson.skills.COMBO_SKILL.clause[0].effects;
    const cooldown = effects.find(
      (e: Record<string, unknown>) => e.object === 'COOLDOWN' && e.verb === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.with.cardinality.value).toBe(18);
  });

  test('C4: Combo has 2 frames', () => {
    expect(mockJson.skills.COMBO_SKILL.segments[1].frames.length).toBe(2);
  });

  test('C5: Combo frame 2 applies forced Corrosion reaction to enemy', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.segments[1].frames[1];
    const reaction = frame1.clause[0].effects.find(
      (e: Record<string, unknown>) => e.verb === 'APPLY' && e.object === 'REACTION'
    );
    expect(reaction).toBeDefined();
    expect(reaction.adjective).toEqual(['FORCED', 'CORROSION']);
    expect(reaction.toObject).toBe('ENEMY');
    expect(reaction.with.stacks.value).toBe(1);
    expect(reaction.with.duration.value).toBe(7);
  });

  test('C5b: Combo frame 2 is GUARANTEED_HIT and PASSIVE', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.segments[1].frames[1];
    expect(frame1.frameTypes).toEqual(['GUARANTEED_HIT', 'PASSIVE']);
  });

  test('C6: Combo frame 2 recovers 10 stagger', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.segments[1].frames[1];
    const stagger = frame1.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'STAGGER'
    );
    expect(stagger.with.value.value).toBe(10);
  });

  test('C7: Combo animation is TIME_STOP (0.729s)', () => {
    const combo = mockJson.skills.COMBO_SKILL;
    const animSeg = combo.segments.find((s: Record<string, unknown>) => (s.metadata as Record<string, unknown>)?.segmentType === 'ANIMATION');
    expect(animSeg).toBeDefined();
    expect(animSeg.properties.duration.value).toBe(0.729);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('C8: Combo base duration is 0.77 seconds', () => {
    const totalDuration = mockJson.skills.COMBO_SKILL.segments[0].properties.duration.value + mockJson.skills.COMBO_SKILL.segments[1].properties.duration.value;
    expect(totalDuration).toBeCloseTo(0.77, 2);
  });

  test('C9: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills.COMBO_SKILL.clause[0].effects;
    const energy = effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe('THIS');
    expect(energy.toObject).toBe('OPERATOR');
    expect(energy.with.cardinality.value).toBe(10);
  });

  test('C10: Combo damage multiplier: 0.45 (lv1) → 1.0 (lv12)', () => {
    const dmgEffect = mockJson.skills.COMBO_SKILL.segments[1].frames[0].clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'DAMAGE'
    );
    expect(dmgEffect.with.value.value[0]).toBe(0.45);
    expect(dmgEffect.with.value.value[11]).toBe(1);
  });

  test('C11: Combo skill ID is ERUPTION_COLUMN', () => {
    expect(mockJson.skills.COMBO_SKILL.id).toBe('ERUPTION_COLUMN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Wooly Party)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Wooly Party)', () => {
  test('D1: Ultimate energy cost is 90', () => {
    const effects = mockJson.skills.ULTIMATE.clause[0].effects;
    const energyCost = effects.find(
      (e: Record<string, unknown>) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.with.cardinality.value).toBe(90);
  });

  test('D2: Ultimate active duration is 3 seconds', () => {
    expect(mockJson.ultimateActiveDuration).toBe(3);
  });

  test('D3: Ultimate animation is TIME_STOP (2.5s within 6.97s)', () => {
    const ult = mockJson.skills.ULTIMATE;
    const totalDuration = ult.segments[0].properties.duration.value + ult.segments[1].properties.duration.value;
    expect(totalDuration).toBeCloseTo(6.97, 2);
    const animSeg = ult.segments.find((s: Record<string, unknown>) => (s.metadata as Record<string, unknown>)?.segmentType === 'ANIMATION');
    expect(animSeg).toBeDefined();
    expect(animSeg.properties.duration.value).toBe(2.5);
    expect(animSeg.properties.timeInteractionType).toBe('TIME_STOP');
  });

  test('D4: Ultimate has 11 frames (3 with damage effects)', () => {
    const ult = mockJson.skills.ULTIMATE;
    const frames = ult.segments[1].frames;
    expect(frames.length).toBe(11);
    const framesWithDmg = frames.filter((f: Record<string, unknown>) =>
      (((f.clause as Record<string, unknown>[] | undefined)?.[0] as Record<string, unknown> | undefined)?.effects as Record<string, unknown>[] | undefined)?.some((e: Record<string, unknown>) => e.object === 'DAMAGE')
    );
    expect(framesWithDmg.length).toBe(3);
  });

  test('D5: Ultimate skill ID is WOOLY_PARTY', () => {
    expect(mockJson.skills.ULTIMATE.id).toBe('WOOLY_PARTY');
  });

  test('D6: Ultimate first damage frame multiplier: 0.73 (lv1)', () => {
    const frames = mockJson.skills.ULTIMATE.segments[1].frames;
    const dmgFrame = frames.find((f: Record<string, unknown>) =>
      (((f.clause as Record<string, unknown>[] | undefined)?.[0] as Record<string, unknown> | undefined)?.effects as Record<string, unknown>[] | undefined)?.some((e: Record<string, unknown>) => e.object === 'DAMAGE')
    );
    expect(dmgFrame).toBeDefined();
    const dmgEffect = dmgFrame.clause[0].effects.find((e: Record<string, unknown>) => e.object === 'DAMAGE');
    expect(dmgEffect.with.value.value[0]).toBe(0.73);
  });

  test('D7: Ultimate damage frame has effectProb and interval parameters', () => {
    const frames = mockJson.skills.ULTIMATE.segments[1].frames;
    const dmgFrame = frames.find(
      (f: Record<string, unknown>) => (((f.clause as Record<string, unknown>[] | undefined)?.[0] as Record<string, unknown> | undefined)?.effects as Record<string, unknown>[] | undefined)?.some((e: Record<string, unknown>) => (e.with as Record<string, unknown> | undefined)?.effectProb != null)
    );
    expect(dmgFrame).toBeDefined();
    const dmgEffect = dmgFrame.clause[0].effects.find((e: Record<string, unknown>) => (e.with as Record<string, unknown> | undefined)?.effectProb != null);
    expect(dmgEffect.with.effectProb.value).toBe(0.1);
    expect(dmgEffect.with.interval.value).toBe(0.3);
    expect(dmgEffect.with.duration.value).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Empowered Battle Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Empowered Battle Skill', () => {
  test('E1: Empowered battle skill exists', () => {
    expect(mockJson.skills.EMPOWERED_BATTLE_SKILL).toBeDefined();
  });

  test('E2: Empowered battle skill has 1 frame at 1.07s offset', () => {
    const ebs = mockJson.skills.EMPOWERED_BATTLE_SKILL;
    expect(ebs.frames.length).toBe(1);
    expect(ebs.frames[0].properties.offset.value).toBe(1.07);
  });

  test('E3: Empowered battle skill duration is 1.57s (same as normal)', () => {
    expect(mockJson.skills.EMPOWERED_BATTLE_SKILL.properties.duration.value).toBe(1.57);
  });

  test('E4: Empowered battle skill frame has stagger recovery 10', () => {
    const sequences = getSequences('EMPOWERED_BATTLE_SKILL');
    expect(sequences.length).toBeGreaterThan(0);
    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Potentials', () => {
  test('F1: P1 — +0.08 ADDITIVE vulnerability rate on Dolly Rush', () => {
    const p1 = mockJson.potentials[0];
    expect(p1.level).toBe(1);
    expect(p1.name).toBe('Dolly Paradise');
    const effect = p1.effects[0];
    expect(effect.potentialEffectType).toBe('SKILL_PARAMETER');
    expect(effect.skillParameterModifier.skillType).toBe('DOLLY_RUSH');
    expect(effect.skillParameterModifier.parameterKey).toBe('rate_vul_base');
    expect(effect.skillParameterModifier.value).toBe(0.08);
    expect(effect.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');
  });

  test('F2: P2 — UNIQUE_MULTIPLIER on Dolly Rush + Wooly Party', () => {
    const p2 = mockJson.potentials[1];
    expect(p2.level).toBe(2);
    expect(p2.name).toBe('Game Rewards');
    expect(p2.effects.length).toBe(2);

    const dollyEffect = p2.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.skillType === 'DOLLY_RUSH'
    );
    expect(dollyEffect).toBeDefined();
    expect(dollyEffect.skillParameterModifier.parameterKey).toBe('potential2');
    expect(dollyEffect.skillParameterModifier.value).toBe(1);
    expect(dollyEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const woolyEffect = p2.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.skillType === 'WOOLY_PARTY'
    );
    expect(woolyEffect).toBeDefined();
    expect(woolyEffect.skillParameterModifier.parameterKey).toBe('potential2');
    expect(woolyEffect.skillParameterModifier.value).toBe(1);
  });

  test('F3: P3 — UNIQUE_MULTIPLIER duration + ×1.2 effect_prob on Wooly Party', () => {
    const p3 = mockJson.potentials[2];
    expect(p3.level).toBe(3);
    expect(p3.name).toBe('Explosive Eruption');
    expect(p3.effects.length).toBe(2);

    const durationEffect = p3.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'potential3_duration'
    );
    expect(durationEffect).toBeDefined();
    expect(durationEffect.skillParameterModifier.skillType).toBe('WOOLY_PARTY');
    expect(durationEffect.skillParameterModifier.value).toBe(1);
    expect(durationEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const probEffect = p3.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'effect_prob'
    );
    expect(probEffect).toBeDefined();
    expect(probEffect.skillParameterModifier.skillType).toBe('WOOLY_PARTY');
    expect(probEffect.skillParameterModifier.value).toBe(1.2);
    expect(probEffect.skillParameterModifier.parameterModifyType).toBe('MULTIPLICATIVE');
  });

  test('F4: P4 — ×0.85 SKILL_COST on Wooly Party', () => {
    const p4 = mockJson.potentials[3];
    expect(p4.level).toBe(4);
    expect(p4.name).toBe('Rock Blossom');
    const costEffect = p4.effects[0];
    expect(costEffect.potentialEffectType).toBe('SKILL_COST');
    expect(costEffect.skillCostModifier.skillType).toBe('ARDELIA_WOOLY_PARTY');
    expect(costEffect.skillCostModifier.value).toBe(0.85);
  });

  test('F5: P5 — Eruption Column upgrades + BUFF_ATTACHMENT', () => {
    const p5 = mockJson.potentials[4];
    expect(p5.level).toBe(5);
    expect(p5.name).toBe('Volcanic Steam');
    expect(p5.effects.length).toBe(4);

    const durationEffect = p5.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'potential5_duration'
    );
    expect(durationEffect).toBeDefined();
    expect(durationEffect.skillParameterModifier.skillType).toBe('ERUPTION_COLUMN');
    expect(durationEffect.skillParameterModifier.value).toBe(4);

    const dmgEffect = p5.effects.find(
      (e: Record<string, unknown>) => (e.skillParameterModifier as Record<string, unknown> | undefined)?.parameterKey === 'potential5_dmg_rate'
    );
    expect(dmgEffect).toBeDefined();
    expect(dmgEffect.skillParameterModifier.value).toBe(1.2);
    expect(dmgEffect.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');

    const cooldownEffect = p5.effects.find(
      (e: Record<string, unknown>) => e.potentialEffectType === 'SKILL_COST'
    );
    expect(cooldownEffect).toBeDefined();
    expect(cooldownEffect.skillCostModifier.skillType).toBe('ARDELIA_ERUPTION_COLUMN');
    expect(cooldownEffect.skillCostModifier.value).toBe(-2);

    const buff = p5.effects.find(
      (e: Record<string, unknown>) => e.potentialEffectType === 'BUFF_ATTACHMENT'
    );
    expect(buff).toBeDefined();
    expect(buff.buffAttachment.objectId).toBe('ARDELIA_POTENTIAL5_VOLCANIC_STEAM');
  });

  test('F6: All 5 potential levels are present', () => {
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
    expect(mockJson.operatorType).toBe('ARDELIA');
    expect(mockJson.name).toBe('Ardelia');
  });

  test('G2: 6-star Supporter, Nature element, Arts Unit weapon', () => {
    expect(mockJson.operatorRarity).toBe(6);
    expect(mockJson.operatorClassType).toBe('SUPPORTER');
    expect(mockJson.elementType).toBe('NATURE');
    expect(mockJson.weaponType).toBe('ARTS_UNIT');
  });

  test('G3: Main attribute INTELLECT, secondary WILL', () => {
    expect(mockJson.mainAttributeType).toBe('INTELLECT');
    expect(mockJson.secondaryAttributeType).toBe('WILL');
  });

  test('G4: Talent names and max levels', () => {
    expect(mockJson.talents.one.name).toBe('Friendly Presence');
    expect(mockJson.talents.one.maxLevel).toBe(3);
    expect(mockJson.talents.two.name).toBe('Mountainpeak Surfer');
    expect(mockJson.talents.two.maxLevel).toBe(1);
    expect(mockJson.talents.attributeIncrease.name).toBe('Keen Mind');
    expect(mockJson.talents.attributeIncrease.attribute).toBe('INTELLECT');
    expect(mockJson.talents.attributeIncrease.maxLevel).toBe(4);
  });

  test('G5: Level table has entries from 1 to 99+', () => {
    const levels = mockJson.allLevels;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
  });

  test('G6: Basic attack default duration is 0.1833 seconds', () => {
    expect(mockJson.basicAttackDefaultDuration).toBe(0.1833);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group I: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
    return { name: '', ownerId: SLOT_ID, segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  test('H1: Basic attack (Rocky Whispers) has no cooldown', () => {
    const ba = mockJson.skills.BASIC_ATTACK;
    const cooldown = ba.segments?.flatMap((s: Record<string, unknown>) => s.frames ?? [])
      .flatMap((f: Record<string, unknown>) => f.effects ?? [])
      .find((e: Record<string, unknown>) => e.object === 'COOLDOWN');
    expect(cooldown).toBeUndefined();
  });

  test('H2: Battle skill (Dolly Rush) has no COOLDOWN effect', () => {
    const cooldown = mockJson.skills.BATTLE_SKILL.effects?.find(
      (e: Record<string, unknown>) => e.object === 'COOLDOWN'
    );
    expect(cooldown).toBeUndefined();
  });

  test('H3: Combo skill (Eruption Column) has 18s cooldown', () => {
    const cooldown = mockJson.skills.COMBO_SKILL.clause[0].effects.find(
      (e: Record<string, unknown>) => e.object === 'COOLDOWN' && e.verb === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.with.cardinality.value).toBe(18);
  });

  test('H4: Ultimate (Wooly Party) has 0s cooldown from operator JSON', () => {
    expect(mockJson.ultimateCooldownDuration).toBe(0);
  });

  test('H5: Combo placement during 18s cooldown is blocked', () => {
    const comboDuration = Math.round(0.77 * FPS);
    const comboCooldown = 18 * FPS;
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      id: 'cs-1', columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      segments: [{ properties: { duration: comboDuration } }],
      nonOverlappableRange: totalRange,
    });
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, comboDuration + 300, 1, [cs1])).toBe(true);
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.COMBO, totalRange, 1, [cs1])).toBe(false);
  });

  test('H6: Ultimate with 0s cooldown allows immediate re-use after active phase', () => {
    const ultDuration = Math.round(6.97 * FPS);
    const ultActive = 3 * FPS;
    const totalRange = ultDuration + ultActive; // no cooldown
    const ult1 = makeEvent({
      id: 'ult-1', columnId: SKILL_COLUMNS.ULTIMATE, startFrame: 0,
      segments: [{ properties: { duration: ultDuration } }], nonOverlappableRange: totalRange,
    });
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.ULTIMATE, totalRange, 1, [ult1])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group J: Combo Activation Window Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Combo Activation Window Pipeline', () => {
  const FPS = 120;
  const SLOT_ARDELIA = 'slot-0';
  const SLOT_OTHER = 'slot-1';

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number; ownerId: string }): TimelineEvent {
    return { name: '', segments: [{ properties: { duration: 0 } }], ...overrides };
  }

  function ardeliaWiring(): SlotTriggerWiring {
    return { slotId: SLOT_ARDELIA, operatorId: 'ardelia' };
  }

  function otherOperatorWiring(): SlotTriggerWiring {
    return { slotId: SLOT_OTHER, operatorId: 'other' };
  }

  function makeBasicAttack(slotId: string, startFrame: number): TimelineEvent {
    return makeEvent({
      id: `ba-${slotId}-${startFrame}`,
      name: 'ROCKY_WHISPERS',
      ownerId: slotId,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame,
            segments: [
        { properties: { duration: Math.round(0.4 * FPS) }, frames: [{ offsetFrame: Math.round(0.2 * FPS) }] },
        { properties: { duration: Math.round(0.7 * FPS) }, frames: [{ offsetFrame: Math.round(0.3 * FPS) }] },
        { properties: { duration: Math.round(1.53 * FPS) }, frames: [{ offsetFrame: Math.round(0.5 * FPS) }] },
        { properties: { duration: Math.round(2.167 * FPS) }, frames: [{ offsetFrame: Math.round(1.5 * FPS) }] },
      ],
    });
  }

  function makeInflictionEvent(element: string, startFrame: number, durationFrames: number): TimelineEvent {
    return makeEvent({
      id: `inflict-${element}-${startFrame}`,
      name: `${element}Infliction`,
      ownerId: ENEMY_OWNER_ID,
      columnId: `${element}Infliction`,
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
    const heat = makeInflictionEvent('heat', 0, 20 * FPS);
    const wirings = [ardeliaWiring(), otherOperatorWiring()];

    const processed = processCombatSimulation([ba, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J3: Combo window blocked when enemy has active nature infliction at trigger time', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const nature = makeInflictionEvent('nature', 0, 20 * FPS);
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
    const heat = makeInflictionEvent('heat', 0, 2 * FPS);
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
    const vuln = makeInflictionEvent('vulnerable', 0, 20 * FPS);
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
      id: 'ba-timestop',
      name: 'ROCKY_WHISPERS',
      ownerId: SLOT_OTHER,
      columnId: SKILL_COLUMNS.BASIC,
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
      id: 'combo-ts',
      name: 'SOME_COMBO',
      ownerId: SLOT_OTHER,
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 350,
            segments: [{ properties: { duration: 120, timeDependency: TimeDependency.REAL_TIME }, metadata: { segmentType: SegmentType.ANIMATION } }],
    });
    // Raw 450 → extended to 570 by timestop. Active at 496, expired at 616.
    const heat = makeInflictionEvent('heat', 0, 450);
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
      id: 'ba-timestop-blocked',
      name: 'ROCKY_WHISPERS',
      ownerId: SLOT_OTHER,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 0,
            segments: [
        { properties: { duration: 48 }, frames: [{ offsetFrame: 24 }] },
        { properties: { duration: 84 }, frames: [{ offsetFrame: 36 }] },
        { properties: { duration: 184 }, frames: [{ offsetFrame: 60 }] },
        { properties: { duration: 380 }, frames: [{ offsetFrame: 180 }] },
      ],
    });
    const combo = makeEvent({
      id: 'combo-ts2',
      name: 'SOME_COMBO',
      ownerId: SLOT_OTHER,
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 350,
            segments: [{ properties: { duration: 120, timeDependency: TimeDependency.REAL_TIME }, metadata: { segmentType: SegmentType.ANIMATION } }],
    });
    // Raw 550 → extended 670. Active at both 496 and 616.
    const heat = makeInflictionEvent('heat', 0, 550);
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
      id: 'ba-no-timestop',
      name: 'ROCKY_WHISPERS',
      ownerId: SLOT_OTHER,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 0,
            segments: [
        { properties: { duration: 48 }, frames: [{ offsetFrame: 24 }] },
        { properties: { duration: 84 }, frames: [{ offsetFrame: 36 }] },
        { properties: { duration: 184 }, frames: [{ offsetFrame: 60 }] },
        { properties: { duration: 380 }, frames: [{ offsetFrame: 180 }] },
      ],
    });
    // No combo timestop — infliction raw 497 covers raw trigger 496
    const heat = makeInflictionEvent('heat', 0, 497);
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
