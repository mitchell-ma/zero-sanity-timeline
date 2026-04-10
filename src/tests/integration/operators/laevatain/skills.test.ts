/**
 * @jest-environment jsdom
 */

/**
 * Laevatain — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. User adds Laevatain's skills via context menu → handleAddEvent
 * 2. Verify skills don't crash the pipeline
 * 3. Verify battle skill generates 1 Melting Flame stack
 * 4. Verify basic attack absorbs enemy heat inflictions and generates Melting Flames at 1:1 ratio
 *
 * Verifies all three layers:
 * - Context menu: menu items are available and enabled
 * - Controller: event counts, event status, timing, duration
 * - View: computeTimelinePresentation includes events in their columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_ID, OPERATOR_STATUS_COLUMN_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { EnhancementType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, getAddEventPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const MELTING_FLAME_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const SMOULDERING_FIRE_ID: string = require('../../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAEVATAIN = 'slot-0';

/**
 * Build a multi-segment basic attack event payload that triggers Final Strike
 * absorption. The context menu default is a single-sequence BATK; the engine
 * needs >= 2 segments to resolve FINAL_STRIKE.
 */
function buildMultiSegmentBasic(defaultEvent: AddEventPayload['defaultSkill']) {
  const segments = defaultEvent.segments as { properties: Record<string, unknown>; frames?: unknown }[];
  const seg = segments[0];
  return {
    ...defaultEvent,
    segments: [
      seg,
      { properties: { duration: seg.properties.duration, name: 'II' } },
      { properties: { duration: seg.properties.duration, name: 'III' }, frames: seg.frames },
    ],
  } as AddEventPayload['defaultSkill'];
}

/** Add a heat infliction on enemy in freeform mode via context menu flow. */
function addHeatInfliction(app: AppResult, atFrame: number) {
  const enemyStatusCol = findColumn(app, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();
  const menuItems = buildContextMenu(app, enemyStatusCol!, atFrame);
  expect(menuItems).not.toBeNull();
  // Find the heat infliction menu item by its action payload columnId
  const heatItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === INFLICTION_COLUMNS.HEAT,
  );
  expect(heatItem).toBeDefined();
  expect(heatItem!.disabled).toBeFalsy();
  const payload = heatItem!.actionPayload as AddEventPayload;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('Laevatain Skills — integration through useApp', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // A. Each skill type doesn't crash the pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  it('basic attack added without crash', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();

    // Context menu layer: verify menu item is available and enabled
    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const basics = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_LAEVATAIN && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basics.length).toBeGreaterThanOrEqual(1);
  });

  it('battle skill added without crash', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(col).toBeDefined();

    // Context menu layer: verify menu item is available and enabled
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
  });

  it('combo skill added without crash', () => {
    const { result } = renderHook(() => useApp());

    // Combo skill requires activation conditions — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LAEVATAIN, NounType.COMBO);
    expect(col).toBeDefined();

    // Context menu layer: verify menu item is available in freeform
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_LAEVATAIN && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('ultimate added without crash', () => {
    const { result } = renderHook(() => useApp());
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAEVATAIN, 0); });
    const col = findColumn(result.current, SLOT_LAEVATAIN, NounType.ULTIMATE);
    expect(col).toBeDefined();

    // Context menu layer: verify menu item is available and enabled
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_LAEVATAIN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Battle skill generates 1 Melting Flame stack
  // ═══════════════════════════════════════════════════════════════════════════

  it('battle skill generates 1 Melting Flame stack', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: MF event generated
    const mfProcessed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(mfProcessed).toHaveLength(1);
    expect(mfProcessed[0].sourceSkillName).toBe(SMOULDERING_FIRE_ID);

    // View layer: MF appears in operator status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const statusVm = viewModels.get(statusCol!.key);
    expect(statusVm).toBeDefined();
    const mfVmEvents = statusVm!.events.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(mfVmEvents).toHaveLength(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Heat infliction absorption via basic attack → Melting Flame at 1:1
  //
  // Absorption triggers on FINAL_STRIKE which requires a multi-segment basic
  // attack (>= 2 segments). The context menu default is a single sequence, so
  // we construct the multi-segment payload to simulate a full basic chain.
  // ═══════════════════════════════════════════════════════════════════════════

  it.each([1, 2, 3, 4])(
    'basic attack absorbs %i heat infliction(s) and generates Melting Flame at 1:1',
    (heatCount) => {
      const { result } = renderHook(() => useApp());

      // Switch to freeform for manual heat infliction placement
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      // Place heat inflictions on enemy via freeform context menu (staggered by 1 frame)
      for (let i = 0; i < heatCount; i++) {
        addHeatInfliction(result.current, 1 * FPS + i);
      }

      // Verify heat inflictions exist before basic attack
      const heatsBefore = result.current.allProcessedEvents.filter(
        (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
      );
      expect(heatsBefore).toHaveLength(heatCount);

      // Add multi-segment basic attack (triggers FINAL_STRIKE absorption)
      const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
      expect(basicCol).toBeDefined();
      const basicPayload = getMenuPayload(result.current, basicCol!, 3 * FPS);
      const multiSegBasic = buildMultiSegmentBasic(basicPayload.defaultSkill);
      act(() => {
        result.current.handleAddEvent(
          basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, multiSegBasic,
        );
      });

      // Controller layer: Melting Flames generated at 1:1 ratio with absorbed heat inflictions
      const mfEvents = result.current.allProcessedEvents.filter(
        (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
      );
      expect(mfEvents).toHaveLength(heatCount);

      // Heat inflictions should be consumed
      const heatsAfter = result.current.allProcessedEvents.filter(
        (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
          && ev.ownerEntityId === ENEMY_ID
          && ev.eventStatus === EventStatusType.CONSUMED,
      );
      expect(heatsAfter).toHaveLength(heatCount);

      // View layer: consumed heats and generated MF appear in presentation
      const viewModels = computeTimelinePresentation(
        result.current.allProcessedEvents,
        result.current.columns,
      );

      // MF events in status column
      const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
      expect(statusCol).toBeDefined();
      const statusVm = viewModels.get(statusCol!.key);
      expect(statusVm).toBeDefined();
      const mfVmEvents = statusVm!.events.filter(
        (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
      );
      expect(mfVmEvents).toHaveLength(heatCount);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // D. MF stacks from compound trigger (heat absorption) are permanent
  // ═══════════════════════════════════════════════════════════════════════════

  it('MF from heat absorption has TOTAL_FRAMES duration', () => {
    const { result } = renderHook(() => useApp());

    // Switch to freeform for manual heat infliction placement
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 1 heat infliction via freeform context menu
    addHeatInfliction(result.current, 1 * FPS);

    // Add multi-segment basic to trigger absorption
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    const basicPayload = getMenuPayload(result.current, basicCol!, 3 * FPS);
    const multiSegBasic = buildMultiSegmentBasic(basicPayload.defaultSkill);
    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, multiSegBasic,
      );
    });

    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);
    for (const ev of mfEvents) {
      expect(eventDuration(ev)).toBe(TOTAL_FRAMES);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. Empowered battle skill consumes all MF stacks
  // ═══════════════════════════════════════════════════════════════════════════

  it('empowered battle skill consumes all 4 MF stacks', () => {
    const { result } = renderHook(() => useApp());
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    // Place 4 battle skills well-spaced to generate 4 MF stacks via context menu
    for (let i = 0; i < 4; i++) {
      const atFrame = (2 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // Verify all 4 battle skills were added
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_LAEVATAIN && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(4);

    // Verify 4 MF stacks exist
    const mfBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfBefore).toHaveLength(4);

    // Find empowered variant label from battle column
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();

    // Add empowered BS via context menu with variant label, well after all 4 battle skills
    const empPayload = getMenuPayload(
      result.current, battleCol!, 50 * FPS, empoweredVariant!.displayName,
    );
    act(() => {
      result.current.handleAddEvent(
        empPayload.ownerEntityId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill,
      );
    });

    // All 4 MF stacks should be consumed
    const mfAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    const consumed = mfAfter.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(4);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. At max MF stacks, additional attacks do NOT consume heat inflictions
  //
  // The ALL clause pre-validates: canCONSUME & canAPPLY before executing.
  // When APPLY MELTING_FLAME would exceed max stacks (4), the entire compound
  // action is skipped — heat inflictions remain unconsumed.
  // ═══════════════════════════════════════════════════════════════════════════

  it('at max MF stacks, basic attack does not consume heat inflictions', () => {
    const { result } = renderHook(() => useApp());
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BASIC_ATTACK);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);

    // 1. Generate 4 MF stacks via 4 battle skills (each produces 1 MF)
    for (let i = 0; i < 4; i++) {
      const atFrame = (2 + i * 10) * FPS;
      const payload = getMenuPayload(result.current, battleCol!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }

    // Verify 4 MF stacks (max)
    const mfStacks = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfStacks).toHaveLength(4);

    // 2. Switch to freeform and add heat inflictions on enemy AFTER all battle skills
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const inflictionFrame = 60 * FPS;
    for (let i = 0; i < 2; i++) {
      addHeatInfliction(result.current, inflictionFrame + i);
    }

    // 3. Add multi-segment basic attack after heat inflictions (triggers FINAL_STRIKE)
    const basicPayload = getMenuPayload(result.current, basicCol!, 65 * FPS);
    const multiSegBasic = buildMultiSegmentBasic(basicPayload.defaultSkill);
    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, multiSegBasic,
      );
    });

    // 4. Heat inflictions should NOT be consumed (ALL pre-validation fails: can't APPLY more MF)
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerEntityId === ENEMY_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(0);

    // 5. MF stacks should still be exactly 4 (unchanged)
    const mfAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === MELTING_FLAME_ID && ev.ownerEntityId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfAfter).toHaveLength(4);
  });
});
