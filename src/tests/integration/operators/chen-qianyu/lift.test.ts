/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu Lift — Integration Tests
 *
 * Tests the Vulnerable → Lift physical status mechanic through the full useApp pipeline.
 * Chen Qianyu's battle skill (Ascending Strike) applies LIFT, which:
 *   1. Always adds 1 Vulnerable infliction stack.
 *   2. Only creates the Lift status if enemy already had Vulnerable OR isForced.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Chen Qianyu must be swapped in via handleSwapOperator.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import {
  SKILL_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  PHYSICAL_STATUS_COLUMNS,
  PHYSICAL_STATUS_COLUMN_IDS,
  ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { ColumnType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_CHEN = 'slot-0';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Chen Qianyu — Vulnerable → Lift physical status', () => {
  it('first battle skill applies Vulnerable only; second adds 2nd stack and triggers Lift', () => {
    const { result } = renderHook(() => useApp());

    // Swap Chen Qianyu into slot-0
    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU');
    });

    const battleCol = findColumn(result.current, SLOT_CHEN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    // ── First battle skill at t=2s ──
    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, SKILL_COLUMNS.BATTLE, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Enemy should have exactly 1 Vulnerable infliction
    const vulnAfterFirst = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(vulnAfterFirst).toHaveLength(1);

    // Enemy should have NO physical statuses (Lift, Knock Down, Crush, Breach)
    const physStatusAfterFirst = result.current.allProcessedEvents.filter(
      (ev) => PHYSICAL_STATUS_COLUMN_IDS.has(ev.columnId) && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(physStatusAfterFirst).toHaveLength(0);

    // ── Second battle skill while Vulnerable is still active ──
    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, SKILL_COLUMNS.BATTLE, 4 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Enemy should now have 2 Vulnerable infliction stacks
    const vulnAfterSecond = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(vulnAfterSecond).toHaveLength(2);

    // Enemy should now have Lift status
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(liftEvents).toHaveLength(1);
  });
});
