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
import { EventStatusType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
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
});
