/**
 * @jest-environment jsdom
 */

/**
 * Time-Stop Layout Positioning — Integration Test
 *
 * Verifies that buildTimelineLayout correctly positions events relative
 * to time-stop regions without double-counting. Key invariant:
 *
 *   An event placed AFTER a time-stop should have its layout.realStartFrame
 *   equal to its ev.startFrame (already real-time) — NOT shifted further.
 *
 * Also verifies that an event's segments are expanded correctly when a
 * foreign time-stop overlaps them.
 *
 * Setup: Akekuri in slot-1.
 *   - Place combo at frame 0 (creates a time-stop of ~0.49s animation)
 *   - Place basic attack at frame 90 (after the combo's time-stop)
 *
 * Expected: The basic attack's real-time startFrame should already include
 * the time-stop offset. buildTimelineLayout should NOT add it again.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../../utils/timeline';
import { getAnimationDuration, computeSegmentsSpan } from '../../../consts/viewTypes';
import { buildTimelineLayout } from '../../../controller/timeline/timelineLayout';
import { computeTimeStopRegions } from '../../../controller/timeline/eventValidator';
import { findColumn, getMenuPayload, type AppResult } from '../helpers';

const SLOT_AKEKURI = 'slot-1';

beforeEach(() => {
  localStorage.clear();
});

/** Non-overlapping: combo at 0, basic at 3s (after time-stop ends). */
function setupComboThenBasic(result: { current: AppResult }) {
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

  const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO);
  expect(comboCol).toBeDefined();
  const comboPayload = getMenuPayload(result.current, comboCol!, 0);
  act(() => {
    result.current.handleAddEvent(
      comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
    );
  });

  const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
  expect(basicCol).toBeDefined();
  const basicPayload = getMenuPayload(result.current, basicCol!, 3 * FPS);
  act(() => {
    result.current.handleAddEvent(
      basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
    );
  });
}

/** Overlapping: basic at 0, combo at 1.3s (time-stop falls WITHIN basic attack segments). */
function setupBasicThenComboOverlapping(result: { current: AppResult }) {
  const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
  expect(basicCol).toBeDefined();
  const basicPayload = getMenuPayload(result.current, basicCol!, 0);
  act(() => {
    result.current.handleAddEvent(
      basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
    );
  });

  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

  const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO);
  expect(comboCol).toBeDefined();
  const comboPayload = getMenuPayload(result.current, comboCol!, Math.round(1.3 * FPS));
  act(() => {
    result.current.handleAddEvent(
      comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
    );
  });
}

describe('Time-stop layout positioning — no double-counting', () => {
  it('event startFrame is already real-time; layout.realStartFrame must match', () => {
    const { result } = renderHook(() => useApp());
    setupComboThenBasic(result);

    const events = result.current.allProcessedEvents;
    const comboEvent = events.find(
      ev => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.COMBO,
    )!;
    const basicEvent = events.find(
      ev => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    expect(comboEvent).toBeDefined();
    expect(basicEvent).toBeDefined();

    const animDur = getAnimationDuration(comboEvent);
    expect(animDur).toBeGreaterThan(0);

    // The basic attack's startFrame should already be shifted by the time-stop
    // (real-time model: startFrame includes time-stop expansion)
    expect(basicEvent.startFrame).toBe(3 * FPS);

    // buildTimelineLayout should NOT shift it further
    const layout = buildTimelineLayout(events);
    const basicLayout = layout.events.get(basicEvent.uid);
    expect(basicLayout).toBeDefined();

    // KEY INVARIANT: realStartFrame === startFrame (no double-counting)
    expect(basicLayout!.realStartFrame).toBe(basicEvent.startFrame);
  });

  it('time-stop regions are consistent between validator and layout', () => {
    const { result } = renderHook(() => useApp());
    setupComboThenBasic(result);

    const events = result.current.allProcessedEvents;

    // Both should identify the same time-stop regions
    const validatorRegions = computeTimeStopRegions(events);
    const layoutData = buildTimelineLayout(events);

    expect(layoutData.timeStopRegions.length).toBe(validatorRegions.length);
    for (let i = 0; i < validatorRegions.length; i++) {
      expect(layoutData.timeStopRegions[i].startFrame).toBe(validatorRegions[i].startFrame);
      expect(layoutData.timeStopRegions[i].durationFrames).toBe(validatorRegions[i].durationFrames);
    }
  });

  it('totalRealFrames equals TOTAL_FRAMES + sum of time-stop durations', () => {
    const { result } = renderHook(() => useApp());
    setupComboThenBasic(result);

    const events = result.current.allProcessedEvents;
    const layout = buildTimelineLayout(events);
    const timeStopSum = layout.timeStopRegions.reduce((s, r) => s + r.durationFrames, 0);

    expect(layout.totalRealFrames).toBe(TOTAL_FRAMES + timeStopSum);
  });

  it('segment durations NOT double-extended (non-overlapping)', () => {
    const { result } = renderHook(() => useApp());
    setupComboThenBasic(result);

    const events = result.current.allProcessedEvents;
    const basicEvent = events.find(
      ev => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!;

    const layout = buildTimelineLayout(events);
    const basicLayout = layout.events.get(basicEvent.uid);
    expect(basicLayout).toBeDefined();

    const pipelineTotal = computeSegmentsSpan(basicEvent.segments);
    let layoutTotal = 0;
    for (const seg of basicLayout!.segments!) {
      const end = seg.realOffset + seg.realDuration;
      if (end > layoutTotal) layoutTotal = end;
    }

    expect(layoutTotal).toBe(pipelineTotal);
  });

  it('segment durations NOT double-extended (OVERLAPPING — time-stop within basic attack)', () => {
    const { result } = renderHook(() => useApp());
    setupBasicThenComboOverlapping(result);

    const events = result.current.allProcessedEvents;
    const basicEvent = events.find(
      ev => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    const comboEvent = events.find(
      ev => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.COMBO,
    )!;
    expect(basicEvent).toBeDefined();
    expect(comboEvent).toBeDefined();

    const animDur = getAnimationDuration(comboEvent);
    expect(animDur).toBeGreaterThan(0);

    // Pipeline already extended the basic attack's segment durations by animDur
    const pipelineTotal = computeSegmentsSpan(basicEvent.segments);

    const layout = buildTimelineLayout(events);
    const basicLayout = layout.events.get(basicEvent.uid);
    expect(basicLayout).toBeDefined();

    let layoutTotal = 0;
    for (const seg of basicLayout!.segments!) {
      const end = seg.realOffset + seg.realDuration;
      if (end > layoutTotal) layoutTotal = end;
    }

    // If double-counted, layoutTotal ≈ pipelineTotal + animDur (extended again)
    // Correct: layoutTotal === pipelineTotal (already extended by pipeline)
    expect(layoutTotal).toBe(pipelineTotal);
  });

  it('basic attack segment layout positions are correctly offset within the event', () => {
    const { result } = renderHook(() => useApp());
    setupComboThenBasic(result);

    const events = result.current.allProcessedEvents;
    const basicEvent = events.find(
      ev => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    )!;

    const layout = buildTimelineLayout(events);
    const basicLayout = layout.events.get(basicEvent.uid);
    expect(basicLayout).toBeDefined();
    expect(basicLayout!.segments!.length).toBe(basicEvent.segments.length);

    // First segment should start at offset 0 from event start
    expect(basicLayout!.segments![0].realOffset).toBe(0);

    // Each segment's realOffset should be >= its game-time offset
    let gameOffset = 0;
    for (let i = 0; i < basicEvent.segments.length; i++) {
      const seg = basicEvent.segments[i];
      const segLayout = basicLayout!.segments![i];
      expect(segLayout.realOffset).toBeGreaterThanOrEqual(gameOffset);
      expect(segLayout.realDuration).toBeGreaterThanOrEqual(seg.properties.duration);
      gameOffset += seg.properties.duration;
    }
  });

  it('layout realTotalDuration equals sum of real segment spans', () => {
    const { result } = renderHook(() => useApp());
    setupComboThenBasic(result);

    const events = result.current.allProcessedEvents;
    const layout = buildTimelineLayout(events);

    // For every event with a layout, realTotalDuration should cover all segments
    layout.events.forEach((evLayout, uid) => {
      const ev = events.find(e => e.uid === uid)!;
      if (!ev || ev.segments.length === 0) return;

      let maxEnd = 0;
      if (!evLayout.segments) return;
      for (let i = 0; i < evLayout.segments.length; i++) {
        const seg = evLayout.segments[i];
        const end = seg.realOffset + seg.realDuration;
        if (end > maxEnd) maxEnd = end;
      }
      expect(evLayout.realTotalDuration).toBe(maxEnd);
    });
  });
});
