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
import { INFLICTION_COLUMNS, ENEMY_ID } from '../../../../model/channels';
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
      c.ownerEntityId === slotId &&
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
  const payload = item!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof app.handleAddEvent>[3] };
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getHeatInflictions(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
  );
}

function getMeltingFlameEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === MF_COLUMN_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
  );
}

function findStatusColumn(app: ReturnType<typeof useApp>) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === SLOT_LAEVATAIN &&
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
      (ev) => ev.columnId === SH_COLUMN_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
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
      (ev) => ev.columnId === SH_COLUMN_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(shEvents).toHaveLength(0);

    // View: status column still has MF micro-column but no SH events
    const statusCol = findStatusColumn(result.current);
    expect(statusCol).toBeDefined();
    const microIds = new Set(statusCol!.microColumns!.map(mc => mc.id));
    expect(microIds.has(MF_COLUMN_ID)).toBe(true);
  });

  it('Akekuri BS + Laevatain finisher BATK consumes heats and creates MF (FINISHER trigger path)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const laevBasicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(battleCol).toBeDefined();
    expect(laevBasicCol).toBeDefined();

    // 2 Akekuri BS → 2 heats on enemy
    for (let i = 0; i < 2; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    expect(getHeatInflictions(result.current)).toHaveLength(2);

    // Laevatain finisher BA via eventVariants
    const finisherVariant = laevBasicCol!.eventVariants?.find((v) => v.id === NounType.FINISHER);
    expect(finisherVariant).toBeDefined();
    const basicMenu = buildContextMenu(result.current, laevBasicCol!, 15 * FPS);
    expect(basicMenu).not.toBeNull();
    const finisherItem = basicMenu!.find(
      (i) => i.actionId === 'addEvent' && i.label === (finisherVariant as { displayName?: string; name?: string }).displayName,
    ) ?? basicMenu!.find(
      (i) => i.actionId === 'addEvent' && (i.actionPayload as { defaultSkill?: { id?: string } }).defaultSkill?.id === finisherVariant!.id,
    );
    expect(finisherItem).toBeDefined();
    const payload = finisherItem!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof result.current.handleAddEvent>[3] };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Heats consumed by FINISHER trigger
    const consumedHeats = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedHeats.length).toBeGreaterThanOrEqual(2);

    // MF created
    expect(getMeltingFlameEvents(result.current).length).toBeGreaterThanOrEqual(2);
  });

  it('after MF reaches cap, additional heat inflictions are not consumed by the next final strike', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(battleCol).toBeDefined();
    expect(basicCol).toBeDefined();

    // Phase 1: build 4 MF stacks via 4 BS + 1 BATK
    for (let i = 0; i < 4; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const basicMenu1 = buildContextMenu(result.current, basicCol!, 25 * FPS);
    expect(basicMenu1).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, basicMenu1!); });

    // MF is now capped at 4
    expect(getMeltingFlameEvents(result.current)).toHaveLength(4);

    // Phase 2: add 2 more BS to create new heat inflictions
    for (let i = 0; i < 2; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (35 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }

    // New heat inflictions exist on enemy
    const heatsBeforeSecondBatk = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(heatsBeforeSecondBatk.length).toBeGreaterThanOrEqual(1);

    // Phase 3: second basic attack — Final Strike fires but MF cap blocks exchange
    const basicMenu2 = buildContextMenu(result.current, basicCol!, 50 * FPS);
    expect(basicMenu2).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, basicMenu2!); });

    // MF still exactly 4 (no new stacks)
    expect(getMeltingFlameEvents(result.current)).toHaveLength(4);

    // New heat inflictions survive — ALL pre-validation blocks CONSUME when APPLY MF would exceed cap
    const heatsAfterSecondBatk = getHeatInflictions(result.current).filter(
      (ev) => ev.startFrame >= 35 * FPS && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(heatsAfterSecondBatk.length).toBeGreaterThanOrEqual(1);
  });

  it('MF=3 + 2 heats + finisher: only 1 heat consumed (heat goes 2→1, MF goes 3→4)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const akekuriBasicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    const laevBasicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(battleCol).toBeDefined();
    expect(akekuriBasicCol).toBeDefined();
    expect(laevBasicCol).toBeDefined();

    // Phase 1: build MF=3 via 3 BS + 1 final-strike BATK
    for (let i = 0; i < 3; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const akekuriBatkMenu = buildContextMenu(result.current, akekuriBasicCol!, 20 * FPS);
    expect(akekuriBatkMenu).not.toBeNull();
    act(() => { executeAddFromMenu(result.current, akekuriBatkMenu!); });

    // Verify MF is at 3 and all 3 setup heats consumed
    const mfBefore = getMeltingFlameEvents(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfBefore).toHaveLength(3);
    const heatsAfterPhase1 = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(heatsAfterPhase1).toHaveLength(0);

    // Phase 2: 2 more Akekuri BS → 2 stacked heat inflictions on enemy
    for (let i = 0; i < 2; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (30 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const heatsBeforeFinisher = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(heatsBeforeFinisher).toHaveLength(2);
    // While both stacked, the latest event carries stacks=2 (display "II")
    const heatsBeforeSorted = [...heatsBeforeFinisher].sort((a, b) => a.startFrame - b.startFrame);
    expect(heatsBeforeSorted[0].stacks).toBe(1);
    expect(heatsBeforeSorted[1].stacks).toBe(2);
    // Capture the surviving (later) heat's pre-consume duration to verify it's preserved
    const survivorBeforeConsume = heatsBeforeSorted[1];
    const survivorDurBefore = eventDuration(survivorBeforeConsume);
    const survivorStartBefore = survivorBeforeConsume.startFrame;
    const survivorEndBefore = survivorStartBefore + survivorDurBefore;

    // Phase 3: Laevatain finisher fires → ALL UP_TO 4, but MF cap allows only 1 more stack
    const finisherVariant = laevBasicCol!.eventVariants?.find((v) => v.id === NounType.FINISHER);
    expect(finisherVariant).toBeDefined();
    const laevBasicMenu = buildContextMenu(result.current, laevBasicCol!, 45 * FPS);
    expect(laevBasicMenu).not.toBeNull();
    const finisherItem = laevBasicMenu!.find(
      (i) => i.actionId === 'addEvent' && (i.actionPayload as { defaultSkill?: { id?: string } }).defaultSkill?.id === finisherVariant!.id,
    );
    expect(finisherItem).toBeDefined();
    const payload = finisherItem!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof result.current.handleAddEvent>[3] };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // MF reaches 4 (cap)
    const mfAfter = getMeltingFlameEvents(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfAfter).toHaveLength(4);

    // Only 1 of the 2 phase-2 heats consumed; 1 should remain active
    const phase2Heats = getHeatInflictions(result.current).filter(
      (ev) => ev.startFrame >= 30 * FPS,
    );
    expect(phase2Heats).toHaveLength(2);
    const phase2HeatsConsumed = phase2Heats.filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(phase2HeatsConsumed).toHaveLength(1);
    const phase2HeatsActive = phase2Heats.filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(phase2HeatsActive).toHaveLength(1);

    const survivor = phase2HeatsActive[0];
    expect(survivor.uid).toBe(survivorBeforeConsume.uid);
    // Duration NOT refreshed — engine state unchanged
    expect(survivor.startFrame).toBe(survivorStartBefore);
    expect(eventDuration(survivor)).toBe(survivorDurBefore);
    expect(survivor.startFrame + eventDuration(survivor)).toBe(survivorEndBefore);

    // View-model: the survivor's bar in the heat column splits into 2 segments
    //   [F_survivor_start → consumeFrame)  named "Heat II" (2 active)
    //   [consumeFrame → F_end)            named "Heat I"  (1 active after consume)
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatCol = result.current.columns.find(
      (c) => c.type === ColumnType.MINI_TIMELINE
        && (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT)
          || (c as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    expect(heatCol).toBeDefined();
    const heatVm = viewModels.get(heatCol!.key);
    const renderedSurvivor = heatVm!.events.find((ev) => ev.uid === survivor.uid)!;
    const consumeFrame = phase2HeatsConsumed[0].startFrame + eventDuration(phase2HeatsConsumed[0]);
    expect(renderedSurvivor.segments).toHaveLength(2);
    expect(renderedSurvivor.segments[0].properties.name).toBe('Heat 2');
    expect(renderedSurvivor.segments[0].properties.duration).toBe(consumeFrame - survivor.startFrame);
    expect(renderedSurvivor.segments[1].properties.name).toBe('Heat 1');
    expect(renderedSurvivor.segments[1].properties.duration).toBe(survivorDurBefore - (consumeFrame - survivor.startFrame));
  });

  it("USER SCENARIO: MF=III pre-existing, 2 Akekuri BS stacked Heat II, then Akekuri BATK triggers consume — heat II→I visible in segments", () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(battleCol).toBeDefined();
    expect(basicCol).toBeDefined();

    // Phase 1: reach MF=III via 3 Akekuri BS + 1 Akekuri BATK (final-strike consumes all 3 heats, creates 3 MF)
    for (let i = 0; i < 3; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      expect(menu).not.toBeNull();
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const phase1Batk = buildContextMenu(result.current, basicCol!, 20 * FPS);
    act(() => { executeAddFromMenu(result.current, phase1Batk!); });
    const mfAfterPhase1 = getMeltingFlameEvents(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfAfterPhase1).toHaveLength(3);

    // Phase 2: 2 more Akekuri BS produce 2 stacked heat events — "Heat I, Heat II"
    for (let i = 0; i < 2; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (30 + i * 5) * FPS);
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const stackedHeats = getHeatInflictions(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(stackedHeats).toHaveLength(2);
    const sortedStacked = [...stackedHeats].sort((a, b) => a.startFrame - b.startFrame);
    // Before consume: heat 1 stays at "I", heat 2 shows "II"
    expect(sortedStacked[0].stacks).toBe(1);
    expect(sortedStacked[1].stacks).toBe(2);
    const survivorBefore = sortedStacked[1];
    const survivorOriginalDur = eventDuration(survivorBefore);

    // Phase 3: Akekuri BATK — Final Strike triggers Scorching Heart's ALL UP_TO 4
    // With MF=3 and cap=4, only 1 heat can be consumed before the APPLY is blocked.
    const phase3Batk = buildContextMenu(result.current, basicCol!, 45 * FPS);
    act(() => { executeAddFromMenu(result.current, phase3Batk!); });

    // Exactly 1 of the 2 stacked heats is consumed, 1 survives
    const phase2Heats = getHeatInflictions(result.current).filter(
      (ev) => ev.startFrame >= 30 * FPS,
    );
    expect(phase2Heats).toHaveLength(2);
    const consumed = phase2Heats.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    const active = phase2Heats.filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(1);
    expect(active).toHaveLength(1);

    // Survivor is the younger heat (higher startFrame), same UID as pre-consume
    const survivor = active[0];
    expect(survivor.uid).toBe(survivorBefore.uid);

    // MF reached cap at 4
    const mfFinal = getMeltingFlameEvents(result.current).filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfFinal).toHaveLength(4);

    // Duration is NOT affected by the stack-count update
    expect(survivor.startFrame).toBe(survivorBefore.startFrame);
    expect(eventDuration(survivor)).toBe(survivorOriginalDur);

    // Engine state: survivor is still a single segment with unchanged duration.
    expect(survivor.segments).toHaveLength(1);
    expect(survivor.segments[0].properties.duration).toBe(survivorOriginalDur);

    // View-model: survivor's bar splits into 2 segments "Heat II" → "Heat I".
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatCol = result.current.columns.find(
      (c) => c.type === ColumnType.MINI_TIMELINE
        && (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT)
          || (c as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    const heatVm = viewModels.get(heatCol!.key);
    const renderedSurvivor = heatVm!.events.find((ev) => ev.uid === survivor.uid)!;
    expect(renderedSurvivor.segments).toHaveLength(2);
    expect(renderedSurvivor.segments[0].properties.name).toBe('Heat 2');
    expect(renderedSurvivor.segments[1].properties.name).toBe('Heat 1');
    // Segments sum to the survivor's original duration.
    expect(renderedSurvivor.segments[0].properties.duration + renderedSurvivor.segments[1].properties.duration).toBe(survivorOriginalDur);
  });

  it("USER SCENARIO (finisher variant): MF=III, 2 stacked heats, Akekuri FINISHER variant → segments split II→I", () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(battleCol).toBeDefined();
    expect(basicCol).toBeDefined();

    // Setup: MF=3
    for (let i = 0; i < 3; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const p1Batk = buildContextMenu(result.current, basicCol!, 20 * FPS);
    act(() => { executeAddFromMenu(result.current, p1Batk!); });
    expect(getMeltingFlameEvents(result.current).filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED)).toHaveLength(3);

    // Stack 2 heats
    for (let i = 0; i < 2; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (30 + i * 5) * FPS);
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const stacked = getHeatInflictions(result.current).filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(stacked).toHaveLength(2);
    const survivorBefore = [...stacked].sort((a, b) => a.startFrame - b.startFrame)[1];

    // Trigger via Akekuri FINISHER variant (not regular BATK)
    const finisherVariant = basicCol!.eventVariants?.find((v) => v.id === NounType.FINISHER);
    expect(finisherVariant).toBeDefined();
    const menu = buildContextMenu(result.current, basicCol!, 45 * FPS);
    const finisherItem = menu!.find(
      (i) => i.actionId === 'addEvent' && (i.actionPayload as { defaultSkill?: { id?: string } }).defaultSkill?.id === finisherVariant!.id,
    );
    expect(finisherItem).toBeDefined();
    const payload = finisherItem!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof result.current.handleAddEvent>[3] };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const phase2Heats = getHeatInflictions(result.current).filter((ev) => ev.startFrame >= 30 * FPS);
    const consumedHeats = phase2Heats.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    const activeHeats = phase2Heats.filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumedHeats).toHaveLength(1);
    expect(activeHeats).toHaveLength(1);

    const survivor = activeHeats[0];
    expect(survivor.uid).toBe(survivorBefore.uid);
    // Engine event is still single-segment; view splits it.
    expect(survivor.segments).toHaveLength(1);

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatCol = result.current.columns.find(
      (c) => c.type === ColumnType.MINI_TIMELINE
        && (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT)
          || (c as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    const heatVm = viewModels.get(heatCol!.key);
    const renderedSurvivor = heatVm!.events.find((ev) => ev.uid === survivor.uid)!;
    expect(renderedSurvivor.segments).toHaveLength(2);
    expect(renderedSurvivor.segments[0].properties.name).toBe('Heat 2');
    expect(renderedSurvivor.segments[1].properties.name).toBe('Heat 1');
  });

  it("FREEFORM: add heats manually, BATK-1 consume, more heats, BATK-2 consume — labels evolve correctly (no 'Heat 4' on surviving heat)", () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID
        && c.matchColumnIds != null
        && c.matchColumnIds.includes(INFLICTION_COLUMNS.HEAT),
    );
    expect(enemyStatusCol).toBeDefined();

    // Add 3 freeform heats via context menu at frames 30, 60, 90
    const addHeat = (atFrame: number) => {
      const menu = buildContextMenu(result.current, enemyStatusCol!, atFrame);
      expect(menu).not.toBeNull();
      const heatItem = menu!.find(
        (i) => i.actionId === 'addEvent' && (i.actionPayload as { columnId?: string })?.columnId === INFLICTION_COLUMNS.HEAT,
      );
      expect(heatItem).toBeDefined();
      const payload = heatItem!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof result.current.handleAddEvent>[3] };
      act(() => {
        result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
      });
    };
    addHeat(30);
    addHeat(60);
    addHeat(90);
    const freshHeats = getHeatInflictions(result.current).filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(freshHeats).toHaveLength(3);
    // Sanity: freeform events must carry creationInteractionMode so the UI
    // can render them as draggable. Without this, the UI strips drag handles.
    for (const h of freshHeats) {
      expect(h.creationInteractionMode).toBe(InteractionModeType.FREEFORM);
    }
    // CRITICAL: the view-model clones (from applyInflictionStackSplits) MUST
    // also preserve creationInteractionMode so draggability survives the split.
    {
      const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
      const heatVm = Array.from(vms.values()).find(vm =>
        (vm.column as MiniTimeline).ownerEntityId === ENEMY_ID &&
        ((vm.column as MiniTimeline).matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT) ||
          (vm.column as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
      );
      for (const h of freshHeats) {
        const rendered = heatVm!.events.find(ev => ev.uid === h.uid);
        expect(rendered).toBeDefined();
        expect(rendered!.creationInteractionMode).toBe(InteractionModeType.FREEFORM);
      }
    }

    // BATK 1 — Laevatain's BATK (Flaming Cinders) at 5s. Triggers Scorching Heart.
    const laevBasicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(laevBasicCol).toBeDefined();
    const batk1Menu = buildContextMenu(result.current, laevBasicCol!, 5 * FPS);
    act(() => { executeAddFromMenu(result.current, batk1Menu!); });

    // After BATK 1: some heats consumed (up to 3, depending on MF space). MF should increase.
    const mfAfterBatk1 = getMeltingFlameEvents(result.current).filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(mfAfterBatk1.length).toBeGreaterThanOrEqual(1);

    // Add 3 more freeform heats at 8s, 8.5s, 9s
    addHeat(8 * FPS);
    addHeat(8 * FPS + 60);
    addHeat(9 * FPS);
    const activeBeforeBatk2 = getHeatInflictions(result.current).filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(activeBeforeBatk2.length).toBeGreaterThanOrEqual(1);

    // Capture pre-BATK-2 view labels of active heats
    const viewModelsBefore = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatVmBefore = Array.from(viewModelsBefore.values()).find(vm =>
      (vm.column as MiniTimeline).ownerEntityId === ENEMY_ID &&
      ((vm.column as MiniTimeline).matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT) ||
        (vm.column as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    expect(heatVmBefore).toBeDefined();

    // BATK 2 — add a second Laevatain BATK at 12s to trigger another consume
    const batk2Menu = buildContextMenu(result.current, laevBasicCol!, 12 * FPS);
    act(() => { executeAddFromMenu(result.current, batk2Menu!); });

    // After BATK 2: verify the surviving heat's labels.
    const viewModelsAfter = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatVmAfter = Array.from(viewModelsAfter.values()).find(vm =>
      (vm.column as MiniTimeline).ownerEntityId === ENEMY_ID &&
      ((vm.column as MiniTimeline).matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT) ||
        (vm.column as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    expect(heatVmAfter).toBeDefined();

    // Every segment's label must reflect an accurate cumulative count at its
    // time window. No active heat should have a segment labeled with a count
    // greater than the number of heats actually alive during that segment.
    // Specifically, there should never be a "Heat 4" when fewer than 4 heats are co-active.
    const survivors = heatVmAfter!.events.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    for (const surv of survivors) {
      for (const seg of surv.segments) {
        const name = seg.properties.name;
        if (!name) continue;
        // Count active at segment's absolute start frame
        // (segment's start = surv.startFrame + sum of prior segment durations)
        const segStartOffset = surv.segments.slice(0, surv.segments.indexOf(seg)).reduce((s, x) => s + x.properties.duration, 0);
        const frameAtSegStart = surv.startFrame + segStartOffset;
        const activeAtFrame = result.current.allProcessedEvents.filter(ev =>
          ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID
          && ev.startFrame <= frameAtSegStart
          && ev.startFrame + ev.segments.reduce((s, x) => s + x.properties.duration, 0) > frameAtSegStart,
        ).length;
        const actualCount = activeAtFrame;
        const labelDigitMatch = name.match(/Heat (\d+)$/);
        const labelCount = labelDigitMatch ? Number(labelDigitMatch[1]) : -1;
        expect({ survivor: surv.uid, segLabel: name, segStartFrame: frameAtSegStart, labelCount, actualActive: actualCount })
          .toMatchObject({ labelCount: actualCount });
      }
    }
  });

  it("post-consume: new heats after an old batch was consumed restart at 'Heat 1'", () => {
    // Regression test for the "Heat IV starting by itself" bug. After a
    // full consume (all 3 heats absorbed by Scorching Heart), a later BS
    // must produce a fresh Heat I — not Heat IV — because the earlier
    // heats have ended before the new one starts.
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);

    // 3 BS + 1 BATK → all 3 heats consumed (MF starts at 0, reaches 3)
    for (let i = 0; i < 3; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const batk1 = buildContextMenu(result.current, basicCol!, 20 * FPS);
    act(() => { executeAddFromMenu(result.current, batk1!); });

    const allHeatsAfterBatk = getHeatInflictions(result.current);
    const consumed = allHeatsAfterBatk.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(3);

    // Now add a new BS well after the consume. The 3 earlier heats have ended
    // (consumed-truncated to ~final-strike frame of the BATK at ~20s).
    const newBsMenu = buildContextMenu(result.current, battleCol!, 60 * FPS);
    act(() => { executeAddFromMenu(result.current, newBsMenu!); });

    const allHeats = getHeatInflictions(result.current);
    const newHeat = allHeats.find((ev) => ev.startFrame >= 60 * FPS);
    expect(newHeat).toBeDefined();

    // View-model: the new heat's lone segment is labeled "Heat I" — the 3
    // earlier heats have ended before its start, so cumulative count = 1.
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatCol = result.current.columns.find(
      (c) => c.type === ColumnType.MINI_TIMELINE
        && (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT)
          || (c as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    const heatVm = viewModels.get(heatCol!.key);
    const rendered = heatVm!.events.find((ev) => ev.uid === newHeat!.uid)!;
    // Single segment (no other heats overlap to cause a split). Event-level
    // label — used by EventRenderer for isSingleSeg — reads "Heat I".
    expect(rendered.segments).toHaveLength(1);
    expect(heatVm!.statusOverrides.get(newHeat!.uid)?.label).toBe('Heat 1');
  });

  it("consumed fresh heat after earlier batch: label stays 'Heat 1', never flips to 'Heat 4'", () => {
    // Regression for the screenshot bug: a fresh solo heat applied after an
    // earlier batch has been fully consumed must remain labeled "Heat I"
    // both while alive AND after it itself is consumed by a BATK. Previously
    // the CONSUMED-path used defDur-based position counting, which counted
    // already-consumed priors within the 20s apply-time window and mislabeled
    // the solo fresh heat as "Heat IV" once BATK marked it CONSUMED.
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);

    // Phase 1: 3 BS + BATK → 3 heats consumed, MF=3.
    for (let i = 0; i < 3; i++) {
      const menu = buildContextMenu(result.current, battleCol!, (2 + i * 5) * FPS);
      act(() => { executeAddFromMenu(result.current, menu!); });
    }
    const batk1Frame = 20 * FPS;
    const batk1 = buildContextMenu(result.current, basicCol!, batk1Frame);
    act(() => { executeAddFromMenu(result.current, batk1!); });

    const phase1Consumed = getHeatInflictions(result.current)
      .filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    expect(phase1Consumed).toHaveLength(3);

    // Phase 2: one more BS → one fresh solo heat.
    const bs4Frame = 35 * FPS;
    const bs4 = buildContextMenu(result.current, battleCol!, bs4Frame);
    act(() => { executeAddFromMenu(result.current, bs4!); });

    const freshHeat = getHeatInflictions(result.current).find(
      (ev) => ev.startFrame >= bs4Frame && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(freshHeat).toBeDefined();

    // While alive, label is "Heat I".
    {
      const vms = computeTimelinePresentation(
        result.current.allProcessedEvents,
        result.current.columns,
      );
      const heatCol = result.current.columns.find(
        (c) => c.type === ColumnType.MINI_TIMELINE
          && (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT)
            || (c as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
      );
      const heatVm = vms.get(heatCol!.key)!;
      expect(heatVm.statusOverrides.get(freshHeat!.uid)?.label).toBe('Heat 1');
    }

    // Phase 3: another BATK consumes the fresh heat (MF goes 3 → 4).
    const batk2Frame = 50 * FPS;
    const batk2 = buildContextMenu(result.current, basicCol!, batk2Frame);
    act(() => { executeAddFromMenu(result.current, batk2!); });

    // The fresh heat must now be CONSUMED and still labeled "Heat I".
    const freshAfter = result.current.allProcessedEvents.find(
      (ev) => ev.uid === freshHeat!.uid,
    )!;
    expect(freshAfter.eventStatus).toBe(EventStatusType.CONSUMED);

    const vmsAfter = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const heatColAfter = result.current.columns.find(
      (c) => c.type === ColumnType.MINI_TIMELINE
        && (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT)
          || (c as MiniTimeline).columnId === INFLICTION_COLUMNS.HEAT),
    );
    const heatVmAfter = vmsAfter.get(heatColAfter!.key)!;
    expect(heatVmAfter.statusOverrides.get(freshHeat!.uid)?.label).toBe('Heat 1');

    // Now verify start/end/names for every heat infliction in the timeline.
    const allHeats = getHeatInflictions(result.current).slice().sort(
      (a, b) => a.startFrame - b.startFrame,
    );
    // Expect 4 total heats: 3 from phase-1 BSes (all consumed at batk1 final
    // strike) + 1 from phase-2 BS (consumed at batk2 final strike).
    expect(allHeats).toHaveLength(4);

    // All phase-1 heats: CONSUMED, end frame == batk1 final-strike frame.
    // All phase-1 heats were applied BEFORE the BATK, so they share the same
    // consume end frame. Engine truncates consumed events so end == BATK FS
    // frame.
    const phase1 = allHeats.slice(0, 3);
    const phase1End = phase1[0].startFrame + eventDuration(phase1[0]);
    for (const h of phase1) {
      expect(h.eventStatus).toBe(EventStatusType.CONSUMED);
      expect(h.startFrame + eventDuration(h)).toBe(phase1End);
      // The end frame of phase-1 heats is before batk2 (we consumed them at
      // batk1's final strike, well before batk2 at 50s).
      expect(phase1End).toBeLessThan(batk2Frame);
    }

    // Phase-2 fresh heat: starts at/after bs4, consumed at batk2 final-strike.
    const phase2 = allHeats[3];
    expect(phase2.uid).toBe(freshHeat!.uid);
    expect(phase2.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(phase2.startFrame).toBeGreaterThanOrEqual(bs4Frame);
    const phase2End = phase2.startFrame + eventDuration(phase2);
    // fresh heat's truncated end happens AT or AFTER batk2's start,
    // because it was consumed by batk2's final strike.
    expect(phase2End).toBeGreaterThanOrEqual(batk2Frame);

    // Override labels for EVERY heat — phase-1 heats reflect their own
    // apply-time positions (I, II, III), the fresh solo heat is "Heat I".
    const labels = allHeats.map(
      (h) => heatVmAfter.statusOverrides.get(h.uid)?.label,
    );
    expect(labels).toEqual(['Heat 1', 'Heat 2', 'Heat 3', 'Heat 1']);
  });
});
