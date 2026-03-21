/**
 * Tests for loadout stat aggregation.
 *
 * Reference loadout: Laevatain lv90, P5, all talents/skills maxed,
 * Forgeborn Scathe lv90 (skills lv9), Tide Fall Light Armor (rank 4),
 * Hot Work Gauntlets (rank 4), Redeemer Seal x2 (rank 4).
 *
 * Expected values from in-game screenshot (2026-03-15).
 */
import { aggregateLoadoutStats } from '../controller/calculation/loadoutAggregator';
import { StatType } from '../consts/enums';
import { LoadoutProperties } from '../view/InformationPane';
import type { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';

// Mock operatorRegistry to avoid require.context for splash art assets
jest.mock('../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: (id: string) => {
    if (id !== 'laevatain') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../model/game-data/operators/laevatain-operator.json');
  },
  ALL_OPERATORS: [],
}));

// Mock loadoutRegistry to avoid require.context for asset discovery
jest.mock('../utils/loadoutRegistry', () => {
  // Weapon skill values at lv9 (from weaponGameData mock)
  const SKILL_VALUES: Record<string, Record<string, number[]>> = {
    INTELLECT_BOOST_L: { INTELLECT: [20, 30, 44, 57, 70, 87, 109, 131, 156] },
    ATTACK_BOOST_L: { ATTACK_BONUS: [0.05, 0.07, 0.10, 0.14, 0.17, 0.22, 0.28, 0.34, 0.39] },
    FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL: { HEAT_DAMAGE_BONUS: [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.364, 0.406, 0.448] },
  };

  const mockSkill = (type: string) => {
    const values = SKILL_VALUES[type] ?? {};
    const statKey = Object.keys(values)[0];
    const arr = statKey ? values[statKey] : [];
    return {
      weaponSkillType: type,
      level: 1,
      getValue() { return arr[this.level - 1] ?? 0; },
      getPassiveStats() { return {}; },
    };
  };

  const gearFactory = (defense: number, gearSetType: string, allLevels: Record<string, Record<string, number>>) => () => ({
    defense,
    gearSetType,
    rank: 4,
    getStatsPerLine(_lineRanks: Record<string, number>) {
      // Return rank-4 stats (test always uses default rank 4)
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

// Mock operatorJsonLoader to avoid require.context
jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined,
  getFrameSequences: () => [],
  getSegmentLabels: () => undefined,
  getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0,
  getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined,
  getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
  getComboTriggerClause: () => undefined,
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
}));

// Mock weaponGameData to avoid require.context
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: (skillType: string, statKey: string) => {
    // Forgeborn Scathe weapon skills
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

describe('loadoutAggregator — Laevatain maxed loadout', () => {
  const OPERATOR_ID = 'laevatain';

  const loadout = {
    weaponId: 'FORGEBORN_SCATHE',
    armorId: 'TIDE_FALL_LIGHT_ARMOR',
    glovesId: 'HOT_WORK_GAUNTLETS',
    kit1Id: 'REDEEMER_SEAL',
    kit2Id: 'REDEEMER_SEAL',
    consumableId: null,
    tacticalId: null,
  };

  const loadoutProperties: LoadoutProperties = {
    operator: { level: 90, potential: 5, talentOneLevel: 3, talentTwoLevel: 3, attributeIncreaseLevel: 4 },
    skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
    weapon: { level: 90, skill1Level: 9, skill2Level: 9, skill3Level: 9 },
    gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
  };

  it('should produce stats matching in-game values', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as OperatorLoadoutState, loadoutProperties);
    if (!agg) { throw new Error('aggregateLoadoutStats returned null'); }

    // Operator base stats use Math.floor (not Math.round)
    // Laevatain lv90: INTELLECT raw 177.985 → floor → 177
    expect(agg.operatorBaseAttack).toBe(318);

    // Weapon base ATK at lv90
    expect(agg.weaponBaseAttack).toBe(510);

    // Base ATK = operator + weapon
    expect(agg.baseAttack).toBe(828);

    // ATK bonus from ATTACK_BOOST_L lv9 = 0.39 = 39%
    expect(agg.atkBonus).toBeCloseTo(0.39, 2);

    // ATK percentage bonus = baseATK * atkBonus = 828 * 0.39 ≈ 322.92
    expect(agg.atkPercentageBonus).toBeCloseTo(322.92, 0);

    // Intellect: operator(177.985) + P2(20) + attrIncrease(60) + weaponSkill(156)
    //   + TideFall(113) + HotWork(84) + Redeemer(55) + Redeemer(55) = ~720.985
    expect(agg.stats[StatType.INTELLECT]).toBeCloseTo(720.985, 1);

    // Strength: operator(121.374) + TideFall(75) + HotWork(55) = ~251.374
    expect(agg.stats[StatType.STRENGTH]).toBeCloseTo(251.374, 1);

    // Agility: operator(99.973)
    expect(agg.stats[StatType.AGILITY]).toBeCloseTo(99.973, 1);

    // Will: operator(89.814)
    expect(agg.stats[StatType.WILL]).toBeCloseTo(89.814, 1);

    // Main attribute is INTELLECT, secondary is STRENGTH
    expect(agg.mainAttributeType).toBe(StatType.INTELLECT);
    expect(agg.secondaryAttributeType).toBe(StatType.STRENGTH);

    // Attribute bonuses: 0.005 * 720 = 3.60, 0.002 * 251 = 0.502
    expect(agg.mainAttributeBonus).toBeCloseTo(3.60, 2);
    expect(agg.secondaryAttributeBonus).toBeCloseTo(0.502, 2);

    // Total attribute bonus = 360% + 50.2% = 410.2%
    const totalAttrBonus = (agg.mainAttributeBonus + agg.secondaryAttributeBonus) * 100;
    expect(totalAttrBonus).toBeCloseTo(410.2, 0);

    // Defense = sum of gear defense: 56 + 42 + 21 + 21 = 140
    expect(agg.stats[StatType.BASE_DEFENSE]).toBe(140);

    // Effective ATK ≈ 5871 (game value, allow small rounding tolerance)
    expect(agg.effectiveAttack).toBeCloseTo(5871, -1);
  });

  it('should track stat sources correctly', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as OperatorLoadoutState, loadoutProperties);
    if (!agg) { throw new Error('aggregateLoadoutStats returned null'); }

    // Intellect should have sources from: Operator, Potential, Attr Increase, Weapon Skill, Gear (x4)
    const intSources = agg.statSources[StatType.INTELLECT];
    expect(intSources).toBeDefined();
    expect(intSources!.length).toBeGreaterThanOrEqual(4);

    const sourceNames = intSources!.map(s => s.source);
    expect(sourceNames).toContain('Operator');
    expect(sourceNames).toContain('Potential');
    expect(sourceNames).toContain('Attr Increase');
    expect(sourceNames).toContain('Weapon Skill');
    expect(sourceNames).toContain('Gear');

    // Operator intellect source preserves full precision (no rounding)
    const opSource = intSources!.find(s => s.source === 'Operator');
    expect(opSource?.value).toBeCloseTo(177.985, 2);
  });

  it('operator base stats should preserve full precision (no rounding)', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as OperatorLoadoutState, loadoutProperties);
    if (!agg) { throw new Error('aggregateLoadoutStats returned null'); }

    // INTELLECT raw from JSON: 177.98527245949924 — no rounding
    const intOperator = agg.statSources[StatType.INTELLECT]?.find(s => s.source === 'Operator');
    expect(intOperator?.value).toBeCloseTo(177.985, 2);

    // AGILITY raw: 99.97328003366295
    const agiOperator = agg.statSources[StatType.AGILITY]?.find(s => s.source === 'Operator');
    expect(agiOperator?.value).toBeCloseTo(99.973, 2);

    // WILL raw: 89.81443298969073
    const willOperator = agg.statSources[StatType.WILL]?.find(s => s.source === 'Operator');
    expect(willOperator?.value).toBeCloseTo(89.814, 2);
  });
});
