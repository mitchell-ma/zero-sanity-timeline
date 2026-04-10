/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Combo Skill — Corrosion Application Integration Tests
 *
 * Tests that Ardelia's combo skill "Eruption Column" applies Corrosion
 * to the enemy when triggered by a Final Strike with no active inflictions.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled for each column
 * 2. Controller: corrosion event appears in allProcessedEvents with correct duration
 * 3. View: computeTimelinePresentation includes corrosion in the enemy's status column
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { REACTION_COLUMNS, ENEMY_ID } from '../../../../model/channels';
import { ColumnType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';

const SLOT_ARDELIA = 'slot-3';

describe('Ardelia combo skill — Corrosion application', () => {
  it('combo frame 2 applies Corrosion to enemy after basic attack finisher', () => {
    const { result } = renderHook(() => useApp());

    // ── Context menu layer: basic attack ────────────────────────────────
    // 1. Ardelia uses basic attack (contains finisher / FINAL_STRIKE)
    const basicCol = findColumn(result.current, SLOT_ARDELIA, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();

    const basicMenu = buildContextMenu(result.current, basicCol!, 0);
    expect(basicMenu).not.toBeNull();
    expect(basicMenu!.length).toBeGreaterThan(0);

    const basicPayload = getMenuPayload(result.current, basicCol!, 0);

    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerEntityId, basicPayload.columnId,
        basicPayload.atFrame, basicPayload.defaultSkill,
      );
    });

    // ── Context menu layer: combo skill ─────────────────────────────────
    // 2. Ardelia uses combo skill — triggered by her own finisher, no inflictions on enemy
    const comboCol = findColumn(result.current, SLOT_ARDELIA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const comboMenu = buildContextMenu(result.current, comboCol!, 10 * FPS);
    expect(comboMenu).not.toBeNull();
    expect(comboMenu!.length).toBeGreaterThan(0);

    const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);

    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // ── Controller layer ────────────────────────────────────────────────
    // 3. Verify: combo event exists
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.COMBO,
    );
    expect(comboEvent).toBeDefined();

    // 4. Verify: enemy has a Corrosion reaction event
    const corrosionEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(corrosionEvents).toHaveLength(1);

    // 5. Verify Corrosion total duration = 7s (base, P0) = 840 frames
    //    Corrosion events are split into per-second segments, so sum all segment durations
    const totalDuration = corrosionEvents[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(7 * FPS);

    // ── View layer ──────────────────────────────────────────────────────
    // 6. Verify: corrosion event appears in the enemy's status column view model
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerEntityId === ENEMY_ID &&
        (c.matchColumnIds?.includes(REACTION_COLUMNS.CORROSION) ?? false),
    );
    expect(enemyStatusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(enemyStatusCol!.key);
    expect(vm).toBeDefined();

    const corrosionInVM = vm!.events.filter(
      (ev) => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(corrosionInVM).toHaveLength(1);
  });
});
