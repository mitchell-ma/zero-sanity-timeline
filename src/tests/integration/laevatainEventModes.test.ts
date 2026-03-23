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
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, OPERATOR_COLUMNS, INFLICTION_COLUMNS, ENEMY_OWNER_ID, USER_ID } from '../../model/channels';
import { EnhancementType, EventStatusType, InteractionModeType } from '../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { eventDuration } from '../../consts/viewTypes';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_LAEVATAIN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

function getMfDefault(app: ReturnType<typeof useApp>) {
  const statusCol = findColumn(app, SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME);
  const mfMicro = statusCol!.microColumns?.find((mc) => mc.id === OPERATOR_COLUMNS.MELTING_FLAME);
  return mfMicro!.defaultEvent!;
}

function buildMultiSegmentBasic(defaultEvent: NonNullable<MiniTimeline['defaultEvent']>) {
  const seg = defaultEvent.segments![0];
  return {
    ...defaultEvent,
    segments: [
      seg,
      { properties: { duration: seg.properties.duration, name: 'II' } },
      { properties: { duration: seg.properties.duration, name: 'III' }, frames: seg.frames },
    ],
  };
}

function getEmpoweredVariant(app: ReturnType<typeof useApp>) {
  const battleCol = findColumn(app, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
  return battleCol!.eventVariants?.find((v) => v.enhancementType === EnhancementType.EMPOWERED)!;
}

function getEnhancedVariant(app: ReturnType<typeof useApp>) {
  const battleCol = findColumn(app, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
  return battleCol!.eventVariants?.find((v) => v.enhancementType === EnhancementType.ENHANCED)!;
}

/** Place N heat inflictions on the enemy starting at the given frame. */
function placeHeatInflictions(app: ReturnType<typeof useApp>, count: number, startFrame: number) {
  for (let i = 0; i < count; i++) {
    act(() => {
      app.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, startFrame + i,
        {
          name: INFLICTION_COLUMNS.HEAT,
          segments: [{ properties: { duration: 20 * FPS } }],
          sourceOwnerId: USER_ID,
        },
      );
    });
  }
}

/** Place N freeform MF stacks 1s apart starting at the given frame. */
function placeMfStacks(app: ReturnType<typeof useApp>, count: number, startFrame: number) {
  const mfDefault = getMfDefault(app);
  for (let i = 0; i < count; i++) {
    act(() => {
      app.handleAddEvent(SLOT_LAEVATAIN, OPERATOR_COLUMNS.MELTING_FLAME, startFrame + i * FPS, mfDefault);
    });
  }
}

function getMfEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
  );
}

function getUnconsumedMf(app: ReturnType<typeof useApp>) {
  return getMfEvents(app).filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
}

function getConsumedMf(app: ReturnType<typeof useApp>) {
  return getMfEvents(app).filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Freeform events interact with the engine
// ═══════════════════════════════════════════════════════════════════════════════

describe('Freeform events — engine interactions', () => {
  it('freeform MF stacks block engine-derived MF from exceeding the cap', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 3 freeform MF stacks
    placeMfStacks(result.current, 3, 2 * FPS);
    expect(getUnconsumedMf(result.current)).toHaveLength(3);

    // Add 2 battle skills in freeform — each generates 1 MF via engine
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 10 * FPS, battleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 20 * FPS, battleCol!.defaultEvent!);
    });

    // Only 1 engine MF should be created (3 freeform + 1 engine = 4 cap)
    // The second battle skill's MF is blocked by the stack limit
    expect(getUnconsumedMf(result.current)).toHaveLength(4);
  });

  it('freeform heat inflictions are absorbed by FINAL_STRIKE and produce MF', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place heat inflictions manually
    placeHeatInflictions(result.current, 3, 1 * FPS);

    // Add multi-segment basic attack to trigger FINAL_STRIKE absorption
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);
    const multiSegBasic = buildMultiSegmentBasic(basicCol!.defaultEvent!);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 3 * FPS, multiSegBasic);
    });

    // Freeform heat inflictions consumed by engine
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(3);

    // Engine generates MF at 1:1 from absorbed freeform heat
    expect(getMfEvents(result.current)).toHaveLength(3);
  });

  it('freeform MF has same TOTAL_FRAMES duration as engine-derived MF', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 1 freeform MF and 1 battle skill (engine-derived MF)
    placeMfStacks(result.current, 1, 2 * FPS);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 10 * FPS, battleCol!.defaultEvent!);
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

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // Build up 4 MF stacks via 4 battle skills
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, (2 + i * 10) * FPS, battleCol!.defaultEvent!,
        );
      });
    }
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Empowered BS consumes all 4 engine-derived MF stacks
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 50 * FPS, getEmpoweredVariant(result.current),
      );
    });
    expect(getConsumedMf(result.current)).toHaveLength(4);
  });

  it('ultimate → enhanced BS during active phase processes with damage frames', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Place ultimate
    const ultCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!);
    });

    // Find active phase start
    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.ULTIMATE,
    );
    const ultSegs = ultEvents[0].segments;
    const activationEnd = ultEvents[0].startFrame + ultSegs[0].properties.duration + ultSegs[1].properties.duration;

    // Place enhanced BS during active phase
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, activationEnd + FPS, getEnhancedVariant(result.current),
      );
    });

    // Enhanced BS is accepted and has damage frames (unlike normal BS, it does not generate MF)
    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].enhancementType).toBe(EnhancementType.ENHANCED);
    expect(battles[0].segments[0].frames!.length).toBeGreaterThan(0);
    expect(getMfEvents(result.current)).toHaveLength(0);
  });

  it('strict rejects enhanced BS without ultimate, but accepts with ultimate', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Try enhanced BS without ultimate — rejected
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 5 * FPS, getEnhancedVariant(result.current),
      );
    });
    const battlesBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battlesBefore).toHaveLength(0);

    // Place ultimate, then enhanced BS during active phase — accepted
    const ultCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!);
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.ULTIMATE,
    );
    const ultSegs = ultEvents[0].segments;
    const activationEnd = ultEvents[0].startFrame + ultSegs[0].properties.duration + ultSegs[1].properties.duration;

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, activationEnd + FPS, getEnhancedVariant(result.current),
      );
    });

    const battlesAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battlesAfter).toHaveLength(1);
    expect(battlesAfter[0].enhancementType).toBe(EnhancementType.ENHANCED);
  });

  it('strict overlap rejection prevents duplicate MF generation', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // Add battle skill, then try to overlap — rejected
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 5 * FPS, battleCol!.defaultEvent!);
    });
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 5 * FPS, battleCol!.defaultEvent!);
    });

    // Only 1 battle skill → only 1 MF
    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
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

    // Place 4 MF stacks in freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 4, 2 * FPS);
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Switch to strict — empowered BS consumes the freeform MF
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 10 * FPS, getEmpoweredVariant(result.current),
      );
    });

    expect(getConsumedMf(result.current)).toHaveLength(4);
  });

  it('strict engine-derived MF consumed by freeform empowered BS', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Build 4 MF stacks via strict battle skills
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, (2 + i * 10) * FPS, battleCol!.defaultEvent!,
        );
      });
    }
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Switch to freeform — empowered BS consumes the engine-derived MF
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 50 * FPS, getEmpoweredVariant(result.current),
      );
    });

    expect(getConsumedMf(result.current)).toHaveLength(4);
  });

  it('freeform ultimate enables strict enhanced BS', () => {
    const { result } = renderHook(() => useApp());

    // Place ultimate in freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const ultCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE, 5 * FPS, ultCol!.defaultEvent!);
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.ULTIMATE,
    );
    const ultSegs = ultEvents[0].segments;
    const activationEnd = ultEvents[0].startFrame + ultSegs[0].properties.duration + ultSegs[1].properties.duration;

    // Switch to strict — enhanced BS accepted because freeform ultimate is active
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, activationEnd + FPS, getEnhancedVariant(result.current),
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].enhancementType).toBe(EnhancementType.ENHANCED);
  });

  it('freeform heat inflictions absorbed by strict basic attack', () => {
    const { result } = renderHook(() => useApp());

    // Place heat inflictions in freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeHeatInflictions(result.current, 3, 1 * FPS);

    // Switch to strict — multi-segment basic absorbs the freeform heat
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);
    const multiSegBasic = buildMultiSegmentBasic(basicCol!.defaultEvent!);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 3 * FPS, multiSegBasic);
    });

    // Freeform heat consumed, MF generated at 1:1
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(3);
    expect(getMfEvents(result.current)).toHaveLength(3);
  });

  it('freeform MF + engine-derived MF combine toward the stack cap', () => {
    const { result } = renderHook(() => useApp());

    // Place 2 freeform MF stacks
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 2, 2 * FPS);

    // Add 3 strict battle skills — only the first 2 should produce MF (cap = 4)
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, (10 + i * 10) * FPS, battleCol!.defaultEvent!,
        );
      });
    }

    // 2 freeform + 2 engine = 4 (cap). Third battle skill's MF is blocked.
    expect(getUnconsumedMf(result.current)).toHaveLength(4);
  });

  it('freeform MF + freeform heat + strict basic = full absorption fills cap', () => {
    const { result } = renderHook(() => useApp());

    // Place 2 freeform MF and 2 freeform heat inflictions
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeMfStacks(result.current, 2, 2 * FPS);
    placeHeatInflictions(result.current, 2, 1 * FPS);

    // Switch to strict — basic attack absorbs heat → generates 2 more MF → cap
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);
    const multiSegBasic = buildMultiSegmentBasic(basicCol!.defaultEvent!);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 5 * FPS, multiSegBasic);
    });

    // 2 freeform MF + 2 from absorption = 4 total (cap)
    expect(getUnconsumedMf(result.current)).toHaveLength(4);

    // Heat consumed
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(2);
  });
});
