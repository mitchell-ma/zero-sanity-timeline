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
 *
 * Three-layer verification:
 *   1. Context menu: variant menu items are enabled/disabled correctly
 *   2. Controller: checkVariantAvailability returns correct disabled state
 *   3. View: computeTimelinePresentation reflects placed events in columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { NODE_STAGGER_COLUMN_ID, ENEMY_OWNER_ID, USER_ID, ultimateGraphKey } from '../../../../model/channels';
import { getUltimateEnergyCost } from '../../../../controller/operators/operatorRegistry';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { EnhancementType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { checkVariantAvailability } from '../../../../controller/timeline/eventValidator';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { buildContextMenu, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';
import type { MiniTimeline, ContextMenuItem } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const MELTING_FLAME_ID: string = require('../../../../model/game-data/operators/laevatain/statuses/status-melting-flame.json').properties.id;
const FLAMING_CINDERS_ID: string = require('../../../../model/game-data/operators/laevatain/skills/basic-attack-batk-flaming-cinders.json').properties.id;
const FLAMING_CINDERS_ENHANCED_ID: string = require('../../../../model/game-data/operators/laevatain/skills/basic-attack-batk-flaming-cinders-enhanced.json').properties.id;
const SMOULDERING_FIRE_ID: string = require('../../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire.json').properties.id;
const SMOULDERING_FIRE_EMPOWERED_ID: string = require('../../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire-empowered.json').properties.id;
const SMOULDERING_FIRE_ENHANCED_ID: string = require('../../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire-enhanced.json').properties.id;
const SMOULDERING_FIRE_ENHANCED_EMPOWERED_ID: string = require('../../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire-enhanced-empowered.json').properties.id;
const TWILIGHT_ID: string = require('../../../../model/game-data/operators/laevatain/skills/ultimate-twilight.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

/** Ref wrapper for renderHook result — allows re-reading result.current after act(). */
type HookRef = { current: AppResult };

/** Find a MiniTimeline column by owner and column ID, also checking matchColumnIds. */
function findMatchingColumn(app: AppResult, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === columnId || (c.matchColumnIds?.includes(columnId) ?? false)),
  );
}

/** Find an addEvent menu item by its action payload's defaultSkill.id. */
function findVariantMenuItem(menuItems: ContextMenuItem[], skillId: string) {
  return menuItems.find(
    (item) =>
      item.actionId === 'addEvent' &&
      (item.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === skillId,
  );
}

/** Check availability of a variant at a given frame (controller-layer). */
function isAvailable(
  app: AppResult,
  variantName: string,
  columnId: string,
  atFrame: number,
) {
  return checkVariantAvailability(
    variantName, SLOT, [...app.allProcessedEvents], atFrame, columnId, app.slots,
  );
}

/** Ensure ultimate energy starts at max so the ultimate can be placed. */
function ensureUltimateEnergyMax(ref: HookRef) {
  const op = ref.current.operators[0];
  if (!op) return;
  const cost = getUltimateEnergyCost(op.id);
  act(() => {
    ref.current.handleResourceConfigChange(ultimateGraphKey(SLOT), { startValue: cost, max: cost, regenPerSecond: 0 });
  });
}

/** Place the ultimate at a given frame via context menu flow. */
function placeUltimate(ref: HookRef, atFrame: number) {
  ensureUltimateEnergyMax(ref);
  const ultCol = findMatchingColumn(ref.current, SLOT, NounType.ULTIMATE);
  const payload = getMenuPayload(ref.current, ultCol!, atFrame);
  act(() => {
    ref.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Place 4 Melting Flame stacks 1 second apart starting at the given frame via context menu flow. */
function place4MfStacks(ref: HookRef, startFrame: number) {
  // Status columns are derived — switch to freeform to access context menu
  act(() => { ref.current.setInteractionMode(InteractionModeType.FREEFORM); });
  for (let i = 0; i < 4; i++) {
    const statusCol = findMatchingColumn(ref.current, SLOT, MELTING_FLAME_ID);
    expect(statusCol).toBeDefined();
    const menu = buildContextMenu(ref.current, statusCol!, startFrame + i * FPS);
    expect(menu).not.toBeNull();
    const mfItem = menu!.find(
      (item) =>
        item.actionId === 'addEvent' &&
        (item.actionPayload as { columnId?: string })?.columnId === MELTING_FLAME_ID,
    );
    expect(mfItem).toBeDefined();
    const payload = mfItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
    act(() => {
      ref.current.handleAddEvent(payload.ownerId, payload.columnId, startFrame + i * FPS, payload.defaultSkill);
    });
  }
  // Restore strict mode for variant availability checks
  act(() => { ref.current.setInteractionMode(InteractionModeType.STRICT); });
}

// Frame inside the ultimate active window (after animation + stasis)
const ULT_START = 10 * FPS;
const ACTIVE_FRAME = ULT_START + 3 * FPS; // well within the 15s active segment

describe('Laevatain variant availability — integration through useApp', () => {
  describe('No MF, No Ult → NORMAL BATK, NORMAL BS', () => {
    it('normal basic attack is available', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, FLAMING_CINDERS_ID, NounType.BASIC_ATTACK, 5 * FPS);
      expect(r.disabled).toBe(false);

      // Context menu: normal BATK variant is enabled
      const batkCol = findMatchingColumn(result.current, SLOT, NounType.BASIC_ATTACK);
      const menu = buildContextMenu(result.current, batkCol!, 5 * FPS);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, FLAMING_CINDERS_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBeFalsy();
    });

    it('normal battle skill is available', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, SMOULDERING_FIRE_ID, NounType.BATTLE, 5 * FPS);
      expect(r.disabled).toBe(false);

      // Context menu: normal BS variant is enabled
      const bsCol = findMatchingColumn(result.current, SLOT, NounType.BATTLE);
      const menu = buildContextMenu(result.current, bsCol!, 5 * FPS);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, SMOULDERING_FIRE_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBeFalsy();
    });

    it('enhanced basic attack is disabled (no ENABLE)', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, FLAMING_CINDERS_ENHANCED_ID, NounType.BASIC_ATTACK, 5 * FPS);
      expect(r.disabled).toBe(true);

      // Context menu: enhanced BATK variant is disabled
      const batkCol = findMatchingColumn(result.current, SLOT, NounType.BASIC_ATTACK);
      const menu = buildContextMenu(result.current, batkCol!, 5 * FPS);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, FLAMING_CINDERS_ENHANCED_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBe(true);
    });

    it('empowered battle skill is disabled (no MF stacks)', () => {
      const { result } = renderHook(() => useApp());
      const r = isAvailable(result.current, SMOULDERING_FIRE_EMPOWERED_ID, NounType.BATTLE, 5 * FPS);
      expect(r.disabled).toBe(true);

      // Context menu: empowered BS variant is disabled
      const bsCol = findMatchingColumn(result.current, SLOT, NounType.BATTLE);
      const menu = buildContextMenu(result.current, bsCol!, 5 * FPS);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, SMOULDERING_FIRE_EMPOWERED_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBe(true);
    });
  });

  describe('4 MF, No Ult → NORMAL BATK, EMPOWERED BS', () => {
    it('normal basic attack is available', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      const r = isAvailable(result.current, FLAMING_CINDERS_ID, NounType.BASIC_ATTACK, 8 * FPS);
      expect(r.disabled).toBe(false);
    });

    it('empowered battle skill is available (4 MF stacks)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      const r = isAvailable(result.current, SMOULDERING_FIRE_EMPOWERED_ID, NounType.BATTLE, 8 * FPS);
      expect(r.disabled).toBe(false);

      // Context menu: empowered BS variant is enabled after MF stacks
      const bsCol = findMatchingColumn(result.current, SLOT, NounType.BATTLE);
      const menu = buildContextMenu(result.current, bsCol!, 8 * FPS);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, SMOULDERING_FIRE_EMPOWERED_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBeFalsy();
    });

    it('enhanced basic attack is disabled (no Ult)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      const r = isAvailable(result.current, FLAMING_CINDERS_ENHANCED_ID, NounType.BASIC_ATTACK, 8 * FPS);
      expect(r.disabled).toBe(true);
    });
  });

  describe('No MF, Ult → ENHANCED BATK, ENHANCED BS', () => {
    it('enhanced basic attack is available during ultimate', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, FLAMING_CINDERS_ENHANCED_ID, NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(false);

      // Context menu: enhanced BATK is enabled during ultimate
      const batkCol = findMatchingColumn(result.current, SLOT, NounType.BASIC_ATTACK);
      const menu = buildContextMenu(result.current, batkCol!, ACTIVE_FRAME);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, FLAMING_CINDERS_ENHANCED_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBeFalsy();
    });

    it('enhanced battle skill requires 4 MF stacks (disabled without them even during ultimate)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_ENHANCED_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('normal basic attack is disabled during ultimate (DISABLE FLAMING_CINDERS_BATK)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, FLAMING_CINDERS_ID, NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);

      // Context menu: normal BATK is disabled during ultimate
      const batkCol = findMatchingColumn(result.current, SLOT, NounType.BASIC_ATTACK);
      const menu = buildContextMenu(result.current, batkCol!, ACTIVE_FRAME);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, FLAMING_CINDERS_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBe(true);
    });

    it('normal battle skill is disabled during ultimate (DISABLE SMOULDERING_FIRE)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('finisher is disabled during ultimate (DISABLE FINISHER)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, NounType.FINISHER, NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);

      // Context menu: finisher variant is disabled during ultimate
      const batkCol = findMatchingColumn(result.current, SLOT, NounType.BASIC_ATTACK);
      const menu = buildContextMenu(result.current, batkCol!, ACTIVE_FRAME);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, NounType.FINISHER);
      expect(item).toBeDefined();
      expect(item!.disabled).toBe(true);
    });

    it('finisher is disabled during ultimate even with active stagger break', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      // Place a node stagger event during the active window (freeform)
      act(() => {
        result.current.setInteractionMode(InteractionModeType.FREEFORM);
      });
      // Find enemy stagger column (micro-column within enemy status) and place via context menu
      const staggerCol = findMatchingColumn(result.current, ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID);
      expect(staggerCol).toBeDefined();
      const staggerMenu = buildContextMenu(result.current, staggerCol!, ACTIVE_FRAME - FPS);
      expect(staggerMenu).not.toBeNull();
      const staggerItem = staggerMenu!.find(
        (item) =>
          item.actionId === 'addEvent' &&
          (item.actionPayload as { columnId?: string })?.columnId === NODE_STAGGER_COLUMN_ID,
      );
      expect(staggerItem).toBeDefined();
      const staggerPayload = staggerItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
      act(() => {
        result.current.handleAddEvent(
          staggerPayload.ownerId, staggerPayload.columnId, ACTIVE_FRAME - FPS,
          { ...staggerPayload.defaultSkill, name: NODE_STAGGER_COLUMN_ID, sourceOwnerId: USER_ID, segments: [{ properties: { duration: 5 * FPS } }] },
        );
      });
      // Switch back to strict for variant availability check
      act(() => {
        result.current.setInteractionMode(InteractionModeType.STRICT);
      });
      // Finisher should still be disabled by the DISABLE clause targeting its ID
      const r = isAvailable(result.current, NounType.FINISHER, NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('empowered battle skill is disabled during ultimate (DISABLE SMOULDERING_FIRE_EMPOWERED)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_EMPOWERED_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('enhanced+empowered battle skill is disabled (no MF stacks)', () => {
      const { result } = renderHook(() => useApp());
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_ENHANCED_EMPOWERED_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('ultimate energy gain is suppressed during ultimate active phase', () => {
      const { result } = renderHook(() => useApp());

      // Place ultimate via context menu
      placeUltimate(result, ULT_START);

      // Place an enhanced battle skill during the active window (generates gauge gain normally)
      const battleCol = findMatchingColumn(result.current, SLOT, NounType.BATTLE);
      const enhancedVariant = battleCol!.eventVariants?.find(
        (v) => v.enhancementType === EnhancementType.ENHANCED,
      );
      act(() => {
        result.current.handleAddEvent(SLOT, NounType.BATTLE, ACTIVE_FRAME, enhancedVariant!);
      });

      // Check the resource graph — energy should not increase during the active phase
      const ueGraph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
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

      // View layer: verify the ultimate event appears in its column view model
      const viewModels = computeTimelinePresentation(
        result.current.allProcessedEvents,
        result.current.columns,
      );
      const ultCol = findMatchingColumn(result.current, SLOT, NounType.ULTIMATE);
      expect(ultCol).toBeDefined();
      const ultVm = viewModels.get(ultCol!.key);
      expect(ultVm).toBeDefined();
      const ultEvents = ultVm!.events.filter(
        (ev) => ev.name === TWILIGHT_ID && ev.ownerId === SLOT,
      );
      expect(ultEvents).toHaveLength(1);
    });
  });

  describe('4 MF, Ult → ENHANCED BATK, ENHANCED+EMPOWERED BS', () => {
    it('enhanced basic attack is available', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, FLAMING_CINDERS_ENHANCED_ID, NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(false);
    });

    it('enhanced battle skill is available (Ult + 4 MF)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_ENHANCED_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(false);
    });

    it('enhanced+empowered battle skill is available (Ult + 4 MF)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_ENHANCED_EMPOWERED_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(false);

      // Context menu: enhanced+empowered BS variant is enabled with Ult + 4 MF
      const bsCol = findMatchingColumn(result.current, SLOT, NounType.BATTLE);
      const menu = buildContextMenu(result.current, bsCol!, ACTIVE_FRAME);
      expect(menu).not.toBeNull();
      const item = findVariantMenuItem(menu!, SMOULDERING_FIRE_ENHANCED_EMPOWERED_ID);
      expect(item).toBeDefined();
      expect(item!.disabled).toBeFalsy();
    });

    it('normal basic attack is still disabled', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, FLAMING_CINDERS_ID, NounType.BASIC_ATTACK, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });

    it('empowered-only battle skill is still disabled (DISABLE SMOULDERING_FIRE_EMPOWERED)', () => {
      const { result } = renderHook(() => useApp());
      place4MfStacks(result, 2 * FPS);
      placeUltimate(result, ULT_START);
      const r = isAvailable(result.current, SMOULDERING_FIRE_EMPOWERED_ID, NounType.BATTLE, ACTIVE_FRAME);
      expect(r.disabled).toBe(true);
    });
  });
});
