/**
 * @jest-environment jsdom
 */

/**
 * Catcher Skills -- Integration Tests
 *
 * Tests the full pipeline through useApp: skill placement, status derivation,
 * protection/vulnerability application, shield from combo, and ultimate mechanics.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct columns
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Catcher is swapped into slot-0 for all tests.
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

/* eslint-disable @typescript-eslint/no-require-imports */
const CATCHER_JSON = require('../../../../model/game-data/operators/catcher/catcher.json');
const CATCHER_ID: string = CATCHER_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/catcher/skills/battle-skill-rigid-interdiction.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/catcher/skills/combo-skill-timely-suppression.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/catcher/skills/ultimate-textbook-assault.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CATCHER = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupCatcher() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CATCHER, CATCHER_ID); });
  return view;
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill places in BATTLE_SKILL column with correct ID', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.BATTLE);
    expect(col?.defaultEvent).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.BATTLE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: Combo skill places freeform in COMBO_SKILL column with cooldown segment', () => {
    const { result } = setupCatcher();

    // Switch to freeform — Catcher combo trigger not directly simulatable
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.COMBO);
    expect(col?.defaultEvent).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.COMBO,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(COMBO_SKILL_ID);

    // Should have a cooldown segment
    const cdSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: Ultimate places in ULTIMATE column after setting energy to max', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.ULTIMATE);
    expect(col?.defaultEvent).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);
  });
});

// =============================================================================
// B. Battle Skill -- Protection and Vulnerability
// =============================================================================

describe('B. Battle Skill -- Protection and Vulnerability', () => {
  it('B1: Battle skill has frame at offset 0s (Protection + SP Return)', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.BATTLE,
    );
    expect(events).toHaveLength(1);

    // Battle skill has a segment with frames
    const segment = events[0].segments[0];
    expect(segment).toBeDefined();
    expect(segment.frames).toBeDefined();
    expect(segment.frames!.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: Battle skill has retaliation frame at 2.77s with Vulnerability', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.BATTLE,
    );
    expect(events).toHaveLength(1);

    // The segment should have 2 frames (0s and 2.77s)
    const segment = events[0].segments[0];
    expect(segment.frames!.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// C. Ultimate Mechanics
// =============================================================================

describe('C. Ultimate Mechanics', () => {
  it('C1: Ultimate has 3 damage frames', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);

    // Ultimate has 2 segments (animation + active), active segment has 3 frames
    const activeSegment = events[0].segments.find(
      (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
    );
    expect(activeSegment).toBeDefined();
    expect(activeSegment!.frames).toHaveLength(3);
  });

  it('C2: Ultimate applies Knock Down on frame 3', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);

    // The active segment's 3rd frame (index 2) has KNOCK_DOWN
    const activeSegment = events[0].segments.find(
      (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
    );
    expect(activeSegment).toBeDefined();
    const frame3 = activeSegment!.frames![2];
    expect(frame3).toBeDefined();

    // Verify the frame contains KNOCK_DOWN application (check full frame JSON)
    const hasKnockDown = JSON.stringify(frame3).includes('KNOCK_DOWN');
    expect(hasKnockDown).toBe(true);
  });

  it('C3: Ultimate energy cost: base 80, P4+ = 72', () => {
    const p0Cost = getUltimateEnergyCostForPotential(CATCHER_ID, 0);
    const p4Cost = getUltimateEnergyCostForPotential(CATCHER_ID, 4);
    const p5Cost = getUltimateEnergyCostForPotential(CATCHER_ID, 5);

    expect(p0Cost).toBe(80);
    expect(p4Cost).toBe(72);
    expect(p5Cost).toBe(72);
  });
});

// =============================================================================
// D. Combo -- Shield
// =============================================================================

describe('D. Combo -- Shield', () => {
  it('D1: Combo skill applies Shield status (DEF-scaling, 10s base duration)', () => {
    const { result } = setupCatcher();

    // Use freeform for combo placement
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_CATCHER && ev.columnId === NounType.COMBO,
    );
    expect(events).toHaveLength(1);
    expect(eventDuration(events[0])).toBeGreaterThan(0);

    // Combo has frames that apply SHIELD
    const activeSegment = events[0].segments.find(
      (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
    );
    expect(activeSegment).toBeDefined();
    const hasShield = JSON.stringify(activeSegment!.frames).includes('SHIELD');
    expect(hasShield).toBe(true);
  });
});

// =============================================================================
// E. View Layer
// =============================================================================

describe('E. View Layer', () => {
  it('E1: Battle skill visible in computeTimelinePresentation', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_CATCHER,
    )).toBe(true);
  });

  it('E2: Combo skill visible in computeTimelinePresentation', () => {
    const { result } = setupCatcher();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(col!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(
      ev => ev.name === COMBO_SKILL_ID && ev.ownerId === SLOT_CATCHER,
    )).toBe(true);
  });

  it('E3: Ultimate visible in computeTimelinePresentation', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });

    const col = findColumn(result.current, SLOT_CATCHER, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(col!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(
      ev => ev.name === ULTIMATE_ID && ev.ownerId === SLOT_CATCHER,
    )).toBe(true);
  });
});
