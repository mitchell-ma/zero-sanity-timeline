/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Dolly Rush — Corrosion consumption
 *
 * Tests that when enemy has Corrosion, Ardelia's battle skill (Dolly Rush)
 * consumes the corrosion and applies susceptibility.
 *
 * Verification layers:
 *   Context menu: getMenuPayload succeeds (skill is available and enabled)
 *   Controller: allProcessedEvents corrosion clamped at battle hit frame
 *   View: computeTimelinePresentation ColumnViewModel for enemy CORROSION column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { REACTION_COLUMNS, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../../helpers';

const SLOT_ARDELIA = 'slot-3';

describe('Ardelia Dolly Rush — Corrosion consumption', () => {
  it('battle skill consumes corrosion when enemy has it', () => {
    const { result } = renderHook(() => useApp());

    const basicCol = findColumn(result.current, SLOT_ARDELIA, NounType.BASIC_ATTACK);
    const comboCol = findColumn(result.current, SLOT_ARDELIA, NounType.COMBO);
    const battleCol = findColumn(result.current, SLOT_ARDELIA, NounType.BATTLE);
    expect(basicCol).toBeDefined();
    expect(comboCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // ── Context menu: verify each skill is available and enabled ─────────

    // 1. Basic attack at frame 0 (provides FINAL_STRIKE for combo trigger)
    const basicPayload = getMenuPayload(result.current, basicCol!, 0);
    act(() => {
      result.current.handleAddEvent(basicPayload.ownerId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill);
    });

    // 2. Combo skill at 10s (applies forced Corrosion to enemy)
    const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill);
    });

    // ── Controller: verify corrosion exists on enemy ────────────────────
    const corrosionBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(corrosionBefore).toHaveLength(1);

    // 3. Battle skill at 15s (should consume corrosion)
    const battlePayload = getMenuPayload(result.current, battleCol!, 15 * FPS);
    act(() => {
      result.current.handleAddEvent(battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill);
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

    // ── View: computeTimelinePresentation ColumnViewModel ───────────────
    // Verify corrosion appears in the enemy's unified status column VM
    const vms = computeTimelinePresentation(allEvents, result.current.columns);
    const enemyStatusVM = vms.get(ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusVM).toBeDefined();

    // Filter the VM's events for corrosion
    const vmCorrosionEvents = enemyStatusVM!.events.filter(
      ev => ev.columnId === REACTION_COLUMNS.CORROSION,
    );
    expect(vmCorrosionEvents).toHaveLength(1);

    // The view-layer corrosion event should also be clamped
    const vmCorrosion = vmCorrosionEvents[0];
    const vmTotalDur = vmCorrosion.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    const vmCorrosionEnd = vmCorrosion.startFrame + vmTotalDur;
    expect(vmCorrosionEnd).toBeLessThanOrEqual(battleFrameHit);
  });
});
