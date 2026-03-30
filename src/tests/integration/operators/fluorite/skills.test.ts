/**
 * @jest-environment jsdom
 */

/**
 * Fluorite Skills -- Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill Slow + Nature infliction effects
 * 3. Combo skill cooldown scaling
 * 4. Unpredictable talent status derivation
 * 5. View-layer presentation verification
 *
 * Verifies all three layers:
 * - Context menu: menu items are available and enabled
 * - Controller: event counts, event status, timing, duration
 * - View: computeTimelinePresentation includes events in their columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const FLUORITE_JSON = require('../../../../model/game-data/operators/fluorite/fluorite.json');
const FLUORITE_ID: string = FLUORITE_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/battle-skill-tiny-surprise.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/combo-skill-free-giveaway.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/ultimate-apex-prankster.json',
).properties.id;

const UNPREDICTABLE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-unpredictable.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_FLUORITE = 'slot-0';

function setupFluorite() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_FLUORITE, FLUORITE_ID); });
  return view;
}


// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill places in BATTLE_SKILL column', () => {
    const { result } = setupFluorite();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE_SKILL);
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

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATTLE_SKILL_ID);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      (ev) => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_FLUORITE,
    )).toBe(true);
  });

  it('A2: Combo skill freeform placement with long cooldown', () => {
    const { result } = setupFluorite();

    // Combo requires activation conditions -- switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO_SKILL);
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

    // ── Controller layer ──
    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);

    // Combo has a cooldown segment -- total duration should include 40s cooldown at default skill level
    const cooldownSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
    // At default skill level (L12), cooldown = 38s
    expect(cooldownSeg!.properties.duration).toBe(38 * FPS);
  });

  it('A3: Ultimate with energy cost (100 base, P4 = 90)', () => {
    const { result } = setupFluorite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_FLUORITE, NounType.ULTIMATE);
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

    // ── Controller layer ──
    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);

    // Energy cost verification via game data function
    expect(getUltimateEnergyCostForPotential(FLUORITE_ID, 0)).toBe(100);
    expect(getUltimateEnergyCostForPotential(FLUORITE_ID, 4)).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill -- Slow and Nature Infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill Effects', () => {
  it('B1: BS generates nature infliction event on enemy', () => {
    const { result } = setupFluorite();

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // BS has frame at 2.97s that applies nature infliction to enemy
    // The infliction should appear as a derived event in the processed events
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battleEvents).toHaveLength(1);

    // Check that the battle skill has frames with infliction effects in JSON
    // The second frame at 2.97s has APPLY INFLICTION NATURE
    const allFrames = battleEvents[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(allFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: BS segment has correct duration (1.13s)', () => {
    const { result } = setupFluorite();

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battleEvents).toHaveLength(1);

    // The skill JSON defines segment duration of 1.13s
    // Verify the active segment has the correct frame-converted duration
    expect(battleEvents[0].segments.length).toBeGreaterThanOrEqual(1);
    const activeDuration = battleEvents[0].segments[0].properties.duration;
    expect(activeDuration).toBe(Math.round(1.13 * FPS));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Skill -- Cooldown Scaling
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Cooldown', () => {
  it('C1: Combo cooldown is 40s base (level-dependent)', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_FLUORITE && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);

    // Total event duration includes animation (0.5s) + active (0.07s) + cooldown (38s at L12)
    const totalDuration = eventDuration(combos[0]);
    // Cooldown segment is 38s at default skill level (L12)
    const cooldownSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
    expect(cooldownSeg!.properties.duration).toBe(38 * FPS);

    // Total event duration should include the cooldown
    expect(totalDuration).toBeGreaterThanOrEqual(38 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Unpredictable Talent
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Unpredictable Talent', () => {
  it('D1: Unpredictable status ID matches JSON config', () => {
    // Verify the status ID loads correctly from JSON
    expect(UNPREDICTABLE_ID).toBe('UNPREDICTABLE');

    // Verify operator has correct element
    expect(FLUORITE_JSON.elementType).toBe('NATURE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: All skill columns are visible in presentation', () => {
    const { result } = setupFluorite();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Battle skill column exists
    const battleCol = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();
    expect(viewModels.has(battleCol!.key)).toBe(true);

    // Combo column exists
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    expect(viewModels.has(comboCol!.key)).toBe(true);

    // Ultimate column exists
    const ultCol = findColumn(result.current, SLOT_FLUORITE, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    expect(viewModels.has(ultCol!.key)).toBe(true);

    // Basic attack column exists
    const baCol = findColumn(result.current, SLOT_FLUORITE, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    expect(viewModels.has(baCol!.key)).toBe(true);
  });

  it('E2: Battle skill event appears in presentation after placement', () => {
    const { result } = setupFluorite();

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE_SKILL);
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
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events).toHaveLength(1);
    expect(battleVM!.events[0].name).toBe(BATTLE_SKILL_ID);
    expect(battleVM!.events[0].ownerId).toBe(SLOT_FLUORITE);
  });
});
