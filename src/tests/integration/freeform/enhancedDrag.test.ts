/**
 * @jest-environment jsdom
 */

/**
 * Freeform Enhanced/Empowered Drag — Integration Test
 *
 * Verifies that enhanced and empowered skill variants can be freely dragged
 * in freeform mode, even without an ultimate on the timeline.
 *
 * In strict mode, enhanced events are clamped to the ENABLE window (ultimate),
 * but in freeform mode all position constraints (ultimate edge, combo edge,
 * enable window) are bypassed.
 *
 * Verification layers:
 *   Context menu: variant items enabled in freeform, disabled in strict without ultimate
 *   Controller: allProcessedEvents event placement and drag
 *   View: computeTimelinePresentation ColumnViewModel for battle skill column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { InteractionModeType, EnhancementType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

const SLOT = 'slot-0';

// Load variant skill IDs from game data JSON — never use string literals for skill identity.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EMPOWERED_BS_ID: string = require('../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire-empowered.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ENHANCED_EMPOWERED_BS_ID: string = require('../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire-enhanced-empowered.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ENHANCED_BS_ID: string = require('../../../model/game-data/operators/laevatain/skills/battle-skill-smouldering-fire-enhanced.json').properties.id;

/** Find the battle skill column for slot-0 and return it (asserts it exists). */
function getBattleCol(app: AppResult) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  expect(col).toBeDefined();
  return col!;
}

/** Find a variant by enhancementType and optionally by id. */
function getVariant(app: AppResult, enhancementType: EnhancementType, variantId?: string) {
  const col = getBattleCol(app);
  const variant = col.eventVariants?.find(
    (v) => v.enhancementType === enhancementType && (variantId ? v.id === variantId : true),
  );
  expect(variant).toBeDefined();
  return variant!;
}

describe('Freeform enhanced/empowered drag — no ultimate required', () => {
  it('empowered battle skill can be dragged in freeform mode without ultimate', () => {
    const { result } = renderHook(() => useApp());

    // Switch to freeform mode
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu layer: verify empowered variant is enabled in freeform ──
    const battleCol = getBattleCol(result.current);
    const empoweredVariant = getVariant(result.current, EnhancementType.EMPOWERED);
    expect(empoweredVariant.id).toBe(EMPOWERED_BS_ID);

    const startFrame = 5 * FPS;
    const freeformMenu = buildContextMenu(result.current, battleCol, startFrame);
    expect(freeformMenu).not.toBeNull();
    const empoweredItem = freeformMenu!.find(
      (i) => i.actionId === 'addEvent' && i.actionPayload &&
        (i.actionPayload as Record<string, unknown>).defaultSkill &&
        ((i.actionPayload as Record<string, Record<string, unknown>>).defaultSkill).id === EMPOWERED_BS_ID,
    );
    expect(empoweredItem).toBeDefined();
    expect(empoweredItem!.disabled).toBeFalsy();

    // ── Controller layer: place empowered BS via context menu flow ──
    const payload = getMenuPayload(result.current, battleCol, startFrame, empoweredVariant.displayName);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const ev = result.current.events.find(
      (e) => e.name === EMPOWERED_BS_ID && e.ownerId === SLOT,
    );
    expect(ev).toBeDefined();
    expect(ev!.startFrame).toBe(startFrame);

    // Drag it forward by 3 seconds
    const newFrame = 8 * FPS;
    act(() => {
      result.current.handleMoveEvent(ev!.uid, newFrame);
    });

    const moved = result.current.events.find((e) => e.uid === ev!.uid);
    expect(moved!.startFrame).toBe(newFrame);

    // ── View layer: verify event appears in column view model at new position ──
    const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const battleVm = viewModels.get(battleCol.key);
    expect(battleVm).toBeDefined();
    const vmEvent = battleVm!.events.find((e) => e.uid === ev!.uid);
    expect(vmEvent).toBeDefined();
    expect(vmEvent!.startFrame).toBe(newFrame);
  });

  it('enhanced+empowered battle skill can be dragged in freeform mode without ultimate', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu layer: verify enhanced+empowered variant is enabled in freeform ──
    const battleCol = getBattleCol(result.current);
    // ENHANCED_EMPOWERED is assigned enhancementType ENHANCED in column builder;
    // disambiguate from the plain ENHANCED variant by matching on the game-data ID.
    const eeVariant = getVariant(result.current, EnhancementType.ENHANCED, ENHANCED_EMPOWERED_BS_ID);
    expect(eeVariant.id).toBe(ENHANCED_EMPOWERED_BS_ID);

    const startFrame = 5 * FPS;
    const freeformMenu = buildContextMenu(result.current, battleCol, startFrame);
    expect(freeformMenu).not.toBeNull();
    const eeItem = freeformMenu!.find(
      (i) => i.actionId === 'addEvent' && i.actionPayload &&
        ((i.actionPayload as Record<string, Record<string, unknown>>).defaultSkill).id === ENHANCED_EMPOWERED_BS_ID,
    );
    expect(eeItem).toBeDefined();
    expect(eeItem!.disabled).toBeFalsy();

    // ── Controller layer: place enhanced+empowered BS via context menu flow ──
    const payload = getMenuPayload(result.current, battleCol, startFrame, eeVariant.displayName);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const ev = result.current.events.find(
      (e) => e.name === ENHANCED_EMPOWERED_BS_ID && e.ownerId === SLOT,
    );
    expect(ev).toBeDefined();

    // Drag it forward
    const newFrame = 10 * FPS;
    act(() => {
      result.current.handleMoveEvent(ev!.uid, newFrame);
    });

    const moved = result.current.events.find((e) => e.uid === ev!.uid);
    expect(moved!.startFrame).toBe(newFrame);

    // ── View layer: verify event appears in column view model at new position ──
    const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const battleVm = viewModels.get(battleCol.key);
    expect(battleVm).toBeDefined();
    const vmEvent = battleVm!.events.find((e) => e.uid === ev!.uid);
    expect(vmEvent).toBeDefined();
    expect(vmEvent!.startFrame).toBe(newFrame);
  });

  it('enhanced battle skill cannot be dragged outside ultimate in strict mode', () => {
    const { result } = renderHook(() => useApp());

    // ── Context menu layer: verify enhanced variant is DISABLED in strict mode (no ultimate) ──
    const battleCol = getBattleCol(result.current);
    const enhancedVariant = getVariant(result.current, EnhancementType.ENHANCED, ENHANCED_BS_ID);
    expect(enhancedVariant.id).toBe(ENHANCED_BS_ID);

    const startFrame = 5 * FPS;
    const strictMenu = buildContextMenu(result.current, battleCol, startFrame);
    expect(strictMenu).not.toBeNull();
    const enhancedItemStrict = strictMenu!.find(
      (i) => i.actionId === 'addEvent' && i.actionPayload &&
        ((i.actionPayload as Record<string, Record<string, unknown>>).defaultSkill).id === ENHANCED_BS_ID,
    );
    expect(enhancedItemStrict).toBeDefined();
    expect(enhancedItemStrict!.disabled).toBe(true);

    // Switch to freeform to place the event (cannot place in strict without ultimate)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Verify variant is enabled in freeform
    const freeformMenu = buildContextMenu(result.current, battleCol, startFrame);
    expect(freeformMenu).not.toBeNull();
    const enhancedItemFreeform = freeformMenu!.find(
      (i) => i.actionId === 'addEvent' && i.actionPayload &&
        ((i.actionPayload as Record<string, Record<string, unknown>>).defaultSkill).id === ENHANCED_BS_ID,
    );
    expect(enhancedItemFreeform).toBeDefined();
    expect(enhancedItemFreeform!.disabled).toBeFalsy();

    // ── Controller layer: place enhanced BS via context menu flow in freeform ──
    const payload = getMenuPayload(result.current, battleCol, startFrame, enhancedVariant.displayName);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Switch back to strict mode
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const ev = result.current.events.find(
      (e) => e.enhancementType === EnhancementType.ENHANCED && e.columnId === NounType.BATTLE && e.name === ENHANCED_BS_ID,
    );
    expect(ev).toBeDefined();

    // Try to drag — should be clamped back (no ultimate = no ENABLE window)
    act(() => {
      result.current.handleMoveEvent(ev!.uid, 10 * FPS);
    });

    const after = result.current.events.find((e) => e.uid === ev!.uid);
    expect(after!.startFrame).toBe(startFrame);

    // ── View layer: verify event remains at original position in column view model ──
    const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const battleVm = viewModels.get(battleCol.key);
    expect(battleVm).toBeDefined();
    const vmEvent = battleVm!.events.find((e) => e.uid === ev!.uid);
    expect(vmEvent).toBeDefined();
    expect(vmEvent!.startFrame).toBe(startFrame);
  });
});
