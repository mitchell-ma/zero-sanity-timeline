/**
 * @jest-environment jsdom
 */

/**
 * New Loadout SP Reset — Integration Test
 *
 * Repro for bug: creating a new loadout carries over SP values from the previous
 * loadout. The SP config lives on the persistent combatLoadout.commonSlot.skillPoints
 * controller (a ref that survives React state resets), so clearing resourceConfigs
 * is not sufficient — the pipeline must re-push a fresh config before running.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { FPS } from '../../../utils/timeline';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../controller/slot/commonSlotController';
import { findColumn, getMenuPayload } from '../helpers';

const SP_KEY = `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
const DEFAULT_SP_START = 200;
const DEFAULT_SP_MAX = 300;
const SLOT_AKEKURI = 'slot-1';

describe('New loadout resets SP values', () => {
  it('switching to a fresh loadout clears custom SP startValue/max', () => {
    const { result } = renderHook(() => useApp());

    // ── Baseline: confirm default SP on first loadout ───────────────────
    const initialGraph = result.current.resourceGraphs.get(SP_KEY);
    expect(initialGraph).toBeDefined();
    expect(initialGraph!.points[0].value).toBe(DEFAULT_SP_START);
    expect(initialGraph!.max).toBe(DEFAULT_SP_MAX);

    // ── Customize SP config on the active loadout ──────────────────────
    act(() => {
      result.current.handleResourceConfigChange(SP_KEY, {
        startValue: 42,
        max: 77,
        regenPerSecond: 0,
      });
    });

    const customGraph = result.current.resourceGraphs.get(SP_KEY);
    expect(customGraph).toBeDefined();
    expect(customGraph!.points[0].value).toBe(42);
    expect(customGraph!.max).toBe(77);

    // ── Create a new loadout sheet ─────────────────────────────────────
    act(() => {
      result.current.handleNewLoadout(null);
    });

    // ── Verify SP on the fresh loadout is back to defaults ─────────────
    const freshGraph = result.current.resourceGraphs.get(SP_KEY);
    expect(freshGraph).toBeDefined();
    expect(freshGraph!.points[0].value).toBe(DEFAULT_SP_START);
    expect(freshGraph!.max).toBe(DEFAULT_SP_MAX);

    // resourceConfigs state itself should also be empty
    expect(result.current.resourceConfigs[SP_KEY]).toBeUndefined();
  });

  it('switching to a fresh loadout clears SP consumption events from the old loadout', () => {
    const { result } = renderHook(() => useApp());

    // ── Add a battle skill on the first loadout ────────────────────────
    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const atFrame = 5 * FPS;
    const payload = getMenuPayload(result.current, battleCol!, atFrame);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId,
        payload.columnId,
        payload.atFrame,
        payload.defaultSkill,
      );
    });

    // Verify SP consumption appears in the graph (dip from the BS cost)
    expect(result.current.spConsumptionHistory.length).toBeGreaterThan(0);
    const oldGraph = result.current.resourceGraphs.get(SP_KEY);
    expect(oldGraph).toBeDefined();
    // Graph should have at least one point that isn't at the start value
    // (because SP was consumed by the battle skill).
    const oldMin = Math.min(...oldGraph!.points.map((p) => p.value));
    expect(oldMin).toBeLessThan(DEFAULT_SP_START);

    // ── Create a new loadout sheet ─────────────────────────────────────
    act(() => {
      result.current.handleNewLoadout(null);
    });

    // ── Verify SP graph is back to a clean baseline ────────────────────
    // No BS events, no SP consumption → graph should never dip below startValue.
    const freshGraph = result.current.resourceGraphs.get(SP_KEY);
    expect(freshGraph).toBeDefined();
    const freshMin = Math.min(...freshGraph!.points.map((p) => p.value));
    expect(freshMin).toBe(DEFAULT_SP_START);

    // Consumption history should be empty
    expect(result.current.spConsumptionHistory).toHaveLength(0);
  });
});
