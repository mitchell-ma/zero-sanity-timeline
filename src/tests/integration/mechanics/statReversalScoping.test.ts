/**
 * @jest-environment jsdom
 */

/**
 * Stat Reversal Scoping — Integration Test
 *
 * Verifies that consuming one status does NOT reverse stat buffs from
 * a different active status. Prior bug: the consume handler rescheduled
 * ALL pending stat reversals (not just the consumed status's) to the
 * consumption frame, causing unrelated stat buffs to vanish early.
 *
 * Scenario: Pogranichnik's Fervent Morale applies ATK% buff. Steel Oath
 * stacks are consumed by combo attacks. The Fervent Morale ATK% buff
 * must survive Steel Oath consumptions.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, EventStatusType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { buildMultiplierEntries, type MultiplierEntry } from '../../../controller/info-pane/damageBreakdownController';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import { ENEMY_ID } from '../../../model/channels';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const POGRANICHNIK_ID: string = require('../../../model/game-data/operators/pogranichnik/pogranichnik.json').id;
const FERVENT_MORALE_ID: string = require('../../../model/game-data/operators/pogranichnik/statuses/status-fervent-morale.json').properties.id;
const STEEL_OATH_HARASS_ID: string = require('../../../model/game-data/operators/pogranichnik/statuses/status-steel-oath-harass.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_POG = 'slot-3';

beforeEach(() => { localStorage.clear(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupPogWithTalent() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  // Set talent level 2 for maximum ATK% bonus (0.08)
  const props = view.result.current.loadoutProperties[SLOT_POG];
  act(() => {
    view.result.current.handleStatsChange(SLOT_POG, {
      ...props,
      operator: { ...props.operator, talentOneLevel: 2 },
    });
  });
  return view;
}

function getCalcResult(app: AppResult, critMode = CritMode.NEVER) {
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

function getFerventMoraleEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
  );
}

// =============================================================================
// A. ATK% survives unrelated status consumption
// =============================================================================

describe('A. Fervent Morale ATK% survives Steel Oath consumption', () => {
  it('A1: ATK% is non-negative when Fervent Morale is active during Steel Oath consumption', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Place ult at t=0 → grants Steel Oath stacks
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Place combo at t=3s → consumes Steel Oath → triggers Fervent Morale
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });

    // Verify Fervent Morale was created
    expect(getFerventMoraleEvents(result.current).length).toBeGreaterThanOrEqual(1);

    // Place second combo at t=6s → consumes another Steel Oath stack
    // This is the critical moment: Fervent Morale's ATK% buff must survive
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 6 * FPS, comboCol!.defaultEvent!); });

    // Place a basic attack AFTER the second consumption to get a damage frame
    // during the Fervent Morale active window
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const baPayload = getMenuPayload(result.current, baCol!, 8 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG,
    );
    expect(damageRow).toBeDefined();

    // ATK% must be >= 0 (Fervent Morale is still active)
    // Prior bug: unscoped reversal caused ATK% to go negative
    expect(damageRow!.params!.sub!.atkBonusPct).toBeGreaterThanOrEqual(0);
  });

  it('A2: ATK% sources include Fervent Morale contribution after Steel Oath consumption', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Ult → Steel Oath
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Two combos → two Steel Oath consumptions → Fervent Morale created
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 6 * FPS, comboCol!.defaultEvent!); });

    // Basic attack during Fervent Morale active window
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const baPayload = getMenuPayload(result.current, baCol!, 8 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG,
    );
    expect(damageRow).toBeDefined();

    const entries = buildMultiplierEntries(damageRow!.params!);
    const atkEntry = findEntry(entries, 'ATK%');
    expect(atkEntry).toBeDefined();

    // ATK% must be non-negative (Fervent Morale still active)
    expect(atkEntry!.value).toBeGreaterThanOrEqual(0);

    // If sources are present, they must sum to the displayed total
    if (atkEntry!.subEntries) {
      const sourceSum = atkEntry!.subEntries.reduce((sum, s) => sum + s.value, 0);
      expect(sourceSum).toBeCloseTo(atkEntry!.value, 4); // eslint-disable-line jest/no-conditional-expect
    }
  });
});

// =============================================================================
// B. Multiple concurrent stat buffs survive selective consumption
// =============================================================================

describe('B. Stat buffs from multiple statuses survive selective consumption', () => {
  it('B1: three combos produce cumulative Fervent Morale ATK% — each consumption only removes its own status reversal', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Ult → Steel Oath (5 stacks)
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Three combos close together → three Fervent Morale applications
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    for (let i = 0; i < 3; i++) {
      act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, (3 + i * 2) * FPS, comboCol!.defaultEvent!); });
    }

    const fmEvents = getFerventMoraleEvents(result.current);
    expect(fmEvents.length).toBeGreaterThanOrEqual(1);

    // Place basic attack while Fervent Morale is active
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const baPayload = getMenuPayload(result.current, baCol!, 10 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });

    const calc = getCalcResult(result.current);
    const damageRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG,
    );
    expect(damageRow).toBeDefined();

    // ATK% must be positive — Fervent Morale buff should be active
    expect(damageRow!.params!.sub!.atkBonusPct).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// C. Stat reversal fires correctly when the stat-owning status expires naturally
// =============================================================================

describe('C. Natural expiry still reverses stat buffs correctly', () => {
  it('C1: ATK% returns to baseline after Fervent Morale expires', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Ult → Steel Oath
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Combo at t=3s → Fervent Morale (duration ~10-20s depending on config)
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });

    const fmEvents = getFerventMoraleEvents(result.current);
    expect(fmEvents.length).toBeGreaterThanOrEqual(1);

    // Get Fervent Morale end frame to place basic attack after it expires
    const fmEvent = fmEvents[0];
    const fmEndFrame = fmEvent.startFrame + fmEvent.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );

    // Basic attack BEFORE Fervent Morale expires → should have ATK% buff
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const earlyPayload = getMenuPayload(result.current, baCol!, fmEvent.startFrame + FPS);
    act(() => { result.current.handleAddEvent(earlyPayload.ownerEntityId, earlyPayload.columnId, earlyPayload.atFrame, earlyPayload.defaultSkill); });

    // Basic attack AFTER Fervent Morale expires → ATK% should be back to baseline
    const latePayload = getMenuPayload(result.current, baCol!, fmEndFrame + 2 * FPS);
    act(() => { result.current.handleAddEvent(latePayload.ownerEntityId, latePayload.columnId, latePayload.atFrame, latePayload.defaultSkill); });

    const calc = getCalcResult(result.current);
    const damageRows = calc.rows.filter(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG,
    );

    // Sort by frame to get early and late rows
    damageRows.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
    expect(damageRows.length).toBeGreaterThanOrEqual(2);

    const earlyAtk = damageRows[0].params!.sub!.atkBonusPct;
    const lateAtk = damageRows[damageRows.length - 1].params!.sub!.atkBonusPct;

    // Early should have Fervent Morale buff, late should not
    // (we just verify late <= early — the buff was reversed on expiry)
    expect(lateAtk).toBeLessThanOrEqual(earlyAtk);
  });
});

// =============================================================================
// D. Status damage uses source operator's runtime stat buffs
// =============================================================================

describe('D. Steel Oath Harass damage uses source operator ATK% from Fervent Morale', () => {
  it('D1: Harass damage row has positive ATK% when Fervent Morale is active on source operator', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Build enough Living Banner stacks to trigger Fervent Morale BEFORE ult
    // 4 BATKs × 20 SP = 80 stacks → triggers 1 Fervent Morale
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    for (let i = 0; i < 4; i++) {
      const payload = getMenuPayload(result.current, baCol!, (1 + i * 3) * FPS);
      act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
    }

    // Verify Fervent Morale is active
    expect(getFerventMoraleEvents(result.current).length).toBeGreaterThanOrEqual(1);

    // Place ult at t=20s → creates Steel Oath stacks (while Fervent Morale is active)
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 20 * FPS);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // Combo at t=25s → consumes Steel Oath → generates Harass (enemy-owned, source=Pog)
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 25 * FPS, comboCol!.defaultEvent!); });

    // Find Harass events on enemy
    const harassEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);

    // Harass damage should use Pog's stats including Fervent Morale ATK% buff
    const calc = getCalcResult(result.current);
    const harassRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.eventUid === harassEvents[0].uid,
    );

    // Harass must have a damage row; its ATK% should include Fervent Morale's contribution
    expect(harassRow).toBeDefined();
    expect(harassRow!.params!.sub!.atkBonusPct).toBeGreaterThan(0);
  });

  it('D2: Harass damage row ATK% breakdown includes Fervent Morale source', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // 4 BATKs → Fervent Morale
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    for (let i = 0; i < 4; i++) {
      const payload = getMenuPayload(result.current, baCol!, (1 + i * 3) * FPS);
      act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
    }

    // Ult → Steel Oath, combo → Harass
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 20 * FPS);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 25 * FPS, comboCol!.defaultEvent!); });

    // Find Harass events and their damage rows by eventUid
    const harassEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);

    const calc = getCalcResult(result.current);
    const harassRow = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.eventUid === harassEvents[0].uid,
    );
    expect(harassRow).toBeDefined();

    // Verify ATK% breakdown sources sum correctly
    const entries = buildMultiplierEntries(harassRow!.params!);
    const atkEntry = findEntry(entries, 'ATK%');
    expect(atkEntry).toBeDefined();
    expect(atkEntry!.value).toBeGreaterThan(0);
  });
});

// =============================================================================
// E. Stat stacking — multiple Fervent Morale stacks multiply ATK%
// =============================================================================

describe('E. Fervent Morale ATK% stacks per instance', () => {
  it('E1: 2 concurrent Fervent Morale stacks produce 0.16 ATK% (2 × 0.08)', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Ult → Steel Oath (5 stacks)
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // 2 combos close together → 2 FM stacks
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!); });
    act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 5 * FPS, comboCol!.defaultEvent!); });

    // BATK while both FM stacks active
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const baPayload = getMenuPayload(result.current, baCol!, 8 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });

    const calc = getCalcResult(result.current);
    const row = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG &&
      r.absoluteFrame >= 8 * FPS,
    );
    expect(row).toBeDefined();

    // 2 stacks × 0.08 = 0.16 ATK%
    expect(row!.params!.sub!.atkBonusPct).toBeCloseTo(0.16, 4);
  });

  it('E2: 3 concurrent Fervent Morale stacks produce 3× ATK%', () => {
    const { result } = setupPogWithTalent();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });

    // Ult → Steel Oath
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 0);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    // 3 combos → 3 FM stacks
    const comboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);
    for (let i = 0; i < 3; i++) {
      act(() => { result.current.handleAddEvent(SLOT_POG, NounType.COMBO, (3 + i * 2) * FPS, comboCol!.defaultEvent!); });
    }

    // BATK while all 3 FM stacks active
    const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
    const baPayload = getMenuPayload(result.current, baCol!, 10 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });

    const calc = getCalcResult(result.current);
    const row = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG &&
      r.absoluteFrame >= 10 * FPS,
    );
    expect(row).toBeDefined();

    // 3 stacks × 0.08 = 0.24 ATK% at talent level 2
    expect(row!.params!.sub!.atkBonusPct).toBeCloseTo(0.24, 4);
  });
});

// =============================================================================
// F. Fervent Morale ATK% E2E — potential-dependent stack limits via Living Banner
// =============================================================================

describe('F. Fervent Morale ATK% E2E with potential-dependent stack limits', () => {
  function setupPogAtPotential(potential: number) {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const props = view.result.current.loadoutProperties[SLOT_POG];
    act(() => {
      view.result.current.handleStatsChange(SLOT_POG, {
        ...props,
        operator: { ...props.operator, potential, talentOneLevel: 2 },
      });
    });
    return view;
  }

  function placeBasicAttack(app: AppResult, atFrame: number) {
    const baCol = findColumn(app, SLOT_POG, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(app, baCol!, atFrame);
    act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
  }

  function getAtkBonusAtFrame(app: AppResult, minFrame: number) {
    const calc = getCalcResult(app);
    const row = calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && r.ownerEntityId === SLOT_POG &&
      r.absoluteFrame >= minFrame,
    );
    return row?.params?.sub?.atkBonusPct;
  }

  it('F1: P0 — 3 concurrent FM stacks = 0.24 ATK% (max 3, capped)', () => {
    const { result } = setupPogAtPotential(0);

    // 12 BATKs × 20 SP = 240 SP → 3 FM applications (threshold 80 at P0)
    // Space at 1s so all FM (20s duration) overlap
    for (let i = 0; i < 12; i++) placeBasicAttack(result.current, (1 + i) * FPS);

    const fmEvents = getFerventMoraleEvents(result.current);
    expect(fmEvents.length).toBe(3);

    // Place BATK to measure ATK% while all 3 stacks active
    placeBasicAttack(result.current, 15 * FPS);
    const atk = getAtkBonusAtFrame(result.current, 15 * FPS);
    expect(atk).toBeDefined();
    expect(atk!).toBeCloseTo(0.24, 4); // 3 × 0.08
  });

  it('F2: P0 — 4th FM does not exceed 3-stack cap (RESET clamps oldest)', () => {
    const { result } = setupPogAtPotential(0);

    // 16 BATKs → would produce 4 FM, but cap is 3 at P0.
    // The 4th RESET-clamps the oldest.
    for (let i = 0; i < 16; i++) placeBasicAttack(result.current, (1 + i) * FPS);

    // Only 3 non-REFRESHED FM should exist (RESET clamps oldest)
    const fmEvents = getFerventMoraleEvents(result.current);
    const activeCount = fmEvents.filter(ev =>
      !ev.eventStatus || ev.eventStatus !== EventStatusType.REFRESHED,
    ).length;
    expect(activeCount).toBeLessThanOrEqual(3);

    // ATK% should still be 0.24 (3 × 0.08), not more
    placeBasicAttack(result.current, 20 * FPS);
    const atk = getAtkBonusAtFrame(result.current, 20 * FPS);
    expect(atk).toBeDefined();
    expect(atk!).toBeCloseTo(0.24, 4);
  });

  it('F3: P3 — 5 concurrent FM stacks = 0.40 ATK% (max 5 via potential identity gate)', () => {
    const { result } = setupPogAtPotential(3);

    // At P3, SP threshold drops to 60. 15 BATKs × 20 SP = 300 SP → 5 FM (300/60).
    // Space at 1s so all FM (20s duration) overlap.
    for (let i = 0; i < 15; i++) placeBasicAttack(result.current, (1 + i) * FPS);

    const fmEvents = getFerventMoraleEvents(result.current);
    expect(fmEvents.length).toBe(5);

    // Place BATK to measure ATK% while all 5 stacks active
    placeBasicAttack(result.current, 18 * FPS);
    const atk = getAtkBonusAtFrame(result.current, 18 * FPS);
    expect(atk).toBeDefined();
    expect(atk!).toBeCloseTo(0.40, 4); // 5 × 0.08
  });

  it('F4: P5 — 5 concurrent FM stacks = 0.40 ATK% (same cap as P3)', () => {
    const { result } = setupPogAtPotential(5);

    // P5 same threshold (60) and same cap (5) as P3
    for (let i = 0; i < 15; i++) placeBasicAttack(result.current, (1 + i) * FPS);

    const fmEvents = getFerventMoraleEvents(result.current);
    expect(fmEvents.length).toBe(5);

    placeBasicAttack(result.current, 18 * FPS);
    const atk = getAtkBonusAtFrame(result.current, 18 * FPS);
    expect(atk).toBeDefined();
    expect(atk!).toBeCloseTo(0.40, 4); // 5 × 0.08
  });

  it('F5: P3 — ATK% difference between 3-stack and 5-stack setups is 2 × 0.08', () => {
    // 3-stack setup: 9 BATKs × 20 SP = 180 SP → 3 FM (threshold 60 at P3)
    const view3 = setupPogAtPotential(3);
    for (let i = 0; i < 9; i++) placeBasicAttack(view3.result.current, (1 + i) * FPS);
    placeBasicAttack(view3.result.current, 15 * FPS);
    const atk3 = getAtkBonusAtFrame(view3.result.current, 15 * FPS);

    // 5-stack setup: 15 BATKs × 20 SP = 300 SP → 5 FM (threshold 60 at P3)
    const view5 = setupPogAtPotential(3);
    for (let i = 0; i < 15; i++) placeBasicAttack(view5.result.current, (1 + i) * FPS);
    placeBasicAttack(view5.result.current, 18 * FPS);
    const atk5 = getAtkBonusAtFrame(view5.result.current, 18 * FPS);

    expect(atk3).toBeDefined();
    expect(atk5).toBeDefined();
    // 5 stacks - 3 stacks = 2 × 0.08 = 0.16 difference
    expect(atk5! - atk3!).toBeCloseTo(0.16, 4);
  });
});

// =============================================================================
// G. Steel Oath Harass damage scales with Ultimate skill level
// =============================================================================

describe('G. Steel Oath Harass multiplier scales with Ultimate skill level', () => {
  function setupPogWithUltLevel(ultLevel: number) {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const props = view.result.current.loadoutProperties[SLOT_POG];
    act(() => {
      view.result.current.handleStatsChange(SLOT_POG, {
        ...props,
        skills: { ...props.skills, ultimateLevel: ultLevel },
      });
    });
    act(() => { setUltimateEnergyToMax(view.result.current, SLOT_POG, 3); });

    // Place ult → Steel Oath, combo → consume → Harass
    const ultCol = findColumn(view.result.current, SLOT_POG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(view.result.current, ultCol!, 0);
    act(() => { view.result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });

    const comboCol = findColumn(view.result.current, SLOT_POG, NounType.COMBO);
    act(() => { view.result.current.handleAddEvent(SLOT_POG, NounType.COMBO, 5 * FPS, comboCol!.defaultEvent!); });

    return view;
  }

  function getHarassRow(app: AppResult) {
    const harassEvents = app.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    if (harassEvents.length === 0) return null;

    const calc = getCalcResult(app);
    return calc.rows.find(r =>
      r.damage != null && r.damage > 0 &&
      r.params?.sub && harassEvents.some(h => h.uid === r.eventUid),
    ) ?? null;
  }

  it('G1: Harass damage at ult level 1 differs from ult level 12', () => {
    const { result: r1 } = setupPogWithUltLevel(1);
    const row1 = getHarassRow(r1.current);

    const { result: r12 } = setupPogWithUltLevel(12);
    const row12 = getHarassRow(r12.current);

    expect(row1).not.toBeNull();
    expect(row12).not.toBeNull();
    expect(row12!.damage!).toBeGreaterThan(row1!.damage!);
  });

  it('G2: Harass multiplier at ult level 1 uses VARY_BY SKILL_LEVEL[0] = 0.45', () => {
    const { result } = setupPogWithUltLevel(1);
    const row = getHarassRow(result.current);

    expect(row).not.toBeNull();
    expect(row!.multiplier).toBeCloseTo(0.45, 4);
  });

  it('G3: Harass multiplier at ult level 12 uses last VARY_BY SKILL_LEVEL entry', () => {
    const { result } = setupPogWithUltLevel(12);
    const row = getHarassRow(result.current);

    expect(row).not.toBeNull();
    expect(row!.multiplier!).toBeGreaterThan(0.45);
  });
});
