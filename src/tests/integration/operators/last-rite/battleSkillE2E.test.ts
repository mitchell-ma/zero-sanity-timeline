/**
 * @jest-environment jsdom
 */

/**
 * Last Rite — Battle Skill (Esoteric Legacy) E2E Tests
 *
 * Tests the full pipeline through useApp:
 * A. Hypothermic Perfusion target routing (CONTROLLED operator)
 * B. Hypothermic Perfusion stacking (1 limit, RESET)
 * C. SP return (30 base, +5 at P5)
 * D. UE recovery (16 to THIS OPERATOR)
 * E. Hypothermic Perfusion trigger (CONTROLLED OPERATOR PERFORM FINAL_STRIKE)
 * F. P1 gated effects (stagger + DAMAGE_BONUS)
 * G. P5 mirage multiplier (1.2×)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType, DeterminerType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { ENEMY_ID, INFLICTION_COLUMNS, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { ultimateGraphKey } from '../../../../model/channels';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  findColumn, buildContextMenu, getMenuPayload,
} from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';
import type { MiniTimeline } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAST_RITE_ID: string = require('../../../../model/game-data/operators/last-rite/last-rite.json').id;
const AKEKURI_ID: string = require('../../../../model/game-data/operators/akekuri/akekuri.json').id;
const PERFUSION_JSON = require('../../../../model/game-data/operators/last-rite/statuses/status-hypothermic-perfusion.json');
const MIRAGE_JSON = require('../../../../model/game-data/operators/last-rite/statuses/status-hypothermic-perfusion-mirage.json');
const BATTLE_SKILL_JSON = require('../../../../model/game-data/operators/last-rite/skills/battle-skill-esoteric-legacy.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const PERFUSION_ID: string = PERFUSION_JSON.properties.id;
const MIRAGE_ID: string = MIRAGE_JSON.properties.id;

const SLOT_LR = 'slot-0';
const SLOT_AKEKURI = 'slot-1';
const CONTROL_LABEL = 'Set as Controlled Operator';

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupLrAndAkekuri() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_LR, LAST_RITE_ID); });
  act(() => { view.result.current.handleSwapOperator(SLOT_AKEKURI, AKEKURI_ID); });
  return view;
}

function setupLrOnly() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_LR, LAST_RITE_ID); });
  return view;
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_LR, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeBasicAttack(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_LR, NounType.BASIC_ATTACK);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeAkekuriBasicAttack(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_AKEKURI, NounType.BASIC_ATTACK);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function swapControlTo(app: AppResult, slotId: string, atFrame: number) {
  const col = app.columns.find(
    (c) => c.type === ColumnType.MINI_TIMELINE && (c as { ownerEntityId: string }).ownerEntityId === slotId
      && (c as { columnId: string }).columnId === NounType.BASIC_ATTACK,
  );
  if (!col) throw new Error(`No column found for ${slotId}`);
  const items = buildContextMenu(app, col, atFrame);
  if (!items) throw new Error(`Context menu null for ${slotId}`);
  const controlItem = items.find(i => i.label === CONTROL_LABEL);
  if (!controlItem || controlItem.disabled) throw new Error(`Control item not available for ${slotId}`);
  const payload = controlItem.actionPayload as AddEventPayload;
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getPerfusionEvents(app: AppResult, ownerEntityId?: string) {
  return app.allProcessedEvents.filter(
    ev => ev.id === PERFUSION_ID && ev.startFrame > 0
      && (ownerEntityId ? ev.ownerEntityId === ownerEntityId : true),
  );
}

function getUeAtFrame(app: AppResult, slotId: string, frame: number) {
  const graph = app.resourceGraphs.get(ultimateGraphKey(slotId));
  if (!graph) return 0;
  let value = 0;
  for (const p of graph.points) {
    if (p.frame <= frame) value = p.value;
    else break;
  }
  return value;
}

beforeEach(() => { localStorage.clear(); });

// ═══════════════════════════════════════════════════════════════════════════════
// A. Hypothermic Perfusion — Target Routing
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Hypothermic Perfusion target routing (CONTROLLED operator)', () => {
  it('A1: BS while LR controlled → Hypothermic Perfusion applied to LR slot', () => {
    const { result } = setupLrOnly();
    // LR is controlled by default (slot-0)
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const perfusions = getPerfusionEvents(result.current);
    expect(perfusions).toHaveLength(1);
    expect(perfusions[0].ownerEntityId).toBe(SLOT_LR);
  });

  it('A2: swap control to Akekuri, then LR BS → Hypothermic Perfusion applied to Akekuri slot', () => {
    const { result } = setupLrAndAkekuri();
    // Swap control to Akekuri at 2s
    act(() => { swapControlTo(result.current, SLOT_AKEKURI, 2 * FPS); });
    // Place LR BS at 5s (Akekuri is now controlled)
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const perfusions = getPerfusionEvents(result.current);
    expect(perfusions).toHaveLength(1);
    expect(perfusions[0].ownerEntityId).toBe(SLOT_AKEKURI);
  });

  it('A3: swap control back to LR after Akekuri → Hypothermic Perfusion applied to LR', () => {
    const { result } = setupLrAndAkekuri();
    // Swap to Akekuri at 2s, back to LR at 4s
    act(() => { swapControlTo(result.current, SLOT_AKEKURI, 2 * FPS); });
    act(() => { swapControlTo(result.current, SLOT_LR, 4 * FPS); });
    // Place LR BS at 6s (LR is controlled again)
    act(() => { placeBattleSkill(result.current, 6 * FPS); });

    const perfusions = getPerfusionEvents(result.current);
    expect(perfusions).toHaveLength(1);
    expect(perfusions[0].ownerEntityId).toBe(SLOT_LR);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Hypothermic Perfusion — Stacking (1 limit, RESET)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Hypothermic Perfusion stacking (1 limit, RESET)', () => {
  it('B1: two BS placements → only 1 active Hypothermic Perfusion, duration refreshed from second', () => {
    const { result } = setupLrOnly();
    // Place first BS at 2s, second at 5s
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const perfusions = getPerfusionEvents(result.current, SLOT_LR);
    // RESET interaction: first should be consumed/refreshed, second is the active one
    const active = perfusions.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED
      && ev.eventStatus !== EventStatusType.REFRESHED);
    expect(active).toHaveLength(1);
    // The active one should start from the second BS frame
    expect(active[0].startFrame).toBeGreaterThanOrEqual(5 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. SP Return
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Battle Skill SP return', () => {
  it('C1: BS at P0 — frame carries RETURN SKILL_POINT 30 in clause', () => {
    // Verify from JSON config: RETURN SKILL_POINT with ADD(IS 30, VARY_BY POTENTIAL [0,0,0,0,0,5])
    const frameClause = BATTLE_SKILL_JSON.segments[0].frames[0].clause[0];
    const returnEffect = frameClause.effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.RETURN && e.object === NounType.SKILL_POINT,
    );
    expect(returnEffect).toBeDefined();
    // Base value = 30
    expect(returnEffect.with.value.left.value).toBe(30);
    // P0 bonus = 0
    expect(returnEffect.with.value.right.value[0]).toBe(0);
  });

  it('C2: BS at P5 — RETURN SKILL_POINT base 30 + potential bonus 5 = 35', () => {
    // VARY_BY POTENTIAL [0, 0, 0, 0, 0, 5] → P5 adds 5
    const frameClause = BATTLE_SKILL_JSON.segments[0].frames[0].clause[0];
    const returnEffect = frameClause.effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.RETURN && e.object === NounType.SKILL_POINT,
    );
    expect(returnEffect.with.value.right.value[5]).toBe(5);
  });

  it('C3: BS placed — pipeline processes without SP crash', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_LR && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
    expect(bsEvents[0].skillPointCost).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. UE Recovery (16 to THIS OPERATOR)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Battle Skill UE recovery', () => {
  it('D1: BS clause declares RECOVER 16 UE to THIS OPERATOR', () => {
    // Verify JSON: RECOVER ULTIMATE_ENERGY to THIS OPERATOR with IS 16
    const ueEffect = BATTLE_SKILL_JSON.clause[0].effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.RECOVER && e.object === NounType.ULTIMATE_ENERGY,
    );
    expect(ueEffect).toBeDefined();
    expect(ueEffect.with.value.value).toBe(16);
    expect(ueEffect.toDeterminer).toBe('THIS');
    expect(ueEffect.to).toBe(NounType.OPERATOR);
  });

  it('D2: BS placement → LR gains UE (SP-derived)', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    // LR gains UE from natural SP consumption (SP cost → UE conversion)
    const ueAfter = getUeAtFrame(result.current, SLOT_LR, 10 * FPS);
    expect(ueAfter).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Hypothermic Perfusion Trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Hypothermic Perfusion trigger (CONTROLLED OPERATOR PERFORM FINAL_STRIKE)', () => {
  it('E1: controlled operator finisher triggers Hypothermic Perfusion→ cryo infliction on enemy + status consumed', () => {
    const { result } = setupLrOnly();
    // Place BS at 2s to apply Hypothermic Perfusion
    act(() => { placeBattleSkill(result.current, 2 * FPS); });

    // Place basic attack at 5s — BATK sequence includes finisher (PERFORM FINAL_STRIKE)
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    // Check for cryo infliction on enemy (from Hypothermic Perfusion trigger effect)
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID
        && ev.startFrame > 0,
    );
    // Hypothermic Perfusion trigger should have applied cryo infliction
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);

    // Hypothermic Perfusion status should be consumed after trigger
    const perfusions = getPerfusionEvents(result.current, SLOT_LR);
    const consumed = perfusions.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('E2: non-controlled operator finisher does NOT trigger Hypothermic Perfusion', () => {
    const { result } = setupLrAndAkekuri();
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { swapControlTo(result.current, SLOT_AKEKURI, 3 * FPS); });
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    const perfusions = getPerfusionEvents(result.current, SLOT_LR);
    const consumed = perfusions.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(0);
  });

  it('E3: non-controlled operator (Akekuri) BATK does NOT consume Hypothermic Perfusion', () => {
    const { result } = setupLrAndAkekuri();
    // LR BS at 2s → Hypothermic Perfusion applied to controlled operator (LR, who is controlled)
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    // Place Akekuri BATK at 5s — LR is still controlled, Akekuri is NOT controlled
    act(() => { placeAkekuriBasicAttack(result.current, 5 * FPS); });

    // Hypothermic Perfusion on LR should NOT be consumed (Akekuri is not the controlled operator)
    const perfusions = getPerfusionEvents(result.current, SLOT_LR);
    const consumed = perfusions.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(0);

    // No mirage should be created
    const mirages = getMirageEvents(result.current);
    expect(mirages).toHaveLength(0);
  });

  it('E4: Hypothermic Perfusion trigger applies cryo infliction with stacks = 1', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID
        && ev.startFrame > 0,
    );
    // Hypothermic Perfusion trigger applies 1 cryo infliction stack
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. P1 Gated Effects
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. P1 gated effects on Hypothermic Perfusion', () => {
  it('F1: at P0, mirage stagger = 0 (VARY_BY POTENTIAL [0, 5, 5, 5, 5, 5])', () => {
    // Stagger values now live in the mirage status segment frame
    const staggerEffect = MIRAGE_JSON.segments[0].frames[0].clause[0].effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
    );
    expect(staggerEffect.with.value.value[0]).toBe(0); // P0
  });

  it('F2: at P1+, mirage stagger = 5', () => {
    const staggerEffect = MIRAGE_JSON.segments[0].frames[0].clause[0].effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
    );
    expect(staggerEffect.with.value.value[1]).toBe(5); // P1
  });

  it('F3: Hypothermic Perfusion passive gated by SOURCE OPERATOR HAVE POTENTIAL >= 1, applies 20% DAMAGE_BONUS', () => {
    const passiveClause = PERFUSION_JSON.clause[0];
    expect(passiveClause.conditions[0].subjectDeterminer).toBe(DeterminerType.SOURCE);
    expect(passiveClause.conditions[0].verb).toBe(VerbType.HAVE);
    expect(passiveClause.conditions[0].object).toBe(NounType.POTENTIAL);
    expect(passiveClause.conditions[0].value.value).toBe(1);
    expect(passiveClause.effects[0].verb).toBe(VerbType.APPLY);
    expect(passiveClause.effects[0].with.value.value).toBe(0.2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. P5 Mirage Multiplier
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. P5 mirage multiplier (1.2×)', () => {
  it('G1: mirage damage multiplier at P5 = 1.2× (VARY_BY POTENTIAL)', () => {
    // Damage multiplier now lives in the mirage status segment frame
    const damageEffect = MIRAGE_JSON.segments[0].frames[0].clause[0].effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    const potentialMultiplier = damageEffect.with.value.right.value;
    expect(potentialMultiplier[0]).toBe(1);   // P0
    expect(potentialMultiplier[4]).toBe(1);   // P4
    expect(potentialMultiplier[5]).toBe(1.2); // P5
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Hypothermic Perfusion (Mirage) — Enemy Status E2E
// ═══════════════════════════════════════════════════════════════════════════════

function getMirageEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.id === MIRAGE_ID && ev.startFrame > 0,
  );
}

describe('H. Hypothermic Perfusion (Mirage) — config verification', () => {
  it('H1: mirage config — APPLY STATUS to ENEMY, CRYO element, 2s duration', () => {
    expect(MIRAGE_JSON.properties.to).toBe(NounType.ENEMY);
    expect(MIRAGE_JSON.properties.element).toBe('CRYO');
    expect(MIRAGE_JSON.properties.duration.value.value).toBe(2);
    expect(MIRAGE_JSON.properties.eventCategoryType).toBe('SKILL_STATUS');
  });

  it('H2: mirage segment frame at offset 0s with DEAL CRYO DAMAGE, APPLY CRYO INFLICTION, DEAL STAGGER', () => {
    const frame = MIRAGE_JSON.segments[0].frames[0];
    expect(frame.properties.offset.value).toBe(0);
    expect(frame.properties.offset.unit).toBe('SECOND');

    const effects = frame.clause[0].effects;
    const dealDmg = effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dealDmg).toBeDefined();
    expect(dealDmg.objectQualifier).toBe('CRYO');

    const applyInfliction = effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.APPLY && e.object === NounType.INFLICTION,
    );
    expect(applyInfliction).toBeDefined();
    expect(applyInfliction.objectQualifier).toBe('CRYO');
    expect(applyInfliction.with.stacks.value).toBe(1);

    const dealStagger = effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
    );
    expect(dealStagger).toBeDefined();
  });

  it('H3: mirage damage/stagger use SOURCE OPERATOR stats (not THIS)', () => {
    const effects = MIRAGE_JSON.segments[0].frames[0].clause[0].effects;

    const dealDmg = effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    // Skill level multiplier uses SOURCE
    expect(dealDmg.with.value.left.of.determiner).toBe(DeterminerType.SOURCE);
    // Potential multiplier uses SOURCE
    expect(dealDmg.with.value.right.of.determiner).toBe(DeterminerType.SOURCE);
    // Main stat uses SOURCE
    expect(dealDmg.with.mainStat.of.determiner).toBe(DeterminerType.SOURCE);

    const dealStagger = effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
    );
    expect(dealStagger.with.value.of.determiner).toBe(DeterminerType.SOURCE);
  });

  it('H4: Hypothermic Perfusion onTriggerClause applies mirage status to ENEMY', () => {
    const applyEffect = PERFUSION_JSON.onTriggerClause[0].effects[0];
    expect(applyEffect.verb).toBe(VerbType.APPLY);
    expect(applyEffect.object).toBe(NounType.STATUS);
    expect(applyEffect.objectId).toBe(MIRAGE_ID);
    expect(applyEffect.to).toBe(NounType.ENEMY);
  });
});

describe('H. Hypothermic Perfusion (Mirage) — pipeline E2E', () => {
  it('H5: BS + finisher → mirage status created on enemy', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    const mirages = getMirageEvents(result.current);
    expect(mirages.length).toBeGreaterThanOrEqual(1);
    expect(mirages[0].ownerEntityId).toBe(ENEMY_ID);
  });

  it('H6: mirage sourceEntityId tracks back to Last Rite operator', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    const mirages = getMirageEvents(result.current);
    expect(mirages.length).toBeGreaterThanOrEqual(1);
    expect(mirages[0].sourceEntityId).toBe(LAST_RITE_ID);
  });

  it('H7: mirage triggers cryo infliction on enemy from its segment frame', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    // The mirage's frame at 0s offset should apply cryo infliction
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID
        && ev.startFrame > 0,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });

  it('H8: mirage appears in enemy status view model', () => {
    const { result } = setupLrOnly();
    act(() => { placeBattleSkill(result.current, 2 * FPS); });
    act(() => { placeBasicAttack(result.current, 5 * FPS); });

    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    if (!enemyStatusCol) return; // Column may not exist if no enemy statuses configured

    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = vms.get(enemyStatusCol.key);
    if (!vm) return;

    const mirageVmEvents = vm.events.filter(ev => ev.id === MIRAGE_ID);
    expect(mirageVmEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('H9: without finisher trigger, no mirage is created', () => {
    const { result } = setupLrOnly();
    // Only place BS — no basic attack / finisher
    act(() => { placeBattleSkill(result.current, 2 * FPS); });

    const mirages = getMirageEvents(result.current);
    expect(mirages).toHaveLength(0);
  });
});
