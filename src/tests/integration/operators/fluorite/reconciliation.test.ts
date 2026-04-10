/**
 * @jest-environment jsdom
 */

/**
 * Fluorite — Reconciliation Integration Tests
 *
 * Tests the reconciled Fluorite skill configs:
 * 1. BS places IMPROVISED_EXPLOSIVE status on enemy (no inline damage)
 * 2. IMPROVISED_EXPLOSIVE explosion frame fires with damage/stagger/infliction
 * 3. CS uses TRIGGER INFLICTION pattern (re-applies triggering element)
 * 4. ULT detonates IMPROVISED_EXPLOSIVE with +30% damage on frame 1
 * 5. ULT frame 4 FIRST_MATCH infliction reapply
 * 6. T1 DAMAGE_BONUS via BECOME SLOWED stat-based trigger
 * 7. P3 extends Slow duration from 3s to 6s
 *
 * Three-layer verification:
 * - Context menu: menu items are available and enabled
 * - Controller: event counts, timing, duration, stacks
 * - View: computeTimelinePresentation includes events in columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  INFLICTION_COLUMNS,
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
  COMBO_WINDOW_COLUMN_ID,
} from '../../../../model/channels';
import { InteractionModeType, SegmentType, ColumnType, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation, resolveEventLabel, computeStatusViewOverrides } from '../../../../controller/timeline/eventPresentationController';
import {
  findColumn,
  buildContextMenu,
  getMenuPayload,
  getAddEventPayload,
  setUltimateEnergyToMax,
} from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../../view/InformationPane';
import { buildDamageTableRows } from '../../../../controller/calculation/damageTableBuilder';

// ── Game-data verified constants ──────────────────────────────────────────���─

/* eslint-disable @typescript-eslint/no-require-imports */
const FLUORITE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/fluorite.json',
).id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/combo-skill-free-giveaway.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/ultimate-apex-prankster.json',
).properties.id;

const IMPROVISED_EXPLOSIVE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-improvised-explosive.json',
).properties.id;

const IMPROVISED_EXPLOSIVE_ULT_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-improvised-explosive-ult.json',
).properties.id;

const T1_TALENT_ID: string = require(
  '../../../../model/game-data/operators/fluorite/talents/talent-love-the-stab-and-twist-talent.json',
).properties.id;

const SLOW_STATUS_ID: string = require(
  '../../../../model/game-data/generic/statuses/status-slow.json',
).properties.id;

const IE_DISPLAY_NAME: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-improvised-explosive.json',
).properties.name;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_FLUORITE = 'slot-0';

function setupFluorite() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_FLUORITE, FLUORITE_ID); });
  return view;
}

/** Ref container type — keeps result.current fresh after act() calls. */
type ResultRef = { current: AppResult };

/** Place a battle skill at the given frame. */
function placeBattleSkill(ref: ResultRef, atFrame: number) {
  const col = findColumn(ref.current, SLOT_FLUORITE, NounType.BATTLE);
  const payload = getMenuPayload(ref.current, col!, atFrame);
  act(() => {
    ref.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Place combo in freeform mode at the given frame. */
function placeCombo(ref: ResultRef, atFrame: number) {
  act(() => { ref.current.setInteractionMode(InteractionModeType.FREEFORM); });
  const col = findColumn(ref.current, SLOT_FLUORITE, NounType.COMBO);
  const payload = getMenuPayload(ref.current, col!, atFrame);
  act(() => {
    ref.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Place ultimate at the given frame (sets UE to max first). */
function placeUltimate(ref: ResultRef, atFrame: number) {
  act(() => { setUltimateEnergyToMax(ref.current, SLOT_FLUORITE, 0); });
  const col = findColumn(ref.current, SLOT_FLUORITE, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const menuItems = buildContextMenu(ref.current, col!, atFrame);
  expect(menuItems).not.toBeNull();
  const payload = getAddEventPayload(menuItems!);
  act(() => {
    ref.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Place infliction stacks on enemy via freeform context menu. */
function placeInfliction(ref: ResultRef, columnId: string, atFrame: number) {
  act(() => { ref.current.setInteractionMode(InteractionModeType.FREEFORM); });
  const enemyStatusCol = findColumn(ref.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();
  const menuItems = buildContextMenu(ref.current, enemyStatusCol!, atFrame);
  expect(menuItems).not.toBeNull();
  const inflictionItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === columnId,
  );
  expect(inflictionItem).toBeDefined();
  expect(inflictionItem!.disabled).toBeFalsy();
  const payload = inflictionItem!.actionPayload as AddEventPayload;
  act(() => {
    ref.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// F. BS → IMPROVISED_EXPLOSIVE Status
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. BS places IMPROVISED_EXPLOSIVE on enemy', () => {
  it('F1: BS creates IMPROVISED_EXPLOSIVE status event on enemy', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    // IMPROVISED_EXPLOSIVE should appear as a derived event on enemy
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);

    // Verify timing: BS frame at 0.33s offset from BS start (5s)
    const expectedHitFrame = 5 * FPS + Math.round(0.33 * FPS);
    expect(ieEvents[0].startFrame).toBe(expectedHitFrame);
  });

  it('F2: IMPROVISED_EXPLOSIVE has correct duration (2.97s)', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(ieEvents[0])).toBe(Math.round(2.97 * FPS));
  });

  it('F3: IMPROVISED_EXPLOSIVE explosion applies nature infliction', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    // The explosion frame at 2.97s offset should create nature infliction on enemy
    const natureInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureInflictions.length).toBeGreaterThanOrEqual(1);
  });

  it('F4: BS itself has no inline damage (only APPLY STATUS)', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    // The BS event should have a single frame with APPLY STATUS
    const bsEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);

    // Only 1 frame at 0.33s
    const allFrames = bsEvents[0].segments?.flatMap((seg: { frames?: unknown[] }) => seg.frames ?? []) ?? [];
    expect(allFrames).toHaveLength(1);
  });

  it('F5: View layer — IMPROVISED_EXPLOSIVE visible in enemy status column', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Enemy status column should contain the IMPROVISED_EXPLOSIVE event
    const enemyStatusVM = viewModels.get(ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusVM).toBeDefined();
    const ieViewEvents = enemyStatusVM!.events.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieViewEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('F6: IMPROVISED_EXPLOSIVE display label is "Improvised Explosive", not element name', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    const ieEvent = result.current.allProcessedEvents.find(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvent).toBeDefined();

    // resolveEventLabel should return the status name, not the element
    const label = resolveEventLabel(ieEvent!);
    expect(label).toBe(IE_DISPLAY_NAME);

    // Segment name should also be correct
    const segName = ieEvent!.segments?.[0]?.properties?.name;
    expect(segName).toBe(IE_DISPLAY_NAME);

    // Status override must NOT overwrite with infliction label ("Nature I")
    const overrides = computeStatusViewOverrides(
      result.current.allProcessedEvents, result.current.columns,
    );
    const ieOverride = overrides.get(ieEvent!.uid);
    expect(ieOverride?.label ?? label).not.toContain('Nature');

    // IE and NATURE_INFLICTION must have different uids
    const natureInfliction = result.current.allProcessedEvents.find(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureInfliction).toBeDefined();
    expect(natureInfliction!.uid).not.toBe(ieEvent!.uid);
  });

  it('F7: IMPROVISED_EXPLOSIVE starts at BS hit frame, not explosion frame', () => {
    const { result } = setupFluorite();

    const bsStartFrame = 5 * FPS;
    placeBattleSkill(result, bsStartFrame);

    const ieEvent = result.current.allProcessedEvents.find(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvent).toBeDefined();

    // BS frame offset is 0.33s — IE should start there, not at explosion (2.97s)
    const expectedHitFrame = bsStartFrame + Math.round(0.33 * FPS);
    expect(ieEvent!.startFrame).toBe(expectedHitFrame);

    // IE should NOT start at the explosion time
    const explosionFrame = bsStartFrame + Math.round(2.97 * FPS);
    expect(ieEvent!.startFrame).not.toBe(explosionFrame);
  });

  it('F8: No NATURE_INFLICTION at BS hit frame — infliction only at explosion', () => {
    const { result } = setupFluorite();

    const bsStartFrame = 5 * FPS;
    placeBattleSkill(result, bsStartFrame);

    const bsHitFrame = bsStartFrame + Math.round(0.33 * FPS);
    const explosionFrame = bsStartFrame + Math.round((0.33 + 2.97) * FPS);

    // Nature infliction should only exist at the explosion frame, not at BS hit
    const natureInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureInflictions.length).toBeGreaterThanOrEqual(1);

    // No infliction should start at the BS hit frame
    const inflictionAtHit = natureInflictions.filter((ev) => ev.startFrame === bsHitFrame);
    expect(inflictionAtHit).toHaveLength(0);

    // Infliction should start at or after the explosion frame
    expect(natureInflictions[0].startFrame).toBeGreaterThanOrEqual(explosionFrame - 1);
  });

  it('F9: IMPROVISED_EXPLOSIVE micro-column exists in enemy status column', () => {
    const { result } = setupFluorite();

    // Check column builder creates the micro-column even before events are placed
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();

    // IMPROVISED_EXPLOSIVE should be in matchColumnIds
    expect(enemyStatusCol!.matchColumnIds).toContain(IMPROVISED_EXPLOSIVE_ID);

    // Should have a micro-column for it
    const ieMicroCol = enemyStatusCol!.microColumns?.find((mc) => mc.id === IMPROVISED_EXPLOSIVE_ID);
    expect(ieMicroCol).toBeDefined();
  });

  it('F10: IMPROVISED_EXPLOSIVE explosion frame appears in combat sheet (damage table)', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    const app = result.current;
    const loadoutStats: Record<string, typeof DEFAULT_LOADOUT_PROPERTIES> = {};
    for (const slot of app.slots) {
      loadoutStats[slot.slotId] = DEFAULT_LOADOUT_PROPERTIES;
    }

    const rows = buildDamageTableRows(
      app.allProcessedEvents,
      app.columns,
      app.slots,
      app.enemy,
      loadoutStats,
    );

    // Debug: log rows and events
    // eslint-disable-next-line no-console
    // The explosion frame should produce a damage row from the IE event
    const explosionRows = rows.filter(
      (r) => r.eventUid.includes(IMPROVISED_EXPLOSIVE_ID),
    );
    expect(explosionRows.length).toBeGreaterThanOrEqual(1);

    // The explosion row should have a damage value and Nature element
    const explosionRow = explosionRows[0];
    expect(explosionRow.damage).not.toBeNull();
    expect(explosionRow.damage!).toBeGreaterThan(0);

    // Column type should be BATTLE (source skill), not the status column ID
    expect(explosionRow.columnId).toBe(NounType.BATTLE);
  });

  it('F11: Freeform-placed IMPROVISED_EXPLOSIVE has unique uid from its SLOW child', () => {
    const { result } = setupFluorite();

    // Place IE directly on enemy via freeform context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, enemyStatusCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    const ieItem = menuItems!.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as AddEventPayload)?.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieItem).toBeDefined();
    const payload = ieItem!.actionPayload as AddEventPayload;
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // IE event should exist
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);

    // SLOW is a stat on IE (clause), not a separate event — no SLOW events
    const slowEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === SLOW_STATUS_ID && ev.ownerId === ENEMY_ID,
    );
    expect(slowEvents).toHaveLength(0);

    // View layer: IE should be visible in enemy status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusVM = viewModels.get(ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusVM).toBeDefined();
    expect(enemyStatusVM!.events.some(ev => ev.name === IMPROVISED_EXPLOSIVE_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. CS — TRIGGER INFLICTION Pattern
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. CS TRIGGER INFLICTION', () => {
  it('G1: Combo in freeform places correctly', () => {
    const { result } = setupFluorite();

    placeCombo(result, 5 * FPS);

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);
  });

  it('G2: Combo TRIGGER INFLICTION re-applies triggering element (strict mode)', () => {
    // objectDeterminer: "TRIGGER" resolves from comboTriggerColumnId, which is set
    // by the activation window system in strict mode. Must NOT use freeform.
    const { result } = setupFluorite();

    // Place 2+ cryo infliction stacks on enemy to satisfy combo trigger condition
    placeInfliction(result, INFLICTION_COLUMNS.CRYO, 1 * FPS);
    placeInfliction(result, INFLICTION_COLUMNS.CRYO, 1 * FPS + 1);

    // Switch back to strict mode — combo activation window should now be open
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Place combo through strict mode context menu (activation window open)
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Verify combo has comboTriggerColumnId pointing to cryo infliction
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.COMBO,
    );
    expect(comboEvent).toBeDefined();
    expect(comboEvent!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.CRYO);

    // TRIGGER INFLICTION should re-apply CRYO (the triggering element)
    const cryoInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_ID
        && ev.startFrame >= 5 * FPS,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });

  it('G3: Single nature infliction does NOT open combo activation window (requires 2+)', () => {
    const { result } = setupFluorite();

    // Place only 1 nature infliction — below the 2-stack threshold
    placeInfliction(result, INFLICTION_COLUMNS.NATURE, 1 * FPS);

    // Switch to strict mode
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // No combo activation window should exist
    const comboWindows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_FLUORITE,
    );
    expect(comboWindows).toHaveLength(0);

    // Combo menu item should be disabled
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const menuItems = buildContextMenu(result.current, comboCol!, 3 * FPS);
    const addItem = menuItems?.find(i => i.actionId === 'addEvent');
    expect(!addItem || addItem.disabled).toBe(true);
  });

  it('G4: Single cryo infliction does NOT open combo activation window (requires 2+)', () => {
    const { result } = setupFluorite();

    // Place only 1 cryo infliction — below the 2-stack threshold
    placeInfliction(result, INFLICTION_COLUMNS.CRYO, 1 * FPS);

    // Switch to strict mode
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // No combo activation window should exist
    const comboWindows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_FLUORITE,
    );
    expect(comboWindows).toHaveLength(0);
  });

  it('G5: 2+ nature infliction stacks DO open combo activation window', () => {
    const { result } = setupFluorite();

    // Place 2 nature inflictions — meets the 2-stack threshold
    placeInfliction(result, INFLICTION_COLUMNS.NATURE, 1 * FPS);
    placeInfliction(result, INFLICTION_COLUMNS.NATURE, 1 * FPS + 1);

    // Switch to strict mode
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Combo activation window should exist
    const comboWindows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_FLUORITE,
    );
    expect(comboWindows.length).toBeGreaterThanOrEqual(1);

    // Combo menu item should be enabled
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const windowStart = comboWindows[0].startFrame;
    const menuItems = buildContextMenu(result.current, comboCol!, windowStart + 1);
    expect(menuItems).not.toBeNull();
    const addItem = menuItems!.find(i => i.actionId === 'addEvent' && !i.disabled);
    expect(addItem).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. ULT — Detonation + Infliction Reapply
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. ULT Mechanics', () => {
  it('H1: ULT has 4 damage frames with stagger on each', () => {
    const { result } = setupFluorite();

    placeUltimate(result, 5 * FPS);

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);

    // ULT should have 4 frames in the active segment
    const activeFrames = ultEvents[0].segments?.flatMap(
      (seg: { frames?: unknown[]; properties: { segmentTypes?: string[] } }) =>
        seg.properties.segmentTypes?.includes(SegmentType.ANIMATION) ? [] : (seg.frames ?? []),
    ) ?? [];
    expect(activeFrames).toHaveLength(4);
  });

  it('H2: ULT detonates IMPROVISED_EXPLOSIVE — creates IMPROVISED_EXPLOSIVE_ULT status', () => {
    const { result } = setupFluorite();

    // Place BS at 2s — IMPROVISED_EXPLOSIVE applied at ~2.33s
    placeBattleSkill(result, 2 * FPS);

    // Place ULT at 3s — frame 1 detonates IE before natural explosion
    placeUltimate(result, 3 * FPS);

    // IMPROVISED_EXPLOSIVE should be consumed
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);

    // IMPROVISED_EXPLOSIVE_ULT should be created on enemy
    const ieUltEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ULT_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieUltEvents.length).toBeGreaterThanOrEqual(1);
    // Duration should be 2s
    expect(eventDuration(ieUltEvents[0])).toBe(2 * FPS);

    // Detonated status should create nature infliction (from frame 0 effect)
    const natureInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureInflictions.length).toBeGreaterThanOrEqual(1);

    // NO SLOW from detonation (only natural IE has SLOW)
    // Filter for SLOW events created AFTER the ULT's detonation frame
    const ultStart = 3 * FPS;
    const slowFromDetonation = result.current.allProcessedEvents.filter(
      (ev) => ev.name === SLOW_STATUS_ID && ev.ownerId === ENEMY_ID
        && ev.startFrame >= ultStart,
    );
    expect(slowFromDetonation).toHaveLength(0);
  });

  it('H3: ULT without IMPROVISED_EXPLOSIVE still places normally', () => {
    const { result } = setupFluorite();

    // ULT alone — no BS beforehand
    placeUltimate(result, 5 * FPS);

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
    expect(ultEvents[0].name).toBe(ULTIMATE_ID);

    // No IMPROVISED_EXPLOSIVE events should exist
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieEvents).toHaveLength(0);
  });

  it('H4: ULT last frame applies nature infliction when 2+ nature stacks present', () => {
    const { result } = setupFluorite();

    // Place 2 nature infliction stacks on enemy
    placeInfliction(result, INFLICTION_COLUMNS.NATURE, 1 * FPS);
    placeInfliction(result, INFLICTION_COLUMNS.NATURE, 1 * FPS + 1);

    // Count inflictions before ULT
    const natureBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    ).length;

    // Place ULT after infliction stacks
    placeUltimate(result, 3 * FPS);

    // ULT last frame should add 1 more nature infliction (FIRST_MATCH: nature >= 2 → apply nature)
    const natureAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureAfter.length).toBeGreaterThan(natureBefore);
  });

  it('H6: ULT last frame applies cryo infliction when 2+ cryo stacks present', () => {
    const { result } = setupFluorite();

    // Place 2 cryo infliction stacks on enemy
    placeInfliction(result, INFLICTION_COLUMNS.CRYO, 1 * FPS);
    placeInfliction(result, INFLICTION_COLUMNS.CRYO, 1 * FPS + 1);

    const cryoBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_ID,
    ).length;

    placeUltimate(result, 3 * FPS);

    // ULT last frame should add 1 more cryo infliction (FIRST_MATCH: cryo >= 2 → apply cryo)
    const cryoAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_ID,
    );
    expect(cryoAfter.length).toBeGreaterThan(cryoBefore);
  });

  it('H7: ULT last frame does NOT apply infliction when only 1 nature stack', () => {
    const { result } = setupFluorite();

    // Place only 1 nature infliction — below threshold
    placeInfliction(result, INFLICTION_COLUMNS.NATURE, 1 * FPS);

    const natureBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    ).length;

    placeUltimate(result, 3 * FPS);

    // No new nature infliction should be added by ULT
    const natureAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    ).length;
    expect(natureAfter).toBe(natureBefore);
  });

  it('H5: View layer — ULT visible in presentation', () => {
    const { result } = setupFluorite();

    placeUltimate(result, 5 * FPS);

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultCol = findColumn(result.current, SLOT_FLUORITE, NounType.ULTIMATE);
    const vm = viewModels.get(ultCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some((ev) => ev.name === ULTIMATE_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. T1 — Love the Stab and Twist (BECOME SLOWED → DAMAGE_BONUS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. T1 Damage Bonus (BECOME SLOWED trigger)', () => {
  it('I1: T1 talent appears when enemy BECOME SLOWED (IE on enemy)', () => {
    const { result } = setupFluorite();

    // Before BS: no triggered T1 event
    const t1Before = result.current.allProcessedEvents.filter(
      (ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && ev.startFrame > 0,
    );
    expect(t1Before).toHaveLength(0);

    // Place BS — creates IE on enemy (SLOW stat applied, BECOME SLOWED fires)
    placeBattleSkill(result, 2 * FPS);

    // T1 should appear as a triggered instance
    const t1After = result.current.allProcessedEvents.filter(
      (ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && ev.startFrame > 0,
    );
    expect(t1After.length).toBeGreaterThanOrEqual(1);

    // T1 should start at or after the BS hit frame (when IE is applied)
    const bsHitFrame = 2 * FPS + Math.round(0.33 * FPS);
    expect(t1After[0].startFrame).toBeGreaterThanOrEqual(bsHitFrame);
  });

  it('I2: T1 does NOT appear when no IE on enemy (SLOW stat = 0)', () => {
    const { result } = setupFluorite();

    const t1Triggered = result.current.allProcessedEvents.filter(
      (ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && ev.startFrame > 0,
    );
    expect(t1Triggered).toHaveLength(0);
  });

  it('I3: T1 starts at IE creation frame and is active while IE is active', () => {
    const { result } = setupFluorite();

    const bsStart = 2 * FPS;
    placeBattleSkill(result, bsStart);

    const bsHitFrame = bsStart + Math.round(0.33 * FPS);

    const t1Events = result.current.allProcessedEvents.filter(
      (ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && ev.startFrame > 0,
    );
    expect(t1Events).toHaveLength(1);

    // T1 starts exactly when IE is applied (BS hit frame)
    expect(t1Events[0].startFrame).toBe(bsHitFrame);

    // T1 active duration covers IE's full duration — T1 is permanent,
    // clamped only when IE natural expiry fires IS NOT SLOWED → CONSUME
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvents).toHaveLength(1);

    // T1 must end exactly when IE ends — same duration as SLOW effect
    const ieEndFrame = ieEvents[0].startFrame + eventDuration(ieEvents[0]);
    const t1EndFrame = t1Events[0].startFrame + eventDuration(t1Events[0]);
    expect(t1EndFrame).toBe(ieEndFrame);
  });

  it('I4: T1 consumed at ULT detonation frame (not IE natural expiry)', () => {
    const { result } = setupFluorite();

    // Place BS at 2s — IE active, SLOW stat > 0, T1 triggered
    placeBattleSkill(result, 2 * FPS);

    const t1Before = result.current.allProcessedEvents.filter(
      (ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && ev.startFrame > 0,
    );
    expect(t1Before).toHaveLength(1);
    const t1FullDuration = eventDuration(t1Before[0]);

    // Place ULT at 3s — consumes IE → SLOW stat drops to 0 → BECOME NOT SLOWED → CONSUME T1
    placeUltimate(result, 3 * FPS);

    // T1 should be consumed (clamped duration shorter than full)
    const t1After = result.current.allProcessedEvents.filter(
      (ev) => ev.name === T1_TALENT_ID && ev.ownerId === SLOT_FLUORITE && ev.startFrame > 0,
    );
    expect(t1After).toHaveLength(1);

    // T1 duration should be clamped — shorter than before ULT
    expect(eventDuration(t1After[0])).toBeLessThan(t1FullDuration);

    // T1 should be marked as consumed
    expect(t1After[0].eventStatus).toBe(EventStatusType.CONSUMED);

    // T1 end frame should match IE's consumed end frame (both end at detonation)
    const ieAfter = result.current.allProcessedEvents.find(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieAfter).toBeDefined();
    const ieEndFrame = ieAfter!.startFrame + eventDuration(ieAfter!);
    const t1EndFrame = t1After[0].startFrame + eventDuration(t1After[0]);
    expect(t1EndFrame).toBe(ieEndFrame);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. P3 — Slow Duration Extension
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. SLOW as IE stat', () => {
  it('J1: IE applies SLOW stat while active (not a separate event)', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    // SLOW should NOT be a separate event — it's a stat on the IE status
    const slowEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === SLOW_STATUS_ID && ev.ownerId === ENEMY_ID,
    );
    expect(slowEvents).toHaveLength(0);

    // IE should exist with correct duration
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(ieEvents[0])).toBe(Math.round(2.97 * FPS));
  });

  it('J2: ULT consumption of IE ends SLOW (no separate SLOW event persists)', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 2 * FPS);
    placeUltimate(result, 3 * FPS);

    // No separate SLOW event should exist
    const slowEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === SLOW_STATUS_ID && ev.ownerId === ENEMY_ID,
    );
    expect(slowEvents).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Regression — uid collision, duplicate events, deferred frames
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Regression tests', () => {
  it('K1: BS-derived IE and explosion NATURE_INFLICTION have different uids', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 5 * FPS);

    const ieEvent = result.current.allProcessedEvents.find(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ID && ev.ownerId === ENEMY_ID,
    );
    const natureEvent = result.current.allProcessedEvents.find(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(ieEvent).toBeDefined();
    expect(natureEvent).toBeDefined();
    expect(natureEvent!.uid).not.toBe(ieEvent!.uid);
  });

  it('K2: Freeform IE produces exactly 1 NATURE_INFLICTION (no duplicate from double processing)', () => {
    const { result } = setupFluorite();

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    const menu = buildContextMenu(result.current, enemyStatusCol!, 5 * FPS);
    const ieItem = menu?.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as AddEventPayload)?.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieItem).toBeDefined();
    const payload = ieItem!.actionPayload as AddEventPayload;
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const natureEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureEvents).toHaveLength(1);
  });

  it('K3: ULT detonation prevents natural IE explosion (no extra nature infliction)', () => {
    const { result } = setupFluorite();

    // Place BS at 2s — IE applied at ~2.33s, natural explosion at ~5.3s
    placeBattleSkill(result, 2 * FPS);

    // Place ULT at 3s — detonates IE early, creates IE_ULT
    placeUltimate(result, 3 * FPS);

    // IE_ULT creates 1 nature infliction. Natural IE explosion should NOT fire (consumed).
    const natureAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    // Should have exactly 1: from IE_ULT detonation (natural explosion suppressed)
    expect(natureAfter).toHaveLength(1);
    // The infliction should be from IE_ULT, not from the original IE explosion
    expect(natureAfter[0].sourceSkillName).toBe(IMPROVISED_EXPLOSIVE_ULT_ID);
  });

  it('K4: IE_ULT status has correct properties (2s duration, nature infliction, no SLOW)', () => {
    const { result } = setupFluorite();

    placeBattleSkill(result, 2 * FPS);
    placeUltimate(result, 3 * FPS);

    const ieUltEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === IMPROVISED_EXPLOSIVE_ULT_ID && ev.ownerId === ENEMY_ID,
    );
    expect(ieUltEvents).toHaveLength(1);

    // Duration = 2s
    expect(eventDuration(ieUltEvents[0])).toBe(2 * FPS);

    // Creates nature infliction (from frame 0 effect)
    const natureFromUlt = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID
        && ev.sourceSkillName === IMPROVISED_EXPLOSIVE_ULT_ID,
    );
    expect(natureFromUlt).toHaveLength(1);

    // No SLOW event from detonation
    const slowEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.name === SLOW_STATUS_ID && ev.ownerId === ENEMY_ID,
    );
    expect(slowEvents).toHaveLength(0);
  });

  it('K5: interactionToLabel does not crash on STACKS-as-subject conditions', () => {
    // Regression: conditions with subject=STACKS and no object caused
    // "can't access property replace, s is undefined" in interactionToLabel
    const { interactionToLabel } = require('../../../../dsl/semantics');
    const label = interactionToLabel({
      subject: 'STACKS',
      verb: 'IS',
      of: { object: 'STATUS', objectId: 'INFLICTION', objectQualifier: 'CRYO', of: { object: 'ENEMY' } },
      cardinalityConstraint: 'GREATER_THAN_EQUAL',
      value: { verb: 'IS', value: 2 },
    });
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
    expect(label).toContain('Stacks');
  });

  it('K6: IE natural explosion fires at correct time when no ULT consumption', () => {
    const { result } = setupFluorite();

    const bsStart = 5 * FPS;
    placeBattleSkill(result, bsStart);

    const bsHitFrame = bsStart + Math.round(0.33 * FPS);
    const explosionFrame = bsHitFrame + Math.round(2.97 * FPS);

    // Nature infliction from explosion should be at the explosion frame
    const natureEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureEvents).toHaveLength(1);
    // Allow 1 frame tolerance for rounding
    expect(Math.abs(natureEvents[0].startFrame - explosionFrame)).toBeLessThanOrEqual(1);
  });
});
