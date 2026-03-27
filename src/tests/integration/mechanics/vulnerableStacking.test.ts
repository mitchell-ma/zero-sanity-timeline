/**
 * @jest-environment jsdom
 */

/**
 * Vulnerable Stacking — Integration Tests
 *
 * Tests that Vulnerable infliction stacks are labeled I–IV and cap at 4,
 * regardless of whether events come from strict mode (operator battle skills)
 * or freeform mode (user-placed inflictions on the enemy).
 *
 * A. Strict mode: Chen Qianyu battle skills → engine-derived Vulnerable
 * B. Freeform mode: user-placed Vulnerable inflictions directly on enemy
 * C. Mixed: freeform Vulnerable stacks + strict battle skill stacks interact
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import {
  SKILL_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_OWNER_ID,
  USER_ID,
} from '../../../model/channels';
import { ColumnType, EventStatusType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT_CHEN = 'slot-0';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

function findEnemyColumn(app: ReturnType<typeof useApp>, columnId: string) {
  return findColumn(app, ENEMY_OWNER_ID, columnId);
}

function getVulnerableEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents
    .filter((ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID)
    .sort((a, b) => a.startFrame - b.startFrame);
}

// ── A. Strict mode ──────────────────────────────────────────────────────────

describe('Vulnerable stacking — strict mode (Chen Qianyu battle skills)', () => {
  it('five battle skills produce stacks I, II, III, IV, IV', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU'); });

    const battleCol = findColumn(result.current, SLOT_CHEN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_CHEN, SKILL_COLUMNS.BATTLE, (2 + i * 2) * FPS, battleCol!.defaultEvent!,
        );
      });
    }

    const sorted = getVulnerableEvents(result.current);
    expect(sorted).toHaveLength(5);

    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
    for (let i = 1; i < 5; i++) {
      expect(sorted[i].eventStatus).not.toBe(EventStatusType.CONSUMED);
    }
  });
});

// ── B. Freeform mode ────────────────────────────────────────────────────────

describe('Vulnerable stacking — freeform mode (user-placed inflictions)', () => {
  it('five freeform vulnerables produce stacks I, II, III, IV, IV', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const vulnCol = findEnemyColumn(result.current, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE);
    expect(vulnCol).toBeDefined();

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID,
          PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
          (2 + i * 2) * FPS,
          {
            name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
            segments: [{ properties: { duration: 20 * FPS } }],
            sourceOwnerId: USER_ID,
            sourceSkillName: 'Freeform',
          },
        );
      });
    }

    const sorted = getVulnerableEvents(result.current);
    expect(sorted).toHaveLength(5);

    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
    for (let i = 1; i < 5; i++) {
      expect(sorted[i].eventStatus).not.toBe(EventStatusType.CONSUMED);
    }
  });
});

// ── C. Mixed mode ───────────────────────────────────────────────────────────

describe('Vulnerable stacking — mixed freeform + strict', () => {
  it('freeform vulnerable stacks combine with strict battle skill stacks', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU'); });

    // Place 2 freeform vulnerables first
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    for (let i = 0; i < 2; i++) {
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID,
          PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
          (1 + i * 2) * FPS,
          {
            name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
            segments: [{ properties: { duration: 20 * FPS } }],
            sourceOwnerId: USER_ID,
            sourceSkillName: 'Freeform',
          },
        );
      });
    }

    // Then add 3 strict battle skills (still freeform mode to bypass SP)
    const battleCol = findColumn(result.current, SLOT_CHEN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_CHEN, SKILL_COLUMNS.BATTLE, (6 + i * 2) * FPS, battleCol!.defaultEvent!,
        );
      });
    }

    const sorted = getVulnerableEvents(result.current);
    // 2 freeform + 3 from battle skills = 5 total
    expect(sorted).toHaveLength(5);

    // Stacks accumulate across sources: I, II, III, IV, IV
    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    // First event consumed when 5th arrived
    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });

  it('strict battle skill before freeform vulnerable produces correct stack sequence', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU'); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // 1 strict battle skill first
    const battleCol = findColumn(result.current, SLOT_CHEN, SKILL_COLUMNS.BATTLE);
    expect(battleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, SKILL_COLUMNS.BATTLE, 2 * FPS, battleCol!.defaultEvent!,
      );
    });

    // Then 4 freeform vulnerables
    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID,
          PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
          (5 + i * 2) * FPS,
          {
            name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
            segments: [{ properties: { duration: 20 * FPS } }],
            sourceOwnerId: USER_ID,
            sourceSkillName: 'Freeform',
          },
        );
      });
    }

    const sorted = getVulnerableEvents(result.current);
    expect(sorted).toHaveLength(5);

    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });
});
