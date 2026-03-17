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
 * F. Scorching Fangs (Talent 1 — Status Event)
 *    - Target: THIS_OPERATOR (self-buff)
 *    - Element: HEAT
 *    - Max 1 stack, RESET interaction
 *    - Two trigger clauses (OR): enemy has Combustion, OR self performs Battle Skill while having Scorching Fangs
 *    - Duration: 15s
 *    - P3 team share: 0.5× duration multiplier
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
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';
// eslint-disable-next-line import/first
import { wouldOverlapSiblings } from '../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { applyPotentialEffects } from '../controller/timeline/processComboSkill';
// eslint-disable-next-line import/first
import { deriveFrameInflictions } from '../controller/timeline/processInfliction';
// eslint-disable-next-line import/first
import { deriveReactions } from '../controller/timeline/deriveReactions';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/wulfgard-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/wulfgard-skills.json');

const { statusEvents: _skStatusEvents, skillTypeMap: _skTypeMap, ...wulfgardSkillEntries } = mockSkillsJson as Record<string, any>;
// Build skills keyed by both skill ID and category name (tests access by category)
// Add `id` field from key name so tests can verify skill identity
const wulfgardSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(wulfgardSkillEntries)) {
  wulfgardSkills[key] = { ...(val as any), id: key };
}
if (_skTypeMap) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, skillId] of Object.entries(_skTypeMap as Record<string, string>)) {
    if (wulfgardSkills[skillId]) wulfgardSkills[category] = wulfgardSkills[skillId];
    for (const suffix of variantSuffixes) {
      const variantSkillId = `${skillId}_${suffix}`;
      if (wulfgardSkills[variantSkillId]) wulfgardSkills[`${suffix}_${category}`] = wulfgardSkills[variantSkillId];
    }
  }
}
const mockJson = { ...mockOperatorJson, skills: wulfgardSkills, skillTypeMap: _skTypeMap, ...(_skStatusEvents ? { statusEvents: _skStatusEvents } : {}) };

// ── Test helpers ─────────────────────────────────────────────────────────────

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
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[0].properties.duration.value).toBe(0.83);
    expect(rawSegments[1].properties.duration.value).toBe(0.8);
    expect(rawSegments[2].properties.duration.value).toBe(1.1);
    expect(rawSegments[3].properties.duration.value).toBe(1.767);
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

  test('A4: First 3 segments recover 0 SP', () => {
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

  test('A6: Segments 1 and 2 each have 2 frames (double hit)', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[0].frames.length).toBe(2);
    expect(rawSegments[1].frames.length).toBe(2);
  });

  test('A7: Segment 3 has 3 frames (triple hit)', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[2].frames.length).toBe(3);
  });

  test('A8: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    // Segment 1: 0.15 → 0.34
    const seg1Mults = rawSegments[0].frames[0].multipliers;
    expect(seg1Mults[0].DAMAGE_MULTIPLIER).toBe(0.15);
    expect(seg1Mults[11].DAMAGE_MULTIPLIER).toBe(0.34);
    // Final Strike (segment 4): 0.68 → 1.52
    const seg4Mults = rawSegments[3].frames[0].multipliers;
    expect(seg4Mults[0].DAMAGE_MULTIPLIER).toBe(0.68);
    expect(seg4Mults[11].DAMAGE_MULTIPLIER).toBe(1.52);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Thermite Tracers)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Thermite Tracers)', () => {
  test('B1: Battle skill has 3 frames', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    expect(battleSkill.frames.length).toBe(3);
  });

  test('B2: Frame offsets at 0.2s, 0.53s, 0.767s', () => {
    const frames = mockJson.skills.BATTLE_SKILL.frames;
    expect(frames[0].properties.offset.value).toBe(0.2);
    expect(frames[1].properties.offset.value).toBe(0.53);
    expect(frames[2].properties.offset.value).toBe(0.767);
  });

  test('B3: Battle skill costs 100 SP', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    const spCost = battleSkill.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT' && e.verbType === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.withPreposition.cardinality.value).toBe(100);
  });

  test('B4: Battle skill has SP cost + 6.5 ultimate energy recovery to self and all operators', () => {
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

  test('B5: Frame 3 recovers 5 Stagger and applies Heat infliction', () => {
    const frame2 = mockJson.skills.BATTLE_SKILL.frames[2];
    const stagger = frame2.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(stagger.withPreposition.value.value).toBe(5);

    const infliction = frame2.effects.find(
      (e: any) => e.verbType === 'APPLY' && e.objectType === 'INFLICTION'
    );
    expect(infliction).toBeDefined();
    expect(infliction.adjectiveType).toBe('HEAT');
    expect(infliction.toObjectType).toBe('ENEMY');
  });

  test('B6: Frames 1 and 2 have stagger effects with value 0', () => {
    for (let i = 0; i < 2; i++) {
      const frame = mockJson.skills.BATTLE_SKILL.frames[i];
      const stagger = frame.effects.find(
        (e: any) => e.objectType === 'STAGGER'
      );
      expect(stagger).toBeDefined();
      expect(stagger.withPreposition.value.value).toBe(0);
    }
  });

  test('B7: Damage multiplier scales from 0.34 (lv1) to 0.77 (lv12)', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(0.34);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(0.77);
  });

  test('B8: atk_scale_plus scales from 3.78 (lv1) to 8.5 (lv12)', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].atk_scale_plus).toBe(3.78);
    expect(multipliers[11].atk_scale_plus).toBe(8.5);
  });

  test('B9: Poise parameters are constant across levels', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    for (const m of multipliers) {
      expect(m.poise_first_bullet).toBe(1.67);
      expect(m.poise_extra_bullet).toBe(5);
    }
  });

  test('B10: Battle skill duration is 1.07 seconds', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    expect(battleSkill.properties.duration.value).toBe(1.07);
    expect(battleSkill.properties.duration.unit).toBe('SECOND');
  });

  test('B11: Battle skill ID is THERMITE_TRACERS', () => {
    expect(mockJson.skills.BATTLE_SKILL.id).toBe('THERMITE_TRACERS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (Frag Grenade Beta)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (Frag Grenade Beta)', () => {
  test('C1: Combo trigger requires enemy is Combusted (single clause)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.triggerClause.length).toBe(1);
    expect(trigger.triggerClause[0].conditions[0].subjectType).toBe('ENEMY');
    expect(trigger.triggerClause[0].conditions[0].verbType).toBe('IS');
    expect(trigger.triggerClause[0].conditions[0].objectType).toBe('COMBUSTED');
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C3: Combo cooldown is 20 seconds', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const cooldown = effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(20);
  });

  test('C4: Combo has 1 frame with 10 Stagger + Heat infliction', () => {
    const frames = mockJson.skills.COMBO_SKILL.frames;
    expect(frames.length).toBe(1);

    const stagger = frames[0].effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(stagger.withPreposition.value.value).toBe(10);

    const infliction = frames[0].effects.find(
      (e: any) => e.verbType === 'APPLY' && e.objectType === 'INFLICTION'
    );
    expect(infliction).toBeDefined();
    expect(infliction.adjectiveType).toBe('HEAT');
    expect(infliction.toObjectType).toBe('ENEMY');
  });

  test('C5: Combo animation is TIME_STOP (0.5s within 1s)', () => {
    const comboSkill = mockJson.skills.COMBO_SKILL;
    expect(comboSkill.properties.duration.value).toBe(1);
    expect(comboSkill.properties.animation.duration.value).toBe(0.5);
    expect(comboSkill.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('C6: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const energy = effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toObjectDeterminer).toBe('THIS');
    expect(energy.toObjectType).toBe('OPERATOR');
    expect(energy.withPreposition.cardinality.value).toBe(10);
  });

  test('C7: Combo damage multiplier: 0.6 (lv1) → 1.35 (lv12)', () => {
    const multipliers = mockJson.skills.COMBO_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(0.6);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(1.35);
  });

  test('C8: Combo skill ID is FRAG_GRENADE_BETA', () => {
    expect(mockJson.skills.COMBO_SKILL.id).toBe('FRAG_GRENADE_BETA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Wolven Fury)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Wolven Fury)', () => {
  test('D1: Ultimate energy cost is 76.5', () => {
    const effects = mockJson.skills.ULTIMATE.effects;
    const energyCost = effects.find(
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.withPreposition.cardinality.value).toBe(76.5);
  });

  test('D2: Ultimate animation is TIME_STOP (1.53s within 2.5s)', () => {
    const ultimate = mockJson.skills.ULTIMATE;
    expect(ultimate.properties.duration.value).toBe(2.5);
    expect(ultimate.properties.animation.duration.value).toBe(1.53);
    expect(ultimate.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('D3: Ultimate has 5 damage frames', () => {
    expect(mockJson.skills.ULTIMATE.frames.length).toBe(5);
  });

  test('D4: Ultimate skill ID is WOLVEN_FURY', () => {
    expect(mockJson.skills.ULTIMATE.id).toBe('WOLVEN_FURY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Empowered Battle Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Empowered Battle Skill', () => {
  test('E1: Empowered battle skill exists with 4 frames', () => {
    const ebs = mockJson.skills.EMPOWERED_BATTLE_SKILL;
    expect(ebs).toBeDefined();
    expect(ebs.frames.length).toBe(4);
  });

  test('E2: Duration is 2.07 seconds', () => {
    expect(mockJson.skills.EMPOWERED_BATTLE_SKILL.properties.duration.value).toBe(2.07);
  });

  test('E3: Frame offsets at 0.2s, 0.53s, 0.767s, 2.07s', () => {
    const frames = mockJson.skills.EMPOWERED_BATTLE_SKILL.frames;
    expect(frames[0].properties.offset.value).toBe(0.2);
    expect(frames[1].properties.offset.value).toBe(0.53);
    expect(frames[2].properties.offset.value).toBe(0.767);
    expect(frames[3].properties.offset.value).toBe(2.07);
  });

  test('E4: Frame 4 recovers 20 SP and 5 Stagger', () => {
    const frame3 = mockJson.skills.EMPOWERED_BATTLE_SKILL.frames[3];
    const sp = frame3.effects.find(
      (e: any) => e.objectType === 'SKILL_POINT'
    );
    const stagger = frame3.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(sp.withPreposition.cardinality.value).toBe(20);
    expect(stagger.withPreposition.value.value).toBe(5);
  });

  test('E5: Frame 3 recovers 5 Stagger', () => {
    const frame2 = mockJson.skills.EMPOWERED_BATTLE_SKILL.frames[2];
    const stagger = frame2.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(stagger.withPreposition.value.value).toBe(5);
  });

  test('E6: Frames 1 and 2 have SP and Stagger effects with value 0', () => {
    for (let i = 0; i < 2; i++) {
      const frame = mockJson.skills.EMPOWERED_BATTLE_SKILL.frames[i];
      const sp = frame.effects.find(
        (e: any) => e.objectType === 'SKILL_POINT'
      );
      const stagger = frame.effects.find(
        (e: any) => e.objectType === 'STAGGER'
      );
      expect(sp).toBeDefined();
      expect(sp.withPreposition.cardinality.value).toBe(0);
      expect(stagger).toBeDefined();
      expect(stagger.withPreposition.value.value).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group F: Scorching Fangs (Talent 1 — Status Event)
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Scorching Fangs (Status Event)', () => {
  test('F1: Scorching Fangs status event exists', () => {
    const statusEvents = mockJson.statusEvents;
    expect(statusEvents).toBeDefined();
    expect(statusEvents.length).toBe(1);
    expect(statusEvents[0].name).toBe('SCORCHING_FANGS');
  });

  test('F2: Target is THIS OPERATOR (self-buff)', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.targetDeterminer).toBe('THIS');
    expect(sf.target).toBe('OPERATOR');
  });

  test('F3: Element is HEAT', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.element).toBe('HEAT');
  });

  test('F4: Max 1 stack with RESET interaction', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.stack.instances).toBe(1);
    expect(sf.stack.verbType).toBe('RESET');
    for (let p = 0; p <= 5; p++) {
      expect(sf.stack.max[`P${p}`]).toBe(1);
    }
  });

  test('F5: Two trigger clauses (OR): Combustion on enemy OR self Battle Skill + already active', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.triggerClause.length).toBe(2);

    // Clause 1: enemy has Combustion
    const clause1 = sf.triggerClause[0];
    expect(clause1.conditions.length).toBe(1);
    expect(clause1.conditions[0].subjectType).toBe('ENEMY');
    expect(clause1.conditions[0].verbType).toBe('HAVE');
    expect(clause1.conditions[0].objectType).toBe('STATUS');
    expect(clause1.conditions[0].objectId).toBe('COMBUSTION');

    // Clause 2: self performs Battle Skill AND self has Scorching Fangs
    const clause2 = sf.triggerClause[1];
    expect(clause2.conditions.length).toBe(2);
    expect(clause2.conditions[0].subjectDeterminer).toBe('THIS');
    expect(clause2.conditions[0].subjectType).toBe('OPERATOR');
    expect(clause2.conditions[0].verbType).toBe('PERFORM');
    expect(clause2.conditions[0].objectType).toBe('BATTLE_SKILL');
    expect(clause2.conditions[1].subjectDeterminer).toBe('THIS');
    expect(clause2.conditions[1].subjectType).toBe('OPERATOR');
    expect(clause2.conditions[1].verbType).toBe('HAVE');
    expect(clause2.conditions[1].objectType).toBe('STATUS');
    expect(clause2.conditions[1].objectId).toBe('SCORCHING_FANGS');
  });

  test('F6: Duration is 15 seconds', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.properties.duration.value).toEqual([15]);
    expect(sf.properties.duration.unit).toBe('SECOND');
  });

  test('F7: P3 team share with 0.5× duration multiplier', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.p3TeamShare).toBeDefined();
    expect(sf.p3TeamShare.durationMultiplier).toBe(0.5);
  });

  test('F8: Is a named event', () => {
    const sf = mockJson.statusEvents[0];
    expect(sf.isNamedEvent).toBe(true);
    expect(sf.isForceApplied).toBe(false);
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
      (e: any) => e.statModifier?.statType === 'STRENGTH'
    );
    expect(strEffect).toBeDefined();
    expect(strEffect.statModifier.value).toBe(15);

    const agiEffect = p1.effects.find(
      (e: any) => e.statModifier?.statType === 'AGILITY'
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
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_skillpower'
    );
    expect(spEffect).toBeDefined();
    expect(spEffect.skillParameterModifier.skillType).toBe('THERMITE_TRACERS');
    expect(spEffect.skillParameterModifier.value).toBe(10);
    expect(spEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const p2Effect = p2.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_2'
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
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_3'
    );
    expect(p3Effect).toBeDefined();
    expect(p3Effect.skillParameterModifier.value).toBe(1);
    expect(p3Effect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const teamEffect = p3.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'teammate_percent'
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
    expect(mockJson.operatorType).toBe('WULFGARD');
    expect(mockJson.name).toBe('Wulfgard');
  });

  test('H2: 5-star Caster, Heat element, Handcannon weapon', () => {
    expect(mockJson.operatorRarity).toBe(5);
    expect(mockJson.operatorClassType).toBe('CASTER');
    expect(mockJson.elementType).toBe('HEAT');
    expect(mockJson.weaponType).toBe('HANDCANNON');
  });

  test('H3: Main attribute STRENGTH, secondary AGILITY', () => {
    expect(mockJson.mainAttributeType).toBe('STRENGTH');
    expect(mockJson.secondaryAttributeType).toBe('AGILITY');
  });

  test('H4: Talent names and max levels', () => {
    expect(mockJson.talents.one.name).toBe('Scorching Fangs');
    expect(mockJson.talents.one.maxLevel).toBe(2);
    expect(mockJson.talents.two.name).toBe('Code of Restraint');
    expect(mockJson.talents.two.maxLevel).toBe(2);
    expect(mockJson.talents.attributeIncrease.name).toBe('Forged');
    expect(mockJson.talents.attributeIncrease.attribute).toBe('STRENGTH');
    expect(mockJson.talents.attributeIncrease.maxLevel).toBe(4);
  });

  test('H5: Level table has entries from 1 to 99+', () => {
    const levels = mockJson.allLevels;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
  });

  test('H6: Basic attack default duration is 0.1667 seconds', () => {
    expect(mockJson.basicAttackDefaultDuration).toBe(0.1667);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group I: Status & Infliction Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Status & Infliction Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  /** Create a battle skill event with Heat infliction on frame 3 (0.767s). */
  function battleSkillWithFrames(startFrame: number): TimelineEvent {
    return {
      id: `bs-${startFrame}`, name: 'THERMITE_TRACERS', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.BATTLE, startFrame,
      activationDuration: Math.round(1.07 * FPS), activeDuration: 0, cooldownDuration: 0,
      segments: [{
        durationFrames: Math.round(1.07 * FPS),
        frames: [
          { offsetFrame: Math.round(0.2 * FPS) },
          { offsetFrame: Math.round(0.53 * FPS) },
          {
            offsetFrame: Math.round(0.767 * FPS),
            applyArtsInfliction: { element: 'HEAT', stacks: 1 },
          },
        ],
      }],
    };
  }

  /** Create an ultimate event with forced Combustion on the last frame. */
  function ultimateWithFrames(startFrame: number): TimelineEvent {
    return {
      id: `ult-${startFrame}`, name: 'WOLVEN_FURY', ownerId: SLOT_ID,
      columnId: SKILL_COLUMNS.ULTIMATE, startFrame,
      activationDuration: Math.round(2.5 * FPS), activeDuration: 0, cooldownDuration: 0,
      segments: [{
        durationFrames: Math.round(2.5 * FPS),
        frames: [
          { offsetFrame: Math.round(1.53 * FPS) },
          { offsetFrame: Math.round(1.73 * FPS) },
          { offsetFrame: Math.round(1.967 * FPS) },
          { offsetFrame: Math.round(1.13 * FPS) },
          {
            offsetFrame: Math.round(2.3 * FPS),
            applyForcedReaction: { reaction: 'COMBUSTION', statusLevel: 1 },
          },
        ],
      }],
    };
  }

  test('I1: Battle skill frame 3 derives Heat infliction on enemy', () => {
    const result = deriveFrameInflictions([battleSkillWithFrames(0)]);
    const inflictions = result.filter(ev => ev.columnId === INFLICTION_COLUMNS.HEAT);
    expect(inflictions.length).toBe(1);
    expect(inflictions[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(inflictions[0].startFrame).toBe(Math.round(0.767 * FPS));
    expect(inflictions[0].activationDuration).toBe(2400); // 20s
    expect(inflictions[0].sourceSkillName).toBe('THERMITE_TRACERS');
  });

  test('I2: Battle skill frames 1 and 2 do NOT produce inflictions', () => {
    const result = deriveFrameInflictions([battleSkillWithFrames(0)]);
    const inflictions = result.filter(ev => ev.ownerId === ENEMY_OWNER_ID);
    // Only 1 infliction from frame 3
    expect(inflictions.length).toBe(1);
  });

  test('I3: Ultimate last frame derives forced Combustion on enemy', () => {
    const result = deriveFrameInflictions([ultimateWithFrames(0)]);
    const reactions = result.filter(ev => ev.columnId === REACTION_COLUMNS.COMBUSTION);
    expect(reactions.length).toBe(1);
    expect(reactions[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(reactions[0].statusLevel).toBe(1);
    expect(reactions[0].sourceSkillName).toBe('WOLVEN_FURY');
    expect((reactions[0] as any).forcedReaction).toBe(true);
  });

  test('I4: Forced Combustion from ultimate does not require prior inflictions', () => {
    // No Heat/Nature/etc. inflictions exist — forced reaction still fires
    const result = deriveFrameInflictions([ultimateWithFrames(0)]);
    const combustion = result.filter(ev => ev.columnId === REACTION_COLUMNS.COMBUSTION);
    expect(combustion.length).toBe(1);
  });

  test('I5: Heat infliction from battle skill + cross-element from teammate → reaction', () => {
    // Wulfgard Heat + teammate Nature → Corrosion
    const heat: TimelineEvent = {
      id: 'h1', name: INFLICTION_COLUMNS.HEAT, ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.HEAT, startFrame: 0,
      activationDuration: 2400, activeDuration: 0, cooldownDuration: 0,
      sourceOwnerId: SLOT_ID,
    };
    const nature: TimelineEvent = {
      id: 'n1', name: INFLICTION_COLUMNS.NATURE, ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.NATURE, startFrame: FPS,
      activationDuration: 2400, activeDuration: 0, cooldownDuration: 0,
      sourceOwnerId: 'slot-1',
    };
    const result = deriveReactions([heat, nature]);
    const reactions = result.filter(ev => ev.id.endsWith('-reaction'));
    expect(reactions.length).toBe(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.CORROSION);
  });

  test('I6: Multiple battle skills produce stacking inflictions', () => {
    const events = [battleSkillWithFrames(0), battleSkillWithFrames(300), battleSkillWithFrames(600)];
    const result = deriveFrameInflictions(events);
    const inflictions = result.filter(ev => ev.columnId === INFLICTION_COLUMNS.HEAT);
    expect(inflictions.length).toBe(3);
  });

  test('I7: Combo skill frame applies Heat infliction (from JSON)', () => {
    const comboFrame = mockJson.skills.COMBO_SKILL.frames[0];
    const infliction = comboFrame.effects.find(
      (e: any) => e.verbType === 'APPLY' && e.objectType === 'INFLICTION'
    );
    expect(infliction).toBeDefined();
    expect(infliction.adjectiveType).toBe('HEAT');
  });

  test('I8: Combo triggers on Combustion — trigger clause verified', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.triggerClause[0].conditions[0].objectType).toBe('COMBUSTED');
  });

  test('I9: Scorching Fangs triggers when enemy has Combustion (trigger clause 1)', () => {
    const sf = mockJson.statusEvents[0];
    const clause1 = sf.triggerClause[0];
    expect(clause1.conditions[0].subjectType).toBe('ENEMY');
    expect(clause1.conditions[0].verbType).toBe('HAVE');
    expect(clause1.conditions[0].objectId).toBe('COMBUSTION');
  });

  test('I10: Scorching Fangs refreshes on battle skill while active (trigger clause 2)', () => {
    const sf = mockJson.statusEvents[0];
    const clause2 = sf.triggerClause[1];
    // Requires: THIS_OPERATOR PERFORM BATTLE_SKILL AND THIS_OPERATOR HAVE SCORCHING_FANGS
    expect(clause2.conditions[0].subjectDeterminer).toBe('THIS');
    expect(clause2.conditions[0].subjectType).toBe('OPERATOR');
    expect(clause2.conditions[0].verbType).toBe('PERFORM');
    expect(clause2.conditions[0].objectType).toBe('BATTLE_SKILL');
    expect(clause2.conditions[1].subjectDeterminer).toBe('THIS');
    expect(clause2.conditions[1].subjectType).toBe('OPERATOR');
    expect(clause2.conditions[1].verbType).toBe('HAVE');
    expect(clause2.conditions[1].objectId).toBe('SCORCHING_FANGS');
  });

  test('I11: Empowered battle skill does NOT apply infliction (frame data check)', () => {
    const ebsFrames = mockJson.skills.EMPOWERED_BATTLE_SKILL.frames;
    for (const frame of ebsFrames) {
      const infliction = frame.effects?.find(
        (e: any) => e.verbType === 'APPLY' && e.objectType === 'INFLICTION'
      );
      expect(infliction).toBeUndefined();
    }
  });

  test('I12: Ultimate → forced Combustion → satisfies Scorching Fangs trigger + combo trigger', () => {
    // Both Scorching Fangs (ENEMY HAVE COMBUSTION) and combo (ENEMY IS COMBUSTED)
    // are satisfied by forced Combustion from the ultimate
    const sf = mockJson.statusEvents[0];
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    // Scorching Fangs clause 1 triggers on Combustion
    expect(sf.triggerClause[0].conditions[0].objectId).toBe('COMBUSTION');
    // Combo triggers on COMBUSTED state
    expect(trigger.triggerClause[0].conditions[0].objectType).toBe('COMBUSTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group J: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
    return { name: '', ownerId: SLOT_ID, activationDuration: 0, activeDuration: 0, cooldownDuration: 0, ...overrides };
  }

  test('I1: Basic attack (Rapid Fire Akimbo) has no cooldown', () => {
    const ba = mockJson.skills.BASIC_ATTACK;
    const cooldown = ba.segments?.flatMap((s: any) => s.frames ?? [])
      .flatMap((f: any) => f.effects ?? [])
      .find((e: any) => e.objectType === 'COOLDOWN');
    expect(cooldown).toBeUndefined();
  });

  test('I2: Battle skill (Thermite Tracers) has no COOLDOWN effect', () => {
    const cooldown = mockJson.skills.BATTLE_SKILL.effects?.find(
      (e: any) => e.objectType === 'COOLDOWN'
    );
    expect(cooldown).toBeUndefined();
  });

  test('I3: Combo skill (Frag Grenade Beta) has 20s cooldown', () => {
    const cooldown = mockJson.skills.COMBO_SKILL.effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.withPreposition.cardinality.value).toBe(20);
  });

  test('I4: Combo placement during 20s cooldown is blocked', () => {
    const comboDuration = Math.round(1 * FPS); // 120 frames
    const comboCooldown = 20 * FPS; // 2400 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      id: 'cs-1', columnId: SKILL_COLUMNS.COMBO, startFrame: 0,
      activationDuration: comboDuration, cooldownDuration: comboCooldown,
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
      id: 'bs-1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 0,
      activationDuration: bsDuration, nonOverlappableRange: bsDuration,
    });
    expect(wouldOverlapSiblings(SLOT_ID, SKILL_COLUMNS.BATTLE, bsDuration, bsDuration, [bs1])).toBe(false);
  });

  test('I6: P5 Wolven Fury resets combo cooldown when cast during cooldown phase', () => {
    const comboDuration = Math.round(1 * FPS); // 120 frames
    const comboCooldown = 20 * FPS; // 2400 frames

    // Combo at frame 0, ultimate at frame 600 (during cooldown phase)
    const comboEvent = makeEvent({
      id: 'cs-1', name: 'FRAG_GRENADE_BETA', columnId: SKILL_COLUMNS.COMBO,
      startFrame: 0, activationDuration: comboDuration,
      cooldownDuration: comboCooldown,
    });
    const ultEvent = makeEvent({
      id: 'ult-1', name: 'WOLVEN_FURY', columnId: SKILL_COLUMNS.ULTIMATE,
      startFrame: 600, activationDuration: Math.round(2.5 * FPS),
      operatorPotential: 5, // P5 required
    } as any);

    const result = applyPotentialEffects([comboEvent, ultEvent]);
    const modifiedCombo = result.find(e => e.id === 'cs-1')!;

    // Cooldown should be truncated: originally ends at 120+2400=2520, now cut to ultFrame - activeEnd = 600 - 120 = 480
    expect(modifiedCombo.cooldownDuration).toBe(480);
  });

  test('I7: P5 Wolven Fury does NOT reset cooldown if potential < 5', () => {
    const comboDuration = 120;
    const comboCooldown = 2400;

    const comboEvent = makeEvent({
      id: 'cs-1', name: 'FRAG_GRENADE_BETA', columnId: SKILL_COLUMNS.COMBO,
      startFrame: 0, activationDuration: comboDuration,
      cooldownDuration: comboCooldown,
    });
    const ultEvent = makeEvent({
      id: 'ult-1', name: 'WOLVEN_FURY', columnId: SKILL_COLUMNS.ULTIMATE,
      startFrame: 600, activationDuration: 300,
      operatorPotential: 4, // Below P5 threshold
    } as any);

    const result = applyPotentialEffects([comboEvent, ultEvent]);
    const modifiedCombo = result.find(e => e.id === 'cs-1')!;

    // Cooldown should be unchanged
    expect(modifiedCombo.cooldownDuration).toBe(comboCooldown);
  });

  test('I8: P5 Wolven Fury does NOT reset cooldown if combo is still in activation phase', () => {
    const comboDuration = 120;
    const comboCooldown = 2400;

    const comboEvent = makeEvent({
      id: 'cs-1', name: 'FRAG_GRENADE_BETA', columnId: SKILL_COLUMNS.COMBO,
      startFrame: 0, activationDuration: comboDuration,
      cooldownDuration: comboCooldown,
    });
    // Ultimate fires during combo activation, not cooldown
    const ultEvent = makeEvent({
      id: 'ult-1', name: 'WOLVEN_FURY', columnId: SKILL_COLUMNS.ULTIMATE,
      startFrame: 60, // Mid-activation (before frame 120)
      activationDuration: 300,
      operatorPotential: 5,
    } as any);

    const result = applyPotentialEffects([comboEvent, ultEvent]);
    const modifiedCombo = result.find(e => e.id === 'cs-1')!;

    // Cooldown unchanged — ultimate was during activation, not cooldown
    expect(modifiedCombo.cooldownDuration).toBe(comboCooldown);
  });

  test('I9: P5 cooldown reset only applies to same-owner combo', () => {
    const comboEvent = makeEvent({
      id: 'cs-1', name: 'FRAG_GRENADE_BETA', columnId: SKILL_COLUMNS.COMBO,
      ownerId: 'slot-0', startFrame: 0, activationDuration: 120,
      cooldownDuration: 2400,
    });
    // Different owner's ultimate
    const ultEvent = makeEvent({
      id: 'ult-1', name: 'WOLVEN_FURY', columnId: SKILL_COLUMNS.ULTIMATE,
      ownerId: 'slot-1', startFrame: 600, activationDuration: 300,
      operatorPotential: 5,
    } as any);

    const result = applyPotentialEffects([comboEvent, ultEvent]);
    const modifiedCombo = result.find(e => e.id === 'cs-1')!;

    // Different owner — no reset
    expect(modifiedCombo.cooldownDuration).toBe(2400);
  });
});

}); // end Wulfgard Combat Simulation
