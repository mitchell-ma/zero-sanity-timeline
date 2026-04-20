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
 *
 * Verifies all three layers:
 * 1. Context menu: battle skill menu items are available and enabled
 * 2. Controller: MF/SH event counts, event status, timing, duration
 * 3. View: computeTimelinePresentation includes MF/SH events in their columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MELTING_FLAME_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SH_COLUMN: string = require('../../../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json').properties.id;
const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

/** Add battle skills for Laevatain via context menu flow. */
function addBattleSkills(app: AppResult, count: number, startAt: number, spacing: number) {
  const col = findColumn(app, SLOT_LAEVATAIN, NounType.BATTLE);
  for (let i = 0; i < count; i++) {
    const atFrame = (startAt + i * spacing) * FPS;
    const payload = getMenuPayload(app, col!, atFrame);
    act(() => {
      app.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }
}

/** Add an empowered battle skill for Laevatain via context menu flow. */
function addEmpoweredBattleSkill(app: AppResult, atSecond: number) {
  const col = findColumn(app, SLOT_LAEVATAIN, NounType.BATTLE);
  const empoweredVariant = col!.eventVariants?.find(
    (v) => v.id.endsWith('_EMPOWERED'),
  );
  expect(empoweredVariant).toBeDefined();
  const atFrame = atSecond * FPS;
  const payload = getMenuPayload(app, col!, atFrame, { variantId: empoweredVariant!.id });
  act(() => {
    app.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function getMfEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
  );
}

function getActiveMfEvents(app: AppResult) {
  return getMfEvents(app).filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
}

function getShEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === SH_COLUMN && ev.ownerEntityId === SLOT_LAEVATAIN,
  );
}

function getActiveShEvents(app: AppResult) {
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

    // ── Context menu layer ──────────────────────────────────────────────
    // Verify battle skill menu item is enabled before adding
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, battleCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // ── Controller layer ────────────────────────────────────────────────
    addBattleSkills(result.current, 4, 2, 10);

    const mf = getActiveMfEvents(result.current);
    expect(mf).toHaveLength(4);

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(1);
    expect(sh[0].ownerEntityId).toBe(SLOT_LAEVATAIN);

    // ── View layer ──────────────────────────────────────────────────────
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // MF and SH events live in the unified operator status column
    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const statusVm = viewModels.get(statusCol!.key);
    expect(statusVm).toBeDefined();

    // MF events appear in the status column view model
    const mfVmEvents = statusVm!.events.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(mfVmEvents.length).toBeGreaterThanOrEqual(4);

    // SH event appears in the status column view model
    const shVmEvents = statusVm!.events.filter(
      (ev) => ev.columnId === SH_COLUMN && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(shVmEvents).toHaveLength(1);
    expect(shVmEvents[0].uid).toBe(sh[0].uid);
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
// Regression: MF accumulated across multiple talent fires (compound loop path)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Cross-invocation MF accumulation', () => {
  it('SH11: MF stacks accumulated across separate finishers fire SH when total reaches 4', () => {
    // Reproduces the bug where basic attack finishers trigger the talent's
    // compound ALL UP_TO 4 loop repeatedly, each invocation creating 1 MF.
    // The compound cascade filter used to use an iteration-index override
    // for BECOME STACKS, which ignored pre-existing stacks — so the trigger
    // would see countNow=1 each time and never match EXACTLY 4.
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(akekuriBattleCol).toBeDefined();
    expect(basicCol).toBeDefined();

    // 4 Akekuri BSes create 4 Heat Inflictions on the enemy, spaced so that
    // a single basic attack finisher only has 1 infliction to consume at a time.
    // Structure: 1 Akekuri BS → 1 BATK finisher → talent compound loop runs i=0 only.
    for (let cycle = 0; cycle < 4; cycle++) {
      const baseSec = 2 + cycle * 8;
      const akekuriPayload = getMenuPayload(result.current, akekuriBattleCol!, baseSec * FPS);
      act(() => {
        result.current.handleAddEvent(
          akekuriPayload.ownerEntityId, akekuriPayload.columnId,
          akekuriPayload.atFrame, akekuriPayload.defaultSkill,
        );
      });
      const basicPayload = getMenuPayload(result.current, basicCol!, (baseSec + 2) * FPS);
      act(() => {
        result.current.handleAddEvent(
          basicPayload.ownerEntityId, basicPayload.columnId,
          basicPayload.atFrame, basicPayload.defaultSkill,
        );
      });
    }

    const mf = getActiveMfEvents(result.current);
    expect(mf.length).toBeGreaterThanOrEqual(4);

    const sh = getShEvents(result.current);
    expect(sh).toHaveLength(1);
    expect(sh[0].ownerEntityId).toBe(SLOT_LAEVATAIN);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Re-activation after consumption
// ═════════════════════════════════════════════════════════════════════════════

describe('Scorching Heart — Re-activation', () => {
  it('SH3: After MF consumption and re-accumulation, SH re-activates', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // First cycle: 4 BS → 4 MF → SH
    addBattleSkills(result.current, 4, 2, 10);
    expect(getShEvents(result.current)).toHaveLength(1);

    // Empowered BS consumes all 4 MF
    addEmpoweredBattleSkill(result.current, 50);

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

    // First cycle: 4 BS → SH
    addBattleSkills(result.current, 4, 2, 10);
    expect(getShEvents(result.current)).toHaveLength(1);

    // Empowered BS consumes MF
    addEmpoweredBattleSkill(result.current, 50);

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
    const akekuriCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(akekuriCol).toBeDefined();

    // 4 Akekuri battle skills via context menu
    for (let i = 0; i < 4; i++) {
      const atFrame = (5 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, akekuriCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // No MF from Akekuri
    const mfAkekuri = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_AKEKURI,
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

    // First cycle: 4 BS at 2s, 4s, 6s, 8s → SH activates around ~8s+offset
    addBattleSkills(result.current, 4, 2, 2);
    const firstSh = getShEvents(result.current);
    expect(firstSh).toHaveLength(1);
    const firstShFrame = firstSh[0].startFrame;

    // Empowered BS at 12s consumes all MF
    addEmpoweredBattleSkill(result.current, 12);

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

    // ── View layer ──────────────────────────────────────────────────────
    // Verify only the active SH appears as non-refreshed in the view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const statusVm = viewModels.get(statusCol!.key);
    expect(statusVm).toBeDefined();
    const shVmEvents = statusVm!.events.filter(
      (ev) => ev.columnId === SH_COLUMN && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    // Both SH events exist in the view model (refreshed one is rendered dimmed)
    expect(shVmEvents).toHaveLength(2);
    // The active one matches
    const activeInVm = shVmEvents.filter(
      (ev) => ev.eventStatus !== EventStatusType.REFRESHED,
    );
    expect(activeInVm).toHaveLength(1);
    expect(activeInVm[0].uid).toBe(activeSh[0].uid);
  });
});
