/**
 * @jest-environment jsdom
 */

/**
 * Freeform Draggable — E2E
 *
 * Verifies that ALL event types created through freeform context menu are
 * draggable: creationInteractionMode is propagated through the engine pipeline,
 * the presentation layer marks them as not-notDraggable, and handleMoveEvent
 * successfully repositions them.
 *
 * Covers:
 * 1. Reactions (combustion — direct freeform placement)
 * 2. Inflictions (heat — direct freeform placement)
 * 3. Operator statuses (Melting Flame — derived column)
 * 4. Derived reactions from freeform inflictions (heat + cryo → combustion)
 *
 * Three-layer verification: pipeline (creationInteractionMode) → presentation
 * (notDraggable=false) → controller (handleMoveEvent succeeds).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
  INFLICTION_COLUMNS,
  REACTION_COLUMNS,
  OPERATOR_STATUS_COLUMN_ID,
} from '../../../model/channels';
import {
  computeEventPresentation,
} from '../../../controller/timeline/eventPresentationController';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { buildContextMenu, findColumn } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MELTING_FLAME_ID: string = require('../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;

const SLOT_LAEVATAIN = 'slot-0';

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_VALIDATION_MAPS = {
  combo: new Map<string, string>(),
  resource: new Map<string, string>(),
  empowered: new Map<string, string>(),
  enhanced: new Map<string, string>(),
  regularBasic: new Map<string, string>(),
  clause: new Map<string, string>(),
  finisherStagger: new Map<string, string>(),
  timeStop: new Map<string, string>(),
  infliction: new Map<string, string>(),
};

function findEnemyStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

function placeViaContextMenu(
  result: { current: AppResult },
  col: MiniTimeline,
  targetColumnId: string,
  atFrame: number,
) {
  const menu = buildContextMenu(result.current, col, atFrame);
  expect(menu).not.toBeNull();
  const item = menu!.find(
    (i) =>
      i.actionId === 'addEvent' &&
      (i.actionPayload as AddEventPayload)?.columnId === targetColumnId,
  );
  expect(item).toBeDefined();
  const payload = item!.actionPayload as AddEventPayload;
  act(() => {
    result.current.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function getEvents(app: AppResult, columnId: string, ownerEntityId: string) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === columnId && ev.ownerEntityId === ownerEntityId,
  );
}

/** Assert an event has creationInteractionMode, is not notDraggable, and can be moved. */
function assertDraggable(
  result: { current: AppResult },
  columnId: string,
  ownerEntityId: string,
  description: string,
) {
  const events = getEvents(result.current, columnId, ownerEntityId);
  expect(events.length).toBeGreaterThanOrEqual(1);
  const ev = events[0];

  // 1. Pipeline: creationInteractionMode propagated
  expect(ev.creationInteractionMode).toBe(InteractionModeType.FREEFORM);

  // 2. Presentation: notDraggable = false
  const col = result.current.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ownerEntityId &&
      (c.columnId === columnId ||
        (c.matchColumnIds?.includes(columnId) ?? false)),
  );
  expect(col).toBeDefined();
  const pres = computeEventPresentation(ev, col!, {
    slotElementColors: {},
    autoFinisherIds: new Set(),
    validationMaps: EMPTY_VALIDATION_MAPS,
  });
  expect(pres.notDraggable).toBe(false);

  // 3. Controller: handleMoveEvent succeeds
  const originalFrame = ev.startFrame;
  const newFrame = originalFrame + FPS;
  act(() => {
    result.current.handleMoveEvent(ev.uid, newFrame);
  });
  const afterMove = getEvents(result.current, columnId, ownerEntityId);
  expect(afterMove.length).toBeGreaterThanOrEqual(1);
  const movedEv = afterMove.find((e) => e.uid === ev.uid);
  expect(movedEv).toBeDefined();
  expect(movedEv!.startFrame).toBe(newFrame);
}

beforeEach(() => { localStorage.clear(); });

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Freeform-placed events are draggable', () => {
  it('direct freeform reaction (combustion) is draggable', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const enemyCol = findEnemyStatusColumn(result.current)!;
    placeViaContextMenu(result, enemyCol, REACTION_COLUMNS.COMBUSTION, 2 * FPS);

    assertDraggable(result, REACTION_COLUMNS.COMBUSTION, ENEMY_ID, 'combustion');
  });

  it('direct freeform infliction (heat) is draggable', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const enemyCol = findEnemyStatusColumn(result.current)!;
    placeViaContextMenu(result, enemyCol, INFLICTION_COLUMNS.HEAT, 2 * FPS);

    assertDraggable(result, INFLICTION_COLUMNS.HEAT, ENEMY_ID, 'heat infliction');
  });

  it('freeform operator status (Melting Flame) is draggable', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID)!;
    placeViaContextMenu(result, statusCol, MELTING_FLAME_ID, 2 * FPS);

    assertDraggable(result, MELTING_FLAME_ID, SLOT_LAEVATAIN, 'Melting Flame');
  });

  it('derived reaction from freeform inflictions inherits draggability', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const enemyCol = findEnemyStatusColumn(result.current)!;

    // Place cryo at 1s, then heat at 2s → combustion appears at 2s
    placeViaContextMenu(result, enemyCol, INFLICTION_COLUMNS.CRYO, 1 * FPS);
    placeViaContextMenu(result, enemyCol, INFLICTION_COLUMNS.HEAT, 2 * FPS);

    // The derived combustion from cross-element reaction should inherit
    // creationInteractionMode from the triggering freeform infliction
    const combustions = getEvents(result.current, REACTION_COLUMNS.COMBUSTION, ENEMY_ID);
    expect(combustions.length).toBeGreaterThanOrEqual(1);
    expect(combustions[0].creationInteractionMode).toBe(InteractionModeType.FREEFORM);

    // Presentation: not notDraggable
    const pres = computeEventPresentation(combustions[0], enemyCol, {
      slotElementColors: {},
      autoFinisherIds: new Set(),
      validationMaps: EMPTY_VALIDATION_MAPS,
    });
    expect(pres.notDraggable).toBe(false);
  });
});
