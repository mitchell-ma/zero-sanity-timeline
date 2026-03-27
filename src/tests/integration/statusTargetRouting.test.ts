/**
 * @jest-environment jsdom
 */

/**
 * Status Target Routing — Integration Tests
 *
 * Tests that the interpreter routes statuses based on the skill effect's `to` field,
 * falling back to the status config's default `to` when not specified.
 *
 * Scenarios:
 *   A. Effect specifies `to: TEAM` and config defaults TEAM → routes to team column
 *   B. Effect specifies `to: OPERATOR` and config defaults OPERATOR → routes to operator column
 *   C. Effect specifies `to: TEAM` matching config default → same as A (no conflict)
 *   D. Freeform status without explicit `to` → falls back to status config default
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, OPERATOR_COLUMNS } from '../../model/channels';
import { InteractionModeType, StatusType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../../controller/slot/commonSlotController';

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
// A. Effect targets TEAM, config defaults TEAM — routes to team column
// ═════════════════════════════════════════════════════════════════════════════

describe('Status target routing — effect to TEAM, config default TEAM', () => {
  it('Akekuri Ultimate applies LINK to team-status column', () => {
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

    // LINK should appear under COMMON_OWNER_ID with its own column ID
    const teamLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(teamLinkEvents.length).toBeGreaterThanOrEqual(1);

    // LINK should NOT appear on Akekuri's personal status columns
    const personalLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.name === 'LINK',
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

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 1 * FPS, battleCol!.defaultEvent!,
      );
    });

    // MELTING_FLAME should appear on Laevatain's personal melting-flame column
    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME,
    );
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);

    // MELTING_FLAME should NOT appear on the team-status column
    const teamMfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.name === 'MELTING_FLAME',
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

    // Add a freeform LINK directly to its column
    const teamStatusCol = findCommonColumn(result.current, COMMON_COLUMN_IDS.TEAM_STATUS);
    expect(teamStatusCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        COMMON_OWNER_ID,
        StatusType.LINK,
        2 * FPS,
        {
          name: StatusType.LINK,
          segments: [{ properties: { duration: 5 * FPS } }],
          sourceOwnerId: SLOT_AKEKURI,
        },
      );
    });

    // Should appear under COMMON_OWNER_ID with LINK column ID
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

    // Place a BS to trigger MELTING_FLAME derivation
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // MELTING_FLAME should appear on Laevatain's personal column
    const personalMfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME,
    );
    expect(personalMfEvents.length).toBeGreaterThanOrEqual(1);

    // Should NOT appear on the team column
    const teamMfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.name === 'MELTING_FLAME',
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

    const ultCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(ultCol).toBeDefined();
    expect(battleCol).toBeDefined();

    // Akekuri ult at 1s
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.ULTIMATE, 1 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Laevatain BS at 1s
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 1 * FPS, battleCol!.defaultEvent!,
      );
    });

    // LINK → team column (distinct column ID per status)
    const teamLinkEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === StatusType.LINK,
    );
    expect(teamLinkEvents.length).toBeGreaterThanOrEqual(1);

    // MELTING_FLAME → Laevatain personal column
    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME,
    );
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);

    // Neither status on the wrong owner
    const teamMf = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.name === 'MELTING_FLAME',
    );
    const personalLink = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.name === 'LINK',
    );
    expect(teamMf).toHaveLength(0);
    expect(personalLink).toHaveLength(0);
  });
});
