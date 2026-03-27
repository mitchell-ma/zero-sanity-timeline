/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Battle Skill — Susceptibility Status Application
 *
 * Tests that Dolly Rush applies Physical and Arts Susceptibility STATUS
 * to the enemy when Corrosion is consumed.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { SKILL_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { NounType, AdjectiveType } from '../../../../dsl/semantics';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_ARDELIA = 'slot-3';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Ardelia Dolly Rush — Susceptibility Status', () => {
  // ── Strict mode: basic → combo → battle pipeline ──────────────────────

  describe('Strict mode pipeline', () => {
    it('applies Physical and Arts Susceptibility statuses to enemy after consuming Corrosion', () => {
      const { result } = renderHook(() => useApp());

      const basicCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BASIC);
      const comboCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.COMBO);
      const battleCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BATTLE);
      expect(basicCol).toBeDefined();
      expect(comboCol).toBeDefined();
      expect(battleCol).toBeDefined();

      // 1. Basic attack at frame 0 (provides FINAL_STRIKE for combo trigger)
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!);
      });

      // 2. Combo skill at 10s (applies forced Corrosion to enemy)
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.COMBO, 10 * FPS, comboCol!.defaultEvent!);
      });

      // Verify corrosion exists on enemy before battle skill
      const corrosionBefore = result.current.allProcessedEvents.filter(
        ev => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerId === ENEMY_OWNER_ID,
      );
      expect(corrosionBefore.length).toBeGreaterThan(0);

      // 3. Battle skill at 15s (should consume corrosion and apply susceptibility)
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BATTLE, 15 * FPS, battleCol!.defaultEvent!);
      });

      // Verify susceptibility statuses on enemy
      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => ev.columnId === NounType.SUSCEPTIBILITY && ev.ownerId === ENEMY_OWNER_ID,
      );

      // Should have 2 events: one Physical, one Arts
      expect(susceptEvents).toHaveLength(2);

      // Each should have 30s duration
      for (const ev of susceptEvents) {
        const totalDur = ev.segments.reduce(
          (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
        );
        expect(totalDur).toBe(30 * FPS);
      }

      // Verify one has PHYSICAL susceptibility and the other has ARTS
      const physEv = susceptEvents.find(ev => ev.susceptibility?.[AdjectiveType.PHYSICAL] != null);
      const artsEv = susceptEvents.find(ev => ev.susceptibility?.[AdjectiveType.ARTS] != null);
      expect(physEv).toBeDefined();
      expect(artsEv).toBeDefined();

      // P0 at max skill level (12): base 0.20 (no potential bonus)
      expect(physEv!.susceptibility![AdjectiveType.PHYSICAL]).toBeCloseTo(0.20, 2);
      expect(artsEv!.susceptibility![AdjectiveType.ARTS]).toBeCloseTo(0.20, 2);
    });

    it('does not apply susceptibility when enemy has no Corrosion', () => {
      const { result } = renderHook(() => useApp());

      const battleCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BATTLE);
      expect(battleCol).toBeDefined();

      // Battle skill without prior corrosion
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BATTLE, 5 * FPS, battleCol!.defaultEvent!);
      });

      // No susceptibility should appear
      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => ev.columnId === NounType.SUSCEPTIBILITY && ev.ownerId === ENEMY_OWNER_ID,
      );
      expect(susceptEvents).toHaveLength(0);
    });
  });

  // ── Freeform mode ─────────────────────────────────────────────────────

  describe('Freeform mode pipeline', () => {
    it('susceptibility still applied when all events placed in freeform mode', () => {
      const { result } = renderHook(() => useApp());

      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });

      const basicCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BASIC);
      const comboCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.COMBO);
      const battleCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BATTLE);

      // Basic → Combo → Battle all in freeform
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!);
      });
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.COMBO, 10 * FPS, comboCol!.defaultEvent!);
      });
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BATTLE, 15 * FPS, battleCol!.defaultEvent!);
      });

      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => ev.columnId === NounType.SUSCEPTIBILITY && ev.ownerId === ENEMY_OWNER_ID,
      );
      expect(susceptEvents).toHaveLength(2);
    });
  });

  // ── Mixed strict + freeform ───────────────────────────────────────────

  describe('Mixed strict + freeform', () => {
    it('freeform corrosion + strict battle skill triggers susceptibility', () => {
      const { result } = renderHook(() => useApp());

      // Place corrosion manually in freeform mode
      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID,
          REACTION_COLUMNS.CORROSION,
          10 * FPS,
          {
            name: REACTION_COLUMNS.CORROSION,
            segments: [{ properties: { duration: 10 * FPS } }],
            sourceOwnerId: ENEMY_OWNER_ID,
          },
        );
      });

      // Switch back to strict for battle skill
      act(() => {
        result.current.setInteractionMode(InteractionModeType.STRICT);
      });

      const battleCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BATTLE);
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BATTLE, 12 * FPS, battleCol!.defaultEvent!);
      });

      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => ev.columnId === NounType.SUSCEPTIBILITY && ev.ownerId === ENEMY_OWNER_ID,
      );
      expect(susceptEvents).toHaveLength(2);
    });
  });

  // ── P1 potential bonus ────────────────────────────────────────────────

  describe('Potential scaling', () => {
    it('P1 adds +8% to both susceptibility values', () => {
      const { result } = renderHook(() => useApp());

      // Set Ardelia to P1
      const props = result.current.loadoutProperties[SLOT_ARDELIA];
      act(() => {
        result.current.handleStatsChange(SLOT_ARDELIA, {
          ...props,
          operator: { ...props.operator, potential: 1 },
        });
      });

      const basicCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BASIC);
      const comboCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.COMBO);
      const battleCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.BATTLE);

      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BASIC, 0, basicCol!.defaultEvent!);
      });
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.COMBO, 10 * FPS, comboCol!.defaultEvent!);
      });
      act(() => {
        result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.BATTLE, 15 * FPS, battleCol!.defaultEvent!);
      });

      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => ev.columnId === NounType.SUSCEPTIBILITY && ev.ownerId === ENEMY_OWNER_ID,
      );
      expect(susceptEvents).toHaveLength(2);

      const physEv = susceptEvents.find(ev => ev.susceptibility?.[AdjectiveType.PHYSICAL] != null);
      const artsEv = susceptEvents.find(ev => ev.susceptibility?.[AdjectiveType.ARTS] != null);
      expect(physEv).toBeDefined();
      expect(artsEv).toBeDefined();

      // P1 at max skill level (12): 0.20 (base) + 0.08 (P1 bonus) = 0.28
      expect(physEv!.susceptibility![AdjectiveType.PHYSICAL]).toBeCloseTo(0.28, 2);
      expect(artsEv!.susceptibility![AdjectiveType.ARTS]).toBeCloseTo(0.28, 2);
    });
  });
});
