/**
 * @jest-environment jsdom
 */

/**
 * Laevatain Seethe — suppliedParameters integration test
 *
 * Seethe's RECOVER ULTIMATE_ENERGY uses VARY_BY ENEMY_HIT [25, 30, 35].
 * Verifies:
 *   1. Context menu: Seethe variant exposes a parameterSubmenu (×1, ×2, ×3)
 *      — NOT inline buttons, which are reserved for BATK segment chains.
 *   2. Controller: the item's defaultSkill carries parameterValues defaulted
 *      to the param's `default` value; callers override by merging.
 *   3. Pipeline: UE gain differs based on ENEMY_HIT value (25 vs 30 vs 35)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { InteractionModeType } from '../../../../consts/enums';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { ultimateGraphKey } from '../../../../model/channels';
import { findColumn, buildContextMenu } from '../../helpers';
import type { AddEventPayload } from '../../helpers';

const SLOT = 'slot-0'; // Laevatain is default slot-0
const SEETHE_ID = 'SEETHE';

function setup() {
  const view = renderHook(() => useApp());
  // Switch to freeform so combo skills can be placed without trigger conditions
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

/** Find the Seethe menu item from the combo skill context menu. */
function findSeetheItem(app: ReturnType<typeof useApp>, atFrame: number) {
  const comboCol = findColumn(app, SLOT, NounType.COMBO);
  expect(comboCol).toBeDefined();
  const items = buildContextMenu(app, comboCol!, atFrame);
  expect(items).not.toBeNull();
  return items!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.defaultSkill?.id === SEETHE_ID,
  );
}

/** Place a Seethe event with a specific ENEMY_HIT value and return the UE graph max after it. */
function placeSeetheAndGetUE(enemyHit: number) {
  const { result } = setup();

  // Configure UE to start at 0 with 0 regen so only Seethe contributes
  act(() => {
    result.current.handleResourceConfigChange(
      ultimateGraphKey(SLOT),
      { startValue: 0, max: 200, regenPerSecond: 0 },
    );
  });

  const atFrame = 5 * FPS;
  const seetheItem = findSeetheItem(result.current, atFrame);
  expect(seetheItem).toBeDefined();

  // Use the item's own addEvent payload and merge the desired ENEMY_HIT override
  // — this mirrors what the view does when the user picks an option from the
  // parameterSubmenu before clicking the main row.
  const payload = seetheItem!.actionPayload as AddEventPayload;
  const skill = {
    ...payload.defaultSkill,
    parameterValues: { ...(payload.defaultSkill.parameterValues ?? {}), ENEMY_HIT: enemyHit },
  };

  act(() => {
    result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, skill);
  });

  // Verify the event was created with correct parameterValues
  const seetheEvents = result.current.allProcessedEvents.filter(
    ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.COMBO && ev.id === SEETHE_ID,
  );
  expect(seetheEvents).toHaveLength(1);
  expect(seetheEvents[0].parameterValues).toEqual({ ENEMY_HIT: enemyHit });

  // Read UE graph — find the max value (the gain from Seethe)
  const graph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
  expect(graph).toBeDefined();
  const maxUE = Math.max(...graph!.points.map(p => p.value));
  return maxUE;
}

describe('Laevatain Seethe — suppliedParameters', () => {

  it('context menu exposes a parameterSubmenu for Seethe (not inline buttons)', () => {
    const { result } = setup();
    const seetheItem = findSeetheItem(result.current, 5 * FPS);
    expect(seetheItem).toBeDefined();
    expect(seetheItem!.inlineButtons).toBeUndefined();
    expect(seetheItem!.parameterSubmenu).toBeDefined();
    // parameterSubmenu is an array of axes; Seethe has one (ENEMY_HIT).
    const submenu = seetheItem!.parameterSubmenu!;
    expect(submenu).toHaveLength(1);
    const axis = submenu[0];
    expect(axis.paramId).toBe('ENEMY_HIT');
    expect(axis.options.map(o => o.label)).toEqual(['×1', '×2', '×3']);
    expect(axis.options.map(o => o.value)).toEqual([1, 2, 3]);
    // Default is ENEMY_HIT=1 per Seethe config
    expect(axis.options.find(o => o.isDefault)?.value).toBe(1);
  });

  it('default payload carries parameterValues seeded from the param default', () => {
    const { result } = setup();
    const seetheItem = findSeetheItem(result.current, 5 * FPS);
    const payload = seetheItem!.actionPayload as AddEventPayload;
    expect(payload.defaultSkill.parameterValues).toEqual({ ENEMY_HIT: 1 });
    expect(payload.defaultSkill.suppliedParameters).toBeDefined();
  });

  it('UE gain differs based on ENEMY_HIT value', () => {
    // Seethe JSON: VARY_BY ENEMY_HIT [25, 30, 35]
    const ue1 = placeSeetheAndGetUE(1);
    const ue2 = placeSeetheAndGetUE(2);
    const ue3 = placeSeetheAndGetUE(3);

    expect(ue1).toBe(25);
    expect(ue2).toBe(30);
    expect(ue3).toBe(35);
  });
});
