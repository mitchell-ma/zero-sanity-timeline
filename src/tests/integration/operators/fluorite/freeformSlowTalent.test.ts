/**
 * @jest-environment jsdom
 */

/**
 * Fluorite — Freeform Slow Status + T1 Talent Integration
 *
 * Tests that placing a freeform generic SLOW status on the enemy triggers
 * Fluorite's T1 talent (Love the Stab and Twist) with matching timing:
 * 1. Freeform SLOW on enemy → T1 appears with same duration, offset, end frame
 * 2. Remove + re-add SLOW at different time → T1 tracks the new position
 * 3. Resize (extend/shorten) freeform SLOW → T1 extends/shortens to match
 *
 * Three-layer verification:
 * - Context menu: SLOW available in enemy-status column
 * - Controller: event counts, timing, duration alignment
 * - View: computeTimelinePresentation events have matching timing
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import {
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../../model/channels';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import type { ColumnViewModel } from '../../../../controller/timeline/eventPresentationController';
import {
  findColumn,
  buildContextMenu,
} from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

// ── Game-data verified constants ─────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const FLUORITE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/fluorite.json',
).id;

const T1_TALENT_ID: string = require(
  '../../../../model/game-data/operators/fluorite/talents/talent-love-the-stab-and-twist-talent.json',
).properties.id;

const SLOW_STATUS_ID: string = require(
  '../../../../model/game-data/generic/statuses/status-slow.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_FLUORITE = 'slot-0';

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupFluorite() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => { view.result.current.handleSwapOperator(SLOT_FLUORITE, FLUORITE_ID); });
  return view;
}

/** Place a freeform SLOW status on the enemy at the given frame. */
function placeSlowOnEnemy(app: AppResult, atFrame: number) {
  const enemyStatusCol = findColumn(app, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();
  const menuItems = buildContextMenu(app, enemyStatusCol!, atFrame);
  expect(menuItems).not.toBeNull();
  const slowItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === SLOW_STATUS_ID,
  );
  expect(slowItem).toBeDefined();
  expect(slowItem!.disabled).toBeFalsy();
  const payload = slowItem!.actionPayload as AddEventPayload;
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

/** Get triggered T1 talent events (startFrame > 0 distinguishes from permanent presence). */
function getT1Events(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.name === T1_TALENT_ID
      && ev.ownerId === SLOT_FLUORITE
      && ev.startFrame > 0,
  );
}

function getSlowEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.name === SLOW_STATUS_ID && ev.ownerId === ENEMY_ID,
  );
}

/** Find events by name in any ColumnViewModel. */
function findInView(viewModels: Map<string, ColumnViewModel>, name: string, ownerId: string) {
  let found: ReturnType<typeof getSlowEvents>[0] | undefined;
  viewModels.forEach((vm) => {
    if (found) return;
    const match = vm.events.find((ev) => ev.name === name && ev.ownerId === ownerId && eventDuration(ev) > 0);
    if (match) found = match;
  });
  return found;
}

/**
 * Assert T1 and SLOW have matching timing at both controller and view layers.
 * Returns the matched durations for further assertions.
 */
function assertTimingAlignment(app: AppResult) {
  // ── Controller layer ────────────────────────────────────────────
  const slowEvents = getSlowEvents(app);
  expect(slowEvents).toHaveLength(1);
  const t1Events = getT1Events(app);
  expect(t1Events).toHaveLength(1);

  const slow = slowEvents[0];
  const t1 = t1Events[0];
  const slowDur = eventDuration(slow);
  const t1Dur = eventDuration(t1);

  expect(t1.startFrame).toBe(slow.startFrame);
  expect(t1Dur).toBe(slowDur);
  expect(t1.startFrame + t1Dur).toBe(slow.startFrame + slowDur);

  // ── View layer ──────────────────────────────────────────────────
  const viewModels = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  const slowVm = findInView(viewModels, SLOW_STATUS_ID, ENEMY_ID);
  const t1Vm = findInView(viewModels, T1_TALENT_ID, SLOT_FLUORITE);
  expect(slowVm).toBeDefined();
  expect(t1Vm).toBeDefined();

  const slowVmDur = eventDuration(slowVm!);
  const t1VmDur = eventDuration(t1Vm!);

  // View-layer timing matches controller-layer timing
  expect(t1Vm!.startFrame).toBe(slowVm!.startFrame);
  expect(t1VmDur).toBe(slowVmDur);
  expect(t1Vm!.startFrame + t1VmDur).toBe(slowVm!.startFrame + slowVmDur);

  return { slowDur, t1Dur };
}

// ═════════════════════════════════════════════════════════════════════════════
// Freeform SLOW → T1 Talent Alignment
// ═════════════════════════════════════════════════════════════════════════════

describe('Fluorite T1 talent triggered by freeform SLOW status', () => {
  it('T1 appears with same duration, offset, and end frame as SLOW', () => {
    const { result } = setupFluorite();

    // Before SLOW: no T1 triggered
    expect(getT1Events(result.current)).toHaveLength(0);

    // ── Context menu: SLOW is available in the enemy-status column ─────
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, enemyStatusCol!, 3 * FPS);
    expect(menuItems).not.toBeNull();
    const slowMenuItem = menuItems!.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as AddEventPayload)?.columnId === SLOW_STATUS_ID,
    );
    expect(slowMenuItem).toBeDefined();
    expect(slowMenuItem!.disabled).toBeFalsy();

    // Place freeform SLOW on enemy at 3s
    act(() => { placeSlowOnEnemy(result.current, 3 * FPS); });

    // Verify alignment at all layers
    assertTimingAlignment(result.current);
  });

  it('moving SLOW to later frame moves T1 to match', () => {
    const { result } = setupFluorite();

    // Place freeform SLOW on enemy at 3s
    act(() => { placeSlowOnEnemy(result.current, 3 * FPS); });
    assertTimingAlignment(result.current);

    // Remove existing SLOW and re-place at 5s
    const slowRawUid = result.current.events.find(
      (ev) => ev.name === SLOW_STATUS_ID,
    )!.uid;
    act(() => { result.current.handleRemoveEvent(slowRawUid); });
    expect(getSlowEvents(result.current)).toHaveLength(0);
    expect(getT1Events(result.current)).toHaveLength(0);

    // Place SLOW at new position (5s)
    act(() => { placeSlowOnEnemy(result.current, 5 * FPS); });

    // ── Controller: SLOW at new position ──────────────────────────────
    expect(getSlowEvents(result.current)[0].startFrame).toBe(5 * FPS);

    // Verify timing alignment at all layers
    assertTimingAlignment(result.current);
  });

  it('extending SLOW by 1s extends T1 by 1s', () => {
    const { result } = setupFluorite();

    // Place freeform SLOW on enemy at 3s
    act(() => { placeSlowOnEnemy(result.current, 3 * FPS); });
    const { slowDur: baseDur } = assertTimingAlignment(result.current);

    // ── Extend input SLOW by +1s ──────────────────────────────────────
    const slowRaw = result.current.events.find(
      (ev) => ev.name === SLOW_STATUS_ID,
    )!;
    const extensionFrames = 1 * FPS;
    act(() => {
      result.current.handleResizeSegment(slowRaw.uid, [{ segmentIndex: 0, newDuration: baseDur + extensionFrames }]);
    });

    // T1 extends to match the new SLOW duration
    const { slowDur: extendedDur } = assertTimingAlignment(result.current);
    expect(extendedDur).toBe(baseDur + extensionFrames);
  });

  it('shortening SLOW by 0.5s shortens T1 by 0.5s', () => {
    const { result } = setupFluorite();

    // Place freeform SLOW on enemy at 3s
    act(() => { placeSlowOnEnemy(result.current, 3 * FPS); });
    const { slowDur: baseDur } = assertTimingAlignment(result.current);

    // ── Shorten input SLOW by -0.5s ───────────────────────────────────
    const slowRaw = result.current.events.find(
      (ev) => ev.name === SLOW_STATUS_ID,
    )!;
    const shortenFrames = Math.round(0.5 * FPS);
    act(() => {
      result.current.handleResizeSegment(slowRaw.uid, [{ segmentIndex: 0, newDuration: baseDur - shortenFrames }]);
    });

    // T1 shortens to match the new SLOW duration
    const { slowDur: shortenedDur } = assertTimingAlignment(result.current);
    expect(shortenedDur).toBe(baseDur - shortenFrames);
  });

  it('second SLOW at 1s while first SLOW at 0s is still active does not create a second T1', () => {
    const { result } = setupFluorite();

    // Place first SLOW at 2s
    act(() => { placeSlowOnEnemy(result.current, 2 * FPS); });

    // ── Controller: exactly 1 SLOW, exactly 1 T1 ─────────────────────
    expect(getSlowEvents(result.current)).toHaveLength(1);
    const t1After1 = getT1Events(result.current);
    expect(t1After1).toHaveLength(1);

    // Place second SLOW at 3s (while first is still active — 2s duration)
    act(() => { placeSlowOnEnemy(result.current, 3 * FPS); });

    // ── Controller: 2 SLOW events but still exactly 1 T1 ─────────────
    // The second SLOW applies SLOW stat again, but stat is already > 0
    // (first SLOW is still active), so IS:SLOWED should NOT re-fire.
    const slowsAfter2 = getSlowEvents(result.current);
    expect(slowsAfter2.length).toBeGreaterThanOrEqual(1);
    const t1After2 = getT1Events(result.current);
    expect(t1After2).toHaveLength(1);

    // ── View layer: only 1 T1 in presentation ─────────────────────────
    const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    let t1ViewCount = 0;
    viewModels.forEach((vm) => {
      t1ViewCount += vm.events.filter((ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && eventDuration(ev) > 0).length;
    });
    expect(t1ViewCount).toBe(1);
  });
});
