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
import { SKILL_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID } from '../model/channels';

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
import { deriveFrameInflictions, consumeReactionsForStatus } from '../controller/timeline/processInfliction';
// eslint-disable-next-line import/first
import { deriveReactions } from '../controller/timeline/deriveReactions';
// eslint-disable-next-line import/first
import { SkillSegmentBuilder } from '../controller/events/basicAttackController';
// eslint-disable-next-line import/first
import { EventStatusType } from '../consts/enums';
// eslint-disable-next-line import/first
import { processInflictionEvents, SlotTriggerWiring } from '../controller/timeline/processInteractions';
// eslint-disable-next-line import/first
import { COMBO_WINDOW_COLUMN_ID } from '../controller/timeline/processComboSkill';
// eslint-disable-next-line import/first
import { SubjectType, VerbType, ObjectType, DeterminerType } from '../consts/semantics';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/ardelia-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/ardelia-skills.json');

const { statusEvents: _skStatusEvents, skillTypeMap: _skTypeMap, ...ardeliaSkillEntries } = mockSkillsJson as Record<string, any>;
const ardeliaSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(ardeliaSkillEntries)) {
  ardeliaSkills[key] = { ...(val as any), id: key };
}
if (_skTypeMap) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, skillId] of Object.entries(_skTypeMap as Record<string, string>)) {
    if (ardeliaSkills[skillId]) ardeliaSkills[category] = ardeliaSkills[skillId];
    for (const suffix of variantSuffixes) {
      const variantSkillId = `${skillId}_${suffix}`;
      if (ardeliaSkills[variantSkillId]) ardeliaSkills[`${suffix}_${category}`] = ardeliaSkills[variantSkillId];
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
    const spEffect = finalStrikeFrame.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT'
    );
    const staggerEffect = finalStrikeFrame.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(spEffect.withPreposition.cardinality.value).toBe(18);
    expect(staggerEffect.withPreposition.value.value).toBe(18);
  });

  test('A4: Earlier segments recover 0 SP', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      // SP stored in multipliers, not effects
      expect(frame.multipliers[0].SKILL_POINT).toBe(0);
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
    const seg1Mults = rawSegments[0].frames[0].multipliers;
    expect(seg1Mults[0].DAMAGE_MULTIPLIER).toBe(0.3);
    expect(seg1Mults[11].DAMAGE_MULTIPLIER).toBe(0.68);
    // Final Strike (segment 4): 0.55 → 1.24
    const seg4Mults = rawSegments[3].frames[0].multipliers;
    expect(seg4Mults[0].DAMAGE_MULTIPLIER).toBe(0.55);
    expect(seg4Mults[11].DAMAGE_MULTIPLIER).toBe(1.24);
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
    const spCost = battleSkill.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT' && e.verbType === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.withPreposition.cardinality.value).toBe(100);
  });

  test('B3: Battle skill has SP cost + 6.5 ultimate energy recovery to self and all operators', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    const spCost = battleSkill.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT' && e.verbType === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    const selfEnergy = battleSkill.effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' &&
        e.verbType === 'RECOVER' && e.toObjectDeterminer === 'THIS' && e.toObjectType === 'OPERATOR'
    );
    const allEnergy = battleSkill.effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' &&
        e.verbType === 'RECOVER' && e.toObjectDeterminer === 'ALL' && e.toObjectType === 'OPERATOR'
    );
    expect(selfEnergy).toBeDefined();
    expect(selfEnergy.withPreposition.cardinality.value).toBe(6.5);
    expect(allEnergy).toBeDefined();
    expect(allEnergy.withPreposition.cardinality.value).toBe(6.5);
  });

  test('B4: Stagger recovery is 10', () => {
    const sequences = getSequences('BATTLE_SKILL');
    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });

  test('B5: Vulnerability rate scales from 0.12 (lv1) to 0.20 (lv12)', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].rate_vul_base).toBe(0.12);
    expect(multipliers[11].rate_vul_base).toBe(0.2);
  });

  test('B6: Vulnerability duration is 30s at all skill levels', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    for (const m of multipliers) {
      expect(m.duration_vul).toBe(30);
    }
  });

  test('B7: Vulnerability max rate scales from 0.36 (lv1) to 0.40 (lv12)', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].rate_vul_max).toBe(0.36);
    expect(multipliers[11].rate_vul_max).toBe(0.4);
  });

  test('B8: Damage multiplier scales from 1.42 (lv1) to 3.2 (lv12)', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(1.42);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(3.2);
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
    expect(trigger.triggerClause.length).toBe(1);
    const conditions = trigger.triggerClause[0].conditions;
    // 1 trigger condition + 5 negated forbid conditions
    expect(conditions.length).toBe(6);
    expect(conditions[0].subjectDeterminer).toBe('ANY');
    expect(conditions[0].subjectType).toBe('OPERATOR');
    expect(conditions[0].verbType).toBe('PERFORM');
    expect(conditions[0].objectType).toBe('FINAL_STRIKE');
    const negated = conditions.filter((c: any) => c.negated);
    expect(negated.length).toBe(5);
    for (const n of negated) {
      expect(n.subjectType).toBe('ENEMY');
      expect(n.verbType).toBe('HAVE');
      expect(n.objectType).toBe('STATUS');
    }
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C3: Combo cooldown is 18 seconds', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const cooldown = effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(18);
  });

  test('C4: Combo has 2 frames', () => {
    expect(mockJson.skills.COMBO_SKILL.frames.length).toBe(2);
  });

  test('C5: Combo frame 2 applies forced Corrosion reaction to enemy', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.frames[1];
    const reaction = frame1.effects.find(
      (e: any) => e.verbType === 'APPLY' && e.objectType === 'REACTION'
    );
    expect(reaction).toBeDefined();
    expect(reaction.adjectiveType).toEqual(['FORCED', 'CORROSION']);
    expect(reaction.toObjectType).toBe('ENEMY');
    expect(reaction.withPreposition.stacks.value).toBe(1);
    expect(reaction.withPreposition.duration.value).toBe(7);
  });

  test('C5b: Combo frame 2 is GUARANTEED_HIT and PASSIVE', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.frames[1];
    expect(frame1.frameTypes).toEqual(['GUARANTEED_HIT', 'PASSIVE']);
  });

  test('C6: Combo frame 2 recovers 10 stagger', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.frames[1];
    const stagger = frame1.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(stagger.withPreposition.value.value).toBe(10);
  });

  test('C7: Combo animation is TIME_STOP (0.729s)', () => {
    const combo = mockJson.skills.COMBO_SKILL;
    expect(combo.properties.animation.duration.value).toBe(0.729);
    expect(combo.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('C8: Combo base duration is 0.77 seconds', () => {
    expect(mockJson.skills.COMBO_SKILL.properties.duration.value).toBe(0.77);
  });

  test('C9: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const energy = effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toObjectDeterminer).toBe('THIS');
    expect(energy.toObjectType).toBe('OPERATOR');
    expect(energy.withPreposition.cardinality.value).toBe(10);
  });

  test('C10: Combo damage multiplier: 0.45 (lv1) → 1.0 (lv12)', () => {
    const multipliers = mockJson.skills.COMBO_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(0.45);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(1);
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
    const effects = mockJson.skills.ULTIMATE.effects;
    const energyCost = effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.withPreposition.cardinality.value).toBe(90);
  });

  test('D2: Ultimate active duration is 3 seconds', () => {
    expect(mockJson.ultimateActiveDuration).toBe(3);
  });

  test('D3: Ultimate animation is TIME_STOP (2.5s within 6.97s)', () => {
    const ult = mockJson.skills.ULTIMATE;
    expect(ult.properties.duration.value).toBe(6.97);
    expect(ult.properties.animation.duration.value).toBe(2.5);
    expect(ult.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('D4: Ultimate has 11 frames (3 with multipliers)', () => {
    const ult = mockJson.skills.ULTIMATE;
    expect(ult.frames.length).toBe(11);
    const framesWithMults = ult.frames.filter((f: any) => f.multipliers?.length > 0);
    expect(framesWithMults.length).toBe(3);
  });

  test('D5: Ultimate skill ID is WOOLY_PARTY', () => {
    expect(mockJson.skills.ULTIMATE.id).toBe('WOOLY_PARTY');
  });

  test('D6: Ultimate first damage frame multiplier: 0.73 (lv1)', () => {
    const frames = mockJson.skills.ULTIMATE.frames;
    const dmgFrame = frames.find((f: any) => f.multipliers?.length > 0);
    expect(dmgFrame).toBeDefined();
    expect(dmgFrame.multipliers[0].DAMAGE_MULTIPLIER).toBe(0.73);
  });

  test('D7: Ultimate damage frame has effect_prob and interval parameters', () => {
    const frames = mockJson.skills.ULTIMATE.frames;
    const dmgFrame = frames.find(
      (f: any) => f.multipliers?.[0]?.effect_prob != null
    );
    expect(dmgFrame).toBeDefined();
    const mults = dmgFrame.multipliers[0];
    expect(mults.effect_prob).toBe(0.1);
    expect(mults.interval).toBe(0.3);
    expect(mults.DURATION).toBe(3);
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
      (e: any) => e.skillParameterModifier?.skillType === 'DOLLY_RUSH'
    );
    expect(dollyEffect).toBeDefined();
    expect(dollyEffect.skillParameterModifier.parameterKey).toBe('potential2');
    expect(dollyEffect.skillParameterModifier.value).toBe(1);
    expect(dollyEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const woolyEffect = p2.effects.find(
      (e: any) => e.skillParameterModifier?.skillType === 'WOOLY_PARTY'
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
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential3_duration'
    );
    expect(durationEffect).toBeDefined();
    expect(durationEffect.skillParameterModifier.skillType).toBe('WOOLY_PARTY');
    expect(durationEffect.skillParameterModifier.value).toBe(1);
    expect(durationEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const probEffect = p3.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'effect_prob'
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
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential5_duration'
    );
    expect(durationEffect).toBeDefined();
    expect(durationEffect.skillParameterModifier.skillType).toBe('ERUPTION_COLUMN');
    expect(durationEffect.skillParameterModifier.value).toBe(4);

    const dmgEffect = p5.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential5_dmg_rate'
    );
    expect(dmgEffect).toBeDefined();
    expect(dmgEffect.skillParameterModifier.value).toBe(1.2);
    expect(dmgEffect.skillParameterModifier.parameterModifyType).toBe('ADDITIVE');

    const cooldownEffect = p5.effects.find(
      (e: any) => e.potentialEffectType === 'SKILL_COST'
    );
    expect(cooldownEffect).toBeDefined();
    expect(cooldownEffect.skillCostModifier.skillType).toBe('ARDELIA_ERUPTION_COLUMN');
    expect(cooldownEffect.skillCostModifier.value).toBe(-2);

    const buff = p5.effects.find(
      (e: any) => e.potentialEffectType === 'BUFF_ATTACHMENT'
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
// Group H: Status & Infliction Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Status & Infliction Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  test('H1: Combo skill frame 2 derives forced Corrosion on enemy', () => {
    const comboEvent: TimelineEvent = {
      id: 'combo-1', name: 'ERUPTION_COLUMN', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      activationDuration: Math.round(0.77 * FPS), activeDuration: 0, cooldownDuration: 0,
      segments: [{
        durationFrames: Math.round(0.77 * FPS),
        frames: [
          { offsetFrame: Math.round(0.67 * FPS) }, // frame 1: no reaction
          {
            offsetFrame: Math.round(2.4 * FPS),    // frame 2: forced Corrosion
            applyForcedReaction: { reaction: 'CORROSION', statusLevel: 1, durationFrames: 1200 },
          },
        ],
      }],
    };
    const result = deriveFrameInflictions([comboEvent]);
    const reactions = result.filter(ev => ev.columnId === REACTION_COLUMNS.CORROSION);
    expect(reactions.length).toBe(1);
    expect(reactions[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(reactions[0].statusLevel).toBe(1);
    expect(reactions[0].sourceOwnerId).toBe(SLOT_ID);
    expect(reactions[0].sourceSkillName).toBe('ERUPTION_COLUMN');
    expect((reactions[0] as any).forcedReaction).toBe(true);
  });

  test('H2: Forced Corrosion does not require prior infliction stacks', () => {
    // Forced reactions bypass the normal cross-element requirement
    const comboEvent: TimelineEvent = {
      id: 'combo-1', name: 'ERUPTION_COLUMN', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      activationDuration: 92, activeDuration: 0, cooldownDuration: 0,
      segments: [{
        durationFrames: 92,
        frames: [{
          offsetFrame: Math.round(2.4 * FPS),
          applyForcedReaction: { reaction: 'CORROSION', statusLevel: 1, durationFrames: 1200 },
        }],
      }],
    };
    // No infliction events at all — forced reaction still fires
    const result = deriveFrameInflictions([comboEvent]);
    const corrosion = result.filter(ev => ev.columnId === REACTION_COLUMNS.CORROSION);
    expect(corrosion.length).toBe(1);
  });

  test('H3: Battle skill (Dolly Rush) has no infliction frame markers', () => {
    const bsEvent: TimelineEvent = {
      id: 'bs-1', name: 'DOLLY_RUSH', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      activationDuration: Math.round(1.57 * FPS), activeDuration: 0, cooldownDuration: 0,
      segments: [{
        durationFrames: Math.round(1.57 * FPS),
        frames: [{ offsetFrame: Math.round(1.07 * FPS) }],
      }],
    };
    const result = deriveFrameInflictions([bsEvent]);
    const inflictions = result.filter(ev => ev.ownerId === ENEMY_OWNER_ID);
    expect(inflictions.length).toBe(0);
  });

  test('H3b: DOLLY_RUSH frame has clause structure with consume reaction + apply status', () => {
    const seqs = getSequences('DOLLY_RUSH');
    expect(seqs.length).toBeGreaterThan(0);
    const frames = seqs[0].getFrames();
    expect(frames.length).toBeGreaterThan(0);

    // Legacy consumeReaction still set (without applyStatus — that's in the clause)
    const cr = frames[0].getConsumeReaction();
    expect(cr).not.toBeNull();
    expect(cr!.columnId).toBe('corrosion');

    // Clause structure: first predicate is conditional (ENEMY HAVE CORROSION → CONSUME + APPLY STATUS)
    const clauses = frames[0].getClauses();
    expect(clauses.length).toBe(2);

    // Conditional predicate: consume corrosion + apply vulnerability
    const condPred = clauses[0];
    expect(condPred.conditions.length).toBe(1);
    expect(condPred.conditions[0].subjectType).toBe('ENEMY');
    expect(condPred.conditions[0].verbType).toBe('HAVE');
    expect(condPred.conditions[0].objectType).toBe('REACTION');
    expect(condPred.conditions[0].objectId).toBe('CORROSION');
    expect(condPred.effects.length).toBe(2);
    expect(condPred.effects[0].type).toBe('consumeReaction');
    expect(condPred.effects[0].consumeReaction!.columnId).toBe('corrosion');
    expect(condPred.effects[1].type).toBe('applyStatus');
    expect(condPred.effects[1].applyStatus!.status).toBe('vulnerableInfliction');

    // Unconditional predicate: SP + stagger + deal damage
    const uncondPred = clauses[1];
    expect(uncondPred.conditions.length).toBe(0);
    expect(uncondPred.effects.some(e => e.type === 'recoverSP')).toBe(true);
    expect(uncondPred.effects.some(e => e.type === 'applyStagger')).toBe(true);
    expect(uncondPred.effects.some(e => e.type === 'dealDamage')).toBe(true);

    // DEAL DAMAGE has inline multipliers
    const dealDmg = uncondPred.effects.find(e => e.type === 'dealDamage')!;
    expect(dealDmg.dealDamage!.element).toBe('NATURE');
    expect(dealDmg.dealDamage!.multipliers.length).toBe(12);
    expect(dealDmg.dealDamage!.multipliers[0]).toBe(1.42);
    expect(dealDmg.dealDamage!.multipliers[11]).toBe(3.2);
  });

  test('H3c: Battle skill consuming corrosion clamps corrosion and generates susceptibility', () => {
    // Build battle skill event with real frame data
    const seqs = getSequences('DOLLY_RUSH');
    const seg = SkillSegmentBuilder.buildSegments(seqs);
    const bsEvent: TimelineEvent = {
      id: 'bs-1', name: 'DOLLY_RUSH', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      activationDuration: seg.totalDurationFrames, activeDuration: 0, cooldownDuration: 0,
      segments: seg.segments,
    };

    // Create a corrosion event that starts before the battle skill hit
    const corrosionEvent: TimelineEvent = {
      id: 'cor-1', name: REACTION_COLUMNS.CORROSION, ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.CORROSION, startFrame: 0,
      activationDuration: 2400, activeDuration: 0, cooldownDuration: 0,
      sourceOwnerId: 'slot-1',
    };

    const result = consumeReactionsForStatus([bsEvent, corrosionEvent], undefined, []);

    // Corrosion should be clamped (consumed)
    const corrosionResult = result.find(ev => ev.id === 'cor-1');
    expect(corrosionResult).toBeDefined();
    expect(corrosionResult!.eventStatus).toBe(EventStatusType.CONSUMED);
    // activationDuration should be clamped to the consume frame
    expect(corrosionResult!.activationDuration).toBeLessThan(2400);

    // Susceptibility event should be generated
    const suscEvents = result.filter(ev => ev.columnId === 'vulnerableInfliction');
    expect(suscEvents.length).toBe(1);
  });

  test('H3d: Corrosion segments are clamped when consumed', () => {
    const seqs = getSequences('DOLLY_RUSH');
    const seg = SkillSegmentBuilder.buildSegments(seqs);
    const bsEvent: TimelineEvent = {
      id: 'bs-1', name: 'DOLLY_RUSH', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      activationDuration: seg.totalDurationFrames, activeDuration: 0, cooldownDuration: 0,
      segments: seg.segments,
    };

    // Corrosion with segments (as attachReactionFrames would produce)
    const corrosionEvent: TimelineEvent = {
      id: 'cor-1', name: REACTION_COLUMNS.CORROSION, ownerId: ENEMY_OWNER_ID,
      columnId: REACTION_COLUMNS.CORROSION, startFrame: 0,
      activationDuration: 2400, activeDuration: 0, cooldownDuration: 0,
      sourceOwnerId: 'slot-1',
      segments: [{ durationFrames: 2400, label: 'Corrosion', frames: [] }],
    };

    const result = consumeReactionsForStatus([bsEvent, corrosionEvent], undefined, []);
    const corrosionResult = result.find(ev => ev.id === 'cor-1');
    expect(corrosionResult!.eventStatus).toBe(EventStatusType.CONSUMED);
    // Segment duration should also be clamped
    expect(corrosionResult!.segments![0].durationFrames).toBeLessThan(2400);
    expect(corrosionResult!.segments![0].durationFrames).toBe(corrosionResult!.activationDuration);
  });

  test('H4: Combo triggers on Final Strike with no inflictions', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    const cond = trigger.triggerClause[0].conditions[0];
    expect(cond.subjectDeterminer).toBe('ANY');
    expect(cond.subjectType).toBe('OPERATOR');
    expect(cond.verbType).toBe('PERFORM');
    expect(cond.objectType).toBe('FINAL_STRIKE');
  });

  test('H5: Nature infliction + Heat infliction → Combustion (teammate chain)', () => {
    const nature: TimelineEvent = {
      id: 'n1', name: INFLICTION_COLUMNS.NATURE, ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.NATURE, startFrame: 0,
      activationDuration: 2400, activeDuration: 0, cooldownDuration: 0,
      sourceOwnerId: SLOT_ID,
    };
    const heat: TimelineEvent = {
      id: 'h1', name: INFLICTION_COLUMNS.HEAT, ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.HEAT, startFrame: FPS,
      activationDuration: 2400, activeDuration: 0, cooldownDuration: 0,
      sourceOwnerId: 'slot-1',
    };
    const result = deriveReactions([nature, heat]);
    const reactions = result.filter(ev => ev.id.endsWith('-reaction'));
    expect(reactions.length).toBe(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.COMBUSTION);
  });

  test('H6: Combo has 5 negated forbid conditions (no Vulnerability or Arts Infliction)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    const conditions = trigger.triggerClause[0].conditions;
    const negated = conditions.filter((c: any) => c.negated);
    expect(negated.length).toBe(5);
    const forbidIds = negated.map((c: any) => c.objectId).sort();
    expect(forbidIds).toEqual([
      'cryoInfliction',
      'electricInfliction',
      'heatInfliction',
      'natureInfliction',
      'vulnerableInfliction',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group I: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
    return { name: '', ownerId: SLOT_ID, activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  test('H1: Basic attack (Rocky Whispers) has no cooldown', () => {
    const ba = mockJson.skills.BASIC_ATTACK;
    const cooldown = ba.segments?.flatMap((s: any) => s.frames ?? [])
      .flatMap((f: any) => f.effects ?? [])
      .find((e: any) => e.objectType === 'COOLDOWN');
    expect(cooldown).toBeUndefined();
  });

  test('H2: Battle skill (Dolly Rush) has no COOLDOWN effect', () => {
    const cooldown = mockJson.skills.BATTLE_SKILL.effects?.find(
      (e: any) => e.objectType === 'COOLDOWN'
    );
    expect(cooldown).toBeUndefined();
  });

  test('H3: Combo skill (Eruption Column) has 18s cooldown', () => {
    const cooldown = mockJson.skills.COMBO_SKILL.effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(18);
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
      activationDuration: comboDuration, cooldownDuration: comboCooldown,
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
      activationDuration: ultDuration, activeDuration: ultActive,
      cooldownDuration: 0, nonOverlappableRange: totalRange,
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
    return { name: '', activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  function ardeliaCapability(): SlotTriggerWiring {
    return {
      slotId: SLOT_ARDELIA,
      capability: {
        publishesTriggers: {
          [SKILL_COLUMNS.BASIC]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE },
          ],
        },
        comboRequires: [
          { subjectDeterminer: DeterminerType.ANY, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE },
        ],
        comboDescription: 'Any operator Final Strike while enemy has no inflictions',
        comboWindowFrames: 720,
        comboForbidsActiveColumns: ['heatInfliction', 'cryoInfliction', 'natureInfliction', 'electricInfliction', 'vulnerableInfliction'],
      },
    };
  }

  function otherOperatorCapability(): SlotTriggerWiring {
    return {
      slotId: SLOT_OTHER,
      capability: {
        publishesTriggers: {
          [SKILL_COLUMNS.BASIC]: [
            { subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE },
          ],
        },
        comboRequires: [],
        comboDescription: '',
        comboWindowFrames: 720,
      },
    };
  }

  function makeBasicAttack(slotId: string, startFrame: number): TimelineEvent {
    return makeEvent({
      id: `ba-${slotId}-${startFrame}`,
      name: 'ROCKY_WHISPERS',
      ownerId: slotId,
      columnId: SKILL_COLUMNS.BASIC,
      startFrame,
      activationDuration: Math.round(4.8 * FPS),
      segments: [
        { durationFrames: Math.round(0.4 * FPS), frames: [{ offsetFrame: Math.round(0.2 * FPS) }] },
        { durationFrames: Math.round(0.7 * FPS), frames: [{ offsetFrame: Math.round(0.3 * FPS) }] },
        { durationFrames: Math.round(1.53 * FPS), frames: [{ offsetFrame: Math.round(0.5 * FPS) }] },
        { durationFrames: Math.round(2.167 * FPS), frames: [{ offsetFrame: Math.round(1.5 * FPS) }] },
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
      activationDuration: durationFrames,
      sourceOwnerId: SLOT_OTHER,
    });
  }

  test('J1: Combo window appears after final strike with no inflictions on enemy', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const wirings = [ardeliaCapability(), otherOperatorCapability()];

    const processed = processInflictionEvents([ba], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(1);
  });

  test('J2: Combo window blocked when enemy has active heat infliction at trigger time', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    // Heat infliction covering the entire basic attack duration
    const heat = makeInflictionEvent('heat', 0, 20 * FPS);
    const wirings = [ardeliaCapability(), otherOperatorCapability()];

    const processed = processInflictionEvents([ba, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J3: Combo window blocked when enemy has active nature infliction at trigger time', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const nature = makeInflictionEvent('nature', 0, 20 * FPS);
    const wirings = [ardeliaCapability(), otherOperatorCapability()];

    const processed = processInflictionEvents([ba, nature], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J4: Combo window appears when infliction expired before final strike trigger', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 10 * FPS);
    // Heat infliction that ends well before the final strike trigger frame
    const heat = makeInflictionEvent('heat', 0, 2 * FPS);
    const wirings = [ardeliaCapability(), otherOperatorCapability()];

    const processed = processInflictionEvents([ba, heat], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(1);
  });

  test('J5: Combo window blocked when enemy has active vulnerability', () => {
    const ba = makeBasicAttack(SLOT_ARDELIA, 0);
    const vuln = makeInflictionEvent('vulnerable', 0, 20 * FPS);
    const wirings = [ardeliaCapability(), otherOperatorCapability()];

    const processed = processInflictionEvents([ba, vuln], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(0);
  });

  test('J6: Other operator final strike also triggers Ardelia combo window', () => {
    const otherBa = makeBasicAttack(SLOT_OTHER, 0);
    // Give the other operator's basic attack segments so final strike can be detected
    const wirings = [ardeliaCapability(), otherOperatorCapability()];

    const processed = processInflictionEvents([otherBa], undefined, undefined, wirings);
    const windows = processed.filter(
      (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === SLOT_ARDELIA,
    );
    expect(windows.length).toBe(1);
  });
});

}); // end Ardelia Combat Simulation
