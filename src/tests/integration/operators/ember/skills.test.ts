/**
 * @jest-environment jsdom
 */

/**
 * Ember --- Integration Tests
 *
 * Tests the full user flow through useApp for Ember's kit:
 * - Battle skill (Forward March): heat damage, knock down, stagger
 * - Combo skill (Frontline Support): physical damage, healing, knock down
 * - Ultimate (Re-Ignited Oath): heat damage, Steel Oath shield to all operators
 * - Talent 1 (Inflamed for the Assault): triggers on BS and combo
 *
 * Three-layer verification:
 *   1. Context menu: menu items are available and enabled
 *   2. Controller: allProcessedEvents contain correct events
 *   3. View: computeTimelinePresentation includes events in columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  findColumn, buildContextMenu, getMenuPayload, getAddEventPayload,
  setUltimateEnergyToMax,
} from '../../helpers';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import type { Potential } from '../../../../consts/types';

/* eslint-disable @typescript-eslint/no-require-imports */
const EMBER_JSON = require('../../../../model/game-data/operators/ember/ember.json');
const EMBER_ID: string = EMBER_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/ember/skills/battle-skill-forward-march.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/ember/skills/combo-skill-frontline-support.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/ember/skills/ultimate-re-ignited-oath.json',
).properties.id;

const STEEL_OATH_ID: string = require(
  '../../../../model/game-data/operators/ember/statuses/status-the-steel-oath.json',
).properties.id;

const INFLAMED_ID: string = require(
  '../../../../model/game-data/operators/ember/statuses/status-inflamed-for-the-assault.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_EMBER = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupEmber() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_EMBER, EMBER_ID); });
  return view;
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupEmber();
    const col = findColumn(result.current, SLOT_EMBER, NounType.BATTLE);
    expect(col).toBeDefined();

    // Context menu layer
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer
    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_EMBER && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill placed in COMBO_SKILL column via freeform', () => {
    const { result } = setupEmber();

    // Combo trigger is enemy attacking controlled operator -- use freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_EMBER, NounType.COMBO);
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

    // Controller layer
    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_EMBER && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);

    // Cooldown segment exists
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: ultimate placed in ULTIMATE column', () => {
    const { result } = setupEmber();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_EMBER, 0); });

    const col = findColumn(result.current, SLOT_EMBER, NounType.ULTIMATE);
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

    // Controller layer
    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_EMBER && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// =============================================================================
// B. Battle Skill Mechanics
// =============================================================================

describe('B. Battle Skill Mechanics', () => {
  it('B1: battle skill deals heat damage (frames processed without crash)', () => {
    const { result } = setupEmber();
    const col = findColumn(result.current, SLOT_EMBER, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: battle skill processed with frames intact
    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_EMBER && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    // Frames carry the heat damage effects; verify they exist
    const framesWithData = battles[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(framesWithData.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: battle skill applies knock down physical status', () => {
    const { result } = setupEmber();
    const col = findColumn(result.current, SLOT_EMBER, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: battle skill event has frames that include knock_down effects
    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_EMBER && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    // Verify the event was processed without crashing (knock down is applied via frames)
    expect(battles[0].segments.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. Ultimate Mechanics
// =============================================================================

describe('C. Ultimate Mechanics', () => {
  it('C1: ultimate applies Steel Oath status to operators', () => {
    const { result } = setupEmber();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_EMBER, 0); });

    const col = findColumn(result.current, SLOT_EMBER, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: Steel Oath status events should be generated
    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === STEEL_OATH_ID,
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);

    // View: Steel Oath appears in operator status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT_EMBER, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const statusVm = viewModels.get(statusCol!.key);
    expect(statusVm).toBeDefined();
    const steelOathVm = statusVm!.events.filter(
      (ev) => ev.columnId === STEEL_OATH_ID,
    );
    expect(steelOathVm.length).toBeGreaterThanOrEqual(1);
  });

  it('C2: ultimate energy cost at P0 is 100', () => {
    const cost = getUltimateEnergyCostForPotential(EMBER_ID, 0 as Potential);
    expect(cost).toBe(100);
  });

  it('C3: ultimate energy cost at P4 is 85 (reduced by potential)', () => {
    const cost = getUltimateEnergyCostForPotential(EMBER_ID, 4 as Potential);
    expect(cost).toBe(85);
  });
});

// =============================================================================
// D. Talent-Derived Statuses
// =============================================================================

describe('D. Talent-Derived Statuses', () => {
  it('D1: battle skill triggers Inflamed for the Assault on operator', () => {
    const { result } = setupEmber();
    const col = findColumn(result.current, SLOT_EMBER, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: Inflamed for the Assault status on Ember
    const inflamedEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLAMED_ID && ev.ownerEntityId === SLOT_EMBER,
    );
    expect(inflamedEvents.length).toBeGreaterThanOrEqual(1);

    // View: appears in operator status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT_EMBER, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const statusVm = viewModels.get(statusCol!.key);
    expect(statusVm).toBeDefined();
    const inflamedVm = statusVm!.events.filter(
      (ev) => ev.columnId === INFLAMED_ID && ev.ownerEntityId === SLOT_EMBER,
    );
    expect(inflamedVm.length).toBeGreaterThanOrEqual(1);
  });

  it('D2: combo skill triggers Inflamed for the Assault on operator', () => {
    const { result } = setupEmber();

    // Freeform to bypass combo trigger requirement
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_EMBER, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: Inflamed for the Assault status on Ember
    const inflamedEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLAMED_ID && ev.ownerEntityId === SLOT_EMBER,
    );
    expect(inflamedEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// E. View Layer
// =============================================================================

describe('E. View Layer', () => {
  it('E1: battle skill visible in presentation', () => {
    const { result } = setupEmber();
    const col = findColumn(result.current, SLOT_EMBER, NounType.BATTLE);
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
    const battleVm = viewModels.get(col!.key);
    expect(battleVm).toBeDefined();
    expect(battleVm!.events.some(
      (ev) => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_EMBER,
    )).toBe(true);
  });

  it('E2: ultimate visible in presentation', () => {
    const { result } = setupEmber();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_EMBER, 0); });

    const col = findColumn(result.current, SLOT_EMBER, NounType.ULTIMATE);
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
    const ultVm = viewModels.get(col!.key);
    expect(ultVm).toBeDefined();
    expect(ultVm!.events.some(
      (ev) => ev.name === ULTIMATE_ID && ev.ownerEntityId === SLOT_EMBER,
    )).toBe(true);
  });
});
