/**
 * @jest-environment jsdom
 */

/**
 * Infliction follows drag — Integration Test
 *
 * Verifies that when a battle skill that applies an elemental infliction
 * is dragged to a new position, the derived infliction event moves to
 * match the new frame timing, and the visual output updates accordingly.
 *
 * Verification goes through the full visual pipeline:
 *   allProcessedEvents → computeTimelinePresentation (ColumnViewModel cache)
 *   → EventBlock rendering (React.memo)
 *
 * This catches caching bugs where the ColumnViewModel returns stale infliction
 * events even though the pipeline re-derived them at the correct new position.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { render } from '@testing-library/react';
import React from 'react';
import { useApp } from '../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID } from '../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { durationToPx } from '../../../utils/timeline';
import type { MiniTimeline, TimelineEvent } from '../../../consts/viewTypes';
import EventBlock from '../../../view/EventBlock';

const SLOT_AKEKURI = 'slot-1';
const ZOOM = 1;
const noop2 = (_a: unknown, _b: unknown) => {};
const noop3 = (_a: unknown, _b: unknown, _c: unknown) => {};

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function getHeatInflictions(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
  );
}

/** Get the heat infliction event from the ColumnViewModel (same path as real rendering). */
function getInflictionFromVM(app: ReturnType<typeof useApp>) {
  const vms = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  // Find the enemy column that contains heat inflictions
  for (const [, vm] of Array.from(vms.entries())) {
    const match = vm.events.find(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    if (match) return match;
  }
  return null;
}

/** Render an EventBlock and extract its translateY position. */
function measureBlockPosition(event: TimelineEvent) {
  // eslint-disable-next-line testing-library/render-result-naming-convention
  const { container: root, unmount } = render(
    React.createElement(EventBlock, {
      event,
      color: '#e05555',
      zoom: ZOOM,
      label: event.name,
      onDragStart: noop3,
      onContextMenu: noop2,
    }),
  );
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  const wrap = root.querySelector('.event-wrap') as HTMLElement;
  let pos: number | null = null;
  if (wrap) {
    const match = wrap.style.transform.match(/translateY\(([^)]+)px\)/);
    pos = match ? parseFloat(match[1]) : null;
  }
  unmount();
  return pos;
}

describe('Infliction follows drag — Akekuri battle skill heat infliction', () => {
  it('battle skill creates a heat infliction on the enemy', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    const inflictions = getHeatInflictions(result.current);
    expect(inflictions.length).toBeGreaterThanOrEqual(1);

    const battleEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    )!;
    expect(inflictions[0].startFrame).toBeGreaterThanOrEqual(battleEvent.startFrame);
  });

  it('infliction startFrame updates when battle skill is dragged', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    const battleUid = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    )!.uid;

    const inflictionStartBefore = getHeatInflictions(result.current)[0].startFrame;

    act(() => { result.current.handleMoveEvent(battleUid, 4 * FPS); });

    const inflictionStartAfter = getHeatInflictions(result.current)[0].startFrame;
    expect(inflictionStartAfter).toBe(inflictionStartBefore + 2 * FPS);
  });

  it('ColumnViewModel infliction updates when battle skill is dragged (cache invalidation)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    const battleUid = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    )!.uid;

    // Get infliction from ColumnViewModel at battle=2s
    const vmInflictionBefore = getInflictionFromVM(result.current);
    expect(vmInflictionBefore).not.toBeNull();
    const startBefore = vmInflictionBefore!.startFrame;

    // Drag battle skill to 4s
    act(() => { result.current.handleMoveEvent(battleUid, 4 * FPS); });

    // Get infliction from ColumnViewModel again — must go through cache
    const vmInflictionAfter = getInflictionFromVM(result.current);
    expect(vmInflictionAfter).not.toBeNull();
    const startAfter = vmInflictionAfter!.startFrame;

    // ColumnViewModel must return updated startFrame (cache must not return stale data)
    expect(startAfter).toBe(startBefore + 2 * FPS);
  });

  it('EventBlock visual position updates through ColumnViewModel pipeline', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, 1 * FPS, battleCol!.defaultEvent!,
      );
    });

    const battleUid = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    )!.uid;

    // Get infliction from ColumnViewModel and render EventBlock (battle at 1s)
    const vmBefore = getInflictionFromVM(result.current)!;
    const posBefore = measureBlockPosition(vmBefore);
    expect(posBefore).not.toBeNull();

    // Drag battle skill to 3s
    act(() => { result.current.handleMoveEvent(battleUid, 3 * FPS); });

    // Get infliction from ColumnViewModel again and render EventBlock (battle at 3s)
    const vmAfter = getInflictionFromVM(result.current)!;
    const posAfter = measureBlockPosition(vmAfter);
    expect(posAfter).not.toBeNull();

    // EventBlock position must reflect the moved infliction
    const expectedPxDelta = durationToPx(2 * FPS, ZOOM);
    expect(posAfter! - posBefore!).toBeCloseTo(expectedPxDelta, 1);
  });
});
