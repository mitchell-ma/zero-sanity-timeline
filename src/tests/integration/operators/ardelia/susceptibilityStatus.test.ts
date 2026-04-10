/**
 * @jest-environment jsdom
 */

/**
 * Ardelia Battle Skill — Susceptibility Status Application
 *
 * Tests that Dolly Rush applies Physical and Arts Susceptibility STATUS
 * to the enemy when Corrosion is consumed.
 *
 * Verifies all three layers:
 * 1. Context menu: skill menu items are available and enabled
 * 2. Controller: allProcessedEvents contains susceptibility events with correct values
 * 3. View: computeTimelinePresentation includes susceptibility events in the correct column
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { REACTION_COLUMNS, ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { NounType, AdjectiveType, isQualifiedId } from '../../../../dsl/semantics';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

const SLOT_ARDELIA = 'slot-3';

/**
 * Find a column by owner whose matchColumnIds includes the given columnId.
 * Used for unified columns (enemy status) that collect events via matchColumnIds.
 */
function findMatchingColumn(app: AppResult, ownerEntityId: string, matchId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ownerEntityId &&
      (c.matchColumnIds?.includes(matchId) ?? false),
  );
}

describe('Ardelia Dolly Rush — Susceptibility Status', () => {
  // ── Strict mode: basic → combo → battle pipeline ──────────────────────

  describe('Strict mode pipeline', () => {
    it('applies Physical and Arts Susceptibility statuses to enemy after consuming Corrosion', () => {
      const { result } = renderHook(() => useApp());

      // ── Context menu layer ──────────────────────────────────────────
      const basicCol = findColumn(result.current, SLOT_ARDELIA, NounType.BASIC_ATTACK);
      const comboCol = findColumn(result.current, SLOT_ARDELIA, NounType.COMBO);
      const battleCol = findColumn(result.current, SLOT_ARDELIA, NounType.BATTLE);
      expect(basicCol).toBeDefined();
      expect(comboCol).toBeDefined();
      expect(battleCol).toBeDefined();

      // Verify context menus are available
      const basicMenu = buildContextMenu(result.current, basicCol!, 0);
      expect(basicMenu).not.toBeNull();
      expect(basicMenu!.length).toBeGreaterThan(0);

      // 1. Basic attack at frame 0 via context menu
      const basicPayload = getMenuPayload(result.current, basicCol!, 0);
      act(() => {
        result.current.handleAddEvent(
          basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
        );
      });

      // 2. Combo skill at 10s via context menu
      const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
      act(() => {
        result.current.handleAddEvent(
          comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
        );
      });

      // Verify corrosion exists on enemy before battle skill
      const corrosionBefore = result.current.allProcessedEvents.filter(
        ev => ev.columnId === REACTION_COLUMNS.CORROSION && ev.ownerEntityId === ENEMY_ID,
      );
      expect(corrosionBefore.length).toBeGreaterThan(0);

      // 3. Battle skill at 15s via context menu
      const battlePayload = getMenuPayload(result.current, battleCol!, 15 * FPS);
      act(() => {
        result.current.handleAddEvent(
          battlePayload.ownerEntityId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
        );
      });

      // ── Controller layer ────────────────────────────────────────────
      // Verify susceptibility statuses on enemy
      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => isQualifiedId(ev.columnId, NounType.SUSCEPTIBILITY) && ev.ownerEntityId === ENEMY_ID,
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

      // ── View layer ──────────────────────────────────────────────────
      // Verify susceptibility events appear in the view presentation
      const viewModels = computeTimelinePresentation(
        result.current.allProcessedEvents,
        result.current.columns,
      );

      // Find the enemy status column (unified column that matches susceptibility via matchColumnIds)
      const enemyStatusCol = findMatchingColumn(result.current, ENEMY_ID, NounType.SUSCEPTIBILITY);
      expect(enemyStatusCol).toBeDefined();

      const vm = viewModels.get(enemyStatusCol!.key);
      expect(vm).toBeDefined();

      const susceptInVM = vm!.events.filter(
        ev => isQualifiedId(ev.columnId, NounType.SUSCEPTIBILITY) && ev.ownerEntityId === ENEMY_ID,
      );
      expect(susceptInVM).toHaveLength(2);

      // Verify the view model events match the controller events
      const vmUids = new Set(susceptInVM.map(ev => ev.uid));
      for (const ev of susceptEvents) {
        expect(vmUids.has(ev.uid)).toBe(true);
      }
    });

    it('does not apply susceptibility when enemy has no Corrosion', () => {
      const { result } = renderHook(() => useApp());

      const battleCol = findColumn(result.current, SLOT_ARDELIA, NounType.BATTLE);
      expect(battleCol).toBeDefined();

      // Context menu available for battle skill
      const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);

      // Battle skill without prior corrosion
      act(() => {
        result.current.handleAddEvent(
          battlePayload.ownerEntityId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
        );
      });

      // No susceptibility should appear
      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => isQualifiedId(ev.columnId, NounType.SUSCEPTIBILITY) && ev.ownerEntityId === ENEMY_ID,
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

      const basicCol = findColumn(result.current, SLOT_ARDELIA, NounType.BASIC_ATTACK);
      const comboCol = findColumn(result.current, SLOT_ARDELIA, NounType.COMBO);
      const battleCol = findColumn(result.current, SLOT_ARDELIA, NounType.BATTLE);

      // Basic → Combo → Battle all via freeform context menu
      const basicPayload = getMenuPayload(result.current, basicCol!, 0);
      act(() => {
        result.current.handleAddEvent(
          basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
        );
      });

      const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
      act(() => {
        result.current.handleAddEvent(
          comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
        );
      });

      const battlePayload = getMenuPayload(result.current, battleCol!, 15 * FPS);
      act(() => {
        result.current.handleAddEvent(
          battlePayload.ownerEntityId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
        );
      });

      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => isQualifiedId(ev.columnId, NounType.SUSCEPTIBILITY) && ev.ownerEntityId === ENEMY_ID,
      );
      expect(susceptEvents).toHaveLength(2);
    });
  });

  // ── Mixed strict + freeform ───────────────────────────────────────────

  describe('Mixed strict + freeform', () => {
    it('freeform corrosion + strict battle skill triggers susceptibility', () => {
      const { result } = renderHook(() => useApp());

      // The enemy status column (DYNAMIC_SPLIT) holds all enemy micro-columns including corrosion.
      // In freeform mode, the context menu on this column exposes addEvent per micro-column.
      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });

      // Find the unified enemy status column
      const enemyStatusCol = findColumn(result.current, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
      expect(enemyStatusCol).toBeDefined();

      // Build context menu — should expose corrosion as one of the micro-column entries
      const menuItems = buildContextMenu(result.current, enemyStatusCol!, 10 * FPS);
      expect(menuItems).not.toBeNull();

      // Find the corrosion addEvent item by its actionPayload columnId
      const corrosionItem = menuItems!.find(
        i => i.actionId === 'addEvent' &&
          (i.actionPayload as { columnId: string })?.columnId === REACTION_COLUMNS.CORROSION,
      );
      expect(corrosionItem).toBeDefined();
      expect(corrosionItem!.disabled).toBeFalsy();

      const corrosionPayload = corrosionItem!.actionPayload as {
        ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
      };

      // Place corrosion via freeform context menu
      act(() => {
        result.current.handleAddEvent(
          corrosionPayload.ownerEntityId, corrosionPayload.columnId, corrosionPayload.atFrame, corrosionPayload.defaultSkill,
        );
      });

      // Switch back to strict for battle skill
      act(() => {
        result.current.setInteractionMode(InteractionModeType.STRICT);
      });

      const battleCol = findColumn(result.current, SLOT_ARDELIA, NounType.BATTLE);
      const battlePayload = getMenuPayload(result.current, battleCol!, 12 * FPS);
      act(() => {
        result.current.handleAddEvent(
          battlePayload.ownerEntityId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
        );
      });

      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => isQualifiedId(ev.columnId, NounType.SUSCEPTIBILITY) && ev.ownerEntityId === ENEMY_ID,
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

      const basicCol = findColumn(result.current, SLOT_ARDELIA, NounType.BASIC_ATTACK);
      const comboCol = findColumn(result.current, SLOT_ARDELIA, NounType.COMBO);
      const battleCol = findColumn(result.current, SLOT_ARDELIA, NounType.BATTLE);

      const basicPayload = getMenuPayload(result.current, basicCol!, 0);
      act(() => {
        result.current.handleAddEvent(
          basicPayload.ownerEntityId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
        );
      });

      const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
      act(() => {
        result.current.handleAddEvent(
          comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
        );
      });

      const battlePayload = getMenuPayload(result.current, battleCol!, 15 * FPS);
      act(() => {
        result.current.handleAddEvent(
          battlePayload.ownerEntityId, battlePayload.columnId, battlePayload.atFrame, battlePayload.defaultSkill,
        );
      });

      const susceptEvents = result.current.allProcessedEvents.filter(
        ev => isQualifiedId(ev.columnId, NounType.SUSCEPTIBILITY) && ev.ownerEntityId === ENEMY_ID,
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
