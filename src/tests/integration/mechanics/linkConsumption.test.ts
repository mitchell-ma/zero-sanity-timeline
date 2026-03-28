/**
 * @jest-environment jsdom
 */

/**
 * Link Consumption — Integration Tests
 *
 * Tests the Link team status consumption through the full pipeline:
 * useApp → handleAddEvent → processCombatSimulation → DEC link tracking.
 *
 * Link is consumed when a battle skill or ultimate starts. The consumption
 * applies to the entire event (all frames). Basic attacks, finishers,
 * dive attacks, and combo skills do NOT consume Link.
 *
 * Since no operator currently produces Link through skills in the default lineup,
 * these tests inject Link events directly as raw events alongside skill events
 * and verify consumption through the DerivedEventController.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType, StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import type { TimelineEvent, MiniTimeline } from '../../../consts/viewTypes';
import { COMMON_OWNER_ID } from '../../../controller/slot/commonSlotController';
import { processCombatSimulation, getLastController } from '../../../controller/timeline/eventQueueController';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

let linkIdCounter = 0;

/** Create a Link team status event. */
function linkEvent(startFrame: number, durationFrames: number): TimelineEvent {
  return {
    uid: `link-integ-${linkIdCounter++}`,
    id: StatusType.LINK,
    name: StatusType.LINK,
    ownerId: COMMON_OWNER_ID,
    columnId: StatusType.LINK,
    startFrame,
    segments: [{ properties: { duration: durationFrames } }],
    sourceOwnerId: SLOT_LAEVATAIN,
    sourceSkillName: 'Test Link',
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

beforeEach(() => { linkIdCounter = 0; });

// ═════════════════════════════════════════════════════════════════════════════
// Integration: Link consumed by battle skill
// ═════════════════════════════════════════════════════════════════════════════

describe('Link Consumption — Integration', () => {
  it('battle skill consumes Link and records stacks on DEC', () => {
    const { result } = renderHook(() => useApp());

    // Get the real battle skill default from Akekuri
    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();

    // Add battle skill at 5s
    const battleFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, battleFrame, battleCol!.defaultEvent!,
      );
    });

    // Get the battle skill event that was added
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battleEvents).toHaveLength(1);

    // Now run processCombatSimulation directly with Link + the same battle skill
    const link = linkEvent(0, 10 * FPS);
    const rawBattle = cloneEvent(battleEvents[0]);

    processCombatSimulation([link, rawBattle]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawBattle.uid)).toBe(1);
  });

  it('ultimate consumes Link and records stacks on DEC', () => {
    const { result } = renderHook(() => useApp());

    // Get the real ultimate default from Akekuri
    const ultCol = findColumn(result.current, SLOT_AKEKURI, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    // Add ultimate at 5s
    const ultFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.ULTIMATE, ultFrame, ultCol!.defaultEvent!,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);

    // Run with Link active before the ultimate
    const link = linkEvent(0, 10 * FPS);
    const rawUlt = cloneEvent(ultEvents[0]);

    processCombatSimulation([link, rawUlt]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawUlt.uid)).toBe(1);
  });

  it('basic attack does NOT consume Link', () => {
    const { result } = renderHook(() => useApp());

    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();

    const basicFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BASIC_ATTACK, basicFrame, basicCol!.defaultEvent!,
      );
    });

    const basicEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
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

    const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO_SKILL);
    if (!comboCol?.defaultEvent) {
      // Some operators may not have combo skills with defaults
      return;
    }

    const comboFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.COMBO_SKILL, comboFrame, comboCol.defaultEvent!,
      );
    });

    const comboEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.COMBO_SKILL,
    );
    if (comboEvents.length === 0) return; // combo may require trigger

    const link = linkEvent(0, 10 * FPS);
    const rawCombo = cloneEvent(comboEvents[0]);

    processCombatSimulation([link, rawCombo]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawCombo.uid)).toBe(0);
  });

  it('first battle skill consumes Link, subsequent one does not', () => {
    const { result } = renderHook(() => useApp());

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();
    const defaultSkill = battleCol!.defaultEvent!;

    // Add two battle skills
    act(() => {
      result.current.handleAddEvent(SLOT_AKEKURI, NounType.BATTLE_SKILL, 5 * FPS, defaultSkill);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_AKEKURI, NounType.BATTLE_SKILL, 15 * FPS, defaultSkill);
    });

    const battleEvents = result.current.allProcessedEvents
      .filter((ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL)
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

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(SLOT_AKEKURI, NounType.BATTLE_SKILL, 3 * FPS, battleCol!.defaultEvent!);
    });

    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battleEvents).toHaveLength(1);

    const link = linkEvent(0, 10 * FPS);
    const rawBattle = cloneEvent(battleEvents[0]);

    const result2 = processCombatSimulation([link, rawBattle]);
    const linkEvents = result2.filter((ev) => ev.columnId === StatusType.LINK);
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

    const battleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();

    // In freeform, we can place at any frame without SP check
    const battleFrame = 1 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, battleFrame, battleCol!.defaultEvent!,
      );
    });

    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
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

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const ultCol = findColumn(result.current, SLOT_AKEKURI, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const ultFrame = 1 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.ULTIMATE, ultFrame, ultCol!.defaultEvent!,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.ULTIMATE,
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

    const basicCol = findColumn(result.current, SLOT_AKEKURI, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BASIC_ATTACK, 1 * FPS, basicCol!.defaultEvent!,
      );
    });

    const basicEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BASIC_ATTACK,
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

    const comboCol = findColumn(result.current, SLOT_AKEKURI, NounType.COMBO_SKILL);
    if (!comboCol?.defaultEvent) return;

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.COMBO_SKILL, 1 * FPS, comboCol.defaultEvent!,
      );
    });

    const comboEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.COMBO_SKILL,
    );
    if (comboEvents.length === 0) return;

    const link = linkEvent(0, 10 * FPS);
    const rawCombo = cloneEvent(comboEvents[0]);

    processCombatSimulation([link, rawCombo]);
    const controller = getLastController();
    expect(controller.getLinkStacks(rawCombo.uid)).toBe(0);
  });
});
