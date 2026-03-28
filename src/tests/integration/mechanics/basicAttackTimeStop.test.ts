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
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { getAnimationDuration, computeSegmentsSpan } from '../../../consts/viewTypes';
import { findColumn, getMenuPayload, buildContextMenu, type AppResult } from '../helpers';

const SLOT_AKEKURI = 'slot-1';

/**
 * Add a basic attack at frame 0 and a combo skill at 1.3s via context menu flow.
 * Takes a result ref so we always read the latest app state after each act().
 */
function setupBasicAndCombo(result: { current: AppResult }) {
  const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
  expect(basicCol).toBeDefined();

  const basicPayload = getMenuPayload(result.current, basicCol!, 0);
  act(() => {
    result.current.handleAddEvent(
      basicPayload.ownerId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
    );
  });

  // Switch to freeform so combo placement is valid without an active trigger
  act(() => {
    result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });

  const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO_SKILL);
  expect(comboCol).toBeDefined();

  const comboPayload = getMenuPayload(result.current, comboCol!, Math.round(1.3 * FPS));
  act(() => {
    result.current.handleAddEvent(
      comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
    );
  });
}

describe('Basic attack time-stop extension — Akekuri basic + combo overlap', () => {
  it('third segment of basic attack is extended by combo time-stop', () => {
    const { result } = renderHook(() => useApp());

    // --- Context menu layer: verify menu items are available ---
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    const basicMenu = buildContextMenu(result.current, basicCol!, 0);
    expect(basicMenu).not.toBeNull();
    expect(basicMenu!.some(i => i.actionId === 'addEvent')).toBe(true);

    // --- Add events via context menu flow ---
    setupBasicAndCombo(result);

    // --- Controller layer: verify processed events ---
    const basicEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    );
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.COMBO_SKILL,
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

    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);

    setupBasicAndCombo(result);

    const basicEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basicEvent).toBeDefined();

    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.COMBO_SKILL,
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

  it('hover frame within extended segment resolves to correct segment index', () => {
    const { result } = renderHook(() => useApp());

    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);

    setupBasicAndCombo(result);

    const basicEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!;

    // Build segment boundaries from processed event (same logic as EventBlock hover)
    const boundaries: { start: number; end: number; name?: string }[] = [];
    let offset = 0;
    for (const seg of basicEvent.segments) {
      const start = basicEvent.startFrame + offset;
      const end = start + seg.properties.duration;
      boundaries.push({ start, end, name: seg.properties.name });
      offset += seg.properties.duration;
    }

    // The third segment (index 2) should be extended
    const seg3 = boundaries[2];
    const rawSeg3End = basicCol!.defaultEvent!.segments!
      .slice(0, 3)
      .reduce((sum, s) => sum + s.properties.duration, 0);

    // Extended seg3 should end LATER than raw seg3
    expect(seg3.end).toBeGreaterThan(rawSeg3End);

    // A hover frame 1 frame before the extended seg3 end should resolve to seg3
    const hoverInExtendedPortion = seg3.end - 1;
    const resolvedSeg = boundaries.findIndex(
      (b) => hoverInExtendedPortion >= b.start && hoverInExtendedPortion < b.end,
    );
    expect(resolvedSeg).toBe(2); // seg3 = index 2

    // A hover frame at the raw seg3 end should STILL resolve to seg3 (not seg4)
    const hoverAtRawEnd = rawSeg3End;
    const resolvedAtRaw = boundaries.findIndex(
      (b) => hoverAtRawEnd >= b.start && hoverAtRawEnd < b.end,
    );
    expect(resolvedAtRaw).toBe(2); // still seg3
  });

  it('segment durations do not double-extend across re-renders', () => {
    const { result } = renderHook(() => useApp());

    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);

    setupBasicAndCombo(result);

    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.COMBO_SKILL,
    )!;
    const animDur = getAnimationDuration(comboEvent);
    const rawSeg3Duration = basicCol!.defaultEvent!.segments![2].properties.duration;

    // Capture seg3 duration after first pipeline run
    const seg3First = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!.segments[2];
    expect(seg3First.properties.duration).toBe(rawSeg3Duration + animDur);

    // Trigger a re-render by moving the combo slightly
    act(() => {
      result.current.handleMoveEvent(comboEvent.uid, Math.round(1.3 * FPS) + 1);
    });

    // Seg3 duration must still be rawDuration + animDur — NOT double-extended
    const seg3Second = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!.segments[2];
    expect(seg3Second.properties.duration).toBe(rawSeg3Duration + animDur);
  });
});
