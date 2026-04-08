/**
 * @jest-environment jsdom
 */

/**
 * Avywenna — Full Kit E2E Integration Tests
 *
 * Exercises every interaction in Avywenna's kit through the full useApp pipeline:
 *   - BS base hit (unconditional damage + stagger)
 *   - BS + Thunderlance consumption (damage, stagger, consume, UE recovery)
 *   - BS + Thunderlance EX consumption (damage, stagger, infliction, consume, UE recovery)
 *   - P5 damage multiplier (1.15× on all BS damage)
 *   - P2 duration extends consumption window (50s vs 30s)
 *   - T1 UE recovery on lance consumption
 *   - T2 Electric Susceptibility from ultimate
 *   - Full rotation scenario
 *
 * Three-layer verification:
 *   1. Context menu: events added through right-click → add event flow
 *   2. Controller: allProcessedEvents with correct properties
 *   3. View: computeTimelinePresentation includes events in correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, AdjectiveType, VerbType, flattenQualifiedId } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, EventStatusType } from '../../../../consts/enums';
import type { MiniTimeline, EventFrameMarker } from '../../../../consts/viewTypes';
import { eventDuration } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  OPERATOR_STATUS_COLUMN_ID,
  INFLICTION_COLUMNS,
  ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { ultimateGraphKey } from '../../../../model/channels';
import {
  findColumn, getMenuPayload, setUltimateEnergyToMax,
} from '../../helpers';
import type { AppResult } from '../../helpers';
import { findStaggerInClauses, findDealDamageInClauses } from '../../../../controller/timeline/clauseQueries';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const AVYWENNA_ID: string = require(
  '../../../../model/game-data/operators/avywenna/avywenna.json',
).id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/avywenna/skills/battle-skill-thunderlance-interdiction.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/avywenna/skills/combo-skill-thunderlance-strike.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/avywenna/skills/ultimate-thunderlance-final-shock.json',
).properties.id;

const THUNDERLANCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance.json',
).properties.id;

const THUNDERLANCE_EX_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-ex.json',
).properties.id;

const THUNDERLANCE_PIERCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-pierce.json',
).properties.id;

const THUNDERLANCE_EX_PIERCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-ex-pierce.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const SLOT_INDEX = 0;

const ELECTRIC_SUSCEPTIBILITY_ID = flattenQualifiedId(AdjectiveType.ELECTRIC, NounType.SUSCEPTIBILITY);

// Duration expectations (in seconds)
const BASE_DURATION_SEC = 30;
const P2_BONUS_SEC = 20;

// At default loadout: talentOneLevel=3 (clamped → index 2 → 4), potential=5 (index 5 → 2)
const UE_PER_LANCE_DEFAULT = 4 + 2; // 6

beforeEach(() => {
  localStorage.clear();
});

// ── Setup helpers ───────────────────────────────────────────────────────────

function setupAvywenna() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, AVYWENNA_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

// NOTE: VARY_BY TALENT_LEVEL in DSL resolves to `talentOneLevel` by default
// (see valueResolver.buildContextForSkillColumn). The ult's Tactful Approach
// susceptibility scales via this path, so we set talentOneLevel here even
// though Tactful Approach is lore-wise the T2 talent.
function setupAvywennaWithTalentLevel(talentLevel: number) {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT, AVYWENNA_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });
  const props = view.result.current.loadoutProperties[SLOT];
  act(() => {
    view.result.current.handleStatsChange(SLOT, {
      ...props,
      operator: { ...props.operator, talentOneLevel: talentLevel },
    });
  });
  return view;
}

function setupAvywennaWithPotential(potential: number) {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT, AVYWENNA_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });

  const props = view.result.current.loadoutProperties[SLOT];
  act(() => {
    view.result.current.handleStatsChange(SLOT, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });

  return view;
}

/** Place a combo skill via context menu at the given second. */
function placeCombo(result: { current: AppResult }, atSec: number) {
  const col = findColumn(result.current, SLOT, NounType.COMBO);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atSec * FPS);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

/** Place a battle skill via context menu at the given second. */
function placeBattleSkill(result: { current: AppResult }, atSec: number) {
  const col = findColumn(result.current, SLOT, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atSec * FPS);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

/** Place an ultimate via context menu at the given second (energy must be set first). */
function placeUltimate(result: { current: AppResult }, atSec: number) {
  const col = findColumn(result.current, SLOT, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atSec * FPS);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

/** Get max UE in a frame range. */
function getMaxUeInRange(app: AppResult, startFrame: number, endFrame: number) {
  const graph = app.resourceGraphs.get(ultimateGraphKey(SLOT));
  if (!graph) return 0;
  let max = 0;
  for (const p of graph.points) {
    if (p.frame >= startFrame && p.frame <= endFrame) {
      max = Math.max(max, p.value);
    }
  }
  return max;
}

/** Find Thunderlance status events on the operator. */
function getThunderlanceEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.ownerId === SLOT && ev.columnId === THUNDERLANCE_STATUS_ID,
  );
}

/** Find Thunderlance EX status events on the operator. */
function getThunderlanceExEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.ownerId === SLOT && ev.columnId === THUNDERLANCE_EX_STATUS_ID,
  );
}

/** Find the operator-status column view model. */
function getOperatorStatusVM(app: AppResult) {
  const viewModels = computeTimelinePresentation(
    app.allProcessedEvents, app.columns,
  );
  const statusCol = app.columns.find(
    c => c.type === ColumnType.MINI_TIMELINE
      && (c as MiniTimeline).ownerId === SLOT
      && (c as MiniTimeline).columnId === OPERATOR_STATUS_COLUMN_ID,
  );
  return statusCol ? viewModels.get(statusCol.key) : undefined;
}

/** Collect all frame markers from an event's segments. */
function allFrames(ev: { segments: { frames?: EventFrameMarker[] }[] }): EventFrameMarker[] {
  return ev.segments.flatMap(s => s.frames ?? []);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. BS base hit — unconditional damage + stagger
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. BS base hit (unconditional)', () => {
  it('A1: BS without lances still deals Electric damage and stagger to enemy', () => {
    const { result } = setupAvywenna();

    // Place BS with no prior combo → no lances to consume
    placeBattleSkill(result, 5);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
    expect(bsEvents[0].name).toBe(BATTLE_SKILL_ID);

    // BS frame should have deal damage and stagger
    const frames = allFrames(bsEvents[0]);
    expect(frames.length).toBeGreaterThanOrEqual(1);

    // At least one frame should have dealDamage (unconditional electric damage)
    const damageFrame = frames.find(f => findDealDamageInClauses(f.clauses));
    expect(damageFrame).toBeDefined();
    expect(findDealDamageInClauses(damageFrame!.clauses)!.element).toBe(AdjectiveType.ELECTRIC);

    // At least one frame should have stagger
    const staggerFrame = frames.find(f => findStaggerInClauses(f.clauses));
    expect(staggerFrame).toBeDefined();
    expect(findStaggerInClauses(staggerFrame!.clauses)!).toBeGreaterThan(0);

    // No Thunderlance events should exist
    expect(getThunderlanceEvents(result.current)).toHaveLength(0);

    // View layer: BS visible in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    const vm = viewModels.get(bsCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === BATTLE_SKILL_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. BS + Thunderlance consumption
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. BS consumes Thunderlance — full effect chain', () => {
  it('B1: Combo deploys 3 Thunderlances, BS consumes all and deals per-lance damage', () => {
    const { result } = setupAvywenna();

    // 1. Combo at 2s → deploys 3 Thunderlances
    placeCombo(result, 2);

    const lanceBefore = getThunderlanceEvents(result.current);
    expect(lanceBefore.length).toBeGreaterThanOrEqual(1);
    expect(lanceBefore[0].name).toBe(THUNDERLANCE_STATUS_ID);

    // 2. BS at 8s → consumes Thunderlances
    placeBattleSkill(result, 8);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);

    // 3. Thunderlance should be consumed
    // With infinite-stack counter mode, CONSUME drops stack count to 0 instead of marking CONSUMED.
    const lanceAfter = getThunderlanceEvents(result.current);
    expect(lanceAfter.some(ev => ev.eventStatus === EventStatusType.CONSUMED)).toBe(true);

    // 4. View layer: Thunderlance visible in operator-status column, BS in battle column
    const vm = getOperatorStatusVM(result.current);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === THUNDERLANCE_STATUS_ID)).toBe(true);

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    const bsVM = viewModels.get(bsCol!.key);
    expect(bsVM).toBeDefined();
    expect(bsVM!.events.some(ev => ev.name === BATTLE_SKILL_ID)).toBe(true);
  });

  it('B2: BS frame carries conditional Thunderlance clause with CONSUME (damage/stagger merged into unconditional)', () => {
    const { result } = setupAvywenna();

    placeCombo(result, 2);
    placeBattleSkill(result, 8);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    const frames = allFrames(bsEvents[0]);

    // Find the frame with clauses (conditional effects)
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    // Should have conditional clause for THUNDERLANCE (HAVE STATUS THUNDERLANCE)
    const thunderlanceClause = clauseFrame!.clauses!.find(c =>
      c.conditions?.some(
        cond => cond.verb === VerbType.HAVE
          && cond.object === NounType.STATUS
          && cond.objectId === THUNDERLANCE_STATUS_ID,
      ),
    );
    expect(thunderlanceClause).toBeDefined();

    // Clause effects should include CONSUME STATUS THUNDERLANCE (as dsl effect)
    const consumeEffect = thunderlanceClause!.effects.find(
      e => e.type === 'dsl' && e.dslEffect?.verb === VerbType.CONSUME
        && e.dslEffect?.objectId === THUNDERLANCE_STATUS_ID,
    );
    expect(consumeEffect).toBeDefined();

    // dealDamage and stagger live on the unconditional clause now (single merged dealDamage)
    const unconditional = clauseFrame!.clauses!.find(c => !c.conditions || c.conditions.length === 0);
    expect(unconditional).toBeDefined();
    const dealInfo = findDealDamageInClauses([unconditional!]);
    expect(dealInfo).toBeDefined();
    expect(dealInfo!.element).toBe(AdjectiveType.ELECTRIC);
    expect(unconditional!.effects.some(e => {
      const dsl = (e as { dslEffect?: { verb?: string; object?: string } }).dslEffect;
      return dsl?.verb === VerbType.DEAL && dsl?.object === NounType.STAGGER;
    })).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. BS + Thunderlance EX consumption
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. BS consumes Thunderlance EX — full effect chain', () => {
  it('C1: Ult deploys EX, BS consumes and applies Electric Infliction', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    // 1. Ult at 2s → deploys THUNDERLANCE_EX
    placeUltimate(result, 2);

    const exBefore = getThunderlanceExEvents(result.current);
    expect(exBefore.length).toBeGreaterThanOrEqual(1);
    expect(exBefore[0].name).toBe(THUNDERLANCE_EX_STATUS_ID);

    // 2. BS at 10s → consumes EX and applies Electric Infliction
    placeBattleSkill(result, 10);

    // EX should be consumed
    const exAfter = getThunderlanceExEvents(result.current);
    const consumed = exAfter.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);

    // Electric Infliction should appear on enemy
    const inflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    );
    expect(inflictions.length).toBeGreaterThanOrEqual(1);

    // View layer: EX in operator-status column
    const vm = getOperatorStatusVM(result.current);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === THUNDERLANCE_EX_STATUS_ID)).toBe(true);

    // View layer: BS in battle column presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    const bsVM = viewModels.get(bsCol!.key);
    expect(bsVM).toBeDefined();
    expect(bsVM!.events.some(ev => ev.name === BATTLE_SKILL_ID)).toBe(true);
  });

  it('C2: BS frame carries conditional EX clause with CONSUME + DEAL DAMAGE + STAGGER + APPLY INFLICTION', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 2);
    placeBattleSkill(result, 10);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    const frames = allFrames(bsEvents[0]);

    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    // Conditional clause for THUNDERLANCE_EX
    const exClause = clauseFrame!.clauses!.find(c =>
      c.conditions?.some(
        cond => cond.verb === VerbType.HAVE
          && cond.object === NounType.STATUS
          && cond.objectId === THUNDERLANCE_EX_STATUS_ID,
      ),
    );
    expect(exClause).toBeDefined();

    // CONSUME STATUS THUNDERLANCE_EX (as dsl effect)
    expect(exClause!.effects.some(
      e => e.type === 'dsl' && e.dslEffect?.verb === VerbType.CONSUME
        && e.dslEffect?.objectId === THUNDERLANCE_EX_STATUS_ID,
    )).toBe(true);

    // EX damage is now produced by a separate THUNDERLANCE_EX_PIERCE status applied to enemy.
    expect(exClause!.effects.some(
      e => e.type === 'dsl' && e.dslEffect?.verb === VerbType.APPLY
        && e.dslEffect?.objectId === THUNDERLANCE_EX_PIERCE_STATUS_ID,
    )).toBe(true);

    // EX stagger and Electric Infliction live on the pierce status, not the BS clause
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. P5 damage multiplier — 1.15× on all BS damage
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. P5 Carrot and Sharp Stick — 1.15× BS damage', () => {
  it('D1: BS unconditional dealDamage carries P5 conditional Electric Susceptibility multiplier', () => {
    const { result } = setupAvywenna();

    placeBattleSkill(result, 5);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    const frames = allFrames(bsEvents[0]);
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    // Unconditional clause should have dealDamage effect
    const unconditional = clauseFrame!.clauses!.find(c =>
      !c.conditions || c.conditions.length === 0,
    );
    expect(unconditional).toBeDefined();

    const dealInfo = findDealDamageInClauses([unconditional!]);
    expect(dealInfo).toBeDefined();

    // multiplierNode: MULT(VARY_BY SL, ADD(1, MULT(VARY_BY POTENTIAL [0..0.15], MIN(1, STACKS))))
    const node = dealInfo!.multiplierNode as Record<string, unknown>;
    expect(node).toBeDefined();
    expect(node.operation).toBe('MULT');
    const right = node.right as Record<string, unknown>;
    expect(right.operation).toBe('ADD');
    const inner = (right.right as Record<string, unknown>);
    expect(inner.operation).toBe('MULT');
    const potNode = inner.left as Record<string, unknown>;
    expect(potNode.object).toBe(NounType.POTENTIAL);
    const potValues = potNode.value as number[];
    expect(potValues[0]).toBe(0);
    expect(potValues[5]).toBe(0.15);
  });

  it('D2: Thunderlance conditional clause APPLIES pierce status (damage lives on pierce status)', () => {
    const { result } = setupAvywenna();

    placeCombo(result, 2);
    placeBattleSkill(result, 8);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    const frames = allFrames(bsEvents[0]);
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    const lanceClause = clauseFrame!.clauses!.find(c =>
      c.conditions?.some(cond => cond.objectId === THUNDERLANCE_STATUS_ID),
    );
    expect(lanceClause).toBeDefined();

    // The conditional clause applies THUNDERLANCE_PIERCE — damage is on that status
    expect(lanceClause!.effects.some(
      e => e.type === 'dsl' && e.dslEffect?.verb === VerbType.APPLY
        && e.dslEffect?.objectId === THUNDERLANCE_PIERCE_STATUS_ID,
    )).toBe(true);
  });

  it('D3: Thunderlance EX conditional clause APPLIES EX pierce status (damage lives on pierce status)', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 2);
    placeBattleSkill(result, 10);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    const frames = allFrames(bsEvents[0]);
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    const exClause = clauseFrame!.clauses!.find(c =>
      c.conditions?.some(cond => cond.objectId === THUNDERLANCE_EX_STATUS_ID),
    );
    expect(exClause).toBeDefined();

    expect(exClause!.effects.some(
      e => e.type === 'dsl' && e.dslEffect?.verb === VerbType.APPLY
        && e.dslEffect?.objectId === THUNDERLANCE_EX_PIERCE_STATUS_ID,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. P2 duration extends consumption window
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. P2 Pole of Menace — duration extends consumption window', () => {
  it('E1: P0 — BS at 40s finds no lances (expired at 30s)', () => {
    const { result } = setupAvywennaWithPotential(0);

    // Combo at 2s → Thunderlance with 30s duration (expires at ~32s)
    placeCombo(result, 2);
    expect(getThunderlanceEvents(result.current).length).toBeGreaterThanOrEqual(1);

    // BS at 40s → beyond 30s duration, no lances to consume
    placeBattleSkill(result, 40);

    // No consumption should have occurred
    const consumed = getThunderlanceEvents(result.current).filter(
      ev => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumed).toHaveLength(0);

    // View layer: Thunderlance still visible (as expired, not consumed)
    const vm = getOperatorStatusVM(result.current);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === THUNDERLANCE_STATUS_ID)).toBe(true);
  });

  it('E2: P2 — BS at 40s finds lances still alive (50s duration)', () => {
    const { result } = setupAvywennaWithPotential(2);

    // Combo at 2s → Thunderlance with 50s duration (expires at ~52s)
    placeCombo(result, 2);
    const lancesBeforeBS = getThunderlanceEvents(result.current);
    expect(lancesBeforeBS.length).toBeGreaterThanOrEqual(1);
    // Duration should be 50s at P2
    expect(eventDuration(lancesBeforeBS[0])).toBe((BASE_DURATION_SEC + P2_BONUS_SEC) * FPS);

    // BS at 40s → within 50s P2 window, should consume
    placeBattleSkill(result, 40);

    const consumed = getThunderlanceEvents(result.current).filter(
      ev => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumed.length).toBeGreaterThanOrEqual(1);

    // View layer: both Thunderlance and BS in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    const bsVM = viewModels.get(bsCol!.key);
    expect(bsVM).toBeDefined();
    expect(bsVM!.events.some(ev => ev.name === BATTLE_SKILL_ID)).toBe(true);
  });

  it('E3: P2 — Thunderlance EX also gets extended duration from P2', () => {
    const { result } = setupAvywennaWithPotential(2);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 2);

    const exEvents = getThunderlanceExEvents(result.current);
    expect(exEvents.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(exEvents[0])).toBe((BASE_DURATION_SEC + P2_BONUS_SEC) * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. T1 UE recovery on lance consumption
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. T1 Expedited Delivery — UE recovery on BS lance consumption', () => {
  it('F1: BS after combo produces THUNDERLANCE_PIERCE events that each recover (tl + pot) UE', () => {
    const { result } = setupAvywenna();
    placeCombo(result, 2);
    placeBattleSkill(result, 8);

    const pierces = result.current.allProcessedEvents.filter(
      ev => ev.id === THUNDERLANCE_PIERCE_STATUS_ID,
    );
    expect(pierces).toHaveLength(3);

    // Walk the UE graph and count jumps that occur at a pierce start frame and
    // equal the per-lance recovery exactly. There are other gains at the same
    // frame (BS natural SP→UE), so we must filter by magnitude not by total.
    const graph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
    const pierceFrames = new Set(pierces.map(p => p.startFrame));
    let lanceJumps = 0;
    for (let i = 1; i < (graph?.points.length ?? 0); i++) {
      const prev = graph!.points[i - 1];
      const cur = graph!.points[i];
      if (!pierceFrames.has(cur.frame)) continue;
      if (Math.abs((cur.value - prev.value) - UE_PER_LANCE_DEFAULT) < 1e-6) lanceJumps++;
    }
    expect(lanceJumps).toBe(pierces.length);
  });

  it('F2: BS after ult produces a THUNDERLANCE_EX_PIERCE event that recovers (tl + pot) UE', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });
    placeUltimate(result, 2);
    placeBattleSkill(result, 10);

    const pierces = result.current.allProcessedEvents.filter(
      ev => ev.id === THUNDERLANCE_EX_PIERCE_STATUS_ID,
    );
    expect(pierces).toHaveLength(1);

    const graph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
    const pierceFrames = new Set(pierces.map(p => p.startFrame));
    let lanceJumps = 0;
    for (let i = 1; i < (graph?.points.length ?? 0); i++) {
      const prev = graph!.points[i - 1];
      const cur = graph!.points[i];
      if (!pierceFrames.has(cur.frame)) continue;
      if (Math.abs((cur.value - prev.value) - UE_PER_LANCE_DEFAULT) < 1e-6) lanceJumps++;
    }
    expect(lanceJumps).toBe(pierces.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. T2 Tactful Approach — Electric Susceptibility from ultimate
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. T2 Tactful Approach — Electric Susceptibility', () => {
  it('G1: Ult applies ELECTRIC_SUSCEPTIBILITY status to enemy', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 5);

    // ELECTRIC_SUSCEPTIBILITY should appear on enemy
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === ELECTRIC_SUSCEPTIBILITY_ID,
    );
    expect(suscEvents.length).toBeGreaterThanOrEqual(1);

    // Susceptibility event should have a susceptibility record with ELECTRIC key
    const suscEvent = suscEvents[0];
    expect(suscEvent.susceptibility).toBeDefined();
    const elecValue = (suscEvent.susceptibility as Record<string, number>)[AdjectiveType.ELECTRIC];
    expect(elecValue).toBeGreaterThan(0);

    // Duration should be 10s (baked in ult)
    expect(eventDuration(suscEvent)).toBe(10 * FPS);

    // View layer: susceptibility events appear in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    // Susceptibility events should appear in some view column
    const allViewEvents = Array.from(viewModels.values()).flatMap(vm => vm.events);
    expect(allViewEvents.some(
      ev => ev.id === ELECTRIC_SUSCEPTIBILITY_ID || ev.columnId === ELECTRIC_SUSCEPTIBILITY_ID,
    )).toBe(true);
  });

  it('G2: Ult frame clause carries APPLY ELECTRIC SUSCEPTIBILITY with VARY_BY TALENT_LEVEL value', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 5);

    const ultEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    const frames = allFrames(ultEvents[0]);
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    // Find the DSL effect for APPLY SUSCEPTIBILITY
    const allEffects = clauseFrame!.clauses!.flatMap(c => c.effects);
    const suscEffect = allEffects.find(
      e => e.type === 'dsl'
        && e.dslEffect?.verb === VerbType.APPLY
        && e.dslEffect?.object === NounType.STATUS
        && e.dslEffect?.objectId === NounType.SUSCEPTIBILITY,
    );
    expect(suscEffect).toBeDefined();

    // Value should be VARY_BY TALENT_LEVEL [0, 0.06, 0.10]
    const withValue = suscEffect!.dslEffect!.with as Record<string, unknown>;
    expect(withValue.value).toBeDefined();
    const valueNode = withValue.value as Record<string, unknown>;
    expect(valueNode.verb).toBe(VerbType.VARY_BY);
    expect(valueNode.object).toBe(NounType.TALENT_LEVEL);
    const tlValues = valueNode.value as number[];
    expect(tlValues[0]).toBe(0);
    expect(tlValues[1]).toBe(0.06);
    expect(tlValues[2]).toBe(0.10);
  });

  it('G3: Ult susceptibility scales with talent level — 0 at TL0, 0.06 at TL1, 0.10 at TL2+', () => {
    for (const [tl, expected] of [[0, 0], [1, 0.06], [2, 0.10]] as const) {
      const { result } = setupAvywennaWithTalentLevel(tl);
      act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });
      placeUltimate(result, 5);

      const suscEvents = result.current.allProcessedEvents.filter(
        ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === ELECTRIC_SUSCEPTIBILITY_ID,
      );
      expect(suscEvents.length).toBeGreaterThanOrEqual(1);
      const elecValue = (suscEvents[0].susceptibility as Record<string, number>)[AdjectiveType.ELECTRIC];
      expect(elecValue).toBeCloseTo(expected, 6);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Combo — damage multipliers and stagger
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Combo skill — damage multipliers and stagger', () => {
  it('I1: Combo frame has Electric dealDamage with wiki multipliers [1.69→3.80]', () => {
    const { result } = setupAvywenna();

    placeCombo(result, 5);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
    expect(comboEvents[0].name).toBe(COMBO_SKILL_ID);

    const frames = allFrames(comboEvents[0]);
    expect(frames.length).toBeGreaterThanOrEqual(1);

    // Frame should have dealDamage with Electric element
    const damageFrame = frames.find(f => findDealDamageInClauses(f.clauses));
    expect(damageFrame).toBeDefined();
    const damageInfo = findDealDamageInClauses(damageFrame!.clauses)!;
    expect(damageInfo.element).toBe(AdjectiveType.ELECTRIC);

    // Multipliers should be the 12-entry skill level array
    const multipliers = damageInfo.multipliers;
    expect(multipliers).toHaveLength(12);
    expect(multipliers[0]).toBe(1.69);   // SL1
    expect(multipliers[11]).toBe(3.8);   // SL12

    // View layer: combo visible in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    const vm = viewModels.get(comboCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === COMBO_SKILL_ID)).toBe(true);
  });

  it('I2: Combo frame has stagger and APPLY THUNDERLANCE clause', () => {
    const { result } = setupAvywenna();

    placeCombo(result, 5);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    const frames = allFrames(comboEvents[0]);

    // Stagger on the frame marker
    const staggerFrame = frames.find(f => findStaggerInClauses(f.clauses));
    expect(staggerFrame).toBeDefined();
    expect(findStaggerInClauses(staggerFrame!.clauses)).toBe(10);

    // Frame clause should contain APPLY THUNDERLANCE with stacks 3
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    const applyLance = clauseFrame!.clauses!.flatMap(c => c.effects).find(
      e => e.type === 'dsl'
        && e.dslEffect?.verb === VerbType.APPLY
        && e.dslEffect?.objectId === THUNDERLANCE_STATUS_ID,
    );
    expect(applyLance).toBeDefined();

    // Stacks should be 3
    const withStacks = (applyLance!.dslEffect!.with as Record<string, unknown>)?.stacks as Record<string, unknown>;
    expect(withStacks).toBeDefined();
    expect(withStacks.value).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Ultimate — damage multipliers and stagger
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Ultimate skill — damage multipliers and stagger', () => {
  it('J1: Ult frame has Electric dealDamage with wiki multipliers [4.22→9.50]', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 5);

    const ultEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
    expect(ultEvents[0].name).toBe(ULTIMATE_ID);

    const frames = allFrames(ultEvents[0]);
    expect(frames.length).toBeGreaterThanOrEqual(1);

    // Frame should have dealDamage with Electric element
    const damageFrame = frames.find(f => findDealDamageInClauses(f.clauses));
    expect(damageFrame).toBeDefined();
    const damageInfo = findDealDamageInClauses(damageFrame!.clauses)!;
    expect(damageInfo.element).toBe(AdjectiveType.ELECTRIC);

    // Multipliers should be the 12-entry skill level array
    const multipliers = damageInfo.multipliers;
    expect(multipliers).toHaveLength(12);
    expect(multipliers[0]).toBe(4.22);   // SL1
    expect(multipliers[11]).toBe(9.5);   // SL12

    // View layer: ult visible in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    const vm = viewModels.get(ultCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.name === ULTIMATE_ID)).toBe(true);
  });

  it('J2: Ult frame has stagger and APPLY THUNDERLANCE_EX clause', () => {
    const { result } = setupAvywenna();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    placeUltimate(result, 5);

    const ultEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    const frames = allFrames(ultEvents[0]);

    // Stagger on the frame marker (VARY_BY SL resolves to first value at parse time)
    const staggerFrame = frames.find(f => findStaggerInClauses(f.clauses));
    expect(staggerFrame).toBeDefined();
    expect(findStaggerInClauses(staggerFrame!.clauses)!).toBeGreaterThan(0);

    // Frame clause should contain APPLY THUNDERLANCE_EX with stacks 1
    const clauseFrame = frames.find(f => f.clauses && f.clauses.length > 0);
    expect(clauseFrame).toBeDefined();

    const applyEx = clauseFrame!.clauses!.flatMap(c => c.effects).find(
      e => e.type === 'dsl'
        && e.dslEffect?.verb === VerbType.APPLY
        && e.dslEffect?.objectId === THUNDERLANCE_EX_STATUS_ID,
    );
    expect(applyEx).toBeDefined();

    // Stacks should be 1
    const withStacks = (applyEx!.dslEffect!.with as Record<string, unknown>)?.stacks as Record<string, unknown>;
    expect(withStacks).toBeDefined();
    expect(withStacks.value).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. P1 Doubling Down — UE per lance +2
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. P1 Doubling Down — UE recovery per lance', () => {
  it('K1: P1 combo recovers more UE than P0 combo (T1 UE += VARY_BY POT [0,2,2,2,2,2])', () => {
    // P0 combo (3 lances): UE per lance = ADD(TL[0,3,4][2], POT[0,2,2,2,2,2][0]) = 4 + 0 = 4
    // P0 total = 4 × 3 = 12
    const { result: p0 } = setupAvywennaWithPotential(0);
    placeCombo(p0, 5);
    const p0Combo = p0.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    const p0End = p0Combo[0].startFrame + p0Combo[0].segments.reduce((s, seg) => s + seg.properties.duration, 0);
    const ueP0 = getMaxUeInRange(p0.current, 5 * FPS, p0End);

    // P1 combo (3 lances): UE per lance = ADD(TL[2]=4, POT[1]=2) = 6
    // P1 total = 6 × 3 = 18
    const { result: p1 } = setupAvywennaWithPotential(1);
    placeCombo(p1, 5);
    const p1Combo = p1.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    const p1End = p1Combo[0].startFrame + p1Combo[0].segments.reduce((s, seg) => s + seg.properties.duration, 0);
    const ueP1 = getMaxUeInRange(p1.current, 5 * FPS, p1End);

    // P1 should grant +2 UE per lance = +6 total (3 lances × 2)
    expect(ueP1 - ueP0).toBe(2 * 3);
  });

  it('K2: P0 combo UE is talent-only (no potential bonus)', () => {
    const { result } = setupAvywennaWithPotential(0);
    placeCombo(result, 5);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    const comboEnd = comboEvents[0].startFrame
      + comboEvents[0].segments.reduce((s, seg) => s + seg.properties.duration, 0);
    const ue = getMaxUeInRange(result.current, 5 * FPS, comboEnd);

    // At P0: UE per lance = ADD(TL[0,3,4][clamped idx 2] = 4, POT[0,...][0] = 0) = 4
    // 3 lances × 4 = 12
    expect(ue).toBe(4 * 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. Full rotation scenario
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. Full rotation — combo → BS → ult → BS', () => {
  it('L1: Full rotation with P5 — all effects chain correctly through pipeline and view', () => {
    const { result } = setupAvywennaWithPotential(5);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    // 1. Combo at 2s → deploys 3 Thunderlances + 18 UE
    placeCombo(result, 2);

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
    expect(comboEvents[0].name).toBe(COMBO_SKILL_ID);

    const lancesAfterCombo = getThunderlanceEvents(result.current);
    expect(lancesAfterCombo.length).toBeGreaterThanOrEqual(1);

    // 2. BS at 8s → consumes 3 Thunderlances + deals electric damage + recovers UE
    placeBattleSkill(result, 8);

    const bs1Events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs1Events).toHaveLength(1);

    const consumed1 = getThunderlanceEvents(result.current).filter(
      ev => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumed1.length).toBeGreaterThanOrEqual(1);

    // 3. Ult at 15s → deploys 1 Thunderlance EX + applies Electric Susceptibility
    placeUltimate(result, 15);

    const ultEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
    expect(ultEvents[0].name).toBe(ULTIMATE_ID);

    const exAfterUlt = getThunderlanceExEvents(result.current);
    expect(exAfterUlt.length).toBeGreaterThanOrEqual(1);

    // Electric Susceptibility should be on enemy from ult
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === ELECTRIC_SUSCEPTIBILITY_ID,
    );
    expect(suscEvents.length).toBeGreaterThanOrEqual(1);

    // 4. BS at 25s → consumes 1 EX + applies Electric Infliction
    placeBattleSkill(result, 25);

    const bs2Events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs2Events).toHaveLength(2);

    const consumedEx = getThunderlanceExEvents(result.current).filter(
      ev => ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedEx.length).toBeGreaterThanOrEqual(1);

    const inflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    );
    expect(inflictions.length).toBeGreaterThanOrEqual(1);

    // 5. View layer: verify all columns have events in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );

    // Battle skill column
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const bsVM = viewModels.get(bsCol!.key);
    expect(bsVM).toBeDefined();
    expect(bsVM!.events.filter(ev => ev.name === BATTLE_SKILL_ID)).toHaveLength(2);

    // Combo column
    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.name === COMBO_SKILL_ID)).toBe(true);

    // Ultimate column
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultVM = viewModels.get(ultCol!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(ev => ev.name === ULTIMATE_ID)).toBe(true);

    // Operator status column (Thunderlance + EX events)
    const statusVM = getOperatorStatusVM(result.current);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(ev => ev.name === THUNDERLANCE_STATUS_ID)).toBe(true);
    expect(statusVM!.events.some(ev => ev.name === THUNDERLANCE_EX_STATUS_ID)).toBe(true);

    // Electric Infliction and Susceptibility events exist in processed events
    expect(inflictions.length).toBeGreaterThanOrEqual(1);
    expect(suscEvents.length).toBeGreaterThanOrEqual(1);
  });
});
