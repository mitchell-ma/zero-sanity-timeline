/**
 * @jest-environment jsdom
 */

/**
 * Freeform Derived Event Drag — Integration Test
 *
 * Tests that freeform-placed events on derived columns can be:
 * 1. Plain-dragged (moved) to a new position
 * 2. Ctrl+drag segment-resized
 *
 * Uses Melting Flame as the test case since it's a well-known derived status column.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../model/channels';
import { findColumn, buildContextMenu } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MELTING_FLAME_ID: string = require('../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const SLOT_LAEVATAIN = 'slot-0';

type AppRef = { current: AppResult };

function addMfEvent(ref: AppRef, atSecond: number) {
  const atFrame = atSecond * FPS;
  const statusCol = findColumn(ref.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
  const menuItems = buildContextMenu(ref.current, statusCol!, atFrame);
  const item = menuItems!.find(
    (i) => i.actionId === 'addEvent' && (i.actionPayload as AddEventPayload)?.columnId === MELTING_FLAME_ID,
  );
  const payload = item!.actionPayload as AddEventPayload;
  act(() => {
    ref.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function getMfEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerId === SLOT_LAEVATAIN,
  );
}

describe('Freeform derived event drag', () => {
  it('freeform MF event appears in allProcessedEvents with creationInteractionMode', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    addMfEvent(result, 2);

    const mfEvents = getMfEvents(result.current);
    expect(mfEvents).toHaveLength(1);
    expect(mfEvents[0].creationInteractionMode).toBe(InteractionModeType.FREEFORM);
  });

  it('freeform MF event UID matches raw state UID for handler lookup', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    addMfEvent(result, 2);

    const mfEvents = getMfEvents(result.current);
    expect(mfEvents).toHaveLength(1);
    const pipelineUid = mfEvents[0].uid;

    // Try moving the event — if UID matches raw state, it should succeed
    const originalFrame = mfEvents[0].startFrame;
    const newFrame = originalFrame + FPS; // move 1 second forward

    act(() => {
      result.current.handleMoveEvent(pipelineUid, newFrame);
    });

    const afterMove = getMfEvents(result.current);
    expect(afterMove).toHaveLength(1);
    // If UID propagation works, the event should have moved
    expect(afterMove[0].startFrame).toBe(newFrame);
  });

  it('freeform MF event can be segment-resized via handleResizeSegment', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    addMfEvent(result, 2);

    const mfEvents = getMfEvents(result.current);
    expect(mfEvents).toHaveLength(1);
    const ev = mfEvents[0];
    const originalDuration = ev.segments[0]?.properties.duration;
    expect(originalDuration).toBeGreaterThan(0);

    // Try resizing the first segment to a shorter duration
    const newDuration = Math.floor(originalDuration / 2);
    act(() => {
      result.current.handleResizeSegment(ev.uid, [{ segmentIndex: 0, newDuration }]);
    });

    const afterResize = getMfEvents(result.current);
    expect(afterResize).toHaveLength(1);
    // If resize works, the segment duration should have changed
    expect(afterResize[0].segments[0].properties.duration).toBe(newDuration);
  });
});
