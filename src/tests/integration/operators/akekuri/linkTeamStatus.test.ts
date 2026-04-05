/**
 * @jest-environment jsdom
 */

/**
 * Akekuri Ultimate → Link Team Status — Integration Tests
 *
 * Tests the full pipeline: Akekuri's Ultimate produces LINK on its own column
 * (StatusType.LINK) under COMMON_OWNER_ID, and skills consume it.
 *
 * Also tests freeform-added LINK events stacking and consumption behavior.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, StatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { getLastController } from '../../../../controller/timeline/eventQueueController';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

/** Find the team-status column under COMMON_OWNER_ID. */
function findTeamStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === COMMON_OWNER_ID &&
      c.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
  );
}

/**
 * Build the team-status context menu and find the LINK micro-column add-event item.
 * Returns the payload for adding a freeform LINK event.
 */
function getLinkMenuPayload(app: AppResult, atFrame: number) {
  const teamCol = findTeamStatusColumn(app);
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
// Akekuri Ultimate produces Link
// ═════════════════════════════════════════════════════════════════════════════

describe('Akekuri Ultimate → Link Team Status', () => {
  it('Akekuri Ultimate produces LINK on the LINK column', () => {
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

    // 2. Controller: LINK events appear under COMMON_OWNER_ID
    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(linkEvents.length).toBeGreaterThanOrEqual(1);

    // 3. View: LINK events appear in the team-status column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const teamCol = findTeamStatusColumn(result.current);
    expect(teamCol).toBeDefined();
    const teamVM = viewModels.get(teamCol!.key);
    expect(teamVM).toBeDefined();
    const vmLinkEvents = teamVM!.events.filter(
      (ev) => ev.columnId === StatusType.LINK,
    );
    expect(vmLinkEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('Laevatain Battle Skill consumes Link produced by Akekuri Ultimate', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: columns available
    const ultCol = findColumn(result.current, SLOT_AKEKURI, NounType.ULTIMATE);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(ultCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // Akekuri Ultimate at 1s — LINK applied after ~1.68s animation
    const ultPayload = getMenuPayload(result.current, ultCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Laevatain Battle Skill at 4s (while LINK is active)
    const battlePayload = getMenuPayload(result.current, battleCol!, 4 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // 2. Controller: Battle skill consumed 1 Link stack
    const controller = getLastController();
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(controller.getLinkStacks(battleEvents[0].uid)).toBe(1);
  });

  it('Laevatain Battle Skill placed before Akekuri Ultimate does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultCol = findColumn(result.current, SLOT_AKEKURI, NounType.ULTIMATE);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(ultCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // Akekuri Ultimate at 5s
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Laevatain Battle Skill at 1s (before LINK exists)
    const battlePayload = getMenuPayload(result.current, battleCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // 2. Controller: no Link consumed
    const controller = getLastController();
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(controller.getLinkStacks(battleEvents[0].uid)).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Freeform LINK stacking and consumption
// ═════════════════════════════════════════════════════════════════════════════

describe('Freeform LINK stacking', () => {
  it('two freeform LINK events on the LINK column stack together', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: team-status column exposes LINK micro-column
    const linkPayload1 = getLinkMenuPayload(result.current, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        linkPayload1.ownerId, linkPayload1.columnId, linkPayload1.atFrame, linkPayload1.defaultSkill,
      );
    });

    const linkPayload2 = getLinkMenuPayload(result.current, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        linkPayload2.ownerId, linkPayload2.columnId, linkPayload2.atFrame, linkPayload2.defaultSkill,
      );
    });

    // 2. Controller: both LINK events present
    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(linkEvents).toHaveLength(2);
  });

  it('battle skill consumes 2 stacks when two freeform LINK events overlap', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    // 1. Context menu: add two LINK events via team-status column
    const linkPayload1 = getLinkMenuPayload(result.current, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        linkPayload1.ownerId, linkPayload1.columnId, linkPayload1.atFrame, linkPayload1.defaultSkill,
      );
    });

    const linkPayload2 = getLinkMenuPayload(result.current, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        linkPayload2.ownerId, linkPayload2.columnId, linkPayload2.atFrame, linkPayload2.defaultSkill,
      );
    });

    // Laevatain Battle Skill at 5s — both LINKs active → 2 stacks consumed
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // 2. Controller: 2 Link stacks consumed
    const controller = getLastController();
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(controller.getLinkStacks(battleEvents[0].uid)).toBe(2);
  });
});
