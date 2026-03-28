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
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType, StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../../../controller/slot/commonSlotController';
import { resolveEventLabel } from '../../../controller/timeline/eventPresentationController';
import { computeStatusViewOverrides } from '../../../controller/timeline/eventPresentationController';

const SLOT_ANTAL = 'slot-2';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function findCommonColumn(app: ReturnType<typeof useApp>, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === COMMON_OWNER_ID &&
      c.columnId === columnId,
  );
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
    expect(teamCol!.microColumnAssignment).toBe('dynamic-split');
  });

  it('LINK events get columnId matching the status ID, not team-status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 1 * FPS,
        { id: StatusType.LINK, name: StatusType.LINK, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(linkEvents.length).toBeGreaterThanOrEqual(1);
    // Should NOT be under the generic 'team-status' columnId
    const genericEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
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

    const ultCol = findColumn(result.current, SLOT_ANTAL, NounType.ULTIMATE);
    if (!ultCol) return; // skip if Antal doesn't have ultimate configured

    // Place two ultimates close together — the second's AMP (12s) should overlap the first's
    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.ULTIMATE, 1 * FPS, ultCol.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.ULTIMATE, 5 * FPS, ultCol.defaultEvent!,
      );
    });

    // Find Overclocked Moment AMP events
    const ampEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === 'OVERCLOCKED_MOMENT_AMP' && ev.ownerId === COMMON_OWNER_ID,
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

    // Overclocked Moment AMP is a RESET status (limit 1) from Antal (slot-2)
    const ampId = 'OVERCLOCKED_MOMENT_AMP';
    const ampEvent = {
      id: ampId,
      name: ampId,
      segments: [{ properties: { duration: 12 * FPS } }],
    };

    // Place two overlapping AMP events
    act(() => {
      result.current.handleAddEvent(COMMON_OWNER_ID, ampId, 1 * FPS, ampEvent);
    });
    act(() => {
      result.current.handleAddEvent(COMMON_OWNER_ID, ampId, 5 * FPS, ampEvent);
    });

    const ampEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === ampId && ev.ownerId === COMMON_OWNER_ID,
    );
    expect(ampEvents).toHaveLength(2);

    const sorted = [...ampEvents].sort((a, b) => a.startFrame - b.startFrame);
    // Earlier event should be clamped (REFRESHED)
    expect(sorted[0].eventStatus).toBe(EventStatusType.REFRESHED);
    // Its duration should end where the second one starts
    expect(eventDuration(sorted[0])).toBe(4 * FPS);
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

    const ampId = 'OVERCLOCKED_MOMENT_AMP';

    // Add a LINK event
    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 1 * FPS,
        { id: StatusType.LINK, name: StatusType.LINK, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Add a RESET status (Overclocked Moment AMP) overlapping the LINK
    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, ampId, 2 * FPS,
        { id: ampId, name: ampId, segments: [{ properties: { duration: 12 * FPS } }] },
      );
    });

    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === StatusType.LINK && ev.ownerId === COMMON_OWNER_ID,
    );
    const ampEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === ampId && ev.ownerId === COMMON_OWNER_ID,
    );

    expect(linkEvents).toHaveLength(1);
    expect(ampEvents).toHaveLength(1);

    // LINK should NOT be clamped by Overclocked Moment AMP
    expect(linkEvents[0].eventStatus).toBeUndefined();
    expect(eventDuration(linkEvents[0])).toBe(20 * FPS);
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

    const linkEvent = {
      id: StatusType.LINK,
      name: StatusType.LINK,
      segments: [{ properties: { duration: 5 * FPS } }],
    };

    // Place 6 LINK events (limit is 4 concurrent) at different non-overlapping times
    for (let i = 0; i < 6; i++) {
      act(() => {
        result.current.handleAddEvent(
          COMMON_OWNER_ID, StatusType.LINK, i * 10 * FPS, linkEvent,
        );
      });
    }

    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === StatusType.LINK && ev.ownerId === COMMON_OWNER_ID,
    );
    expect(linkEvents).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Stack labels and display names
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stack labels and display name resolution', () => {
  it('resolveEventLabel translates status IDs to display names', () => {
    const linkEvent = { uid: 'test', id: StatusType.LINK, name: StatusType.LINK, ownerId: COMMON_OWNER_ID, columnId: StatusType.LINK, startFrame: 0, segments: [] };
    const label = resolveEventLabel(linkEvent);
    expect(label).toBe('Link');
  });

  it('resolveEventLabel translates OVERCLOCKED_MOMENT_AMP to display name', () => {
    const event = { uid: 'test', id: 'OVERCLOCKED_MOMENT_AMP', name: 'OVERCLOCKED_MOMENT_AMP', ownerId: COMMON_OWNER_ID, columnId: 'OVERCLOCKED_MOMENT_AMP', startFrame: 0, segments: [] };
    const label = resolveEventLabel(event);
    expect(label).toBe('Overclocked Moment (Amp)');
  });

  it('stack labels are capped at the stack limit', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const linkEvent = {
      id: StatusType.LINK,
      name: StatusType.LINK,
      segments: [{ properties: { duration: 20 * FPS } }],
    };

    // Place 5 overlapping LINK events (limit 4)
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.handleAddEvent(
          COMMON_OWNER_ID, StatusType.LINK, (i + 1) * FPS, linkEvent,
        );
      });
    }

    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const linkEvents = result.current.allProcessedEvents
      .filter((ev) => ev.id === StatusType.LINK && ev.ownerId === COMMON_OWNER_ID)
      .sort((a, b) => a.startFrame - b.startFrame);

    expect(linkEvents).toHaveLength(5);

    // 5th event (index 4) should be capped at IV, not V
    const fifthLabel = overrides.get(linkEvents[4].uid)?.label;
    expect(fifthLabel).toContain('IV');
    expect(fifthLabel).not.toContain(' V');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Freeform events have sourceOwnerId = USER_ID
// ═══════════════════════════════════════════════════════════════════════════════

describe('Freeform event source defaults', () => {
  it('freeform events get sourceOwnerId and sourceSkillName by default', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 1 * FPS,
        { id: StatusType.LINK, name: StatusType.LINK, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });

    // Check raw events (not processed) for the source fields
    const rawLink = result.current.allProcessedEvents.find(
      (ev) => ev.id === StatusType.LINK && ev.ownerId === COMMON_OWNER_ID,
    );
    expect(rawLink).toBeDefined();
    expect(rawLink!.sourceOwnerId).toBeDefined();
    expect(rawLink!.sourceSkillName).toBeDefined();
  });
});
