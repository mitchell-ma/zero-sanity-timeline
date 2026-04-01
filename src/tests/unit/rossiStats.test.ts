/**
 * Tests for Rossi loadout stat aggregation.
 *
 * Reference loadout: Rossi lv80, P0, Attribute Increase 1,
 * Talents 1=2, 2=2, all skills lv9,
 * Lupine Scarlet lv80 (Skill 1 lv4, Skill 2 lv3, Skill 3 lv2),
 * no gear, no consumable, no tactical.
 *
 * Expected values verified from in-app loadout panel (2026-03-31).
 *
 * ATK formula:
 *   baseAttack = operatorATK + weaponATK = 291 + 454 = 745
 *   totalAttack = baseAttack × (1 + ATK%) = 745 × 1.192 = 888.04
 *   effectiveMainAttr = floor(agility) = floor(237.3225) = 237
 *   effectiveSecAttr = floor(intellect) = floor(106.392) = 106
 *   attributeBonus = 1 + 0.005×237 + 0.002×106 = 2.397
 *   effectiveAttack = 888.04 × 2.397 ≈ 2128.63
 */
import { aggregateLoadoutStats } from '../../controller/calculation/loadoutAggregator';
import { StatType } from '../../consts/enums';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';

// Mock operatorRegistry to avoid require.context for splash art assets
jest.mock('../../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: (id: string) => {
    if (id !== 'ROSSI') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../model/game-data/operators/rossi/rossi.json');
  },
  ALL_OPERATORS: [],
}));

// Mock loadoutRegistry to avoid require.context for asset discovery
jest.mock('../../utils/loadoutRegistry', () => {
  // Weapon skill values from JSON configs
  const SKILL_VALUES: Record<string, Record<string, number[]>> = {
    AGILITY_BOOST_L: { AGILITY: [20, 36, 52, 68, 84, 100, 116, 132, 156] },
    CRITICAL_RATE_BOOST_L: { CRITICAL_RATE: [0.025, 0.045, 0.065, 0.085, 0.105, 0.125, 0.145, 0.165, 0.195] },
    FRACTURE_GNASHING_WOLVES: { ATTACK_BONUS: [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448] },
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

  return {
    WEAPONS: [{
      name: 'Lupine Scarlet',
      weaponType: 'SWORD',
      rarity: 6,
      create: () => ({
        level: 80,
        getBaseAttack: () => 454,
        weaponSkillOne: mockSkill('AGILITY_BOOST_L'),
        weaponSkillTwo: mockSkill('CRITICAL_RATE_BOOST_L'),
        weaponSkillThree: mockSkill('FRACTURE_GNASHING_WOLVES'),
        getPassiveStats: () => ({}),
      }),
    }],
    ARMORS: [],
    GLOVES: [],
    KITS: [],
    CONSUMABLES: [],
    TACTICALS: [],
  };
});

// Mock weaponGameData to avoid require.context
jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: (skillType: string, statKey: string) => {
    if (skillType === 'AGILITY_BOOST_L' && statKey === 'AGILITY')
      return [20, 36, 52, 68, 84, 100, 116, 132, 156];
    if (skillType === 'CRITICAL_RATE_BOOST_L' && statKey === 'CRITICAL_RATE')
      return [0.025, 0.045, 0.065, 0.085, 0.105, 0.125, 0.145, 0.165, 0.195];
    if (skillType === 'FRACTURE_GNASHING_WOLVES' && statKey === 'ATTACK_BONUS')
      return [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448];
    return [];
  },
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 454,
}));

describe('loadoutAggregator — Rossi lv80, Lupine Scarlet lv80', () => {
  const OPERATOR_ID = 'ROSSI';

  const loadout = {
    weaponId: 'LUPINE_SCARLET',
    armorId: null,
    glovesId: null,
    kit1Id: null,
    kit2Id: null,
    consumableId: null,
    tacticalId: null,
  };

  const loadoutProperties: LoadoutProperties = {
    operator: { level: 80, potential: 0, talentOneLevel: 2, talentTwoLevel: 2, attributeIncreaseLevel: 1 },
    skills: { basicAttackLevel: 9, battleSkillLevel: 9, comboSkillLevel: 9, ultimateLevel: 9 },
    weapon: { level: 80, skill1Level: 4, skill2Level: 3, skill3Level: 2 },
    gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
  };

  it('should produce ATK matching in-app panel values', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as OperatorLoadoutState, loadoutProperties);
    if (!agg) { throw new Error('aggregateLoadoutStats returned null'); }

    // ── Base ATK breakdown ──────────────────────────────────────────────
    // Rossi lv80 operator base ATK
    expect(agg.operatorBaseAttack).toBe(291);

    // Lupine Scarlet lv80 base ATK
    expect(agg.weaponBaseAttack).toBe(454);

    // Base ATK = operator + weapon
    expect(agg.baseAttack).toBe(745);

    // ── ATK% from weapon skill ──────────────────────────────────────────
    // Fracture: Gnashing Wolves lv2 = 0.192 ATK%
    expect(agg.atkBonus).toBeCloseTo(0.192, 3);

    // ATK percentage bonus = baseATK × ATK% = 745 × 0.192 ≈ 143.04
    expect(agg.atkPercentageBonus).toBeCloseTo(143.04, 0);

    // ── Attribute aggregation ───────────────────────────────────────────
    // Agility: operator(159.3225) + attrIncrease(10) + Lupine Scarlet Skill 1 lv4(68) = 237.3225
    expect(agg.stats[StatType.AGILITY]).toBeCloseTo(237.3225, 1);

    // Intellect: operator only (106.392)
    expect(agg.stats[StatType.INTELLECT]).toBeCloseTo(106.392, 1);

    // Strength: operator only (88.0825)
    expect(agg.stats[StatType.STRENGTH]).toBeCloseTo(88.0825, 1);

    // Will: operator only (80.7423)
    expect(agg.stats[StatType.WILL]).toBeCloseTo(80.7423, 1);

    // ── Main/secondary attribute types ──────────────────────────────────
    expect(agg.mainAttributeType).toBe(StatType.AGILITY);
    expect(agg.secondaryAttributeType).toBe(StatType.INTELLECT);

    // ── Attribute bonuses (floored) ─────────────────────────────────────
    // floor(237.3225) = 237 → 0.005 × 237 = 1.185
    expect(agg.mainAttributeBonus).toBeCloseTo(1.185, 3);

    // floor(106.392) = 106 → 0.002 × 106 = 0.212
    expect(agg.secondaryAttributeBonus).toBeCloseTo(0.212, 3);

    // ── Effective ATK ───────────────────────────────────────────────────
    // totalAttack = 745 × (1 + 0.192) = 888.04
    expect(agg.totalAttack).toBeCloseTo(888.04, 1);

    // attributeBonus = 1 + 1.185 + 0.212 = 2.397
    expect(agg.attributeBonus).toBeCloseTo(2.397, 3);

    // effectiveAttack = 888.04 × 2.397 ≈ 2128.63
    expect(agg.effectiveAttack).toBeCloseTo(2128.63, 0);

    // ── Other stats ─────────────────────────────────────────────────────
    // Crit Rate: operator(0.05) + Lupine Scarlet Skill 2 lv3(0.065) = 0.115
    expect(agg.stats[StatType.CRITICAL_RATE]).toBeCloseTo(0.115, 3);

    // Crit DMG: operator(0.50)
    expect(agg.stats[StatType.CRITICAL_DAMAGE]).toBeCloseTo(0.50, 2);

    // HP: operator base HP at lv80
    expect(agg.effectiveHp).toBe(4934);

    // No gear = no defense
    expect(agg.totalDefense).toBe(0);
  });

  it('should track ATK stat sources correctly', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout as OperatorLoadoutState, loadoutProperties);
    if (!agg) { throw new Error('aggregateLoadoutStats returned null'); }

    // Agility should have sources from: Operator, Attr Increase, Weapon Skill (Agility Boost)
    const agiSources = agg.statSources[StatType.AGILITY];
    expect(agiSources).toBeDefined();
    expect(agiSources!.length).toBeGreaterThanOrEqual(2);

    const sourceNames = agiSources!.map(s => s.source);
    expect(sourceNames).toContain('Operator');
    expect(sourceNames).toContain('Attr Increase');

    // Operator agility source preserves full precision
    const opSource = agiSources!.find(s => s.source === 'Operator');
    expect(opSource?.value).toBeCloseTo(159.3225, 2);

    // Attr Increase adds +10 agility
    const attrSource = agiSources!.find(s => s.source === 'Attr Increase');
    expect(attrSource?.value).toBe(10);

    // Weapon skill adds +68 agility (Agility Boost [L] lv4)
    const weaponSource = agiSources!.find(s => s.source !== 'Operator' && s.source !== 'Attr Increase');
    expect(weaponSource?.value).toBe(68);

    // ATK bonus source from Fracture: Gnashing Wolves = 0.192
    const atkBonusSources = agg.statSources[StatType.ATTACK_BONUS];
    expect(atkBonusSources).toBeDefined();
    expect(atkBonusSources!.some(s => s.value === 0.192)).toBe(true);
  });
});
