/**
 * @jest-environment jsdom
 */

/**
 * Alesh — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill processes correctly with correct skill name
 * 3. Combo cooldown at L12
 * 4. Ultimate energy cost at P0 vs P4, cryo infliction from ultimate
 * 5. View-layer presentation
 *
 * Three-layer verification:
 * - Context menu: menu items are available and enabled
 * - Controller: events appear in allProcessedEvents with correct properties
 * - View: computeTimelinePresentation includes events in correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, getAddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ALESH_ID: string = require('../../../../model/game-data/operators/alesh/alesh.json').id;
const BATTLE_SKILL_ID: string = require('../../../../model/game-data/operators/alesh/skills/battle-skill-unconventional-lure.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ALESH = 'slot-0';

function setupAlesh() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ALESH, ALESH_ID); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Core Skill Placement', () => {
  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupAlesh();
    const col = findColumn(result.current, SLOT_ALESH, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battles).toHaveLength(1);
  });

  it('A2: combo skill placed in COMBO_SKILL column with cooldown', () => {
    const { result } = setupAlesh();

    // Combo requires activation conditions — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO_SKILL);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
  });

  it('A3: ultimate placed with energy', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Correct Skill Name
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Battle Skill', () => {
  it('B1: battle skill processes with correct skill name', () => {
    const { result } = setupAlesh();
    const col = findColumn(result.current, SLOT_ALESH, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo — Cooldown at L12
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Combo Cooldown', () => {
  it('C1: combo cooldown is 8s at L12', () => {
    const { result } = setupAlesh();

    // Switch to freeform for combo placement
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO_SKILL);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);

    // Total event duration should include the 8s cooldown at L12
    // Combo has: 0.5s animation + 0.8s active + 0s rare fin + 8s cooldown = 9.3s
    const totalDuration = eventDuration(combos[0]);
    // The cooldown segment at L12 is 8s = 8 * FPS frames
    const cooldownFrames = 8 * FPS;
    // Total must include the cooldown
    expect(totalDuration).toBeGreaterThanOrEqual(cooldownFrames);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate — Energy Cost and Cryo Infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Ultimate', () => {
  it('D1: ultimate energy cost P0=100, P4=85', () => {
    const costP0 = getUltimateEnergyCostForPotential(ALESH_ID, 0);
    expect(costP0).toBe(100);

    const costP4 = getUltimateEnergyCostForPotential(ALESH_ID, 4);
    expect(costP4).toBe(85);
  });

  it('D2: ultimate applies cryo infliction', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Verify cryo infliction was applied to enemy
    const cryoInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer — computeTimelinePresentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — View Layer', () => {
  it('E1: battle skill visible in presentation', () => {
    const { result } = setupAlesh();
    const col = findColumn(result.current, SLOT_ALESH, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVm = viewModels.get(col!.key);
    expect(battleVm).toBeDefined();
    const battleEvents = battleVm!.events.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battleEvents).toHaveLength(1);
  });

  it('E2: ultimate visible in presentation', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVm = viewModels.get(col!.key);
    expect(ultVm).toBeDefined();
    const ultEvents = ultVm!.events.filter(
      (ev) => ev.ownerId === SLOT_ALESH && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });
});
