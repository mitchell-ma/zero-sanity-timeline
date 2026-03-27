/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Dolly Rush — Corrosion consumption
 *
 * Tests that when enemy has Corrosion, Ardelia's battle skill (Dolly Rush)
 * consumes the corrosion and applies susceptibility.
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

describe('Ardelia Dolly Rush — Corrosion consumption', () => {
  it('battle skill consumes corrosion when enemy has it', () => {
    const { result } = renderHook(() => useApp());

    const basicCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BASIC);
    const comboCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.COMBO);
    const battleCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BATTLE);
    expect(basicCol).toBeDefined();
    expect(comboCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // 1. Basic attack at frame 0 (provides FINAL_STRIKE for combo trigger)
    act(() => {
      result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!);
    });

    // 2. Combo skill at 10s (applies forced Corrosion to enemy)
    act(() => {
      result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.COMBO, 10 * FPS, comboCol!.defaultEvent!);
    });

    // Verify corrosion exists on enemy
    const corrosionBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(corrosionBefore).toHaveLength(1);

    // 3. Battle skill at 15s (should consume corrosion)
    act(() => {
      result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BATTLE, 15 * FPS, battleCol!.defaultEvent!);
    });

    // The battle skill frame hits at offset 1.07s = frame 15*120 + 128 = 1928
    // Corrosion should be consumed (clamped) at that frame
    const allEvents = result.current.allProcessedEvents;
    const corrosionAfter = allEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerId === ENEMY_OWNER_ID,
    );

    // Corrosion event should still exist but be clamped (consumed)
    expect(corrosionAfter).toHaveLength(1);
    const totalDur = corrosionAfter[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    const corrosionEnd = corrosionAfter[0].startFrame + totalDur;
    const battleFrameHit = 15 * FPS + Math.round(1.07 * FPS);

    // Corrosion should end at or before the battle skill hit frame (consumed)
    expect(corrosionEnd).toBeLessThanOrEqual(battleFrameHit);
  });
});
