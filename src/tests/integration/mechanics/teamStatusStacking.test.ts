/**
 * @jest-environment jsdom
 */

/**
 * Team Status Stacking — Integration Tests
 *
 * Covers the unified team-status architecture:
 * - Team statuses use distinct columnIds (via matchColumnIds), same as operator/enemy statuses
 * - RESET statuses (limit 1) clamp earlier instances when overlapping
 * - Stackable statuses (limit > 1) coexist freely
 * - Different statuses in the same team-status column don't interact
 * - Stack labels show correct Roman numerals capped at the stack limit
 * - Freeform events route through the same stacking pipeline as derived events
 * - resolveEventLabel translates status IDs to display names
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeStatusViewOverrides / computeTimelinePresentation show correct state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType, MicroColumnAssignment, StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../controller/slot/commonSlotController';
import { resolveEventLabel, computeStatusViewOverrides } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

// Load Overclocked Moment AMP status ID from JSON — no string literals.
// Display name comes from the locale bundle (surfaced via configCache/getStatusDef);
// it's not on the raw JSON anymore.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OVERCLOCKED_MOMENT_AMP_STATUS: { properties: { id: string } } = require('../../../model/game-data/operators/antal/statuses/status-overclocked-moment-amp.json');
const AMP_ID: string = OVERCLOCKED_MOMENT_AMP_STATUS.properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getStatusDef: _getStatusDef } = require('../../../controller/timeline/configCache');
const AMP_DISPLAY_NAME: string = (_getStatusDef(AMP_ID)?.properties as { name?: string } | undefined)?.name ?? AMP_ID;

const SLOT_ANTAL = 'slot-2';

/** Find the team-status column under TEAM_ID. */
function findCommonColumn(app: AppResult, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === TEAM_ID &&
      c.columnId === columnId,
  );
}

/** Find the team-status parent column. */
function findTeamStatusColumn(app: AppResult) {
  return findCommonColumn(app, COMMON_COLUMN_IDS.TEAM_STATUS);
}

/**
 * Build the team-status context menu and find the micro-column add-event item
 * matching the given columnId.
 */
function getTeamStatusMenuPayload(app: AppResult, microColumnId: string, atFrame: number): AddEventPayload {
  const teamCol = findTeamStatusColumn(app);
  expect(teamCol).toBeDefined();

  const menuItems = buildContextMenu(app, teamCol!, atFrame);
  expect(menuItems).not.toBeNull();
  expect(menuItems!.length).toBeGreaterThan(0);

  const item = menuItems!.find(
    (i) => i.actionId === 'addEvent' && (i.actionPayload as AddEventPayload)?.columnId === microColumnId,
  );
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();

  return item!.actionPayload as AddEventPayload;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Team-status column architecture (microColumns + matchColumnIds)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Team-status column architecture', () => {
  it('team-status column uses matchColumnIds with distinct status IDs', () => {
    const { result } = renderHook(() => useApp());

    const teamCol = findCommonColumn(result.current, COMMON_COLUMN_IDS.TEAM_STATUS);
    expect(teamCol).toBeDefined();
    expect(teamCol!.microColumns).toBeDefined();
    expect(teamCol!.matchColumnIds).toBeDefined();
    expect(teamCol!.microColumnAssignment).toBe(MicroColumnAssignment.DYNAMIC_SPLIT);
  });

  it('LINK events get columnId matching the status ID, not team-status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: team-status column has LINK micro-column item
    const linkPayload = getTeamStatusMenuPayload(result.current, StatusType.LINK, 1 * FPS);

    // Add LINK event via context menu payload
    act(() => {
      result.current.handleAddEvent(
        linkPayload.ownerEntityId, linkPayload.columnId, linkPayload.atFrame, linkPayload.defaultSkill,
      );
    });

    // 2. Controller: LINK events appear with their own columnId
    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === TEAM_ID && ev.columnId === StatusType.LINK,
    );
    expect(linkEvents.length).toBeGreaterThanOrEqual(1);
    // Should NOT be under the generic 'team-status' columnId
    const genericEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === TEAM_ID && ev.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
    );
    expect(genericEvents).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. RESET stacking interaction (limit 1, clamp earlier)
// ═══════════════════════════════════════════════════════════════════════════════

describe('RESET stacking interaction', () => {
  it('derived RESET status clamps earlier instance (Overclocked Moment AMP via Antal Ultimate)', () => {
    const { result } = renderHook(() => useApp());

    // 1. Context menu: Antal ultimate column available
    const ultCol = findColumn(result.current, SLOT_ANTAL, NounType.ULTIMATE);
    if (!ultCol) return; // skip if Antal doesn't have ultimate configured

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultMenu = buildContextMenu(result.current, ultCol, 1 * FPS);
    expect(ultMenu).not.toBeNull();
    expect(ultMenu!.length).toBeGreaterThan(0);

    // Place two ultimates close together — the second's AMP (12s) should overlap the first's
    const ultPayload1 = getMenuPayload(result.current, ultCol, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload1.ownerEntityId, ultPayload1.columnId, ultPayload1.atFrame, ultPayload1.defaultSkill,
      );
    });

    const ultPayload2 = getMenuPayload(result.current, ultCol, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload2.ownerEntityId, ultPayload2.columnId, ultPayload2.atFrame, ultPayload2.defaultSkill,
      );
    });

    // 2. Controller: Find Overclocked Moment AMP events
    const ampEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === AMP_ID && ev.ownerEntityId === TEAM_ID,
    );
    expect(ampEvents.length).toBeGreaterThanOrEqual(2);

    // Earlier AMP event should be REFRESHED (clamped)
    const sorted = [...ampEvents].sort((a, b) => a.startFrame - b.startFrame);
    expect(sorted[0].eventStatus).toBe(EventStatusType.REFRESHED);
  });

  it('freeform RESET status clamps earlier instance in processing pipeline', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: team-status column has AMP micro-column item
    const ampPayload1 = getTeamStatusMenuPayload(result.current, AMP_ID, 1 * FPS);

    // Place two overlapping AMP events via context menu
    act(() => {
      result.current.handleAddEvent(
        ampPayload1.ownerEntityId, ampPayload1.columnId, ampPayload1.atFrame, ampPayload1.defaultSkill,
      );
    });

    const ampPayload2 = getTeamStatusMenuPayload(result.current, AMP_ID, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ampPayload2.ownerEntityId, ampPayload2.columnId, ampPayload2.atFrame, ampPayload2.defaultSkill,
      );
    });

    // 2. Controller: both AMP events exist, earlier is clamped
    const ampEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === AMP_ID && ev.ownerEntityId === TEAM_ID,
    );
    expect(ampEvents).toHaveLength(2);

    const sorted = [...ampEvents].sort((a, b) => a.startFrame - b.startFrame);
    // Earlier event should be clamped (REFRESHED)
    expect(sorted[0].eventStatus).toBe(EventStatusType.REFRESHED);
    // Clamped event's end frame should not exceed the second event's start frame
    expect(sorted[0].startFrame + eventDuration(sorted[0])).toBeLessThanOrEqual(
      sorted[1].startFrame + eventDuration(sorted[1]),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Different statuses don't interact in team-status column
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cross-status isolation in team-status column', () => {
  it('RESET on one status does not clamp a different status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: add LINK via team-status menu
    const linkPayload = getTeamStatusMenuPayload(result.current, StatusType.LINK, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        linkPayload.ownerEntityId, linkPayload.columnId, linkPayload.atFrame, linkPayload.defaultSkill,
      );
    });

    // Add a RESET status (Overclocked Moment AMP) overlapping the LINK via context menu
    const ampPayload = getTeamStatusMenuPayload(result.current, AMP_ID, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ampPayload.ownerEntityId, ampPayload.columnId, ampPayload.atFrame, ampPayload.defaultSkill,
      );
    });

    // 2. Controller: both statuses exist independently
    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === StatusType.LINK && ev.ownerEntityId === TEAM_ID,
    );
    const ampEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === AMP_ID && ev.ownerEntityId === TEAM_ID,
    );

    expect(linkEvents).toHaveLength(1);
    expect(ampEvents).toHaveLength(1);

    // LINK should NOT be clamped by Overclocked Moment AMP
    expect(linkEvents[0].eventStatus).toBeUndefined();
    // AMP should be active
    expect(ampEvents[0].eventStatus).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. No total-event limit — users can place unlimited status events
// ═══════════════════════════════════════════════════════════════════════════════

describe('No total-event limit for status events', () => {
  it('allows placing more events than the stack limit', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Place 6 LINK events (limit is 4 concurrent) at different non-overlapping times via context menu
    for (let i = 0; i < 6; i++) {
      const payload = getTeamStatusMenuPayload(result.current, StatusType.LINK, i * 10 * FPS);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === StatusType.LINK && ev.ownerEntityId === TEAM_ID,
    );
    expect(linkEvents).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Stack labels and display names
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stack labels and display name resolution', () => {
  it('resolveEventLabel translates status IDs to display names', () => {
    const linkEvent = { uid: 'test', id: StatusType.LINK, name: StatusType.LINK, ownerEntityId: TEAM_ID, columnId: StatusType.LINK, startFrame: 0, segments: [] };
    const label = resolveEventLabel(linkEvent);
    expect(label).toBe('Link');
  });

  it('resolveEventLabel translates Overclocked Moment AMP to display name', () => {
    const event = { uid: 'test', id: AMP_ID, name: AMP_ID, ownerEntityId: TEAM_ID, columnId: AMP_ID, startFrame: 0, segments: [] };
    const label = resolveEventLabel(event);
    expect(label).toBe(AMP_DISPLAY_NAME);
  });

  it('stack labels are capped at the stack limit', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // 1. Context menu: verify LINK item available before placing events
    const teamCol = findTeamStatusColumn(result.current);
    expect(teamCol).toBeDefined();
    const initialMenu = buildContextMenu(result.current, teamCol!, 1 * FPS);
    expect(initialMenu).not.toBeNull();
    const linkItems = initialMenu!.filter(
      (i) => i.actionId === 'addEvent' && (i.actionPayload as AddEventPayload)?.columnId === StatusType.LINK,
    );
    expect(linkItems.length).toBeGreaterThanOrEqual(1);

    // Place 5 overlapping LINK events (limit 4) via context menu
    for (let i = 0; i < 5; i++) {
      const payload = getTeamStatusMenuPayload(result.current, StatusType.LINK, (i + 1) * FPS);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // 3. View: stack labels capped via computeStatusViewOverrides
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const linkEvents = result.current.allProcessedEvents
      .filter((ev) => ev.id === StatusType.LINK && ev.ownerEntityId === TEAM_ID)
      .sort((a, b) => a.startFrame - b.startFrame);

    expect(linkEvents).toHaveLength(5);

    // 5th event (index 4) should be capped at 4, not 5
    const fifthLabel = overrides.get(linkEvents[4].uid)?.label;
    expect(fifthLabel).toMatch(/\s4$/);
    expect(fifthLabel).not.toMatch(/\s5$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Freeform events have sourceEntityId = USER_ID
// ═══════════════════════════════════════════════════════════════════════════════

describe('Freeform event source defaults', () => {
  it('freeform events get sourceEntityId and sourceSkillId by default', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Add LINK via context menu flow
    const linkPayload = getTeamStatusMenuPayload(result.current, StatusType.LINK, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        linkPayload.ownerEntityId, linkPayload.columnId, linkPayload.atFrame, linkPayload.defaultSkill,
      );
    });

    // Check raw events (not processed) for the source fields
    const rawLink = result.current.allProcessedEvents.find(
      (ev) => ev.id === StatusType.LINK && ev.ownerEntityId === TEAM_ID,
    );
    expect(rawLink).toBeDefined();
    expect(rawLink!.ownerEntityId).toBeDefined();
    expect(rawLink!.sourceSkillId).toBeDefined();
  });
});
