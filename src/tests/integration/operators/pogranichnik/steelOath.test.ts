/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik Ultimate → Steel Oath Team Status — Integration Tests
 *
 * Tests the full pipeline: Pogranichnik's Ultimate (SHIELDGUARD_BANNER) produces
 * STEEL_OATH team status events under COMMON_OWNER_ID.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled for each column
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct column view model
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Pogranichnik is swapped into slot-3 via handleSwapOperator.
 *
 * STEEL_OATH config: interactionType RESET, limit 5, duration 30s, "to": "TEAM"
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ENEMY_OWNER_ID } from '../../../../model/channels';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getTeamStatusIds } from '../../../../controller/gameDataStore';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

// ── Constants (loaded from game data JSON) ──────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const POGRANICHNIK_ID: string = require('../../../../model/game-data/operators/pogranichnik/pogranichnik.json').id;
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const STEEL_OATH_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-steel-oath.json').properties.id;
const STEEL_OATH_HARASS_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-steel-oath-harass.json').properties.id;
const STEEL_OATH_DECISIVE_ASSAULT_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-steel-oath-decisive-assault.json').properties.id;
const FERVENT_MORALE_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-fervent-morale.json').properties.id;
const LIVING_BANNER_ID: string = require('../../../../model/game-data/operators/pogranichnik/talents/talent-the-living-banner-talent.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_POG = 'slot-3';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Set up a fresh hook with Pogranichnik in slot-3. */
function setupPogranichnik() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
  return view;
}

/** Add an ultimate via context menu flow: find column → get menu payload → handleAddEvent. */
function addUltimate(app: AppResult, atFrame: number) {
  const ultCol = findColumn(app, SLOT_POG, NounType.ULTIMATE);
  expect(ultCol).toBeDefined();

  const menu = buildContextMenu(app, ultCol!, atFrame);
  expect(menu).not.toBeNull();
  expect(menu!.length).toBeGreaterThan(0);

  const payload = getMenuPayload(app, ultCol!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Add a combo skill via context menu flow. */
function addComboSkill(app: AppResult, atFrame: number) {
  const comboCol = findColumn(app, SLOT_POG, NounType.COMBO);
  expect(comboCol).toBeDefined();

  const payload = getMenuPayload(app, comboCol!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Data pipeline prerequisites
// ═══════════════════════════════════════════════════════════════════════════════

describe('Data pipeline prerequisites', () => {
  it('getTeamStatusIds for POGRANICHNIK includes STEEL_OATH', () => {
    const ids = getTeamStatusIds(POGRANICHNIK_ID);
    expect(ids).toContain(STEEL_OATH_ID);
  });

  it('team-status column matchColumnIds includes STEEL_OATH when Pog is slotted', () => {
    const { result } = setupPogranichnik();
    const teamCol = findColumn(result.current, COMMON_OWNER_ID, COMMON_COLUMN_IDS.TEAM_STATUS);
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

    // ── Context menu layer ──────────────────────────────────────────────
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    // ── Controller layer ────────────────────────────────────────────────
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

    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);

    // Every STEEL_OATH event should use STEEL_OATH as its columnId
    for (const ev of steelOathEvents) {
      expect(ev.columnId).toBe(STEEL_OATH_ID);
    }

    // No STEEL_OATH events should be under the generic team-status columnId
    const genericSteelOath = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
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

    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    // ── View layer ──────────────────────────────────────────────────────
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

    // First ultimate at 1s
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    // Second ultimate at 20s — place directly via handleAddEvent (energy consumed by first)
    const ultCol = findColumn(result.current, SLOT_POG, NounType.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(SLOT_POG, NounType.ULTIMATE, 20 * FPS, ultCol!.defaultEvent!);
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

    // Place ultimate at 1s — no other events that would trigger consumption
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

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

    // Place ultimate at 1s
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    // Place combo skill at 5s (after ultimate animation ends)
    addComboSkill(result.current, 5 * FPS);

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );

    // All 5 original events consumed, 4 continuations created
    const consumedEvents = steelOathEvents.filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedEvents).toHaveLength(5);

    // With 5 stacks remaining, HAVE STACKS=1 fails → Harass (not Decisive Assault)
    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents).toHaveLength(1);

    // Harass event should have damage frames from the status config
    const seg = harassEvents[0].segments[0];
    expect(seg.frames).toBeDefined();
    expect(seg.frames!.length).toBeGreaterThanOrEqual(1);
    expect(seg.frames![0].dealDamage).toBeDefined();
    expect(seg.frames![0].dealDamage!.multipliers.length).toBeGreaterThan(0);

    const assaultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID,
    );
    expect(assaultEvents).toHaveLength(0);
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

    // Place ultimate at 1s
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    // Place 5 combo skills spaced 1s apart starting at 5s (5s, 6s, 7s, 8s, 9s)
    for (let i = 0; i < 5; i++) {
      addComboSkill(result.current, (5 + i) * FPS);
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

    // 4 Harass (stacks 5→4, 4→3, 3→2, 2→1) + 1 Decisive Assault (last stack 1→0)
    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents).toHaveLength(4);

    const assaultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID,
    );
    expect(assaultEvents).toHaveLength(1);

    // All Harass and Assault events should carry damage frames from their status configs
    for (const ev of [...harassEvents, ...assaultEvents]) {
      const seg = ev.segments[0];
      expect(seg.frames).toBeDefined();
      expect(seg.frames!.length).toBeGreaterThanOrEqual(1);
      expect(seg.frames![0].dealDamage).toBeDefined();
    }
    // Decisive Assault should also have stagger
    expect(assaultEvents[0].segments[0].frames![0].stagger).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Chen Qianyu BS triggers produce Harass x4 + Decisive Assault x1
// ═══════════════════════════════════════════════════════════════════════════════

describe('Chen Qianyu BS consumes Steel Oath → 4 Harass + 1 Decisive Assault', () => {
  const SLOT_CHEN = 'slot-2';

  it('6 Chen BS after Pog ult produces exactly 4 Harass and 1 Decisive Assault', () => {
    const { result } = setupPogranichnik();

    // Add Chen Qianyu to slot-2
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu layer: ultimate ────────────────────────────────────
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 0);

    // ── Context menu layer: Chen BS ─────────────────────────────────────
    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(chenBattleCol).toBeDefined();

    const chenMenu = buildContextMenu(result.current, chenBattleCol!, 3 * FPS);
    expect(chenMenu).not.toBeNull();
    expect(chenMenu!.length).toBeGreaterThan(0);

    // 6 Chen BS spaced 2s apart starting at 3s
    // First BS only adds Vulnerable (no physical status yet → no consumption)
    // Subsequent BS apply Lift (physical status → triggers Steel Oath)
    for (let i = 0; i < 6; i++) {
      const payload = getMenuPayload(result.current, chenBattleCol!, (3 + i * 2) * FPS);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // ── Controller layer ────────────────────────────────────────────────
    // Steel Oath stacks: all 5 should be consumed
    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID,
    );
    const activeStacks = steelOathEvents.filter(
      (ev) => !ev.eventStatus,
    );
    expect(activeStacks).toHaveLength(0);

    // Enemy should have exactly 4 Harass (stacks 5→4, 4→3, 3→2, 2→1)
    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents).toHaveLength(4);

    // Enemy should have exactly 1 Decisive Assault (last stack: 1→0)
    const assaultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID,
    );
    expect(assaultEvents).toHaveLength(1);

    // Decisive Assault should be the last consumption (at or after latest Harass frame)
    const lastHarassFrame = Math.max(...harassEvents.map(e => e.startFrame));
    expect(assaultEvents[0].startFrame).toBeGreaterThanOrEqual(lastHarassFrame);

    // No more than 5 total enemy sub-statuses (4 Harass + 1 Decisive Assault)
    expect(harassEvents.length + assaultEvents.length).toBe(5);

    // All sub-statuses should carry damage frames from their status configs
    for (const ev of [...harassEvents, ...assaultEvents]) {
      const seg = ev.segments[0];
      expect(seg.frames).toBeDefined();
      expect(seg.frames!.length).toBeGreaterThanOrEqual(1);
      expect(seg.frames![0].dealDamage).toBeDefined();
    }

    // FIRST_MATCH: each trigger produces exactly one sub-status, never both
    // Group all enemy Steel Oath sub-statuses by frame
    const allSubStatuses = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID &&
        (ev.id === STEEL_OATH_HARASS_ID || ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID),
    );
    const byFrame = new Map<number, string[]>();
    for (const ev of allSubStatuses) {
      const list = byFrame.get(ev.startFrame) ?? [];
      list.push(ev.id);
      byFrame.set(ev.startFrame, list);
    }
    // Each frame should have exactly one sub-status (never both Harass + Assault)
    for (const [, ids] of Array.from(byFrame.entries())) {
      expect(ids).toHaveLength(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. FIRST_MATCH reactive trigger — only one clause fires per trigger frame
// ═══════════════════════════════════════════════════════════════════════════════

describe('FIRST_MATCH clause selection in reactive triggers', () => {
  const SLOT_CHEN = 'slot-2';

  it('FIRST_MATCH: conditional clause (Decisive Assault) wins over unconditional (Harass) when HAVE STACKS = 1', () => {
    const { result } = setupPogranichnik();

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    const pogComboCol = findColumn(result.current, SLOT_POG, NounType.COMBO);

    // Pog ultimate at 0s → 5 Steel Oath stacks
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 0);

    // Consume 4 stacks via combos (leaves exactly 1 stack)
    for (let i = 0; i < 4; i++) {
      const payload = getMenuPayload(result.current, pogComboCol!, (3 + i * 2) * FPS);
      act(() => {
        result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
      });
    }

    // Verify exactly 1 active stack remains
    const steelOathBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.id === STEEL_OATH_ID && ev.ownerId === COMMON_OWNER_ID && !ev.eventStatus,
    );
    expect(steelOathBefore).toHaveLength(1);

    // Now trigger consumption with Chen BS (APPLY PHYSICAL) — should pick Decisive Assault
    const chenPayload1 = getMenuPayload(result.current, chenBattleCol!, 15 * FPS);
    act(() => {
      result.current.handleAddEvent(chenPayload1.ownerId, chenPayload1.columnId, chenPayload1.atFrame, chenPayload1.defaultSkill);
    });
    // Need a second BS to actually create Lift (first only adds Vulnerable)
    const chenPayload2 = getMenuPayload(result.current, chenBattleCol!, 17 * FPS);
    act(() => {
      result.current.handleAddEvent(chenPayload2.ownerId, chenPayload2.columnId, chenPayload2.atFrame, chenPayload2.defaultSkill);
    });

    const allSubStatuses = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID &&
        (ev.id === STEEL_OATH_HARASS_ID || ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID),
    );

    // The last consumption should produce Decisive Assault, not Harass
    // (FIRST_MATCH: clause with HAVE STACKS=1 wins over unconditional Harass clause)
    const assaultFromChen = allSubStatuses.filter(
      (ev) => ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID && ev.startFrame >= 15 * FPS,
    );
    expect(assaultFromChen).toHaveLength(1);

    // Should NOT also produce Harass at the same frame
    const harassAtSameFrame = allSubStatuses.filter(
      (ev) => ev.id === STEEL_OATH_HARASS_ID && ev.startFrame === assaultFromChen[0].startFrame,
    );
    expect(harassAtSameFrame).toHaveLength(0);
  });

  it('FIRST_MATCH: unconditional clause fires when conditional clause HAVE condition fails', () => {
    const { result } = setupPogranichnik();

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Pog ultimate at 0s → 5 Steel Oath stacks
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 0);

    // Single combo at 5s — 5 stacks active, HAVE STACKS=1 fails → Harass fires (not Decisive Assault)
    addComboSkill(result.current, 5 * FPS);

    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);

    const assaultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID,
    );
    expect(assaultEvents).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Fervent Morale — Steel Oath trigger targets TRIGGER operator
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Fervent Morale from Steel Oath targets TRIGGER operator', () => {
  const SLOT_CHEN = 'slot-2';

  it('G1: Chen triggering Steel Oath gains Fervent Morale on Chen, not Pog', () => {
    const { result } = setupPogranichnik();
    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 1 * FPS);

    // Two Chen BSes: first adds Vulnerable, second creates LIFT → triggers Steel Oath
    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(chenBattleCol).toBeDefined();
    act(() => {
      result.current.handleAddEvent(SLOT_CHEN, NounType.BATTLE, 3 * FPS, chenBattleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_CHEN, NounType.BATTLE, 5 * FPS, chenBattleCol!.defaultEvent!);
    });

    // Fervent Morale on Chen (the operator who triggered the physical status)
    const chenMorale = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerId === SLOT_CHEN,
    );
    expect(chenMorale.length).toBeGreaterThanOrEqual(1);

    // Pog should NOT have Fervent Morale from this trigger
    const pogMorale = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerId === SLOT_POG,
    );
    expect(pogMorale).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Living Banner — combo first frame triggers stacks
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Living Banner stacks from combo first frame', () => {
  it('H-2: Pog ult → 5 Steel Oath → combo → Harass + Fervent Morale at first frame, not event-level', () => {
    const { result } = setupPogranichnik();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place ult → Steel Oath stacks
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 0);

    // Place combo at 5s
    addComboSkill(result.current, 5 * FPS);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_POG && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
    const comboStart = comboEvents[0].startFrame;

    const harassEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    const assaultEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID,
    );
    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerId === SLOT_POG,
    );

    // Combo first frame consumes 1 Steel Oath stack → Harass (stacks > 1, not Decisive)
    expect(harassEvents).toHaveLength(1);
    expect(assaultEvents).toHaveLength(0);

    // Fervent Morale on Pog (from combo frame Steel Oath consumption → Tactical Instruction)
    expect(moraleEvents.length).toBeGreaterThanOrEqual(1);

    // All effects happen AFTER combo start (frame-level, not event-level)
    for (const ev of [...harassEvents, ...moraleEvents]) {
      expect(ev.startFrame).toBeGreaterThan(comboStart);
    }
  });

  it('H-1: Pog combo first frame consumes Steel Oath and triggers Fervent Morale (not at event-level)', () => {
    const { result } = setupPogranichnik();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place ult to create Steel Oath
    act(() => { setUltimateEnergyToMax(result.current, SLOT_POG, 3); });
    addUltimate(result.current, 0);

    // Place combo — first FRAME (not event placement) consumes Steel Oath
    addComboSkill(result.current, 5 * FPS);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_POG && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
    const comboStart = comboEvents[0].startFrame;

    // Fervent Morale should exist on Pog (from first frame Steel Oath consumption)
    const pogMorale = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerId === SLOT_POG,
    );
    expect(pogMorale.length).toBeGreaterThanOrEqual(1);

    // Fervent Morale should NOT start at the combo event start (animation segment)
    // It should start at or after the first damage frame offset
    for (const ev of pogMorale) {
      expect(ev.startFrame).toBeGreaterThan(comboStart);
    }

    // Steel Oath should have been consumed (at least 1 stack)
    const steelOathConsumed = result.current.allProcessedEvents.filter(
      ev => ev.id === STEEL_OATH_ID && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(steelOathConsumed.length).toBeGreaterThanOrEqual(1);

    // Harass or Decisive Assault should appear on enemy
    const harassOrAssault = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && (ev.id === STEEL_OATH_HARASS_ID || ev.id === STEEL_OATH_DECISIVE_ASSAULT_ID),
    );
    expect(harassOrAssault.length).toBeGreaterThanOrEqual(1);
  });

  it('H0: Pog combo does NOT trigger Fervent Morale at event-level (only from frame SP recovery)', () => {
    const { result } = setupPogranichnik();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place combo WITHOUT Steel Oath active — no Fervent Morale should appear
    addComboSkill(result.current, 3 * FPS);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_POG && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
    const comboStart = comboEvents[0].startFrame;

    // No Fervent Morale should exist at the combo's start frame (event-level)
    // Fervent Morale only comes from Living Banner threshold (80 SP accumulated)
    const moraleAtComboStart = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID
        && ev.ownerId === SLOT_POG
        && ev.startFrame === comboStart,
    );
    expect(moraleAtComboStart).toHaveLength(0);
  });

  it('H1: Pog combo frames produce 3 independent Living Banner events (5, 7, 13) — status total 25', () => {
    const { result } = setupPogranichnik();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    addComboSkill(result.current, 3 * FPS);

    const bannerEvents = result.current.allProcessedEvents
      .filter(ev => ev.columnId === LIVING_BANNER_ID && ev.ownerId === SLOT_POG)
      .sort((a, b) => a.startFrame - b.startFrame);

    // 3 independent events with own stacks: 5, 7, 13 (status total = 25)
    expect(bannerEvents).toHaveLength(3);
    expect(bannerEvents[0].stacks).toBe(5);
    expect(bannerEvents[1].stacks).toBe(7);
    expect(bannerEvents[2].stacks).toBe(13);
    const total = bannerEvents.reduce((s, ev) => s + (ev.stacks ?? 0), 0);
    expect(total).toBe(25);

    // Combo event-level clause only has RECOVER ULTIMATE_ENERGY — no Living Banner stacks
    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_POG && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
  });
});
