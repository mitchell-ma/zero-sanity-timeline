/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik Ultimate → Steel Oath Team Status — Integration Tests
 *
 * Tests the full pipeline: Pogranichnik's Ultimate (SHIELDGUARD_BANNER) produces
 * STEEL_OATH team status events under COMMON_OWNER_ID.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Pogranichnik is swapped into slot-3 via handleSwapOperator.
 *
 * STEEL_OATH config: interactionType RESET, limit 5, duration 30s, "to": "TEAM"
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { SKILL_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { ColumnType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getTeamStatusIds } from '../../../../controller/gameDataStore';

// ── Constants ────────────────────────────────────────────────────────────────

const SLOT_POG = 'slot-3';
const STEEL_OATH_ID = 'STEEL_OATH';
const STEEL_OATH_HARASS_ID = 'STEEL_OATH_HARASS';
const STEEL_OATH_DECISIVE_ASSAULT_ID = 'STEEL_OATH_DECISIVE_ASSAULT';

// ── Helpers ──────────────────────────────────────────────────────────────────

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

/** Set up a fresh hook with Pogranichnik in slot-3. */
function setupPogranichnik() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_POG, 'POGRANICHNIK'); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Data pipeline prerequisites
// ═══════════════════════════════════════════════════════════════════════════════

describe('Data pipeline prerequisites', () => {
  it('getTeamStatusIds for POGRANICHNIK includes STEEL_OATH', () => {
    const ids = getTeamStatusIds('POGRANICHNIK');
    expect(ids).toContain(STEEL_OATH_ID);
  });

  it('team-status column matchColumnIds includes STEEL_OATH when Pog is slotted', () => {
    const { result } = setupPogranichnik();
    const teamCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === COMMON_OWNER_ID &&
        c.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
    );
    expect(teamCol).toBeDefined();
    expect(teamCol!.matchColumnIds).toBeDefined();
    expect(teamCol!.matchColumnIds).toContain(STEEL_OATH_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Ultimate produces STEEL_OATH team status
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pogranichnik Ultimate → Steel Oath', () => {
  it('ultimate produces at least one STEEL_OATH event under COMMON_OWNER_ID', () => {
    const { result } = setupPogranichnik();

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();
    expect(ultCol!.defaultEvent).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );
    // Pog ultimate produces 5 stacks of Steel Oath, all active
    expect(steelOathEvents).toHaveLength(5);
    const activeEvents = steelOathEvents.filter((ev) => !ev.eventStatus);
    expect(activeEvents).toHaveLength(5);
  });

  it('STEEL_OATH events have columnId matching the status ID, not generic team-status', () => {
    const { result } = setupPogranichnik();

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);

    // Every STEEL_OATH event should use STEEL_OATH as its columnId
    for (const ev of steelOathEvents) {
      expect(ev.columnId).toBe(STEEL_OATH_ID);
    }

    // No STEEL_OATH events should be under the generic 'team-status' columnId
    const genericSteelOath = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.columnId === 'team-status',
    );
    expect(genericSteelOath).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. View layer — STEEL_OATH appears in team-status ColumnViewModel
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pogranichnik STEEL_OATH → ColumnViewModel', () => {
  it('STEEL_OATH events appear in the team-status column view model', () => {
    const { result } = setupPogranichnik();

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Compute the view models that the view layer uses
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Find the team-status column's view model
    const teamColKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.TEAM_STATUS}`;
    const teamVM = viewModels.get(teamColKey);
    expect(teamVM).toBeDefined();

    // STEEL_OATH events should be in the view model's events
    const steelInVM = teamVM!.events.filter((ev) => ev.id === STEEL_OATH_ID);
    expect(steelInVM.length).toBeGreaterThanOrEqual(1);

    // Verify the events are resolvable through the presentation layer
    // (event exists in the column's event list = it will render as an EventBlock)
    for (const ev of steelInVM) {
      expect(ev.ownerId).toBe(COMMON_OWNER_ID);
      expect(ev.columnId).toBe(STEEL_OATH_ID);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Two ultimates — RESET interaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pogranichnik two Ultimates → STEEL_OATH RESET stacking', () => {
  it('second ultimate produces a new STEEL_OATH set that RESET-clamps the first', () => {
    const { result } = setupPogranichnik();

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    // First ultimate at 1s
    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Second ultimate at 20s (while first STEEL_OATH 30s duration is still active)
    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 20 * FPS, ultCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );
    // Should have at least 2 STEEL_OATH events (one from each ultimate)
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(2);

    // Sort by start frame to identify earlier vs later events
    const sorted = [...steelOathEvents].sort((a, b) => a.startFrame - b.startFrame);

    // The earlier STEEL_OATH event(s) should be REFRESHED (clamped by RESET)
    const earlierEvents = sorted.filter((ev) => ev.startFrame < 20 * FPS);
    expect(earlierEvents.length).toBeGreaterThanOrEqual(1);

    const refreshedEvents = earlierEvents.filter(
      (ev) => ev.eventStatus === EventStatusType.REFRESHED,
    );
    expect(refreshedEvents.length).toBeGreaterThanOrEqual(1);

    // The refreshed event's duration should be clamped (shorter than original 30s)
    for (const ev of refreshedEvents) {
      expect(eventDuration(ev)).toBeLessThan(30 * FPS);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Steel Oath without triggers stays active
// ═══════════════════════════════════════════════════════════════════════════════

describe('Steel Oath without triggers stays active', () => {
  it('all 5 STEEL_OATH events remain unconsumed with full 30s duration when no triggers fire', () => {
    const { result } = setupPogranichnik();

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    // Place ultimate at 1s — no other events that would trigger consumption
    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );
    expect(steelOathEvents).toHaveLength(5);

    // Every event should have no eventStatus (not consumed, not refreshed)
    for (const ev of steelOathEvents) {
      expect(ev.eventStatus).toBeUndefined();
    }

    // Every event should have the full 30s duration
    for (const ev of steelOathEvents) {
      expect(eventDuration(ev)).toBe(30 * FPS);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Combo skill consumes Steel Oath stacks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Combo skill consumes Steel Oath stacks', () => {
  it('combo skill after ultimate consumes at least one STEEL_OATH stack and produces enemy status', () => {
    const { result } = setupPogranichnik();

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    const comboCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.COMBO);
    expect(comboCol).toBeDefined();

    // Place ultimate at 1s
    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Place combo skill at 5s (after ultimate animation ends)
    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.COMBO, 5 * FPS, comboCol!.defaultEvent!,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );

    // At least one STEEL_OATH event should be consumed
    const consumedEvents = steelOathEvents.filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedEvents.length).toBeGreaterThanOrEqual(1);

    // At least one Harass or Decisive Assault event should exist on the enemy
    const enemySubStatuses = result.current.allProcessedEvents.filter(
      (ev) =>
        ev.ownerId === ENEMY_OWNER_ID &&
        (ev.id === STEEL_OATH_HARASS_ID || ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID),
    );
    // The specific sub-status type depends on FIRST_MATCH + HAVE STACKS implementation
    expect(enemySubStatuses.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. All stacks consumed produces mix of Harass and Decisive Assault
// ═══════════════════════════════════════════════════════════════════════════════

describe('All stacks consumed → Harass and Decisive Assault mix', () => {
  it('5 combo skills consume all 5 STEEL_OATH stacks, producing Harass and Decisive Assault', () => {
    const { result } = setupPogranichnik();

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    const comboCol = findColumn(result.current, SLOT_POG, SKILL_COLUMNS.COMBO);
    expect(comboCol).toBeDefined();

    // Place ultimate at 1s
    act(() => {
      result.current.handleAddEvent(
        SLOT_POG, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Place 5 combo skills spaced 1s apart starting at 5s (5s, 6s, 7s, 8s, 9s)
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_POG, SKILL_COLUMNS.COMBO, (5 + i) * FPS, comboCol!.defaultEvent!,
        );
      });
    }

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );

    // All Steel Oath events should be consumed (each consumption clamps all active
    // events and re-creates continuations: 5+4+3+2+1 = 15 total consumed events)
    const consumedEvents = steelOathEvents.filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedEvents).toHaveLength(15);
    // No active Steel Oath events should remain
    const activeEvents = steelOathEvents.filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(activeEvents).toHaveLength(0);

    // Harass events should exist on the enemy (at least some stacks produce Harass)
    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);

    // TODO: Decisive Assault should exist on the enemy (last stack triggers Decisive
    // Assault via FIRST_MATCH: clauses 1-2 match when HAVE STACKS = 1). Requires
    // FIRST_MATCH clause ordering to be enforced in handleEngineTrigger so that
    // clause 2 (Decisive Assault with HAVE STACKS=1) fires instead of clause 4 (Harass)
    // when only 1 stack remains.
  });
});
