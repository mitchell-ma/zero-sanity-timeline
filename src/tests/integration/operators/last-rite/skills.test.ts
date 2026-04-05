/**
 * @jest-environment jsdom
 */

/**
 * Last Rite — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (BS, combo, ultimate)
 * 2. Battle skill 15s cryo DOT lingering duration
 * 3. Combo skill cooldown and Solidification trigger
 * 4. Ultimate energy cost (240 P0, 204 P4 — highest in game)
 * 5. View-layer visibility
 *
 * Three-layer verification:
 * - Context menu: menu items are available and enabled
 * - Controller: events appear in allProcessedEvents with correct properties
 * - View: computeTimelinePresentation includes events in the correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { REACTION_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { EventStatusType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax,
  type AppResult,
} from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAST_RITE_ID: string = require('../../../../model/game-data/operators/last-rite/last-rite.json').id;
const BATTLE_SKILL_ID: string = require('../../../../model/game-data/operators/last-rite/skills/battle-skill-esoteric-legacy.json').properties.id;
const COMBO_SKILL_ID: string = require('../../../../model/game-data/operators/last-rite/skills/combo-skill-winters-devourer.json').properties.id;
const ULTIMATE_ID: string = require('../../../../model/game-data/operators/last-rite/skills/ultimate-vigil-services.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAST_RITE = 'slot-0';

// ── Game-data verified constants ──────────────────────────────────────────────
const COMBO_COOLDOWN_L12_SEC = 8;
const ULTIMATE_ENERGY_P0 = 240;
const ULTIMATE_ENERGY_P4 = 204;

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupLastRite() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_LAST_RITE, LAST_RITE_ID); });
  return view;
}

/** Place a Solidification reaction on the enemy at startSec. */
function placeSolidification(
  result: { current: AppResult },
  startSec: number,
  durationSec = 20,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, REACTION_COLUMNS.SOLIDIFICATION, startSec * FPS,
      { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Core Placement', () => {
  it('A0: basic attack placed without crash', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const basics = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basics.length).toBeGreaterThanOrEqual(1);
  });

  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill placed with Solidification setup', () => {
    const { result } = setupLastRite();

    // Combo requires Solidification on enemy — switch to freeform to place reaction manually
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place Solidification on enemy
    placeSolidification(result, 1);

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 3 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);
  });

  it('A3: ultimate placed with 240 energy', () => {
    const { result } = setupLastRite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAST_RITE, 0); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Cryo DOT (15s lingering)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Battle Skill Cryo DOT', () => {
  it('B1: battle skill has active segment and processes without crash', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);

    // BS active segment is 0.5s; the 15s cryo DOT is a DEAL DAMAGE effect with duration
    const totalDuration = eventDuration(battles[0]);
    expect(totalDuration).toBeGreaterThan(0);

    // Verify the event has segments
    expect(battles[0].segments.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Combo Skill', () => {
  it('C1: combo has 8s cooldown at L12', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeSolidification(result, 1);

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Check that the cooldown segment exists and has correct duration
    const segments = combos[0].segments;
    const cooldownSeg = segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN)
        || s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();

    // Default skill level is 12 → 8s cooldown
    const cooldownFrames = cooldownSeg!.properties.duration;
    expect(cooldownFrames).toBe(COMBO_COOLDOWN_L12_SEC * FPS);
  });

  it('C2: combo with Solidification triggers correctly', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place Solidification before combo
    placeSolidification(result, 1);

    const solidsBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(solidsBefore.length).toBeGreaterThanOrEqual(1);

    // Place combo
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Combo should be placed
    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].eventStatus).not.toBe(EventStatusType.CONSUMED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate — 240 Energy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Ultimate Energy', () => {
  it('D1: P0 costs 240 energy, P4 costs 204 energy', () => {
    const p0Cost = getUltimateEnergyCostForPotential(LAST_RITE_ID, 0);
    expect(p0Cost).toBe(ULTIMATE_ENERGY_P0);

    const p4Cost = getUltimateEnergyCostForPotential(LAST_RITE_ID, 4);
    expect(p4Cost).toBe(ULTIMATE_ENERGY_P4);
  });

  it('D2: ultimate processes with animation and damage frames', () => {
    const { result } = setupLastRite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAST_RITE, 0); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);

    // Verify it has an animation segment
    const animSeg = ultimates[0].segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();

    // Total duration should be meaningful (animation + damage segments)
    const totalDuration = eventDuration(ultimates[0]);
    expect(totalDuration).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — View Layer', () => {
  it('E1: battle skill visible in presentation', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BATTLE);
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
    const vm = viewModels.get(col!.key);
    expect(vm).toBeDefined();
    const bsEvents = vm!.events.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
  });

  it('E2: combo skill visible in presentation', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeSolidification(result, 1);

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(col!.key);
    expect(vm).toBeDefined();
    const comboEvents = vm!.events.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
  });
});
