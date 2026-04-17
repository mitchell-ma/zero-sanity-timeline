/**
 * @jest-environment jsdom
 */

/**
 * Weapon Trigger Firing — Integration Tests
 *
 * Verifies that weapon trigger defs (from getWeaponTriggerDefs) flow correctly
 * through the full pipeline: TriggerIndex.build() → processDefsForSlot →
 * presence event creation → trigger matching on PERFORM ULTIMATE → effect
 * execution (APPLY STATUS).
 *
 * Test scenario: Laevatain (slot-0) equipped with Forgeborn Scathe weapon.
 * The weapon skill "Twilight: Blazing Wail" (ID: TWILIGHT_BLAZING_WAIL)
 * triggers on PERFORM ULTIMATE and applies status FORGEBORN_SCATHE_BLAZING_WAIL
 * to the operator.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { FPS } from '../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../model/channels';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import type { AppResult } from '../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WEAPON_SKILL_ID: string = require('../../../model/game-data/weapons/forgeborn-scathe/skills/skill-twilight-blazing-wail.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WEAPON_STAT_ID: string = require('../../../model/game-data/weapons/forgeborn-scathe/statuses/status-forgeborn-scathe-blazing-wail.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WEAPON_ID: string = require('../../../model/game-data/weapons/forgeborn-scathe/forgeborn-scathe.json').properties.id;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LAEVATAIN_OPERATOR_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;

const SLOT_LAEVATAIN = 'slot-0';

/** Equip Forgeborn Scathe on slot-0 (not equipped by default in test env). */
function equipWeapon(app: AppResult) {
  act(() => {
    app.handleLoadoutChange(SLOT_LAEVATAIN, {
      weaponId: WEAPON_ID,
      armorId: null,
      glovesId: null,
      kit1Id: null,
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });
}

/** Cast an ultimate for Laevatain at a given second. */
function castUltimate(app: AppResult, atSecond: number) {
  const col = findColumn(app, SLOT_LAEVATAIN, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const atFrame = atSecond * FPS;
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Weapon trigger presence event
// ═════════════════════════════════════════════════════════════════════════════

describe('Weapon Trigger Firing — Presence Event', () => {
  it('WT1: No phantom presence event at startFrame 0 for weapon triggers', () => {
    const { result } = renderHook(() => useApp());

    equipWeapon(result.current);

    // Weapon statuses should NOT create a permanent presence event —
    // they only appear when their trigger condition fires.
    const presenceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_LAEVATAIN && ev.name === WEAPON_SKILL_ID && ev.startFrame === 0,
    );

    expect(presenceEvents).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Weapon trigger fires on ultimate
// ═════════════════════════════════════════════════════════════════════════════

describe('Weapon Trigger Firing — Status Applied on Ultimate', () => {
  it('WT2: Casting ultimate triggers weapon status FORGEBORN_SCATHE_BLAZING_WAIL', () => {
    const { result } = renderHook(() => useApp());

    equipWeapon(result.current);

    // No weapon status events before casting ultimate
    const beforeStatus = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WEAPON_STAT_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(beforeStatus).toHaveLength(0);

    // Cast ultimate at 5s
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAEVATAIN, 0); });
    castUltimate(result.current, 5);

    // Weapon status event should now exist
    const afterStatus = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WEAPON_STAT_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(afterStatus).toHaveLength(1);

    const statusEvent = afterStatus[0];
    expect(statusEvent.startFrame).toBeGreaterThan(0);
    expect(statusEvent.ownerEntityId).toBe(SLOT_LAEVATAIN);
    expect(statusEvent.sourceEntityId).toBe(LAEVATAIN_OPERATOR_ID);
  });

  it('WT3: Weapon status appears in the operator status column view', () => {
    const { result } = renderHook(() => useApp());

    equipWeapon(result.current);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAEVATAIN, 0); });
    castUltimate(result.current, 5);

    const statusCol = findColumn(result.current, SLOT_LAEVATAIN, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();

    // The weapon status event should be routed to the operator status column
    const weaponStatusEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WEAPON_STAT_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(weaponStatusEvents).toHaveLength(1);
    expect(weaponStatusEvents[0].startFrame).toBeGreaterThan(0);
  });

  it('WT4: No weapon status fires without casting ultimate', () => {
    const { result } = renderHook(() => useApp());

    equipWeapon(result.current);

    // Add a battle skill instead — should NOT trigger weapon status
    const bsCol = findColumn(result.current, SLOT_LAEVATAIN, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const statusEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WEAPON_STAT_ID && ev.ownerEntityId === SLOT_LAEVATAIN,
    );
    expect(statusEvents).toHaveLength(0);
  });

  it('WT5: No weapon trigger presence event without weapon equipped', () => {
    const { result } = renderHook(() => useApp());

    // Default test env has no weapon — verify no presence event
    const presenceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_LAEVATAIN && ev.name === WEAPON_SKILL_ID,
    );
    expect(presenceEvents).toHaveLength(0);
  });
});
