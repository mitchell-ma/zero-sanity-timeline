/**
 * @jest-environment jsdom
 */

/**
 * Antal — Focus P5 Empowered Integration Test
 *
 * The FOCUS status has two segments whose durations depend on the source operator's Potential:
 *   - Segment 1 (Focus):           60s at P0-P4, 20s at P5
 *   - Segment 2 (Empowered Focus): 0s at P0-P4, 40s at P5
 *
 * Zero-duration segments are pruned by the engine, so at P0-P4 only one segment remains.
 *
 * Three-layer verification:
 * - Controller: correct status ID on processed events
 * - Controller: correct segment structure (count, durations)
 * - View: status appears in enemy status column
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { NounType } from '../../../../dsl/semantics';
import { CritMode, ElementType, StatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { ENEMY_ID } from '../../../../model/channels';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../../view/InformationPane';
import type { LoadoutProperties } from '../../../../view/InformationPane';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { buildMultiplierEntries } from '../../../../controller/info-pane/damageBreakdownController';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ANTAL_ID: string = require('../../../../model/game-data/operators/antal/antal.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ANTAL = 'slot-2';

function setupAntal(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ANTAL, ANTAL_ID); });
  if (potential !== DEFAULT_LOADOUT_PROPERTIES.operator.potential) {
    const stats: LoadoutProperties = {
      ...DEFAULT_LOADOUT_PROPERTIES,
      operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential },
    };
    act(() => { view.result.current.handleStatsChange(SLOT_ANTAL, stats); });
  }
  return view;
}

function placeBattleSkill(result: { current: AppResult }) {
  const col = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, 2 * FPS);
  act(() => {
    result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('Antal — Focus P5 Empowered', () => {
  it('P5: battle skill applies FOCUS with 2 segments (Focus 20s + Empowered 40s)', () => {
    const { result } = setupAntal(5);
    placeBattleSkill(result);

    const focusEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === StatusType.FOCUS,
    );
    expect(focusEvents).toHaveLength(1);
    const ev = focusEvents[0];

    // Two segments: Focus (20s) + Empowered Focus (40s)
    expect(ev.segments).toHaveLength(2);
    expect(ev.segments[0].properties.duration).toBe(20 * FPS);
    expect(ev.segments[1].properties.duration).toBe(40 * FPS);

  });

  it('P0: battle skill applies FOCUS with single 60s segment (empowered segment pruned)', () => {
    const { result } = setupAntal(0);
    placeBattleSkill(result);

    const focusEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === StatusType.FOCUS,
    );
    expect(focusEvents).toHaveLength(1);
    const ev = focusEvents[0];

    // Single segment: Focus (60s) — empowered segment has duration 0 at P0 and is pruned
    expect(ev.segments).toHaveLength(1);
    expect(ev.segments[0].properties.duration).toBe(60 * FPS);
  });

  // ─── End-to-end: FOCUS segment clauses contribute susceptibility to damage ──
  // APPLY STAT SUSCEPTIBILITY inside segments[i].clause dispatches at segment
  // start, writing per-element deltas to the enemy's stat accumulator. The
  // damage formula reads these via buildSusceptibilityStatSources.
  it('E2E P5: Antal BS ELECTRIC damage is multiplied 1.10× by Focus seg susceptibility (SL12)', () => {
    const { result } = setupAntal(5);
    placeBattleSkill(result);

    const app = result.current;
    const calc = runCalculation(
      app.allProcessedEvents, app.columns, app.slots, app.enemy,
      app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
    );
    const electricRows = calc.rows.filter(
      r => r.ownerEntityId === SLOT_ANTAL
        && r.columnId === NounType.BATTLE
        && r.element === ElementType.ELECTRIC
        && r.params != null,
    );
    expect(electricRows.length).toBeGreaterThan(0);
    // Focus seg (0-20s) @ SL12 → +10% ELECTRIC susceptibility → 1.10× multiplier.
    for (const row of electricRows) {
      expect(row.params!.susceptibilityMultiplier).toBeCloseTo(1.10, 5);
    }

    // Breakdown info pane: Susceptibility line shows 1.10× with a Focus-labelled
    // per-element sub-entry for ELECTRIC.
    const entries = buildMultiplierEntries(electricRows[0].params!);
    const suscEntry = entries.find(e => e.label === 'Susceptibility');
    expect(suscEntry).toBeDefined();
    expect(suscEntry!.value).toBeCloseTo(1.10, 5);
    const electricSub = suscEntry!.subEntries?.find(s => s.label.toLowerCase().includes('electric'));
    expect(electricSub).toBeDefined();
    expect(electricSub!.subEntries?.some(ss => ss.label.toUpperCase().includes('FOCUS') || ss.label.toUpperCase().includes('ANTAL'))).toBe(true);
  });

  // Even on a HEAT damage frame from a different operator, the breakdown's
  // Susceptibility row must still expose ELECTRIC source attribution from
  // FOCUS — non-applicable elements show their sources, marked inactive.
  it('E2E: Laevatain HEAT damage breakdown still surfaces ELECTRIC FOCUS source (non-applicable element)', () => {
    const SLOT_LAEV = 'slot-0';
    const { result } = setupAntal(5);

    // Antal BS → applies FOCUS (ELECTRIC + HEAT susceptibility on enemy).
    placeBattleSkill(result);

    // Laevatain BS at frame 300 (5s) — well inside FOCUS Focus segment (2-22s).
    const laevCol = findColumn(result.current, SLOT_LAEV, NounType.BATTLE);
    expect(laevCol).toBeDefined();
    const laevPayload = getMenuPayload(result.current, laevCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(laevPayload.ownerEntityId, laevPayload.columnId, laevPayload.atFrame, laevPayload.defaultSkill);
    });

    const app = result.current;
    const calc = runCalculation(
      app.allProcessedEvents, app.columns, app.slots, app.enemy,
      app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
    );
    const heatRows = calc.rows.filter(
      r => r.ownerEntityId === SLOT_LAEV
        && r.columnId === NounType.BATTLE
        && r.element === ElementType.HEAT
        && r.params != null,
    );
    expect(heatRows.length).toBeGreaterThan(0);

    // Multiplier reflects the HEAT branch of FOCUS (10% at SL12 Focus seg).
    expect(heatRows[0].params!.susceptibilityMultiplier).toBeCloseTo(1.10, 5);

    // Breakdown: Susceptibility entry has per-element sub-entries for ALL
    // elements (Physical, Arts, Heat, Cryo, Nature, Electric). The ELECTRIC
    // entry must carry FOCUS source attribution even though this is a HEAT hit.
    const entries = buildMultiplierEntries(heatRows[0].params!);
    const suscEntry = entries.find(e => e.label === 'Susceptibility');
    expect(suscEntry).toBeDefined();
    const electricSub = suscEntry!.subEntries?.find(s => s.label.toLowerCase().includes('electric'));
    expect(electricSub).toBeDefined();
    expect(electricSub!.source).toBe('Does not apply to this hit');
    expect(electricSub!.cssClass).toBe('dmg-breakdown-neutral');
    expect(electricSub!.subEntries?.length).toBeGreaterThan(0);
    const electricFocusSrc = electricSub!.subEntries!.find(ss => ss.label.toUpperCase().includes('FOCUS') || ss.label.toUpperCase().includes('ANTAL'));
    expect(electricFocusSrc).toBeDefined();
    // Greyed out — even though value is positive, inactive elements stay neutral.
    expect(electricFocusSrc!.cssClass).toBe('dmg-breakdown-neutral');

    // And the active HEAT entry should also have its FOCUS source — colour-coded.
    const heatSub = suscEntry!.subEntries?.find(s => s.label.toLowerCase() === 'heat');
    expect(heatSub).toBeDefined();
    expect(heatSub!.source).toBe('Active element');
    const heatFocusSrc = heatSub!.subEntries?.find(ss => ss.label.toUpperCase().includes('FOCUS') || ss.label.toUpperCase().includes('ANTAL'));
    expect(heatFocusSrc).toBeDefined();
    expect(heatFocusSrc!.cssClass).toBe('dmg-breakdown-positive');
  });

  it('E2E P0: Antal BS ELECTRIC damage is multiplied 1.10× by Focus susceptibility (SL12, single segment)', () => {
    const { result } = setupAntal(0);
    placeBattleSkill(result);

    const app = result.current;
    const calc = runCalculation(
      app.allProcessedEvents, app.columns, app.slots, app.enemy,
      app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
    );
    const electricRows = calc.rows.filter(
      r => r.ownerEntityId === SLOT_ANTAL
        && r.columnId === NounType.BATTLE
        && r.element === ElementType.ELECTRIC
        && r.params != null,
    );
    expect(electricRows.length).toBeGreaterThan(0);
    // Single Focus segment @ SL12 → +10% ELECTRIC susceptibility.
    for (const row of electricRows) {
      expect(row.params!.susceptibilityMultiplier).toBeCloseTo(1.10, 5);
    }
  });
});
