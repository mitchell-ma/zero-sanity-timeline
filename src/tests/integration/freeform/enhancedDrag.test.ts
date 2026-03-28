/**
 * @jest-environment jsdom
 */

/**
 * Freeform Enhanced/Empowered Drag — Integration Test
 *
 * Verifies that enhanced and empowered skill variants can be freely dragged
 * in freeform mode, even without an ultimate on the timeline.
 *
 * In strict mode, enhanced events are clamped to the ENABLE window (ultimate),
 * but in freeform mode all position constraints (ultimate edge, combo edge,
 * enable window) are bypassed.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType, EnhancementType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT = 'slot-0';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Freeform enhanced/empowered drag — no ultimate required', () => {
  it('empowered battle skill can be dragged in freeform mode without ultimate', () => {
    const { result } = renderHook(() => useApp());

    // Switch to freeform mode
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place empowered BS at frame 5s
    const battleCol = findColumn(result.current, SLOT, NounType.BATTLE_SKILL);
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();

    const startFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BATTLE_SKILL, startFrame, empoweredVariant!);
    });

    const ev = result.current.events.find(
      (e) => e.name === empoweredVariant!.name && e.ownerId === SLOT,
    );
    expect(ev).toBeDefined();
    expect(ev!.startFrame).toBe(startFrame);

    // Drag it forward by 3 seconds
    const newFrame = 8 * FPS;
    act(() => {
      result.current.handleMoveEvent(ev!.uid, newFrame);
    });

    const moved = result.current.events.find((e) => e.uid === ev!.uid);
    expect(moved!.startFrame).toBe(newFrame);
  });

  it('enhanced+empowered battle skill can be dragged in freeform mode without ultimate', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT, NounType.BATTLE_SKILL);
    const eeVariant = battleCol!.eventVariants?.find(
      (v) => v.name?.includes('ENHANCED_EMPOWERED'),
    );
    expect(eeVariant).toBeDefined();

    const startFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BATTLE_SKILL, startFrame, eeVariant!);
    });

    const ev = result.current.events.find(
      (e) => e.name === eeVariant!.name && e.ownerId === SLOT,
    );
    expect(ev).toBeDefined();

    // Drag it forward
    const newFrame = 10 * FPS;
    act(() => {
      result.current.handleMoveEvent(ev!.uid, newFrame);
    });

    const moved = result.current.events.find((e) => e.uid === ev!.uid);
    expect(moved!.startFrame).toBe(newFrame);
  });

  it('enhanced battle skill cannot be dragged outside ultimate in strict mode', () => {
    const { result } = renderHook(() => useApp());

    // Stay in strict mode — place enhanced BS without an ultimate
    const battleCol = findColumn(result.current, SLOT, NounType.BATTLE_SKILL);
    const enhancedVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.ENHANCED && !v.name?.includes('EMPOWERED'),
    );
    // Enhanced may not be available without ultimate, so add it in freeform first
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const startFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BATTLE_SKILL, startFrame, enhancedVariant!);
    });

    // Switch back to strict mode
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const ev = result.current.events.find(
      (e) => e.enhancementType === EnhancementType.ENHANCED && e.columnId === NounType.BATTLE_SKILL,
    );
    expect(ev).toBeDefined();

    // Try to drag — should be clamped back (no ultimate = no ENABLE window)
    act(() => {
      result.current.handleMoveEvent(ev!.uid, 10 * FPS);
    });

    const after = result.current.events.find((e) => e.uid === ev!.uid);
    expect(after!.startFrame).toBe(startFrame);
  });
});
