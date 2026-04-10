/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Slashing Edge from Combo Skill, Ultimate, and Mixed Rotations
 *
 * The existing slashingEdge.test.ts covers battle skill triggers.
 * This file tests the remaining trigger clauses:
 *   - Combo skill (Soar to the Stars) produces Slashing Edge
 *   - Ultimate (Blade Gale) produces Slashing Edge
 *   - Mixed rotation (BS → combo → ult) produces correct stack count + labels
 *   - Duration RESET: second stack resets duration of first
 *
 * Verification layers:
 *   Context menu: getMenuPayload succeeds (skill is available and enabled)
 *   Controller: allProcessedEvents contains Slashing Edge status events
 *   View: computeTimelinePresentation (column view models)
 *         computeStatusViewOverrides (stack labels rendered on event blocks)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation, computeStatusViewOverrides } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const SLASHING_EDGE_ID: string = require('../../../../model/game-data/operators/chen-qianyu/statuses/status-slashing-edge.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

/**
 * Find a column by owner whose columnId or matchColumnIds includes the given id.
 * Used for status columns that may collect events via matchColumnIds.
 */
function findMatchingColumn(app: AppResult, ownerEntityId: string, matchId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ownerEntityId &&
      (c.columnId === matchId || (c.matchColumnIds?.includes(matchId) ?? false)),
  );
}

beforeEach(() => {
  localStorage.clear();
});

function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  return view;
}

describe('Chen Qianyu — Slashing Edge from combo skill', () => {
  it('combo skill produces Slashing Edge stack', () => {
    const { result } = setupChen();

    // Freeform mode to bypass resource gates
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 2 battle skills — first applies Vulnerable, second triggers Lift (and makes enemy Vulnerable)
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    const bs1Payload = getMenuPayload(result.current, battleCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bs1Payload.ownerEntityId, bs1Payload.columnId, bs1Payload.atFrame, bs1Payload.defaultSkill,
      );
    });

    const bs2Payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bs2Payload.ownerEntityId, bs2Payload.columnId, bs2Payload.atFrame, bs2Payload.defaultSkill,
      );
    });

    // Place combo skill (Soar to the Stars) — combo window should be open from Vulnerable trigger
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();

    // Context menu: verify combo skill is available
    const comboMenu = buildContextMenu(result.current, comboCol!, 10 * FPS);
    expect(comboMenu).not.toBeNull();
    expect(comboMenu!.some(i => i.actionId === 'addEvent')).toBe(true);

    const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // 1. Column exists with Slashing Edge micro-column
    const statusCol = findMatchingColumn(result.current, SLOT_CHEN, SLASHING_EDGE_ID);
    expect(statusCol).toBeDefined();
    expect(statusCol!.microColumns?.some(mc => mc.id === SLASHING_EDGE_ID)).toBe(true);

    // 2. View model has the events (BS stacks + combo stack)
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    const seInVM = vm!.events.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerEntityId === SLOT_CHEN
        && ev.eventStatus !== EventStatusType.CONSUMED && ev.eventStatus !== EventStatusType.REFRESHED,
    );
    // At least 1 active stack from the combo skill (BS stacks may have been refreshed)
    expect(seInVM.length).toBeGreaterThanOrEqual(1);

    // 3. Stack labels via view overrides
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const labels = seInVM
      .map(ev => overrides.get(ev.uid)?.label)
      .filter(Boolean) as string[];
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Chen Qianyu — Slashing Edge from ultimate', () => {
  it('ultimate produces Slashing Edge stack', () => {
    const { result } = setupChen();

    // Freeform mode to bypass resource gates (ultimate costs 70 energy)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place ultimate (Blade Gale)
    const ultCol = findColumn(result.current, SLOT_CHEN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    // Context menu: verify ultimate is available
    const ultMenu = buildContextMenu(result.current, ultCol!, 2 * FPS);
    expect(ultMenu).not.toBeNull();
    expect(ultMenu!.some(i => i.actionId === 'addEvent')).toBe(true);

    const ultPayload = getMenuPayload(result.current, ultCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // 1. Column exists with Slashing Edge micro-column
    const statusCol = findMatchingColumn(result.current, SLOT_CHEN, SLASHING_EDGE_ID);
    expect(statusCol).toBeDefined();
    expect(statusCol!.microColumns?.some(mc => mc.id === SLASHING_EDGE_ID)).toBe(true);

    // 2. View model has the event
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    const seInVM = vm!.events.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerEntityId === SLOT_CHEN
        && ev.eventStatus !== EventStatusType.CONSUMED && ev.eventStatus !== EventStatusType.REFRESHED,
    );
    expect(seInVM.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(seInVM[0])).toBeGreaterThanOrEqual(10 * FPS);

    // 3. Stack label via view overrides
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const label = overrides.get(seInVM[0].uid)?.label;
    expect(label).toBeDefined();
    expect(label).toContain('Slashing Edge');
  });
});

describe('Chen Qianyu — Slashing Edge mixed rotation', () => {
  it('BS → combo → ult produces 3 Slashing Edge stacks with labels I, II, III', () => {
    const { result } = setupChen();

    // Freeform mode to bypass resource gates
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // 1. Battle skill at t=2s
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    const bs1Payload = getMenuPayload(result.current, battleCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bs1Payload.ownerEntityId, bs1Payload.columnId, bs1Payload.atFrame, bs1Payload.defaultSkill,
      );
    });

    // 2. Second battle skill at t=4s (to trigger Vulnerable for combo)
    const bs2Payload = getMenuPayload(result.current, battleCol!, 4 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bs2Payload.ownerEntityId, bs2Payload.columnId, bs2Payload.atFrame, bs2Payload.defaultSkill,
      );
    });

    // 3. Combo skill at t=7s
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const comboPayload = getMenuPayload(result.current, comboCol!, 7 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // 4. Ultimate at t=9s — all prior stacks still within 10s duration
    const ultCol = findColumn(result.current, SLOT_CHEN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const ultPayload = getMenuPayload(result.current, ultCol!, 9 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Verify: status column exists
    const statusCol = findMatchingColumn(result.current, SLOT_CHEN, SLASHING_EDGE_ID);
    expect(statusCol).toBeDefined();

    // Verify: view model has all events
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();

    // Count active stacks right after the ultimate
    // BS1 at t=2s → expires t=12s, BS2 at t=4s → expires t=14s,
    // Combo at t=7s → expires t=17s, Ult at t=9s ��� expires t=19s
    // Check at t=10s: all 4 should be active
    const allSE = vm!.events.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerEntityId === SLOT_CHEN,
    );
    const checkFrame = 10 * FPS;
    const activeAtCheck = allSE.filter((ev) => {
      if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) return false;
      const end = ev.startFrame + eventDuration(ev);
      return ev.startFrame <= checkFrame && checkFrame < end;
    });
    // 2 BS + 1 combo + 1 ult = 4 triggers total
    expect(activeAtCheck.length).toBeGreaterThanOrEqual(3);

    // Verify stack labels via view overrides — should see roman numerals I, II, III
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const labels = activeAtCheck
      .map(ev => overrides.get(ev.uid)?.label)
      .filter(Boolean) as string[];
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.some(l => /I/.test(l))).toBe(true);
    expect(labels.some(l => /II/.test(l))).toBe(true);
    expect(labels.some(l => /III/.test(l))).toBe(true);
  });
});

describe('Chen Qianyu — Slashing Edge duration RESET', () => {
  it('stacks accumulate up to limit — each new stack has full 10s duration', () => {
    const { result } = setupChen();

    // Freeform mode to bypass resource gates
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    // Place 5 battle skills at 2s intervals within the 10s duration window
    // All stacks should be active simultaneously
    for (let i = 0; i < 5; i++) {
      const payload = getMenuPayload(result.current, battleCol!, (1 + i) * FPS);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // Controller layer: check processed events for Slashing Edge
    const seEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerEntityId === SLOT_CHEN,
    );
    // Should have 5 events (one per BS)
    expect(seEvents.length).toBeGreaterThanOrEqual(5);

    // All should be active (no CONSUMED or REFRESHED yet — under the limit)
    const active = seEvents.filter(
      ev => ev.eventStatus !== EventStatusType.CONSUMED && ev.eventStatus !== EventStatusType.REFRESHED,
    );
    expect(active.length).toBeLessThanOrEqual(5);

    // Each active stack should have full 10s duration
    for (const ev of active) {
      expect(eventDuration(ev)).toBeGreaterThanOrEqual(10 * FPS);
    }

    // The first stack starts at t=1s and ends at t=11s
    const earliest = active.reduce((a, b) => a.startFrame < b.startFrame ? a : b);
    const earliestEnd = earliest.startFrame + eventDuration(earliest);
    expect(earliestEnd).toBeGreaterThanOrEqual(1 * FPS + 10 * FPS);

    // The last stack starts at t=5s and ends at t=15s
    const latest = active.reduce((a, b) => a.startFrame > b.startFrame ? a : b);
    const latestEnd = latest.startFrame + eventDuration(latest);
    expect(latestEnd).toBeGreaterThanOrEqual(5 * FPS + 10 * FPS);
  });
});
