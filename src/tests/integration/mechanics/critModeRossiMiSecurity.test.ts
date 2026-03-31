/**
 * @jest-environment jsdom
 */

/**
 * Crit Mode E2E — Rossi with MI Security + Lupine Scarlet
 *
 * Reproduces the shared loadout: Rossi (slot-0) with Lupine Scarlet weapon
 * and MI Security gear. Places a basic attack and battle skill, then toggles
 * between crit modes and verifies:
 * 1. frame.isCrit is set correctly per mode
 * 2. Damage is clamped: NEVER ≤ EXPECTED ≤ ALWAYS
 * 3. NEVER and ALWAYS produce DIFFERENT damage (not equal)
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, DamageType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { computeDamageStatistics } from '../../../controller/calculation/damageTableBuilder';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import type { EventFrameMarker } from '../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../model/game-data/operators/rossi/rossi.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ROSSI = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

/** Set up Rossi with Lupine Scarlet weapon + MI Security gear (3-piece). */
function setupRossiWithMiSecurity() {
  const view = renderHook(() => useApp());

  // Swap in Rossi
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });

  // Equip Lupine Scarlet + MI Security 3-piece
  act(() => {
    view.result.current.handleLoadoutChange(SLOT_ROSSI, {
      weaponId: 'LUPINE_SCARLET',
      armorId: 'MI_SECURITY_ARMOR_T1',
      glovesId: 'MI_SECURITY_GLOVES_T1',
      kit1Id: 'MI_SECURITY_SCOPE_T1',
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });

  return view;
}

/** Add a basic attack + battle skill for Rossi. */
function addSkillEvents(app: AppResult) {
  // Basic attack at 1s
  const baCol = findColumn(app, SLOT_ROSSI, NounType.BASIC_ATTACK);
  expect(baCol).toBeDefined();
  const baPayload = getMenuPayload(app, baCol!, 1 * FPS);
  app.handleAddEvent(baPayload.ownerId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill);

  // Battle skill at 5s
  const bsCol = findColumn(app, SLOT_ROSSI, NounType.BATTLE_SKILL);
  expect(bsCol).toBeDefined();
  const bsPayload = getMenuPayload(app, bsCol!, 5 * FPS);
  app.handleAddEvent(bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill);
}

/** Collect all crittable damage frames. */
function getCrittableFrames(app: AppResult): { frame: EventFrameMarker; eventUid: string }[] {
  const frames: { frame: EventFrameMarker; eventUid: string }[] = [];
  for (const ev of app.allProcessedEvents) {
    for (const seg of ev.segments) {
      if (!seg.frames) continue;
      for (const f of seg.frames) {
        if (!f.damageMultiplier && !f.dealDamage) continue;
        if (f.damageType === DamageType.DAMAGE_OVER_TIME) continue;
        frames.push({ frame: f, eventUid: ev.uid });
      }
    }
  }
  return frames;
}

/** Run damage calculation for a given crit mode. */
function calcDamage(app: AppResult, mode: CritMode) {
  return runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, mode, app.overrides,
  );
}

function totalDamage(result: ReturnType<typeof runCalculation>) {
  return result.rows.reduce((sum, r) => sum + (r.damage ?? 0), 0);
}

describe('Rossi + MI Security + Lupine Scarlet — Crit Mode E2E', () => {
  it('frame.isCrit is false for all frames in NEVER mode', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });
    act(() => { result.current.setCritMode(CritMode.NEVER); });

    const frames = getCrittableFrames(result.current);
    expect(frames.length).toBeGreaterThan(0);
    for (const { frame } of frames) {
      expect(frame.isCrit).toBe(false);
    }
  });

  it('frame.isCrit is true for all frames in ALWAYS mode', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });

    const frames = getCrittableFrames(result.current);
    expect(frames.length).toBeGreaterThan(0);
    for (const { frame } of frames) {
      expect(frame.isCrit).toBe(true);
    }
  });

  it('frame.isCrit is true for all frames in EXPECTED mode (renders like ALWAYS)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });
    act(() => { result.current.setCritMode(CritMode.EXPECTED); });

    const frames = getCrittableFrames(result.current);
    expect(frames.length).toBeGreaterThan(0);
    for (const { frame } of frames) {
      expect(frame.isCrit).toBe(true);
    }
  });

  it('ALWAYS damage > NEVER damage (crit multiplier difference)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverTotal = totalDamage(calcDamage(result.current, CritMode.NEVER));
    const alwaysTotal = totalDamage(calcDamage(result.current, CritMode.ALWAYS));

    expect(neverTotal).toBeGreaterThan(0);
    expect(alwaysTotal).toBeGreaterThan(0);
    expect(alwaysTotal).toBeGreaterThan(neverTotal);
  });

  it('EXPECTED damage is clamped: NEVER ≤ EXPECTED ≤ ALWAYS', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    // Need to set EXPECTED mode so the pipeline runs with it
    // (events on timeline differ per mode due to crit trigger firing)
    act(() => { result.current.setCritMode(CritMode.EXPECTED); });
    const expectedTotal = totalDamage(calcDamage(result.current, CritMode.EXPECTED));

    act(() => { result.current.setCritMode(CritMode.NEVER); });
    const neverTotal = totalDamage(calcDamage(result.current, CritMode.NEVER));

    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    const alwaysTotal = totalDamage(calcDamage(result.current, CritMode.ALWAYS));

    expect(neverTotal).toBeGreaterThan(0);
    expect(alwaysTotal).toBeGreaterThan(neverTotal);
    expect(expectedTotal).toBeGreaterThanOrEqual(neverTotal - 0.01);
    expect(expectedTotal).toBeLessThanOrEqual(alwaysTotal + 0.01);
  });

  it('critMultiplier is 1.0 in NEVER, > 1.0 in ALWAYS', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverResult = calcDamage(result.current, CritMode.NEVER);
    const alwaysResult = calcDamage(result.current, CritMode.ALWAYS);

    const neverRow = neverResult.rows.find(r => r.params != null && r.damage != null && r.damage > 0);
    const alwaysRow = alwaysResult.rows.find(r => r.params != null && r.damage != null && r.damage > 0);

    expect(neverRow).toBeDefined();
    expect(alwaysRow).toBeDefined();
    expect(neverRow!.params!.critMultiplier).toBeCloseTo(1.0);
    expect(alwaysRow!.params!.critMultiplier).toBeGreaterThan(1.0);
  });

  it('toggling modes back and forth produces consistent results', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    // NEVER → get damage
    act(() => { result.current.setCritMode(CritMode.NEVER); });
    const neverTotal1 = totalDamage(calcDamage(result.current, CritMode.NEVER));

    // ALWAYS → get damage
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    const alwaysTotal = totalDamage(calcDamage(result.current, CritMode.ALWAYS));

    // Back to NEVER → should match first NEVER
    act(() => { result.current.setCritMode(CritMode.NEVER); });
    const neverTotal2 = totalDamage(calcDamage(result.current, CritMode.NEVER));

    expect(alwaysTotal).toBeGreaterThan(neverTotal1);
    expect(neverTotal2).toBeCloseTo(neverTotal1, 2);
  });

  it('Team Total (computeDamageStatistics) differs between NEVER and ALWAYS', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverCalc = calcDamage(result.current, CritMode.NEVER);
    const alwaysCalc = calcDamage(result.current, CritMode.ALWAYS);

    // Use computeDamageStatistics with empty tableColumns — teamTotalDamage sums all rows
    const neverStats = computeDamageStatistics(neverCalc.rows, []);
    const alwaysStats = computeDamageStatistics(alwaysCalc.rows, []);

    expect(neverStats.teamTotalDamage).toBeGreaterThan(0);
    expect(alwaysStats.teamTotalDamage).toBeGreaterThan(0);
    expect(alwaysStats.teamTotalDamage).toBeGreaterThan(neverStats.teamTotalDamage);
  });

  it('per-frame damage: every ALWAYS frame ≥ corresponding NEVER frame', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverResult = calcDamage(result.current, CritMode.NEVER);
    const alwaysResult = calcDamage(result.current, CritMode.ALWAYS);

    const neverRows = neverResult.rows.filter(r => r.damage != null && r.damage > 0);
    const alwaysRows = alwaysResult.rows.filter(r => r.damage != null && r.damage > 0);

    expect(neverRows.length).toBeGreaterThan(0);
    expect(alwaysRows.length).toBe(neverRows.length);

    for (let i = 0; i < neverRows.length; i++) {
      expect(alwaysRows[i].damage!).toBeGreaterThanOrEqual(neverRows[i].damage! - 0.01);
    }
  });
});
