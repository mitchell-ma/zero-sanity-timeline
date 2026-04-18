/**
 * @jest-environment jsdom
 */

/**
 * Link Consumption — Integration Tests
 *
 * Tests the Link team status consumption through the full pipeline:
 * useApp → context menu → handleAddEvent → processCombatSimulation → DEC link tracking.
 *
 * Link is consumed when a battle skill or ultimate starts. The consumption
 * applies to the entire event (all frames). Basic attacks, finishers,
 * dive attacks, and combo skills do NOT consume Link.
 *
 * Since no operator currently produces Link through skills in the default lineup,
 * these tests inject Link events directly as raw events alongside skill events
 * and verify consumption through the DerivedEventController.
 *
 * Three-layer verification:
 * 1. Context menu: skill menu item is available and enabled at the target frame
 * 2. Controller: processCombatSimulation + DEC getLinkStacks records correct consumption
 * 3. View: processed events reflect consumed Link with correct clamped duration
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { EventStatusType, InteractionModeType, StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import type { TimelineEvent } from '../../../consts/viewTypes';
import { TEAM_ID } from '../../../controller/slot/commonSlotController';
import { processCombatSimulation, getLastController } from '../../../controller/timeline/eventQueueController';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, type AppResult } from '../helpers';

// ── Constants ──────────────────────────────────────────────────────────────

const SLOT_AKEKURI = 'slot-1';
const TEST_LINK_SOURCE = 'Test Link';

// ── Helpers ────────────────────────────────────────────────────────────────

let linkIdCounter = 0;

/** Create a Link team status event with the APPLY-clause frame that the app
 *  produces via `attachDefaultSegments` for freeform placements. */
function linkEvent(startFrame: number, durationFrames: number): TimelineEvent {
  return {
    uid: `link-integ-${linkIdCounter++}`,
    id: StatusType.LINK,
    name: StatusType.LINK,
    ownerEntityId: TEAM_ID,
    columnId: StatusType.LINK,
    startFrame,
    segments: [{
      properties: { duration: durationFrames },
      frames: [{
        offsetFrame: 0,
        clauses: [{
          conditions: [],
          effects: [{
            type: 'dsl',
            dslEffect: {
              verb: VerbType.APPLY,
              object: NounType.STATUS,
              objectId: StatusType.LINK,
              to: NounType.TEAM,
            },
          }],
        }],
      }],
    }],
    sourceSkillId: TEST_LINK_SOURCE,
  };
}

/** Deep-clone a processed event for re-use in processCombatSimulation. */
function cloneEvent(ev: TimelineEvent): TimelineEvent {
  return {
    ...ev,
    segments: ev.segments.map(s => ({
      ...s,
      properties: { ...s.properties },
      frames: s.frames?.map(f => ({ ...f })),
    })),
  };
}

/**
 * Add a skill event via context menu flow. Returns the payload used.
 * Verifies context menu availability (layer 1) before adding.
 */
function addSkillViaContextMenu(
  app: AppResult,
  slotId: string,
  columnId: string,
  atFrame: number,
  variantLabel?: string,
) {
  const col = findColumn(app, slotId, columnId);
  expect(col).toBeDefined();

  // Layer 1: Context menu — verify menu item is available and enabled
  const menuItems = buildContextMenu(app, col!, atFrame);
  expect(menuItems).not.toBeNull();
  expect(menuItems!.length).toBeGreaterThan(0);

  const payload = getMenuPayload(app, col!, atFrame, variantLabel);
  expect(payload.defaultSkill).toBeDefined();

  return payload;
}

beforeEach(() => { linkIdCounter = 0; });

// ═════════════════════════════════════════════════════════════════════════════
// Integration: Link consumed by battle skill
// ═════════════════════════════════════════════════════════════════════════════

describe('Link Consumption — Integration', () => {
  it('battle skill consumes Link and records stacks on DEC', () => {
    const { result } = renderHook(() => useApp());

    // Layer 1: Context menu — battle skill available at 5s
    const battleFrame = 5 * FPS;
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BATTLE, battleFrame,
    );

    // Add battle skill via context menu payload
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Layer 2: Controller — verify event placed
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    // Layer 2: Controller — processCombatSimulation with Link + battle skill
    const link = linkEvent(0, 10 * FPS);
    const rawBattle = cloneEvent(battleEvents[0]);

    processCombatSimulation([link, rawBattle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawBattle.uid)).toBe(1);
  });

  it('ultimate consumes Link and records stacks on DEC', () => {
    const { result } = renderHook(() => useApp());
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AKEKURI, 1); });

    // Layer 1: Context menu — ultimate available at 5s
    const ultFrame = 5 * FPS;
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.ULTIMATE, ultFrame,
    );

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);

    // Layer 2: Controller — Link consumed by ultimate
    const link = linkEvent(0, 10 * FPS);
    const rawUlt = cloneEvent(ultEvents[0]);

    processCombatSimulation([link, rawUlt]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawUlt.uid)).toBe(1);
  });

  it('basic attack does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    // Layer 1: Context menu — basic attack available at 5s
    const basicFrame = 5 * FPS;
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK, basicFrame,
    );

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const basicEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basicEvents).toHaveLength(1);

    const link = linkEvent(0, 10 * FPS);
    const rawBasic = cloneEvent(basicEvents[0]);

    processCombatSimulation([link, rawBasic]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawBasic.uid)).toBe(0);
  });

  it('combo skill does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO);
    if (!comboCol?.defaultEvent) {
      // Some operators may not have combo skills with defaults
      return;
    }

    // Layer 1: Context menu — combo skill may be disabled (requires trigger)
    const comboFrame = 5 * FPS;
    const menuItems = buildContextMenu(result.current, comboCol!, comboFrame);
    if (!menuItems) return;
    const addItem = menuItems.find(i => i.actionId === 'addEvent');
    if (!addItem || addItem.disabled) return; // combo requires trigger — skip

    const payload = getMenuPayload(result.current, comboCol!, comboFrame);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const comboEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.COMBO,
    );
    if (comboEvents.length === 0) return;

    const link = linkEvent(0, 10 * FPS);
    const rawCombo = cloneEvent(comboEvents[0]);

    processCombatSimulation([link, rawCombo]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawCombo.uid)).toBe(0);
  });

  it('first battle skill consumes Link, subsequent one does not', () => {
    const { result } = renderHook(() => useApp());

    // Layer 1: Context menu — first battle skill at 5s
    const payload1 = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BATTLE, 5 * FPS,
    );

    act(() => {
      result.current.handleAddEvent(
        payload1.ownerEntityId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Layer 1: Context menu — second battle skill at 15s
    const payload2 = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BATTLE, 15 * FPS,
    );

    act(() => {
      result.current.handleAddEvent(
        payload2.ownerEntityId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    const battleEvents = result.current.allProcessedEvents
      .filter((ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE)
      .sort((a, b) => a.startFrame - b.startFrame);
    expect(battleEvents).toHaveLength(2);

    const link = linkEvent(0, 10 * FPS);
    const rawBattles = battleEvents.map(cloneEvent);

    processCombatSimulation([link, ...rawBattles]);
    const controller = getLastController();

    // First battle skill (at 5s) consumes Link — it starts during Link's active duration
    expect(controller.getLinkStacks(rawBattles[0].uid)).toBe(1);
    // Second battle skill (at 15s) does NOT — Link was already consumed
    expect(controller.getLinkStacks(rawBattles[1].uid)).toBe(0);
  });

  it('Link clamped at consuming event start frame', () => {
    const { result } = renderHook(() => useApp());

    // Layer 1: Context menu — battle skill at 3s
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BATTLE, 3 * FPS,
    );

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    const link = linkEvent(0, 10 * FPS);
    const rawBattle = cloneEvent(battleEvents[0]);

    // Layer 3: View — verify consumed Link event has clamped duration
    const simResult = processCombatSimulation([link, rawBattle]);
    const linkEvents = simResult.filter((ev) => ev.columnId === StatusType.LINK);
    expect(linkEvents).toHaveLength(1);
    expect(linkEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);
    // Link duration should be clamped to battle skill start (3s = 360 frames)
    expect(eventDuration(linkEvents[0])).toBe(3 * FPS);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Freeform-added events consume Link the same way
// ═════════════════════════════════════════════════════════════════════════════

describe('Link Consumption — Freeform mode events', () => {
  it('freeform battle skill consumes Link', () => {
    const { result } = renderHook(() => useApp());

    // Switch to freeform mode
    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Layer 1: Context menu — battle skill available in freeform at 1s
    const battleFrame = 1 * FPS;
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BATTLE, battleFrame,
    );

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    const link = linkEvent(0, 10 * FPS);
    const rawBattle = cloneEvent(battleEvents[0]);

    processCombatSimulation([link, rawBattle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawBattle.uid)).toBe(1);
  });

  it('freeform ultimate consumes Link', () => {
    const { result } = renderHook(() => useApp());
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AKEKURI, 1); });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Layer 1: Context menu — ultimate available in freeform at 1s
    const ultFrame = 1 * FPS;
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.ULTIMATE, ultFrame,
    );

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);

    const link = linkEvent(0, 10 * FPS);
    const rawUlt = cloneEvent(ultEvents[0]);

    processCombatSimulation([link, rawUlt]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawUlt.uid)).toBe(1);
  });

  it('freeform basic attack does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Layer 1: Context menu — basic attack in freeform
    const payload = addSkillViaContextMenu(
      result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK, 1 * FPS,
    );

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const basicEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basicEvents).toHaveLength(1);

    const link = linkEvent(0, 10 * FPS);
    const rawBasic = cloneEvent(basicEvents[0]);

    processCombatSimulation([link, rawBasic]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawBasic.uid)).toBe(0);
  });

  it('freeform combo does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO);
    if (!comboCol?.defaultEvent) return;

    // Layer 1: Context menu — combo may be disabled even in freeform (requires trigger)
    const comboFrame = 1 * FPS;
    const menuItems = buildContextMenu(result.current, comboCol!, comboFrame);
    if (!menuItems) return;
    const addItem = menuItems.find(i => i.actionId === 'addEvent');
    if (!addItem || addItem.disabled) return;

    const payload = getMenuPayload(result.current, comboCol!, comboFrame);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const comboEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_AKEKURI && ev.columnId === NounType.COMBO,
    );
    if (comboEvents.length === 0) return;

    const link = linkEvent(0, 10 * FPS);
    const rawCombo = cloneEvent(comboEvents[0]);

    processCombatSimulation([link, rawCombo]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawCombo.uid)).toBe(0);
  });
});
