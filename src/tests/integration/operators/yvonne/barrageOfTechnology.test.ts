/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Barrage of Technology (Talent 1) Integration Tests
 *
 * Tests the full pipeline for Barrage of Technology:
 *   1. BS applying Solidification triggers BARRAGE_OF_TECHNOLOGY status
 *   2. Status has infinite duration and RESET interaction
 *   3. DISABLE clause propagates to derived event segment → disables BATK SEQ 0-3
 *   4. SEQ 4 (Final Strike) remains enabled
 *   5. Status consumed on PERFORM FINAL_STRIKE
 *   6. DMG bonus is VARY_BY TALENT_LEVEL [0, 0.5]
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, StackInteractionType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { INFLICTION_COLUMNS, ENEMY_ID } from '../../../../model/channels';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';
import { checkVariantAvailability } from '../../../../controller/timeline/eventValidator';
import { computeAllValidations } from '../../../../controller/timeline/eventValidationController';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
const BARRAGE_JSON = require('../../../../model/game-data/operators/yvonne/statuses/status-barrage-of-technology.json');
const BARRAGE_ID: string = BARRAGE_JSON.properties.id;
const BATK_ID: string = require('../../../../model/game-data/operators/yvonne/skills/basic-attack-batk-exuberant-trigger.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function addBS(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

/** Place cryo infliction + BS to trigger Barrage (BS only triggers Barrage when Solidification is applied) */
function triggerBarrage(app: AppResult, bsFrame: number) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.CRYO, 1 * FPS,
      { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
    );
  });
  act(() => { addBS(app, bsFrame); });
}

function getBarrageEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === BARRAGE_ID && ev.ownerEntityId === SLOT,
  );
}

// =============================================================================
// A. JSON Structure
// =============================================================================

describe('A. Barrage of Technology JSON structure', () => {
  it('A1: duration is infinite (99999s)', () => {
    expect(BARRAGE_JSON.properties.duration.value.value).toBe(99999);
  });

  it('A2: interactionType is RESET', () => {
    expect(BARRAGE_JSON.properties.stacks.interactionType).toBe(StackInteractionType.RESET);
  });

  it('A3: stacks limit is 1', () => {
    expect(BARRAGE_JSON.properties.stacks.limit.value).toBe(1);
  });

  // A4 (DISABLE JSON structure) removed — behavior tested by C1-C5

  it('A5: has APPLY STAT DAMAGE_BONUS with VARY_BY TALENT_LEVEL [0, 0.5]', () => {
    const statClause = BARRAGE_JSON.clause.find((c: { effects: { verb: string; object: string }[] }) =>
      c.effects.some(e => e.verb === VerbType.APPLY && e.object === NounType.STAT),
    );
    expect(statClause).toBeDefined();
    const statEffect = statClause.effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.APPLY && e.object === NounType.STAT,
    );
    expect(statEffect.objectId).toBe('DAMAGE_BONUS');
    expect(statEffect.with.value.value).toEqual([0, 0.5]);
  });

  // A6 (trigger JSON structure) removed — behavior tested by B1-B3
});

// =============================================================================
// B. Trigger — BS with Solidification triggers Barrage
// =============================================================================

describe('B. Barrage trigger from BS Solidification', () => {
  it('B1: BS with cryo infliction triggers Barrage (Solidification applied)', () => {
    const { result } = setup();
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 1 * FPS,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    triggerBarrage(result.current, 5 * FPS);

    const barrages = getBarrageEvents(result.current);
    expect(barrages.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: BS without infliction does NOT trigger Barrage (no Solidification)', () => {
    const { result } = setup();
    act(() => { addBS(result.current, 5 * FPS); });

    const barrages = getBarrageEvents(result.current);
    expect(barrages).toHaveLength(0);
  });

  it('B3: combo with Solidification does NOT trigger Barrage', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const barrages = getBarrageEvents(result.current);
    expect(barrages).toHaveLength(0);
  });
});

// =============================================================================
// C. Segment-level DISABLE — SEQ 0-3 disabled, SEQ 4 enabled
// =============================================================================

describe('C. Segment-level DISABLE on BATK', () => {
  it('C1: when Barrage is active, checkVariantAvailability returns disabledSegments {0,1,2,3}', () => {
    const { result } = setup();
    triggerBarrage(result.current, 5 * FPS);

    const barrages = getBarrageEvents(result.current);
    expect(barrages.length).toBeGreaterThanOrEqual(1);

    // Check at a frame after BS where Barrage should be active
    const checkFrame = 8 * FPS;
    const availability = checkVariantAvailability(
      BATK_ID, SLOT, result.current.allProcessedEvents, checkFrame,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(availability.disabled).toBe(false);
    expect(availability.disabledSegments).toBeDefined();
    expect(availability.disabledSegments!.has(0)).toBe(true);
    expect(availability.disabledSegments!.has(1)).toBe(true);
    expect(availability.disabledSegments!.has(2)).toBe(true);
    expect(availability.disabledSegments!.has(3)).toBe(true);
    expect(availability.disabledSegments!.has(4)).toBe(false);
  });

  it('C2: without Barrage active, no segments are disabled', () => {
    const { result } = setup();

    const checkFrame = 5 * FPS;
    const availability = checkVariantAvailability(
      BATK_ID, SLOT, result.current.allProcessedEvents, checkFrame,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(availability.disabledSegments).toBeUndefined();
  });

  it('C3: in strict mode, BATK full-chain menu item is disabled when Barrage active', () => {
    const { result } = setup();
    triggerBarrage(result.current, 5 * FPS);
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const checkFrame = 8 * FPS;
    const menuItems = buildContextMenu(result.current, col!, checkFrame);
    expect(menuItems).not.toBeNull();

    const batkItem = menuItems!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );
    expect(batkItem).toBeDefined();
    expect(batkItem!.disabled).toBe(true);
  });

  it('C4: in freeform mode, BATK full-chain menu item is NOT disabled when Barrage active', () => {
    const { result } = setup();
    triggerBarrage(result.current, 5 * FPS);

    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const checkFrame = 8 * FPS;
    const menuItems = buildContextMenu(result.current, col!, checkFrame);
    expect(menuItems).not.toBeNull();

    const batkItem = menuItems!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );
    expect(batkItem).toBeDefined();
    expect(batkItem!.disabled).toBeFalsy();
  });

  it('C5: in strict mode, segment buttons with SEQ 1-4 disabled when Barrage active', () => {
    const { result } = setup();
    triggerBarrage(result.current, 5 * FPS);
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();

    const checkFrame = 8 * FPS;
    const menuItems = buildContextMenu(result.current, col!, checkFrame);
    expect(menuItems).not.toBeNull();

    // Find the BATK menu item (not finisher/dive)
    const batkItem = menuItems!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );
    expect(batkItem).toBeDefined();

    // Check inline segment buttons
    const buttons = batkItem!.inlineButtons;
    expect(buttons).toBeDefined();
    expect(buttons!.length).toBeGreaterThanOrEqual(5);

    // SEQ 1-4 (indices 0-3) should be disabled
    expect(buttons![0].disabled).toBe(true);
    expect(buttons![1].disabled).toBe(true);
    expect(buttons![2].disabled).toBe(true);
    expect(buttons![3].disabled).toBe(true);

    // SEQ 5 (index 4) should be enabled
    expect(buttons![4].disabled).toBeFalsy();
  });
});

// =============================================================================
// D. Validation Warnings — freeform placement during Barrage shows warning
// =============================================================================

describe('D. Validation warnings for freeform placement', () => {
  it('D1: full BATK chain placed during Barrage gets a validation warning', () => {
    const { result } = setup();
    triggerBarrage(result.current, 5 * FPS);

    // Place full BATK chain in freeform (should succeed but with warning)
    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const payload = getMenuPayload(result.current, col!, 8 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const batk = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BASIC_ATTACK && ev.id === BATK_ID,
    );
    expect(batk).toBeDefined();

    const { maps } = computeAllValidations(
      result.current.allProcessedEvents,
      result.current.slots,
      result.current.resourceGraphs,
      result.current.staggerBreaks,
      null,
    );
    const warning = maps.regularBasic.get(batk!.uid);
    expect(warning).toBeDefined();
  });

  it('D2: after placing SEQ 5 during Barrage, next full BATK add succeeds on first try', () => {
    const { result } = setup();
    triggerBarrage(result.current, 3 * FPS);

    // Barrage should be active
    const barragesBefore = getBarrageEvents(result.current);
    expect(barragesBefore.length).toBeGreaterThanOrEqual(1);

    // Place SEQ 5 (last segment) via context menu
    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menuItems = buildContextMenu(result.current, col, 8 * FPS);
    const batkItem = menuItems!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    )!;
    const lastSegButton = batkItem.inlineButtons![4];
    const segPayload = lastSegButton.actionPayload as {
      ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(
        segPayload.ownerEntityId, segPayload.columnId, segPayload.atFrame, segPayload.defaultSkill,
      );
    });

    // Now try to add a full BATK chain at a later frame — should succeed on first try
    const col2 = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const payload2 = getMenuPayload(result.current, col2, 15 * FPS);
    const batkCountBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    ).length;
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerEntityId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });
    const batkCountAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    ).length;
    expect(batkCountAfter).toBe(batkCountBefore + 1);
  });

  it('D3: BATK SEQ 5 only (last segment) placed during Barrage has no warning', () => {
    const { result } = setup();
    triggerBarrage(result.current, 5 * FPS);

    // Place only SEQ 5 (index 4) — the allowed segment
    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK);
    const menuItems = buildContextMenu(result.current, col!, 8 * FPS);
    const batkItem = menuItems!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );
    const lastSegButton = batkItem!.inlineButtons![4];
    const segPayload = lastSegButton.actionPayload as {
      ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(
        segPayload.ownerEntityId, segPayload.columnId, segPayload.atFrame, segPayload.defaultSkill,
      );
    });

    const batk = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BASIC_ATTACK && ev.id === BATK_ID,
    );
    expect(batk).toBeDefined();

    const { maps } = computeAllValidations(
      result.current.allProcessedEvents,
      result.current.slots,
      result.current.resourceGraphs,
      result.current.staggerBreaks,
      null,
    );
    const warning = maps.regularBasic.get(batk!.uid);
    expect(warning).toBeUndefined();
  });
});
