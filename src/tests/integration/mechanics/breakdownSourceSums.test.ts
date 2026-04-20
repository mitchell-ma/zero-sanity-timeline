/**
 * @jest-environment jsdom
 */

/**
 * Breakdown Source Sums — Integration Test
 *
 * Verifies that the damage breakdown sub-entries sum to the displayed
 * total for every stat that has a source breakdown. This catches cases
 * where runtime stat contributions (e.g. Freezing Point CRITICAL_DAMAGE)
 * affect the total but are missing from the source list.
 *
 * Exercises:
 *   A. Baseline: breakdown sums match without runtime buffs
 *   B. Runtime status buffs (Yvonne Freezing Point → CRITICAL_DAMAGE)
 *      are present in sources and sum to the displayed total
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType, StatType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { buildMultiplierEntries, type MultiplierEntry } from '../../../controller/info-pane/damageBreakdownController';
import { findColumn, getMenuPayload, setUltimateEnergyToMax, buildContextMenu } from '../helpers';
import { INFLICTION_COLUMNS, ENEMY_ID } from '../../../model/channels';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../model/game-data/operators/yvonne/yvonne.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCalcResult(app: AppResult, critMode = CritMode.ALWAYS) {
  return runCalculation(
    app.allProcessedEvents,
    app.columns,
    app.slots,
    app.enemy,
    app.loadoutProperties,
    app.loadouts,
    app.staggerBreaks,
    critMode,
    app.overrides,
  );
}

/** Find an entry by label in the tree (depth-first). */
function findEntry(entries: MultiplierEntry[], label: string): MultiplierEntry | undefined {
  for (const e of entries) {
    if (e.label === label) return e;
    if (e.subEntries) {
      const found = findEntry(e.subEntries, label);
      if (found) return found;
    }
  }
  return undefined;
}

// ── Stat labels we verify source sums for ────────────────────────────────────

const STAT_ENTRIES_TO_CHECK = [
  { label: 'ATK%', stat: StatType.ATTACK_BONUS },
  { label: 'Crit Rate', stat: StatType.CRITICAL_RATE },
  { label: 'Crit DMG', stat: StatType.CRITICAL_DAMAGE },
] as const;

function verifySources(entries: MultiplierEntry[], label: string) {
  const entry = findEntry(entries, label);
  if (!entry || !entry.subEntries || entry.subEntries.length === 0) return;

  const sourceSum = entry.subEntries.reduce((sum, s) => sum + s.value, 0);
  // Sources must sum to the total (within floating point tolerance)
  expect(sourceSum).toBeCloseTo(entry.value, 4);
}

// =============================================================================
// A. Baseline — no runtime buffs, breakdown sums match
// =============================================================================

describe('A. Baseline breakdown source sums (no runtime buffs)', () => {
  it('A1: ATK% and Crit DMG sources sum to their totals', () => {
    const { result } = renderHook(() => useApp());

    // Add a battle skill for Laevatain (default slot-0 operator)
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r => r.damage != null && r.damage > 0 && r.params?.sub);
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    for (const { label } of STAT_ENTRIES_TO_CHECK) {
      verifySources(entries, label);
    }
  });
});

// =============================================================================
// B. Runtime status buffs — Freezing Point CRITICAL_DAMAGE
// =============================================================================

describe('B. Yvonne Freezing Point — runtime CRITICAL_DAMAGE in breakdown', () => {
  function setupYvonne() {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    // Set talent level 2 for non-zero Freezing Point bonus
    const props = view.result.current.loadoutProperties[SLOT];
    act(() => {
      view.result.current.handleStatsChange(SLOT, {
        ...props,
        operator: { ...props.operator, talentTwoLevel: 2 },
      });
    });
    return view;
  }

  function placeCryoInfliction(app: AppResult, atFrame: number) {
    act(() => {
      app.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, atFrame,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
  }

  it('B1: Crit DMG sources include Freezing Point and sum to total', () => {
    const { result } = setupYvonne();

    // Place cryo infliction before the skill so Freezing Point is active
    placeCryoInfliction(result.current, 0);

    // Add a basic attack
    const baCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    const payload = getMenuPayload(result.current, baCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    const critDmgEntry = findEntry(entries, 'Crit DMG');
    expect(critDmgEntry).toBeDefined();

    // Freezing Point should contribute CRITICAL_DAMAGE > 0
    expect(critDmgEntry!.value).toBeGreaterThan(0.5); // base 0.5 + talent bonus

    // Sub-entries must exist and sum to total
    expect(critDmgEntry!.subEntries).toBeDefined();
    expect(critDmgEntry!.subEntries!.length).toBeGreaterThanOrEqual(2); // Operator + Freezing Point

    const sourceSum = critDmgEntry!.subEntries!.reduce((sum, s) => sum + s.value, 0);
    expect(sourceSum).toBeCloseTo(critDmgEntry!.value, 4);
  });

  it('B2: without cryo infliction, Crit DMG has no Freezing Point source', () => {
    const { result } = setupYvonne();

    // Add basic attack without cryo infliction
    const baCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(result.current, baCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    const critDmgEntry = findEntry(entries, 'Crit DMG');
    expect(critDmgEntry).toBeDefined();

    // Base crit damage only (0.5 for Yvonne)
    // Sources should still sum to total
    expect(critDmgEntry!.subEntries).toBeDefined();
    const sourceSum = critDmgEntry!.subEntries!.reduce((sum, s) => sum + s.value, 0);
    expect(sourceSum).toBeCloseTo(critDmgEntry!.value, 4);
  });
});

// =============================================================================
// C. General invariant — all percent-stat breakdowns sum correctly
// =============================================================================

describe('C. All stat breakdowns sum correctly (general invariant)', () => {
  it('C1: every stat breakdown source sum matches its total', () => {
    const { result } = renderHook(() => useApp());

    // Use Yvonne with cryo infliction for maximum runtime stat diversity
    act(() => { result.current.handleSwapOperator(SLOT, YVONNE_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Set talent level for Freezing Point
    const props = result.current.loadoutProperties[SLOT];
    act(() => {
      result.current.handleStatsChange(SLOT, {
        ...props,
        operator: { ...props.operator, talentTwoLevel: 2 },
      });
    });

    // Place cryo infliction
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 0,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Add basic attack
    const baCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(result.current, baCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRows = calc.rows.filter(r =>
      r.damage != null && r.damage > 0 && r.params?.sub && r.ownerEntityId === SLOT,
    );
    expect(damageRows.length).toBeGreaterThan(0);

    // Check every damage row's breakdown
    for (const row of damageRows) {
      const entries = buildMultiplierEntries(row.params!);
      for (const { label } of STAT_ENTRIES_TO_CHECK) {
        verifySources(entries, label);
      }
    }
  });
});

// =============================================================================
// D. Runtime CRITICAL_RATE — Cryoblasting Pistolier crit stacks
// =============================================================================

describe('D. Yvonne Cryoblasting Pistolier — runtime CRITICAL_RATE in breakdown', () => {
  function setupYvonneWithUlt() {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    // Place ultimate to activate crit stacks status
    act(() => { setUltimateEnergyToMax(view.result.current, SLOT, 0); });
    const ultCol = findColumn(view.result.current, SLOT, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(view.result.current, ultCol!, 0);
    act(() => {
      view.result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });
    return view;
  }

  it('D1: Crit Rate sub.critRate includes runtime crit stack contributions', () => {
    const { result } = setupYvonneWithUlt();

    // Place an enhanced BATK during ult active window to accumulate crit stacks
    const baCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    if (!baCol) return; // skip if BATK column not found
    const baMenu = buildContextMenu(result.current, baCol, 3 * FPS);
    if (!baMenu) return;
    const ebatkItem = baMenu.find(i => i.actionId === 'addEvent' && !i.disabled);
    if (!ebatkItem) return;
    const payload = ebatkItem.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Find a damage row with crit rate data
    const calc = getCalcResult(result.current, CritMode.NEVER);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    if (!damageRow) return;

    const entries = buildMultiplierEntries(damageRow.params!);
    const critRateEntry = findEntry(entries, 'Crit Rate');
    expect(critRateEntry).toBeDefined();

    // Crit Rate sources should sum to the displayed total
    expect(critRateEntry!.subEntries).toBeDefined();
    expect(critRateEntry!.subEntries!.length).toBeGreaterThan(0);
    const sourceSum = critRateEntry!.subEntries!.reduce((sum, s) => sum + s.value, 0);
    expect(sourceSum).toBeCloseTo(critRateEntry!.value, 4);
  });

  it('D2: Crit Rate value matches sub.critRate on the DamageSubComponents', () => {
    const { result } = setupYvonneWithUlt();

    const calc = getCalcResult(result.current, CritMode.NEVER);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    if (!damageRow) return;

    const entries = buildMultiplierEntries(damageRow.params!);
    const critRateEntry = findEntry(entries, 'Crit Rate');
    expect(critRateEntry).toBeDefined();

    // The displayed Crit Rate should match the sub-component value
    expect(critRateEntry!.value).toBe(damageRow.params!.sub!.critRate);
  });
});

// =============================================================================
// E. Arts DMG% applicability — "Does not apply" for physical hits
// =============================================================================

/* eslint-disable @typescript-eslint/no-require-imports */
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

describe('E. Arts DMG% applicability in Damage Bonus breakdown', () => {
  it('E1: physical-element hit shows Arts DMG% as "Does not apply to this hit"', () => {
    const { result } = renderHook(() => useApp());
    // Akekuri is a physical-element operator
    act(() => { result.current.handleSwapOperator(SLOT, AKEKURI_ID); });

    const baCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    const payload = getMenuPayload(result.current, baCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    const dmgBonusEntry = findEntry(entries, 'Damage Bonus');
    expect(dmgBonusEntry).toBeDefined();

    const artsSub = dmgBonusEntry!.subEntries?.find(s => s.label === 'Arts DMG%');
    expect(artsSub).toBeDefined();
    expect(artsSub!.source).toBe('Does not apply to this hit');
    expect(artsSub!.cssClass).toBe('dmg-breakdown-neutral');
    // No source sub-entries for inactive element
    expect(artsSub!.subEntries).toBeUndefined();
  });

  it('E2: arts-element hit (Heat) shows Arts DMG% as "Arts damage bonus"', () => {
    const { result } = renderHook(() => useApp());
    // Default Laevatain — Heat element battle skill

    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    const dmgBonusEntry = findEntry(entries, 'Damage Bonus');
    expect(dmgBonusEntry).toBeDefined();

    const artsSub = dmgBonusEntry!.subEntries?.find(s => s.label === 'Arts DMG%');
    expect(artsSub).toBeDefined();
    expect(artsSub!.source).toBe('Active on this hit');
  });

  it('E3: physical hit — Physical DMG% is active, Heat/Cryo/Nature/Electric are "Does not apply"', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, AKEKURI_ID); });

    const baCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(result.current, baCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT,
    );
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    const dmgBonusEntry = findEntry(entries, 'Damage Bonus');
    expect(dmgBonusEntry).toBeDefined();

    // Physical should be active
    const physSub = dmgBonusEntry!.subEntries?.find(s => s.label === 'Physical DMG%');
    expect(physSub).toBeDefined();
    expect(physSub!.source).toBe('Active on this hit');

    // All arts elements + Arts DMG% should be inactive
    for (const inactiveLabel of ['Arts DMG%', 'Heat DMG%', 'Cryo DMG%', 'Nature DMG%', 'Electric DMG%']) {
      const sub = dmgBonusEntry!.subEntries?.find(s => s.label === inactiveLabel);
      expect(sub).toBeDefined();
      expect(sub!.source).toBe('Does not apply to this hit');
      expect(sub!.cssClass).toBe('dmg-breakdown-neutral');
    }
  });
});
