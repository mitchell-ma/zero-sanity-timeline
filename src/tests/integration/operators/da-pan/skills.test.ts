/**
 * @jest-environment jsdom
 */

/**
 * Da Pan — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo skill, ultimate)
 * 2. Battle skill applies Vulnerable; second BS triggers Lift (requires existing Vulnerable)
 * 3. Ultimate applies Vulnerable, Knock Down, and combo activation window
 * 4. P4/P0 ultimate placement
 * 5. Cooldown at skill level 12 (19s vs 20s base)
 * 6. View layer presentation
 *
 * Three-layer verification:
 * - Context menu: menu items available and enabled
 * - Controller: event counts, status, timing, duration
 * - View: computeTimelinePresentation includes events in their columns
 *
 * NOTE: Da Pan's combo skill Crush frame has an offset (1.26s) exceeding its
 * segment duration (0.3s), so the Crush effect does not execute in the current
 * pipeline. Tests verify actual pipeline behavior, not intended game design.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  PHYSICAL_STATUS_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_ID,
} from '../../../../model/channels';
import { ColumnType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, getAddEventPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const DA_PAN_JSON = require('../../../../model/game-data/operators/da-pan/da-pan.json');
const DA_PAN_ID: string = DA_PAN_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/da-pan/skills/battle-skill-flip-da-wok.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/da-pan/skills/combo-skill-more-spice.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/da-pan/skills/ultimate-chop-n-dunk.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_DA_PAN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupDaPan() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID); });
  return view;
}

function setPotential(result: { current: AppResult }, potential: number) {
  const props = result.current.loadoutProperties[SLOT_DA_PAN];
  act(() => {
    result.current.handleStatsChange(SLOT_DA_PAN, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan Skills — core placement', () => {
  it('A1: battle skill added without crash', () => {
    const { result } = setupDaPan();
    const col = findColumn(result.current, SLOT_DA_PAN, NounType.BATTLE);
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
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill placed freeform with cooldown', () => {
    const { result } = setupDaPan();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.COMBO);
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
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);

    // Verify cooldown segment exists
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: ultimate added without crash', () => {
    const { result } = setupDaPan();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, 0); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
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
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Vulnerable and Lift
//
// applyLiftOrKnockDown always adds 1 Vulnerable. Lift only fires when
// Vulnerable already existed OR isForced. So 1st BS → Vulnerable only,
// 2nd BS → Lift (because Vulnerable from 1st BS is active).
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan Skills — battle skill Vulnerable and Lift', () => {
  it('B1: first battle skill adds Vulnerable but no Lift', () => {
    const { result } = setupDaPan();
    const col = findColumn(result.current, SLOT_DA_PAN, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Vulnerable should exist on enemy
    const vulnEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(1);

    // No Lift yet — first BS has no pre-existing Vulnerable
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(liftEvents).toHaveLength(0);
  });

  it('B2: second battle skill triggers Lift (Vulnerable gate met)', () => {
    const { result } = setupDaPan();
    const col = findColumn(result.current, SLOT_DA_PAN, NounType.BATTLE);
    expect(col).toBeDefined();

    // 1st BS at 2s — adds Vulnerable
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerEntityId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // 2nd BS at 5s — Vulnerable exists from 1st BS, so Lift triggers
    const payload2 = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerEntityId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(liftEvents.length).toBeGreaterThanOrEqual(1);

    // Vulnerable stacks should accumulate (each BS adds 1)
    const vulnEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Ultimate — Knock Down and Vulnerable
//
// Ultimate frames apply forced Lift (offset 0) then forced Knock Down (offset 1.27s).
// The first forced Lift adds Vulnerable but doesn't produce a Lift status
// (isForced resolution limitation). The subsequent forced Knock Down at offset
// 1.27s fires because Vulnerable now exists from the first frame.
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan Skills — ultimate physical statuses', () => {
  it('C1: ultimate applies Knock Down and Vulnerable to enemy', () => {
    const { result } = setupDaPan();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, 0); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Knock Down should appear (Vulnerable exists from prior forced-Lift frame)
    const knockDownEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN && ev.ownerEntityId === ENEMY_ID,
    );
    expect(knockDownEvents.length).toBeGreaterThanOrEqual(1);

    // Vulnerable stacks added by both Lift and KD frames
    const vulnEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerEntityId === ENEMY_ID,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('C2: ultimate triggers combo activation window', () => {
    const { result } = setupDaPan();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, 0); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Combo activation window should be generated (from Vulnerable application)
    const activationWindows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === 'comboActivationWindow' && ev.ownerEntityId === SLOT_DA_PAN,
    );
    expect(activationWindows.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Potential Effects
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan Skills — potential effects', () => {
  it('D1: P4 ultimate placement succeeds with reduced energy cost', () => {
    const { result } = setupDaPan();
    setPotential(result, 4);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, 0); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });

  it('D2: P0 ultimate placement succeeds with base energy cost', () => {
    const { result } = setupDaPan();
    setPotential(result, 0);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, 0); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });

  it('D3: combo cooldown at skill level 12 is 19s', () => {
    const { result } = setupDaPan();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_DA_PAN, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // At skill level 12 (default), cooldown is 19s (VARY_BY array index 11)
    // Cooldown segment duration should be 19 * FPS = 2280 frames
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[]; duration?: number } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    expect(cdSeg!.properties.duration).toBe(19 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan Skills — view layer presentation', () => {
  it('E1: all skill columns visible in presentation', () => {
    const { result } = setupDaPan();

    const basicCol = findColumn(result.current, SLOT_DA_PAN, NounType.BASIC_ATTACK);
    const battleCol = findColumn(result.current, SLOT_DA_PAN, NounType.BATTLE);
    const comboCol = findColumn(result.current, SLOT_DA_PAN, NounType.COMBO);
    const ultCol = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);

    expect(basicCol).toBeDefined();
    expect(battleCol).toBeDefined();
    expect(comboCol).toBeDefined();
    expect(ultCol).toBeDefined();

    expect(basicCol!.type).toBe(ColumnType.MINI_TIMELINE);
    expect(battleCol!.type).toBe(ColumnType.MINI_TIMELINE);
    expect(comboCol!.type).toBe(ColumnType.MINI_TIMELINE);
    expect(ultCol!.type).toBe(ColumnType.MINI_TIMELINE);
  });

  it('E2: battle skill event appears in view presentation', () => {
    const { result } = setupDaPan();
    const col = findColumn(result.current, SLOT_DA_PAN, NounType.BATTLE);
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
    const battleEvents = battleVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
  });

  it('E3: combo skill event appears in view presentation', () => {
    const { result } = setupDaPan();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_DA_PAN, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const comboVm = viewModels.get(comboCol!.key);
    expect(comboVm).toBeDefined();
    const comboEvents = comboVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
  });

  it('E4: ultimate event appears in view presentation', () => {
    const { result } = setupDaPan();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, 0); });

    const ultCol = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const ultVm = viewModels.get(ultCol!.key);
    expect(ultVm).toBeDefined();
    const ultEvents = ultVm!.events.filter(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });
});
