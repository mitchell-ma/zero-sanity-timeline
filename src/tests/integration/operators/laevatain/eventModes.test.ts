/**
 * @jest-environment jsdom
 */

/**
 * Laevatain Event Modes — Integration Tests
 *
 * Tests the interactions between freeform-placed events and engine-derived
 * events. Freeform events (manually placed MF stacks, heat inflictions, etc.)
 * must participate in engine processing identically to naturally-derived events.
 *
 * A. Freeform events interact with the engine correctly
 * B. Strict events produce correct engine-driven chains
 * C. Events from different modes interact in the same timeline
 * D. Freeform infliction default durations from config
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled for each column
 * 2. Controller: event counts, event status, timing
 * 3. View: computeTimelinePresentation includes events in their columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { ColumnType, EnhancementType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const MELTING_FLAME_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAEVATAIN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

/**
 * Find a MiniTimeline column by owner and column ID, also matching via
 * matchColumnIds. Renamed from the shared `findColumn` to avoid shadowing.
 */
function findMatchingColumn(app: AppResult, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

/**
 * Build a multi-segment basic attack event payload that triggers Final Strike
 * absorption. The context menu default is a single-sequence BATK; the engine
 * needs >= 2 segments to resolve FINAL_STRIKE.
 */
function buildMultiSegmentBasic(defaultSkill: AddEventPayload['defaultSkill']) {
  const segments = defaultSkill.segments as { properties: Record<string, unknown>; frames?: unknown }[];
  const seg = segments[0];
  return {
    ...defaultSkill,
    segments: [
      seg,
      { properties: { duration: seg.properties.duration, name: 'II' } },
      { properties: { duration: seg.properties.duration, name: 'III' }, frames: seg.frames },
    ],
  } as AddEventPayload['defaultSkill'];
}

/** Place N freeform MF stacks 1s apart starting at the given frame via context menu flow. */
function placeMfStacks(app: AppResult, count: number, startFrame: number) {
  const mfCol = findMatchingColumn(app, SLOT_LAEVATAIN, MELTING_FLAME_ID);
  expect(mfCol).toBeDefined();
  const menuItems = buildContextMenu(app, mfCol!, startFrame);
  expect(menuItems).not.toBeNull();

  // Find the MF micro-column menu item by its action payload columnId
  const mfItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === MELTING_FLAME_ID,
  );
  expect(mfItem).toBeDefined();
  expect(mfItem!.disabled).toBeFalsy();
  const mfPayload = mfItem!.actionPayload as AddEventPayload;

  for (let i = 0; i < count; i++) {
    act(() => {
      app.handleAddEvent(
        mfPayload.ownerId, mfPayload.columnId, startFrame + i * FPS, mfPayload.defaultSkill,
      );
    });
  }
}

/** Place N heat inflictions on the enemy starting at the given frame via context menu flow. */
function placeHeatInflictions(app: AppResult, count: number, startFrame: number) {
  const enemyStatusCol = findColumn(app, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();

  // Switch to freeform to enable add on derived enemy status column
  const menuItems = buildContextMenu(app, enemyStatusCol!, startFrame);
  expect(menuItems).not.toBeNull();

  // Find the heat infliction menu item by its action payload columnId
  const heatItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === INFLICTION_COLUMNS.HEAT,
  );
  expect(heatItem).toBeDefined();
  expect(heatItem!.disabled).toBeFalsy();
  const heatPayload = heatItem!.actionPayload as AddEventPayload;

  for (let i = 0; i < count; i++) {
    act(() => {
      app.handleAddEvent(
        heatPayload.ownerId, heatPayload.columnId, startFrame + i, heatPayload.defaultSkill,
      );
    });
  }
}

function getMfEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerId === SLOT_LAEVATAIN,
  );
}

function getUnconsumedMf(app: AppResult) {
  return getMfEvents(app).filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
}

function getConsumedMf(app: AppResult) {
  return getMfEvents(app).filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Freeform events interact with the engine
// ═══════════════════════════════════════════════════════════════════════════════

describe('Freeform events — engine interactions', () => {
  it('freeform MF stacks block engine-derived MF from exceeding the cap', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 3 freeform MF stacks via context menu
    placeMfStacks(result.current, 3, 2 * FPS);
    expect(getUnconsumedMf(result.current)).toHaveLength(3);

    // ── Context menu layer: verify battle skill menu items exist and are enabled ──
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const battleMenu = buildContextMenu(result.current, battleCol!, 10 * FPS);
    expect(battleMenu).not.toBeNull();
    expect(battleMenu!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // Add 2 battle skills in freeform via context menu — each generates 1 MF via engine
    const payload1 = getMenuPayload(result.current, battleCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });
    const payload2 = getMenuPayload(result.current, battleCol!, 20 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    // Only 1 engine MF should be created (3 freeform + 1 engine = 4 cap)
    // The second battle skill's MF is blocked by the stack limit
    expect(getUnconsumedMf(result.current)).toHaveLength(4);
  });

  it('freeform heat inflictions are absorbed by FINAL_STRIKE and produce MF', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place heat inflictions manually via context menu
    placeHeatInflictions(result.current, 3, 1 * FPS);

    // Add multi-segment basic attack to trigger FINAL_STRIKE absorption via context menu
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    const basicPayload = getMenuPayload(result.current, basicCol!, 3 * FPS);
    const multiSegBasic = buildMultiSegmentBasic(basicPayload.defaultSkill);
    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerId, basicPayload.columnId, basicPayload.atFrame, multiSegBasic,
      );
    });

    // Freeform heat inflictions consumed by engine
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(3);

    // Engine generates MF at 1:1 from absorbed freeform heat
    expect(getMfEvents(result.current)).toHaveLength(3);
  });

  it('freeform MF has same TOTAL_FRAMES duration as engine-derived MF', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 1 freeform MF via context menu and 1 battle skill (engine-derived MF) via context menu
    placeMfStacks(result.current, 1, 2 * FPS);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, battleCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    const mfAll = getMfEvents(result.current);
    expect(mfAll).toHaveLength(2);

    // Both should have TOTAL_FRAMES duration regardless of source
    for (const mf of mfAll) {
      expect(eventDuration(mf)).toBe(TOTAL_FRAMES);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Strict events — engine-driven chains
// ═══════════════════════════════════════════════════════════════════════════════

describe('Strict events — engine-driven chains', () => {
  it('battle skill → MF → empowered BS consumption (full chain)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    // Build up 4 MF stacks via 4 battle skills via context menu
    for (let i = 0; i < 4; i++) {
      const atFrame = (2 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Empowered BS consumes all 4 engine-derived MF stacks — use variant displayName
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();
    const empPayload = getMenuPayload(
      result.current, battleCol!, 50 * FPS, empoweredVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        empPayload.ownerId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill,
      );
    });
    expect(getConsumedMf(result.current)).toHaveLength(4);
  });

  it('ultimate → enhanced BS during active phase processes with damage frames', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Enhanced BS activation clause requires exactly 4 MF stacks — generate via 4 battle skills
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    for (let i = 0; i < 4; i++) {
      const atFrame = (2 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }
    const mfBefore = getUnconsumedMf(result.current);
    expect(mfBefore).toHaveLength(4);

    // Place ultimate via context menu after battle skills
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAEVATAIN, 0); });
    const ultCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 50 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Find active phase start
    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.ULTIMATE,
    );
    const ultSegs = ultEvents[0].segments;
    const activationEnd = ultEvents[0].startFrame + ultSegs[0].properties.duration;

    // Place enhanced BS during active phase via context menu with variant displayName
    const enhancedVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.ENHANCED,
    );
    expect(enhancedVariant).toBeDefined();
    const enhPayload = getMenuPayload(
      result.current, battleCol!, activationEnd + FPS, enhancedVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        enhPayload.ownerId, enhPayload.columnId, enhPayload.atFrame, enhPayload.defaultSkill,
      );
    });

    // Enhanced BS is accepted and has damage frames
    const enhancedBattles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE
        && ev.enhancementType === EnhancementType.ENHANCED,
    );
    expect(enhancedBattles).toHaveLength(1);
    expect(enhancedBattles[0].segments[0].frames!.length).toBeGreaterThan(0);
  });

  it('strict rejects enhanced BS without ultimate, but accepts with ultimate', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const enhancedVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.ENHANCED,
    );
    expect(enhancedVariant).toBeDefined();

    // Enhanced BS requires 4 MF stacks (activation clause) — generate via 4 battle skills
    for (let i = 0; i < 4; i++) {
      const atFrame = (2 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Without ultimate, enhanced BS should be disabled (activation condition: ENABLE clause)
    const menuBefore = buildContextMenu(result.current, battleCol!, 50 * FPS);
    expect(menuBefore).not.toBeNull();
    const enhItemBefore = menuBefore!.find(
      (i) => i.actionId === 'addEvent' && i.label === enhancedVariant!.displayName,
    );
    expect(enhItemBefore).toBeDefined();
    expect(enhItemBefore!.disabled).toBe(true);

    // Place ultimate via context menu, then enhanced BS during active phase — accepted
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAEVATAIN, 0); });
    const ultCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 50 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.ULTIMATE,
    );
    const ultSegs = ultEvents[0].segments;
    const activationEnd = ultEvents[0].startFrame + ultSegs[0].properties.duration;

    const enhPayload = getMenuPayload(
      result.current, battleCol!, activationEnd + FPS, enhancedVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        enhPayload.ownerId, enhPayload.columnId, enhPayload.atFrame, enhPayload.defaultSkill,
      );
    });

    const enhancedBattles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE
        && ev.enhancementType === EnhancementType.ENHANCED,
    );
    expect(enhancedBattles).toHaveLength(1);
  });

  it('strict overlap rejection prevents duplicate MF generation', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    // Add battle skill via context menu, then try to overlap — rejected
    const payload1 = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Second add at same frame — context menu should show it disabled (overlap)
    const menuOverlap = buildContextMenu(result.current, battleCol!, 5 * FPS);
    expect(menuOverlap).not.toBeNull();
    const overlapItems = menuOverlap!.filter((i) => i.actionId === 'addEvent');
    expect(overlapItems.every((i) => i.disabled)).toBe(true);

    // Only 1 battle skill → only 1 MF
    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(getMfEvents(result.current)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Mixed freeform + strict — cross-mode interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mixed freeform + strict — cross-mode interactions', () => {
  it('freeform MF stacks consumed by strict empowered BS', () => {
    const { result } = renderHook(() => useApp());

    // Place 4 MF stacks in freeform via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 4, 2 * FPS);
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Switch to strict — empowered BS consumes the freeform MF via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();
    const empPayload = getMenuPayload(
      result.current, battleCol!, 10 * FPS, empoweredVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        empPayload.ownerId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill,
      );
    });

    expect(getConsumedMf(result.current)).toHaveLength(4);
  });

  it('strict engine-derived MF consumed by freeform empowered BS', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Build 4 MF stacks via strict battle skills via context menu
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    for (let i = 0; i < 4; i++) {
      const atFrame = (2 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Switch to freeform — empowered BS consumes the engine-derived MF via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();
    const empPayload = getMenuPayload(
      result.current, battleCol!, 50 * FPS, empoweredVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        empPayload.ownerId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill,
      );
    });

    expect(getConsumedMf(result.current)).toHaveLength(4);
  });

  it('freeform ultimate enables strict enhanced BS', () => {
    const { result } = renderHook(() => useApp());

    // Enhanced BS requires 4 MF stacks — place in freeform via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 4, 2 * FPS);
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Place ultimate in freeform via context menu
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAEVATAIN, 0); });
    const ultCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.ULTIMATE,
    );
    const ultSegs = ultEvents[0].segments;
    const activationEnd = ultEvents[0].startFrame + ultSegs[0].properties.duration;

    // Switch to strict — enhanced BS accepted because freeform ultimate is active + 4 MF stacks
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const enhancedVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.ENHANCED,
    );
    expect(enhancedVariant).toBeDefined();
    const enhPayload = getMenuPayload(
      result.current, battleCol!, activationEnd + FPS, enhancedVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        enhPayload.ownerId, enhPayload.columnId, enhPayload.atFrame, enhPayload.defaultSkill,
      );
    });

    const enhancedBattles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE
        && ev.enhancementType === EnhancementType.ENHANCED,
    );
    expect(enhancedBattles).toHaveLength(1);
  });

  it('freeform heat inflictions absorbed by strict basic attack', () => {
    const { result } = renderHook(() => useApp());

    // Place heat inflictions in freeform via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeHeatInflictions(result.current, 3, 1 * FPS);

    // Switch to strict — multi-segment basic absorbs the freeform heat via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    const basicPayload = getMenuPayload(result.current, basicCol!, 3 * FPS);
    const multiSegBasic = buildMultiSegmentBasic(basicPayload.defaultSkill);
    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerId, basicPayload.columnId, basicPayload.atFrame, multiSegBasic,
      );
    });

    // Freeform heat consumed, MF generated at 1:1
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(3);
    expect(getMfEvents(result.current)).toHaveLength(3);
  });

  it('freeform MF + engine-derived MF combine toward the stack cap', () => {
    const { result } = renderHook(() => useApp());

    // Place 2 freeform MF stacks via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 2, 2 * FPS);

    // Add 3 strict battle skills via context menu — only the first 2 should produce MF (cap = 4)
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    for (let i = 0; i < 3; i++) {
      const atFrame = (10 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // 2 freeform + 2 engine = 4 (cap). Third battle skill's MF is blocked.
    expect(getUnconsumedMf(result.current)).toHaveLength(4);
  });

  it('freeform MF + freeform heat + strict basic = full absorption fills cap', () => {
    const { result } = renderHook(() => useApp());

    // Place 2 freeform MF and 2 freeform heat inflictions via context menu
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 2, 2 * FPS);
    placeHeatInflictions(result.current, 2, 1 * FPS);

    // Switch to strict — basic attack absorbs heat → generates 2 more MF → cap
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    const basicPayload = getMenuPayload(result.current, basicCol!, 5 * FPS);
    const multiSegBasic = buildMultiSegmentBasic(basicPayload.defaultSkill);
    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerId, basicPayload.columnId, basicPayload.atFrame, multiSegBasic,
      );
    });

    // 2 freeform MF + 2 from absorption = 4 total (cap)
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Heat consumed
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Freeform infliction default durations from config
// ═══════════════════════════════════════════════════════════════════════════════

describe('Freeform infliction default durations', () => {
  it('freeform nature infliction has 20s duration from config — verified via view model', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Find the enemy status column that contains nature infliction via context menu
    const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();

    // Build context menu and find nature infliction item
    const menuItems = buildContextMenu(result.current, enemyStatusCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    const natureItem = menuItems!.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as AddEventPayload)?.columnId === INFLICTION_COLUMNS.NATURE,
    );
    expect(natureItem).toBeDefined();
    expect(natureItem!.disabled).toBeFalsy();
    const naturePayload = natureItem!.actionPayload as AddEventPayload;

    // Verify config-driven duration from payload
    const defaultSegDuration = (naturePayload.defaultSkill as Record<string, unknown[]>).segments?.[0] as
      { properties: { duration: number } } | undefined;
    expect(defaultSegDuration?.properties?.duration).toBe(20 * FPS);

    // Place freeform nature infliction at 2s via context menu payload
    act(() => {
      result.current.handleAddEvent(
        naturePayload.ownerId, naturePayload.columnId, naturePayload.atFrame, naturePayload.defaultSkill,
      );
    });

    // Verify via view model: the event appears in the column's processed events
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(enemyStatusCol!.key);
    expect(vm).toBeDefined();
    const natureInVM = vm!.events.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_ID,
    );
    expect(natureInVM).toHaveLength(1);
    expect(eventDuration(natureInVM[0])).toBe(20 * FPS);
    expect(natureInVM[0].startFrame).toBe(2 * FPS);
  });
});
