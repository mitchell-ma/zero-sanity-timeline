/**
 * @jest-environment jsdom
 */

/**
 * Snowshine — Integration Tests
 *
 * Tests the full user flow through useApp for Snowshine's skills:
 * A. Core skill placement (battle skill, combo, ultimate)
 * B. Battle Skill — Protection and Cryo Infliction
 * C. Combo — Healing and Cooldown
 * D. Ultimate — Snow Zone and Energy
 * E. View layer — all skills visible in computeTimelinePresentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items are available and enabled
 *   2. Controller: events appear in allProcessedEvents with correct properties
 *   3. View: computeTimelinePresentation includes events in the correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, SegmentType, StatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  INFLICTION_COLUMNS,
  ENEMY_ID,
} from '../../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const SNOWSHINE_JSON = require('../../../../model/game-data/operators/snowshine/snowshine.json');
const SNOWSHINE_ID: string = SNOWSHINE_JSON.id;

const BS_JSON = require('../../../../model/game-data/operators/snowshine/skills/battle-skill-saturated-defense.json');
const BS_ID: string = BS_JSON.properties.id;

const COMBO_JSON = require('../../../../model/game-data/operators/snowshine/skills/combo-skill-polar-rescue.json');
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULT_JSON = require('../../../../model/game-data/operators/snowshine/skills/ultimate-frigid-snowfield.json');
const ULT_ID: string = ULT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_SNOWSHINE = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupSnowshine() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_SNOWSHINE, SNOWSHINE_ID); });
  return view;
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupSnowshine();
    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_SNOWSHINE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BS_ID);
  });

  it('A2: Combo skill freeform placement with cooldown', () => {
    const { result } = setupSnowshine();

    // Switch to freeform to bypass activation conditions
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_SNOWSHINE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // Verify cooldown segment exists — base 25s, L12 = 23s
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // Default skill level is L12, so cooldown should be 23s
    expect(cdSeg!.properties.duration).toBe(23 * FPS);
  });

  it('A3: Ultimate placement with energy', () => {
    const { result } = setupSnowshine();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_SNOWSHINE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULT_ID);
  });
});

// =============================================================================
// B. Battle Skill — Protection and Cryo Infliction
// =============================================================================

describe('B. Battle Skill — Protection and Cryo Infliction', () => {
  it('B1: BS applies Protection status to operators', () => {
    const { result } = setupSnowshine();

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Protection status should be applied (as a team-wide or per-operator status)
    const protectionEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.PROTECTION,
    );
    expect(protectionEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: BS applies cryo infliction to enemy', () => {
    const { result } = setupSnowshine();

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // BS has cryo infliction frame at offset 3.57s
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_ID
        && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. Combo — Healing and Cooldown
// =============================================================================

describe('C. Combo — Healing and Cooldown', () => {
  it('C1: Combo has cooldown segment', () => {
    const { result } = setupSnowshine();

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_SNOWSHINE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Should have 3 segments: animation (TIME_STOP) + active + cooldown
    expect(combos[0].segments.length).toBeGreaterThanOrEqual(2);

    // Cooldown segment present
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });
});

// =============================================================================
// D. Ultimate — Snow Zone and Energy
// =============================================================================

describe('D. Ultimate — Snow Zone and Energy', () => {
  it('D1: Ultimate energy cost is 80 at P0 (no potential scaling)', () => {
    const costP0 = getUltimateEnergyCostForPotential(SNOWSHINE_ID, 0);
    expect(costP0).toBe(80);

    // No potential reduces energy cost — P5 should still be 80
    const costP5 = getUltimateEnergyCostForPotential(SNOWSHINE_ID, 5);
    expect(costP5).toBe(80);
  });

  it('D2: Ultimate has animation + active segments', () => {
    const { result } = setupSnowshine();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_SNOWSHINE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);

    // Should have at least 2 segments (animation + active)
    expect(ultimates[0].segments.length).toBeGreaterThanOrEqual(2);

    // Animation segment should be TIME_STOP
    const animSeg = ultimates[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();
  });
});

// =============================================================================
// E. View Layer
// =============================================================================

describe('E. View Layer', () => {
  it('E1: Battle skill visible in computeTimelinePresentation', () => {
    const { result } = setupSnowshine();

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
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
      ev => ev.ownerId === SLOT_SNOWSHINE && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('E2: All skills visible in computeTimelinePresentation after placement', () => {
    const { result } = setupSnowshine();

    // Freeform for combo
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });

    // Place battle skill
    const bsCol = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Place combo skill
    const comboCol = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place ultimate
    const ultCol = findColumn(result.current, SLOT_SNOWSHINE, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 30 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Verify all three skill types in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const bsVm = viewModels.get(bsCol!.key);
    expect(bsVm).toBeDefined();
    expect(bsVm!.events.some(ev => ev.name === BS_ID)).toBe(true);

    const comboVm = viewModels.get(comboCol!.key);
    expect(comboVm).toBeDefined();
    expect(comboVm!.events.some(ev => ev.name === COMBO_ID)).toBe(true);

    const ultVm = viewModels.get(ultCol!.key);
    expect(ultVm).toBeDefined();
    expect(ultVm!.events.some(ev => ev.name === ULT_ID)).toBe(true);
  });
});
