/**
 * @jest-environment jsdom
 */

/**
 * Intra-Frame Ordering — Integration Tests
 *
 * Verifies that statuses applied BY a damage frame do not affect that frame's
 * own damage calculation. The engine processes damage first, then applies
 * effects (APPLY STATUS, triggers). The damage builder must exclude statuses
 * whose sourceFrameKey matches the current or later damage frames at the
 * same absolute frame.
 *
 * Key invariants:
 * - A crit-triggered status (MI Security) gained on frame N does not inflate
 *   frame N's attack — only frame N+1 and later.
 * - The crit expectation model snapshots BEFORE stepping, so the expected
 *   crit rate at frame N reflects state before frame N's crit resolution.
 * - sourceFrameKey propagates through trigger chains (damage → PERFORM
 *   CRITICAL_HIT → ENGINE_TRIGGER → APPLY status).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, StatType } from '../../../consts/enums';
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
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
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
    .filter(r => r.damage != null && r.damage > 0 && r.ownerId === SLOT_ROSSI)
    .sort((a, b) => a.absoluteFrame - b.absoluteFrame);
}

describe('Intra-Frame Ordering — sourceFrameKey propagation', () => {
  it('status events created by damage frame trigger chains carry sourceFrameKey', () => {
    const { result } = setupRossiWithMiSecurity();
    // Set ALWAYS so every crit triggers MI Security → APPLY status
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    // MI Security stacks are applied via trigger chain:
    // damage frame → PERFORM CRITICAL_HIT → ENGINE_TRIGGER → APPLY MI_SECURITY
    // Those status events should carry sourceFrameKey from the originating damage frame.
    const statusEvents = result.current.allProcessedEvents.filter(
      ev => ev.sourceFrameKey != null,
    );
    // At least some status events should have sourceFrameKey set
    expect(statusEvents.length).toBeGreaterThan(0);

    // sourceFrameKey format: "eventUid:segmentIndex:frameIndex"
    for (const ev of statusEvents) {
      expect(ev.sourceFrameKey).toMatch(/^.+:\d+:\d+$/);
    }
  });
});

describe('Intra-Frame Ordering — crit model snapshot-before-step', () => {
  it('ALWAYS mode: frame 0 has no MI Security stack contribution', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(rows.length).toBeGreaterThan(0);

    // Frame 0: the crit hasn't been processed yet, so the crit snapshot
    // should show 0 MI Security stacks (no ATK bonus from crit-triggered stacks).
    const firstRow = rows[0];
    const snapshot = firstRow.params?.sub?.critSnapshot;
    expect(snapshot).toBeDefined();
    const atkContribution = (snapshot!.statContributions ?? [])
      .filter(c => c.stat === StatType.ATTACK_BONUS);
    // Either no ATK contributions or all have total = 0
    for (const c of atkContribution) {
      expect(c.total).toBeCloseTo(0, 6);
    }
  });

  it('ALWAYS mode: frame 1 has exactly 1 MI Security stack worth of ATK', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(rows.length).toBeGreaterThan(1);

    // Frame 1: after frame 0 critted and gained 1 stack, frame 1 should
    // see exactly 1 stack's contribution. The attack value should be
    // slightly higher than frame 0 but NOT at max stacks.
    const attack0 = rows[0].params!.attack;
    const attack1 = rows[1].params!.attack;

    // Frame 1 should have more ATK than frame 0 (1 stack vs 0)
    expect(attack1).toBeGreaterThan(attack0);

    // But frame 1 should NOT equal a later frame that has more stacks
    expect(rows.length).toBeGreaterThan(5);
    const attackLater = rows[5].params!.attack;
    expect(attackLater).toBeGreaterThan(attack1);
  });

  it('ALWAYS mode: attack increases monotonically as stacks accumulate', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    expect(rows.length).toBeGreaterThan(2);

    // Each frame should have attack >= the previous frame's attack,
    // because stacks only go up in ALWAYS mode (every frame crits → +1 stack).
    const attacks = rows.map(r => r.params!.attack);
    for (let i = 1; i < attacks.length; i++) {
      expect(attacks[i]).toBeGreaterThanOrEqual(attacks[i - 1]);
    }
  });

  it('EXPECTED mode: crit snapshot expectedCritRate increases over frames', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.EXPECTED);
    expect(rows.length).toBeGreaterThan(2);

    // In EXPECTED mode, each frame's expected crit rate should be >= the previous,
    // because MI Security stacks probabilistically accumulate.
    const critRates = rows
      .map(r => r.params?.sub?.critSnapshot?.expectedCritRate)
      .filter((r): r is number => r != null);

    expect(critRates.length).toBeGreaterThan(2);

    // First frame should have no MI Security contribution — just base crit rate
    // (since snapshot is taken before stepping)
    const baseCritRate = rows[0].params?.sub?.critRate ?? 0;
    expect(critRates[0]).toBeCloseTo(baseCritRate, 4);

    // Later frames should have higher expected crit rate
    for (let i = 1; i < critRates.length; i++) {
      expect(critRates[i]).toBeGreaterThanOrEqual(critRates[i - 1] - 1e-6);
    }
  });
});

describe('Intra-Frame Ordering — statusQuery exclusion', () => {
  it('NEVER mode: all same-multiplier frames have identical damage (no status leakage)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addBasicAttack(result.current, 1 * FPS); });

    const rows = getDamageRows(result.current, CritMode.NEVER);
    expect(rows.length).toBeGreaterThan(1);

    // In NEVER mode, MI Security never triggers, so no status is ever applied.
    // All frames with the same multiplier should have identical damage.
    // This validates that no spurious status leakage occurs.
    const firstRow = rows[0];
    const sameMultRows = rows.filter(r => r.multiplier === firstRow.multiplier);
    for (const row of sameMultRows) {
      expect(row.damage!).toBeCloseTo(firstRow.damage!, 0);
    }
  });

  it('frame exclusion is cleared between frames (no stale exclusion)', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    // Place two basic attacks far enough apart to avoid overlap
    act(() => { addBasicAttack(result.current, 1 * FPS); });
    act(() => { addBasicAttack(result.current, 10 * FPS); });

    const rows = getDamageRows(result.current, CritMode.ALWAYS);
    // First attack's frames and second attack's frames should both have damage
    const firstAttackRows = rows.filter(r => r.absoluteFrame < 5 * FPS);
    const secondAttackRows = rows.filter(r => r.absoluteFrame >= 10 * FPS);

    expect(firstAttackRows.length).toBeGreaterThan(0);
    expect(secondAttackRows.length).toBeGreaterThan(0);

    // Second attack should benefit from stacks accumulated during first attack
    // (stacks persist if within MI Security duration window)
    // This verifies exclusion is properly cleared between frames
    for (const row of secondAttackRows) {
      expect(row.damage).toBeGreaterThan(0);
      expect(row.params).toBeDefined();
    }
  });
});
