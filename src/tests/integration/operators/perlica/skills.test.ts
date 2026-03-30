/**
 * @jest-environment jsdom
 */

/**
 * Perlica — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill electric infliction on enemy
 * 3. Combo cooldown at L12
 * 4. Ultimate energy cost at different potentials
 * 5. View layer presentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items available and enabled
 *   2. Controller: processed events, timing, duration
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import {
  findColumn,
  buildContextMenu,
  getMenuPayload,
  getAddEventPayload,
  setUltimateEnergyToMax,
} from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const PERLICA_JSON = require('../../../../model/game-data/operators/perlica/perlica.json');
const PERLICA_ID: string = PERLICA_JSON.id;

const BATTLE_SKILL_JSON = require(
  '../../../../model/game-data/operators/perlica/skills/battle-skill-protocol-omega-strike.json',
);
const BATTLE_SKILL_ID: string = BATTLE_SKILL_JSON.properties.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/perlica/skills/combo-skill-instant-protocol-chain.json',
);
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULTIMATE_JSON = require(
  '../../../../model/game-data/operators/perlica/skills/ultimate-protocol-epsilon.json',
);
const ULTIMATE_ID: string = ULTIMATE_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_PERLICA = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupPerlica() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_PERLICA, PERLICA_ID); });
  return view;
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupPerlica();
    const col = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE_SKILL);
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
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: Combo skill placed in freeform with cooldown', () => {
    const { result } = setupPerlica();

    // Combo requires activation trigger — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_PERLICA, NounType.COMBO_SKILL);
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
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // Verify cooldown segment exists
    const cooldownSeg = combos[0].segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
  });

  it('A3: Ultimate placed with energy requirement', () => {
    const { result } = setupPerlica();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_PERLICA, 0); });

    const col = findColumn(result.current, SLOT_PERLICA, NounType.ULTIMATE);
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
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// =============================================================================
// B. Battle Skill — Electric Infliction
// =============================================================================

describe('B. Battle Skill — Electric Infliction', () => {
  it('B1: Battle skill applies electric infliction to enemy', () => {
    const { result } = setupPerlica();
    const col = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Battle skill should generate electric infliction on enemy
    const electricInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.ELECTRIC && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(electricInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. Combo Cooldown
// =============================================================================

describe('C. Combo Cooldown', () => {
  it('C1: Combo cooldown is 19s at L12', () => {
    // Verify from JSON: cooldown array last entry (L12, index 11) = 19
    const cooldownSegment = COMBO_JSON.segments.find(
      (s: { properties: { segmentTypes?: string[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSegment).toBeDefined();

    // The cooldown VARY_BY array: index 11 (L12) = 19
    const cooldownValues = cooldownSegment.properties.duration.value.value;
    expect(cooldownValues[11]).toBe(19);

    // Base cooldown (L1) = 20
    expect(cooldownValues[0]).toBe(20);
  });
});

// =============================================================================
// D. Ultimate — Energy Cost
// =============================================================================

describe('D. Ultimate — Energy Cost', () => {
  it('D1: Ultimate energy cost is 80 at P0, 68 at P2', () => {
    const costP0 = getUltimateEnergyCostForPotential(PERLICA_ID, 0);
    expect(costP0).toBe(80);

    const costP2 = getUltimateEnergyCostForPotential(PERLICA_ID, 2);
    expect(costP2).toBe(68);
  });

  it('D2: Ultimate processes correctly', () => {
    const { result } = setupPerlica();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_PERLICA, 0); });

    const col = findColumn(result.current, SLOT_PERLICA, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);

    // Ultimate should have animation + active segments with nonzero duration
    const totalDuration = eventDuration(ultimates[0]);
    expect(totalDuration).toBeGreaterThan(0);

    // Verify animation segment exists (time-stop)
    const animSeg = ultimates[0].segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();
  });
});

// =============================================================================
// E. View Layer
// =============================================================================

describe('E. View Layer', () => {
  it('E1: Skills visible in presentation for battle skill', () => {
    const { result } = setupPerlica();
    const col = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE_SKILL);
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

    // Find the battle skill column in view models
    const battleCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === SLOT_PERLICA
        && c.columnId === NounType.BATTLE_SKILL,
    );
    expect(battleCol).toBeDefined();

    const vm = viewModels.get(battleCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.length).toBeGreaterThanOrEqual(1);

    const bsEvent = vm!.events.find((ev) => ev.name === BATTLE_SKILL_ID);
    expect(bsEvent).toBeDefined();
  });

  it('E2: Skills visible in presentation for combo and ultimate', () => {
    const { result } = setupPerlica();

    // Place combo in freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place ultimate
    act(() => { setUltimateEnergyToMax(result.current, SLOT_PERLICA, 0); });
    const ultCol = findColumn(result.current, SLOT_PERLICA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 30 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Combo visible
    const comboVmCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === SLOT_PERLICA
        && c.columnId === NounType.COMBO_SKILL,
    );
    expect(comboVmCol).toBeDefined();
    const comboVm = viewModels.get(comboVmCol!.key);
    expect(comboVm).toBeDefined();
    expect(comboVm!.events.some((ev) => ev.name === COMBO_ID)).toBe(true);

    // Ultimate visible
    const ultVmCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === SLOT_PERLICA
        && c.columnId === NounType.ULTIMATE,
    );
    expect(ultVmCol).toBeDefined();
    const ultVm = viewModels.get(ultVmCol!.key);
    expect(ultVm).toBeDefined();
    expect(ultVm!.events.some((ev) => ev.name === ULTIMATE_ID)).toBe(true);
  });
});
