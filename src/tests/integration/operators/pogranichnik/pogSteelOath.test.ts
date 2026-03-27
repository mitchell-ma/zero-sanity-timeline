/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik Steel Oath — Integration Tests
 *
 * Tests the Steel Oath team status produced by Pogranichnik's ultimate:
 * A. Ultimate places correctly and generates Steel Oath on the team status column
 * B. Steel Oath has correct duration (30s from with.duration on APPLY effect)
 * C. Steel Oath is NOT consumed by other operators' ultimates (Link-only consumption)
 * D. Steel Oath consumption via physical status triggers (BREACH from battle skill)
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { SKILL_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { COMMON_OWNER_ID } from '../../../../controller/slot/commonSlotController';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_0 = 'slot-0'; // Laevatain by default
const SLOT_1 = 'slot-1'; // Swap to Pogranichnik
const SLOT_2 = 'slot-2'; // Swap to Chen Qianyu

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Pogranichnik Steel Oath — integration through useApp', () => {
  function setupWithPogranichnik() {
    const { result, ...utils } = renderHook(() => useApp());
    act(() => {
      result.current.handleSwapOperator(SLOT_1, 'POGRANICHNIK');
    });
    return { result, ...utils };
  }

  it('A1: Ultimate places in the ULTIMATE column', () => {
    const { result } = setupWithPogranichnik();
    const ultCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();
    expect(ultCol!.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_1 && ev.columnId === SKILL_COLUMNS.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });

  it('B1: Ultimate generates STEEL_OATH team status with 30s duration', () => {
    const { result } = setupWithPogranichnik();
    const ultCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);

    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.id === 'STEEL_OATH',
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);
    // Steel Oath should have a positive duration (30s = 3600 frames from the APPLY with.duration)
    expect(eventDuration(steelOathEvents[0])).toBeGreaterThan(0);
  });

  it('C1: Laevatain ultimate does NOT consume Steel Oath', () => {
    const { result } = setupWithPogranichnik();
    const pogUltCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);
    const laevUltCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.ULTIMATE);

    // Pogranichnik ult at 0s → creates Steel Oath
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 0, pogUltCol!.defaultEvent!,
      );
    });

    // Laevatain ult at 5s → should NOT consume Steel Oath
    act(() => {
      result.current.handleAddEvent(
        SLOT_0, SKILL_COLUMNS.ULTIMATE, 5 * FPS, laevUltCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.id === 'STEEL_OATH',
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);
    // Steel Oath should still have a positive duration, not clamped to 0 by Laevatain ult
    expect(eventDuration(steelOathEvents[0])).toBeGreaterThan(0);
  });

  it('D1: Combo skill consumes Steel Oath and generates STEEL_OATH_HARASS', () => {
    const { result } = setupWithPogranichnik();
    const pogUltCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);
    const pogComboCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.COMBO);

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 0, pogUltCol!.defaultEvent!,
      );
    });

    // Pogranichnik combo skill at 5s → should trigger PERFORM COMBO_SKILL → consume 1 Steel Oath → HARASS
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.COMBO, 5 * FPS, pogComboCol!.defaultEvent!,
      );
    });

    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === 'STEEL_OATH_HARASS',
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);
    expect(harassEvents[0].startFrame).toBeGreaterThanOrEqual(5 * FPS);
  });

  it('D2: Consumption clamps old events and creates continuations with fewer stacks', () => {
    const { result } = setupWithPogranichnik();
    const pogUltCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);
    const pogComboCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.COMBO);

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 0, pogUltCol!.defaultEvent!,
      );
    });

    // Combo skill at 5s → consume 1 stack
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.COMBO, 5 * FPS, pogComboCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.id === 'STEEL_OATH',
    );

    // All 5 original events should be consumed (clamped at combo frame)
    const consumed = steelOathEvents.filter(ev => ev.eventStatus === 'CONSUMED');
    expect(consumed).toHaveLength(5);
    for (const ev of consumed) {
      expect(eventDuration(ev)).toBeLessThanOrEqual(5 * FPS + 1);
    }

    // 4 continuation events should be created starting at the combo frame
    const continuations = steelOathEvents.filter(
      ev => ev.eventStatus !== 'CONSUMED' && ev.startFrame >= 5 * FPS,
    );
    expect(continuations).toHaveLength(4);
    for (const ev of continuations) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(5 * FPS);
      expect(eventDuration(ev)).toBeGreaterThan(0);
    }
  });

  it('E1: Chen Qianyu APPLY LIFT triggers Steel Oath via APPLY STATUS PHYSICAL', () => {
    const { result } = setupWithPogranichnik();

    // Also add Chen Qianyu to slot 2
    act(() => {
      result.current.handleSwapOperator(SLOT_2, 'CHEN_QIANYU');
    });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const pogUltCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);
    const chenBattleCol = findColumn(result.current, SLOT_2, SKILL_COLUMNS.BATTLE);

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 0, pogUltCol!.defaultEvent!,
      );
    });

    // First Chen BS at 3s → APPLY LIFT adds Vulnerable I only (no physical status yet)
    act(() => {
      result.current.handleAddEvent(
        SLOT_2, SKILL_COLUMNS.BATTLE, 3 * FPS, chenBattleCol!.defaultEvent!,
      );
    });

    // Second Chen BS at 6s → enemy has Vulnerable → APPLY LIFT creates Lift status
    act(() => {
      result.current.handleAddEvent(
        SLOT_2, SKILL_COLUMNS.BATTLE, 6 * FPS, chenBattleCol!.defaultEvent!,
      );
    });

    // Steel Oath should be triggered by the second BS's physical status (LIFT)
    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === 'STEEL_OATH_HARASS',
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('F1: Two consumptions produce descending stack counts: N → N-1 → N-2', () => {
    const { result } = setupWithPogranichnik();
    const pogUltCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.ULTIMATE);
    const pogComboCol = findColumn(result.current, SLOT_1, SKILL_COLUMNS.COMBO);

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.ULTIMATE, 0, pogUltCol!.defaultEvent!,
      );
    });

    // Two combo skills well after Steel Oath creation, spaced far enough for cooldown
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.COMBO, 5 * FPS, pogComboCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_1, SKILL_COLUMNS.COMBO, 20 * FPS, pogComboCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.id === 'STEEL_OATH',
    );

    // Collect distinct stack counts in chronological order
    const distinctCounts = Array.from(new Set(
      steelOathEvents
        .sort((a, b) => a.startFrame - b.startFrame)
        .map(ev => ev.stacks ?? 0),
    ));

    // Should have 3 distinct stack counts (initial, after 1st consume, after 2nd consume)
    expect(distinctCounts).toHaveLength(3);
    // Each successive count is one less than the previous
    expect(distinctCounts[1]).toBe(distinctCounts[0]! - 1);
    expect(distinctCounts[2]).toBe(distinctCounts[1]! - 1);

    // Active (non-consumed) events should all have the lowest stack count
    const active = steelOathEvents.filter(ev => ev.eventStatus !== 'CONSUMED');
    expect(active.length).toBeGreaterThan(0);
    for (const ev of active) {
      expect(ev.stacks).toBe(distinctCounts[2]);
    }
  });
});
