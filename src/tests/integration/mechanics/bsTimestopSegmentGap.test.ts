/**
 * @jest-environment jsdom
 */

/**
 * BS + ULT timestop segment gap — Integration Test
 *
 * When a multi-segment Battle Skill is dragged into an Ultimate's time-stop
 * region, the segment durations get extended. Verifies:
 *
 * 1. Segments remain contiguous (no gap): seg[N].offset + seg[N].duration === seg[N+1].offset
 * 2. Layout segments match event segment durations (no Math.min mismatch)
 * 3. Frame diamond absoluteFrame values are stable across drag positions
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { getAnimationDuration, computeSegmentsSpan } from '../../../consts/viewTypes';
import { buildTimelineLayout } from '../../../controller/timeline/timelineLayout';
import { findColumn, getMenuPayload, setUltimateEnergyToMax, type AppResult } from '../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_JSON = require('../../../model/game-data/operators/rossi/rossi.json');
const ROSSI_ID: string = ROSSI_JSON.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ROSSI = 'slot-0';

beforeEach(() => { localStorage.clear(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupRossi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });
  return view;
}

/** Verify layout segment contiguity: each segment starts where the previous ends. */
function assertSegmentContiguity(app: AppResult, eventUid: string) {
  const layout = buildTimelineLayout(app.allProcessedEvents);
  const evLayout = layout.events.get(eventUid);
  expect(evLayout).toBeDefined();
  expect(evLayout!.segments).toBeDefined();
  expect(evLayout!.segments!.length).toBeGreaterThan(1);

  for (let i = 0; i < evLayout!.segments!.length - 1; i++) {
    const cur = evLayout!.segments![i];
    const next = evLayout!.segments![i + 1];
    const curEnd = cur.realOffset + cur.realDuration;
    expect(curEnd).toBe(next.realOffset);
  }
}

/** Verify layout segment durations match event segment durations (no Math.min mismatch). */
function assertLayoutMatchesEvent(app: AppResult, eventUid: string) {
  const ev = app.allProcessedEvents.find(e => e.uid === eventUid);
  expect(ev).toBeDefined();
  const layout = buildTimelineLayout(app.allProcessedEvents);
  const evLayout = layout.events.get(eventUid);
  expect(evLayout).toBeDefined();
  expect(evLayout!.segments!.length).toBe(ev!.segments.length);

  for (let i = 0; i < ev!.segments.length; i++) {
    const segDur = ev!.segments[i].properties.duration;
    const layoutDur = evLayout!.segments![i].realDuration;
    // These MUST be equal — if they differ, Math.min in renderer creates a gap
    expect(layoutDur).toBe(segDur);
  }
}

/** Collect absoluteFrame values from all frame markers. */
function collectAbsoluteFrames(app: AppResult, eventUid: string) {
  const ev = app.allProcessedEvents.find(e => e.uid === eventUid);
  if (!ev) return [];
  return ev.segments.flatMap(seg =>
    (seg.frames ?? []).map(f => f.absoluteFrame!),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BS + ULT timestop — segment gap must not appear on drag', () => {
  it('segments are contiguous when BS overlaps ULT timestop', () => {
    const { result } = setupRossi();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ROSSI, 0); });

    const ultCol = findColumn(result.current, SLOT_ROSSI, NounType.ULTIMATE)!;
    expect(ultCol).toBeDefined();

    // Place ULT at 2s — creates a time-stop region
    const ultPayload = getMenuPayload(result.current, ultCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });

    const ultEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.ULTIMATE,
    )!;
    const animDur = getAnimationDuration(ultEvent);
    expect(animDur).toBeGreaterThan(0);
    const timeStopEnd = ultEvent.startFrame + animDur;

    // Place basic attack just after the time-stop (basic attacks are always multi-segment)
    const batkCol = findColumn(result.current, SLOT_ROSSI, NounType.BASIC_ATTACK)!;
    expect(batkCol).toBeDefined();
    const batkPayload = getMenuPayload(result.current, batkCol, timeStopEnd);
    act(() => {
      result.current.handleAddEvent(batkPayload.ownerId, batkPayload.columnId, batkPayload.atFrame, batkPayload.defaultSkill);
    });

    const batkEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    expect(batkEvent).toBeDefined();
    expect(batkEvent.segments.length).toBeGreaterThan(1);

    // Record initial state (no overlap)
    const initialAbsFrames = collectAbsoluteFrames(result.current, batkEvent.uid);
    assertSegmentContiguity(result.current, batkEvent.uid);
    assertLayoutMatchesEvent(result.current, batkEvent.uid);

    // Drag BATK progressively into the time-stop
    const dragSteps = [10, 20, 30, 40, 50, 60, animDur];
    for (const offset of dragSteps) {
      act(() => { result.current.handleMoveEvent(batkEvent.uid, timeStopEnd - offset); });

      // Segments must remain contiguous at every drag position
      assertSegmentContiguity(result.current, batkEvent.uid);

      // Layout must match event (no Math.min mismatch)
      assertLayoutMatchesEvent(result.current, batkEvent.uid);

      // Frame absolute positions must be stable
      const absFrames = collectAbsoluteFrames(result.current, batkEvent.uid);
      expect(absFrames).toEqual(initialAbsFrames);
    }
  });

  it('segments are contiguous when BS starts inside the time-stop', () => {
    const { result } = setupRossi();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ROSSI, 0); });

    const ultCol = findColumn(result.current, SLOT_ROSSI, NounType.ULTIMATE)!;

    // Place ULT at 2s
    const ultPayload = getMenuPayload(result.current, ultCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });

    const ultEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.ULTIMATE,
    )!;
    const animDur = getAnimationDuration(ultEvent);

    // Place basic attack right at the ULT start (fully inside the time-stop)
    const batkCol = findColumn(result.current, SLOT_ROSSI, NounType.BASIC_ATTACK)!;
    expect(batkCol).toBeDefined();
    const batkPayload = getMenuPayload(result.current, batkCol, ultEvent.startFrame);
    act(() => {
      result.current.handleAddEvent(batkPayload.ownerId, batkPayload.columnId, batkPayload.atFrame, batkPayload.defaultSkill);
    });

    const batkEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    expect(batkEvent).toBeDefined();
    expect(batkEvent.segments.length).toBeGreaterThan(1);

    // Segments must be contiguous even when fully inside the time-stop
    assertSegmentContiguity(result.current, batkEvent.uid);
    assertLayoutMatchesEvent(result.current, batkEvent.uid);

    // Extended duration should include the time-stop
    const rawTotal = computeSegmentsSpan(batkCol.defaultEvent!.segments!);
    const extendedTotal = computeSegmentsSpan(batkEvent.segments);
    expect(extendedTotal).toBe(rawTotal + animDur);
  });

  it('segment durations on raw state are NOT mutated by pipeline', () => {
    const { result } = setupRossi();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ROSSI, 0); });

    const ultCol = findColumn(result.current, SLOT_ROSSI, NounType.ULTIMATE)!;

    // Place ULT
    const ultPayload = getMenuPayload(result.current, ultCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });

    const ultEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.ULTIMATE,
    )!;
    const animDur = getAnimationDuration(ultEvent);
    const timeStopEnd = ultEvent.startFrame + animDur;

    // Place basic attack just after timestop
    const batkCol = findColumn(result.current, SLOT_ROSSI, NounType.BASIC_ATTACK)!;
    expect(batkCol).toBeDefined();
    const batkPayload = getMenuPayload(result.current, batkCol, timeStopEnd);
    act(() => {
      result.current.handleAddEvent(batkPayload.ownerId, batkPayload.columnId, batkPayload.atFrame, batkPayload.defaultSkill);
    });

    // Record raw segment durations from the default event template
    const rawSegDurations = batkCol.defaultEvent!.segments!.map(s => s.properties.duration);

    // Drag into time-stop — this should NOT mutate raw segment durations
    const batkUid = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BASIC_ATTACK,
    )!.uid;

    act(() => { result.current.handleMoveEvent(batkUid, ultEvent.startFrame); });

    // Verify raw durations haven't been mutated
    const currentRawDurations = batkCol.defaultEvent!.segments!.map(s => s.properties.duration);
    expect(currentRawDurations).toEqual(rawSegDurations);

    // Move again (simulates drag jitter)
    act(() => { result.current.handleMoveEvent(batkUid, ultEvent.startFrame); });
    const afterJitterDurations = batkCol.defaultEvent!.segments!.map(s => s.properties.duration);
    expect(afterJitterDurations).toEqual(rawSegDurations);
  });
});
