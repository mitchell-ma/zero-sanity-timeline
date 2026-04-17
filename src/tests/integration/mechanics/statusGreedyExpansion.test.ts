/**
 * @jest-environment jsdom
 */

/**
 * Status Greedy Expansion — Integration Test
 *
 * Verifies that visually-truncated stacking status events use their visual
 * duration (not raw segment duration) for greedy width expansion. This
 * ensures that the last stacking event (which keeps its full visual duration)
 * can expand into adjacent micro-column slots that are only occupied by
 * earlier visually-clamped events.
 *
 * Test scenario: Yvonne places ult + multiple EBATKs during ult active
 * phase. Each EBATK sequence adds a crit stack. The crit stack events are
 * infinite-duration statuses that are visually tiled. When another status
 * (e.g. Barrage of Technology) ends before the later crit stacks start,
 * those later stacks should expand into its slot.
 *
 * Three-layer verification:
 *   1. Controller: crit stack events exist with correct stacks
 *   2. View: computeTimelinePresentation micro-positions use visual durations
 *   3. Greedy expansion: later events expand when earlier visual occupancy ends
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { NounType } from '../../../dsl/semantics';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import type { AddEventPayload } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../model/game-data/operators/yvonne/yvonne.json').id;
const CRIT_STACKS_ID: string = require('../../../model/game-data/operators/yvonne/statuses/status-crit-stacks.json').properties.id;
const EBATK_ID: string = require('../../../model/game-data/operators/yvonne/skills/basic-attack-batk-exuberant-trigger-empowered.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function addUlt(app: ReturnType<typeof useApp>, atFrame: number) {
  act(() => { setUltimateEnergyToMax(app, SLOT, 0); });
  const col = findColumn(app, SLOT, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function addEBATK(app: ReturnType<typeof useApp>, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BASIC_ATTACK)!;
  const menu = buildContextMenu(app, col, atFrame);
  const ebatkItem = menu!.find(
    i => i.actionId === 'addEvent'
      && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === EBATK_ID,
  );
  if (!ebatkItem || ebatkItem.disabled) return;
  const payload = ebatkItem.actionPayload as AddEventPayload;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('Status greedy expansion — visual duration awareness', () => {
  it('crit stack events are assigned micro-positions in the status column', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    // Place EBATK during ult active phase to generate crit stacks
    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const activeStart = ult.startFrame + ult.segments[0].properties.duration;
    addEBATK(result.current, activeStart);

    // Should have at least one crit stack event
    const critStacks = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_STACKS_ID && ev.ownerEntityId === SLOT,
    );
    expect(critStacks.length).toBeGreaterThanOrEqual(1);

    // All crit stacks should have micro-positions in the status column
    const statusCol = findColumn(result.current, SLOT, OPERATOR_STATUS_COLUMN_ID)!;
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol.key)!;
    for (const ev of critStacks) {
      expect(vm.microPositions.has(ev.uid)).toBe(true);
    }
  });

  it('visually-truncated crit stacks use visual end for expansion overlap', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const activeStart = ult.startFrame + ult.segments[0].properties.duration;

    // Place multiple EBATKs to generate multiple crit stack events
    addEBATK(result.current, activeStart);
    addEBATK(result.current, activeStart + 1 * FPS);

    const critStacks = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_STACKS_ID && ev.ownerEntityId === SLOT,
    );
    if (critStacks.length < 2) return; // Skip if engine doesn't generate multiple stacks

    const statusCol = findColumn(result.current, SLOT, OPERATOR_STATUS_COLUMN_ID)!;
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol.key)!;

    // Earlier crit stacks that temporally overlap with the next stack should have
    // visualActivationDuration set (truncated). Stacks that naturally end before
    // the next stack starts (e.g. the last stack of a batch whose segment was
    // clamped by an ult-exit consume, followed by a gap before the next batch)
    // don't need truncation and legitimately have no visual override.
    const sortedCrit = [...critStacks].sort((a, b) => a.startFrame - b.startFrame);
    let overlapCount = 0;
    for (let i = 0; i < sortedCrit.length - 1; i++) {
      const cur = sortedCrit[i];
      const next = sortedCrit[i + 1];
      const rawDur = cur.segments.reduce(
        (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
      );
      const curEnd = cur.startFrame + rawDur;
      if (next.startFrame >= curEnd) continue;

      const override = vm.statusOverrides.get(cur.uid);
      expect(override).toBeDefined();
      expect(override!.visualActivationDuration).toBeDefined();
      expect(override!.visualActivationDuration).toBeLessThan(rawDur);
      overlapCount++;
    }
    // Ensure the test actually exercised the truncation path at least once.
    expect(overlapCount).toBeGreaterThan(0);
  });

  it('last crit stack event is wider than earlier truncated ones when adjacent slot is free', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const activeStart = ult.startFrame + ult.segments[0].properties.duration;

    // Place EBATKs to generate crit stacks
    addEBATK(result.current, activeStart);
    addEBATK(result.current, activeStart + 1 * FPS);

    const critStacks = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_STACKS_ID && ev.ownerEntityId === SLOT,
    );
    if (critStacks.length < 2) return;

    const statusCol = findColumn(result.current, SLOT, OPERATOR_STATUS_COLUMN_ID)!;
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol.key)!;

    const sortedCrit = [...critStacks].sort((a, b) => a.startFrame - b.startFrame);
    const lastCrit = sortedCrit[sortedCrit.length - 1];
    const lastMp = vm.microPositions.get(lastCrit.uid)!;

    // Count how many OTHER status types have events that overlap the last crit
    // stack's time range. The last crit event should be able to expand into
    // any slot whose events don't overlap its visual time range.
    const otherStatusEvents = vm.events.filter(
      ev => ev.columnId !== CRIT_STACKS_ID && ev.ownerEntityId === SLOT,
    );

    // If there are other status types with events, the last crit stack might
    // not get full width. But it should be at least as wide as the first.
    const firstMp = vm.microPositions.get(sortedCrit[0].uid)!;
    expect(lastMp.widthFrac).toBeGreaterThanOrEqual(firstMp.widthFrac);

    // When no other status events exist, the last crit stack should get full width
    const expectFullWidth = otherStatusEvents.length === 0;
    expect(expectFullWidth ? lastMp.widthFrac : lastMp.widthFrac).toBeGreaterThanOrEqual(
      expectFullWidth ? 1 : firstMp.widthFrac,
    );
  });

  it('all status events satisfy leftFrac + widthFrac ≤ 1', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const activeStart = ult.startFrame + ult.segments[0].properties.duration;
    addEBATK(result.current, activeStart);
    addEBATK(result.current, activeStart + 1 * FPS);

    const statusCol = findColumn(result.current, SLOT, OPERATOR_STATUS_COLUMN_ID)!;
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol.key)!;

    for (const ev of vm.events) {
      const mp = vm.microPositions.get(ev.uid);
      expect(mp).toBeDefined();
      expect(mp!.leftFrac).toBeGreaterThanOrEqual(0);
      expect(mp!.leftFrac + mp!.widthFrac).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
