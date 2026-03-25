/**
 * @jest-environment jsdom
 */

/**
 * Basic Attack Time-Stop Extension — Integration Test
 *
 * Verifies that when Akekuri's combo skill creates a time-stop region that
 * overlaps with the third segment (N3) of her basic attack, the pipeline:
 * 1. Extends the third segment's duration by the animation duration
 * 2. Adjusts the frame positions within the third segment
 *
 * Setup: Akekuri (slot-1) basic attack at 0s, combo skill at 1.3s (freeform).
 * The combo's animation segment (0.488s, REAL_TIME, TIME_STOP) creates a
 * time-stop region starting at frame 156 (1.3s * 120fps). This falls within
 * the third segment of the basic attack (N3 starts at frame 152).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS } from '../../model/channels';
import { InteractionModeType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import { getAnimationDuration, computeSegmentsSpan } from '../../consts/viewTypes';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_AKEKURI = 'slot-1';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Basic attack time-stop extension — Akekuri basic + combo overlap', () => {
  it('third segment of basic attack is extended by combo time-stop', () => {
    const { result } = renderHook(() => useApp());

    // Add basic attack at 0s (strict mode is fine for basic attacks)
    const basicCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BASIC);
    expect(basicCol).toBeDefined();
    expect(basicCol!.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!,
      );
    });

    // Switch to freeform for combo placement
    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Add combo at 1.3s
    const comboCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.COMBO);
    expect(comboCol).toBeDefined();
    expect(comboCol!.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.COMBO, Math.round(1.3 * FPS), comboCol!.defaultEvent!,
      );
    });

    // Find processed events
    const basicEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.BASIC,
    );
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(basicEvent).toBeDefined();
    expect(comboEvent).toBeDefined();

    const animDur = getAnimationDuration(comboEvent!);
    expect(animDur).toBeGreaterThan(0);

    // The raw basic attack total duration (before time-stop extension)
    const rawTotal = computeSegmentsSpan(basicCol!.defaultEvent!.segments!);
    const processedTotal = computeSegmentsSpan(basicEvent!.segments);

    // The processed total should be extended by the animation duration
    expect(processedTotal).toBeGreaterThan(rawTotal);
    expect(processedTotal).toBe(rawTotal + animDur);

    // Specifically verify the third segment (index 2) was extended
    const rawSeg3Duration = basicCol!.defaultEvent!.segments![2].properties.duration;
    const processedSeg3Duration = basicEvent!.segments[2].properties.duration;
    expect(processedSeg3Duration).toBeGreaterThan(rawSeg3Duration);
    expect(processedSeg3Duration).toBe(rawSeg3Duration + animDur);
  });

  it('frames within the third segment have adjusted positions for time-stop', () => {
    const { result } = renderHook(() => useApp());

    const basicCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BASIC);
    const comboCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.COMBO);

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.COMBO, Math.round(1.3 * FPS), comboCol!.defaultEvent!,
      );
    });

    const basicEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.BASIC,
    );
    expect(basicEvent).toBeDefined();

    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.COMBO,
    )!;
    const animDur = getAnimationDuration(comboEvent);

    // The third segment (index 2) overlaps the time-stop region.
    // Frames within it should have derivedOffsetFrame shifted forward
    // by the animation duration (time-stop pushes them later in real time).
    const seg3 = basicEvent!.segments[2];
    expect(seg3.frames).toBeDefined();
    expect(seg3.frames!.length).toBeGreaterThan(0);

    const seg3AbsStart = basicCol!.defaultEvent!.segments!
      .slice(0, 2)
      .reduce((sum, s) => sum + s.properties.duration, 0);
    const timeStopLocalOffset = Math.round(1.3 * FPS) - seg3AbsStart;

    for (const frame of seg3.frames!) {
      expect(frame.derivedOffsetFrame).toBeDefined();
      const expected = frame.offsetFrame > timeStopLocalOffset
        ? frame.offsetFrame + animDur
        : frame.offsetFrame;
      expect(frame.derivedOffsetFrame).toBe(expected);
    }

    // Frames in earlier segments (before the time-stop region) are unaffected
    for (const seg of basicEvent!.segments.slice(0, 2)) {
      for (const frame of seg.frames ?? []) {
        expect(frame.derivedOffsetFrame).toBe(frame.offsetFrame);
      }
    }
  });
});
