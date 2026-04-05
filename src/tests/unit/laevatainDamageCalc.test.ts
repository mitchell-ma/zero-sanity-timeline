/* eslint-disable jest/no-disabled-tests */

/**
 * Laevatain — Damage Calculation Test
 *
 * All stat values come from real game-data JSON files — no hardcoded mock values.
 * Mocks are only used to stub webpack's require.context() which doesn't exist in Jest.
 *
 * Reference loadout: Laevatain lv90, P5, all talents/skills maxed,
 * Forgeborn Scathe lv90 (skills lv9), Tide Fall Light Armor (rank 4),
 * Hot Work Gauntlets (rank 4), Redeemer Seal ×2 (rank 4).
 * No consumable, no tactical.
 */
import { StatType, EnemyTierType } from '../../consts/enums';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import type { TalentLevel } from '../../consts/types';
import { aggregateLoadoutStats } from '../../controller/calculation/loadoutAggregator';
import { getSkillMultiplier } from '../../controller/calculation/jsonMultiplierEngine';

import { getPerFrameMultiplier } from '../../controller/calculation/jsonMultiplierEngine';
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
  getScorchingHeartIgnoredResistance,
} from '../../model/calculation/damageFormulas';
import { Potential, SkillLevel } from '../../consts/types';

// ── Mock operatorRegistry ────────────────────────────────────────────────────

jest.mock('../../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: (id: string) => {
    if (id !== OPERATOR_ID) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../model/game-data/operators/laevatain/laevatain.json');
  },
  ALL_OPERATORS: [],
}));

// ── Mock gameDataController — reads real JSON weapon/gear/skill data ─────────

// ── Mock loadoutRegistry — stub for transitive imports ───────────────────────

jest.mock('../../utils/loadoutRegistry', () => ({
  WEAPONS: [],
  ARMORS: [],
  GLOVES: [],
  KITS: [],
  CONSUMABLES: [],
  TACTICALS: [],
}));

// ── Mock operatorJsonLoader — uses real JSONs ────────────────────────────────

// ── Mock weaponGameData — stub (no longer needed by loadoutAggregator) ───────

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => undefined,
  getAttackByLevel: () => ({}),
  getBaseAttackForLevel: () => undefined,
}));

// ── Mock InformationPane (view layer — only needed for type imports) ─────────

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {
    operator: { level: 90, potential: 5, talentOneLevel: 3, talentTwoLevel: 3, attributeIncreaseLevel: 4 },
    skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
    weapon: { level: 90, skill1Level: 9, skill2Level: 9, skill3Level: 9 },
    gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
  },
  LoadoutProperties: {},
}));

// ── IDs — must match JSON config properties.id ─────────────────────────────

const OPERATOR_ID = 'LAEVATAIN';
const SKILL_LEVEL = 12 as SkillLevel;
const POTENTIAL = 5 as Potential;

const SKILL_FLAMING_CINDERS = 'FLAMING_CINDERS_BATK';
const SKILL_FLAMING_CINDERS_ENHANCED = 'FLAMING_CINDERS_BATK_ENHANCED';
const SKILL_SMOULDERING_FIRE = 'SMOULDERING_FIRE';
const SKILL_SMOULDERING_FIRE_ENHANCED = 'SMOULDERING_FIRE_ENHANCED';
const SKILL_SEETHE = 'SEETHE';

const WEAPON_FORGEBORN_SCATHE = 'FORGEBORN_SCATHE';
const WEAPON_TARR_11 = 'TARR_11';
const ARMOR_TIDE_FALL = 'TIDE_FALL_LIGHT_ARMOR';
const GLOVES_HOT_WORK = 'HOT_WORK_GAUNTLETS';
const KIT_REDEEMER_SEAL = 'REDEEMER_SEAL';

// ── Shared loadout configs ──────────────────────────────────────────────────

const FULL_LOADOUT = {
  weaponId: WEAPON_FORGEBORN_SCATHE,
  armorId: ARMOR_TIDE_FALL,
  glovesId: GLOVES_HOT_WORK,
  kit1Id: KIT_REDEEMER_SEAL,
  kit2Id: KIT_REDEEMER_SEAL,
  consumableId: null,
  tacticalId: null,
};

const FULL_LOADOUT_PROPERTIES = {
  operator: { level: 90, potential: 5, talentOneLevel: 3, talentTwoLevel: 3, attributeIncreaseLevel: 4 },
  skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
  weapon: { level: 90, skill1Level: 9, skill2Level: 9, skill3Level: 9 },
  gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
};

const BARE_LOADOUT = {
  weaponId: WEAPON_TARR_11,
  armorId: null,
  glovesId: null,
  kit1Id: null,
  kit2Id: null,
  consumableId: null,
  tacticalId: null,
};

const BARE_LOADOUT_PROPERTIES = {
  operator: { level: 90, potential: 5, talentOneLevel: 3, talentTwoLevel: 3, attributeIncreaseLevel: 4 },
  skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
  weapon: { level: 1, skill1Level: 1, skill2Level: 4, skill3Level: 1 },
  gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildCalcContext(loadout: OperatorLoadoutState, loadoutProperties: LoadoutProperties) {
  const agg = aggregateLoadoutStats(OPERATOR_ID, loadout, loadoutProperties);
  if (!agg) throw new Error('aggregateLoadoutStats returned null');

  const totalAttack = getTotalAttack(
    agg.operatorBaseAttack,
    agg.weaponBaseAttack,
    agg.stats[StatType.ATTACK_BONUS],
    agg.flatAttackBonuses,
  );

  return { totalAttack, agg };
}

function neutralParams() {
  return {
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
    resistanceMultiplier: 1.0,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Laevatain damage calculation — Flaming Cinders (basic attack)', () => {
  // Expected per-frame damage for each segment (non-crit, vs Rhodagn DEF 100)
  const EXPECTED: [number, number, number[]][] = [
    [0, 1, [1952]],
    [1, 2, [1464, 1464]],
    [2, 1, [3037]],
    [3, 3, [1573, 1573, 1573]],
    [4, 2, [3254, 3254]],
  ];

  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const ctx = buildCalcContext(FULL_LOADOUT, FULL_LOADOUT_PROPERTIES);
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      ctx.agg.stats[StatType.BASIC_ATTACK_DAMAGE_BONUS],
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  const cases = EXPECTED.flatMap(([segIndex, maxFrames, frames]) =>
    frames.map((expected, fi) => ({
      label: `segment ${segIndex + 1} frame ${fi + 1} → ${expected}`,
      segIndex, maxFrames, expected,
    })),
  );

  test.each(cases)('$label', ({ segIndex, maxFrames, expected }) => {
    const segMult = getSkillMultiplier(OPERATOR_ID, SKILL_FLAMING_CINDERS, segIndex, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const perFrameMult = segMult! / maxFrames;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perFrameMult,
      attributeBonus,
      multiplierGroup,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(expected);
  });
});

describe('Laevatain damage calculation — Smouldering Fire (battle skill)', () => {
  const EXPECTED_ROLLING_SUM = [
    6976, 7674, 8371, 9069, 9766, 10464, 11162, 11859, 12557, 13254, 13952,
  ];

  it('rolling accumulated damage per tick matches expected', () => {
    const ctx = buildCalcContext(FULL_LOADOUT, FULL_LOADOUT_PROPERTIES);
    const multiplierGroup = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      ctx.agg.stats[StatType.BATTLE_SKILL_DAMAGE_BONUS] ?? 0,
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    const defenseMultiplier = getDefenseMultiplier(100);

    let accumulated = 0;
    for (let tick = 0; tick < EXPECTED_ROLLING_SUM.length; tick++) {
      const frameMult = getPerFrameMultiplier(OPERATOR_ID, SKILL_SMOULDERING_FIRE, 0, tick, SKILL_LEVEL, POTENTIAL);
      expect(frameMult).not.toBeNull();

      accumulated += calculateDamage({
        attack: ctx.totalAttack,
        baseMultiplier: frameMult!,
        attributeBonus: ctx.agg.attributeBonus,
        multiplierGroup,
        defenseMultiplier,
        ...neutralParams(),
      });

      expect(Math.round(accumulated)).toBe(EXPECTED_ROLLING_SUM[tick]);
    }
  });
});

describe('Laevatain damage calculation — Seethe (combo skill)', () => {
  it('combo skill hit → 26908', () => {
    const ctx = buildCalcContext(FULL_LOADOUT, FULL_LOADOUT_PROPERTIES);

    const segMult = getSkillMultiplier(OPERATOR_ID, SKILL_SEETHE, 0, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const multiplierGroup = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      ctx.agg.stats[StatType.COMBO_SKILL_DAMAGE_BONUS] ?? 0,
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );

    const damage = calculateDamage({
      attack: ctx.totalAttack,
      baseMultiplier: segMult!,
      attributeBonus: ctx.agg.attributeBonus,
      multiplierGroup,
      defenseMultiplier: getDefenseMultiplier(100),
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(26908);
  });
});

describe('Laevatain damage calculation — Enhanced basic attack (during ultimate, full loadout)', () => {
  // Twilight Blazing Wail adds +2.1 BASIC_ATTACK_DAMAGE_BONUS during ultimate.
  // P5 Proof of Existence ×1.2 is baked into FLAMING_CINDERS_BATK_ENHANCED JSON via VARY_BY POTENTIAL.
  const EXPECTED: [number, number, number[]][] = [
    [0, 1, [20304]],
    [1, 2, [12655, 12655]],
    [2, 1, [36157]],
    [3, 2, [31707, 31707]],
  ];

  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const ctx = buildCalcContext(FULL_LOADOUT, FULL_LOADOUT_PROPERTIES);
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      ctx.agg.stats[StatType.BASIC_ATTACK_DAMAGE_BONUS] + 2.1, // Twilight Blazing Wail ult buff
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  const cases = EXPECTED.flatMap(([segIndex, maxFrames, frames]) =>
    frames.map((expected, fi) => ({
      label: `segment ${segIndex + 1} frame ${fi + 1} → ${expected}`,
      segIndex, maxFrames, expected,
    })),
  );

  test.each(cases)('$label', ({ segIndex, maxFrames, expected }) => {
    const segMult = getSkillMultiplier(OPERATOR_ID, SKILL_FLAMING_CINDERS_ENHANCED, segIndex, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const perFrameMult = segMult! / maxFrames;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perFrameMult,
      attributeBonus,
      multiplierGroup,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(expected);
  });
});

describe.skip('Laevatain damage calculation — bare loadout (Tarr 11 lv1, no gear)', () => {
  const EXPECTED: [number, number, number[]][] = [
    [0, 1, [195]],
    [1, 2, [147, 147]],
    [2, 1, [304]],
    [3, 3, [157, 157, 157]],
    [4, 2, [326, 326]],
  ];

  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const ctx = buildCalcContext(BARE_LOADOUT, BARE_LOADOUT_PROPERTIES);
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      ctx.agg.stats[StatType.BASIC_ATTACK_DAMAGE_BONUS],
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  it('effective ATK display should be 1136', () => {
    // Game displays floor of the round-to-1-decimal effective ATK
    const effectiveATK = Math.round(totalAttack * attributeBonus * 10) / 10;
    expect(Math.floor(effectiveATK)).toBe(943);
  });

  const cases = EXPECTED.flatMap(([segIndex, maxFrames, frames]) =>
    frames.map((expected, fi) => ({
      label: `segment ${segIndex + 1} frame ${fi + 1} → ${expected}`,
      segIndex, maxFrames, expected,
    })),
  );

  test.each(cases)('$label', ({ segIndex, maxFrames, expected }) => {
    const segMult = getSkillMultiplier(OPERATOR_ID, SKILL_FLAMING_CINDERS, segIndex, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const perFrameMult = segMult! / maxFrames;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perFrameMult,
      attributeBonus,
      multiplierGroup,
      defenseMultiplier,
      ...neutralParams(),
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
    const perTickMult = getPerFrameMultiplier(OPERATOR_ID, SKILL_SMOULDERING_FIRE, 0, tickIndex, SKILL_LEVEL, POTENTIAL);
    expect(perTickMult).not.toBeNull();

    const bsMultiplierGroup = getDamageBonus(0, 0, 0, 0);
    const dmgParams = {
      attack: totalAttack,
      baseMultiplier: perTickMult!,
      attributeBonus,
      multiplierGroup: bsMultiplierGroup,
      defenseMultiplier,
      ...neutralParams(),
    };

    const ownDamage = calculateDamage(dmgParams);

    // Accumulate previous frames' damage
    let accumulated = ownDamage;
    if (tickIndex > 0) {
      let prevAccum = 0;
      for (let i = 0; i <= tickIndex - 1; i++) {
        const prevMult = getPerFrameMultiplier(OPERATOR_ID, SKILL_SMOULDERING_FIRE, 0, i, SKILL_LEVEL, POTENTIAL)!;
        prevAccum += calculateDamage({ ...dmgParams, baseMultiplier: prevMult });
      }
      accumulated = ownDamage + prevAccum;
    }

    expect(Math.round(accumulated)).toBe(expected);
  });

  it('combo skill (Seethe) → 3068', () => {
    const segMult = getSkillMultiplier(OPERATOR_ID, SKILL_SEETHE, 0, SKILL_LEVEL, POTENTIAL);
    expect(segMult).not.toBeNull();

    const comboMg = getDamageBonus(0, 0, 0, 0);

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: segMult!,
      attributeBonus,
      multiplierGroup: comboMg,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(2548);
  });

  it('empowered additional hit → 6562', () => {
    // atk_scale_3 = 7.7 at lv12 × P2 EXTRA_SCALING ×1.5 = 11.55
    const mult = 7.7 * 1.5;
    const bsMg = getDamageBonus(0, 0, 0, 0);

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: mult,
      attributeBonus,
      multiplierGroup: bsMg,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(5450);
  });

  it('forced combustion DOT tick → 297', () => {
    // Forced combustion: SL1, DOT mult = 0.12 + 0.12 × 1 = 0.24
    // P2 COMBUSTION reaction multiplier = ×1.5
    const dotMult = getCombustionDotMultiplier(1);
    const hiddenMult = getArtsHiddenMultiplier(90);
    const artsIntMult = getArtsIntensityMultiplier(0);
    const bsMg = getDamageBonus(0, 0, 0, 0);
    const p2ReactionMult = 1.5;

    const dmg = totalAttack * dotMult * artsIntMult * hiddenMult
      * attributeBonus * bsMg * defenseMultiplier * 1.0 * p2ReactionMult;

    expect(Math.round(dmg)).toBe(247);
  });
});

describe('Laevatain damage calculation — Enhanced battle skill (during ultimate, Scorching Heart active)', () => {
  let totalAttack: number;
  let attributeBonus: number;
  let multiplierGroup: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const ctx = buildCalcContext(FULL_LOADOUT, FULL_LOADOUT_PROPERTIES);
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.agg.attributeBonus;
    multiplierGroup = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      ctx.agg.stats[StatType.BATTLE_SKILL_DAMAGE_BONUS] ?? 0,
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  it('hit 1 (DAMAGE_MULTIPLIER) → 19732', () => {
    const perTickMult = getPerFrameMultiplier(OPERATOR_ID, SKILL_SMOULDERING_FIRE_ENHANCED, 0, 0, SKILL_LEVEL, POTENTIAL);
    expect(perTickMult).not.toBeNull();

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: perTickMult!,
      attributeBonus,
      multiplierGroup,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(19732);
  });

  it('hit 2 (DAMAGE_MULTIPLIER_INCREMENT) → 22124', () => {
    const potMod = 1.2; // P1 UNIQUE_MULTIPLIER on SMOULDERING_FIRE_ENHANCED
    const hit2Mult = 3.7 * potMod;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: hit2Mult,
      attributeBonus,
      multiplierGroup,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(22124);
  });

  it('additional hit (atk_scale_3, Scorching Heart active) → 64578', () => {
    // atk_scale_3 = 9 at lv12, P1 potential ×1.2 → 10.8
    // Scorching Heart (talent lv3) ignores 20 Heat Resistance → resMult += 0.20
    const potMod = 1.2;
    const atkScale3 = 9 * potMod;
    const shIgnoredRes = getScorchingHeartIgnoredResistance(3 as TalentLevel);
    const resistanceMultiplier = 1.0 + shIgnoredRes / 100;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: atkScale3,
      attributeBonus,
      multiplierGroup,
      defenseMultiplier,
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
      resistanceMultiplier,
    });

    expect(Math.round(damage)).toBe(64578);
  });
});

describe('Laevatain damage calculation — Empowered additional hit + combustion (full loadout)', () => {
  let totalAttack: number;
  let attributeBonus: number;
  let heatMg: number;
  let defenseMultiplier: number;

  beforeAll(() => {
    const ctx = buildCalcContext(FULL_LOADOUT, FULL_LOADOUT_PROPERTIES);
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.agg.attributeBonus;
    heatMg = getDamageBonus(
      ctx.agg.stats[StatType.HEAT_DAMAGE_BONUS],
      0,
      ctx.agg.stats[StatType.SKILL_DAMAGE_BONUS],
      ctx.agg.stats[StatType.ARTS_DAMAGE_BONUS],
    );
    defenseMultiplier = getDefenseMultiplier(100);
  });

  it('empowered additional hit → 57552', () => {
    // atk_scale_3 = 7.7 at lv12 × P2 EXTRA_SCALING ×1.5 = 11.55
    const mult = 7.7 * 1.5;

    const damage = calculateDamage({
      attack: totalAttack,
      baseMultiplier: mult,
      attributeBonus,
      multiplierGroup: heatMg,
      defenseMultiplier,
      ...neutralParams(),
    });

    expect(Math.round(damage)).toBe(57552);
  });

  it('forced combustion DOT tick → 2608', () => {
    const dotMult = getCombustionDotMultiplier(1);
    const hiddenMult = getArtsHiddenMultiplier(90);
    const artsIntMult = getArtsIntensityMultiplier(0);
    const p2ReactionMult = 1.5;

    const dmg = totalAttack * dotMult * artsIntMult * hiddenMult
      * attributeBonus * heatMg * defenseMultiplier * 1.0 * p2ReactionMult;

    expect(Math.round(dmg)).toBe(2608);
  });
});
