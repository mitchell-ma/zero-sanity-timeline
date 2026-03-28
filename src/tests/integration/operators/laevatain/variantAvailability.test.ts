/**
 * @jest-environment jsdom
 */

/**
 * Laevatain Variant Availability — Integration Test
 *
 * Tests the ENABLE/DISABLE clause system for Laevatain's ultimate (Twilight).
 * Verifies which basic attack and battle skill variants are available based on
 * the presence of ultimate and Melting Flame stacks.
 *
 * Matrix:
 *   No MF, No Ult → NORMAL BATK, NORMAL BS
 *   4 MF,  No Ult → NORMAL BATK, EMPOWERED BS
 *   No MF, Ult    → ENHANCED BATK, ENHANCED BS
 *   4 MF,  Ult    → ENHANCED BATK, ENHANCED+EMPOWERED BS
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { NODE_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, USER_ID } from '../../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { EnhancementType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { checkVariantAvailability } from '../../../../controller/timeline/eventValidator';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const MELTING_FLAME_ID = 'MELTING_FLAME';
const SLOT = 'slot-0';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

function getMfDefault(app: ReturnType<typeof useApp>) {
  const statusCol = findColumn(app, SLOT, MELTING_FLAME_ID);
  const mfMicro = statusCol!.microColumns?.find((mc) => mc.id === MELTING_FLAME_ID);
  return mfMicro!.defaultEvent!;
}

/** Check availability of a variant at a given frame. */
function isAvailable(
  app: ReturnType<typeof useApp>,
  variantName: string,
  columnId: string,
  atFrame: number,
  enhancementType?: string,
) {
  return checkVariantAvailability(
    variantName, SLOT, [...app.allProcessedEvents], atFrame, columnId, app.slots, enhancementType,
  );
}

/** Place the ultimate at a given frame. */
function placeUltimate(app: ReturnType<typeof useApp>, atFrame: number) {
  const ultCol = findColumn(app, SLOT, NounType.ULTIMATE);
  act(() => {
    app.handleAddEvent(SLOT, NounType.ULTIMATE, atFrame, ultCol!.defaultEvent!);
  });
}

/** Place 4 Melting Flame stacks 1 second apart starting at the given frame. */
function place4MfStacks(app: ReturnType<typeof useApp>, startFrame: number) {
  const mfDefault = getMfDefault(app);
  for (let i = 0; i < 4; i++) {
    act(() => {
      app.handleAddEvent(SLOT, MELTING_FLAME_ID, startFrame + i * FPS, mfDefault);
    });
  }
}

// Frame inside the ultimate active window (after animation + stasis)
const ULT_START = 10 * FPS;
const ACTIVE_FRAME = ULT_START + 3 * FPS; // well within the 15s active segment

describe('Laevatain variant availability — integration through useApp', () => {
  describe('No MF, No Ult → NORMAL BATK, NORMAL BS', () => {
    it('normal basic attack is available', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, 'FLAMING_CINDERS', NounType.BASIC_ATTACK, 5 * FPS, EnhancementType.NORMAL);
      expect(r.disabled).toBe(false);
    });

    it('normal battle skill is available', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, 'SMOULDERING_FIRE', NounType.BATTLE_SKILL, 5 * FPS, EnhancementType.NORMAL);
      expect(r.disabled).toBe(false);
    });

    it('enhanced basic attack is disabled (no ENABLE)', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, 'FLAMING_CINDERS_ENHANCED', NounType.BASIC_ATTACK, 5 * FPS, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(true);
    });

    it('empowered battle skill is disabled (no MF stacks)', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_EMPOWERED', NounType.BATTLE_SKILL, 5 * FPS, EnhancementType.EMPOWERED);
      expect(r.disabled).toBe(true);
    });
  });

  describe('4 MF, No Ult → NORMAL BATK, EMPOWERED BS', () => {
    it('normal basic attack is available', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      const r = isAvailable(result.current, 'FLAMING_CINDERS', NounType.BASIC_ATTACK, 8 * FPS, EnhancementType.NORMAL);
      expect(r.disabled).toBe(false);
    });

    it('empowered battle skill is available (4 MF stacks)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_EMPOWERED', NounType.BATTLE_SKILL, 8 * FPS, EnhancementType.EMPOWERED);
      expect(r.disabled).toBe(false);
    });

    it('enhanced basic attack is disabled (no Ult)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      const r = isAvailable(result.current, 'FLAMING_CINDERS_ENHANCED', NounType.BASIC_ATTACK, 8 * FPS, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(true);
    });
  });

  describe('No MF, Ult → ENHANCED BATK, ENHANCED BS', () => {
    it('enhanced basic attack is available during ultimate', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'FLAMING_CINDERS_ENHANCED', NounType.BASIC_ATTACK, ACTIVE_FRAME, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(false);
    });

    it('enhanced battle skill requires 4 MF stacks (disabled without them even during ultimate)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_ENHANCED', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(true);
    });

    it('normal basic attack is disabled during ultimate (DISABLE NORMAL)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'FLAMING_CINDERS', NounType.BASIC_ATTACK, ACTIVE_FRAME, EnhancementType.NORMAL);
      expect(r.disabled).toBe(true);
    });

    it('normal battle skill is disabled during ultimate (DISABLE NORMAL)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.NORMAL);
      expect(r.disabled).toBe(true);
    });

    it('finisher is disabled during ultimate (DISABLE FINISHER)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'FINISHER', NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('finisher is disabled during ultimate even with active stagger break', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      // Place a node stagger event during the active window (freeform)
      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID, ACTIVE_FRAME - FPS,
          { name: NODE_STAGGER_COLUMN_ID, segments: [{ properties: { duration: 5 * FPS } }], sourceOwnerId: USER_ID },
        );
      });
      // Finisher should still be disabled by the DISABLE FINISHER clause
      const r = isAvailable(result.current, 'FINISHER', NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('empowered battle skill is disabled during ultimate (DISABLE EMPOWERED)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_EMPOWERED', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.EMPOWERED);
      expect(r.disabled).toBe(true);
    });

    it('enhanced+empowered battle skill is disabled (no MF stacks)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_ENHANCED_EMPOWERED', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(true);
    });

    it('ultimate energy gain is suppressed during ultimate active phase', () => {
      const { result } = renderHook(() => useApp());

      // Place ultimate
      placeUltimate(result.current, ULT_START);

      // Place an enhanced battle skill during the active window (generates gauge gain normally)
      const battleCol = findColumn(result.current, SLOT, NounType.BATTLE_SKILL);
      const enhancedVariant = battleCol!.eventVariants?.find(
        (v) => v.enhancementType === EnhancementType.ENHANCED,
      );
      act(() => {
        result.current.handleAddEvent(SLOT, NounType.BATTLE_SKILL, ACTIVE_FRAME, enhancedVariant!);
      });

      // Check the resource graph — energy should not increase during the active phase
      const ueGraph = result.current.resourceGraphs.get(`${SLOT}-ultimate`);
      expect(ueGraph).toBeDefined();

      // Find the point right after the battle skill — energy should not have gained
      // The IGNORE ULTIMATE_ENERGY clause on the animation segment suppresses gains
      const pointsDuringActive = ueGraph!.points.filter(
        (p) => p.frame >= ACTIVE_FRAME && p.frame <= ACTIVE_FRAME + 5 * FPS,
      );
      // All points during active phase should be at 0 (energy was consumed by ultimate)
      for (const p of pointsDuringActive) {
        expect(p.value).toBe(0);
      }
    });
  });

  describe('4 MF, Ult → ENHANCED BATK, ENHANCED+EMPOWERED BS', () => {
    it('enhanced basic attack is available', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'FLAMING_CINDERS_ENHANCED', NounType.BASIC_ATTACK, ACTIVE_FRAME, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(false);
    });

    it('enhanced battle skill is available (Ult + 4 MF)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_ENHANCED', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(false);
    });

    it('enhanced+empowered battle skill is available (Ult + 4 MF)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_ENHANCED_EMPOWERED', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.ENHANCED);
      expect(r.disabled).toBe(false);
    });

    it('normal basic attack is still disabled', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'FLAMING_CINDERS', NounType.BASIC_ATTACK, ACTIVE_FRAME, EnhancementType.NORMAL);
      expect(r.disabled).toBe(true);
    });

    it('empowered-only battle skill is still disabled (DISABLE EMPOWERED)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result.current, 2 * FPS);
      placeUltimate(result.current, ULT_START);
      const r = isAvailable(result.current, 'SMOULDERING_FIRE_EMPOWERED', NounType.BATTLE_SKILL, ACTIVE_FRAME, EnhancementType.EMPOWERED);
      expect(r.disabled).toBe(true);
    });
  });
});
