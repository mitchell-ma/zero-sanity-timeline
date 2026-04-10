/**
 * @jest-environment jsdom
 */

/**
 * Crit Mode E2E — Rossi with MI Security + Lupine Scarlet
 *
 * Reproduces the shared loadout: Rossi (slot-0) with Lupine Scarlet weapon
 * and MI Security gear. Places a basic attack and battle skill, then tests
 * damage calculation across crit modes.
 *
 * isCrit is persistent data — only MANUAL mode modifies it.
 * NEVER/ALWAYS/EXPECTED only affect calculation via getFrameExpectation().
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { computeDamageStatistics } from '../../../controller/calculation/damageTableBuilder';
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

function addSkillEvents(app: AppResult) {
  const baCol = findColumn(app, SLOT_ROSSI, NounType.BASIC_ATTACK);
  expect(baCol).toBeDefined();
  const baPayload = getMenuPayload(app, baCol!, 1 * FPS);
  app.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill);

  const bsCol = findColumn(app, SLOT_ROSSI, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  const bsPayload = getMenuPayload(app, bsCol!, 5 * FPS);
  app.handleAddEvent(bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill);
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

function getDamageRows(app: AppResult, mode: CritMode) {
  return calcForMode(app, mode).rows
    .filter(r => r.damage != null && r.damage > 0 && r.ownerEntityId === SLOT_ROSSI)
    .sort((a, b) => a.absoluteFrame - b.absoluteFrame);
}

describe('Rossi + MI Security + Lupine Scarlet — Crit Mode E2E', () => {
  it('ALWAYS damage > NEVER damage', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverTotal = totalDamage(calcForMode(result.current, CritMode.NEVER));
    const alwaysTotal = totalDamage(calcForMode(result.current, CritMode.ALWAYS));

    expect(neverTotal).toBeGreaterThan(0);
    expect(alwaysTotal).toBeGreaterThan(neverTotal);
  });

  it('EXPECTED damage clamped: NEVER ≤ EXPECTED ≤ ALWAYS', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });
    act(() => { result.current.setCritMode(CritMode.EXPECTED); });

    const neverTotal = totalDamage(calcForMode(result.current, CritMode.NEVER));
    const alwaysTotal = totalDamage(calcForMode(result.current, CritMode.ALWAYS));
    const expectedTotal = totalDamage(calcForMode(result.current, CritMode.EXPECTED));

    expect(neverTotal).toBeGreaterThan(0);
    expect(alwaysTotal).toBeGreaterThan(neverTotal);
    expect(expectedTotal).toBeGreaterThanOrEqual(neverTotal - 0.01);
    expect(expectedTotal).toBeLessThanOrEqual(alwaysTotal + 0.01);
  });

  it('critMultiplier is 1.0 in NEVER, > 1.0 in ALWAYS', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverRow = calcForMode(result.current, CritMode.NEVER).rows.find(r => r.params != null && r.damage != null && r.damage > 0);
    const alwaysRow = calcForMode(result.current, CritMode.ALWAYS).rows.find(r => r.params != null && r.damage != null && r.damage > 0);

    expect(neverRow!.params!.critMultiplier).toBeCloseTo(1.0);
    expect(alwaysRow!.params!.critMultiplier).toBeGreaterThan(1.0);
  });

  it('Team Total differs between NEVER and ALWAYS', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverStats = computeDamageStatistics(calcForMode(result.current, CritMode.NEVER).rows, []);
    const alwaysStats = computeDamageStatistics(calcForMode(result.current, CritMode.ALWAYS).rows, []);

    expect(neverStats.teamTotalDamage).toBeGreaterThan(0);
    expect(alwaysStats.teamTotalDamage).toBeGreaterThan(neverStats.teamTotalDamage);
  });

  it('toggling modes produces consistent results', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const never1 = totalDamage(calcForMode(result.current, CritMode.NEVER));
    const always = totalDamage(calcForMode(result.current, CritMode.ALWAYS));
    const never2 = totalDamage(calcForMode(result.current, CritMode.NEVER));

    expect(always).toBeGreaterThan(never1);
    expect(never2).toBeCloseTo(never1, 2);
  });

  it('per-frame: every ALWAYS frame damage ≥ NEVER frame damage', () => {
    const { result } = setupRossiWithMiSecurity();
    act(() => { addSkillEvents(result.current); });

    const neverRows = getDamageRows(result.current, CritMode.NEVER);
    const alwaysRows = getDamageRows(result.current, CritMode.ALWAYS);

    expect(neverRows.length).toBeGreaterThan(0);
    expect(alwaysRows.length).toBe(neverRows.length);

    for (let i = 0; i < neverRows.length; i++) {
      expect(alwaysRows[i].damage!).toBeGreaterThanOrEqual(neverRows[i].damage! - 0.01);
    }
  });
});
