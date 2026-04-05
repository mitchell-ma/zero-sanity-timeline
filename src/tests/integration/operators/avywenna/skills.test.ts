/**
 * @jest-environment jsdom
 */

/**
 * Avywenna Skills — Integration Tests
 *
 * Tests the full pipeline through useApp: skill placement, cooldown timing,
 * ultimate energy cost at different potentials, Thunderlance status generation,
 * and view-layer presentation.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct columns
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Avywenna is swapped into slot-0 for all tests.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, SegmentType } from '../../../../consts/enums';
import { getOperatorStatuses } from '../../../../model/game-data/operatorStatusesStore';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax,
} from '../../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const AVYWENNA_JSON = require('../../../../model/game-data/operators/avywenna/avywenna.json');
const AVYWENNA_ID: string = AVYWENNA_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/avywenna/skills/battle-skill-thunderlance-interdiction.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/avywenna/skills/combo-skill-thunderlance-strike.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/avywenna/skills/ultimate-thunderlance-final-shock.json',
).properties.id;

const THUNDERLANCE_STATUS_JSON = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance.json',
);
const THUNDERLANCE_STATUS_ID: string = THUNDERLANCE_STATUS_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_AVYWENNA = 'slot-0';

/** Set up a fresh hook with Avywenna in slot-0. */
function setupAvywenna() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_AVYWENNA, AVYWENNA_ID); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill appears in BATTLE_SKILL column', () => {
    const { result } = setupAvywenna();
    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.BATTLE);
    expect(col).toBeDefined();
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
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.BATTLE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: Combo skill appears in COMBO_SKILL column with cooldown (freeform)', () => {
    const { result } = setupAvywenna();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);
    expect(col).toBeDefined();
    expect(col?.defaultEvent).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.COMBO,
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

  it('A3: Ultimate appears in ULTIMATE column with energy', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AVYWENNA, 0); });

    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.ULTIMATE);
    expect(col).toBeDefined();
    expect(col?.defaultEvent).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Electric Damage
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill — Electric Damage', () => {
  it('B1: Battle skill has correct skill ID', () => {
    const { result } = setupAvywenna();
    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);

    // View layer: appears in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_AVYWENNA,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Cooldown
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Cooldown', () => {
  it('C1: Combo cooldown is 12s at skill level 12 (default)', () => {
    const { result } = setupAvywenna();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Default skill level is 12 for 5-star operators — no need to change it
    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.COMBO,
    );
    expect(events).toHaveLength(1);

    // Total duration includes animation (0.5s) + active (0.2s) + cooldown (12s) = 12.7s
    // Cooldown segment specifically should be 12s = 12 * FPS frames
    const cdSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    expect(cdSeg!.properties.duration).toBe(12 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate Energy
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate Energy', () => {
  it('D1: P0 ult cost is 100, P4 ult cost is 85', () => {
    const p0Cost = getUltimateEnergyCostForPotential(AVYWENNA_ID, 0);
    const p4Cost = getUltimateEnergyCostForPotential(AVYWENNA_ID, 4);

    expect(p0Cost).toBe(100);
    expect(p4Cost).toBe(85);
  });

  it('D2: Ultimate processes with animation segment', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AVYWENNA, 0); });

    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);

    // Should have an animation segment
    const animSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Thunderlance Status
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Thunderlance Status', () => {
  it('E1: Thunderlance exchange status is registered in the operator status store', () => {
    // The Thunderlance status config should be loaded and accessible via the status store.
    // Statuses are keyed by operator ID (AVYWENNA), not the status originId.
    const statuses = getOperatorStatuses(AVYWENNA_ID);
    const thunderlance = statuses.find(s => s.id === THUNDERLANCE_STATUS_ID);
    expect(thunderlance).toBeDefined();
    expect(thunderlance!.target).toBe(NounType.ENEMY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. View Layer', () => {
  it('F1: Battle skill visible in presentation', () => {
    const { result } = setupAvywenna();
    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.BATTLE);

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
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_AVYWENNA,
    )).toBe(true);
  });

  it('F2: Combo skill visible in presentation (freeform)', () => {
    const { result } = setupAvywenna();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);

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
      ev => ev.name === COMBO_SKILL_ID && ev.ownerId === SLOT_AVYWENNA,
    )).toBe(true);
  });
});
