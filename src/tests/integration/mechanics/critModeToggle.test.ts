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
import { hasDealDamageClause } from '../../../controller/timeline/clauseQueries';
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
    view.result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
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
          if (!hasDealDamageClause(f.clauses)) continue;
          expect(f.isCrit).toBe(false);
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

  it('Explicit MANUAL pins survive NEVER/ALWAYS/EXPECTED mode switches', () => {
    const { result } = setupWithBattleSkill();

    // Enter MANUAL mode and pin a few damage frames explicitly. The pins
    // live in the override store; isCrit on processed frames is a per-run
    // display field resolved from the override.
    act(() => { result.current.setCritMode(CritMode.MANUAL); });

    const damageFrames: { eventUid: string; segmentIndex: number; frameIndex: number; value: boolean }[] = [];
    for (const ev of result.current.allProcessedEvents) {
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        if (!seg.frames) continue;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          if (!hasDealDamageClause(seg.frames[fi].clauses)) continue;
          // Alternate true/false so we exercise both pin values
          damageFrames.push({ eventUid: ev.uid, segmentIndex: si, frameIndex: fi, value: damageFrames.length % 2 === 0 });
          if (damageFrames.length >= 4) break;
        }
        if (damageFrames.length >= 4) break;
      }
      if (damageFrames.length >= 4) break;
    }
    expect(damageFrames.length).toBeGreaterThan(0);

    act(() => {
      for (const f of damageFrames) {
        result.current.handleSetCritPins(
          [{ eventUid: f.eventUid, segmentIndex: f.segmentIndex, frameIndex: f.frameIndex }],
          f.value,
        );
      }
    });

    // Pins must show up in MANUAL mode
    for (const f of damageFrames) {
      const ev = result.current.allProcessedEvents.find(e => e.uid === f.eventUid);
      expect(ev?.segments[f.segmentIndex].frames?.[f.frameIndex].isCrit).toBe(f.value);
    }

    // Switch to NEVER — explicit pins still come back from the override store
    act(() => { result.current.setCritMode(CritMode.NEVER); });
    for (const f of damageFrames) {
      const ev = result.current.allProcessedEvents.find(e => e.uid === f.eventUid);
      expect(ev?.segments[f.segmentIndex].frames?.[f.frameIndex].isCrit).toBe(f.value);
    }

    // Switch to ALWAYS — same
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    for (const f of damageFrames) {
      const ev = result.current.allProcessedEvents.find(e => e.uid === f.eventUid);
      expect(ev?.segments[f.segmentIndex].frames?.[f.frameIndex].isCrit).toBe(f.value);
    }

    // Back to MANUAL — still preserved
    act(() => { result.current.setCritMode(CritMode.MANUAL); });
    for (const f of damageFrames) {
      const ev = result.current.allProcessedEvents.find(e => e.uid === f.eventUid);
      expect(ev?.segments[f.segmentIndex].frames?.[f.frameIndex].isCrit).toBe(f.value);
    }
  });
});
