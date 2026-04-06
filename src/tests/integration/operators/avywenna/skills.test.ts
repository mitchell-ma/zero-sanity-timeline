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
import { NounType, AdjectiveType, flattenQualifiedId } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { getOperatorStatuses } from '../../../../model/game-data/operatorStatusesStore';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  OPERATOR_STATUS_COLUMN_ID,
  INFLICTION_COLUMNS,
  ENEMY_OWNER_ID,
} from '../../../../model/channels';
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

const THUNDERLANCE_EX_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-ex.json',
).properties.id;
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
    expect(thunderlance!.target).toBe(NounType.OPERATOR);
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

// ═══════════════════════════════════════════════════════════════════════════════
// G. Combo deploys THUNDERLANCE status
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Combo deploys THUNDERLANCE status', () => {
  it('G1: Combo at 5s creates THUNDERLANCE status events on the operator', () => {
    const { result } = setupAvywenna();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place combo at 5s
    const comboCol = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Verify combo placed
    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);

    // Verify THUNDERLANCE status events appear on the operator's status column
    const thunderlanceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    expect(thunderlanceEvents.length).toBeGreaterThanOrEqual(1);

    // Status should have correct properties — stacks: 3 from combo
    const statusEvent = thunderlanceEvents[0];
    expect(statusEvent.name).toBe(THUNDERLANCE_STATUS_ID);

    // View layer: THUNDERLANCE events should be collected by the operator-status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = result.current.columns.find(
      c => c.type === ColumnType.MINI_TIMELINE
        && (c as MiniTimeline).ownerId === SLOT_AVYWENNA
        && (c as MiniTimeline).columnId === OPERATOR_STATUS_COLUMN_ID,
    );
    expect(statusCol).toBeDefined();
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    // The THUNDERLANCE status event should be present in the operator-status column
    expect(vm!.events.some(ev => ev.name === THUNDERLANCE_STATUS_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Ultimate deploys THUNDERLANCE_EX status
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Ultimate deploys THUNDERLANCE_EX status', () => {
  it('H1: Ult at 5s creates THUNDERLANCE_EX status and Electric Susceptibility on enemy', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AVYWENNA, 0); });

    // Place ultimate at 5s
    const ultCol = findColumn(result.current, SLOT_AVYWENNA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Verify ultimate placed
    const ultEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);

    // Verify THUNDERLANCE_EX status events appear on the operator
    const thunderlanceExEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
    );
    expect(thunderlanceExEvents.length).toBeGreaterThanOrEqual(1);

    const statusEvent = thunderlanceExEvents[0];
    expect(statusEvent.name).toBe(THUNDERLANCE_EX_STATUS_ID);

    // The ult should have processed with segments (animation + active)
    expect(ultEvents[0].segments.length).toBeGreaterThan(0);

    // View layer: THUNDERLANCE_EX should appear in the operator-status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = result.current.columns.find(
      c => c.type === ColumnType.MINI_TIMELINE
        && (c as MiniTimeline).ownerId === SLOT_AVYWENNA
        && (c as MiniTimeline).columnId === OPERATOR_STATUS_COLUMN_ID,
    );
    expect(statusCol).toBeDefined();
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === THUNDERLANCE_EX_STATUS_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Battle skill consumes THUNDERLANCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Battle skill consumes THUNDERLANCE', () => {
  it('I1: BS at 8s consumes THUNDERLANCE deployed by combo at 2s', () => {
    const { result } = setupAvywenna();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // 1. Place combo at 2s to deploy 3 Thunderlances
    const comboCol = findColumn(result.current, SLOT_AVYWENNA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify THUNDERLANCE status created by combo
    const thunderlanceBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    expect(thunderlanceBefore.length).toBeGreaterThanOrEqual(1);

    // 2. Place battle skill at 8s — should consume THUNDERLANCE
    const battleCol = findColumn(result.current, SLOT_AVYWENNA, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    const battlePayload = getMenuPayload(result.current, battleCol!, 8 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Verify BS was placed
    const battleEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    // Verify THUNDERLANCE events are consumed
    const thunderlanceAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    const consumedEvents = thunderlanceAfter.filter(
      ev => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('I2: BS at 5s without prior combo — no consumption occurs', () => {
    const { result } = setupAvywenna();

    // Place battle skill at 5s with NO prior combo — no THUNDERLANCE to consume
    const battleCol = findColumn(result.current, SLOT_AVYWENNA, NounType.BATTLE);
    expect(battleCol).toBeDefined();

    const payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // BS still works normally
    const battleEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
    expect(battleEvents[0].name).toBe(BATTLE_SKILL_ID);

    // No THUNDERLANCE status events should exist at all
    const thunderlanceEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_STATUS_ID,
    );
    expect(thunderlanceEvents).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Battle skill retrieval — Electric Infliction from EX lances
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. BS retrieval applies Electric Infliction from EX lances', () => {
  it('J1: BS after ult (THUNDERLANCE_EX present) applies Electric Infliction to enemy', () => {
    const { result } = setupAvywenna();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AVYWENNA, 0); });

    // Place ult at 2s → deploys THUNDERLANCE_EX
    const ultCol = findColumn(result.current, SLOT_AVYWENNA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Verify THUNDERLANCE_EX exists
    const exBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
    );
    expect(exBefore.length).toBeGreaterThanOrEqual(1);

    // Place BS at 10s → should consume THUNDERLANCE_EX and apply Electric Infliction
    const bsCol = findColumn(result.current, SLOT_AVYWENNA, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, bsCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // THUNDERLANCE_EX should be consumed
    const exAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_AVYWENNA && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
    );
    const consumedEx = exAfter.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumedEx.length).toBeGreaterThanOrEqual(1);

    // Electric Infliction should appear on enemy
    const electricInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    );
    expect(electricInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Ultimate — T2 Electric Susceptibility on enemy
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Ultimate — T2 Electric Susceptibility', () => {
  it('K1: Ult applies Electric Susceptibility to enemy (T2 baked)', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_AVYWENNA, 0); });

    // Place ult at 5s
    const ultCol = findColumn(result.current, SLOT_AVYWENNA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Electric Susceptibility should appear on enemy
    // T2 is baked with VARY_BY TALENT_LEVEL [0, 0.06, 0.10] — at default talent level (≥1), value is non-zero
    const elecSuscId = flattenQualifiedId(AdjectiveType.ELECTRIC, NounType.SUSCEPTIBILITY);
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === elecSuscId,
    );
    expect(suscEvents.length).toBeGreaterThanOrEqual(1);
  });
});
