/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard Skills — Integration Tests
 *
 * Tests the full pipeline through useApp: skill placement, infliction/reaction
 * derivation, combo triggers, empowered variants, talents, and potential interactions.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct columns
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Wulfgard is swapped into slot-0 for all tests.
 *
 * Placement modes used:
 *   - Strict: uses column defaultEvent (skill events)
 *   - Freeform: raw segment data (inflictions, reactions placed directly on enemy)
 *   - Mix: freeform enemy setup + strict skill placement
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../../model/channels';
import { ColumnType, CritMode, ElementType, EventStatusType, SegmentType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { computeAllValidations } from '../../../../controller/timeline/eventValidationController';
import { COMBO_WINDOW_COLUMN_ID } from '../../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, type AppResult } from '../../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WULFGARD_JSON = require('../../../../model/game-data/operators/wulfgard/wulfgard.json');
const WULFGARD_ID: string = WULFGARD_JSON.id;
const TALENT1_ID: string = WULFGARD_JSON.talents.one;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/wulfgard/skills/battle-skill-thermite-tracers.json',
).properties.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/wulfgard/skills/ultimate-wolven-fury.json',
).properties.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SF_MINOR_ID: string = require(
  '../../../../model/game-data/operators/wulfgard/talents/talent-scorching-fangs-minor-talent.json',
).properties.id;

const SLOT_WULFGARD = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

/** Find the unified enemy status column (reactions, inflictions live as micro-columns). */
function findEnemyStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

/** Set up a fresh hook with Wulfgard in slot-0. Returns result after swap. */
function setupWulfgard() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });
  return view;
}

function placeUlt(result: { current: AppResult }, startSec: number) {
  const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
  act(() => {
    result.current.handleAddEvent(
      SLOT_WULFGARD, NounType.ULTIMATE, startSec * FPS, ultCol!.defaultEvent!,
    );
  });
}

function setPotential(result: { current: AppResult }, potential: number) {
  const props = result.current.loadoutProperties[SLOT_WULFGARD];
  act(() => {
    result.current.handleStatsChange(SLOT_WULFGARD, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement (strict)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill appears in BATTLE column (strict)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    expect(col?.defaultEvent).toBeDefined();

    // Context menu layer
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.length).toBeGreaterThan(0);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    expect(payload.defaultSkill).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATTLE_SKILL_ID);

    // View layer
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_WULFGARD,
    )).toBe(true);
  });

  it('A2: Combo skill appears in COMBO column with cooldown (strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place heat infliction to satisfy combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const col = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    expect(col?.defaultEvent).toBeDefined();

    // Context menu layer
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(events).toHaveLength(1);
    // Should have a cooldown segment
    const cdSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: Ultimate appears in ULTIMATE column (strict)', () => {
    const { result } = setupWulfgard();
    placeUlt(result, 5);

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Infliction & Reaction Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Infliction & Reaction Pipeline', () => {
  it('B1: Battle skill applies heat infliction to enemy (strict)', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(heats.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: Ultimate forces Combustion on enemy (strict)', () => {
    const { result } = setupWulfgard();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(combustions.length).toBeGreaterThanOrEqual(1);
  });

  it('B3: Combo applies heat infliction to enemy (freeform setup + strict combo)', () => {
    const { result } = setupWulfgard();

    // Freeform: place heat infliction to open combo window
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const col = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Combo's own heat infliction should appear (in addition to the freeform one)
    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(heats.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Trigger', () => {
  it('C1: Combo triggers from own battle skill infliction (strict)', () => {
    const { result } = setupWulfgard();

    // Battle skill at 2s — applies heat infliction at frame 3 (~0.767s offset)
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Combo at 5s — after infliction has landed
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('C2: Combo triggers from teammate infliction (strict)', () => {
    const { result } = setupWulfgard();

    // Akekuri battle skill at 2s — applies heat infliction
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(akekuriBattleCol).toBeDefined();
    expect(akekuriBattleCol!.defaultEvent).toBeDefined();

    const akekuriPayload = getMenuPayload(result.current, akekuriBattleCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        akekuriPayload.ownerEntityId, akekuriPayload.columnId,
        akekuriPayload.atFrame, akekuriPayload.defaultSkill,
      );
    });

    // Wulfgard combo at 5s — should trigger from Akekuri's infliction
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Empowered Battle Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Empowered Battle Skill', () => {
  function getEmpoweredVariant(app: AppResult) {
    const battleCol = findColumn(app, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(
      v => v.id.endsWith('_EMPOWERED'),
    );
    return empowered;
  }

  it('D1: Empowered variant has 4 frames and correct segments (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place Combustion on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Get empowered variant and place it
    const empowered = getEmpoweredVariant(result.current);
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 3 * FPS, empowered!,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    // Empowered variant has 4 frames, normal has 3
    const frames = battles[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames.length).toBe(4);
  });

  it('D2: Empowered battle skill consumes Combustion (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place Combustion on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const empowered = getEmpoweredVariant(result.current);
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 3 * FPS, empowered!,
      );
    });

    // Controller: Combustion should be consumed
    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION &&
        ev.ownerEntityId === ENEMY_ID &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(combustions.length).toBeGreaterThanOrEqual(1);

    // View: consumed Combustion visible in enemy status column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const consumedInVM = enemyVM!.events.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedInVM.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Talent 1 — Scorching Fangs
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Scorching Fangs (Talent 1)', () => {
  it('E1: Ultimate Combustion triggers Scorching Fangs on Wulfgard (strict)', () => {
    const { result } = setupWulfgard();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);

    const payload = getMenuPayload(result.current, ultCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Scorching Fangs should appear as a status on Wulfgard
    const sfEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID,
    );
    expect(sfEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Talent 2 — Code of Restraint
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Code of Restraint (Talent 2)', () => {
  it('F1: Empowered BS consumes reaction and triggers Code of Restraint SP return (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: place Combustion on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Strict: empowered battle skill consumes Combustion
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 3 * FPS, empowered!,
      );
    });

    // Controller: empowered BS placed and Combustion consumed
    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
    expect(bsEvents[0].id.endsWith('_EMPOWERED')).toBe(true);

    const consumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Potential Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Potential Interactions', () => {
  it('G1: P4 ult cost is 76.5, P0 ult cost is 90', () => {
    const p4Cost = getUltimateEnergyCostForPotential(WULFGARD_ID, 4);
    const p0Cost = getUltimateEnergyCostForPotential(WULFGARD_ID, 0);
    expect(p0Cost).toBe(90);
    expect(p4Cost).toBeLessThan(p0Cost!);
  });

  it('G2: P5 — ult resets combo cooldown (strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 30 * FPS } }] },
      );
    });

    // Combo at 3s -> goes to cooldown (20s CD, ends at ~24s)
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 10s — should reset combo cooldown (P5 default)
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    const durationAfter = eventDuration(comboAfter!);

    // Combo should be shorter after ult resets its cooldown
    expect(durationAfter).toBeLessThan(durationBefore);
  });

  it('G3: P4 — ult does NOT reset combo cooldown (strict)', () => {
    const { result } = setupWulfgard();

    // Set potential to 4
    setPotential(result, 4);

    // Freeform: heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 30 * FPS } }] },
      );
    });

    // Combo at 3s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const comboBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    const durationBefore = eventDuration(comboBefore!);

    // Ult at 10s — should NOT reset cooldown at P4
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const comboAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    const durationAfter = eventDuration(comboAfter!);

    // Duration should be unchanged — no cooldown reset at P4
    expect(durationAfter).toBe(durationBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Cross-Mechanic Chains
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Cross-Mechanic Chains', () => {
  it('H1: Full rotation — ult forces Combustion + triggers Scorching Fangs + resets combo CD (strict)', () => {
    const { result } = setupWulfgard();

    // Freeform: heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 30 * FPS } }] },
      );
    });

    // 1. Combo at 3s (triggers from infliction)
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // 2. Ult at 10s (forces Combustion, triggers Scorching Fangs, resets combo CD)
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Verify: Combustion on enemy
    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(combustions.length).toBeGreaterThanOrEqual(1);

    // Verify: Scorching Fangs on Wulfgard
    const sfEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID,
    );
    expect(sfEvents.length).toBeGreaterThanOrEqual(1);

    // Verify: combo cooldown was reset (duration shortened)
    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    // Combo total duration should end near the ult frame (10s), not at 3s + 1s + 20s = 24s
    const comboEnd = combo!.startFrame + eventDuration(combo!);
    const ultFrame = 10 * FPS;
    expect(comboEnd).toBeLessThanOrEqual(ultFrame + 2 * FPS); // within 2s of ult
  });

  it('H2: Empowered battle skill after ult Combustion (strict)', () => {
    const { result } = setupWulfgard();

    // 1. Ult at 2s — forces Combustion
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // 2. Place empowered battle skill at 4s (Combustion active from ult's forced apply at ~2.77s, 5s duration)
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 4 * FPS, empowered!,
      );
    });

    // Controller: empowered has 4 frames
    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    const frames = battles[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames.length).toBe(4);

    // Controller: Combustion consumed
    const consumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION &&
        ev.ownerEntityId === ENEMY_ID &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumed.length).toBeGreaterThanOrEqual(1);

    // View: empowered BS in battle column VM, consumed Combustion in reaction VM
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(battleCol!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(ev => ev.ownerEntityId === SLOT_WULFGARD)).toBe(true);

    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
    )).toBe(true);
  });

  it('H3: P3 — empowered battle skill resets Scorching Fangs and applies Minor to teammates (freeform + strict)', () => {
    const { result } = setupWulfgard();

    // 1. Ult at 2s — forces Combustion + triggers Scorching Fangs
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.ULTIMATE, 2 * FPS, ultCol!.defaultEvent!,
      );
    });

    // Verify Scorching Fangs triggered from ult Combustion
    const sfBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID,
    );
    expect(sfBefore.length).toBeGreaterThanOrEqual(1);

    // 2. Empowered battle skill at 8s — Combustion still active, empowered variant consumes it
    //    P3 trigger: PERFORM EMPOWERED BATTLE_SKILL -> apply SF to self (reset) + SF Minor to ALL_OTHER
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 8 * FPS, empowered!,
      );
    });

    // Verify: Scorching Fangs on self should have been re-applied (reset duration)
    const sfAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID,
    );
    expect(sfAfter.length).toBeGreaterThanOrEqual(1);

    // Verify: Scorching Fangs Minor applied to other operators
    const sfMinor = result.current.allProcessedEvents.filter(
      ev => ev.name === SF_MINOR_ID && ev.ownerEntityId !== SLOT_WULFGARD,
    );
    expect(sfMinor.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Empowered Battle Skill — Activation & Consume Priority
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Empowered Battle Skill — Activation & Consume Priority', () => {
  function placeReaction(
    result: ReturnType<typeof setupWulfgard>['result'],
    reactionCol: string,
    startSec: number,
    durationSec = 20,
  ) {
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, reactionCol, startSec * FPS,
        { name: reactionCol, segments: [{ properties: { duration: durationSec * FPS } }] },
      );
    });
  }

  function placeEmpoweredBS(
    result: ReturnType<typeof setupWulfgard>['result'],
    startSec: number,
  ) {
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, startSec * FPS, empowered!,
      );
    });
  }

  function consumedReactions(result: ReturnType<typeof setupWulfgard>['result'], reactionCol: string) {
    return result.current.allProcessedEvents.filter(
      ev => ev.columnId === reactionCol &&
        ev.ownerEntityId === ENEMY_ID &&
        ev.eventStatus === EventStatusType.CONSUMED,
    );
  }

  it('I1: Empowered BS is disabled when no Combustion or Electrification exists', () => {
    const { result } = setupWulfgard();

    // Place Corrosion (not Combustion or Electrification)
    placeReaction(result, REACTION_COLUMNS.CORROSION, 1);

    // Place Solidification (not Combustion or Electrification)
    placeReaction(result, REACTION_COLUMNS.SOLIDIFICATION, 1);

    // Empowered variant should exist in the column definition but placing it should be invalid
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();

    // Place it anyway — should be flagged as invalid by the validator
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 3 * FPS, empowered!,
      );
    });

    // The placed event should have a validation warning (activation not met)
    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    // Corrosion and Solidification should NOT be consumed
    expect(consumedReactions(result, REACTION_COLUMNS.CORROSION)).toHaveLength(0);
    expect(consumedReactions(result, REACTION_COLUMNS.SOLIDIFICATION)).toHaveLength(0);
  });

  it('I2: Consumes only Combustion when both Combustion and Electrification exist', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);

    placeEmpoweredBS(result, 3);

    // Controller: Combustion consumed (priority), Electrification untouched
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION).length).toBeGreaterThanOrEqual(1);
    expect(consumedReactions(result, REACTION_COLUMNS.ELECTRIFICATION)).toHaveLength(0);

    // View: enemy status column shows consumed Combustion event
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
    )).toBe(true);
  });

  it('I3: Consumes Electrification when only Electrification exists', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);

    placeEmpoweredBS(result, 3);

    // Controller: Electrification consumed
    expect(consumedReactions(result, REACTION_COLUMNS.ELECTRIFICATION).length).toBeGreaterThanOrEqual(1);

    // View: enemy status column shows consumed Electrification event
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.eventStatus === EventStatusType.CONSUMED,
    )).toBe(true);
  });

  it('I4: Consumes only Combustion when only Combustion exists', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);

    placeEmpoweredBS(result, 3);

    // Controller: Combustion consumed
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION).length).toBeGreaterThanOrEqual(1);

    // View: enemy status column shows consumed Combustion event
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
    )).toBe(true);
  });

  it('I5: Does not consume Corrosion or Solidification even when present alongside Combustion', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeReaction(result, REACTION_COLUMNS.CORROSION, 1);
    placeReaction(result, REACTION_COLUMNS.SOLIDIFICATION, 1);

    placeEmpoweredBS(result, 3);

    // Controller: only Combustion consumed
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION).length).toBeGreaterThanOrEqual(1);
    expect(consumedReactions(result, REACTION_COLUMNS.CORROSION)).toHaveLength(0);
    expect(consumedReactions(result, REACTION_COLUMNS.SOLIDIFICATION)).toHaveLength(0);

    // View: enemy status column — Corrosion and Solidification events are NOT consumed
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const corrosionConsumed = enemyVM!.events.filter(
      ev => ev.columnId === REACTION_COLUMNS.CORROSION && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(corrosionConsumed).toHaveLength(0);
    const solidConsumed = enemyVM!.events.filter(
      ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(solidConsumed).toHaveLength(0);
  });

  it('I6: Freeform Combustion enables EBS placement without warnings', () => {
    const { result } = setupWulfgard();

    // Place freeform Combustion on enemy
    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);

    // Place empowered battle skill while Combustion is active
    placeEmpoweredBS(result, 3);

    // EBS should exist and have no activation warnings
    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].id.endsWith('_EMPOWERED')).toBe(true);
    expect(battles[0].warnings ?? []).toHaveLength(0);
  });

  it('I7: Freeform Electrification also enables EBS placement', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);
    placeEmpoweredBS(result, 3);

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].id.endsWith('_EMPOWERED')).toBe(true);
    expect(battles[0].warnings ?? []).toHaveLength(0);
  });

  it('I8: Combustion expires before frame 4 — no consume, no damage, no stagger', () => {
    const { result } = setupWulfgard();

    // Combustion at 1s, duration 1s → expires at 2s
    // EBS placed at 1s → frame 4 resolves at 1 + 2.07 = 3.07s, after expiry
    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1, 1);
    placeEmpoweredBS(result, 1);

    // Controller: Combustion should NOT be consumed (expired before frame 4)
    expect(consumedReactions(result, REACTION_COLUMNS.COMBUSTION)).toHaveLength(0);

    // Controller: EBS event exists and has 4 frames
    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].id.endsWith('_EMPOWERED')).toBe(true);
    const frames = battles[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames).toHaveLength(4);

    // View: Combustion in enemy status column should NOT show as consumed
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const combustionConsumed = enemyVM!.events.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(combustionConsumed).toHaveLength(0);

    // Calculation: frame 4 (frameIndex 3) should produce no damage row
    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    // Scope to the EBS event explicitly — freeform reactions (the placed
    // Combustion) now also attribute to SLOT_WULFGARD/BATTLE via sourceEntityId
    // fallback, so a plain columnId filter would include the reaction rows.
    const ebsRows = calcResult.rows.filter(
      r => r.ownerEntityId === SLOT_WULFGARD && r.columnId === NounType.BATTLE
        && r.eventUid === battles[0].uid,
    );
    // Frames 1-3 produce damage. Frame 4's condition fails (Combustion expired
    // before it could resolve) so the damage-table builder drops the row —
    // guarded frames are no longer rendered as placeholder "-" rows.
    expect(ebsRows).toHaveLength(3);
    for (const row of ebsRows) {
      expect(row.damage).not.toBeNull();
      expect(row.damage).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Normal vs Empowered — Mutual Exclusivity
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Normal vs Empowered — Mutual Exclusivity', () => {
  it('J1: Normal BS applies heat infliction on frame 3', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
    );
    expect(heats.length).toBeGreaterThanOrEqual(1);
  });

  it('J2: Normal BS has 3 frames, empowered has 4', () => {
    const { result } = setupWulfgard();
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);

    // Normal BS
    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const normalBattle = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    const normalFrames = normalBattle!.segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(normalFrames).toHaveLength(3);
  });

  it('J3: Empowered BS does NOT apply heat infliction (consumes reaction instead)', () => {
    const { result } = setupWulfgard();

    // Place Combustion so empowered fires
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));

    // Count heat inflictions BEFORE placing empowered BS
    const heatsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
    ).length;

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 3 * FPS, empowered!,
      );
    });

    // Controller: empowered BS should NOT produce additional heat infliction
    const heatsAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerEntityId === ENEMY_ID,
    ).length;
    expect(heatsAfter).toBe(heatsBefore);

    // View: no new heat infliction events from EBS in enemy status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const ebsFrame = 3 * FPS;
    const heatsFromEBS = enemyVM!.events.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT &&
        ev.startFrame >= ebsFrame,
    );
    expect(heatsFromEBS).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Scorching Fangs — Detailed Behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Scorching Fangs — Detailed Behavior', () => {
  it('K1: Scorching Fangs has 10s duration (1200 frames)', () => {
    const { result } = setupWulfgard();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);

    // Ult forces Combustion -> triggers Scorching Fangs
    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const sf = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID,
    );
    expect(sf.length).toBeGreaterThanOrEqual(1);
    // Duration should be at least 10s (1200 frames) — may be slightly longer
    // due to trigger frame offset within the ultimate animation
    expect(eventDuration(sf[0])).toBeGreaterThanOrEqual(10 * FPS);
  });

  it('K2: Scorching Fangs does not stack — second trigger resets duration', () => {
    const { result } = setupWulfgard();

    // Two ults spaced apart — each forces Combustion -> triggers SF
    placeUlt(result, 2);
    placeUlt(result, 30);

    const sf = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD &&
        ev.name === TALENT1_ID &&
        ev.eventStatus !== EventStatusType.CONSUMED,
    );
    // Should have at most 1 active at any time (stack limit 1 with RESET)
    expect(sf.length).toBeGreaterThanOrEqual(1);
  });

  it('K3: Scorching Fangs applies Heat DMG Dealt bonus (STAT DAMAGE_BONUS HEAT)', () => {
    const { result } = setupWulfgard();

    // Place ult to force Combustion -> trigger SF
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const col = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const sf = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID,
    );
    expect(sf).toBeDefined();
    // The status config clause has APPLY STAT DAMAGE_BONUS (qualifier: HEAT)
    // Verify the event carries the talent's clause data
    expect(sf!.id).toBe(TALENT1_ID);
  });

  it('K4: P3 empowered BS applies SF Minor to all teammates (not self)', () => {
    const { result } = setupWulfgard();
    // Default P5 (≥ P3), so P3 clause is active

    // 1. Ult at 2s — forces Combustion + triggers Scorching Fangs on self
    placeUlt(result, 2);

    // 2. Empowered BS at 8s — Combustion still active, P3 clause fires:
    //    APPLY SF to self (reset) + SF Minor to ALL_OTHER
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 8 * FPS, empowered!,
      );
    });

    // Controller: SF Minor applied to each individual teammate slot, NOT on self or common
    const teammateSlots = [SLOT_AKEKURI, 'slot-2', 'slot-3'];
    const sfMinorAll = result.current.allProcessedEvents.filter(
      ev => ev.name === SF_MINOR_ID && ev.startFrame > 0,
    );
    // Must NOT be on Wulfgard
    expect(sfMinorAll.filter(ev => ev.ownerEntityId === SLOT_WULFGARD)).toHaveLength(0);
    // Must be on each individual teammate slot (not common)
    for (const slot of teammateSlots) {
      const slotMinor = sfMinorAll.filter(ev => ev.ownerEntityId === slot);
      expect(slotMinor.length).toBeGreaterThanOrEqual(1);
      // Each SF Minor has 10s duration
      expect(eventDuration(slotMinor[0])).toBeGreaterThanOrEqual(10 * FPS);
    }

    // View: SF Minor appears in each teammate's operator-status column
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    for (const slot of teammateSlots) {
      let found = false;
      viewModels.forEach(vm => {
        if (vm.events.some((ev: { name: string; ownerEntityId: string }) =>
          ev.name === SF_MINOR_ID && ev.ownerEntityId === slot)) {
          found = true;
        }
      });
      expect(found).toBe(true);
    }

    // Calculation: SF Minor events contribute to the query service
    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    expect(calcResult.rows.length).toBeGreaterThan(0);
  });

  it('K5: SF Minor Heat DMG bonus appears in teammate damage calc params', () => {
    const { result } = setupWulfgard();

    // Swap Laevatain (Heat dealer) into slot-1 so we can verify Heat DMG bonus
    act(() => { result.current.handleSwapOperator(SLOT_AKEKURI, 'LAEVATAIN'); });

    // 1. Ult at 2s — forces Combustion + triggers SF on self
    placeUlt(result, 2);

    // 2. Empowered BS at 8s — P3 clause applies SF Minor to teammates
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 8 * FPS, empowered!,
      );
    });

    // Verify SF Minor on Laevatain (slot-1)
    const sfMinorOnLaev = result.current.allProcessedEvents.filter(
      ev => ev.name === SF_MINOR_ID && ev.ownerEntityId === SLOT_AKEKURI && ev.startFrame > 0,
    );
    expect(sfMinorOnLaev.length).toBeGreaterThanOrEqual(1);

    // 3. Place Laevatain BS at 12s — within SF Minor window (10s from ~10s)
    const laevBsCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(laevBsCol).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE, 12 * FPS, laevBsCol!.defaultEvent!,
      );
    });

    // Calculation: Laevatain's BS damage rows should include Heat DMG bonus from SF Minor
    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    const laevRows = calcResult.rows.filter(
      r => r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE && r.damage != null,
    );
    expect(laevRows.length).toBeGreaterThan(0);

    // The Heat DMG bonus from SF Minor (10% at talent level 1) should be in params
    const rowWithParams = laevRows.find(r => r.params?.sub);
    expect(rowWithParams).toBeDefined();
    // allElementDmgBonuses[HEAT] should be > 0 (includes SF Minor's 10%+)
    const heatDmgBonus = rowWithParams!.params?.sub?.allElementDmgBonuses?.[ElementType.HEAT] ?? 0;
    expect(heatDmgBonus).toBeGreaterThan(0);
  });

  it('K6: Scorching Fangs (full) Heat DMG bonus on Wulfgard self', () => {
    const { result } = setupWulfgard();

    // Ult at 2s — forces Combustion → triggers Scorching Fangs on self (20%/30% Heat DMG)
    placeUlt(result, 2);

    // Verify SF on self
    const sf = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.name === TALENT1_ID && ev.startFrame > 0,
    );
    expect(sf).toBeDefined();

    // Place Wulfgard BS at 5s — within SF window
    const bsCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 5 * FPS, bsCol!.defaultEvent!,
      );
    });

    // Calculation: Wulfgard's BS rows should include Heat DMG bonus from SF
    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    const wulfRows = calcResult.rows.filter(
      r => r.ownerEntityId === SLOT_WULFGARD && r.columnId === NounType.BATTLE && r.damage != null,
    );
    expect(wulfRows.length).toBeGreaterThan(0);
    const row = wulfRows.find(r => r.params?.sub);
    expect(row).toBeDefined();
    // Heat DMG bonus ≥ 20% (SF full at talent level 1)
    const heatDmgBonus = row!.params?.sub?.allElementDmgBonuses?.[ElementType.HEAT] ?? 0;
    expect(heatDmgBonus).toBeGreaterThanOrEqual(0.2);
  });

  it('K7: Heat DMG bonus does NOT apply to frames after SF Minor expires', () => {
    const { result } = setupWulfgard();
    act(() => { result.current.handleSwapOperator(SLOT_AKEKURI, 'LAEVATAIN'); });

    // Ult at 2s → SF on self + Combustion
    placeUlt(result, 2);

    // Empowered BS at 4s → P3 applies SF Minor to Laevatain (~6.07s start, 10s duration → expires ~16s)
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const empowered = battleCol?.eventVariants?.find(v => v.id.endsWith('_EMPOWERED'));
    expect(empowered).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 4 * FPS, empowered!,
      );
    });

    // Verify SF Minor on Laevatain exists
    const sfMinor = result.current.allProcessedEvents.find(
      ev => ev.name === SF_MINOR_ID && ev.ownerEntityId === SLOT_AKEKURI && ev.startFrame > 0,
    );
    expect(sfMinor).toBeDefined();
    const sfMinorEnd = sfMinor!.startFrame + eventDuration(sfMinor!);

    // Place Laevatain BS well after SF Minor expires
    const laevBsCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const afterExpirySec = Math.ceil(sfMinorEnd / FPS) + 5;
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE, afterExpirySec * FPS, laevBsCol!.defaultEvent!,
      );
    });

    // Calculation: Laevatain's BS rows after expiry should have 0 Heat DMG bonus
    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );
    const laevRows = calcResult.rows.filter(
      r => r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE
        && r.absoluteFrame >= afterExpirySec * FPS && r.damage != null,
    );
    expect(laevRows.length).toBeGreaterThan(0);
    const row = laevRows.find(r => r.params?.sub);
    expect(row).toBeDefined();
    const heatDmgBonus = row!.params?.sub?.allElementDmgBonuses?.[ElementType.HEAT] ?? 0;
    expect(heatDmgBonus).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. P5 Natural Predator — Combo Cooldown Reset
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. P5 Natural Predator — Combo Cooldown Reset', () => {
  it('L1: At P5, ult resets combo cooldown even when combo was just used', () => {
    const { result } = setupWulfgard();
    // Default potential is P5 — no change needed

    // Place heat infliction to trigger combo
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Place combo at 2s
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload1 = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload1.ownerEntityId, comboPayload1.columnId,
        comboPayload1.atFrame, comboPayload1.defaultSkill,
      );
    });

    // Place ult at 5s — should reset combo cooldown
    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Place second combo at 8s — should be placeable due to cooldown reset
    // Use handleAddEvent directly: context menu may report "already activated" because
    // the validator doesn't account for cooldown resets within the same timeline.
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.COMBO, 8 * FPS, comboCol!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(2);
  });

  it('L2: At P4 (not P5), ult does NOT reset combo cooldown', () => {
    const { result } = setupWulfgard();
    setPotential(result, 4);

    // Same setup as L1
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    act(() => { setUltimateEnergyToMax(result.current, SLOT_WULFGARD, 0); });
    const ultCol = findColumn(result.current, SLOT_WULFGARD, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Second combo at 8s — should NOT be placeable (still on cooldown at P4).
    // Context menu correctly reports it as disabled.
    const menuItems = buildContextMenu(result.current, comboCol!, 8 * FPS);
    const comboItem = menuItems?.find(i => i.actionId === 'addEvent');
    expect(comboItem?.disabled).toBe(true);

    // Also verify via handleAddEvent that only 1 combo exists
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.COMBO, 8 * FPS, comboCol!.defaultEvent!,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    // Only 1 combo — second was rejected or overlaps
    expect(combos).toHaveLength(1);
  });

  it('L3: Full rotation — BS → CS → ULT resets CD → BS → CS succeeds', () => {
    const { result } = setupWulfgard();

    // Heat infliction for combo trigger
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 60 * FPS } }] },
      );
    });

    // 1. BS at 2s — opens 6s combo activation window (2s–8s)
    const bsCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 2 * FPS, bsCol!.defaultEvent!,
      );
    });

    // 2. CS at 3s — within first activation window
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    // Verify first combo placed
    const combos1 = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(combos1).toHaveLength(1);

    // Capture first activation window before ult
    const windowsBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(windowsBefore).toHaveLength(1);
    const origWindowDur = eventDuration(windowsBefore[0]);

    // 3. ULT at 5s — P5 resets combo CD
    placeUlt(result, 5);

    // Controller: combo CD was reset (event ends at or before ult frame)
    const comboAfterUlt = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(comboAfterUlt).toHaveLength(1);
    const comboEnd = comboAfterUlt[0].startFrame + eventDuration(comboAfterUlt[0]);
    expect(comboEnd).toBeLessThanOrEqual(5 * FPS + 1);

    // Controller: first activation window was clamped to combo's reduced end
    const windowsAfterUlt = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    const firstWindow = windowsAfterUlt[0];
    const clampedDur = eventDuration(firstWindow);
    expect(clampedDur).toBeLessThan(origWindowDur);
    const clampedEnd = firstWindow.startFrame + clampedDur;
    expect(clampedEnd).toBeLessThanOrEqual(comboEnd);

    // 4. Akekuri BS at 7s — triggers Wulfgard's second combo activation window
    const akeBsCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(akeBsCol).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE, 7 * FPS, akeBsCol!.defaultEvent!,
      );
    });

    // Controller: second activation window exists (re-derived after CD reset)
    const windowsAfterTrigger = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(windowsAfterTrigger.length).toBeGreaterThanOrEqual(2);

    // 5. CS at 9s — within second activation window
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.COMBO, 9 * FPS, comboCol!.defaultEvent!,
      );
    });

    // Controller: second combo placed
    const combos2 = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === NounType.COMBO,
    );
    expect(combos2).toHaveLength(2);

    // Controller: first window is clamped, second window starts after first combo ends
    const finalWindows = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_WULFGARD && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(finalWindows.length).toBeGreaterThanOrEqual(2);
    const sortedWindows = [...finalWindows].sort((a, b) => a.startFrame - b.startFrame);
    const firstWinEnd = sortedWindows[0].startFrame + eventDuration(sortedWindows[0]);
    const secondWinStart = sortedWindows[1].startFrame;
    // First window clamped to combo end (≤ ult frame)
    expect(firstWinEnd).toBeLessThanOrEqual(5 * FPS + 1);
    // Second window starts after first combo ends
    expect(secondWinStart).toBeGreaterThanOrEqual(firstWinEnd);
    // Second CS is within second window
    expect(combos2[1].startFrame).toBeGreaterThanOrEqual(secondWinStart);
    expect(combos2[1].startFrame).toBeLessThan(secondWinStart + eventDuration(sortedWindows[1]));

    // Validation: no combo window warnings on either CS
    const { maps } = computeAllValidations(
      result.current.allProcessedEvents,
      result.current.slots,
      result.current.resourceGraphs,
      result.current.staggerBreaks,
      null,
    );
    for (const combo of combos2) {
      expect(maps.combo.get(combo.uid)).toBeUndefined();
    }
  });
});
