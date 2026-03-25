/**
 * @jest-environment jsdom
 */

/**
 * Time-stop segment extension — Integration Test
 *
 * Verifies that when a battle skill overlaps with a combo skill's time-stop
 * region, the battle skill's segments are visually extended and its frame
 * diamonds are repositioned to account for the frozen time.
 *
 * Verification goes through the full visual pipeline:
 *   allProcessedEvents → computeTimelinePresentation (ColumnViewModel cache)
 *   → EventBlock rendering (React.memo)
 *
 * This catches caching bugs where the ColumnViewModel returns stale data
 * even though the processed events have correct extended values.
 */

import { renderHook, act } from '@testing-library/react';
import { render } from '@testing-library/react';
import React from 'react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS } from '../../model/channels';
import { InteractionModeType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import { getAnimationDuration, computeSegmentsSpan } from '../../consts/viewTypes';
import { computeTimelinePresentation } from '../../controller/timeline/eventPresentationController';
import { durationToPx } from '../../utils/timeline';
import type { MiniTimeline, TimelineEvent } from '../../consts/viewTypes';
import EventBlock from '../../view/EventBlock';

const SLOT_LAEVATAIN = 'slot-0';
const ZOOM = 1;
const noop2 = (_a: unknown, _b: unknown) => {};
const noop3 = (_a: unknown, _b: unknown, _c: unknown) => {};

function findColumn(app: ReturnType<typeof useApp>, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === SLOT_LAEVATAIN &&
      c.columnId === columnId,
  );
}

/** Get the battle skill event from the ColumnViewModel (same path as real rendering). */
function getBattleEventFromVM(app: ReturnType<typeof useApp>) {
  const vms = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  const battleCol = findColumn(app, SKILL_COLUMNS.BATTLE);
  const vm = vms.get(battleCol!.key);
  return vm?.events.find(ev => ev.ownerId === SLOT_LAEVATAIN) ?? null;
}

/** Render an EventBlock and return segment/frame DOM measurements. */
function measureEventBlock(event: TimelineEvent, color = '#f0a040') {
  // eslint-disable-next-line testing-library/render-result-naming-convention
  const { container: root, unmount } = render(
    React.createElement(EventBlock, {
      event,
      color,
      zoom: ZOOM,
      label: event.name,
      onDragStart: noop3,
      onContextMenu: noop2,
    }),
  );
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  const segEls = root.querySelectorAll('.event-segment');
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  const frameEls = root.querySelectorAll('.event-frame-diamond');
  const result = {
    segmentRects: Array.from(segEls).map((el) => ({
      top: parseFloat((el as HTMLElement).style.top || '0'),
      height: parseFloat((el as HTMLElement).style.height || '0'),
    })),
    frameTops: Array.from(frameEls).map((el) =>
      parseFloat((el as HTMLElement).style.top || '0'),
    ),
  };
  unmount();
  return result;
}

describe('Time-stop segment extension — battle skill + combo overlap', () => {
  it('battle skill segments are extended when combo timestop overlaps', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SKILL_COLUMNS.BATTLE);
    const comboCol = findColumn(result.current, SKILL_COLUMNS.COMBO);
    expect(battleCol).toBeDefined();
    expect(comboCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 0, battleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.COMBO, 0, comboCol!.defaultEvent!);
    });

    const battleEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    )!;
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.COMBO,
    )!;
    const animDur = getAnimationDuration(comboEvent);
    expect(animDur).toBeGreaterThan(0);

    const rawTotal = computeSegmentsSpan(battleCol!.defaultEvent!.segments!);
    const processedTotal = computeSegmentsSpan(battleEvent.segments);
    expect(processedTotal).toBeGreaterThan(rawTotal);
    expect(processedTotal).toBe(rawTotal + animDur);
  });

  it('frame derivedOffsetFrame values differ from raw offsetFrame when timestop overlaps', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SKILL_COLUMNS.BATTLE);
    const comboCol = findColumn(result.current, SKILL_COLUMNS.COMBO);

    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 0, battleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.COMBO, 0, comboCol!.defaultEvent!);
    });

    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.COMBO,
    )!;
    const animDur = getAnimationDuration(comboEvent);

    // Get the battle event from the ColumnViewModel (same path as rendering)
    const vmEvent = getBattleEventFromVM(result.current);
    expect(vmEvent).not.toBeNull();

    // Frames in segments that overlap the time-stop must have extended offsets
    let rawCumulativeOffset = 0;
    const rawBattleSegs = battleCol!.defaultEvent!.segments!;
    const allFrames = vmEvent!.segments.flatMap((seg, si) => {
      const rawSegDur = rawBattleSegs[si]?.properties.duration ?? seg.properties.duration;
      const segAbsStart = vmEvent!.startFrame + rawCumulativeOffset;
      rawCumulativeOffset += rawSegDur;
      return (seg.frames ?? []).map(f => ({ ...f, segAbsStart }));
    });

    const derivedDefined = allFrames.every(f => f.derivedOffsetFrame != null);
    expect(derivedDefined).toBe(true);

    const extendedFrames = allFrames.filter(f => f.segAbsStart < animDur);
    expect(extendedFrames.length).toBeGreaterThan(0);
    for (const ef of extendedFrames) {
      expect(ef.derivedOffsetFrame).toBeGreaterThan(ef.offsetFrame);
    }
  });

  it('ColumnViewModel updates frame positions when combo is dragged (cache invalidation)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SKILL_COLUMNS.BATTLE);
    const comboCol = findColumn(result.current, SKILL_COLUMNS.COMBO);

    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 0, battleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.COMBO, 0, comboCol!.defaultEvent!);
    });

    const comboUid = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.COMBO,
    )!.uid;

    // Capture ColumnViewModel event at combo=0s
    const vmAt0s = getBattleEventFromVM(result.current)!;
    const framesAt0s = vmAt0s.segments.flatMap(s => (s.frames ?? []).map(f => f.derivedOffsetFrame));

    // Move combo to 1s — this shifts the timestop, changing which frames get extended
    act(() => { result.current.handleMoveEvent(comboUid, 1 * FPS); });

    // Capture ColumnViewModel event at combo=1s (must go through cache again)
    const vmAt1s = getBattleEventFromVM(result.current)!;
    const framesAt1s = vmAt1s.segments.flatMap(s => (s.frames ?? []).map(f => f.derivedOffsetFrame));

    // The ColumnViewModel must have returned DIFFERENT frame positions
    // (if the cache incorrectly returns stale data, these would be identical)
    const changed = framesAt0s.some((v, i) => v !== framesAt1s[i]);
    expect(changed).toBe(true);
  });

  it('EventBlock renders adjusted frame positions from ColumnViewModel events', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SKILL_COLUMNS.BATTLE);
    const comboCol = findColumn(result.current, SKILL_COLUMNS.COMBO);

    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 0, battleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.COMBO, 0, comboCol!.defaultEvent!);
    });

    const comboUid = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.COMBO,
    )!.uid;

    // Render EventBlock with the ColumnViewModel event (combo at 0s)
    const vmAt0s = getBattleEventFromVM(result.current)!;
    const renderAt0s = measureEventBlock(vmAt0s);

    // Move combo to 1s
    act(() => { result.current.handleMoveEvent(comboUid, 1 * FPS); });

    // Render EventBlock with the ColumnViewModel event (combo at 1s)
    const vmAt1s = getBattleEventFromVM(result.current)!;
    const renderAt1s = measureEventBlock(vmAt1s);

    // Rendered frame positions must differ between the two states
    const posChanged = renderAt0s.frameTops.some(
      (v, i) => Math.abs(v - renderAt1s.frameTops[i]) > 0.1,
    );
    expect(posChanged).toBe(true);

    // Each rendered frame must match its event's derivedOffsetFrame
    let frameIdx = 0;
    let offsetFrames = 0;
    for (const seg of vmAt1s.segments) {
      const segTopPx = durationToPx(offsetFrames, ZOOM);
      for (const f of seg.frames ?? []) {
        const expectedPx = segTopPx + durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, ZOOM);
        expect(renderAt1s.frameTops[frameIdx]).toBeCloseTo(expectedPx, 1);
        frameIdx++;
      }
      offsetFrames += seg.properties.duration;
    }
  });
});
