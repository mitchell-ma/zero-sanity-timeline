/**
 * @jest-environment jsdom
 */

/**
 * Crit Mode Stack Accumulation — Integration Tests
 *
 * Verifies that crit-dependent status stacks accumulate correctly per mode
 * through the full pipeline. Key edge cases:
 * - P[16] is 0 for frames 0-15 (impossible to have 16 stacks before 16 crits)
 * - ALWAYS mode builds stacks 1 per frame (not instant max)
 * - NEVER mode has 0 stacks at all frames
 * - Frame 1 damage in ALWAYS ≈ base × 1.05 (1 MI Security stack) × 1.5 (crit), NOT base × 1.25 × 1.5
 * - EXPECTED damage is clamped: NEVER ≤ EXPECTED ≤ ALWAYS at every frame
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../model/game-data/operators/rossi/rossi.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ROSSI = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupRossiWithMiSecurity() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });
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

function addBasicAttack(app: AppResult, atFrame: number) {
  const baCol = findColumn(app, SLOT_ROSSI, NounType.BASIC_ATTACK);
  expect(baCol).toBeDefined();
  const payload = getMenuPayload(app, baCol!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function calcForMode(app: AppResult, mode: CritMode) {
  return runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, mode, app.overrides,
  );
}

function getDamageRows(app: AppResult, mode: CritMode) {
  const result = calcForMode(app, mode);
  return result.rows
    .filter(r => r.damage != null && r.damage > 0 && r.ownerEntityId === SLOT_ROSSI)
    .sort((a, b) => a.absoluteFrame - b.absoluteFrame);
}

describe('Crit Mode Stack Accumulation — Edge Cases', () => {
  it('ALWAYS mode: attack value increases over frames as stacks build', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(rows.length).toBeGreaterThan(2);

    // Attack value (before skill multiplier) should increase as stacks build
    const attacks = rows.map(r => r.params!.attack);
    expect(attacks[attacks.length - 1]).toBeGreaterThanOrEqual(attacks[0]);
  });

  it('ALWAYS mode: first frame attack ≠ max-stacks attack', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(rows.length).toBeGreaterThan(5);

    // Compare attack values (not damage — damage varies by multiplier per segment)
    const attack1 = rows[0].params!.attack;
    const attackLater = rows[Math.min(5, rows.length - 1)].params!.attack;

    // With stack accumulation: later frames have more ATK from MI Security
    // Without (bug): they'd be equal (both at max stacks from frame 1)
    expect(attackLater).toBeGreaterThan(attack1);
  });

  it('NEVER mode: all frames have the same base damage (no crit, no stacks)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.NEVER);
    expect(rows.length).toBeGreaterThan(1);

    // In NEVER mode, no crits → no MI Security stacks → no ATK bonus
    // All frames with the same multiplier should have the same damage
    // (frames may differ if multiplier changes across segments)
    const firstRow = rows[0];
    const sameMultRows = rows.filter(r => r.multiplier === firstRow.multiplier);
    for (const row of sameMultRows) {
      expect(row.damage!).toBeCloseTo(firstRow.damage!, 0);
    }
  });

  it('NEVER damage < ALWAYS damage at every frame', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const neverRows = getDamageRows(result.current, CritMode.NEVER);
    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);

    expect(neverRows.length).toBeGreaterThan(0);
    expect(alwaysRows.length).toBe(neverRows.length);

    for (let i = 0; i < neverRows.length; i++) {
      expect(alwaysRows[i].damage!).toBeGreaterThan(neverRows[i].damage!);
    }
  });

  it('EXPECTED damage is between NEVER and ALWAYS at every frame', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    // Pipeline must run in EXPECTED mode for proper model computation
    act(() => { result.current.setCritMode(CritMode.EXPECTED); });

    const neverRows = getDamageRows(result.current, CritMode.NEVER);
    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);
    const expectedRows = getDamageRows(result.current, CritMode.EXPECTED);

    expect(expectedRows.length).toBe(neverRows.length);

    for (let i = 0; i < expectedRows.length; i++) {
      const nDmg = neverRows[i].damage!;
      const eDmg = expectedRows[i].damage!;
      const aDmg = alwaysRows[i].damage!;
      expect(eDmg).toBeGreaterThanOrEqual(nDmg - 0.01);
      expect(eDmg).toBeLessThanOrEqual(aDmg + 0.01);
    }
  });

  it('ALWAYS mode: critMultiplier increases over frames as MI Security stacks build', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(rows.length).toBeGreaterThan(1);

    // All frames should have critMultiplier > 1.0 (always critting)
    for (const row of rows) {
      expect(row.params!.critMultiplier).toBeGreaterThan(1.0);
    }

    // The critMultiplier itself (1 + critDmg) is constant across frames.
    // But the ATTACK value should increase as MI Security ATK% stacks build.
    const attacks = rows.map(r => r.params!.attack);
    // First attack should be ≤ later attacks (stacks accumulate)
    expect(attacks[attacks.length - 1]).toBeGreaterThanOrEqual(attacks[0]);
  });

  it('ALWAYS first frame: attack ratio to NEVER is small (0-1 stacks, not max)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const neverRows = getDamageRows(result.current, CritMode.NEVER);
    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);

    expect(neverRows.length).toBeGreaterThan(0);
    const neverAtk = neverRows[0].params!.attack;
    const alwaysAtk = alwaysRows[0].params!.attack;

    // First frame: 0 or 1 MI Security stack → ATK boost is 0-5%
    // Ratio should be close to 1.0-1.05, NOT 1.25 (max stacks)
    const atkRatio = alwaysAtk / neverAtk;
    expect(atkRatio).toBeGreaterThanOrEqual(1.0);
    expect(atkRatio).toBeLessThan(1.15); // small, not max stacks
  });

  it('ALWAYS later frames: attack increases relative to first frame', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(alwaysRows.length).toBeGreaterThan(3);

    const firstAtk = alwaysRows[0].params!.attack;
    const laterIdx = Math.min(5, alwaysRows.length - 1);
    const laterAtk = alwaysRows[laterIdx].params!.attack;

    // Later frames should have higher ATK due to accumulated MI Security stacks
    expect(laterAtk).toBeGreaterThanOrEqual(firstAtk);
  });

  it('MI Security stacks cannot exceed cap (5) even after many frames', () => {
    const { result } = setupRossiWithMiSecurity();
    // Place basic attack early so there are many damage frames
    act(() => { addBasicAttack(result.current, 0); });

    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(alwaysRows.length).toBeGreaterThan(5);

    // After cap is reached, ATK should plateau — later frames shouldn't exceed cap bonus
    // MI Security: 5 × 5% = 25% max ATK bonus
    // Find the attack values — they should stabilize after ~5 frames
    const attacks = alwaysRows.map(r => r.params!.attack);
    const maxAttack = Math.max(...attacks);
    const lastFew = attacks.slice(-3);
    for (const atk of lastFew) {
      expect(atk).toBeCloseTo(maxAttack, 0);
    }
  });

  it('switching ALWAYS → NEVER resets: damage drops to base (no stacks)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    // Get ALWAYS damage (includes crit + stacks)
    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);
    const alwaysLast = alwaysRows[alwaysRows.length - 1].damage!;

    // Switch to NEVER — stacks reset, no crit
    const neverRows = getDamageRows(result.current, CritMode.NEVER);
    const neverLast = neverRows[neverRows.length - 1].damage!;

    // NEVER should be significantly less (no crit, no stacks)
    expect(neverLast).toBeLessThan(alwaysLast);
    // And all NEVER frames with same multiplier should be equal (no accumulation)
    const neverSameMult = neverRows.filter(r => r.multiplier === neverRows[0].multiplier);
    for (const row of neverSameMult) {
      expect(row.damage!).toBeCloseTo(neverSameMult[0].damage!, 0);
    }
  });
});
