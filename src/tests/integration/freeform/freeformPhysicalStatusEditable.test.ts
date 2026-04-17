/**
 * @jest-environment jsdom
 */

/**
 * Freeform physical status editability — E2E regression.
 *
 * When the user adds LIFT / KNOCK_DOWN / CRUSH / BREACH via the enemy status
 * column's freeform context menu, the raw wrapper event's APPLY clause runs
 * through `applyPhysicalStatus` which creates the visible event on the same
 * column. The applied event MUST reuse the wrapper's uid so:
 *   1. `computeEventPresentation.notDraggable` is false (view allows drag)
 *   2. `handleMoveEvent` / `handleRemoveEvent` can resolve the view-layer uid
 *      back to a raw event — otherwise a derived `d-<COL>-<owner>-<frame>`
 *      uid leaks into the view and neither drag nor remove can find the raw.
 *
 * Three-layer verification per status: pipeline identity + presentation
 * (notDraggable=false) + controller (handleMoveEvent / handleRemoveEvent).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType, PhysicalStatusType } from '../../../consts/enums';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS, PHYSICAL_INFLICTION_COLUMNS } from '../../../model/channels';
import { computeEventPresentation } from '../../../controller/timeline/eventPresentationController';
import { getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import type { MiniTimeline } from '../../../consts/viewTypes';

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

beforeEach(() => { localStorage.clear(); });

function setupApp() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function findEnemyStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

function getEventsOn(app: AppResult, columnId: string) {
  return app.allProcessedEvents.filter(
    ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === columnId,
  );
}

function placeViaContextMenu(
  result: { current: AppResult },
  atFrame: number,
  variantLabel: string,
) {
  const col = findEnemyStatusColumn(result.current);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atFrame, variantLabel);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function runEditableCase(variantLabel: string, columnId: string) {
  const { result } = setupApp();
  const atFrame = 120;
  placeViaContextMenu(result, atFrame, variantLabel);

  // 1. Pipeline: at least one processed event with creationInteractionMode.
  const events = getEventsOn(result.current, columnId);
  expect(events.length).toBeGreaterThanOrEqual(1);
  for (const ev of events) {
    expect(ev.creationInteractionMode).toBe(InteractionModeType.FREEFORM);
  }

  // 2. Identity: raw wrapper uid must match the processed event's uid so
  //    view-layer uids round-trip back to the raw events state.
  const raw = result.current.events.find(
    e => e.columnId === columnId && e.ownerEntityId === ENEMY_ID,
  );
  expect(raw).toBeDefined();
  const rawUid = raw!.uid;
  const processedEv = events.find(e => e.uid === rawUid);
  expect(processedEv).toBeDefined();

  // 3. Presentation: the view must mark the event as draggable.
  const pres = computeEventPresentation(processedEv!, {
    slotElementColors: {},
    autoFinisherIds: new Set(),
    validationMaps: EMPTY_VALIDATION_MAPS,
  });
  expect(pres.notDraggable).toBe(false);

  // 4. Controller — position drag: handleMoveEvent with the view uid must
  //    move the event and the new position survives the next pipeline run.
  const newFrame = atFrame + 60;
  act(() => { result.current.handleMoveEvent(rawUid, newFrame); });
  const moved = getEventsOn(result.current, columnId);
  const movedEv = moved.find(e => e.uid === rawUid);
  expect(movedEv).toBeDefined();
  expect(movedEv!.startFrame).toBe(newFrame);

  // 5. Controller — duration resize (ctrl+drag segment edge): the new
  //    segment duration must flow through the pipeline to the applied event.
  const originalDuration = movedEv!.segments[0].properties.duration;
  const newDuration = Math.max(2, Math.floor(originalDuration / 2));
  act(() => { result.current.handleResizeSegment(rawUid, [{ segmentIndex: 0, newDuration }]); });
  const resized = getEventsOn(result.current, columnId).find(e => e.uid === rawUid);
  expect(resized).toBeDefined();
  expect(resized!.segments[0].properties.duration).toBe(newDuration);

  // 6. Controller — remove: handleRemoveEvent with the view uid must
  //    actually remove the event.
  act(() => { result.current.handleRemoveEvent(rawUid); });
  expect(getEventsOn(result.current, columnId)).toHaveLength(0);
}

describe('Freeform physical status on enemy — add, drag, remove', () => {
  it('LIFT is editable', () => { runEditableCase('Lift', PhysicalStatusType.LIFT); });
  it('KNOCK_DOWN is editable', () => { runEditableCase('Knock Down', PhysicalStatusType.KNOCK_DOWN); });
  it('CRUSH is editable', () => { runEditableCase('Crush', PhysicalStatusType.CRUSH); });
  it('BREACH is editable', () => { runEditableCase('Breach', PhysicalStatusType.BREACH); });

  // Side-effect VULNERABLE events (auto-created by applyPhysicalStatus for
  // LIFT/KNOCK_DOWN, and on the no-Vulnerable path for CRUSH/BREACH) are
  // engine-derived and must NOT carry creationInteractionMode — otherwise the
  // view paints them as draggable while their derived uids can't round-trip
  // to a raw event, producing a ghost-draggable that silently no-ops.
  it('auto VULNERABLE side-effect from LIFT is not draggable (no creationInteractionMode)', () => {
    const { result } = setupApp();
    placeViaContextMenu(result, 120, 'Lift');
    const vuln = getEventsOn(result.current, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE);
    expect(vuln.length).toBeGreaterThanOrEqual(1);
    for (const ev of vuln) {
      expect(ev.creationInteractionMode).toBeUndefined();
      const pres = computeEventPresentation(ev, {
        slotElementColors: {},
        autoFinisherIds: new Set(),
        validationMaps: EMPTY_VALIDATION_MAPS,
      });
      expect(pres.notDraggable).toBe(true);
    }
  });
});
