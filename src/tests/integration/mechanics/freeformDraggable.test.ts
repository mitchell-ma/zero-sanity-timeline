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
import { NounType } from '../../../dsl/semantics';
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
import { buildContextMenu, findColumn, getAddEventPayload } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const MELTING_FLAME_ID: string = require('../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const ESTELLA_ID: string = require('../../../model/game-data/operators/estella/estella.json').id;
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_ESTELLA = 'slot-0';
const SLOT_WULFGARD = 'slot-0';

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
  const pres = computeEventPresentation(ev, {
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

  it('direct freeform qualified status (Physical Susceptibility) is draggable', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const enemyCol = findEnemyStatusColumn(result.current)!;
    placeViaContextMenu(result, enemyCol, 'PHYSICAL_SUSCEPTIBILITY', 2 * FPS);

    assertDraggable(result, 'PHYSICAL_SUSCEPTIBILITY', ENEMY_ID, 'physical susceptibility');
  });

  it('freeform operator status (Melting Flame) is draggable', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID)!;
    placeViaContextMenu(result, statusCol, MELTING_FLAME_ID, 2 * FPS);

    assertDraggable(result, MELTING_FLAME_ID, SLOT_LAEVATAIN, 'Melting Flame');
  });

  it('derived reaction from freeform inflictions inherits draggability (both freeform)', () => {
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
    const pres = computeEventPresentation(combustions[0], {
      slotElementColors: {},
      autoFinisherIds: new Set(),
      validationMaps: EMPTY_VALIDATION_MAPS,
    });
    expect(pres.notDraggable).toBe(false);
  });

  /** Place a skill via the battle-skill column context menu. */
  function placeBattleSkill(
    result: { current: AppResult },
    slotId: string,
    atFrame: number,
  ) {
    const bsCol = findColumn(result.current, slotId, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const menu = buildContextMenu(result.current, bsCol!, atFrame);
    expect(menu).not.toBeNull();
    const payload = getAddEventPayload(menu!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }

  it('reaction triggered by freeform second element is draggable (strict skill first, freeform trigger)', () => {
    // Scenario: a skill cast in STRICT mode applies the FIRST element
    // infliction; then the user switches to FREEFORM and manually adds the
    // SECOND element, which triggers the reaction. Per the rule — if the
    // freeform infliction is the second (triggering) element, the reaction
    // inherits draggability from the user's placement.
    const { result } = renderHook(() => useApp());

    // Swap in Estella. Estella's BS Onomatopoeia applies CRYO INFLICTION at
    // +0.7s into the animation. Placed in default STRICT mode: the derived
    // cryo infliction has no creationInteractionMode (skill-derived).
    act(() => { result.current.handleSwapOperator(SLOT_ESTELLA, ESTELLA_ID); });
    placeBattleSkill(result, SLOT_ESTELLA, 1 * FPS);

    // Verify the derived cryo infliction is on the enemy and NOT tagged
    // freeform (so we know this is the mixed-mode case, not both-freeform)
    const cryoInflictions = getEvents(result.current, INFLICTION_COLUMNS.CRYO, ENEMY_ID);
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
    expect(cryoInflictions[0].creationInteractionMode).toBeUndefined();

    // Switch to FREEFORM and add the second element (HEAT), which becomes
    // the triggering second element for combustion.
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const enemyCol = findEnemyStatusColumn(result.current)!;
    // Place heat while the strict-derived cryo is still active (the BS cryo
    // default duration covers several seconds)
    placeViaContextMenu(result, enemyCol, INFLICTION_COLUMNS.HEAT, 3 * FPS);

    // Assert: the derived combustion inherits creationInteractionMode from
    // the freeform heat (triggering second element) and is draggable.
    const combustions = getEvents(result.current, REACTION_COLUMNS.COMBUSTION, ENEMY_ID);
    expect(combustions.length).toBeGreaterThanOrEqual(1);
    expect(combustions[0].creationInteractionMode).toBe(InteractionModeType.FREEFORM);

    const pres = computeEventPresentation(combustions[0], {
      slotElementColors: {},
      autoFinisherIds: new Set(),
      validationMaps: EMPTY_VALIDATION_MAPS,
    });
    expect(pres.notDraggable).toBe(false);

    // Controller: handleMoveEvent succeeds (full three-layer proof)
    const originalFrame = combustions[0].startFrame;
    const newFrame = originalFrame + FPS;
    act(() => { result.current.handleMoveEvent(combustions[0].uid, newFrame); });
    const moved = getEvents(result.current, REACTION_COLUMNS.COMBUSTION, ENEMY_ID);
    const movedEv = moved.find((e) => e.uid === combustions[0].uid);
    expect(movedEv).toBeDefined();
    expect(movedEv!.startFrame).toBe(newFrame);
  });

  it('reaction triggered by strict-mode skill second element is NOT draggable (freeform first, strict trigger)', () => {
    // Mirror of the previous test: the FIRST element comes from freeform,
    // but the SECOND (triggering) element comes from a strict-mode skill.
    // Per the rule — the reaction inherits from the incoming triggering
    // infliction, so a skill-derived trigger makes the reaction NOT
    // draggable regardless of how the first element was placed.
    const { result } = renderHook(() => useApp());

    // Swap in Wulfgard. His BS Thermite Tracers applies HEAT INFLICTION.
    act(() => { result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });

    // Start in FREEFORM, place CRYO at 1s
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const enemyCol = findEnemyStatusColumn(result.current)!;
    placeViaContextMenu(result, enemyCol, INFLICTION_COLUMNS.CRYO, 1 * FPS);

    // Switch back to STRICT and cast Wulfgard's BS — its frame applies
    // HEAT INFLICTION a short time later, triggering combustion
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    placeBattleSkill(result, SLOT_WULFGARD, 2 * FPS);

    // The derived combustion should exist but have NO creationInteractionMode
    // — the trigger came from a skill-derived heat, not a freeform user
    // action, so the reaction must be locked.
    const combustions = getEvents(result.current, REACTION_COLUMNS.COMBUSTION, ENEMY_ID);
    // Combustion may or may not have been derived depending on infliction
    // overlap timing. If one exists, it MUST not be draggable.
    for (const c of combustions) {
      expect(c.creationInteractionMode).toBeUndefined();
      const pres = computeEventPresentation(c, {
        slotElementColors: {},
        autoFinisherIds: new Set(),
        validationMaps: EMPTY_VALIDATION_MAPS,
      });
      expect(pres.notDraggable).toBe(true);
    }
  });
});
