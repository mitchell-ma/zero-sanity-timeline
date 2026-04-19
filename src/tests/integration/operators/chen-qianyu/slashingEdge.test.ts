/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Slashing Edge Integration Tests
 *
 * Slashing Edge is a talent-derived status: RESET stacking, limit 5, 10s duration.
 * Triggered when Chen performs a skill (PERFORM BATTLE_SKILL / COMBO_SKILL / ULTIMATE).
 * Each skill produces one Slashing Edge stack.
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
const SLASHING_EDGE_ID: string = require('../../../../model/game-data/operators/chen-qianyu/talents/talent-slashing-edge-talent.json').properties.id;
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

describe('Chen Qianyu — Slashing Edge', () => {
  it('single battle skill produces 1 Slashing Edge stack with label "Slashing Edge"', () => {
    const { result } = setupChen();
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol?.defaultEvent).toBeDefined();

    // ── Context menu: verify battle skill is available and enabled ───────
    const battlePayload = getMenuPayload(result.current, battleCol!, 2 * FPS);
    const menuItems = buildContextMenu(result.current, battleCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent')).toBe(true);

    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
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
    expect(seInVM).toHaveLength(1);
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

  it('10 battle skills produce 5 Slashing Edge stacks with labels 1–5', () => {
    const { result } = setupChen();
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol?.defaultEvent).toBeDefined();

    // Freeform so all 10 are accepted (no SP gate)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    for (let i = 0; i < 10; i++) {
      // ── Context menu: verify each battle skill placement is available ──
      const payload = getMenuPayload(result.current, battleCol!, (2 + i * 2) * FPS);

      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // 1. Column exists
    const statusCol = findMatchingColumn(result.current, SLOT_CHEN, SLASHING_EDGE_ID);
    expect(statusCol).toBeDefined();

    // 2. View model has events
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    const seInVM = vm!.events.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerEntityId === SLOT_CHEN,
    );
    expect(seInVM.length).toBeGreaterThanOrEqual(5);

    // 3. At the last BS frame, at most 5 active (RESET limit)
    const lastFrame = (2 + 9 * 2) * FPS;
    const activeAtLast = seInVM.filter((ev) => {
      if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) return false;
      const end = ev.startFrame + eventDuration(ev);
      return ev.startFrame <= lastFrame && lastFrame < end;
    });
    expect(activeAtLast.length).toBeLessThanOrEqual(5);

    // 4. Stack labels via view overrides — should see numerals up to 5
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const labels = seInVM
      .map(ev => overrides.get(ev.uid)?.label)
      .filter(Boolean) as string[];
    expect(labels.length).toBeGreaterThanOrEqual(5);
    expect(labels.some(l => /\s[2-5]$/.test(l))).toBe(true);

    // ── Second wave: 10 more BS after all prior stacks expire ──────────
    // Last stack from first wave: t=20s + 10s = expires at t=30s.
    // Place 10 more BS starting at t=32s (2s gap ensures all prior expired).
    for (let i = 0; i < 10; i++) {
      const payload = getMenuPayload(result.current, battleCol!, (32 + i * 2) * FPS);

      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // Re-query view models after second wave
    const viewModels2 = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm2 = viewModels2.get(statusCol!.key);
    expect(vm2).toBeDefined();

    // Active stacks at the last second-wave BS frame
    const lastFrame2 = (32 + 9 * 2) * FPS;
    const allSE2 = vm2!.events.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerEntityId === SLOT_CHEN,
    );
    const activeAtLast2 = allSE2.filter((ev) => {
      if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) return false;
      const end = ev.startFrame + eventDuration(ev);
      return ev.startFrame <= lastFrame2 && lastFrame2 < end;
    });
    expect(activeAtLast2.length).toBeLessThanOrEqual(5);
    expect(activeAtLast2.length).toBeGreaterThanOrEqual(5);

    // Verify stack progression by checking labels at intermediate points.
    // Label shows total active stack count — e.g. "Slashing Edge 3" means 3 active.
    const overrides2 = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // After 1st BS of second wave (t=32s): 1 stack → "Slashing Edge 1"
    const at1 = allSE2.filter((ev) => {
      if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) return false;
      const end = ev.startFrame + eventDuration(ev);
      return ev.startFrame <= 33 * FPS && 33 * FPS < end;
    });
    expect(at1).toHaveLength(1);
    expect(overrides2.get(at1[0].uid)?.label).toMatch(/\s1$/);

    // After 3rd BS (t=36s): 3 stacks → "3"
    const at3 = allSE2.filter((ev) => {
      if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) return false;
      const end = ev.startFrame + eventDuration(ev);
      return ev.startFrame <= 37 * FPS && 37 * FPS < end;
    });
    expect(at3).toHaveLength(3);
    expect(at3.some(ev => /\s3$/.test(overrides2.get(ev.uid)?.label ?? ''))).toBe(true);

    // At final frame (t=50s): 5 stacks, all labeled "5" (max stacks reached)
    const activeLabels = activeAtLast2
      .map(ev => overrides2.get(ev.uid)?.label)
      .filter(Boolean) as string[];
    expect(activeLabels).toHaveLength(5);
    for (const label of activeLabels) {
      expect(label).toMatch(/\s5$/);
    }
  });
});
