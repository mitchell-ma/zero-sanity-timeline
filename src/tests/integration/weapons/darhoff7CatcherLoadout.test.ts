/**
 * @jest-environment jsdom
 */

/**
 * Darhoff 7 — MAIN_ATTRIBUTE alias resolution integration tests
 *
 * Verifies that weapon skills which apply the virtual `MAIN_ATTRIBUTE` /
 * `SECONDARY_ATTRIBUTE` StatType aliases are correctly translated by the
 * loadout aggregator into the operator's actual main / secondary attribute
 * (STR/AGI/INT/WILL), and that the info-pane data exposes the contribution
 * under the resolved real attribute (not under "MAIN_ATTRIBUTE" or "STAT").
 *
 * Loadout: Catcher (main = STRENGTH, secondary = WILL) + Darhoff 7.
 * Darhoff 7 has two skills:
 *   1. MAIN_ATTRIBUTE_BOOST_S    — APPLY STAT MAIN_ATTRIBUTE, [10..79] by skill level
 *   2. ASSAULT_ARMAMENT_PREP     — APPLY STAT MAIN_ATTRIBUTE, [10..79] + ATTACK_BONUS [0.12..0.336]
 *
 * Three-layer verification:
 *   1. aggregator: stats[STRENGTH] includes the MAIN_ATTRIBUTE delta
 *   2. info-pane:  resolveWeaponBreakdown returns statContributions keyed
 *      by the real attribute (STRENGTH), not the alias
 *   3. info-pane:  resolveAggregatedStats display rows show the bonus on the
 *      operator's real main attribute row
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { StatType, StatOwnerType } from '../../../consts/enums';
import { NounType } from '../../../dsl/semantics';
import { aggregateLoadoutStats } from '../../../controller/calculation/loadoutAggregator';
import {
  resolveWeaponBreakdown,
  resolveAggregatedStats,
} from '../../../controller/info-pane/loadoutPaneController';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CATCHER_JSON = require('../../../model/game-data/operators/catcher/catcher.json');
const CATCHER_ID: string = CATCHER_JSON.id;
const CATCHER_MAIN_ATTR: StatType = CATCHER_JSON.mainAttributeType;
const CATCHER_SECONDARY_ATTR: StatType = CATCHER_JSON.secondaryAttributeType;

const DARHOFF_JSON = require('../../../model/game-data/weapons/darhoff-7/darhoff-7.json');
const DARHOFF_ID: string = DARHOFF_JSON.properties.id;
const DARHOFF_NAME: string = DARHOFF_JSON.properties.name;

const MAIN_ATTR_BOOST_S_JSON = require(
  '../../../model/game-data/weapons/generic/skill-main-attribute-boost-s.json',
);
const ASSAULT_ARMAMENT_PREP_JSON = require(
  '../../../model/game-data/weapons/generic/skill-assault-armament-prep.json',
);
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CATCHER = 'slot-0';

// Sanity-check the assumed test fixtures — Catcher is STR-main / WIL-secondary
// and Darhoff 7's generic skills are MAIN_ATTRIBUTE_BOOST_S (main attr flat)
// and ASSAULT_ARMAMENT_PREP (flat ATK only — NOT main attr, NOT percentage).
expect(CATCHER_MAIN_ATTR).toBe(StatType.STRENGTH);
expect(CATCHER_SECONDARY_ATTR).toBe(StatType.WILL);
expect(DARHOFF_JSON.skills).toEqual(['MAIN_ATTRIBUTE_BOOST_S', 'ASSAULT_ARMAMENT_PREP']);

// Pull skill-level → value tables straight from the JSON so the test follows
// any future rebalances without hand-rolling the numbers.
const MAIN_BOOST_S_VALUES: number[] = MAIN_ATTR_BOOST_S_JSON.clause[0].effects[0].with.value.value;
const ASSAULT_PREP_FLAT_ATK_VALUES: number[] = ASSAULT_ARMAMENT_PREP_JSON.clause[0].effects[0].with.value.value;

// Assert the JSON shape is what we expect — ASSAULT_ARMAMENT_PREP should have
// exactly ONE effect (flat ATK). Any future change that adds a second effect
// or flips it back to a percentage stat fails loudly here.
expect(ASSAULT_ARMAMENT_PREP_JSON.clause[0].effects).toHaveLength(1);
expect(ASSAULT_ARMAMENT_PREP_JSON.clause[0].effects[0].objectId).toBe(StatType.FLAT_ATTACK);

beforeEach(() => {
  localStorage.clear();
});

function setupCatcherWithDarhoff() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CATCHER, CATCHER_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT_CATCHER, {
      weaponId: DARHOFF_ID,
      armorId: null,
      glovesId: null,
      kit1Id: null,
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });
  return view;
}

function setupCatcherUnequipped() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CATCHER, CATCHER_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT_CATCHER, {
      weaponId: null,
      armorId: null,
      glovesId: null,
      kit1Id: null,
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });
  return view;
}

function getAggregator(app: AppResult) {
  const loadout = app.loadouts[SLOT_CATCHER];
  const props = app.loadoutProperties[SLOT_CATCHER];
  return aggregateLoadoutStats(CATCHER_ID, loadout, props);
}

// =============================================================================
// A. Aggregator translates MAIN_ATTRIBUTE → operator's main stat (STRENGTH)
// =============================================================================

describe('A. Aggregator — Darhoff 7 routes STR via MAIN_ATTRIBUTE alias, ATK via FLAT_ATTACK', () => {
  it('A1: STRENGTH delta with vs without Darhoff 7 = MAIN_ATTRIBUTE_BOOST_S only (79 at L9)', () => {
    // Only MAIN_ATTRIBUTE_BOOST_S contributes to STR via the MAIN_ATTRIBUTE
    // alias. ASSAULT_ARMAMENT_PREP is flat ATK (not main attribute), so the
    // STR delta is exactly one skill's worth, not two.
    const baseline = setupCatcherUnequipped();
    const aggBase = getAggregator(baseline.result.current);
    expect(aggBase).not.toBeNull();

    const equipped = setupCatcherWithDarhoff();
    const aggEquipped = getAggregator(equipped.result.current);
    expect(aggEquipped).not.toBeNull();

    const delta = aggEquipped!.stats[StatType.STRENGTH] - aggBase!.stats[StatType.STRENGTH];
    expect(delta).toBe(MAIN_BOOST_S_VALUES[8]);
  });

  it('A2: ASSAULT_ARMAMENT_PREP routes ATK to FLAT_ATTACK, NOT ATTACK_BONUS (regression guard)', () => {
    const equipped = setupCatcherWithDarhoff();
    const aggEquipped = getAggregator(equipped.result.current);
    expect(aggEquipped).not.toBeNull();

    const baseline = setupCatcherUnequipped();
    const aggBase = getAggregator(baseline.result.current);

    // ATTACK_BONUS (percentage) must be unchanged — the skill is flat, not %.
    expect(aggEquipped!.stats[StatType.ATTACK_BONUS]).toBe(aggBase!.stats[StatType.ATTACK_BONUS]);

    // FLAT_ATTACK gets its own stat entry and the full value flows in.
    const flatDelta = aggEquipped!.stats[StatType.FLAT_ATTACK] - aggBase!.stats[StatType.FLAT_ATTACK];
    expect(flatDelta).toBe(ASSAULT_PREP_FLAT_ATK_VALUES[8]);

    // The flatAttackBonuses counter (which feeds totalAttack) is also updated.
    const counterDelta = aggEquipped!.flatAttackBonuses - aggBase!.flatAttackBonuses;
    expect(counterDelta).toBe(ASSAULT_PREP_FLAT_ATK_VALUES[8]);
  });

  it('A2b: FLAT_ATTACK is summed into totalAttack as a flat addition', () => {
    const baseline = setupCatcherUnequipped();
    const aggBase = getAggregator(baseline.result.current);
    const equipped = setupCatcherWithDarhoff();
    const aggEquipped = getAggregator(equipped.result.current);

    // totalAttack delta should account for the weapon's base ATK + Darhoff 7's
    // skill flat ATK + the percentage bonus on the larger base.
    const baseAttackDelta = aggEquipped!.baseAttack - aggBase!.baseAttack;
    const flatDelta = aggEquipped!.flatAttackBonuses - aggBase!.flatAttackBonuses;
    const totalAttackDelta = aggEquipped!.totalAttack - aggBase!.totalAttack;
    // totalAttack = baseAttack × (1 + atkBonus) + flatAttackBonuses.
    // atkBonus is unchanged, so the minimum delta is baseAttackDelta + flatDelta.
    expect(totalAttackDelta).toBeGreaterThanOrEqual(baseAttackDelta + flatDelta - 0.001);
  });

  it('A3: WILL (secondary attribute) is NOT increased by MAIN_ATTRIBUTE bonus', () => {
    const baseline = setupCatcherUnequipped();
    const aggBase = getAggregator(baseline.result.current);
    const equipped = setupCatcherWithDarhoff();
    const aggEquipped = getAggregator(equipped.result.current);
    expect(aggEquipped!.stats[StatType.WILL]).toBe(aggBase!.stats[StatType.WILL]);
  });

  it('A4: virtual MAIN_ATTRIBUTE / SECONDARY_ATTRIBUTE buckets are never written to', () => {
    const equipped = setupCatcherWithDarhoff();
    const agg = getAggregator(equipped.result.current);
    expect(agg).not.toBeNull();
    // Aliases are translated in addStat — they must remain at zero in the
    // bucketed stats record.
    expect(agg!.stats[StatType.MAIN_ATTRIBUTE]).toBe(0);
    expect(agg!.stats[StatType.SECONDARY_ATTRIBUTE]).toBe(0);
  });

  it('A5: statSources records exactly ONE Darhoff 7 contribution under STRENGTH (MAIN_ATTRIBUTE_BOOST_S)', () => {
    const equipped = setupCatcherWithDarhoff();
    const agg = getAggregator(equipped.result.current);
    expect(agg).not.toBeNull();

    const strSources = agg!.statSources[StatType.STRENGTH] ?? [];
    const darhoffStrEntries = strSources.filter(e => e.source === DARHOFF_NAME);
    // Only MAIN_ATTRIBUTE_BOOST_S contributes STR (via the MAIN_ATTRIBUTE alias).
    // ASSAULT_ARMAMENT_PREP is flat ATK, NOT main attribute — regression guard.
    expect(darhoffStrEntries).toHaveLength(1);
    expect(darhoffStrEntries[0].value).toBe(MAIN_BOOST_S_VALUES[8]);

    // And exactly ONE Darhoff 7 contribution under FLAT_ATTACK (ASSAULT_ARMAMENT_PREP).
    const flatSources = agg!.statSources[StatType.FLAT_ATTACK] ?? [];
    const darhoffFlatEntries = flatSources.filter(e => e.source === DARHOFF_NAME);
    expect(darhoffFlatEntries).toHaveLength(1);
    expect(darhoffFlatEntries[0].value).toBe(ASSAULT_PREP_FLAT_ATK_VALUES[8]);
  });

  it('A6: scales correctly across skill levels (L5 → 42 STR + 42 flat ATK)', () => {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT_CATCHER, CATCHER_ID); });
    act(() => {
      view.result.current.handleLoadoutChange(SLOT_CATCHER, {
        weaponId: DARHOFF_ID,
        armorId: null, glovesId: null, kit1Id: null, kit2Id: null,
        consumableId: null, tacticalId: null,
      });
    });
    // Drop both weapon skills to level 5 — MAIN_ATTRIBUTE_BOOST_S and
    // ASSAULT_ARMAMENT_PREP both give 42 at L5 (from their JSON tables).
    const props = view.result.current.loadoutProperties[SLOT_CATCHER];
    act(() => {
      view.result.current.handleStatsChange(SLOT_CATCHER, {
        ...props,
        weapon: { ...props.weapon, skill1Level: 5, skill2Level: 5 },
      });
    });

    const aggL5 = getAggregator(view.result.current);
    expect(aggL5).not.toBeNull();

    const baseline = setupCatcherUnequipped();
    const aggBase = getAggregator(baseline.result.current);

    // STR delta at L5 = MAIN_BOOST_S[4] = 42.
    const strDelta = aggL5!.stats[StatType.STRENGTH] - aggBase!.stats[StatType.STRENGTH];
    expect(strDelta).toBe(MAIN_BOOST_S_VALUES[4]);
    expect(strDelta).toBe(42);

    // FLAT_ATTACK delta at L5 = ASSAULT_PREP_FLAT_ATK[4] = 42.
    const flatDelta = aggL5!.stats[StatType.FLAT_ATTACK] - aggBase!.stats[StatType.FLAT_ATTACK];
    expect(flatDelta).toBe(ASSAULT_PREP_FLAT_ATK_VALUES[4]);
    expect(flatDelta).toBe(42);
  });
});

// =============================================================================
// B. Info pane — resolveWeaponBreakdown reports the real attribute (STRENGTH)
// =============================================================================

describe('B. Info pane — weapon breakdown surfaces translated stat keys', () => {
  it('B1: statContributions for Darhoff 7 have exactly one STRENGTH + one FLAT_ATTACK entry', () => {
    const { result } = setupCatcherWithDarhoff();
    const breakdown = resolveWeaponBreakdown(
      CATCHER_ID,
      result.current.loadouts[SLOT_CATCHER],
      result.current.loadoutProperties[SLOT_CATCHER],
    );
    expect(breakdown).not.toBeNull();
    expect(breakdown!.name).toBe(DARHOFF_NAME);

    // Exactly ONE STRENGTH contribution (from MAIN_ATTRIBUTE_BOOST_S only —
    // ASSAULT_ARMAMENT_PREP does NOT contribute main attribute).
    const strContribs = breakdown!.statContributions.filter(
      c => c.stat === StatType.STRENGTH,
    );
    expect(strContribs).toHaveLength(1);
    expect(strContribs[0].skillIndex).toBe(0);  // MAIN_ATTRIBUTE_BOOST_S is skill 1
    expect(strContribs[0].value).toBe(MAIN_BOOST_S_VALUES[8]);

    // Exactly ONE FLAT_ATTACK contribution (from ASSAULT_ARMAMENT_PREP).
    const flatContribs = breakdown!.statContributions.filter(
      c => c.stat === StatType.FLAT_ATTACK,
    );
    expect(flatContribs).toHaveLength(1);
    expect(flatContribs[0].skillIndex).toBe(1);  // ASSAULT_ARMAMENT_PREP is skill 2
    expect(flatContribs[0].value).toBe(ASSAULT_PREP_FLAT_ATK_VALUES[8]);

    // No raw MAIN_ATTRIBUTE / SECONDARY_ATTRIBUTE / STAT alias should leak through.
    expect(breakdown!.statContributions.some(
      c => (c.stat as string) === StatType.MAIN_ATTRIBUTE,
    )).toBe(false);
    expect(breakdown!.statContributions.some(
      c => (c.stat as string) === StatType.SECONDARY_ATTRIBUTE,
    )).toBe(false);
    expect(breakdown!.statContributions.some(
      c => (c.stat as string) === NounType.STAT,
    )).toBe(false);
  });

  it('B2: the STRENGTH contribution value matches the raw per-level JSON table', () => {
    const { result } = setupCatcherWithDarhoff();
    const breakdown = resolveWeaponBreakdown(
      CATCHER_ID,
      result.current.loadouts[SLOT_CATCHER],
      result.current.loadoutProperties[SLOT_CATCHER],
    );
    const strContrib = breakdown!.statContributions.find(
      c => c.stat === StatType.STRENGTH,
    );
    expect(strContrib).toBeDefined();
    expect(strContrib!.value).toBe(79);
  });

  it('B3: ASSAULT_ARMAMENT_PREP contributes FLAT_ATTACK with the flat value (79 at L9), not a tiny percentage', () => {
    const { result } = setupCatcherWithDarhoff();
    const breakdown = resolveWeaponBreakdown(
      CATCHER_ID,
      result.current.loadouts[SLOT_CATCHER],
      result.current.loadoutProperties[SLOT_CATCHER],
    );
    expect(breakdown).not.toBeNull();

    // The flat-ATK contribution surfaces under FLAT_ATTACK.
    const flatAtkContrib = breakdown!.statContributions.find(
      c => c.stat === StatType.FLAT_ATTACK,
    );
    expect(flatAtkContrib).toBeDefined();
    // Must be the flat value (79 at L9), not a fractional percentage like 0.336.
    expect(flatAtkContrib!.value).toBe(79);
    expect(flatAtkContrib!.value).toBeGreaterThanOrEqual(1);

    // Regression guard: the same value MUST NOT show up as ATTACK_BONUS — that
    // was the bug where the info pane displayed the flat ATK as a percentage.
    const atkBonusContrib = breakdown!.statContributions.find(
      c => c.stat === StatType.ATTACK_BONUS,
    );
    expect(atkBonusContrib).toBeUndefined();
  });

  it('B4: FLAT_ATTACK is NOT in the percentage stat set (display layer)', () => {
    // Stat-display formatting: FLAT_ATTACK must format as a flat number,
    // never with a % suffix. Force PERCENTAGE number-format mode so the
    // ATTACK_BONUS sanity check exercises the percent-rendering branch
    // (default user setting is DECIMAL, which suppresses the % suffix on
    // percent-typed stats too).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { formatStatValue } = require('../../../controller/info-pane/loadoutPaneController');
    const { saveSettings, loadSettings } = require('../../../consts/settings');
    const { NumberFormatType } = require('../../../consts/enums');
    /* eslint-enable @typescript-eslint/no-require-imports */
    saveSettings({ ...loadSettings(), numberFormat: NumberFormatType.PERCENTAGE });

    const formatted: string = formatStatValue(StatType.FLAT_ATTACK, 79);
    expect(formatted).not.toContain('%');

    // Same call shape against ATTACK_BONUS (a real percent stat) MUST emit
    // a % — confirming that PERCENT_STATS routing is what determines the
    // suffix, and that FLAT_ATTACK is excluded from that set.
    const formattedPct: string = formatStatValue(StatType.ATTACK_BONUS, 0.336);
    expect(formattedPct).toContain('%');
  });
});

// =============================================================================
// C. Info pane — aggregated attribute display row reflects the bonus
// =============================================================================

describe('C. Info pane — aggregated attribute display reflects MAIN_ATTRIBUTE bonus', () => {
  it('C1: STRENGTH attribute display row receives the Darhoff 7 bonus', () => {
    const baseline = setupCatcherUnequipped();
    const baseDisplay = resolveAggregatedStats(
      CATCHER_ID,
      baseline.result.current.loadouts[SLOT_CATCHER],
      baseline.result.current.loadoutProperties[SLOT_CATCHER],
      StatOwnerType.OPERATOR,
    );
    expect(baseDisplay).not.toBeNull();
    const baseStrRow = baseDisplay!.attributes.find(a => a.stat === StatType.STRENGTH);
    expect(baseStrRow).toBeDefined();

    const equipped = setupCatcherWithDarhoff();
    const equippedDisplay = resolveAggregatedStats(
      CATCHER_ID,
      equipped.result.current.loadouts[SLOT_CATCHER],
      equipped.result.current.loadoutProperties[SLOT_CATCHER],
      StatOwnerType.OPERATOR,
    );
    expect(equippedDisplay).not.toBeNull();
    const equippedStrRow = equippedDisplay!.attributes.find(a => a.stat === StatType.STRENGTH);
    expect(equippedStrRow).toBeDefined();

    // The display row reflects the post-bonus value (raw STR × (1 + STR_BONUS)).
    // With no STRENGTH_BONUS in either loadout the raw delta equals the display
    // delta. Only MAIN_ATTRIBUTE_BOOST_S contributes STR (ASSAULT_ARMAMENT_PREP
    // is flat ATK, not main attribute).
    const delta = equippedStrRow!.value - baseStrRow!.value;
    expect(delta).toBe(MAIN_BOOST_S_VALUES[8]);
  });

  it('C2: WILL (secondary) attribute display row is unchanged', () => {
    const baseline = setupCatcherUnequipped();
    const baseDisplay = resolveAggregatedStats(
      CATCHER_ID,
      baseline.result.current.loadouts[SLOT_CATCHER],
      baseline.result.current.loadoutProperties[SLOT_CATCHER],
      StatOwnerType.OPERATOR,
    );
    const baseWillRow = baseDisplay!.attributes.find(a => a.stat === StatType.WILL);

    const equipped = setupCatcherWithDarhoff();
    const equippedDisplay = resolveAggregatedStats(
      CATCHER_ID,
      equipped.result.current.loadouts[SLOT_CATCHER],
      equipped.result.current.loadoutProperties[SLOT_CATCHER],
      StatOwnerType.OPERATOR,
    );
    const equippedWillRow = equippedDisplay!.attributes.find(a => a.stat === StatType.WILL);

    expect(equippedWillRow!.value).toBe(baseWillRow!.value);
  });

  it('C3: no MAIN_ATTRIBUTE / SECONDARY_ATTRIBUTE rows appear in the display set', () => {
    const { result } = setupCatcherWithDarhoff();
    const display = resolveAggregatedStats(
      CATCHER_ID,
      result.current.loadouts[SLOT_CATCHER],
      result.current.loadoutProperties[SLOT_CATCHER],
      StatOwnerType.OPERATOR,
    );
    expect(display).not.toBeNull();
    expect(display!.attributes.some(a => a.stat === StatType.MAIN_ATTRIBUTE)).toBe(false);
    expect(display!.attributes.some(a => a.stat === StatType.SECONDARY_ATTRIBUTE)).toBe(false);
  });
});
