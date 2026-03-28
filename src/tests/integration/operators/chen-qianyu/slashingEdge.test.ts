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
 * Verified through the view: computeTimelinePresentation (column view models)
 * and computeStatusViewOverrides (stack labels rendered on event blocks).
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation, computeStatusViewOverrides } from '../../../../controller/timeline/eventPresentationController';

const SLOT_CHEN = 'slot-0';
const SLASHING_EDGE_ID = 'SLASHING_EDGE';

beforeEach(() => {
  localStorage.clear();
});

function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU'); });
  return view;
}

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

describe('Chen Qianyu — Slashing Edge', () => {
  it('single battle skill produces 1 Slashing Edge stack with label "Slashing Edge"', () => {
    const { result } = setupChen();
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE_SKILL);
    expect(battleCol?.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, NounType.BATTLE_SKILL, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // 1. Column exists with Slashing Edge micro-column
    const statusCol = findColumn(result.current, SLOT_CHEN, SLASHING_EDGE_ID);
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
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerId === SLOT_CHEN
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

  it('10 battle skills produce 5 Slashing Edge stacks with labels I–V', () => {
    const { result } = setupChen();
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE_SKILL);
    expect(battleCol?.defaultEvent).toBeDefined();

    // Freeform so all 10 are accepted (no SP gate)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_CHEN, NounType.BATTLE_SKILL, (2 + i * 2) * FPS, battleCol!.defaultEvent!,
        );
      });
    }

    // 1. Column exists
    const statusCol = findColumn(result.current, SLOT_CHEN, SLASHING_EDGE_ID);
    expect(statusCol).toBeDefined();

    // 2. View model has events
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    const seInVM = vm!.events.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID && ev.ownerId === SLOT_CHEN,
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

    // 4. Stack labels via view overrides — should see numerals up to V
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const labels = seInVM
      .map(ev => overrides.get(ev.uid)?.label)
      .filter(Boolean) as string[];
    expect(labels.length).toBeGreaterThanOrEqual(5);
    expect(labels.some(l => /II|III|IV|V/.test(l))).toBe(true);
  });
});
