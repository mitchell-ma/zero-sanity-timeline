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
 *    - Final Strike (segment 4) recovers 19 SP and 17 Stagger on last frame
 *    - Earlier segments recover 0 SP
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
 *    - P1: BUFF_ATTACHMENT (Positive Feedback)
 *    - P2: +10 AGILITY, +10 INTELLECT stat modifiers
 *    - P3: UNIQUE_MULTIPLIER + 0.1 atk on Squad on Me
 *    - P4: ×0.9 SKILL_COST on Squad on Me
 *    - P5: BUFF_ATTACHMENT (Tempo of Awareness) + UNIQUE_MULTIPLIER duration on Squad on Me
 *
 * F. Operator Identity & Metadata
 *    - 4-star Vanguard, Heat element, Sword weapon
 *    - Main AGILITY, secondary INTELLECT
 *    - Talent names and levels
 *    - Level table 1–99+
 */
import { TimelineEvent } from '../consts/viewTypes';
import { SKILL_COLUMNS } from '../model/channels';

// Mock modules that use require.context (not available in Jest)
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/akekuri-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/akekuri-skills.json');

const { statusEvents: _skStatusEvents, skillTypeMap: _skTypeMap, ...akekuriSkillEntries } = mockSkillsJson as Record<string, any>;
const akekuriSkills: Record<string, any> = {};
for (const [key, val] of Object.entries(akekuriSkillEntries)) {
  akekuriSkills[key] = { ...(val as any), id: key };
}
if (_skTypeMap) {
  const variantSuffixes = ['ENHANCED', 'EMPOWERED', 'ENHANCED_EMPOWERED'];
  for (const [category, skillId] of Object.entries(_skTypeMap as Record<string, string>)) {
    if (akekuriSkills[skillId]) akekuriSkills[category] = akekuriSkills[skillId];
    for (const suffix of variantSuffixes) {
      const variantSkillId = `${skillId}_${suffix}`;
      if (akekuriSkills[variantSkillId]) akekuriSkills[`${suffix}_${category}`] = akekuriSkills[variantSkillId];
    }
  }
}
const mockJson = { ...mockOperatorJson, skills: akekuriSkills, skillTypeMap: _skTypeMap, ...(_skStatusEvents ? { statusEvents: _skStatusEvents } : {}) };

// ── Test helpers ─────────────────────────────────────────────────────────────

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
    const sequences = getSequences('BASIC_ATTACK');
    expect(sequences.length).toBe(4);
  });

  test('A2: Segment durations match JSON data', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[0].properties.duration.value).toBe(0.5);
    expect(rawSegments[1].properties.duration.value).toBe(0.767);
    expect(rawSegments[2].properties.duration.value).toBe(0.733);
    expect(rawSegments[3].properties.duration.value).toBe(1.2);
  });

  test('A3: Final Strike (segment 4, last frame) recovers 19 SP and 17 Stagger', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    const finalStrikeFrames = rawSegments[3].frames;
    // 3 frames in segment 4; last frame has the SP/Stagger recovery
    const lastFrame = finalStrikeFrames[finalStrikeFrames.length - 1];
    const spEffect = lastFrame.effects.find(
      (e: any) => e.object === 'SKILL_POINT'
    );
    const staggerEffect = lastFrame.effects.find(
      (e: any) => e.object === 'STAGGER'
    );
    expect(spEffect.with.cardinality.value).toBe(19);
    expect(staggerEffect.with.value.value).toBe(17);
  });

  test('A4: Earlier frames in segment 4 have SP effects with value 0, final frame has 19 SP', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    const frames = rawSegments[3].frames;
    for (let i = 0; i < frames.length - 1; i++) {
      const spEffect = frames[i].effects.find(
        (e: any) => e.object === 'SKILL_POINT'
      );
      expect(spEffect).toBeDefined();
      expect(spEffect.with.cardinality.value).toBe(0);
    }
    const lastFrame = frames[frames.length - 1];
    const spEffect = lastFrame.effects.find(
      (e: any) => e.object === 'SKILL_POINT'
    );
    expect(spEffect).toBeDefined();
    expect(spEffect.with.cardinality.value).toBe(19);
  });

  test('A5: First 3 segments recover 0 SP', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    for (let i = 0; i < 3; i++) {
      const frame = rawSegments[i].frames[0];
      // SP stored in multipliers, not effects
      expect(frame.multipliers[0].SKILL_POINT).toBe(0);
    }
  });

  test('A6: No infliction on any basic attack frame', () => {
    const sequences = getSequences('BASIC_ATTACK');
    for (const seq of sequences) {
      for (const frame of seq.getFrames()) {
        expect(frame.getApplyArtsInfliction()).toBeNull();
      }
    }
  });

  test('A7: Segment 2 has 2 frames (double hit)', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[1].frames.length).toBe(2);
  });

  test('A8: Segment 4 has 3 frames (triple hit)', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    expect(rawSegments[3].frames.length).toBe(3);
  });

  test('A9: Damage multipliers scale from lv1 to lv12', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
    // Segment 1: 0.2 → 0.45
    const seg1Mults = rawSegments[0].frames[0].multipliers;
    expect(seg1Mults[0].DAMAGE_MULTIPLIER).toBe(0.2);
    expect(seg1Mults[11].DAMAGE_MULTIPLIER).toBe(0.45);
    // Segment 3: 0.33 → 0.73
    const seg3Mults = rawSegments[2].frames[0].multipliers;
    expect(seg3Mults[0].DAMAGE_MULTIPLIER).toBe(0.33);
    expect(seg3Mults[11].DAMAGE_MULTIPLIER).toBe(0.73);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B: Battle Skill (Burst of Passion)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill (Burst of Passion)', () => {
  test('B1: Battle skill has single frame at 0.67s offset', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    expect(battleSkill.frames.length).toBe(1);
    expect(battleSkill.frames[0].properties.offset.value).toBe(0.67);
  });

  test('B2: Battle skill costs 100 SP', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    const spCost = battleSkill.effects.find(
      (e: any) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    expect(spCost.with.cardinality.value).toBe(100);
  });

  test('B3: Battle skill has SP cost + 6.5 ultimate energy recovery to self and all operators', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    const spCost = battleSkill.effects.find(
      (e: any) => e.object === 'SKILL_POINT' && e.verb === 'CONSUME'
    );
    expect(spCost).toBeDefined();
    const selfEnergy = battleSkill.effects.find(
      (e: any) => e.object === 'ULTIMATE_ENERGY' &&
        e.verb === 'RECOVER' && e.toDeterminer === 'THIS' && e.toObject === 'OPERATOR'
    );
    const allEnergy = battleSkill.effects.find(
      (e: any) => e.object === 'ULTIMATE_ENERGY' &&
        e.verb === 'RECOVER' && e.toDeterminer === 'ALL' && e.toObject === 'OPERATOR'
    );
    expect(selfEnergy).toBeDefined();
    expect(selfEnergy.with.cardinality.value).toBe(6.5);
    expect(allEnergy).toBeDefined();
    expect(allEnergy.with.cardinality.value).toBe(6.5);
  });

  test('B4: Battle skill stagger recovery is 10', () => {
    const sequences = getSequences('BATTLE_SKILL');
    const firstFrame = sequences[0].getFrames()[0];
    expect(firstFrame.getStagger()).toBe(10);
  });

  test('B5: Battle skill applies Heat infliction to enemy', () => {
    const battleFrame = mockJson.skills.BATTLE_SKILL.frames[0];
    const infliction = battleFrame.effects.find(
      (e: any) => e.verb === 'APPLY' && e.object === 'INFLICTION'
    );
    expect(infliction).toBeDefined();
    expect(infliction.adjective).toBe('HEAT');
    expect(infliction.toObject).toBe('ENEMY');
  });

  test('B6: Damage multiplier scales from 1.42 (lv1) to 3.2 (lv12)', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(1.42);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(3.2);
  });

  test('B7: Stagger is constant 10 across all levels', () => {
    const multipliers = mockJson.skills.BATTLE_SKILL.frames[0].multipliers;
    for (const m of multipliers) {
      expect(m.STAGGER).toBe(10);
    }
  });

  test('B8: Battle skill duration is 1.33 seconds', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
    expect(battleSkill.properties.duration.value).toBe(1.33);
    expect(battleSkill.properties.duration.unit).toBe('SECOND');
  });

  test('B9: Battle skill ID is BURST_OF_PASSION', () => {
    expect(mockJson.skills.BATTLE_SKILL.id).toBe('BURST_OF_PASSION');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C: Combo Skill (Flash and Dash)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Skill (Flash and Dash)', () => {
  test('C1: Combo trigger requires enemy Node Stagger or Full Stagger (two clauses)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.triggerClause.length).toBe(2);
    expect(trigger.triggerClause[0].conditions[0].subject).toBe('ENEMY');
    expect(trigger.triggerClause[0].conditions[0].verb).toBe('IS');
    expect(trigger.triggerClause[0].conditions[0].object).toBe('NODE_STAGGERED');
    expect(trigger.triggerClause[1].conditions[0].subject).toBe('ENEMY');
    expect(trigger.triggerClause[1].conditions[0].verb).toBe('IS');
    expect(trigger.triggerClause[1].conditions[0].object).toBe('FULL_STAGGERED');
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C3: Combo cooldown is 15 seconds', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const cooldown = effects.find(
      (e: any) => e.object === 'COOLDOWN' && e.verb === 'CONSUME'
    );
    expect(cooldown).toBeDefined();
    expect(cooldown.with.cardinality.value).toBe(15);
  });

  test('C4: Combo has 2 frames, each with 7.5 SP and 5 Stagger', () => {
    const frames = mockJson.skills.COMBO_SKILL.frames;
    expect(frames.length).toBe(2);
    for (const f of frames) {
      const sp = f.effects.find((e: any) => e.object === 'SKILL_POINT');
      const stagger = f.effects.find((e: any) => e.object === 'STAGGER');
      expect(sp.with.cardinality.value).toBe(7.5);
      expect(stagger.with.value.value).toBe(5);
    }
  });

  test('C5: Combo animation is TIME_STOP (0.488s)', () => {
    const combo = mockJson.skills.COMBO_SKILL;
    expect(combo.properties.animation).toBeDefined();
    expect(combo.properties.animation.duration.value).toBe(0.488);
    expect(combo.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('C6: Combo base duration is 1.27 seconds', () => {
    const comboSkill = mockJson.skills.COMBO_SKILL;
    expect(comboSkill.properties.duration.value).toBe(1.27);
  });

  test('C7: Combo recovers 10 ultimate energy to self', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const energy = effects.find(
      (e: any) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'RECOVER'
    );
    expect(energy).toBeDefined();
    expect(energy.toDeterminer).toBe('THIS');
    expect(energy.toObject).toBe('OPERATOR');
    expect(energy.with.cardinality.value).toBe(10);
  });

  test('C8: Combo damage multiplier: 0.8 (lv1) → 1.8 (lv12)', () => {
    const multipliers = mockJson.skills.COMBO_SKILL.frames[0].multipliers;
    expect(multipliers[0].DAMAGE_MULTIPLIER).toBe(0.8);
    expect(multipliers[11].DAMAGE_MULTIPLIER).toBe(1.8);
  });

  test('C9: Combo skill ID is FLASH_AND_DASH', () => {
    expect(mockJson.skills.COMBO_SKILL.id).toBe('FLASH_AND_DASH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D: Ultimate (Squad on Me)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate (Squad on Me)', () => {
  test('D1: Ultimate energy cost is 108', () => {
    const effects = mockJson.skills.ULTIMATE.effects;
    const energyCost = effects.find(
      (e: any) => e.object === 'ULTIMATE_ENERGY' && e.verb === 'CONSUME'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.with.cardinality.value).toBe(108);
  });

  test('D2: Ultimate active duration is 3.425 seconds', () => {
    expect(mockJson.ultimateActiveDuration).toBe(3.425);
  });

  test('D3: Ultimate animation is TIME_STOP (1.683s within 4.3s)', () => {
    const ultimate = mockJson.skills.ULTIMATE;
    expect(ultimate.properties.duration.value).toBe(4.3);
    expect(ultimate.properties.animation.duration.value).toBe(1.683);
    expect(ultimate.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('D4: Ultimate has no damage frames', () => {
    const ultimate = mockJson.skills.ULTIMATE;
    expect(ultimate.frames.length).toBe(0);
  });

  test('D5: Ultimate skill ID is SQUAD_ON_ME', () => {
    expect(mockJson.skills.ULTIMATE.id).toBe('SQUAD_ON_ME');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E: Potentials
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Potentials', () => {
  test('E1: P1 — BUFF_ATTACHMENT (Positive Feedback)', () => {
    const p1 = mockJson.potentials[0];
    expect(p1.level).toBe(1);
    expect(p1.name).toBe('Positive Feedback');
    const buff = p1.effects[0];
    expect(buff.potentialEffectType).toBe('BUFF_ATTACHMENT');
    expect(buff.buffAttachment.objectId).toBe('AKEKURI_POTENTIAL1_POSITIVE_FEEDBACK');
  });

  test('E2: P2 — +10 AGILITY and +10 INTELLECT stat modifiers', () => {
    const p2 = mockJson.potentials[1];
    expect(p2.level).toBe(2);
    expect(p2.name).toBe('Passionate Idealist');
    expect(p2.effects.length).toBe(2);

    const agiEffect = p2.effects.find(
      (e: any) => e.statModifier?.statType === 'AGILITY'
    );
    expect(agiEffect).toBeDefined();
    expect(agiEffect.statModifier.value).toBe(10);

    const intEffect = p2.effects.find(
      (e: any) => e.statModifier?.statType === 'INTELLECT'
    );
    expect(intEffect).toBeDefined();
    expect(intEffect.statModifier.value).toBe(10);
  });

  test('E3: P3 — UNIQUE_MULTIPLIER + 0.1 atk on Squad on Me', () => {
    const p3 = mockJson.potentials[2];
    expect(p3.level).toBe(3);
    expect(p3.name).toBe('Committed Team Player');
    expect(p3.effects.length).toBe(2);

    const uniqueMult = p3.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_3'
    );
    expect(uniqueMult).toBeDefined();
    expect(uniqueMult.skillParameterModifier.skillType).toBe('SQUAD_ON_ME');
    expect(uniqueMult.skillParameterModifier.value).toBe(1);
    expect(uniqueMult.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');

    const atkEffect = p3.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'atk'
    );
    expect(atkEffect).toBeDefined();
    expect(atkEffect.skillParameterModifier.value).toBe(0.1);
    expect(atkEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
  });

  test('E4: P4 — ×0.9 SKILL_COST on Squad on Me', () => {
    const p4 = mockJson.potentials[3];
    expect(p4.level).toBe(4);
    expect(p4.name).toBe('Super Perfect Status');
    const costEffect = p4.effects[0];
    expect(costEffect.potentialEffectType).toBe('SKILL_COST');
    expect(costEffect.skillCostModifier.skillType).toBe('AKEKURI_SQUAD_ON_ME');
    expect(costEffect.skillCostModifier.value).toBe(0.9);
  });

  test('E5: P5 — BUFF_ATTACHMENT + UNIQUE_MULTIPLIER duration on Squad on Me', () => {
    const p5 = mockJson.potentials[4];
    expect(p5.level).toBe(5);
    expect(p5.name).toBe('Tempo of Awareness');
    expect(p5.effects.length).toBe(2);

    const buff = p5.effects.find(
      (e: any) => e.potentialEffectType === 'BUFF_ATTACHMENT'
    );
    expect(buff).toBeDefined();
    expect(buff.buffAttachment.objectId).toBe('AKEKURI_POTENTIAL5_TEMPO_OF_AWARENESS');

    const durationEffect = p5.effects.find(
      (e: any) => e.skillParameterModifier?.parameterKey === 'potential_5_duration'
    );
    expect(durationEffect).toBeDefined();
    expect(durationEffect.skillParameterModifier.skillType).toBe('SQUAD_ON_ME');
    expect(durationEffect.skillParameterModifier.value).toBe(5);
    expect(durationEffect.skillParameterModifier.parameterModifyType).toBe('UNIQUE_MULTIPLIER');
  });

  test('E6: All 5 potential levels are present', () => {
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
    expect(mockJson.operatorType).toBe('AKEKURI');
    expect(mockJson.name).toBe('Akekuri');
  });

  test('F2: 4-star Vanguard, Heat element, Sword weapon', () => {
    expect(mockJson.operatorRarity).toBe(4);
    expect(mockJson.operatorClassType).toBe('VANGUARD');
    expect(mockJson.elementType).toBe('HEAT');
    expect(mockJson.weaponType).toBe('SWORD');
  });

  test('F3: Main attribute AGILITY, secondary INTELLECT', () => {
    expect(mockJson.mainAttributeType).toBe('AGILITY');
    expect(mockJson.secondaryAttributeType).toBe('INTELLECT');
  });

  test('F4: Talent names and max levels', () => {
    expect(mockJson.talents.one.name).toBe('Cheer of Victory');
    expect(mockJson.talents.one.maxLevel).toBe(2);
    expect(mockJson.talents.two.name).toBe('Staying in the Zone');
    expect(mockJson.talents.two.maxLevel).toBe(1);
    expect(mockJson.talents.attributeIncrease.name).toBe('Skirmisher');
    expect(mockJson.talents.attributeIncrease.attribute).toBe('AGILITY');
    expect(mockJson.talents.attributeIncrease.maxLevel).toBe(4);
  });

  test('F5: Level table has entries from 1 to 99+', () => {
    const levels = mockJson.allLevels;
    expect(levels.length).toBeGreaterThanOrEqual(99);
    expect(levels[0].level).toBe(1);
  });

  test('F6: Basic attack default duration is 0.15 seconds', () => {
    expect(mockJson.basicAttackDefaultDuration).toBe(0.15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group H: Cooldown Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Cooldown Interactions', () => {
  const FPS = 120;
  const SLOT_ID = 'slot-0';

  function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
    return {
      name: '',
      ownerId: SLOT_ID,
      activationDuration: 0,
      activeDuration: 0,
      cooldownDuration: 0,
      ...overrides,
    };
  }

  test('G1: Basic attack has no cooldown — sequential basic attacks can overlap freely', () => {
    const ba1 = makeEvent({
      id: 'ba-1',
      columnId: SKILL_COLUMNS.BASIC,
      startFrame: 0,
      activationDuration: Math.round(0.5 * FPS), // segment 1 duration
    });
    // Place second basic attack immediately after first segment
    const overlap = wouldOverlapSiblings(
      SLOT_ID, SKILL_COLUMNS.BASIC, Math.round(0.5 * FPS), 1, [ba1],
    );
    // Basic attacks have no nonOverlappableRange, so no overlap
    expect(overlap).toBe(false);
  });

  test('G2: Battle skill has no cooldown — can be used back-to-back', () => {
    const bsDuration = Math.round(1.33 * FPS); // 1.33s
    const bs1 = makeEvent({
      id: 'bs-1',
      columnId: SKILL_COLUMNS.BATTLE,
      startFrame: 0,
      activationDuration: bsDuration,
      nonOverlappableRange: bsDuration,
    });
    // Place second battle skill right after the first ends
    const overlap = wouldOverlapSiblings(
      SLOT_ID, SKILL_COLUMNS.BATTLE, bsDuration, bsDuration, [bs1],
    );
    expect(overlap).toBe(false);
  });

  test('G3: Combo skill has 15s cooldown — blocks placement during cooldown', () => {
    const comboDuration = Math.round(1.27 * FPS); // 152 frames
    const comboCooldown = 15 * FPS; // 1800 frames
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      id: 'cs-1',
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 0,
      activationDuration: comboDuration,
      cooldownDuration: comboCooldown,
      nonOverlappableRange: totalRange,
    });

    // During cooldown: should be blocked
    const midCooldown = comboDuration + Math.round(7.5 * FPS);
    expect(wouldOverlapSiblings(
      SLOT_ID, SKILL_COLUMNS.COMBO, midCooldown, 1, [cs1],
    )).toBe(true);

    // After cooldown ends: should be allowed
    expect(wouldOverlapSiblings(
      SLOT_ID, SKILL_COLUMNS.COMBO, totalRange, 1, [cs1],
    )).toBe(false);
  });

  test('G4: Combo cooldown value matches JSON (15s for Flash and Dash)', () => {
    const comboEffects = mockJson.skills.COMBO_SKILL.effects;
    const cooldown = comboEffects.find(
      (e: any) => e.object === 'COOLDOWN' && e.verb === 'CONSUME'
    );
    expect(cooldown.with.cardinality.value).toBe(15);
  });

  test('G5: Placement just before cooldown expires is still blocked', () => {
    const comboDuration = Math.round(1.27 * FPS);
    const comboCooldown = 15 * FPS;
    const totalRange = comboDuration + comboCooldown;
    const cs1 = makeEvent({
      id: 'cs-1',
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 0,
      activationDuration: comboDuration,
      cooldownDuration: comboCooldown,
      nonOverlappableRange: totalRange,
    });
    // 1 frame before cooldown ends
    expect(wouldOverlapSiblings(
      SLOT_ID, SKILL_COLUMNS.COMBO, totalRange - 1, 1, [cs1],
    )).toBe(true);
  });

  test('G6: Different owners can use combo at the same time (no cross-slot cooldown)', () => {
    const cs1 = makeEvent({
      id: 'cs-1',
      ownerId: 'slot-0',
      columnId: SKILL_COLUMNS.COMBO,
      startFrame: 0,
      activationDuration: 152,
      cooldownDuration: 1800,
      nonOverlappableRange: 1952,
    });
    // Different owner at frame 0 — no overlap
    expect(wouldOverlapSiblings(
      'slot-1', SKILL_COLUMNS.COMBO, 0, 1, [cs1],
    )).toBe(false);
  });
});

}); // end Akekuri Combat Simulation
