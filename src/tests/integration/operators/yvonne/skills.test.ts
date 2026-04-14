/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (BS, combo, ultimate)
 * 2. Battle skill — cryo mechanics and FIRST_MATCH clause
 * 3. Combo — cooldown scaling and correct ID
 * 4. Ultimate — high energy cost (220), multi-segment channeled skill
 * 5. Crit Stacks / Barrage of Technology talent status
 * 6. View layer — skills visible in presentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items available and enabled
 *   2. Controller: processed events, timing, duration
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, SegmentType, StackInteractionType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCost } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, getAddEventPayload, setUltimateEnergyToMax } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_JSON = require('../../../../model/game-data/operators/yvonne/yvonne.json');
const YVONNE_ID: string = YVONNE_JSON.id;

const BS_JSON = require('../../../../model/game-data/operators/yvonne/skills/battle-skill-brr-brr-bomb.json');
const BS_ID: string = BS_JSON.properties.id;

const COMBO_JSON = require('../../../../model/game-data/operators/yvonne/skills/combo-skill-flashfreezer.json');
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULT_ENERGY_COST = 220;

const CRIT_STACKS_JSON = require('../../../../model/game-data/operators/yvonne/statuses/status-crit-stacks.json');
const CRIT_STACKS_ID: string = CRIT_STACKS_JSON.properties.id;

const BARRAGE_JSON = require('../../../../model/game-data/operators/yvonne/statuses/status-barrage-of-technology.json');
const BARRAGE_ID: string = BARRAGE_JSON.properties.id;

const FREEZING_POINT_JSON = require('../../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json');
const FREEZING_POINT_ID: string = FREEZING_POINT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_YVONNE = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupYvonne() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_YVONNE, YVONNE_ID); });
  return view;
}

describe('Yvonne Skills -- integration through useApp', () => {
  // =========================================================================
  // A. Core Skill Placement
  // =========================================================================

  it('battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupYvonne();
    const col = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE);
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
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
  });

  it('combo skill placed in freeform with cooldown', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_YVONNE, NounType.COMBO);
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
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Combo has a cooldown segment (may be COOLDOWN or IMMEDIATE_COOLDOWN)
    const combo = combos[0];
    const cooldownSegment = combo.segments.find(
      (s) => s.properties.segmentTypes?.some(
        (st) => st === SegmentType.COOLDOWN || st === SegmentType.IMMEDIATE_COOLDOWN,
      ),
    );
    expect(cooldownSegment).toBeDefined();
  });

  it('ultimate placed with energy requirement', () => {
    const { result } = setupYvonne();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_YVONNE, 0); });

    const col = findColumn(result.current, SLOT_YVONNE, NounType.ULTIMATE);
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
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });

  // =========================================================================
  // B. Battle Skill -- Cryo Mechanics
  // =========================================================================

  it('battle skill has correct skill ID', () => {
    const { result } = setupYvonne();
    const col = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BS_ID);
  });

  it('battle skill uses FIRST_MATCH clause type in frame data', () => {
    // Verify the JSON config has FIRST_MATCH clauseType on the frame
    const frame = BS_JSON.segments[0].frames[0];
    expect(frame.clauseType).toBe('FIRST_MATCH');
  });

  // =========================================================================
  // C. Combo Skill
  // =========================================================================

  it('combo has 18s cooldown at L12', () => {
    // Combo cooldown is VARY_BY skill level: last entry (L12) = 18s
    const cooldownSeg = COMBO_JSON.segments.find(
      (s: { properties: { segmentTypes?: string[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
    const cooldownValues = cooldownSeg.properties.duration.value.value;
    // L12 is the last entry (index 11)
    expect(cooldownValues[11]).toBe(18);
    // L1 is the first entry (index 0) = 20s base
    expect(cooldownValues[0]).toBe(20);
  });

  it('combo processes with correct ID', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_YVONNE, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);
  });

  // =========================================================================
  // D. Ultimate -- Long Channel
  // =========================================================================

  it('ultimate energy cost is 220', () => {
    const cost = getUltimateEnergyCost(YVONNE_ID);
    expect(cost).toBe(ULT_ENERGY_COST);
  });

  it('ultimate has multiple segments (channeled skill)', () => {
    const { result } = setupYvonne();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_YVONNE, 0); });

    const col = findColumn(result.current, SLOT_YVONNE, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    // Ultimate has animation + active segments = at least 2
    expect(ultimates[0].segments.length).toBeGreaterThanOrEqual(2);
  });

  // =========================================================================
  // E. Cryoblasting Pistolier (Crit) Talent
  // =========================================================================

  it('crit stacks and barrage of technology status configs exist with correct IDs', () => {
    expect(CRIT_STACKS_ID).toBeDefined();
    expect(BARRAGE_ID).toBeDefined();
    // Crit stacks has a stack limit of 10
    expect(CRIT_STACKS_JSON.properties.stacks.limit.value).toBe(10);
    // Barrage of Technology has RESET interaction type (refreshes on re-trigger)
    expect(BARRAGE_JSON.properties.stacks.interactionType).toBe(StackInteractionType.RESET);
  });

  // =========================================================================
  // F. View Layer
  // =========================================================================

  it('battle skill visible in timeline presentation', () => {
    const { result } = setupYvonne();
    const col = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE);
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
    const bsVm = viewModels.get(col!.key);
    expect(bsVm).toBeDefined();
    const bsEvents = bsVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
  });

  it('ultimate visible in timeline presentation', () => {
    const { result } = setupYvonne();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_YVONNE, 0); });

    const col = findColumn(result.current, SLOT_YVONNE, NounType.ULTIMATE);
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
    const ultEvents = ultVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });

  // =========================================================================
  // G. View Layer — Applied Status Durations
  // =========================================================================

  it('Barrage of Technology visible in view with correct duration after BS + cryo infliction', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        'enemy', 'CRYO_INFLICTION', 1 * FPS,
        { name: 'CRYO_INFLICTION', segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    const bsCol = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE)!;
    const bsPayload = getMenuPayload(result.current, bsCol, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill);
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    // Find Barrage event in processed events
    const barrage = result.current.allProcessedEvents.find(
      ev => ev.id === BARRAGE_ID && ev.ownerEntityId === SLOT_YVONNE,
    );
    expect(barrage).toBeDefined();
    // Barrage duration should be infinite (99999s)
    const dur = barrage!.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(dur).toBe(Math.round(99999 * FPS));
    // Should be visible in view
    const statusCol = findColumn(result.current, SLOT_YVONNE, 'operator-status');
    expect(statusCol).toBeDefined();
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.id === BARRAGE_ID)).toBe(true);
  });

  it('Freezing Point visible in view with correct duration after cryo infliction placed', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        'enemy', 'CRYO_INFLICTION', 1 * FPS,
        { name: 'CRYO_INFLICTION', segments: [{ properties: { duration: 5 * FPS } }] },
      );
    });

    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FREEZING_POINT_ID && ev.ownerEntityId === SLOT_YVONNE,
    );
    expect(fp).toBeDefined();
    const dur = fp!.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // Cryo infliction is 5s, talent event should be consumed when infliction expires
    // so duration should be <= 5s
    expect(dur).toBeLessThanOrEqual(5 * FPS);
    // Should be visible in view
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT_YVONNE, 'operator-status');
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.id === FREEZING_POINT_ID)).toBe(true);
  });

  it('Expert Mechcrafter visible in view with 7s duration at P5', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const props = result.current.loadoutProperties[SLOT_YVONNE];
    act(() => {
      result.current.handleStatsChange(SLOT_YVONNE, { ...props, operator: { ...props.operator, potential: 5 } });
    });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_YVONNE, 0); });
    const ultCol = findColumn(result.current, SLOT_YVONNE, NounType.ULTIMATE)!;
    const ultPayload = getMenuPayload(result.current, ultCol, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });

    const expert = result.current.allProcessedEvents.find(
      ev => ev.id === 'EXPERT_MECHCRAFTER' && ev.ownerEntityId === SLOT_YVONNE,
    );
    expect(expert).toBeDefined();
    const dur = expert!.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(dur).toBe(Math.round(7 * FPS));
    // Starts at active segment start (after animation)
    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    )!;
    const animDur = ult.segments[0].properties.duration;
    expect(expert!.startFrame).toBe(ult.startFrame + animDur);
    // Visible in view
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT_YVONNE, 'operator-status');
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.id === 'EXPERT_MECHCRAFTER')).toBe(true);
  });

  it('Expert Mechcrafter NOT visible at P0', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_YVONNE, 0); });
    const ultCol = findColumn(result.current, SLOT_YVONNE, NounType.ULTIMATE)!;
    const ultPayload = getMenuPayload(result.current, ultCol, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });

    const expert = result.current.allProcessedEvents.filter(
      ev => ev.id === 'EXPERT_MECHCRAFTER' && ev.ownerEntityId === SLOT_YVONNE,
    );
    expect(expert).toHaveLength(0);
  });
});
