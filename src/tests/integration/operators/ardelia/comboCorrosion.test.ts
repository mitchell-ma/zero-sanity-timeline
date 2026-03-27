/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Combo Skill — Corrosion Application Integration Tests
 *
 * Tests that Ardelia's combo skill "Eruption Column" applies Corrosion
 * to the enemy when triggered by a Final Strike with no active inflictions.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { SKILL_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { ColumnType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_ARDELIA = 'slot-3';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Ardelia combo skill — Corrosion application', () => {
  it('combo frame 2 applies Corrosion to enemy after basic attack finisher', () => {
    const { result } = renderHook(() => useApp());

    // 1. Ardelia uses basic attack (contains finisher / FINAL_STRIKE)
    const basicCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BASIC);
    expect(basicCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ARDELIA, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!,
      );
    });

    // 2. Ardelia uses combo skill — triggered by her own finisher, no inflictions on enemy
    const comboCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.COMBO);
    expect(comboCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ARDELIA, SKILL_COLUMNS.COMBO, 10 * FPS, comboCol!.defaultEvent!,
      );
    });

    // 3. Verify: combo event exists
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_ARDELIA && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(comboEvent).toBeDefined();

    // 4. Verify: enemy has a Corrosion reaction event
    const corrosionEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(corrosionEvents).toHaveLength(1);

    // 5. Verify Corrosion total duration = 7s (base, P0) = 840 frames
    //    Corrosion events are split into per-second segments, so sum all segment durations
    const totalDuration = corrosionEvents[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(7 * FPS);
  });
});
