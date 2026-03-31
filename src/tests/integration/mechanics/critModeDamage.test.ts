/**
 * @jest-environment jsdom
 */

/**
 * Crit Mode Damage — Integration Test
 *
 * Verifies that different CritModes produce different damage values.
 * Uses runCalculation directly (same as CombatSheet) to compare
 * NEVER vs ALWAYS damage output.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { findColumn, getMenuPayload } from '../helpers';

const SLOT_LAEVATAIN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

describe('Crit Mode Damage — NEVER vs ALWAYS produce different damage', () => {
  it('ALWAYS mode damage > NEVER mode damage for the same frame', () => {
    const { result } = renderHook(() => useApp());

    // Add a battle skill
    const bsCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE_SKILL);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Run calculation with NEVER
    act(() => { result.current.setCritMode(CritMode.NEVER); });
    const neverResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    const neverDamageRows = neverResult.rows.filter(r => r.damage != null && r.damage > 0);
    expect(neverDamageRows.length).toBeGreaterThan(0);

    // Run calculation with ALWAYS
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    const alwaysResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.ALWAYS,
      result.current.overrides,
    );
    const alwaysDamageRows = alwaysResult.rows.filter(r => r.damage != null && r.damage > 0);
    expect(alwaysDamageRows.length).toBeGreaterThan(0);

    // Total damage should differ: ALWAYS > NEVER (crit adds 50% base crit damage)
    const neverTotal = neverDamageRows.reduce((sum, r) => sum + (r.damage ?? 0), 0);
    const alwaysTotal = alwaysDamageRows.reduce((sum, r) => sum + (r.damage ?? 0), 0);

    expect(alwaysTotal).toBeGreaterThan(neverTotal);

    // Per-frame: every ALWAYS frame should have higher or equal damage
    // (equal only if the frame can't crit, e.g. DOT)
    for (let i = 0; i < Math.min(neverDamageRows.length, alwaysDamageRows.length); i++) {
      const neverDmg = neverDamageRows[i].damage!;
      const alwaysDmg = alwaysDamageRows[i].damage!;
      expect(alwaysDmg).toBeGreaterThanOrEqual(neverDmg);
    }
  });

  it('EXPECTED mode damage is between NEVER and ALWAYS', () => {
    const { result } = renderHook(() => useApp());

    // Add a battle skill
    const bsCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE_SKILL);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // NEVER
    const neverResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    const neverTotal = neverResult.rows.reduce((sum, r) => sum + (r.damage ?? 0), 0);

    // ALWAYS
    const alwaysResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.ALWAYS,
      result.current.overrides,
    );
    const alwaysTotal = alwaysResult.rows.reduce((sum, r) => sum + (r.damage ?? 0), 0);

    // EXPECTED
    act(() => { result.current.setCritMode(CritMode.EXPECTED); });
    const expectedResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.EXPECTED,
      result.current.overrides,
    );
    const expectedTotal = expectedResult.rows.reduce((sum, r) => sum + (r.damage ?? 0), 0);

    // NEVER ≤ EXPECTED ≤ ALWAYS
    expect(neverTotal).toBeGreaterThan(0);
    expect(alwaysTotal).toBeGreaterThan(neverTotal);
    expect(expectedTotal).toBeGreaterThanOrEqual(neverTotal - 0.01);
    expect(expectedTotal).toBeLessThanOrEqual(alwaysTotal + 0.01);
  });

  it('critMultiplier differs between NEVER and ALWAYS in DamageParams', () => {
    const { result } = renderHook(() => useApp());

    const bsCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE_SKILL);
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // NEVER: critMultiplier should be 1.0
    const neverResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    const neverRow = neverResult.rows.find(r => r.params != null);
    expect(neverRow).toBeDefined();
    expect(neverRow!.params!.critMultiplier).toBeCloseTo(1.0);

    // ALWAYS: critMultiplier should be > 1.0 (1 + critDmg)
    const alwaysResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.ALWAYS,
      result.current.overrides,
    );
    const alwaysRow = alwaysResult.rows.find(r => r.params != null);
    expect(alwaysRow).toBeDefined();
    expect(alwaysRow!.params!.critMultiplier).toBeGreaterThan(1.0);
  });
});
