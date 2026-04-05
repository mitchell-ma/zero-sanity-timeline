/**
 * @jest-environment jsdom
 */

/**
 * Time-stop frame stability — Integration Test
 *
 * When a battle skill is dragged into a time-stop region, the pipeline extends
 * segment durations and adjusts derivedOffsetFrame on frame diamonds. The frame
 * diamonds' ABSOLUTE positions (absoluteFrame) must remain stable — they should
 * not drift or compound across successive pipeline runs.
 *
 * This test catches the mutation-through-shared-reference bug: if
 * extendSingleEvent mutates seg.properties.duration on the raw state's segment
 * objects, each pipeline run compounds the extension, causing frame diamonds
 * to drift and gaps to appear between segments.
 *
 * Verification layers:
 * 1. Controller: absoluteFrame values on processed event frame markers
 * 2. View: ColumnViewModel events have matching frame positions
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { getAnimationDuration, computeSegmentsSpan } from '../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, setUltimateEnergyToMax, type AppResult } from '../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_JSON = require('../../../model/game-data/operators/rossi/rossi.json');
const ROSSI_ID: string = ROSSI_JSON.id;

const BS_JSON = require('../../../model/game-data/operators/rossi/skills/battle-skill-crimson-shadow.json');
const BS_ID: string = BS_JSON.properties.id;

const COMBO_JSON = require('../../../model/game-data/operators/rossi/skills/combo-skill-moment-of-blazing-shadow.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ROSSI = 'slot-0';

beforeEach(() => { localStorage.clear(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupRossi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });
  return view;
}

/** Collect all absoluteFrame values from an event's frame markers. */
function collectAbsoluteFrames(app: AppResult, eventUid: string) {
  const ev = app.allProcessedEvents.find(e => e.uid === eventUid);
  if (!ev) return [];
  return ev.segments.flatMap(seg =>
    (seg.frames ?? []).map(f => f.absoluteFrame!),
  );
}

/** Collect absoluteFrame values from the ColumnViewModel (view layer). */
function collectVMAbsoluteFrames(app: AppResult, eventUid: string) {
  const vms = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  const battleCol = findColumn(app, SLOT_ROSSI, NounType.BATTLE);
  const vm = vms.get(battleCol!.key);
  const vmEvent = vm?.events.find(e => e.uid === eventUid);
  if (!vmEvent) return [];
  return vmEvent.segments.flatMap(seg =>
    (seg.frames ?? []).map(f => f.absoluteFrame!),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Time-stop frame stability — frame diamonds must not drift on drag', () => {
  it('absoluteFrame values remain stable when BS is dragged into a time-stop region', () => {
    const { result } = setupRossi();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_ROSSI, NounType.BATTLE)!;
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO)!;
    expect(battleCol).toBeDefined();
    expect(comboCol).toBeDefined();

    // Place combo at 2s — this creates a time-stop region at its animation start
    const comboPayload = getMenuPayload(result.current, comboCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill);
    });

    const comboEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.COMBO,
    )!;
    const animDur = getAnimationDuration(comboEvent);
    expect(animDur).toBeGreaterThan(0);

    // Place BS just after the time-stop (combo start + animation duration)
    const bsStartFrame = comboEvent.startFrame + animDur;
    const bsPayload = getMenuPayload(result.current, battleCol, bsStartFrame);
    act(() => {
      result.current.handleAddEvent(bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill);
    });

    const bsEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    )!;
    expect(bsEvent).toBeDefined();
    expect(bsEvent.name).toBe(BS_ID);

    // Record initial absolute frame positions (no time-stop overlap yet)
    const initialAbsFrames = collectAbsoluteFrames(result.current, bsEvent.uid);
    expect(initialAbsFrames.length).toBeGreaterThan(0);
    expect(initialAbsFrames.every(f => f != null)).toBe(true);

    // Move BS 30 frames (0.25s) earlier — into the time-stop region
    act(() => { result.current.handleMoveEvent(bsEvent.uid, bsStartFrame - 30); });

    // Controller layer: absoluteFrame values must be identical
    const movedAbsFrames = collectAbsoluteFrames(result.current, bsEvent.uid);
    expect(movedAbsFrames).toEqual(initialAbsFrames);

    // View layer: ColumnViewModel must show the same absoluteFrame values
    const vmAbsFrames = collectVMAbsoluteFrames(result.current, bsEvent.uid);
    expect(vmAbsFrames).toEqual(initialAbsFrames);
  });

  it('absoluteFrame values remain stable across multiple successive drags into time-stop', () => {
    const { result } = setupRossi();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_ROSSI, NounType.BATTLE)!;
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO)!;

    // Place combo at 2s
    const comboPayload = getMenuPayload(result.current, comboCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill);
    });

    const comboEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.COMBO,
    )!;
    const animDur = getAnimationDuration(comboEvent);
    const timeStopEnd = comboEvent.startFrame + animDur;

    // Place BS just after time-stop
    const bsPayload = getMenuPayload(result.current, battleCol, timeStopEnd);
    act(() => {
      result.current.handleAddEvent(bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill);
    });

    const bsUid = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    )!.uid;

    // Record baseline absolute frames
    const baselineAbsFrames = collectAbsoluteFrames(result.current, bsUid);

    // Simulate multiple drag ticks progressively into the time-stop
    // (this is what happens during mouse drag — pipeline runs repeatedly)
    const dragSteps = [10, 20, 30, 40, 50];
    for (const offset of dragSteps) {
      act(() => { result.current.handleMoveEvent(bsUid, timeStopEnd - offset); });
      const absFrames = collectAbsoluteFrames(result.current, bsUid);
      expect(absFrames).toEqual(baselineAbsFrames);
    }

    // View layer consistency on final position
    const vmAbsFrames = collectVMAbsoluteFrames(result.current, bsUid);
    expect(vmAbsFrames).toEqual(baselineAbsFrames);
  });

  it('segment durations do not compound across pipeline runs during drag', () => {
    const { result } = setupRossi();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_ROSSI, NounType.BATTLE)!;
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO)!;

    // Place combo at 2s
    const comboPayload = getMenuPayload(result.current, comboCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill);
    });

    const comboEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.COMBO,
    )!;
    const animDur = getAnimationDuration(comboEvent);
    const timeStopEnd = comboEvent.startFrame + animDur;

    // Place BS at the time-stop boundary
    const bsPayload = getMenuPayload(result.current, battleCol, timeStopEnd);
    act(() => {
      result.current.handleAddEvent(bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill);
    });

    // Record raw segment total (no time-stop overlap)
    const rawTotal = computeSegmentsSpan(battleCol.defaultEvent!.segments!);

    const bsUid = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    )!.uid;

    // Move BS into time-stop — total should be rawTotal + animDur
    act(() => { result.current.handleMoveEvent(bsUid, comboEvent.startFrame); });
    const extendedTotal1 = computeSegmentsSpan(
      result.current.allProcessedEvents.find(ev => ev.uid === bsUid)!.segments,
    );
    expect(extendedTotal1).toBe(rawTotal + animDur);

    // Move again to same position (simulates drag jitter) — total must NOT grow
    act(() => { result.current.handleMoveEvent(bsUid, comboEvent.startFrame); });
    const extendedTotal2 = computeSegmentsSpan(
      result.current.allProcessedEvents.find(ev => ev.uid === bsUid)!.segments,
    );
    expect(extendedTotal2).toBe(extendedTotal1);

    // Move again — still no compounding
    act(() => { result.current.handleMoveEvent(bsUid, comboEvent.startFrame); });
    const extendedTotal3 = computeSegmentsSpan(
      result.current.allProcessedEvents.find(ev => ev.uid === bsUid)!.segments,
    );
    expect(extendedTotal3).toBe(extendedTotal1);
  });
});
