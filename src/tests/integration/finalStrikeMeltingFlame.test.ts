/**
 * @jest-environment jsdom
 */

/**
 * Final Strike → Melting Flame Exchange Timing — Integration Test
 *
 * Verifies that when Akekuri's battle skill applies heat infliction and
 * then a basic attack reaches its final strike, the Scorching Heart
 * exchange (heat → melting flame) occurs at the final strike frame,
 * not at the basic attack's start frame.
 *
 * Setup: Laevatain (slot-0) + Akekuri (slot-1) in the team.
 * Laevatain's Scorching Heart talent triggers on ANY operator PERFORM
 * FINAL_STRIKE when the enemy has heat infliction.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, INFLICTION_COLUMNS, OPERATOR_COLUMNS, ENEMY_OWNER_ID } from '../../model/channels';
import { InteractionModeType, EventStatusType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_LAEVATAIN = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

function getHeatInflictions(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
  );
}

function getMeltingFlameEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
  );
}

describe('Final Strike → Melting Flame exchange timing', () => {
  it('MF is generated at the final strike frame, not at basic attack start', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place Akekuri battle skill at 2s — creates heat infliction
    const battleCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BATTLE, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Verify heat infliction exists
    const heatsAfterBattle = getHeatInflictions(result.current);
    expect(heatsAfterBattle.length).toBeGreaterThanOrEqual(1);

    // Place Akekuri basic attack at 5s (well after heat infliction)
    const basicCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BASIC);
    expect(basicCol).toBeDefined();

    const basicStartFrame = 5 * FPS;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BASIC, basicStartFrame, basicCol!.defaultEvent!,
      );
    });

    // Verify the basic attack was added
    const basicEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.BASIC,
    );
    expect(basicEvent).toBeDefined();

    // Verify heat infliction was consumed (exchange happened)
    const heatsAfterBasic = getHeatInflictions(result.current);
    const consumedHeats = heatsAfterBasic.filter(
      (ev) => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedHeats.length).toBeGreaterThanOrEqual(1);

    // Verify melting flame was generated
    const mfEvents = getMeltingFlameEvents(result.current);
    expect(mfEvents.length).toBeGreaterThanOrEqual(1);

    // THE KEY ASSERTION: MF startFrame must be AFTER the basic attack start.
    // The final strike is the last frame of the last segment, which is well
    // past the basic attack's startFrame.
    const mfEvent = mfEvents[0];
    expect(mfEvent.startFrame).toBeGreaterThan(basicStartFrame);
  });

  it('without basic attack final strike, no exchange occurs from battle skill alone', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place only the battle skill — heat infliction exists but no final strike
    const battleCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BATTLE, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Heat infliction exists
    const heats = getHeatInflictions(result.current);
    expect(heats.length).toBeGreaterThanOrEqual(1);

    // No melting flame should exist — no final strike to trigger the exchange
    const mfEvents = getMeltingFlameEvents(result.current);
    expect(mfEvents).toHaveLength(0);
  });
});
