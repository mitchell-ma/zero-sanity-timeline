/**
 * Tests for Zhuang Fangyi loadout stat aggregation.
 *
 * Reference loadout (from shared URL, captured 2026-04-19):
 *   Zhuang Fangyi lv80, P0, Talent L2/L2, Attribute Increase L1 (Stalwart),
 *   all skills lv9, Lone Barge lv80 (skill 1 lv4, skill 2 lv7, skill 3 lv2),
 *   no gear, no consumable, no tactical.
 *
 * Expected values verified against the in-app operator stats panel.
 *
 * ATK formula:
 *   baseAttack = operatorATK + weaponATK = 293 + 458 = 751
 *   totalAttack = baseAttack × (1 + ATK%) = 751 × 1.29 = 968.79
 *   effectiveMainAttr = floor(will) = floor(244.3539) = 244
 *   effectiveSecAttr = floor(intellect) = floor(111.9001) = 111
 *   attributeBonus = 1 + 0.005×244 + 0.002×111 = 2.442
 *   effectiveAttack = 968.79 × 2.442 ≈ 2365.79
 */
import { aggregateLoadoutStats } from '../../controller/calculation/loadoutAggregator';
import { ElementType, StatType } from '../../consts/enums';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';

// Mock operatorRegistry to avoid require.context for splash art assets
jest.mock('../../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zhuangJson = require('../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json');
    if (id !== zhuangJson.id) return undefined;
    return zhuangJson;
  },
  ALL_OPERATORS: [],
}));

// Stub loadoutRegistry for transitive imports (aggregator reads weapon/gear via gameDataStore)
jest.mock('../../utils/loadoutRegistry', () => ({
  WEAPONS: [],
  ARMORS: [],
  GLOVES: [],
  KITS: [],
  CONSUMABLES: [],
  TACTICALS: [],
}));

// Stub weaponGameData — no longer consulted by loadoutAggregator but imported elsewhere
jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => undefined,
  getAttackByLevel: () => ({}),
  getBaseAttackForLevel: () => undefined,
}));

describe('loadoutAggregator — Zhuang Fangyi lv80, Lone Barge lv80', () => {
  const OPERATOR_ID = 'ZHUANG_FANGYI';

  const loadout: OperatorLoadoutState = {
    weaponId: 'LONE_BARGE',
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
    weapon: { level: 80, skill1Level: 4, skill2Level: 7, skill3Level: 2 },
    gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
  };

  it('should produce ATK / attribute breakdown matching in-app panel values', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout, loadoutProperties);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    // ── Base ATK breakdown ──────────────────────────────────────────────
    // Zhuang Fangyi lv80 operator base ATK
    expect(agg.operatorBaseAttack).toBe(293);

    // Lone Barge lv80 base ATK (clause APPLY STAT BASE_ATTACK VARY_BY WEAPON_LEVEL)
    expect(agg.weaponBaseAttack).toBe(458);

    // Base ATK = operator + weapon
    expect(agg.baseAttack).toBe(751);

    // ── ATK% from Attack Boost [L] lv7 ──────────────────────────────────
    expect(agg.atkBonus).toBeCloseTo(0.29, 3);
    expect(agg.atkPercentageBonus).toBeCloseTo(217.79, 0);

    // ── Main / secondary attribute ──────────────────────────────────────
    expect(agg.mainAttributeType).toBe(StatType.WILL);
    expect(agg.secondaryAttributeType).toBe(StatType.INTELLECT);

    // ── Attribute aggregation ───────────────────────────────────────────
    // WILL: operator(166.35388) + Stalwart L1(10) + Will Boost [L] lv4(68) = 244.35388
    expect(agg.stats[StatType.WILL]).toBeCloseTo(244.35388, 2);

    // INTELLECT: operator only (111.90006)
    expect(agg.stats[StatType.INTELLECT]).toBeCloseTo(111.90006, 2);

    // STRENGTH / AGILITY: operator only (89)
    expect(agg.stats[StatType.STRENGTH]).toBeCloseTo(89, 2);
    expect(agg.stats[StatType.AGILITY]).toBeCloseTo(89, 2);

    // ── Attribute bonuses (floored by game rule) ────────────────────────
    // floor(244.35388) = 244 → 0.005 × 244 = 1.22
    expect(agg.mainAttributeBonus).toBeCloseTo(1.22, 3);
    // floor(111.90006) = 111 → 0.002 × 111 = 0.222
    expect(agg.secondaryAttributeBonus).toBeCloseTo(0.222, 3);

    // ── Effective ATK ───────────────────────────────────────────────────
    // totalAttack = 751 × 1.29 = 968.79
    expect(agg.totalAttack).toBeCloseTo(968.79, 1);
    // attributeBonus = 1 + 1.22 + 0.222 = 2.442
    expect(agg.attributeBonus).toBeCloseTo(2.442, 3);
    // effectiveAttack = 968.79 × 2.442 ≈ 2365.79
    expect(agg.effectiveAttack).toBeCloseTo(2365.79, 0);

    // ── Element ─────────────────────────────────────────────────────────
    expect(agg.element).toBe(ElementType.ELECTRIC);
  });

  it('should aggregate element/damage/defense stats correctly', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout, loadoutProperties);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    // ELECTRIC_DAMAGE_BONUS from Lone Barge named skill lv2 = 0.192
    expect(agg.stats[StatType.ELECTRIC_DAMAGE_BONUS]).toBeCloseTo(0.192, 3);

    // Crit stats default to operator base
    expect(agg.stats[StatType.CRITICAL_RATE]).toBeCloseTo(0.05, 3);
    expect(agg.stats[StatType.CRITICAL_DAMAGE]).toBeCloseTo(0.5, 2);

    // No gear — zero defense and no active set
    expect(agg.totalDefense).toBe(0);
    expect(agg.gearSetActive).toBe(false);
    expect(agg.gearSetType).toBeNull();
  });

  it('should aggregate HP correctly', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout, loadoutProperties);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    // Operator base HP at lv80
    expect(agg.operatorBaseHp).toBe(4934);

    // HP from Strength: 5 × floor(89) = 445
    expect(agg.hpFromStrength).toBe(445);

    // No HP% bonus, no flat HP → effectiveHp = 4934 + 445 = 5379
    expect(agg.hpBonus).toBe(0);
    expect(agg.flatHpBonuses).toBe(0);
    expect(agg.effectiveHp).toBe(5379);
  });

  it('should track stat sources correctly', () => {
    const agg = aggregateLoadoutStats(OPERATOR_ID, loadout, loadoutProperties);
    if (!agg) throw new Error('aggregateLoadoutStats returned null');

    // WILL sources: Operator, Attr Increase (Stalwart), Will Boost [L] (weapon)
    const willSources = agg.statSources[StatType.WILL];
    expect(willSources).toBeDefined();
    expect(willSources!.length).toBeGreaterThanOrEqual(3);

    const willNames = willSources!.map(s => s.source);
    expect(willNames).toContain('Operator');
    expect(willNames).toContain('Attr Increase');
    // Weapon skill source uses the weapon's display name ("Lone Barge")
    expect(willNames.some(n => n !== 'Operator' && n !== 'Attr Increase')).toBe(true);

    // Operator WILL preserves full precision (no rounding)
    const willOp = willSources!.find(s => s.source === 'Operator');
    expect(willOp?.value).toBeCloseTo(166.35388, 2);

    // Attr Increase adds +10 WILL (Stalwart L1)
    const willAttr = willSources!.find(s => s.source === 'Attr Increase');
    expect(willAttr?.value).toBe(10);

    // Weapon skill adds +68 WILL (Will Boost [L] lv4)
    const willWeapon = willSources!.find(s => s.source !== 'Operator' && s.source !== 'Attr Increase');
    expect(willWeapon?.value).toBe(68);

    // ATTACK_BONUS source from Attack Boost [L] lv7 = 0.29
    const atkBonusSources = agg.statSources[StatType.ATTACK_BONUS];
    expect(atkBonusSources).toBeDefined();
    expect(atkBonusSources!.some(s => Math.abs(s.value - 0.29) < 1e-6)).toBe(true);

    // ELECTRIC_DAMAGE_BONUS source from Lone Barge named skill lv2 = 0.192
    const electricSources = agg.statSources[StatType.ELECTRIC_DAMAGE_BONUS];
    expect(electricSources).toBeDefined();
    expect(electricSources!.some(s => Math.abs(s.value - 0.192) < 1e-6)).toBe(true);
  });
});
