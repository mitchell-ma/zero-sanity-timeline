/**
 * @jest-environment jsdom
 */

/**
 * Crit Mode Toggle — Integration Test
 *
 * Verifies that toggling CritMode affects damage calculation correctly.
 * isCrit is persistent data (only written by MANUAL pins/randomize).
 * The crit MODE affects calculation and visual presentation, not isCrit.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

const SLOT_LAEVATAIN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupWithBattleSkill() {
  const view = renderHook(() => useApp());

  const bsCol = findColumn(view.result.current, SLOT_LAEVATAIN, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  const payload = getMenuPayload(view.result.current, bsCol!, 2 * FPS);
  act(() => {
    view.result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });

  return view;
}

function calcForMode(app: AppResult, mode: CritMode) {
  return runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, mode, app.overrides,
  );
}

function totalDamage(result: ReturnType<typeof runCalculation>) {
  return result.rows.reduce((sum, r) => sum + (r.damage ?? 0), 0);
}

describe('Crit Mode Toggle — damage calculation per mode', () => {
  it('NEVER mode: critMultiplier = 1.0 on all rows', () => {
    const { result } = setupWithBattleSkill();
    const calc = calcForMode(result.current, CritMode.NEVER);
    const rowsWithParams = calc.rows.filter(r => r.params != null && r.damage != null && r.damage > 0);
    expect(rowsWithParams.length).toBeGreaterThan(0);
    for (const row of rowsWithParams) {
      expect(row.params!.critMultiplier).toBeCloseTo(1.0);
    }
  });

  it('ALWAYS mode: critMultiplier > 1.0 on all rows', () => {
    const { result } = setupWithBattleSkill();
    const calc = calcForMode(result.current, CritMode.ALWAYS);
    const rowsWithParams = calc.rows.filter(r => r.params != null && r.damage != null && r.damage > 0);
    expect(rowsWithParams.length).toBeGreaterThan(0);
    for (const row of rowsWithParams) {
      expect(row.params!.critMultiplier).toBeGreaterThan(1.0);
    }
  });

  it('ALWAYS total damage > NEVER total damage', () => {
    const { result } = setupWithBattleSkill();
    const neverTotal = totalDamage(calcForMode(result.current, CritMode.NEVER));
    const alwaysTotal = totalDamage(calcForMode(result.current, CritMode.ALWAYS));
    expect(alwaysTotal).toBeGreaterThan(neverTotal);
  });

  it('EXPECTED total damage is between NEVER and ALWAYS', () => {
    const { result } = setupWithBattleSkill();
    act(() => { result.current.setCritMode(CritMode.EXPECTED); });

    const neverTotal = totalDamage(calcForMode(result.current, CritMode.NEVER));
    const alwaysTotal = totalDamage(calcForMode(result.current, CritMode.ALWAYS));
    const expectedTotal = totalDamage(calcForMode(result.current, CritMode.EXPECTED));

    expect(expectedTotal).toBeGreaterThanOrEqual(neverTotal - 0.01);
    expect(expectedTotal).toBeLessThanOrEqual(alwaysTotal + 0.01);
  });

  it('MANUAL mode with no pins: all damage frames have isCrit = false', () => {
    const { result } = setupWithBattleSkill();
    act(() => { result.current.setCritMode(CritMode.MANUAL); });

    // MANUAL with no pins: pipeline sets isCrit = pin ?? false
    for (const ev of result.current.allProcessedEvents) {
      for (const seg of ev.segments) {
        if (!seg.frames) continue;
        for (const f of seg.frames) {
          if (f.damageMultiplier || f.dealDamage) {
            expect(f.isCrit).toBe(false);
          }
        }
      }
    }
  });

  it('toggling modes produces consistent damage totals', () => {
    const { result } = setupWithBattleSkill();

    const never1 = totalDamage(calcForMode(result.current, CritMode.NEVER));
    const always1 = totalDamage(calcForMode(result.current, CritMode.ALWAYS));
    const never2 = totalDamage(calcForMode(result.current, CritMode.NEVER));

    expect(always1).toBeGreaterThan(never1);
    expect(never2).toBeCloseTo(never1, 2);
  });

  it('isCrit is NOT modified by NEVER/ALWAYS/EXPECTED modes (persistent data)', () => {
    const { result } = setupWithBattleSkill();

    // Pin crits in MANUAL mode to set isCrit values
    act(() => { result.current.setCritMode(CritMode.MANUAL); });

    // Collect isCrit values
    const critValues = new Map<string, boolean>();
    for (const ev of result.current.allProcessedEvents) {
      for (const seg of ev.segments) {
        if (!seg.frames) continue;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const f = seg.frames[fi];
          if (f.isCrit != null) critValues.set(`${ev.uid}:${fi}`, f.isCrit);
        }
      }
    }
    expect(critValues.size).toBeGreaterThan(0);

    // Switch to NEVER — isCrit should NOT be overwritten
    act(() => { result.current.setCritMode(CritMode.NEVER); });

    for (const ev of result.current.allProcessedEvents) {
      for (const seg of ev.segments) {
        if (!seg.frames) continue;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const key = `${ev.uid}:${fi}`;
          if (critValues.has(key)) {
            // isCrit should still be the same value from MANUAL pin
            // (NEVER mode doesn't modify isCrit, only affects calculation)
            expect(seg.frames[fi].isCrit).toBe(critValues.get(key));
          }
        }
      }
    }
  });
});
