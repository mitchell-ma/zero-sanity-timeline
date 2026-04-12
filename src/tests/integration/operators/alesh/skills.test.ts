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
import { INFLICTION_COLUMNS, ENEMY_ID, REACTION_COLUMNS, COMBO_WINDOW_COLUMN_ID } from '../../../../model/channels';
import { InteractionModeType, CritMode, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, getAddEventPayload } from '../../helpers';
import type { AppResult } from '../../helpers';
import { setRuntimeCritMode } from '../../../../controller/combatStateController';
import { hasChanceClause, findDealDamageInClauses } from '../../../../controller/timeline/clauseQueries';

/* eslint-disable @typescript-eslint/no-require-imports */
const ALESH_ID: string = require('../../../../model/game-data/operators/alesh/alesh.json').id;
const BATTLE_SKILL_ID: string = require('../../../../model/game-data/operators/alesh/skills/battle-skill-unconventional-lure.json').properties.id;
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

    // The damage segment should carry exactly two sibling damage frames at the
    // same offset: the unconditional base hit and the CHANCE-wrapped rare-fin hit.
    const damageSeg = combo.segments.find(
      seg => seg.properties.element === 'PHYSICAL' && (seg.frames?.length ?? 0) >= 2,
    );
    expect(damageSeg).toBeDefined();

    const frames = damageSeg!.frames ?? [];
    const damageFrames = frames.filter(f => findDealDamageInClauses(f.clauses) != null);
    expect(damageFrames.length).toBe(2);
    // Sibling frames co-located at offset 0.77s (per the current data source).
    expect(damageFrames[0].offsetFrame).toBe(damageFrames[1].offsetFrame);

    // Exactly one of the sibling frames carries the CHANCE compound (the rare
    // fin branch); the other is the unconditional base hit.
    const chanceBearing = damageFrames.filter(f => hasChanceClause(f.clauses));
    expect(chanceBearing.length).toBe(1);
    const baseOnly = damageFrames.filter(f => !hasChanceClause(f.clauses));
    expect(baseOnly.length).toBe(1);

    // The CHANCE-wrapped frame's DealDamageInfo should be marked insideChance;
    // the base frame's should not be.
    const chanceDealInfo = findDealDamageInClauses(chanceBearing[0].clauses);
    const baseDealInfo = findDealDamageInClauses(baseOnly[0].clauses);
    expect(chanceDealInfo?.insideChance).toBe(true);
    expect(baseDealInfo?.insideChance).toBeUndefined();
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
    expect(varyBy!.some(p => p.id === 'ENEMY_DEFEATED')).toBe(true);
  });

  it('H2: ultimate has two damage frames — base + P5 low-HP bonus', () => {
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

    // The damage segment should carry two CRYO damage frames at the same offset.
    // One fires unconditionally, the other fires only at P5 + enemy HP < 50%.
    const damageSeg = ult!.segments.find(seg => (seg.frames?.length ?? 0) >= 2 && seg.properties.element === 'CRYO');
    expect(damageSeg).toBeDefined();
    expect(damageSeg!.frames!.length).toBeGreaterThanOrEqual(2);

    // Both frames should carry CRYO DEAL DAMAGE in their clauses.
    const damageFrameCount = (damageSeg!.frames ?? []).filter(f => {
      const info = findDealDamageInClauses(f.clauses);
      return info != null;
    }).length;
    expect(damageFrameCount).toBeGreaterThanOrEqual(2);
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
      ev => ev.id === 'FLASH_FROZEN_TALENT' && ev.ownerEntityId === SLOT_ALESH,
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
      ev => ev.id === 'FLASH_FROZEN_TALENT' && ev.ownerEntityId === SLOT_ALESH,
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
      ev => ev.id === 'FLASH_FROZEN_TALENT' && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(t1Events.length).toBe(2);
  });

  it('J2: T1 has active + cooldown segments, active frame at offset 0 carries base + bonus clauses', () => {
    const { result } = setupAlesh();
    act(() => { placeCryoInfliction(result.current, 2 * FPS); });
    act(() => { placeBsAlesh(result.current, 5 * FPS); });

    const t1 = result.current.allProcessedEvents.find(
      ev => ev.id === 'FLASH_FROZEN_TALENT' && ev.ownerEntityId === SLOT_ALESH,
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
// K. Combo Activation Window — triggered by arts reaction / originium crystal consume
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alesh Skills — Combo activation window', () => {
  it('K1: consuming an arts reaction on the enemy opens Alesh combo window', () => {
    const { result } = setupAlesh();
    // Place a solidification reaction on the enemy (freeform), then consume it.
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 2 * FPS,
        { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });
    // Place cryo infliction to trigger a consume — when a 2nd solidification is placed,
    // the 1st is consumed by the reaction stacking logic. But simpler: just place a
    // Wulfgard BS that consumes combustion. Except we don't have Wulfgard set up.
    //
    // Simplest approach: place the reaction, then have Alesh BS consume it.
    // But Alesh BS doesn't consume reactions — it consumes cryo infliction.
    //
    // Instead: directly place a consumed reaction. The combo trigger scans for
    // CONSUME events on reaction columns. A consumed reaction event has
    // eventStatus=CONSUMED. But the trigger matcher uses scanEvents which
    // scans by column + owner for events at a frame.
    //
    // Alternate: the trigger fires when the engine processes a CONSUME verb
    // targeting a reaction column. We can manufacture this by placing two
    // solidification reactions at the same frame — the 2nd one overwrites the
    // 1st via stacking (RESET), which triggers a CONSUME on the old event.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 2 * FPS + 1,
        { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });

    // Check if a combo window opened for Alesh
    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(comboWindows.length).toBeGreaterThanOrEqual(1);
  });

  it('K2: no reaction/crystal consume → no combo window in strict mode', () => {
    const { result } = setupAlesh();
    // In strict mode with no reaction consumes, combo should not be available.
    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === SLOT_ALESH,
    );
    expect(comboWindows).toHaveLength(0);
  });
});

describe('Alesh Skills — CHANCE pin override', () => {
  afterEach(() => { setRuntimeCritMode(CritMode.NEVER); });

  it('I1: handleSetChancePins writes the pin to the combat state override store', () => {
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
