/**
 * @jest-environment jsdom
 */

/**
 * SP Consumption — Integration Tests
 *
 * Tests that battle skills correctly consume SP through the full pipeline:
 * useApp → handleAddEvent → processCombatSimulation → SP tracking
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { SKILL_COLUMNS } from '../../../model/channels';
import { ColumnType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT_AKEKURI = 'slot-1';

describe('SP Consumption — integration through useApp', () => {
  it('Akekuri battle skill consumes 100 SP', () => {
    const { result } = renderHook(() => useApp());

    // Find the battle column for Akekuri to get the real default skill
    const battleCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === SLOT_AKEKURI &&
        c.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battleCol).toBeDefined();
    const defaultSkill = battleCol!.defaultEvent!;

    // Verify the column definition has the SP cost
    expect(defaultSkill.skillPointCost).toBe(100);

    // Add a battle skill at 5s (enough time for SP to regen from 200 start)
    const atFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI,
        SKILL_COLUMNS.BATTLE,
        atFrame,
        defaultSkill,
      );
    });

    // Verify the battle skill event exists in processed events
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(battleEvents[0].skillPointCost).toBe(100);

    // Verify SP consumption history records the cost
    const consumption = result.current.spConsumptionHistory.find(
      (r) => r.eventUid === battleEvents[0].uid,
    );
    expect(consumption).toBeDefined();
    expect(consumption!.naturalConsumed + consumption!.returnedConsumed).toBe(100);
  });
});
