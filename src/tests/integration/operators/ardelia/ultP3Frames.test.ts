/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Ultimate P3 Conditional Frames — Integration Tests
 *
 * Tests that Ardelia's ultimate "Wooly Party" correctly handles
 * potential-gated frames:
 * A. At P0, ult has 2 segments (Animation + Active) with 10 in-bound frames
 * B. At P3+, ult segment extends by 1s and includes 3 additional frames
 * C. No Delay segment is created at any potential level
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

const SLOT_ARDELIA = 'slot-3'; // Ardelia is default slot-3

// Game-data verified segment names (from segment.properties.name in ardelia skills JSON)
const ACTIVE_SEGMENT_NAME = 'Wooly Party';
const DELAY_SEGMENT_NAME = 'Delay';

// Game-data verified frame counts and durations
const P0_FRAME_COUNT = 10;
const P3_FRAME_COUNT = 13;
const P0_ACTIVE_DURATION_S = 3;
const P3_ACTIVE_DURATION_S = 4;

/** Add an ultimate via context menu flow. */
function addUltViaMenu(ref: { current: AppResult }, atFrame: number) {
  act(() => { setUltimateEnergyToMax(ref.current, SLOT_ARDELIA, 3); });
  const col = findColumn(ref.current, SLOT_ARDELIA, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(ref.current, col!, atFrame);
  act(() => { ref.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

describe('Ardelia Ultimate P3 Conditional Frames', () => {
  it('A0: At P0, column defaultEvent has 10 frames (P3 frames excluded by builder)', () => {
    const { result } = renderHook(() => useApp());

    // Context menu verification: ult column is available
    const ultCol = findColumn(result.current, SLOT_ARDELIA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, ultCol!, 1 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent')).toBe(true);

    const segs = ultCol!.defaultEvent!.segments!;
    // 2 segments: Animation + Active
    expect(segs.length).toBe(2);
    const activeSeg = segs.find((s) => s.properties.name === ACTIVE_SEGMENT_NAME);
    expect(activeSeg).toBeDefined();
    expect(activeSeg!.frames!.length).toBe(P0_FRAME_COUNT);
    // Active segment duration = 3s at P0
    expect(activeSeg!.properties.duration).toBe(P0_ACTIVE_DURATION_S * FPS);

    // View-layer verification: computeTimelinePresentation includes the ult column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(ultCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.column).toBe(ultCol);
  });

  it('A0b: At P3, column defaultEvent has 13 frames (P3 frames included)', () => {
    const { result } = renderHook(() => useApp());
    const props = result.current.loadoutProperties[SLOT_ARDELIA];
    act(() => {
      result.current.handleStatsChange(SLOT_ARDELIA, {
        ...props,
        operator: { ...props.operator, potential: 3 },
      });
    });

    const ultCol = findColumn(result.current, SLOT_ARDELIA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const segs = ultCol!.defaultEvent!.segments!;
    expect(segs.length).toBe(2);
    const activeSeg = segs.find((s) => s.properties.name === ACTIVE_SEGMENT_NAME);
    expect(activeSeg).toBeDefined();
    expect(activeSeg!.frames!.length).toBe(P3_FRAME_COUNT);
    // Active segment duration = 4s at P3
    expect(activeSeg!.properties.duration).toBe(P3_ACTIVE_DURATION_S * FPS);
  });

  it('A1: At P0, ultimate has 2 segments (no Delay)', () => {
    const { result } = renderHook(() => useApp());

    addUltViaMenu(result, 1 * FPS);

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
    // 2 segments: Animation + Active (no Delay)
    expect(ultEvents[0].segments.length).toBe(2);
    // No segment named "Delay"
    expect(ultEvents[0].segments.every(
      (s) => s.properties.name !== DELAY_SEGMENT_NAME,
    )).toBe(true);
  });

  it('A2: At P0, active segment has only base frames (out-of-bound P3 frames dropped)', () => {
    const { result } = renderHook(() => useApp());

    addUltViaMenu(result, 1 * FPS);

    const ult = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.ULTIMATE,
    )!;
    const activeSeg = ult.segments.find((s) => s.properties.name === ACTIVE_SEGMENT_NAME);
    expect(activeSeg).toBeDefined();
    // At P0, duration is 3s = 360 frames. Only 10 base frames (0.3s–3.0s) fit.
    expect(activeSeg!.frames!.length).toBe(P0_FRAME_COUNT);
  });

  it('B1: At P3, active segment extends and includes P3-gated frames', () => {
    const { result } = renderHook(() => useApp());

    // Set Ardelia to P3
    const props = result.current.loadoutProperties[SLOT_ARDELIA];
    act(() => {
      result.current.handleStatsChange(SLOT_ARDELIA, {
        ...props,
        operator: { ...props.operator, potential: 3 },
      });
    });

    addUltViaMenu(result, 1 * FPS);

    const ult = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.ULTIMATE,
    )!;
    // Still 2 segments (no Delay)
    expect(ult.segments.length).toBe(2);

    const activeSeg = ult.segments.find((s) => s.properties.name === ACTIVE_SEGMENT_NAME);
    expect(activeSeg).toBeDefined();
    // At P3, duration is 4s = 480 frames. All 13 frames (0.3s–3.9s) fit.
    expect(activeSeg!.frames!.length).toBe(P3_FRAME_COUNT);
    // Active segment duration should be longer than P0
    expect(activeSeg!.properties.duration).toBe(P3_ACTIVE_DURATION_S * FPS);
  });

  it('B2: At P3, ult total duration is longer than at P0', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place ult at P0
    addUltViaMenu(result, 1 * FPS);
    const ultP0 = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.ULTIMATE,
    )!;
    const durationP0 = eventDuration(ultP0);

    // Clear and set to P3
    act(() => { result.current.handleClearLoadout(); });
    const props = result.current.loadoutProperties[SLOT_ARDELIA];
    act(() => {
      result.current.handleStatsChange(SLOT_ARDELIA, {
        ...props,
        operator: { ...props.operator, potential: 3 },
      });
    });

    addUltViaMenu(result, 1 * FPS);
    const ultP3 = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.ULTIMATE,
    )!;
    const durationP3 = eventDuration(ultP3);

    // P3 ult should be ~1s (120 frames) longer than P0
    expect(durationP3).toBeGreaterThan(durationP0);
    expect(durationP3 - durationP0).toBe(1 * FPS);
  });

  it('C1: No Delay segment at any potential level', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    for (const pot of [0, 1, 2, 3, 4, 5]) {
      act(() => { result.current.handleClearLoadout(); });
      const props = result.current.loadoutProperties[SLOT_ARDELIA];
      act(() => {
        result.current.handleStatsChange(SLOT_ARDELIA, {
          ...props,
          operator: { ...props.operator, potential: pot },
        });
      });

      addUltViaMenu(result, 1 * FPS);

      const ult = result.current.allProcessedEvents.find(
        (ev) => ev.ownerEntityId === SLOT_ARDELIA && ev.columnId === NounType.ULTIMATE,
      );
      expect(ult).toBeDefined();
      expect(ult!.segments.length).toBe(2);
      expect(ult!.segments.every((s) => s.properties.name !== DELAY_SEGMENT_NAME)).toBe(true);
    }
  });
});
