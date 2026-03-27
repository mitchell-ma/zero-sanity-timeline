/**
 * @jest-environment jsdom
 */

/**
 * Melting Flame Stacking — Integration Test
 *
 * Tests that freeform-added Melting Flame events do not trigger overlap warnings.
 * MF has a stacking limit of 4, so overlapping MF events are expected and valid.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { SKILL_COLUMNS, OPERATOR_COLUMNS } from '../../../model/channels';
import { ColumnType, EnhancementType, EventStatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT_LAEVATAIN = 'slot-0';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

function getMfDefault(app: ReturnType<typeof useApp>) {
  const statusCol = findColumn(app, SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME);
  expect(statusCol).toBeDefined();
  const mfMicro = statusCol!.microColumns?.find((mc) => mc.id === OPERATOR_COLUMNS.MELTING_FLAME);
  expect(mfMicro).toBeDefined();
  return mfMicro!.defaultEvent!;
}

describe('Melting Flame stacking — freeform add', () => {
  it('two overlapping MF events have no overlap warnings', () => {
    const { result } = renderHook(() => useApp());
    const mfDefault = getMfDefault(result.current);

    // Add first MF at 2s
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, 2 * FPS, mfDefault,
      );
    });

    // Add second MF at 3s (1 second later — overlapping with first)
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, 3 * FPS, mfDefault,
      );
    });

    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
    );
    expect(mfEvents).toHaveLength(2);

    // Neither event should have overlap warnings
    for (const ev of mfEvents) {
      expect(ev.warnings ?? []).not.toContainEqual(
        expect.stringContaining('Overlaps'),
      );
    }
  });

  it('fifth MF stack is rejected — max stacks is 4', () => {
    const { result } = renderHook(() => useApp());
    const mfDefault = getMfDefault(result.current);

    // Add 5 MF events, 1 second apart
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, (2 + i) * FPS, mfDefault,
        );
      });
    }

    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
    );
    // Only 4 should exist — the 5th is rejected by stack limit
    expect(mfEvents).toHaveLength(4);
  });

  it('empowered battle skill consumes freeform-added MF stacks', () => {
    const { result } = renderHook(() => useApp());
    const mfDefault = getMfDefault(result.current);

    // Add 4 MF stacks via freeform, 1 second apart
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, (2 + i) * FPS, mfDefault,
        );
      });
    }

    // Verify 4 MF stacks exist and are not consumed
    const mfBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfBefore).toHaveLength(4);

    // Find empowered battle skill variant
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();

    // Add empowered BS after all 4 MF stacks
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 10 * FPS, empoweredVariant!,
      );
    });

    // All 4 freeform MF stacks should be consumed
    const mfAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
    );
    const consumed = mfAfter.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(4);
  });

  it('undo after empowered BS restores 4 unconsumed MF stacks', async () => {
    const { result } = renderHook(() => useApp());
    const mfDefault = getMfDefault(result.current);

    // Add 4 MF stacks via freeform, 1 second apart
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, (2 + i) * FPS, mfDefault,
        );
      });
    }

    // Find and add empowered battle skill variant
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    )!;
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 10 * FPS, empoweredVariant,
      );
    });

    // Verify MF stacks are consumed
    const consumedBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedBefore).toHaveLength(4);

    // Allow microtask (undo history push) to complete, then undo
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    act(() => {
      result.current.undo();
    });

    // Verify empowered BS was undone
    const battleAfterUndo = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battleAfterUndo).toHaveLength(0);

    const mfAfterUndo = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
    );
    expect(mfAfterUndo).toHaveLength(4);
    const unconsumed = mfAfterUndo.filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(unconsumed).toHaveLength(4);

    // None should have overlap warnings
    for (const ev of mfAfterUndo) {
      expect(ev.warnings ?? []).not.toContainEqual(
        expect.stringContaining('Overlaps'),
      );
    }
  });
});
