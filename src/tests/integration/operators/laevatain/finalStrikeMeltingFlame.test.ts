/**
 * @jest-environment jsdom
 */

/**
 * Final Strike → Melting Flame → Scorching Heart — Integration Tests
 *
 * Tests the cross-operator interaction: Akekuri's battle skills apply heat
 * inflictions, then a basic attack's Final Strike triggers Laevatain's
 * Scorching Heart talent to absorb heat → create Melting Flame stacks.
 * At 4 MF stacks, Scorching Heart effect activates.
 *
 * All events are added through the context menu flow.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { buildColumnContextMenu, ColumnContextMenuContext } from '../../../../controller/timeline/contextMenuController';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { ColumnType, InteractionModeType, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline, ContextMenuItem } from '../../../../consts/viewTypes';
import { getEnabledStatusEvents } from '../../../../controller/gameDataStore';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';

/* eslint-disable @typescript-eslint/no-require-imports */
const MF_COLUMN_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const SH_COLUMN_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-scorching-heart.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

// ── Helpers ──────────────────────────────────────────────────────────────────

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function buildContextMenu(
  app: ReturnType<typeof useApp>,
  col: MiniTimeline,
  atFrame: number,
) {
  const ctx: ColumnContextMenuContext = {
    events: app.allProcessedEvents,
    slots: app.slots,
    resourceGraphs: app.resourceGraphs,
    alwaysAvailableComboSlots: new Set(),
    timeStopRegions: [],
    staggerBreaks: app.staggerBreaks,
    columnPositions: new Map(),
    interactionMode: app.interactionMode,
  };
  return buildColumnContextMenu(col, atFrame, undefined, ctx);
}

function executeAddFromMenu(
  app: ReturnType<typeof useApp>,
  menuItems: ContextMenuItem[],
) {
  const item = menuItems.find(i => i.actionId === 'addEvent');
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();
  const payload = item!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof app.handleAddEvent>[3] };
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getHeatInflictions(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
  );
}

function getMeltingFlameEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === MF_COLUMN_ID && ev.ownerId === SLOT_LAEVATAIN,
  );
}

function findStatusColumn(app: ReturnType<typeof useApp>) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === SLOT_LAEVATAIN &&
      c.columnId === 'operator-status',
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Single BS + BATK — exchange timing
// ═════════════════════════════════════════════════════════════════════════════

describe('Final Strike → Melting Flame exchange timing', () => {
  it('MF is generated at the final strike frame, not at basic attack start', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Context menu: add Akekuri battle skill at 2s
    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const battleMenu = buildContextMenu(result.current, battleCol!, 2 * FPS);
    expect(battleMenu).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, battleMenu!); });

    // Controller: heat infliction exists
    const heatsAfterBattle = getHeatInflictions(result.current);
    expect(heatsAfterBattle.length).toBeGreaterThanOrEqual(1);

    // Context menu: add Akekuri basic attack at 5s
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    const basicStartFrame = 5 * FPS;
    const basicMenu = buildContextMenu(result.current, basicCol!, basicStartFrame);
    expect(basicMenu).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, basicMenu!); });

    // Controller: heat consumed, MF generated
    const consumedHeats = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedHeats.length).toBeGreaterThanOrEqual(1);

    const mfEvents = getMeltingFlameEvents(result.current);
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);

    // Key assertion: MF starts AFTER basic attack start (at Final Strike frame)
    expect(mfEvents[0].startFrame).toBeGreaterThan(basicStartFrame);
  });

  it('without basic attack final strike, no exchange occurs from battle skill alone', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Context menu: add only the battle skill
    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const menu = buildContextMenu(result.current, battleCol!, 2 * FPS);
    expect(menu).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, menu!); });

    // Controller: heat exists but no MF (no final strike to trigger absorption)
    expect(getHeatInflictions(result.current).length).toBeGreaterThanOrEqual(1);
    expect(getMeltingFlameEvents(result.current)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. 4 BS + BATK → MF IV → Scorching Heart
// ═════════════════════════════════════════════════════════════════════════════

describe('4 Akekuri BS + BATK Final Strike → Melting Flame IV → Scorching Heart', () => {
  it('4 battle skills + 1 basic attack produces 4 MF stacks and triggers Scorching Heart', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(battleCol).toBeDefined();
    expect(basicCol).toBeDefined();

    // Context menu: add 4 battle skills, spaced 5s apart
    for (let i = 0; i < 4; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }

    // Controller: 4 heat inflictions on enemy, no MF yet
    expect(getHeatInflictions(result.current)).toHaveLength(4);
    expect(getMeltingFlameEvents(result.current)).toHaveLength(0);

    // Context menu: add basic attack at 25s (Final Strike on last segment)
    const basicMenu = buildContextMenu(result.current, basicCol!, 25 * FPS);
    expect(basicMenu).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, basicMenu!); });

    // Controller: all 4 heats consumed
    const consumedHeats = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedHeats).toHaveLength(4);

    // Controller: 4 MF stacks on Laevatain
    const mfEvents = getMeltingFlameEvents(result.current);
    expect(mfEvents).toHaveLength(4);

    // Controller: Scorching Heart activates (MF reached max 4 stacks)
    const shEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SH_COLUMN_ID && ev.ownerId === SLOT_LAEVATAIN,
    );
    expect(shEvents).toHaveLength(1);
    expect(eventDuration(shEvents[0])).toBe(20 * FPS);

    // View: Laevatain status column has MF and SH micro-columns
    const statusCol = findStatusColumn(result.current);
    expect(statusCol).toBeDefined();
    const microIds = new Set(statusCol!.microColumns!.map(mc => mc.id));
    expect(microIds.has(MF_COLUMN_ID)).toBe(true);
    expect(microIds.has(SH_COLUMN_ID)).toBe(true);

    // View: MF events route to MF micro-column
    for (const ev of mfEvents) {
      expect(ev.columnId).toBe(MF_COLUMN_ID);
      expect(microIds.has(ev.columnId)).toBe(true);
    }

    // View: SH event routes to SH micro-column
    expect(shEvents[0].columnId).toBe(SH_COLUMN_ID);
    expect(microIds.has(shEvents[0].columnId)).toBe(true);

    // View: SH status config exists in game data
    const laevatainStatuses = getEnabledStatusEvents('LAEVATAIN');
    const shStatus = laevatainStatuses.find(s => s.id === SH_COLUMN_ID);
    expect(shStatus).toBeDefined();

    // View: ColumnViewModel has MF and SH events (what EventBlock renders from)
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusViewModel = viewModels.get(statusCol!.key);
    expect(statusViewModel).toBeDefined();

    // MF events appear in the status column view model
    const vmMfEvents = statusViewModel!.events.filter(ev => ev.columnId === MF_COLUMN_ID);
    expect(vmMfEvents).toHaveLength(4);

    // SH event appears in the status column view model
    const vmShEvents = statusViewModel!.events.filter(ev => ev.columnId === SH_COLUMN_ID);
    expect(vmShEvents).toHaveLength(1);

    // MF events have micro-column positions assigned (drives EventBlock placement)
    for (const ev of vmMfEvents) {
      expect(statusViewModel!.microPositions.has(ev.uid)).toBe(true);
    }

    // SH event has micro-column position assigned
    expect(statusViewModel!.microPositions.has(vmShEvents[0].uid)).toBe(true);
  });

  it('3 battle skills + 1 basic attack produces 3 MF but no Scorching Heart', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);

    // Context menu: 3 battle skills
    for (let i = 0; i < 3; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }

    // Context menu: basic attack at 20s
    const basicMenu = buildContextMenu(result.current, basicCol!, 20 * FPS);
    expect(basicMenu).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, basicMenu!); });

    // Controller: 3 MF stacks, below threshold
    expect(getMeltingFlameEvents(result.current)).toHaveLength(3);

    // Controller: no Scorching Heart
    const shEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SH_COLUMN_ID && ev.ownerId === SLOT_LAEVATAIN,
    );
    expect(shEvents).toHaveLength(0);

    // View: status column still has MF micro-column but no SH events
    const statusCol = findStatusColumn(result.current);
    expect(statusCol).toBeDefined();
    const microIds = new Set(statusCol!.microColumns!.map(mc => mc.id));
    expect(microIds.has(MF_COLUMN_ID)).toBe(true);
  });
});
