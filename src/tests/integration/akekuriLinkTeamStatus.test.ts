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
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS } from '../../model/channels';
import { InteractionModeType, StatusType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';
import { COMMON_OWNER_ID } from '../../controller/slot/commonSlotController';
import { getLastController } from '../../controller/timeline/eventQueueController';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function findCommonColumn(app: ReturnType<typeof useApp>, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === COMMON_OWNER_ID &&
      c.columnId === columnId,
  );
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

    const ultCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE);
    expect(ultCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    const linkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(linkEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('Laevatain Battle Skill consumes Link produced by Akekuri Ultimate', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(ultCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // Akekuri Ultimate at 1s — LINK applied after ~1.68s animation
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Laevatain Battle Skill at 4s (while LINK is active)
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 4 * FPS, battleCol!.defaultEvent!,
      );
    });

    const controller = getLastController();
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(controller.getLinkStacks(battleEvents[0].uid)).toBe(1);
  });

  it('Laevatain Battle Skill placed before Akekuri Ultimate does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(ultCol).toBeDefined();
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!,
      );
    });

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 1 * FPS, battleCol!.defaultEvent!,
      );
    });

    const controller = getLastController();
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
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

    const linkCol = findCommonColumn(result.current, StatusType.LINK);
    expect(linkCol).toBeDefined();
    expect(linkCol!.defaultEvent).toBeDefined();

    // Add two overlapping LINK events
    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 1 * FPS, linkCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 2 * FPS, linkCol!.defaultEvent!,
      );
    });

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

    const linkCol = findCommonColumn(result.current, StatusType.LINK);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(linkCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // Two overlapping LINK events (each 20s default duration)
    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 1 * FPS, linkCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID, StatusType.LINK, 2 * FPS, linkCol!.defaultEvent!,
      );
    });

    // Laevatain Battle Skill at 5s — both LINKs active → 2 stacks consumed
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 5 * FPS, battleCol!.defaultEvent!,
      );
    });

    const controller = getLastController();
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(controller.getLinkStacks(battleEvents[0].uid)).toBe(2);
  });
});
