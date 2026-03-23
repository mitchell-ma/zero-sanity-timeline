/**
 * @jest-environment jsdom
 */

/**
 * Scorching Heart Activation — Integration Tests
 *
 * Tests the lifecycle clause trigger: when Laevatain accumulates 4 Melting Flame
 * stacks, Scorching Heart Effect automatically activates. Verifies activation
 * threshold, re-activation after consumption, timing, RESET stacking, and
 * isolation from other operators.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, OPERATOR_COLUMNS } from '../../model/channels';
import { EnhancementType, EventStatusType, InteractionModeType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import { eventDuration } from '../../consts/viewTypes';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';
const SH_COLUMN = 'scorching-heart-effect';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function addBattleSkills(app: ReturnType<typeof useApp>, count: number, startAt: number, spacing: number) {
  const col = findColumn(app, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
  for (let i = 0; i < count; i++) {
    act(() => {
      app.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, (startAt + i * spacing) * FPS, col!.defaultEvent!,
      );
    });
  }
}

function getMfEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
  );
}

function getActiveMfEvents(app: ReturnType<typeof useApp>) {
  return getMfEvents(app).filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
}

function getShEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === SH_COLUMN && ev.ownerId === SLOT_LAEVATAIN,
  );
}

function getActiveShEvents(app: ReturnType<typeof useApp>) {
  return getShEvents(app).filter((ev) =>
    ev.eventStatus !== EventStatusType.CONSUMED && ev.eventStatus !== EventStatusType.REFRESHED,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Basic activation
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Basic Activation', () => {
  it('SH1: 4 battle skills produce Scorching Heart', () => {
    const { result } = renderHook(() => useApp());
    addBattleSkills(result.current, 4, 2, 10);

    const mf = getActiveMfEvents(result.current);
    expect(mf).toHaveLength(4);

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(1);
    expect(sh[0].ownerId).toBe(SLOT_LAEVATAIN);
  });

  it('SH2: 3 battle skills do NOT produce Scorching Heart', () => {
    const { result } = renderHook(() => useApp());
    addBattleSkills(result.current, 3, 2, 10);

    const mf = getActiveMfEvents(result.current);
    expect(mf).toHaveLength(3);

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Re-activation after consumption
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Re-activation', () => {
  it('SH3: After MF consumption and re-accumulation, SH re-activates', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // First cycle: 4 BS → 4 MF → SH
    addBattleSkills(result.current, 4, 2, 10);
    expect(getShEvents(result.current)).toHaveLength(1);

    // Empowered BS consumes all 4 MF
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 50 * FPS, empoweredVariant!,
      );
    });

    // Second cycle: 4 more BS → 4 new MF → second SH
    addBattleSkills(result.current, 4, 60, 10);

    const sh = getShEvents(result.current);
    // Both SH events exist — first may have expired before second was created
    expect(sh.length).toBe(2);
    // At least one SH is from the second cycle
    const secondCycleSh = sh.filter((ev) => ev.startFrame > 50 * FPS);
    expect(secondCycleSh).toHaveLength(1);
  });

  it('SH4: After MF consumption, only 2 BS do NOT re-activate SH', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // First cycle: 4 BS → SH
    addBattleSkills(result.current, 4, 2, 10);
    expect(getShEvents(result.current)).toHaveLength(1);

    // Empowered BS consumes MF
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 50 * FPS, empoweredVariant!,
      );
    });

    // Only 2 BS → 2 MF (below threshold)
    addBattleSkills(result.current, 2, 60, 10);

    // Still only 1 SH total (from first cycle)
    expect(getShEvents(result.current)).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Timing
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Timing', () => {
  it('SH5: SH starts at the frame of the 4th MF stack creation', () => {
    const { result } = renderHook(() => useApp());
    addBattleSkills(result.current, 4, 2, 10);

    const mf = getActiveMfEvents(result.current);
    // The 4th MF stack's start frame
    const fourthMfFrame = Math.max(...mf.map((ev) => ev.startFrame));

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(1);
    // SH should start at or after the 4th MF creation frame
    expect(sh[0].startFrame).toBeGreaterThanOrEqual(fourthMfFrame);
  });

  it('SH6: SH has 20s duration', () => {
    const { result } = renderHook(() => useApp());
    addBattleSkills(result.current, 4, 2, 10);

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(1);
    expect(eventDuration(sh[0])).toBe(20 * FPS);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Under threshold / cap behavior
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Under Threshold', () => {
  it('SH7: 5 BS (cap is 4 MF) still produce exactly 1 SH', () => {
    const { result } = renderHook(() => useApp());
    addBattleSkills(result.current, 5, 2, 10);

    // 5th BS doesn't create MF (cap 4), so only 1 SH
    const mf = getActiveMfEvents(result.current);
    expect(mf).toHaveLength(4);
    expect(getShEvents(result.current)).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-operator isolation
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Cross-operator Isolation', () => {
  it('SH8: Akekuri battle skills do NOT contribute to Laevatain SH', () => {
    const { result } = renderHook(() => useApp());
    const akekuriCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BATTLE);
    expect(akekuriCol).toBeDefined();

    // 4 Akekuri battle skills (don't produce MF)
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_AKEKURI, SKILL_COLUMNS.BATTLE, (5 + i * 10) * FPS, akekuriCol!.defaultEvent!,
        );
      });
    }

    // No MF from Akekuri
    const mfAkekuri = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_AKEKURI,
    );
    expect(mfAkekuri).toHaveLength(0);

    // No SH anywhere
    const sh = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SH_COLUMN,
    );
    expect(sh).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Freeform mode
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Freeform Mode', () => {
  it('SH9: Freeform battle skills trigger SH the same way', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    addBattleSkills(result.current, 4, 1, 5);

    const mf = getActiveMfEvents(result.current);
    expect(mf).toHaveLength(4);

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RESET stacking (no duplicate SH)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — RESET Stacking', () => {
  it('SH10: Second SH resets the first — only 1 active, duration refreshed', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // First cycle: 4 BS at 2s, 4s, 6s, 8s → SH activates around ~8s+offset
    addBattleSkills(result.current, 4, 2, 2);
    const firstSh = getShEvents(result.current);
    expect(firstSh).toHaveLength(1);
    const firstShFrame = firstSh[0].startFrame;

    // Empowered BS at 12s consumes all MF
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 12 * FPS, empoweredVariant!,
      );
    });

    // Second cycle: 4 BS at 14s, 16s, 18s, 20s — 4th MF at ~20s+offset
    // First SH expires at ~8s+offset+20s = ~28s+offset, so SH is still active at ~20s
    addBattleSkills(result.current, 4, 14, 2);

    const allSh = getShEvents(result.current);
    // 2 SH events total (first consumed by RESET, second active)
    expect(allSh).toHaveLength(2);

    const activeSh = getActiveShEvents(result.current);
    expect(activeSh).toHaveLength(1);

    // Active SH started after the first one
    expect(activeSh[0].startFrame).toBeGreaterThan(firstShFrame);

    // Active SH has full 20s duration (refreshed, not carried over)
    expect(eventDuration(activeSh[0])).toBe(20 * FPS);

    // First SH was reset (REFRESHED status from RESET stacking)
    const resetSh = allSh.filter((ev) => ev.eventStatus === EventStatusType.REFRESHED);
    expect(resetSh).toHaveLength(1);
    expect(resetSh[0].startFrame).toBe(firstShFrame);
  });
});
