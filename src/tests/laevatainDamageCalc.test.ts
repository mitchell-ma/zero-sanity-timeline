/**
 * Laevatain — Damage Calculation Test
 *
 * Reference loadout: Laevatain lv90, P5, all talents/skills maxed,
 * Forgeborn Scathe lv90 (skills lv9), Tide Fall Light Armor (rank 4),
 * Hot Work Gauntlets (rank 4), Redeemer Seal ×2 (rank 4).
 * No consumable, no tactical.
 *
 * Expected per-frame damage (non-crit) on basic attack (Flaming Cinders)
 * against default enemy (Rhodagn lv90, DEF 100, Heat Resistance 1.0):
 *   Seg 1: [1952]           Seg 2: [1464, 1464]       Seg 3: [3037]
 *   Seg 4: [1573, 1573, 1573]                          Seg 5: [3254, 3254]
 */
import { StatType, EnemyTierType } from '../consts/enums';
import { aggregateLoadoutStats } from '../controller/calculation/loadoutAggregator';
import { evaluateTalentAttackBonus } from '../controller/calculation/talentBonusEngine';
import { getSkillMultiplier, getPerTickMultiplier } from '../controller/calculation/jsonMultiplierEngine';
import {
  calculateDamage,
  getDefenseMultiplier,
  getDamageBonus,
  getStaggerMultiplier,
  getFinisherMultiplier,
  getLinkMultiplier,
  getWeakenMultiplier,
  getSusceptibilityMultiplier,
  getFragilityMultiplier,
  getDmgReductionMultiplier,
  getProtectionMultiplier,
  getAmpMultiplier,
  getTotalAttack,
  getArtsHiddenMultiplier,
  getArtsIntensityMultiplier,
  getCombustionDotMultiplier,
} from '../model/calculation/damageFormulas';
import { Potential, SkillLevel } from '../consts/types';

// ── Mock operatorRegistry ────────────────────────────────────────────────────

jest.mock('../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: (id: string) => {
    if (id !== 'laevatain') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../model/game-data/operators/laevatain-operator.json');
  },
  ALL_OPERATORS: [],
}));

// ── Mock loadoutRegistry ────────────────────────────────────────────────────

jest.mock('../utils/loadoutRegistry', () => {
  const SKILL_VALUES = {
    INTELLECT_BOOST_L: { INTELLECT: [20, 30, 44, 57, 70, 87, 109, 131, 156] },
    ATTACK_BOOST_L: { ATTACK_BONUS: [0.05, 0.07, 0.10, 0.14, 0.17, 0.22, 0.28, 0.34, 0.39] },
    FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL: { HEAT_DAMAGE_BONUS: [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.364, 0.406, 0.448] },
    MAIN_ATTRIBUTE_BOOST_S: { INTELLECT: [10, 18, 26, 34, 42, 51, 59, 67, 79] },
    TARR_11_ASSAULT_ARMAMENT_PREP: { BASE_ATTACK: [12, 14.4, 16.8, 19.2, 21.6, 24, 26.4, 28.8, 33.6] },
  };

  const PASSIVE_STAT_SKILLS: Record<string, string> = {
    FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL: 'HEAT_DAMAGE_BONUS',
    TARR_11_ASSAULT_ARMAMENT_PREP: 'BASE_ATTACK',
  };

  const mockSkill = (type: string) => {
    const values = (SKILL_VALUES as any)[type] ?? {};
    const statKey = Object.keys(values)[0];
    const arr = statKey ? values[statKey] : [];
    return {
      weaponSkillType: type,
      level: 1,
      getValue() { return arr[this.level - 1] ?? 0; },
      getPassiveStats() {
        const passiveStat = PASSIVE_STAT_SKILLS[type];
        if (passiveStat) return { [passiveStat]: arr[this.level - 1] ?? 0 };
        return {};
      },
    };
  };

  const gearFactory = (defense: number, gearSetType: string, allLevels: Record<string, Record<string, number>>) => () => ({
    defense,
    gearSetType,
    rank: 4,
    getStatsPerLine(_lineRanks: Record<string, number>) {
      const stats = { ...(allLevels['4'] ?? allLevels['1'] ?? {}) };
      if (defense > 0) stats.BASE_DEFENSE = defense;
      return stats;
    },
  });

  return {
    WEAPONS: [{
      name: 'Forgeborn Scathe',
      weaponType: 'SWORD',
      rarity: 6,
      create: () => ({
        level: 90,
        getBaseAttack: () => 510,
        weaponSkillOne: mockSkill('INTELLECT_BOOST_L'),
        weaponSkillTwo: mockSkill('ATTACK_BOOST_L'),
        weaponSkillThree: mockSkill('FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL'),
        getPassiveStats: () => ({}),
      }),
    }, {
      name: 'Tarr 11',
      weaponType: 'SWORD',
      rarity: 3,
      create: () => ({
        level: 1,
        getBaseAttack() { return [29, 31, 34, 37, 40, 43, 46, 49, 51, 54, 57, 60, 63, 66, 69, 71, 74, 77, 80, 83, 86, 89, 91, 94, 97, 100, 103, 106, 109, 111, 114, 117, 120, 123, 126, 129, 132, 134, 137, 140, 143, 146, 149, 152, 154, 157, 160, 163, 166, 169, 172, 174, 177, 180, 183, 186, 189, 192, 194, 197, 200, 203, 206, 209, 212, 214, 217, 220, 223, 226, 229, 232, 234, 237, 240, 243, 246, 249, 252, 254, 257, 260, 263, 266, 269, 272, 274, 277, 280, 283][this.level - 1] ?? 29; },
        weaponSkillOne: mockSkill('MAIN_ATTRIBUTE_BOOST_S'),
        weaponSkillTwo: mockSkill('TARR_11_ASSAULT_ARMAMENT_PREP'),
        weaponSkillThree: null,
        getPassiveStats: () => ({}),
      }),
    }],
    ARMORS: [{
      name: 'Tide Fall Light Armor',
      rarity: 5,
      gearSetType: 'TIDE_SURGE',
      create: gearFactory(56, 'TIDE_SURGE', { '4': { INTELLECT: 113, STRENGTH: 75, ULTIMATE_GAIN_EFFICIENCY: 0.16 } }),
    }],
    GLOVES: [{
      name: 'Hot Work Gauntlets',
      rarity: 5,
      gearSetType: 'HOT_WORK',
      create: gearFactory(42, 'HOT_WORK', { '4': { INTELLECT: 84, STRENGTH: 55, HEAT_DAMAGE_BONUS: 0.249, NATURE_DAMAGE_BONUS: 0.249 } }),
    }],
    KITS: [{
      name: 'Redeemer Seal',
      rarity: 5,
      gearSetType: 'NONE',
      create: gearFactory(21, 'NONE', { '4': { INTELLECT: 55, ULTIMATE_GAIN_EFFICIENCY: 0.334 } }),
    }],
    CONSUMABLES: [],
    TACTICALS: [],
  };
});

// ── Mock operatorJsonLoader ────────────────────────────────────────────────

jest.mock('../model/event-frames/operatorJsonLoader', () => {
  const actual = jest.requireActual('../model/event-frames/dataDrivenEventFrames');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockOperatorJson = require('../model/game-data/operators/laevatain-operator.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSkillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
  const { statusEvents: skStatusEvents, ...skillCategories } = mockSkillsJson;
  const mockJson = { ...mockOperatorJson, skills: skillCategories, ...(skStatusEvents ? { statusEvents: skStatusEvents } : {}) };
  const json: Record<string, any> = { laevatain: mockJson };

  const sequenceCache = new Map<string, any>();

  return {
    getOperatorJson: (id: string) => json[id],
    getAllOperatorIds: () => Object.keys(json),
    getSkillIds: (operatorId: string) => {
      const opJson = json[operatorId];
      if (!opJson?.skills) return new Set<string>();
      const ids = new Set<string>(['FINISHER', 'DIVE']);
      for (const key of Object.keys(opJson.skills)) {
        if (key !== 'statusEvents' && key !== 'skillTypeMap') ids.add(key);
      }
      return ids;
    },
    getSkillTypeMap: (operatorId: string) => json[operatorId]?.skillTypeMap ?? {},
    resolveSkillType: () => null,
    getFrameSequences: (operatorId: string, skillId: string) => {
      if (sequenceCache.has(`${operatorId}:${skillId}`)) return sequenceCache.get(`${operatorId}:${skillId}`);
      const opJson = json[operatorId];
      if (!opJson?.skills?.[skillId]) return [];
      const sequences = actual.buildSequences?.(opJson.skills[skillId]) ?? [];
      sequenceCache.set(`${operatorId}:${skillId}`, sequences);
      return sequences;
    },
    getSegmentLabels: () => undefined,
    getSkillTimings: () => undefined,
    getUltimateEnergyCost: () => 0,
    getSkillGaugeGains: () => undefined,
    getBattleSkillSpCost: () => undefined,
    getSkillCategoryData: () => undefined,
    getBasicAttackDurations: () => undefined,
  };
});

// ── Mock weaponGameData ────────────────────────────────────────────────────

jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: (skillType: string, statKey: string) => {
    if (skillType === 'INTELLECT_BOOST_L' && statKey === 'INTELLECT')
      return [20, 30, 44, 57, 70, 87, 109, 131, 156];
    if (skillType === 'ATTACK_BOOST_L' && statKey === 'ATTACK_BONUS')
      return [0.05, 0.07, 0.10, 0.14, 0.17, 0.22, 0.28, 0.34, 0.39];
    if (skillType === 'FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL' && statKey === 'HEAT_DAMAGE_BONUS')
      return [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.364, 0.406, 0.448];
    return [];
  },
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 510,
}));

// ── Mock InformationPane (view) ─────────────────────────────────────────────

jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_STATS: {
    operatorLevel: 90, potential: 5,
    talentOneLevel: 3, talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12,
    weaponLevel: 90, weaponSkill1Level: 9, weaponSkill2Level: 9, weaponSkill3Level: 9,
    armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {},
  },
  LoadoutStats: {},
}));

// ── Test ──────────────────────────────────────────────────────────────────────

describe('Laevatain damage calculation — Flaming Cinders (basic attack)', () => {
  const OPERATOR_ID = 'laevatain';
  const SKILL_LEVEL = 12 as SkillLevel;
  const POTENTIAL = 5 as Potential;

  const loadout = {
    weaponName: 'Forgeborn Scathe',
    armorName: 'Tide Fall Light Armor',
    glovesName: 'Hot Work Gauntlets',
    kit1Name: 'Redeemer Seal',
    kit2Name: 'Redeemer Seal',
    consumableName: null,
    tacticalName: null,
  };

  const loadoutStats = {
    operatorLevel: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
    weaponLevel: 90,
    weaponSkill1Level: 9,
    weaponSkill2Level: 9,
    weaponSkill3Level: 9,
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  };

  // Expected per-frame damage for each segment (non-crit, vs Rhodagn DEF 100)
  // Segment label → [frame1, frame2, ...]
  const EXPECTED: [string, number, number[]][] = [
    // [segmentLabel, maxFrames, expectedDamagePerFrame]
    ['1', 1, [1952]],
    ['2', 2, [1464, 1464]],
    ['3', 1, [3037]],
    ['4', 3, [1573, 1573, 1573]],
    ['5', 2, [3254, 3254]],
  ];

  // Shared calc context — computed once
  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as any, loadoutStats);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
      talentOneLevel: loadoutStats.talentOneLevel,
      talentTwoLevel: loadoutStats.talentTwoLevel,
      potential: POTENTIAL,
      stats: agg.stats,
    });

    totalAttack = getTotalAttack(
      agg.operatorBaseAttack,
      agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
      agg.flatAttackBonuses,
    );
    attributeBonus = agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      agg.stats[StatType.HEAT_DAMAGE_BONUS],
      agg.stats[StatType.BASIC_ATTACK_DAMAGE_BONUS],
      agg.stats[StatType.SKILL_DAMAGE_BONUS],
      agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100); // Rhodagn DEF
  });

  // Flatten to individual frame cases for test.each
  const cases = EXPECTED.flatMap(([segLabel, maxFrames, frames]) =>
    frames.map((expected, fi) => ({
      label: `segment ${segLabel} frame ${fi + 1} → ${expected}`,
      segLabel, maxFrames, expected,
    })),
  );

  test.each(cases)('$label', ({ segLabel, maxFrames, expected }) => {
    const segMult = getSkillMultiplier(OPERATOR_ID, 'FLAMING_CINDERS', segLabel, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    // damageTableBuilder divides segment total by maxFrames for uniform distribution
    const perFrameMult = segMult! / maxFrames;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perFrameMult,
      attributeBonus,
      multiplierGroup,
      critMultiplier: 1, // non-crit
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0, // no heat resistance
    });

    expect(Math.round(damage)).toBe(expected);
  });
});
describe('Laevatain damage calculation — Smouldering Fire (battle skill)', () => {
  const OPERATOR_ID = 'laevatain';
  const SKILL_LEVEL = 12 as SkillLevel;
  const POTENTIAL = 5 as Potential;

  const loadout = {
    weaponName: 'Forgeborn Scathe',
    armorName: 'Tide Fall Light Armor',
    glovesName: 'Hot Work Gauntlets',
    kit1Name: 'Redeemer Seal',
    kit2Name: 'Redeemer Seal',
    consumableName: null,
    tacticalName: null,
  };

  const loadoutStats = {
    operatorLevel: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
    weaponLevel: 90,
    weaponSkill1Level: 9,
    weaponSkill2Level: 9,
    weaponSkill3Level: 9,
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  };

  // Expected per-tick damage (non-crit, P5, vs Rhodagn DEF 100)
  // Ramping: base 1.4 + 0.14 × tickIndex at level 12
  const EXPECTED_PER_TICK = [
    6976, 7674, 8371, 9069, 9766, 10464, 11162, 11859, 12557, 13254, 13952,
  ];

  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as any, loadoutStats);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
      talentOneLevel: loadoutStats.talentOneLevel,
      talentTwoLevel: loadoutStats.talentTwoLevel,
      potential: POTENTIAL,
      stats: agg.stats,
    });

    totalAttack = getTotalAttack(
      agg.operatorBaseAttack,
      agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
      agg.flatAttackBonuses,
    );
    attributeBonus = agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      agg.stats[StatType.HEAT_DAMAGE_BONUS],
      agg.stats[StatType.BATTLE_SKILL_DAMAGE_BONUS] ?? 0,
      agg.stats[StatType.SKILL_DAMAGE_BONUS],
      agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  const cases = EXPECTED_PER_TICK.map((expected, tickIndex) => ({
    label: `tick ${tickIndex} → ${expected}`,
    tickIndex,
    expected,
  }));

  test.each(cases)('$label', ({ tickIndex, expected }) => {
    const perTickMult = getPerTickMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, tickIndex);
    expect(perTickMult).not.toBeNull();

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perTickMult!,
      attributeBonus,
      multiplierGroup,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
    });

    // ±1 tolerance for floating point precision differences with game engine
    expect(Math.abs(Math.round(damage) - expected)).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Combo Skill — Seethe (single hit)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Laevatain damage calculation — Seethe (combo skill)', () => {
  const OPERATOR_ID = 'laevatain';
  const SKILL_LEVEL = 12 as SkillLevel;
  const POTENTIAL = 5 as Potential;

  const loadout = {
    weaponName: 'Forgeborn Scathe',
    armorName: 'Tide Fall Light Armor',
    glovesName: 'Hot Work Gauntlets',
    kit1Name: 'Redeemer Seal',
    kit2Name: 'Redeemer Seal',
    consumableName: null,
    tacticalName: null,
  };

  const loadoutStats = {
    operatorLevel: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
    weaponLevel: 90,
    weaponSkill1Level: 9,
    weaponSkill2Level: 9,
    weaponSkill3Level: 9,
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  };

  it('combo skill hit → 26908', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as any, loadoutStats);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
      talentOneLevel: loadoutStats.talentOneLevel,
      talentTwoLevel: loadoutStats.talentTwoLevel,
      potential: POTENTIAL,
      stats: agg.stats,
    });

    const totalAttack = getTotalAttack(
      agg.operatorBaseAttack,
      agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
      agg.flatAttackBonuses,
    );

    // Seethe: single hit, DAMAGE_MULTIPLIER = 5.4 at lv12, no potential modifier
    const segMult = getSkillMultiplier(OPERATOR_ID, 'SEETHE', undefined, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const multiplierGroup = getDamageBonus(
      agg.stats[StatType.HEAT_DAMAGE_BONUS],
      agg.stats[StatType.COMBO_SKILL_DAMAGE_BONUS] ?? 0,
      agg.stats[StatType.SKILL_DAMAGE_BONUS],
      agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: segMult!,
      attributeBonus: agg.attributeBonus,
      multiplierGroup,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier: getDefenseMultiplier(100),
      resistanceMultiplier: 1.0,
    });

    // ±3 tolerance — same effective ATK precision gap as other skills
    expect(Math.abs(Math.round(damage) - 26908)).toBeLessThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Enhanced Basic Attack — Flaming Cinders (during ultimate, full loadout)
// Twilight Blazing Wail adds +2.1 BASIC_ATTACK_DAMAGE_BONUS during ultimate.
// P4 Proof of Existence ×1.2 special multiplier on FLAMING_CINDERS_ENHANCED.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Laevatain damage calculation — Enhanced basic attack (during ultimate, full loadout)', () => {
  const OPERATOR_ID = 'laevatain';
  const SKILL_LEVEL = 12 as SkillLevel;
  const POTENTIAL = 5 as Potential;

  const loadout = {
    weaponName: 'Forgeborn Scathe',
    armorName: 'Tide Fall Light Armor',
    glovesName: 'Hot Work Gauntlets',
    kit1Name: 'Redeemer Seal',
    kit2Name: 'Redeemer Seal',
    consumableName: null,
    tacticalName: null,
  };

  const loadoutStats = {
    operatorLevel: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
    weaponLevel: 90,
    weaponSkill1Level: 9,
    weaponSkill2Level: 9,
    weaponSkill3Level: 9,
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  };

  // Enhanced basic attack: 4 segments
  // Weapon ult buff: +2.1 BASIC_ATTACK_DAMAGE_BONUS
  // P4: ×1.2 special multiplier on FLAMING_CINDERS_ENHANCED
  const EXPECTED: [string, number, number[]][] = [
    ['1', 1, [20304]],
    ['2', 2, [12655, 12655]],
    ['3', 1, [36157]],
    ['4', 2, [31707, 31707]],
  ];

  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as any, loadoutStats);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
      talentOneLevel: loadoutStats.talentOneLevel,
      talentTwoLevel: loadoutStats.talentTwoLevel,
      potential: POTENTIAL,
      stats: agg.stats,
    });

    totalAttack = getTotalAttack(
      agg.operatorBaseAttack,
      agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
      agg.flatAttackBonuses,
    );
    attributeBonus = agg.attributeBonus;
    // mg includes weapon ult buff: +2.1 BASIC_ATTACK_DAMAGE_BONUS
    multiplierGroup = getDamageBonus(
      agg.stats[StatType.HEAT_DAMAGE_BONUS],
      agg.stats[StatType.BASIC_ATTACK_DAMAGE_BONUS] + 2.1, // Twilight Blazing Wail ult buff
      agg.stats[StatType.SKILL_DAMAGE_BONUS],
      agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  const cases = EXPECTED.flatMap(([segLabel, maxFrames, frames]) =>
    frames.map((expected, fi) => ({
      label: `segment ${segLabel} frame ${fi + 1} → ${expected}`,
      segLabel, maxFrames, expected,
    })),
  );

  test.each(cases)('$label', ({ segLabel, maxFrames, expected }) => {
    const segMult = getSkillMultiplier(OPERATOR_ID, 'FLAMING_CINDERS_ENHANCED', segLabel, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const perFrameMult = segMult! / maxFrames;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perFrameMult,
      attributeBonus,
      multiplierGroup,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
      // P4 Proof of Existence ×1.2 is applied by getPotentialMultiplier via getSkillMultiplier
    });

    // ±1 tolerance for effective ATK precision
    expect(Math.abs(Math.round(damage) - expected)).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bare loadout — P5 Laevatain lv90, Tarr 11 lv1 (skills 1/4), no gear
// Verifies ATK stat calculation with minimal equipment.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Laevatain damage calculation — bare loadout (Tarr 11 lv1, no gear)', () => {
  const OPERATOR_ID = 'laevatain';
  const POTENTIAL = 5 as Potential;

  const loadout = {
    weaponName: 'Tarr 11',
    armorName: null,
    glovesName: null,
    kit1Name: null,
    kit2Name: null,
    consumableName: null,
    tacticalName: null,
  };

  const loadoutStats = {
    operatorLevel: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
    weaponLevel: 1,
    weaponSkill1Level: 1,
    weaponSkill2Level: 4,
    weaponSkill3Level: 1,
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  };

  const SKILL_LEVEL = 12 as SkillLevel;

  // Expected per-frame damage (non-crit, vs Rhodagn DEF 100)
  const EXPECTED: [string, number, number[]][] = [
    ['1', 1, [195]],
    ['2', 2, [147, 147]],
    ['3', 1, [304]],
    ['4', 3, [157, 157, 157]],
    ['5', 2, [326, 326]],
  ];

  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as any, loadoutStats);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
      talentOneLevel: loadoutStats.talentOneLevel,
      talentTwoLevel: loadoutStats.talentTwoLevel,
      potential: POTENTIAL,
      stats: agg.stats,
    });

    totalAttack = getTotalAttack(
      agg.operatorBaseAttack,
      agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
      agg.flatAttackBonuses,
    );
    attributeBonus = agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      agg.stats[StatType.HEAT_DAMAGE_BONUS],
      agg.stats[StatType.BASIC_ATTACK_DAMAGE_BONUS],
      agg.stats[StatType.SKILL_DAMAGE_BONUS],
      agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  it('effective ATK should be 943', () => {
    const effectiveATK = Math.floor(totalAttack * attributeBonus);
    expect(effectiveATK).toBe(943);
  });

  const cases = EXPECTED.flatMap(([segLabel, maxFrames, frames]) =>
    frames.map((expected, fi) => ({
      label: `segment ${segLabel} frame ${fi + 1} → ${expected}`,
      segLabel, maxFrames, expected,
    })),
  );

  test.each(cases)('$label', ({ segLabel, maxFrames, expected }) => {
    const segMult = getSkillMultiplier(OPERATOR_ID, 'FLAMING_CINDERS', segLabel, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const perFrameMult = segMult! / maxFrames;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perFrameMult,
      attributeBonus,
      multiplierGroup,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
    });

    expect(Math.round(damage)).toBe(expected);
  });

  // Battle skill (Smouldering Fire) — ramping per-tick damage
  const EXPECTED_BS = [661, 727, 793, 859, 925, 991, 1057, 1123, 1189, 1255, 1321];

  const bsCases = EXPECTED_BS.map((expected, tickIndex) => ({
    label: `battle skill tick ${tickIndex} → ${expected}`,
    tickIndex,
    expected,
  }));

  test.each(bsCases)('$label', ({ tickIndex, expected }) => {
    const perTickMult = getPerTickMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, tickIndex);
    expect(perTickMult).not.toBeNull();

    const bsMultiplierGroup = getDamageBonus(0, 0, 0, 0); // no heat bonus, no gear

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perTickMult!,
      attributeBonus,
      multiplierGroup: bsMultiplierGroup,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
    });

    expect(Math.round(damage)).toBe(expected);
  });

  it('combo skill (Seethe) → 2548', () => {
    const segMult = getSkillMultiplier(OPERATOR_ID, 'SEETHE', undefined, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const comboMg = getDamageBonus(0, 0, 0, 0); // no gear, no heat bonus

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: segMult!,
      attributeBonus,
      multiplierGroup: comboMg,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
    });

    expect(Math.round(damage)).toBe(2548);
  });

  it('empowered additional hit → 5450', () => {
    // atk_scale_3 = 7.7 at lv12 × P2 EXTRA_SCALING ×1.5 = 11.55
    const mult = 7.7 * 1.5;
    const bsMg = getDamageBonus(0, 0, 0, 0); // no gear, no heat bonus

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: mult,
      attributeBonus,
      multiplierGroup: bsMg,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
    });

    expect(Math.round(damage)).toBe(5450);
  });

  it('forced combustion DOT tick → 247', () => {
    // Forced combustion: SL1, DOT mult = 0.12 + 0.12 × 1 = 0.24
    // StatusDamage = Attack × dotMult × ArtsIntensityMult × HiddenMult
    //              × AttributeBonus × MultiplierGroup × DefMult × ResMult × P2Mult
    // P2 COMBUSTION reaction multiplier = ×1.5
    const dotMult = getCombustionDotMultiplier(1);
    const hiddenMult = getArtsHiddenMultiplier(90);
    const artsIntMult = getArtsIntensityMultiplier(0);
    const bsMg = getDamageBonus(0, 0, 0, 0); // no gear
    const p2ReactionMult = 1.5;

    const dmg = totalAttack * dotMult * artsIntMult * hiddenMult
      * attributeBonus * bsMg * defenseMultiplier * 1.0 * p2ReactionMult;

    expect(Math.round(dmg)).toBe(247);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full loadout — Empowered Battle Skill Additional Hit + Forced Combustion DOT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Laevatain damage calculation — Empowered additional hit + combustion (full loadout)', () => {
  const OPERATOR_ID = 'laevatain';
  const POTENTIAL = 5 as Potential;

  const loadout = {
    weaponName: 'Forgeborn Scathe',
    armorName: 'Tide Fall Light Armor',
    glovesName: 'Hot Work Gauntlets',
    kit1Name: 'Redeemer Seal',
    kit2Name: 'Redeemer Seal',
    consumableName: null,
    tacticalName: null,
  };

  const loadoutStats = {
    operatorLevel: 90,
    potential: 5,
    talentOneLevel: 3,
    talentTwoLevel: 3,
    attributeIncreaseLevel: 4,
    basicAttackLevel: 12,
    battleSkillLevel: 12,
    comboSkillLevel: 12,
    ultimateLevel: 12,
    weaponLevel: 90,
    weaponSkill1Level: 9,
    weaponSkill2Level: 9,
    weaponSkill3Level: 9,
    armorRanks: {},
    glovesRanks: {},
    kit1Ranks: {},
    kit2Ranks: {},
  };

  let totalAttack: number;
  let attributeBonus: number;
  let heatMg: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as any, loadoutStats);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
      talentOneLevel: loadoutStats.talentOneLevel,
      talentTwoLevel: loadoutStats.talentTwoLevel,
      potential: POTENTIAL,
      stats: agg.stats,
    });

    totalAttack = getTotalAttack(
      agg.operatorBaseAttack,
      agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
      agg.flatAttackBonuses,
    );
    attributeBonus = agg.attributeBonus;
    heatMg = getDamageBonus(
      agg.stats[StatType.HEAT_DAMAGE_BONUS],
      0, // no skill-type bonus for the additional hit
      agg.stats[StatType.SKILL_DAMAGE_BONUS],
      agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  it('empowered additional hit → 57203', () => {
    // atk_scale_3 = 7.7 at lv12 × P2 EXTRA_SCALING ×1.5 = 11.55
    const mult = 7.7 * 1.5;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: mult,
      attributeBonus,
      multiplierGroup: heatMg,
      critMultiplier: 1,
      ampMultiplier: getAmpMultiplier(0),
      staggerMultiplier: getStaggerMultiplier(false),
      finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
      linkMultiplier: getLinkMultiplier(0, false),
      weakenMultiplier: getWeakenMultiplier([]),
      susceptibilityMultiplier: getSusceptibilityMultiplier(0),
      fragilityMultiplier: getFragilityMultiplier(0),
      dmgReductionMultiplier: getDmgReductionMultiplier([]),
      protectionMultiplier: getProtectionMultiplier([]),
      defenseMultiplier,
      resistanceMultiplier: 1.0,
    });

    // ±1% tolerance — effective ATK precision gap scales with larger multiplier
    expect(Math.abs(Math.round(damage) - 57203) / 57203).toBeLessThan(0.01);
  });

  it('forced combustion DOT tick → 2608', () => {
    // Forced combustion: SL1, DOT mult = 0.24
    // Includes attributeBonus, multiplierGroup (heat), hiddenMult, P2 ×1.5
    const dotMult = getCombustionDotMultiplier(1);
    const hiddenMult = getArtsHiddenMultiplier(90);
    const artsIntMult = getArtsIntensityMultiplier(0);
    const p2ReactionMult = 1.5;

    const dmg = totalAttack * dotMult * artsIntMult * hiddenMult
      * attributeBonus * heatMg * defenseMultiplier * 1.0 * p2ReactionMult;

    expect(Math.round(dmg)).toBe(2608);
  });
});
