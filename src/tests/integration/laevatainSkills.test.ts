/**
 * @jest-environment jsdom
 */

/**
 * Laevatain — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. User adds Laevatain's skills via handleAddEvent (same path as right-click → context menu)
 * 2. Verify skills don't crash the pipeline
 * 3. Verify battle skill generates 1 Melting Flame stack
 * 4. Verify basic attack absorbs enemy heat inflictions and generates Melting Flames at 1:1 ratio
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, OPERATOR_COLUMNS, INFLICTION_COLUMNS, ENEMY_OWNER_ID, USER_ID } from '../../model/channels';
import { EnhancementType, EventStatusType } from '../../consts/enums';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { eventDuration } from '../../consts/viewTypes';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_LAEVATAIN = 'slot-0';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

/**
 * Build a multi-segment basic attack event payload that triggers Final Strike
 * absorption. The context menu default is a single-sequence BATK; the engine
 * needs ≥ 2 segments to resolve FINAL_STRIKE.
 */
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

describe('Laevatain Skills — integration through useApp', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // A. Each skill type doesn't crash the pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  it('basic attack added without crash', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 2 * FPS, col!.defaultEvent!,
      );
    });

    const basics = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BASIC,
    );
    expect(basics.length).toBeGreaterThanOrEqual(1);
  });

  it('battle skill added without crash', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 5 * FPS, col!.defaultEvent!,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battles).toHaveLength(1);
  });

  it('combo skill added without crash', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.COMBO);
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.COMBO, 5 * FPS, col!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('ultimate added without crash', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE);
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.ULTIMATE, 5 * FPS, col!.defaultEvent!,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Battle skill generates 1 Melting Flame stack
  // ═══════════════════════════════════════════════════════════════════════════

  it('battle skill generates 1 Melting Flame stack', () => {
    const { result } = renderHook(() => useApp());
    const col = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);
    expect(col).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 5 * FPS, col!.defaultEvent!,
      );
    });

    const mfProcessed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
    );
    expect(mfProcessed).toHaveLength(1);
    expect(mfProcessed[0].sourceSkillName).toBe('SMOULDERING_FIRE');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Heat infliction absorption via basic attack → Melting Flame at 1:1
  //
  // Absorption triggers on FINAL_STRIKE which requires a multi-segment basic
  // attack (≥ 2 segments). The context menu default is a single sequence, so
  // we construct the multi-segment payload to simulate a full basic chain.
  // ═══════════════════════════════════════════════════════════════════════════

  it.each([1, 2, 3, 4])(
    'basic attack absorbs %i heat infliction(s) and generates Melting Flame at 1:1',
    (heatCount) => {
      const { result } = renderHook(() => useApp());
      const basicCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);
      expect(basicCol).toBeDefined();

      // Place heat inflictions on enemy via freeform add (staggered by 1 frame)
      for (let i = 0; i < heatCount; i++) {
        act(() => {
          result.current.handleAddEvent(
            ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS + i,
            {
              name: INFLICTION_COLUMNS.HEAT,
              segments: [{ properties: { duration: 20 * FPS } }],
              sourceOwnerId: USER_ID,
            },
          );
        });
      }

      // Verify heat inflictions exist before basic attack
      const heatsBefore = result.current.allProcessedEvents.filter(
        (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
      );
      expect(heatsBefore).toHaveLength(heatCount);

      // Add multi-segment basic attack (triggers FINAL_STRIKE absorption)
      const multiSegBasic = buildMultiSegmentBasic(basicCol!.defaultEvent!);
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 3 * FPS, multiSegBasic,
        );
      });

      // Melting Flames generated at 1:1 ratio with absorbed heat inflictions
      const mfEvents = result.current.allProcessedEvents.filter(
        (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
      );
      expect(mfEvents).toHaveLength(heatCount);

      // Heat inflictions should be consumed
      const heatsAfter = result.current.allProcessedEvents.filter(
        (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
          && ev.ownerId === ENEMY_OWNER_ID
          && ev.eventStatus === EventStatusType.CONSUMED,
      );
      expect(heatsAfter).toHaveLength(heatCount);
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // D. MF stacks from compound trigger (heat absorption) are permanent
  // ═══════════════════════════════════════════════════════════════════════════

  it('MF from heat absorption has TOTAL_FRAMES duration', () => {
    const { result } = renderHook(() => useApp());
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);

    // Place 1 heat infliction + multi-segment basic to trigger absorption
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }], sourceOwnerId: USER_ID },
      );
    });
    const multiSegBasic = buildMultiSegmentBasic(basicCol!.defaultEvent!);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 3 * FPS, multiSegBasic);
    });

    const mfEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
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
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // Place 4 battle skills well-spaced to generate 4 MF stacks
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, (2 + i * 10) * FPS, battleCol!.defaultEvent!,
        );
      });
    }

    // Verify all 4 battle skills were added
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAEVATAIN && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(battleEvents).toHaveLength(4);

    // Verify 4 MF stacks exist
    const mfBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfBefore).toHaveLength(4);

    // Find empowered variant from battle column
    const empoweredVariant = battleCol!.eventVariants?.find(
      (v) => v.enhancementType === EnhancementType.EMPOWERED,
    );
    expect(empoweredVariant).toBeDefined();

    // Add empowered BS well after all 4 battle skills have triggered MF
    act(() => {
      result.current.handleAddEvent(
        SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, 50 * FPS, empoweredVariant!,
      );
    });

    // All 4 MF stacks should be consumed
    const mfAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN,
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
    const basicCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC);
    const battleCol = findColumn(result.current, SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE);

    // 1. Generate 4 MF stacks via 4 battle skills (each produces 1 MF)
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_LAEVATAIN, SKILL_COLUMNS.BATTLE, (2 + i * 10) * FPS, battleCol!.defaultEvent!,
        );
      });
    }

    // Verify 4 MF stacks (max)
    const mfStacks = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfStacks).toHaveLength(4);

    // 2. Add heat inflictions on enemy AFTER all battle skills
    const inflictionFrame = 60 * FPS;
    for (let i = 0; i < 2; i++) {
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, inflictionFrame + i,
          {
            name: INFLICTION_COLUMNS.HEAT,
            segments: [{ properties: { duration: 20 * FPS } }],
            sourceOwnerId: USER_ID,
          },
        );
      });
    }

    // 3. Add multi-segment basic attack after heat inflictions (triggers FINAL_STRIKE)
    const multiSegBasic = buildMultiSegmentBasic(basicCol!.defaultEvent!);
    act(() => {
      result.current.handleAddEvent(SLOT_LAEVATAIN, SKILL_COLUMNS.BASIC, 65 * FPS, multiSegBasic);
    });

    // 4. Heat inflictions should NOT be consumed (ALL pre-validation fails: can't APPLY more MF)
    const heatsConsumed = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(heatsConsumed).toHaveLength(0);

    // 5. MF stacks should still be exactly 4 (unchanged)
    const mfAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME && ev.ownerId === SLOT_LAEVATAIN
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(mfAfter).toHaveLength(4);
  });
});
