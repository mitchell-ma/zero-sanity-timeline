/**
 * @jest-environment jsdom
 */

/**
 * Gilberta — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill multi-frame gravity pull with nature infliction
 * 3. Combo applies Lift to enemy
 * 4. Ultimate applies Anomalous Gravity Field status
 * 5. Ultimate energy cost at different potentials
 *
 * Three-layer verification:
 * - Context menu: menu items are available and enabled
 * - Controller: event counts, event status, timing, duration
 * - View: computeTimelinePresentation includes events in their columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  INFLICTION_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
  PHYSICAL_STATUS_COLUMNS,
} from '../../../../model/channels';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  findColumn,
  buildContextMenu,
  getMenuPayload,
  getAddEventPayload,
  setUltimateEnergyToMax,
} from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const GILBERTA_ID: string = require('../../../../model/game-data/operators/gilberta/gilberta.json').id;
const BATTLE_SKILL_ID: string = require('../../../../model/game-data/operators/gilberta/skills/battle-skill-gravity-mode.json').properties.id;
const COMBO_SKILL_ID: string = require('../../../../model/game-data/operators/gilberta/skills/combo-skill-matrix-displacement.json').properties.id;
const ULTIMATE_ID: string = require('../../../../model/game-data/operators/gilberta/skills/ultimate-gravity-field.json').properties.id;
const ANOMALOUS_GRAVITY_FIELD_ID: string = require('../../../../model/game-data/operators/gilberta/statuses/status-anomalous-gravity-field.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_GILBERTA = 'slot-0';

function setupGilberta() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_GILBERTA, GILBERTA_ID); });
  return view;
}

/** Place a Vulnerable infliction on enemy so Lift can trigger. */
function addVulnerableInfliction(app: AppResult, atFrame: number) {
  const enemyStatusCol = findColumn(app, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();
  const menuItems = buildContextMenu(app, enemyStatusCol!, atFrame);
  expect(menuItems).not.toBeNull();
  const vulnItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
  );
  expect(vulnItem).toBeDefined();
  expect(vulnItem!.disabled).toBeFalsy();
  const payload = vulnItem!.actionPayload as AddEventPayload;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('Gilberta Skills — integration through useApp', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // A. Core Skill Placement
  // ═══════════════════════════════════════════════════════════════════════════

  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupGilberta();
    const col = findColumn(result.current, SLOT_GILBERTA, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo freeform with cooldown (20s base)', () => {
    const { result } = setupGilberta();

    // Combo requires activation conditions — switch to freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_GILBERTA, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);

    // Combo has a cooldown segment — total duration includes animation (0.5s) + active (1.27s) + cooldown (20s at level 1)
    const duration = eventDuration(combos[0]);
    // Total should be at least 19s (animation + active + cooldown)
    expect(duration).toBeGreaterThanOrEqual(19 * FPS);
  });

  it('A3: ultimate with energy (90 base, P4 = 76-77)', () => {
    const { result } = setupGilberta();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_GILBERTA, 0); });

    const col = findColumn(result.current, SLOT_GILBERTA, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Battle Skill — Multi-frame Gravity Pull
  // ═══════════════════════════════════════════════════════════════════════════

  it('B1: battle skill has 5 damage frames (4 pull ticks + explosion)', () => {
    const { result } = setupGilberta();
    const col = findColumn(result.current, SLOT_GILBERTA, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);

    // The battle skill has 5 frames in the JSON config
    const bs = battles[0];
    const allFrames = bs.segments?.flatMap((seg) => seg.frames ?? []) ?? [];
    expect(allFrames).toHaveLength(5);
  });

  it('B2: battle skill applies nature infliction', () => {
    const { result } = setupGilberta();
    const col = findColumn(result.current, SLOT_GILBERTA, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Nature infliction should be derived on enemy
    const natureInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(natureInflictions.length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Combo — Lift
  // ═══════════════════════════════════════════════════════════════════════════

  it('C1: combo applies Lift to enemy when Vulnerable is present', () => {
    const { result } = setupGilberta();

    // Switch to freeform for manual placement
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Lift requires existing Vulnerable on enemy — place one first
    addVulnerableInfliction(result.current, 2 * FPS);

    const comboCol = findColumn(result.current, SLOT_GILBERTA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Verify combo was added
    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Combo should create a Lift physical status on enemy
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(liftEvents.length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Ultimate — Gravity Field
  // ═══════════════════════════════════════════════════════════════════════════

  it('D1: ultimate applies Anomalous Gravity Field status', () => {
    const { result } = setupGilberta();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_GILBERTA, 0); });

    const col = findColumn(result.current, SLOT_GILBERTA, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Anomalous Gravity Field status should appear on enemy
    const gravFieldEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === ANOMALOUS_GRAVITY_FIELD_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(gravFieldEvents.length).toBeGreaterThanOrEqual(1);

    // Duration should be 5s
    expect(eventDuration(gravFieldEvents[0])).toBe(5 * FPS);
  });

  it('D2: ultimate energy cost P0=90, P4=76-77', () => {
    // P0: 90 * 1.0 = 90
    const costP0 = getUltimateEnergyCostForPotential(GILBERTA_ID, 0);
    expect(costP0).toBe(90);

    // P4: 90 * 0.85 = 76.5 → 76 or 77 depending on rounding
    const costP4 = getUltimateEnergyCostForPotential(GILBERTA_ID, 4);
    expect(costP4).not.toBeNull();
    expect(costP4!).toBeGreaterThanOrEqual(76);
    expect(costP4!).toBeLessThanOrEqual(77);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. View Layer
  // ═══════════════════════════════════════════════════════════════════════════

  it('E1: battle skill visible in presentation', () => {
    const { result } = setupGilberta();
    const col = findColumn(result.current, SLOT_GILBERTA, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(col!.key);
    expect(vm).toBeDefined();
    const bsEvents = vm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
  });

  it('E2: combo and ultimate visible in presentation', () => {
    const { result } = setupGilberta();

    // Place combo in freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_GILBERTA, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place ultimate
    act(() => { setUltimateEnergyToMax(result.current, SLOT_GILBERTA, 0); });
    const ultCol = findColumn(result.current, SLOT_GILBERTA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 30 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Combo visible
    const comboVm = viewModels.get(comboCol!.key);
    expect(comboVm).toBeDefined();
    const comboEvents = comboVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);

    // Ultimate visible
    const ultVm = viewModels.get(ultCol!.key);
    expect(ultVm).toBeDefined();
    const ultEvents = ultVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_GILBERTA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });
});
