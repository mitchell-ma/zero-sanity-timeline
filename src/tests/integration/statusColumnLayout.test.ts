/**
 * @jest-environment jsdom
 */

/**
 * Status Column Layout — Integration Test
 *
 * Verifies that status events in Laevatain's operator status column are
 * assigned to distinct visual micro-columns that all fit within the column.
 *
 * Laevatain starts with 2 permanent talent events (Scorching Heart, Re-Ignition).
 * Adding Melting Flame and Scorching Heart Effect produces 4 distinct visual
 * columns, all constrained within the status column (leftFrac + widthFrac ≤ 1).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { OPERATOR_COLUMNS } from '../../model/channels';
import { InteractionModeType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import { computeTimelinePresentation } from '../../controller/timeline/eventPresentationController';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_LAEVATAIN = 'slot-0';
const SH_EFFECT_COLUMN = 'scorching-heart-effect';
const SH_TALENT_COLUMN = 'scorching-heart';
const RE_IGNITION_COLUMN = 're-ignition-talent';

function findStatusColumn(app: ReturnType<typeof useApp>) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === SLOT_LAEVATAIN &&
      c.columnId === 'operator-status',
  );
}

function getDefaultEvent(app: ReturnType<typeof useApp>, microColumnId: string) {
  const statusCol = findStatusColumn(app);
  expect(statusCol).toBeDefined();
  const micro = statusCol!.microColumns?.find((mc) => mc.id === microColumnId);
  expect(micro).toBeDefined();
  return micro!.defaultEvent!;
}

describe('Status column layout — micro-column positioning', () => {
  it('Laevatain starts with 2 permanent talent events in operator status', () => {
    const { result } = renderHook(() => useApp());

    const statusEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN &&
        (ev.columnId === SH_TALENT_COLUMN || ev.columnId === RE_IGNITION_COLUMN),
    );
    expect(statusEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('4 distinct visual columns when MF and SH Effect are added', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add Melting Flame at 2s
    const mfDefault = getDefaultEvent(result.current, OPERATOR_COLUMNS.MELTING_FLAME);
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, 2 * FPS, mfDefault,
      );
    });

    // Add Scorching Heart Effect at 3s
    const shDefault = getDefaultEvent(result.current, SH_EFFECT_COLUMN);
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SH_EFFECT_COLUMN, 3 * FPS, shDefault,
      );
    });

    // Compute presentation model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findStatusColumn(result.current)!;
    const vm = viewModels.get(statusCol.key);
    expect(vm).toBeDefined();

    // All status events for this column should have micro-positions
    const statusEvents = vm!.events.filter((ev) => ev.ownerId === SLOT_LAEVATAIN);
    expect(statusEvents.length).toBeGreaterThanOrEqual(4);

    // Collect unique slot positions (leftFrac values)
    const uniqueSlots = new Set(
      statusEvents.map((ev) => vm!.microPositions.get(ev.uid)?.leftFrac),
    );
    // At least 4 distinct visual columns
    expect(uniqueSlots.size).toBeGreaterThanOrEqual(4);

    // Every event must be fully within the column (0 ≤ leftFrac + widthFrac ≤ 1)
    for (const ev of statusEvents) {
      const mp = vm!.microPositions.get(ev.uid);
      expect(mp).toBeDefined();
      expect(mp!.leftFrac).toBeGreaterThanOrEqual(0);
      expect(mp!.leftFrac + mp!.widthFrac).toBeLessThanOrEqual(1);
    }
  });
});
