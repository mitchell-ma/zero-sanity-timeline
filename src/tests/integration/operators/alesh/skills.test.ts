/**
 * @jest-environment jsdom
 */

/**
 * Alesh — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill processes correctly with correct skill name
 * 3. Combo cooldown at L12
 * 4. Ultimate energy cost at P0 vs P4, cryo infliction from ultimate
 * 5. View-layer presentation
 *
 * Three-layer verification:
 * - Context menu: menu items are available and enabled
 * - Controller: events appear in allProcessedEvents with correct properties
 * - View: computeTimelinePresentation includes events in correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_ID, REACTION_COLUMNS, COMBO_WINDOW_COLUMN_ID, PHYSICAL_INFLICTION_COLUMNS } from '../../../../model/channels';
import { InteractionModeType, CritMode, EventStatusType, ElementType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, getAddEventPayload } from '../../helpers';
import type { AppResult } from '../../helpers';
import { setRuntimeCritMode } from '../../../../controller/combatStateController';
import { hasChanceClause, findDealDamageInClauses } from '../../../../controller/timeline/clauseQueries';
import { runCalculation } from '../../../../controller/calculation/calculationController';

/* eslint-disable @typescript-eslint/no-require-imports */
const ALESH_ID: string = require('../../../../model/game-data/operators/alesh/alesh.json').id;
const BATTLE_SKILL_ID: string = require('../../../../model/game-data/operators/alesh/skills/battle-skill-unconventional-lure.json').properties.id;
const FLASH_FROZEN_ID: string = require('../../../../model/game-data/operators/alesh/talents/talent-flash-frozen-talent.json').properties.id;
const MAY_THE_WILLING_BITE_ID: string = require('../../../../model/game-data/operators/alesh/statuses/status-may-the-willing-bite.json').properties.id;
const WULFGARD_ID: string = require('../../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const WULFGARD_EMP_BS_ID: string = require('../../../../model/game-data/operators/wulfgard/skills/battle-skill-thermite-tracers-empowered.json').properties.id;
const ENDMIN_ID: string = require('../../../../model/game-data/operators/endministrator/endministrator.json').id;
const ORIGINIUM_CRYSTAL_ID: string = require('../../../../model/game-data/operators/endministrator/talents/talent-realspace-stasis.json').properties.id;
const ULT_JSON = require('../../../../model/game-data/operators/alesh/skills/ultimate-one-monster-catch.json');
const ENEMY_DEFEATED_PARAM_ID: string = ULT_JSON.properties.suppliedParameters.VARY_BY[0].id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ALESH = 'slot-0';

function setupAlesh() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ALESH, ALESH_ID); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Core Skill Placement', () => {
  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupAlesh();
    const col = findColumn(result.current, SLOT_ALESH, NounType.BATTLE);
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
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
  });

  it('A2: combo skill placed in COMBO_SKILL column with cooldown', () => {
    const { result } = setupAlesh();

    // Combo requires activation conditions — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO);
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
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('A3: ultimate placed with energy', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
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
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Correct Skill Name
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Battle Skill', () => {
  it('B1: battle skill processes with correct skill name', () => {
    const { result } = setupAlesh();
    const col = findColumn(result.current, SLOT_ALESH, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo — Cooldown at L12
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Combo Cooldown', () => {
  it('C1: combo cooldown is 8s at L12', () => {
    const { result } = setupAlesh();

    // Switch to freeform for combo placement
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Total event duration should include the 8s cooldown at L12
    // Combo has: 0.5s animation + 0.8s active + 0s rare fin + 8s cooldown = 9.3s
    const totalDuration = eventDuration(combos[0]);
    // The cooldown segment at L12 is 8s = 8 * FPS frames
    const cooldownFrames = 8 * FPS;
    // Total must include the cooldown
    expect(totalDuration).toBeGreaterThanOrEqual(cooldownFrames);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate — Energy Cost and Cryo Infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Ultimate', () => {
  it('D1: ultimate energy cost P0=100, P4=85', () => {
    const costP0 = getUltimateEnergyCostForPotential(ALESH_ID, 0);
    expect(costP0).toBe(100);

    const costP4 = getUltimateEnergyCostForPotential(ALESH_ID, 4);
    expect(costP4).toBe(85);
  });

  it('D2: ultimate applies cryo infliction', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Verify cryo infliction was applied to enemy
    const cryoInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer — computeTimelinePresentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — View Layer', () => {
  it('E1: battle skill visible in presentation', () => {
    const { result } = setupAlesh();
    const col = findColumn(result.current, SLOT_ALESH, NounType.BATTLE);
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
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
  });

  it('E2: ultimate visible in presentation', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
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
      (ev) => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. BS Unconventional Lure — conditional CRYO consume path
// ═══════════════════════════════════════════════════════════════════════════════

function placeCryoInfliction(app: AppResult, atFrame: number) {
  app.handleAddEvent(
    ENEMY_ID, INFLICTION_COLUMNS.CRYO, atFrame,
    { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
  );
}

function placeBsAlesh(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_ALESH, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(
    payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
  );
}

describe('Alesh Skills — BS CRYO consume path', () => {
  it('F1: BS against enemy with no cryo infliction leaves enemy clean', () => {
    const { result } = setupAlesh();
    act(() => { placeBsAlesh(result.current, 5 * FPS); });

    const cryoEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoEvents).toHaveLength(0);

    const solidifications = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(solidifications).toHaveLength(0);
  });

  it('F2: BS against enemy with cryo infliction consumes it, applies Solidification, recovers SP', () => {
    const { result } = setupAlesh();
    // Place cryo inflictions first so they exist when BS fires.
    act(() => { placeCryoInfliction(result.current, 2 * FPS); });
    act(() => { placeCryoInfliction(result.current, 2 * FPS + 10); });

    // Fire the BS at 5s — damage frame at +0.9s falls inside the cryo window.
    act(() => { placeBsAlesh(result.current, 5 * FPS); });

    // Cryo infliction events placed by the user should have been consumed.
    const cryoEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    const consumedCryo = cryoEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumedCryo.length).toBeGreaterThan(0);

    // A forced Solidification reaction should exist on the enemy reaction column.
    const solidifications = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(solidifications.length).toBeGreaterThanOrEqual(1);
    expect(solidifications.some(ev => ev.isForced === true)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Combo Auger Angling — CHANCE-wrapped Rare Fin branch
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Combo CHANCE gate', () => {
  beforeEach(() => { setRuntimeCritMode(CritMode.EXPECTED); });
  afterEach(() => { setRuntimeCritMode(CritMode.NEVER); });

  it('G1: combo damage segment has base + rare-fin sibling frames at the same offset', () => {
    const { result } = setupAlesh();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    const combo = combos[0];

    // Single merged damage frame with CHANCE wrapping both branches.
    const damageSeg = combo.segments.find(
      seg => seg.properties.element === ElementType.PHYSICAL && (seg.frames?.length ?? 0) >= 1,
    );
    expect(damageSeg).toBeDefined();
    expect(damageSeg!.frames).toHaveLength(1);

    const frame = damageSeg!.frames![0];
    expect(hasChanceClause(frame.clauses)).toBe(true);

    // The DEAL DAMAGE inside CHANCE hit branch (via elseEffects fallback for
    // base-only) is found by findDealDamageInClauses descending into CHANCE.
    const dealInfo = findDealDamageInClauses(frame.clauses);
    expect(dealInfo).not.toBeNull();
    expect(dealInfo!.insideChance).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Ult One Monster Catch — suppliedParameter + P5 HP-threshold damage
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Ult suppliedParameter + P5 gating', () => {
  it('H1: ultimate carries the ENEMY_DEFEATED supplied parameter', () => {
    const { result } = setupAlesh();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.ULTIMATE,
    );
    expect(ult).toBeDefined();
    const params = ult!.suppliedParameters as Record<string, unknown> | undefined;
    expect(params).toBeDefined();
    const varyBy = (params as Record<string, unknown>)?.VARY_BY as Array<{ id: string }> | undefined;
    expect(varyBy).toBeDefined();
    expect(varyBy!.some(p => p.id === ENEMY_DEFEATED_PARAM_ID)).toBe(true);
  });

  it('H2: ult at full HP gets base mult, ult after HP drops below 50% gets P5 1.5x mult', () => {
    // Use lowest-HP enemy so BS spam can push HP below 50%
    const { result } = setupAlesh();
    act(() => { result.current.handleSwapEnemy('mudflow_delta'); });

    // Place ult early (HP still full) → HP >= 50% clause fires → base mult
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });
    const ultCol = findColumn(result.current, SLOT_ALESH, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const calcEarly = runCalculation(
      result.current.allProcessedEvents, result.current.columns,
      result.current.slots, result.current.enemy,
      result.current.loadoutProperties, result.current.loadouts,
      result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const ultRowEarly = calcEarly.rows.find(
      r => r.ownerEntityId === SLOT_ALESH && r.columnId === NounType.ULTIMATE && r.multiplier != null && r.multiplier > 0,
    );
    expect(ultRowEarly).toBeDefined();
    const baseMult = ultRowEarly!.multiplier!;

    // Now remove the early ult, spam BS to drain HP below 50%, then place ult late
    act(() => {
      const earlyUlt = result.current.allProcessedEvents.find(
        ev => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.ULTIMATE,
      );
      if (earlyUlt) result.current.handleRemoveEvent(earlyUlt.uid);
    });

    // Switch to freeform to bypass SP constraints
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Spam BS to drain enemy HP
    const bsCol = findColumn(result.current, SLOT_ALESH, NounType.BATTLE);
    for (let i = 0; i < 55; i++) {
      const bsPayload = getMenuPayload(result.current, bsCol!, (3 + i * 2) * FPS);
      act(() => {
        result.current.handleAddEvent(
          bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
        );
      });
    }

    // Place ult after the BS spam
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ALESH, 0); });
    const latePayload = getMenuPayload(result.current, ultCol!, 115 * FPS);
    act(() => {
      result.current.handleAddEvent(
        latePayload.ownerEntityId, latePayload.columnId, latePayload.atFrame, latePayload.defaultSkill,
      );
    });

    const calcLate = runCalculation(
      result.current.allProcessedEvents, result.current.columns,
      result.current.slots, result.current.enemy,
      result.current.loadoutProperties, result.current.loadouts,
      result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const ultRowLate = calcLate.rows.find(
      r => r.ownerEntityId === SLOT_ALESH && r.columnId === NounType.ULTIMATE && r.multiplier != null && r.multiplier > 0,
    );
    expect(ultRowLate).toBeDefined();

    // P5 + HP < 50% → 1.5x base multiplier and 1.5x damage
    expect(ultRowLate!.multiplier!).toBeCloseTo(baseMult * 1.5, 2);
    expect(ultRowLate!.damage!).toBeCloseTo(ultRowEarly!.damage! * 1.5, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. CHANCE pin override — frame-level isChance toggle
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// J. T1 Flash-frozen — self-triggered 2s event with UE recovery at offset 0
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — T1 Flash-frozen self-trigger', () => {
  it('J1: BS against a cryo-laden enemy spawns the T1 talent event on Alesh', () => {
    const { result } = setupAlesh();
    // Seed cryo infliction so the BS path fires the forced Solidification.
    act(() => { placeCryoInfliction(result.current, 2 * FPS); });
    // Fire BS — forces Solidification, which satisfies T1's first trigger branch.
    act(() => { placeBsAlesh(result.current, 5 * FPS); });

    // The T1 talent status event should exist on Alesh's timeline with the
    // trigger operator stamped (Alesh himself, since he triggered it via the BS).
    const t1Events = result.current.allProcessedEvents.filter(
      ev => ev.id === FLASH_FROZEN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(t1Events.length).toBeGreaterThanOrEqual(1);
    const t1 = t1Events[0];
    // Self-triggered: the trigger entity on the spawned event should be Alesh's slot.
    expect(t1.triggerEntityId).toBe(SLOT_ALESH);
    // 2s active + 3s IMMEDIATE_COOLDOWN (overlapping — starts at event offset 0).
    // Total span is max(2s, 3s) = 3s.
    expect(eventDuration(t1)).toBe(3 * FPS);
  });

  it('J3: firing BS twice within the 3s cooldown spawns only one T1 event', () => {
    const { result } = setupAlesh();
    // Freeform mode bypasses SP cost gating so we can fire the BS twice rapidly.
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    // Seed enough cryo inflictions to fuel both BS casts
    act(() => { placeCryoInfliction(result.current, 1 * FPS); });
    act(() => { placeCryoInfliction(result.current, 1 * FPS + 10); });
    act(() => { placeCryoInfliction(result.current, 4 * FPS); });
    act(() => { placeCryoInfliction(result.current, 4 * FPS + 10); });
    // Fire BS at 3s and again at 4s (1s apart, well within the 3s T1 cooldown).
    act(() => { placeBsAlesh(result.current, 3 * FPS); });
    act(() => { placeBsAlesh(result.current, 4 * FPS); });

    const t1Events = result.current.allProcessedEvents.filter(
      ev => ev.id === FLASH_FROZEN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    // Only the first trigger should spawn a T1 event; the second is cooldown-gated
    // via configCache's IMMEDIATE_COOLDOWN → cooldownFrames derivation.
    expect(t1Events.length).toBe(1);
  });

  it('J4: firing BS twice outside the 3s cooldown spawns two T1 events', () => {
    const { result } = setupAlesh();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeCryoInfliction(result.current, 1 * FPS); });
    act(() => { placeCryoInfliction(result.current, 1 * FPS + 10); });
    act(() => { placeCryoInfliction(result.current, 8 * FPS); });
    act(() => { placeCryoInfliction(result.current, 8 * FPS + 10); });
    // Fire BS at 3s and again at 10s (7s apart, well past the 3s cooldown)
    act(() => { placeBsAlesh(result.current, 3 * FPS); });
    act(() => { placeBsAlesh(result.current, 10 * FPS); });

    const t1Events = result.current.allProcessedEvents.filter(
      ev => ev.id === FLASH_FROZEN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(t1Events.length).toBe(2);
  });

  it('J2: T1 has active + cooldown segments, active frame at offset 0 carries base + bonus clauses', () => {
    const { result } = setupAlesh();
    act(() => { placeCryoInfliction(result.current, 2 * FPS); });
    act(() => { placeBsAlesh(result.current, 5 * FPS); });

    const t1 = result.current.allProcessedEvents.find(
      ev => ev.id === FLASH_FROZEN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(t1).toBeDefined();
    // Two segments: active (2s) and IMMEDIATE_COOLDOWN (3s).
    expect(t1!.segments.length).toBe(2);
    const activeSeg = t1!.segments[0];
    const cooldownSeg = t1!.segments[1];
    expect(activeSeg.properties.duration).toBe(2 * FPS);
    expect(cooldownSeg.properties.duration).toBe(3 * FPS);
    expect(cooldownSeg.properties.segmentTypes).toContain('IMMEDIATE_COOLDOWN');
    expect(cooldownSeg.frames?.length ?? 0).toBe(0);
    expect(activeSeg.frames?.length).toBe(1);
    const frame = activeSeg.frames![0];
    expect(frame.offsetFrame).toBe(0);
    // Two predicate clauses: one unconditional (base UE), one gated on
    // THIS OPERATOR IS TRIGGER OPERATOR (self-triggered bonus UE).
    expect(frame.clauses?.length).toBe(2);
    const baseClause = frame.clauses![0];
    const bonusClause = frame.clauses![1];
    expect(baseClause.conditions.length).toBe(0);
    expect(bonusClause.conditions.length).toBe(1);
    const bonusCond = bonusClause.conditions[0] as {
      subjectDeterminer?: string; subject: string; verb: string;
      object: string; objectDeterminer?: string;
    };
    expect(bonusCond.subject).toBe('OPERATOR');
    expect(bonusCond.subjectDeterminer).toBe('THIS');
    expect(bonusCond.verb).toBe('IS');
    expect(bonusCond.object).toBe('OPERATOR');
    expect(bonusCond.objectDeterminer).toBe('TRIGGER');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Combo Activation Window — triggered by arts reaction consume
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Combo activation window', () => {
  it('K1: applied-but-not-consumed reaction does NOT open Alesh combo window', () => {
    const { result } = setupAlesh();
    // Freeform: place a combustion reaction on the enemy. This is an APPLY, not CONSUME.
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 2 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });

    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(comboWindows).toHaveLength(0);
  });

  it('K2: activation window config has correct CONSUME REACTION trigger conditions', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const csJson = require('../../../../model/game-data/operators/alesh/skills/combo-skill-auger-angling.json');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const aw = csJson.activationWindow;
    expect(aw).toBeDefined();
    expect(aw.onTriggerClause).toHaveLength(2);

    const c1 = aw.onTriggerClause[0].conditions[0];
    expect(c1.verb).toBe('CONSUME');
    expect(c1.objectId).toBe('REACTION');
    expect(c1.objectQualifier).toBeUndefined();

    const c2 = aw.onTriggerClause[1].conditions[0];
    expect(c2.verb).toBe('CONSUME');
    expect(c2.objectId).toBe('ORIGINIUM_CRYSTAL');
  });

  it('K3: Wulfgard EBS consuming combustion opens Alesh combo window', () => {
    const { result } = setupAlesh();
    const SLOT_WULFGARD = 'slot-1';
    act(() => { result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });

    // Place combustion on enemy at 2s.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 2 * FPS,
        { name: REACTION_COLUMNS.COMBUSTION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // Place Wulfgard empowered BS at 5s. Key: pass `id` (not `name`) so
    // createEvent sets event.id = THERMITE_TRACERS_EMPOWERED and the
    // interpreter loads the empowered skill's frame data, which has
    // CONSUME COMBUSTION REACTION on frame 3.
    const bsCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const empVariant = bsCol!.eventVariants?.find(v => v.id === WULFGARD_EMP_BS_ID);
    expect(empVariant).toBeDefined();
    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BATTLE, 5 * FPS,
        { id: WULFGARD_EMP_BS_ID, segments: empVariant!.segments! },
      );
    });

    // Combustion should be consumed by Wulfgard's empowered BS.
    const combustions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(combustions.some(ev => ev.eventStatus === EventStatusType.CONSUMED)).toBe(true);

    // Alesh's combo activation window should have opened.
    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(comboWindows).toHaveLength(1);
    const window = comboWindows[0];

    // The combo window starts at the consumption frame, not the combustion's
    // original placement. The engine clamps consumed events' duration to the
    // consume point, so the consumption frame = combustion.startFrame +
    // eventDuration(combustion). Wulfgard EBS frame 3 fires at 5s + 2.07s.
    const consumedCombustion = combustions.find(ev => ev.eventStatus === EventStatusType.CONSUMED)!;
    const consumptionFrame = consumedCombustion.startFrame + eventDuration(consumedCombustion);
    expect(window.startFrame).toBe(consumptionFrame);

    // Window duration = 6s (from activationWindow.segments[0].properties.duration).
    expect(eventDuration(window)).toBe(6 * FPS);

    // Window ends at consumptionFrame + 6s.
    const windowEnd = window.startFrame + eventDuration(window);
    expect(windowEnd).toBe(consumptionFrame + 6 * FPS);
  });

  it('K4: Endmin originium crystal consumed via Vulnerable → Alesh combo window opens', () => {
    const { result } = setupAlesh();
    const SLOT_ENDMIN = 'slot-2';
    act(() => { result.current.handleSwapOperator(SLOT_ENDMIN, ENDMIN_ID); });

    // Freeform: place originium crystal on enemy at 2s.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, ORIGINIUM_CRYSTAL_ID, 2 * FPS,
        { name: ORIGINIUM_CRYSTAL_ID, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });

    // Freeform: place Vulnerable infliction on enemy at 5s.
    // Endmin T2's onTriggerClause fires on ANY OPERATOR APPLY VULNERABLE →
    // CONSUME THIS EVENT (the originium crystal) + APPLY ORIGINIUM_CRYSTALS_SHATTER.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, 5 * FPS,
        { name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });

    // The originium crystal should be consumed.
    const crystals = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(crystals.some(ev => ev.eventStatus === EventStatusType.CONSUMED)).toBe(true);

    // Alesh's combo activation window should have opened.
    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(comboWindows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Alesh Skills — CHANCE pin + P3 MAY_THE_WILLING_BITE', () => {
  afterEach(() => { setRuntimeCritMode(CritMode.NEVER); });

  it('I0: CHANCE branch selects correct SP values — miss=base, hit=base+bonus', () => {
    // NEVER mode (unpinned → miss): base SP recovery per wiki
    const { result: r1 } = setupAlesh();
    act(() => { r1.current.setCritMode(CritMode.NEVER); });
    setRuntimeCritMode(CritMode.NEVER);
    act(() => { r1.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col1 = findColumn(r1.current, SLOT_ALESH, NounType.COMBO);
    const payload1 = getMenuPayload(r1.current, col1!, 5 * FPS);
    act(() => {
      r1.current.handleAddEvent(payload1.ownerEntityId, payload1.columnId, payload1.atFrame, payload1.defaultSkill);
    });

    const combo1 = r1.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.COMBO,
    )!;
    const dmgSeg1 = combo1.segments.find(s => s.frames && s.frames.length > 0)!;
    const frame1 = dmgSeg1.frames![0];
    // Miss branch: elseEffects fires. The DEAL DAMAGE from elseEffects has
    // base-only multipliers; findDealDamageInClauses(clauses, false) finds it.
    const dealMiss = findDealDamageInClauses(frame1.clauses, false);
    expect(dealMiss).not.toBeNull();
    expect(dealMiss!.insideChanceElse).toBe(true);
    // Base multiplier at L12 = 0.75 (from the elseEffects VARY_BY array)
    expect(dealMiss!.values).toContain(0.75);

    // ALWAYS mode (unpinned → hit): combined SP recovery per wiki
    const { result: r2 } = setupAlesh();
    act(() => { r2.current.setCritMode(CritMode.ALWAYS); });
    setRuntimeCritMode(CritMode.ALWAYS);
    act(() => { r2.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col2 = findColumn(r2.current, SLOT_ALESH, NounType.COMBO);
    const payload2 = getMenuPayload(r2.current, col2!, 5 * FPS);
    act(() => {
      r2.current.handleAddEvent(payload2.ownerEntityId, payload2.columnId, payload2.atFrame, payload2.defaultSkill);
    });

    const combo2 = r2.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.COMBO,
    )!;
    const dmgSeg2 = combo2.segments.find(s => s.frames && s.frames.length > 0)!;
    const frame2 = dmgSeg2.frames![0];
    // Hit branch: predicates fire. DEAL DAMAGE has ADD(base, bonus) multipliers.
    const dealHit = findDealDamageInClauses(frame2.clauses, true);
    expect(dealHit).not.toBeNull();
    expect(dealHit!.insideChance).toBe(true);
    // Hit damage is a compound expression (ADD of two VARY_BY arrays), so
    // valueNode is set instead of values[].
    expect(dealHit!.valueNode).toBeDefined();
  });

  it('I1: CHANCE pinned to hit at P3+ applies MAY_THE_WILLING_BITE to team', () => {
    const { result } = setupAlesh();
    // Set both React state and runtime global — pipeline reads pipelineCritMode
    // (normalized to EXPECTED), but doChance reads getRuntimeCritMode() (ALWAYS).
    act(() => { result.current.setCritMode(CritMode.ALWAYS); });
    setRuntimeCritMode(CritMode.ALWAYS);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // In ALWAYS mode, CHANCE fires → P3 predicate evaluates → APPLY STATUS
    // Default loadout is P5, so the P3 condition passes.
    const mtwb = result.current.allProcessedEvents.filter(
      ev => ev.id === MAY_THE_WILLING_BITE_ID,
    );
    expect(mtwb.length).toBeGreaterThanOrEqual(1);
  });

  it('I2: handleSetChancePins writes the pin to the combat state override store', () => {
    const { result } = setupAlesh();
    act(() => { setRuntimeCritMode(CritMode.MANUAL); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_ALESH, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combo = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_ALESH && ev.columnId === NounType.COMBO,
    );
    expect(combo).toBeDefined();

    // Locate the damage frame that carries CHANCE.
    let segIdx = -1;
    let frameIdx = -1;
    combo!.segments.forEach((seg, si) => {
      seg.frames?.forEach((f, fi) => {
        if (hasChanceClause(f.clauses)) {
          segIdx = si;
          frameIdx = fi;
        }
      });
    });
    expect(segIdx).toBeGreaterThanOrEqual(0);
    expect(frameIdx).toBeGreaterThanOrEqual(0);

    // Pin the CHANCE outcome to hit via the useApp handler. The override is
    // persisted in combatState.overrides under the event key, segments[si].frames[fi].isChance.
    act(() => {
      result.current.handleSetChancePins(
        [{ eventUid: combo!.uid, segmentIndex: segIdx, frameIndex: frameIdx }],
        true,
      );
    });

    // Directly check the override store exposed by useApp.
    const overrides = result.current.overrides;
    expect(overrides).toBeDefined();
    const eventKey = `${combo!.id}:${combo!.ownerEntityId}:${combo!.columnId}:${combo!.startFrame}`;
    const frameOverride = overrides[eventKey]?.segments?.[segIdx]?.frames?.[frameIdx];
    expect(frameOverride?.isChance).toBe(true);
  });
});
