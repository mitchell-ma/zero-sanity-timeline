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
 *    - Trigger: enemy is Corroded (single clause)
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
import { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence } from '../model/event-frames/dataDrivenEventFrames';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockOperatorJson = require('../model/game-data/operators/ardelia-operator.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockSkillsJson = require('../model/game-data/operator-skills/ardelia-skills.json');

const mockJson = { ...mockOperatorJson, skills: mockSkillsJson };

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
    expect(staggerEffect.withPreposition.cardinality.value).toBe(18);
  });

  test('A4: Earlier segments recover 0 SP', () => {
    const rawSegments = mockJson.skills.BASIC_ATTACK.segments;
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
      (e: any) => e.objectType === 'SKILL_POINT' && e.verbType === 'EXPEND'
    );
    expect(spCost).toBeDefined();
    expect(spCost.withPreposition.cardinality.value).toBe(100);
  });

  test('B3: Battle skill recovers 6.5 ultimate energy to self and 6.5 to all', () => {
    const battleSkill = mockJson.skills.BATTLE_SKILL;
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
  test('C1: Combo trigger requires enemy is Corroded (single clause)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.triggerClause.length).toBe(1);
    expect(trigger.triggerClause[0].conditions[0].subjectType).toBe('ENEMY');
    expect(trigger.triggerClause[0].conditions[0].verbType).toBe('IS');
    expect(trigger.triggerClause[0].conditions[0].objectType).toBe('CORRODED');
  });

  test('C2: Combo activation window is 720 frames (6 seconds)', () => {
    const trigger = mockJson.skills.COMBO_SKILL.properties.trigger;
    expect(trigger.windowFrames).toBe(720);
  });

  test('C3: Combo cooldown is 18 seconds', () => {
    const effects = mockJson.skills.COMBO_SKILL.effects;
    const cooldown = effects.find(
      (e: any) => e.objectType === 'COOLDOWN' && e.verbType === 'EXPEND'
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
    expect(reaction.adjective).toEqual(['FORCED', 'CORROSION']);
    expect(reaction.toObjectType).toBe('ENEMY');
    expect(reaction.withPreposition.stacks.value).toBe(1);
    expect(reaction.withPreposition.duration.value).toBe(10);
  });

  test('C6: Combo frame 2 recovers 10 stagger', () => {
    const frame1 = mockJson.skills.COMBO_SKILL.frames[1];
    const stagger = frame1.effects.find(
      (e: any) => e.objectType === 'STAGGER'
    );
    expect(stagger.withPreposition.cardinality.value).toBe(10);
  });

  test('C7: Combo animation override is TIME_STOP (0.729s)', () => {
    const override = mockJson.skillOverrides?.COMBO_SKILL;
    expect(override).toBeDefined();
    expect(override.properties.animation.duration.value).toBe(0.729);
    expect(override.properties.animation.timeInteractionType).toBe('TIME_STOP');
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
    expect(energy.toObjectType).toBe('THIS_OPERATOR');
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
      (e: any) => e.objectType === 'ULTIMATE_ENERGY' && e.verbType === 'EXPEND'
    );
    expect(energyCost).toBeDefined();
    expect(energyCost.withPreposition.cardinality.value).toBe(90);
  });

  test('D2: Ultimate active duration is 3 seconds', () => {
    expect(mockJson.ultimateActiveDuration).toBe(3);
  });

  test('D3: Ultimate override animation is TIME_STOP (2.5s within 6.97s)', () => {
    const override = mockJson.skillOverrides?.ULTIMATE;
    expect(override).toBeDefined();
    expect(override.properties.duration.value).toBe(6.97);
    expect(override.properties.animation.duration.value).toBe(2.5);
    expect(override.properties.animation.timeInteractionType).toBe('TIME_STOP');
  });

  test('D4: Ultimate has 3 damage frames', () => {
    // The override replaces the frames
    const override = mockJson.skillOverrides?.ULTIMATE;
    expect(override.frames.length).toBe(10);
    // But the base skills JSON also has frames
    const baseUlt = mockJson.skills.ULTIMATE;
    expect(baseUlt.frames.length).toBe(3);
  });

  test('D5: Ultimate skill ID is WOOLY_PARTY', () => {
    expect(mockJson.skills.ULTIMATE.id).toBe('WOOLY_PARTY');
  });

  test('D6: Ultimate frame 1 damage multiplier: 0.73 (lv1)', () => {
    const baseFrames = mockJson.skills.ULTIMATE.frames;
    expect(baseFrames[0].multipliers[0].DAMAGE_MULTIPLIER).toBe(0.73);
  });

  test('D7: Ultimate frame 1 has effect_prob and interval parameters', () => {
    const mults = mockJson.skills.ULTIMATE.frames[0].multipliers[0];
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

}); // end Ardelia Combat Simulation
