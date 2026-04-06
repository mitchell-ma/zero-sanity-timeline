/** @jest-environment jsdom */
/**
 * Integration test: all four skill types (BASIC_ATTACK, BATTLE, COMBO, ULTIMATE)
 * added via context menu appear in the view layer's ColumnViewModel.
 *
 * After the SkillType→NounType migration, column IDs changed from lowercase
 * ('basic', 'battle', 'combo', 'ultimate') to NounType enum values
 * ('BASIC_ATTACK', 'BATTLE', 'COMBO', 'ULTIMATE'). A mismatch between the
 * column builder (which creates columns) and the presentation controller
 * (which matches events to columns) would cause events to silently vanish
 * from the rendered timeline.
 *
 * Pipeline: handleAddEvent → allProcessedEvents → computeTimelinePresentation → ColumnViewModel.events
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { InteractionModeType } from '../../../consts/enums';
import { useApp } from '../../../app/useApp';
import { findColumn, buildContextMenu, getAddEventPayload } from '../helpers';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { FPS } from '../../../utils/timeline';

const SLOT_0 = 'slot-0'; // Laevatain (default first operator)

describe('Skill events appear in ColumnViewModel after adding', () => {
  it('BASIC_ATTACK event appears in ColumnViewModel', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_0, NounType.BASIC_ATTACK)!;
    expect(col).toBeDefined();

    const payload = getAddEventPayload(buildContextMenu(result.current, col, 0)!);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(col.key);
    expect(vm).toBeDefined();
    const userEvents = vm!.events.filter(e => e.columnId === NounType.BASIC_ATTACK);
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('BATTLE event appears in ColumnViewModel', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_0, NounType.BATTLE)!;
    expect(col).toBeDefined();

    const payload = getAddEventPayload(buildContextMenu(result.current, col, 0)!);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(col.key);
    expect(vm).toBeDefined();
    const userEvents = vm!.events.filter(e => e.columnId === NounType.BATTLE);
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('COMBO event appears in ColumnViewModel (freeform mode)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_0, NounType.COMBO)!;
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(SLOT_0, NounType.COMBO, 0, col.defaultEvent ?? null);
    });

    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(col.key);
    expect(vm).toBeDefined();
    const userEvents = vm!.events.filter(e => e.columnId === NounType.COMBO);
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('ULTIMATE event appears in ColumnViewModel (freeform mode)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_0, NounType.ULTIMATE)!;
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(SLOT_0, NounType.ULTIMATE, 0, col.defaultEvent ?? null);
    });

    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(col.key);
    expect(vm).toBeDefined();
    const userEvents = vm!.events.filter(e => e.columnId === NounType.ULTIMATE);
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('all four skill types placed together all appear in their respective ColumnViewModels', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const skillTypes = [NounType.BASIC_ATTACK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE] as const;
    const colsByType = new Map<string, ReturnType<typeof findColumn>>();

    // Add one event per skill type at staggered frames
    for (let i = 0; i < skillTypes.length; i++) {
      const skillType = skillTypes[i];
      const col = findColumn(result.current, SLOT_0, skillType)!;
      expect(col).toBeDefined();
      colsByType.set(skillType, col);
      act(() => {
        result.current.handleAddEvent(SLOT_0, skillType, i * 5 * FPS, col.defaultEvent ?? null);
      });
    }

    // Verify each skill type has at least one event in its ColumnViewModel
    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    for (const skillType of skillTypes) {
      const col = colsByType.get(skillType)!;
      const vm = vms.get(col.key);
      expect(vm).toBeDefined();
      const events = vm!.events.filter(e => e.columnId === skillType);
      expect(events.length).toBeGreaterThanOrEqual(1);
    }
  });
});
