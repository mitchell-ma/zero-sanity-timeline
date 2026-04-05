/**
 * @jest-environment jsdom
 */

/**
 * Status Target Routing — Integration Tests
 *
 * Tests that the interpreter routes statuses based on the skill effect's `to` field,
 * falling back to the status config's default `to` when not specified.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct columns
 *
 * Scenarios:
 *   A. Effect specifies `to: TEAM` and config defaults TEAM → routes to team column
 *   B. Effect specifies `to: OPERATOR` and config defaults OPERATOR → routes to operator column
 *   C. Freeform status without explicit `to` → falls back to status config default
 *   D. Multiple operators producing derived statuses route correctly (cross-operator)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType, StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../../../controller/slot/commonSlotController';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

// ── Status IDs from JSON (single source of truth) ──────────────────────────

const MELTING_FLAME_ID: string = require('../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const LINK_ID: string = require('../../../model/game-data/generic/statuses/status-link.json').properties.id;

// ── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

/** Find the team-status column under COMMON_OWNER_ID. */
function findCommonColumn(app: AppResult, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === COMMON_OWNER_ID &&
      c.columnId === columnId,
  );
}

/**
 * Find a MiniTimeline column by owner and column ID, also matching via
 * matchColumnIds for derived status columns (e.g. MELTING_FLAME).
 */
function findMatchingColumn(app: AppResult, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

/**
 * Build the team-status context menu and find the LINK micro-column add-event item.
 * Returns the payload for adding a freeform LINK event.
 */
function getLinkMenuPayload(app: AppResult, atFrame: number) {
  const teamCol = findCommonColumn(app, COMMON_COLUMN_IDS.TEAM_STATUS);
  expect(teamCol).toBeDefined();

  const menuItems = buildContextMenu(app, teamCol!, atFrame);
  expect(menuItems).not.toBeNull();
  expect(menuItems!.length).toBeGreaterThan(0);

  // Find the LINK micro-column item by its actionPayload columnId
  const linkItem = menuItems!.find(
    (i) => i.actionId === 'addEvent' && (i.actionPayload as { columnId: string })?.columnId === StatusType.LINK,
  );
  expect(linkItem).toBeDefined();
  expect(linkItem!.disabled).toBeFalsy();

  return linkItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Effect targets TEAM, config defaults TEAM — routes to team column
// ═════════════════════════════════════════════════════════════════════════════

describe('Status target routing — effect to TEAM, config default TEAM', () => {
  it('Akekuri Ultimate applies LINK to team-status column', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: Ultimate column available
    const ultCol = findColumn(result.current, SLOT_AKEKURI, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const ultMenu = buildContextMenu(result.current, ultCol!, 1 * FPS);
    expect(ultMenu).not.toBeNull();
    expect(ultMenu!.length).toBeGreaterThan(0);

    const ultPayload = getMenuPayload(result.current, ultCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // 2. Controller: LINK should appear under COMMON_OWNER_ID with its own column ID
    const teamLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(teamLinkEvents.length).toBeGreaterThanOrEqual(1);

    // LINK should NOT appear on Akekuri's personal status columns
    const personalLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.name === LINK_ID,
    );
    expect(personalLinkEvents).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. Effect targets THIS OPERATOR, config defaults OPERATOR — routes to operator column
// ═════════════════════════════════════════════════════════════════════════════

describe('Status target routing — effect to OPERATOR, config default OPERATOR', () => {
  it('Laevatain Battle Skill applies MELTING_FLAME to her personal status column', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: Battle Skill column available
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    const battleMenu = buildContextMenu(result.current, battleCol!, 1 * FPS);
    expect(battleMenu).not.toBeNull();
    expect(battleMenu!.length).toBeGreaterThan(0);

    const battlePayload = getMenuPayload(result.current, battleCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // 2. Controller: MELTING_FLAME should appear on Laevatain's personal column
    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === MELTING_FLAME_ID,
    );
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);

    // MELTING_FLAME should NOT appear on the team-status column
    const teamMfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.name === MELTING_FLAME_ID,
    );
    expect(teamMfEvents).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. No effect target — falls back to status config default
// ═════════════════════════════════════════════════════════════════════════════

describe('Status target routing — no effect target, uses config default', () => {
  it('freeform LINK event without explicit target routes to team-status (config default TEAM)', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: team-status column has LINK micro-column item
    const linkPayload = getLinkMenuPayload(result.current, 2 * FPS);

    act(() => {
      result.current.handleAddEvent(
        linkPayload.ownerId, linkPayload.columnId, linkPayload.atFrame, linkPayload.defaultSkill,
      );
    });

    // 2. Controller: Should appear under COMMON_OWNER_ID with LINK column ID
    const teamLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK && ev.name === StatusType.LINK,
    );
    expect(teamLinkEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('Laevatain BS derives MELTING_FLAME to personal column (config default OPERATOR)', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: Battle Skill column available
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    const battlePayload = getMenuPayload(result.current, battleCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // 2. Controller: MELTING_FLAME should appear on Laevatain's personal column
    const personalMfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === MELTING_FLAME_ID,
    );
    expect(personalMfEvents.length).toBeGreaterThanOrEqual(1);

    // Should NOT appear on the team column
    const teamMfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.name === MELTING_FLAME_ID,
    );
    expect(teamMfEvents).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Multiple operators producing derived statuses route correctly
// ═════════════════════════════════════════════════════════════════════════════

describe('Status target routing — cross-operator consistency', () => {
  it('Akekuri ult LINK goes to team, Laevatain BS MELTING_FLAME goes to personal, in same timeline', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: both columns available
    const ultCol = findColumn(result.current, SLOT_AKEKURI, NounType.ULTIMATE);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(ultCol).toBeDefined();
    expect(battleCol).toBeDefined();

    const ultMenu = buildContextMenu(result.current, ultCol!, 1 * FPS);
    expect(ultMenu).not.toBeNull();
    const battleMenu = buildContextMenu(result.current, battleCol!, 1 * FPS);
    expect(battleMenu).not.toBeNull();

    // Akekuri ult at 1s
    const ultPayload = getMenuPayload(result.current, ultCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Laevatain BS at 1s
    const battlePayload = getMenuPayload(result.current, battleCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // 2. Controller: LINK → team column
    const teamLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(teamLinkEvents.length).toBeGreaterThanOrEqual(1);

    // Controller: MELTING_FLAME → Laevatain personal column
    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === MELTING_FLAME_ID,
    );
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);

    // Neither status on the wrong owner
    const teamMf = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.name === MELTING_FLAME_ID,
    );
    const personalLink = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.name === LINK_ID,
    );
    expect(teamMf).toHaveLength(0);
    expect(personalLink).toHaveLength(0);

    // 3. View: computeTimelinePresentation includes both in correct columns
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // LINK appears in the team-status column view model
    const teamCol = findCommonColumn(result.current, COMMON_COLUMN_IDS.TEAM_STATUS);
    expect(teamCol).toBeDefined();
    const teamVM = viewModels.get(teamCol!.key);
    expect(teamVM).toBeDefined();
    const vmLinkEvents = teamVM!.events.filter(
      (ev) => ev.columnId === StatusType.LINK,
    );
    expect(vmLinkEvents.length).toBeGreaterThanOrEqual(1);

    // MELTING_FLAME appears in Laevatain's personal MF column view model
    const mfCol = findMatchingColumn(result.current, SLOT_LAEVATAIN, MELTING_FLAME_ID);
    expect(mfCol).toBeDefined();
    const mfVM = viewModels.get(mfCol!.key);
    expect(mfVM).toBeDefined();
    const vmMfEvents = mfVM!.events.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID,
    );
    expect(vmMfEvents.length).toBeGreaterThanOrEqual(1);
  });
});
