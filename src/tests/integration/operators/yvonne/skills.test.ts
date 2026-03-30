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
import { InteractionModeType, SegmentType } from '../../../../consts/enums';
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
    const col = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE_SKILL);
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
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battles).toHaveLength(1);
  });

  it('combo skill placed in freeform with cooldown', () => {
    const { result } = setupYvonne();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_YVONNE, NounType.COMBO_SKILL);
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
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.COMBO_SKILL,
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
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });

  // =========================================================================
  // B. Battle Skill -- Cryo Mechanics
  // =========================================================================

  it('battle skill has correct skill ID', () => {
    const { result } = setupYvonne();
    const col = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.BATTLE_SKILL,
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

    const col = findColumn(result.current, SLOT_YVONNE, NounType.COMBO_SKILL);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.COMBO_SKILL,
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
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    // Ultimate has animation + active segments = at least 2
    expect(ultimates[0].segments.length).toBeGreaterThanOrEqual(2);
  });

  // =========================================================================
  // E. Crit Stacks Talent
  // =========================================================================

  it('crit stacks and barrage of technology status configs exist with correct IDs', () => {
    expect(CRIT_STACKS_ID).toBeDefined();
    expect(BARRAGE_ID).toBeDefined();
    // Crit stacks has a stack limit of 10
    expect(CRIT_STACKS_JSON.properties.stacks.limit.value).toBe(10);
    // Barrage of Technology has CONSUME interaction type
    expect(BARRAGE_JSON.properties.stacks.interactionType).toBe('CONSUME');
  });

  // =========================================================================
  // F. View Layer
  // =========================================================================

  it('battle skill visible in timeline presentation', () => {
    const { result } = setupYvonne();
    const col = findColumn(result.current, SLOT_YVONNE, NounType.BATTLE_SKILL);
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
    const bsVm = viewModels.get(col!.key);
    expect(bsVm).toBeDefined();
    const bsEvents = bsVm!.events.filter(
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.BATTLE_SKILL,
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
      (ev) => ev.ownerId === SLOT_YVONNE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });
});
