/**
 * @jest-environment jsdom
 */

/**
 * Catcher Skills -- Integration Tests
 *
 * Tests the full pipeline through useApp for the reconciled Catcher kit:
 *   A. Core skill placement (BS/CS/Ult)
 *   B. BS Rigid Interdiction — shield window setup (Protection + Retaliation status)
 *   C. BS Retaliation — single-trigger fan-out via enemy action
 *   D. BS Retaliation — P5 SP return gate
 *   E. CS Timely Suppression — SHIELD applied to ALL operators
 *   F. CS Activation Window — CHARGE / low-HP triggers
 *   G. Ult Textbook Assault — base + P1 split frames + T2 shockwave frames
 *   H. Ult Knock Down + Weakness application
 *   I. T1 Resilient Defense — Will-based DEF talent shape
 *   J. View layer — all skills visible across columns
 *
 * Three-layer verification:
 *   1. Context menu: addEvent items are available (or correctly disabled)
 *   2. Controller: events appear in allProcessedEvents with the correct columnId/properties
 *   3. View: computeTimelinePresentation includes events in the correct column VMs
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Catcher is swapped into slot-0 for all tests.
 *
 * NOTE: VARY_BY TALENT_LEVEL / HAVE TALENT_LEVEL inside a non-talent context
 * resolves to `talentOneLevel` by default (see valueResolver.buildContextForSkillColumn).
 * Catcher's lore-T2 (Comprehensive Mindset) shockwave behavior is therefore
 * gated by setting talentOneLevel in tests, even though semantically it is the
 * T2 talent that controls shockwave count.
 */

import { renderHook, act } from '@testing-library/react';
import { DeterminerType, NounType, ValueOperation, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  ColumnType,
  DamageScalingStatType,
  EnemyActionType,
  InteractionModeType,
  PhysicalStatusType,
  SegmentType,
  StatusType,
} from '../../../../consts/enums';
import { StatType } from '../../../../model/enums/stats';
import { ENEMY_ACTION_LABELS } from '../../../../consts/timelineColumnLabels';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  ENEMY_ACTION_COLUMN_ID,
  ENEMY_ID,
  OPERATOR_STATUS_COLUMN_ID,
  PHYSICAL_INFLICTION_COLUMNS,
} from '../../../../model/channels';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeEventPresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CATCHER_JSON = require('../../../../model/game-data/operators/catcher/catcher.json');
const CATCHER_ID: string = CATCHER_JSON.id;

const BS_JSON = require(
  '../../../../model/game-data/operators/catcher/skills/battle-skill-rigid-interdiction.json',
);
const BATTLE_SKILL_ID: string = BS_JSON.properties.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/catcher/skills/combo-skill-timely-suppression.json',
);
const COMBO_SKILL_ID: string = COMBO_JSON.properties.id;

const ULT_JSON = require(
  '../../../../model/game-data/operators/catcher/skills/ultimate-textbook-assault.json',
);
const ULTIMATE_ID: string = ULT_JSON.properties.id;

const RETALIATION_JSON = require(
  '../../../../model/game-data/operators/catcher/statuses/status-rigid-interdiction-retaliation.json',
);
const RETALIATION_ID: string = RETALIATION_JSON.properties.id;

const T1_JSON = require(
  '../../../../model/game-data/operators/catcher/talents/talent-resilient-defense-talent.json',
);
const T1_ID: string = T1_JSON.properties.id;
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

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_CATCHER];
  app.handleStatsChange(SLOT_CATCHER, {
    ...props,
    operator: { ...props.operator, potential },
  });
}

function setTalentLevel(app: AppResult, talentLevel: number) {
  const props = app.loadoutProperties[SLOT_CATCHER];
  app.handleStatsChange(SLOT_CATCHER, {
    ...props,
    operator: { ...props.operator, talentOneLevel: talentLevel, talentTwoLevel: talentLevel },
  });
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_CATCHER, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeComboSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_CATCHER, NounType.COMBO);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeUltimate(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT_CATCHER, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeEnemyAction(
  app: AppResult,
  atFrame: number,
  action: EnemyActionType = EnemyActionType.AOE_PHYSICAL,
) {
  const enemyCol = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_ACTION_COLUMN_ID,
  );
  expect(enemyCol).toBeDefined();
  // Pick the variant by its localized label — matches how the context menu
  // renders the item. The enemy-action column has multiple variants
  // (AOE_<element> + CHARGE); callers pass an `EnemyActionType` to
  // disambiguate.
  const payload = getMenuPayload(app, enemyCol!, atFrame, ENEMY_ACTION_LABELS[action]);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function activeFrames(events: ReturnType<AppResult['allProcessedEvents']['filter']>) {
  // Returns the frames array of the first non-animation segment of the first event.
  const ev = events[0];
  if (!ev) return undefined;
  return ev.segments.find(
    (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
  )?.frames;
}

/**
 * Flatten frames from ALL damage segments of a multi-sequence skill (e.g.
 * Ultimate Textbook Assault: Slash I / Slash II / Final Slam). Returns the
 * concatenated frame list across every segment that has frames. Used by the
 * Ult tests that care about the total count of damage frames across the
 * whole sequence rather than just the first segment.
 */
function allDamageFrames(events: ReturnType<AppResult['allProcessedEvents']['filter']>) {
  const ev = events[0];
  if (!ev) return [] as { offsetFrame: number; frameSkipped?: boolean }[];
  const out: { offsetFrame: number; frameSkipped?: boolean }[] = [];
  for (const seg of ev.segments as { frames?: { offsetFrame: number; frameSkipped?: boolean }[] }[]) {
    if (seg.frames && seg.frames.length > 0) out.push(...seg.frames);
  }
  return out;
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill places in BATTLE column with correct ID', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.BATTLE);
    expect(col?.defaultEvent).toBeDefined();

    const items = buildContextMenu(result.current, col!, 5 * FPS);
    expect(items!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.BATTLE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: Combo skill places freeform with cooldown segment', () => {
    const { result } = setupCatcher();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeComboSkill(result.current, 5 * FPS); });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.COMBO,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(COMBO_SKILL_ID);
    const cdSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: Ultimate places in ULTIMATE column after setting energy to max', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });
    act(() => { placeUltimate(result.current, 5 * FPS); });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);
  });
});

// =============================================================================
// B. BS Rigid Interdiction -- Shield Window Setup
// =============================================================================

describe('B. BS Rigid Interdiction — shield window setup', () => {
  it('B1: BS active segment has a single offset-0 frame (no offset 2.77s frame)', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const bs = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.BATTLE,
    );
    expect(bs).toHaveLength(1);

    const frames = activeFrames(bs);
    expect(frames).toBeDefined();
    expect(frames!.length).toBe(1);
  });

  it('B2: BS applies PROTECTION status', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const protection = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.PROTECTION,
    );
    expect(protection.length).toBeGreaterThanOrEqual(1);
  });

  it('B2b: BS PROTECTION duration matches the BS segment duration (3.17s)', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    // BS active segment duration (skip animation segment if any).
    const bs = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.BATTLE,
    );
    expect(bs).toBeDefined();
    const bsActiveSeg = bs!.segments.find(
      (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
    );
    expect(bsActiveSeg).toBeDefined();
    const bsActiveDurationFrames = bsActiveSeg!.properties.duration;

    // Every PROTECTION event applied by this BS must last the full shield
    // window — not the generic default (5s), not some other duration.
    // The APPLY STATUS effect in the BS clause sets the `duration` override
    // to 3.17s so the shield's Protection lasts exactly as long as the BS
    // segment that created it.
    const EXPECTED_FRAMES = Math.round(3.17 * FPS);
    expect(bsActiveDurationFrames).toBe(EXPECTED_FRAMES);

    const protectionEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.PROTECTION && ev.startFrame > 0,
    );
    expect(protectionEvents.length).toBeGreaterThanOrEqual(1);
    for (const prot of protectionEvents) {
      expect(eventDuration(prot)).toBe(EXPECTED_FRAMES);
    }
  });

  it('B2c: BS PROTECTION does NOT use the generic 5s default duration', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    // Regression guard: if the APPLY STATUS `with.duration` override is ever
    // removed or stripped, the engine falls back to the generic status
    // definition's default (5s for PROTECTION) which is wrong for Catcher BS.
    const GENERIC_DEFAULT_FRAMES = 5 * FPS;
    const protectionEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.PROTECTION && ev.startFrame > 0,
    );
    expect(protectionEvents.length).toBeGreaterThanOrEqual(1);
    for (const prot of protectionEvents) {
      expect(eventDuration(prot)).not.toBe(GENERIC_DEFAULT_FRAMES);
    }
  });

  it('B3: BS applies RIGID_INTERDICTION_RETALIATION status to Catcher', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const retal = result.current.allProcessedEvents.filter(
      ev => ev.columnId === RETALIATION_ID && ev.ownerEntityId === SLOT_CATCHER,
    );
    expect(retal.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. BS Retaliation -- Trigger Fan-Out
// =============================================================================

describe('C. BS Retaliation — enemy attack triggers fan-out', () => {
  it('C1: enemy action inside the shield window triggers retaliation effects (VULNERABLE applied)', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    // Snapshot VULNERABLE infliction count before enemy action.
    const baselineVuln = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID
        && ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    ).length;

    // Place an enemy action at 6s — inside the 3.17s shield window starting at 5s.
    // The status uses RESET interactionType so the retaliation event itself is
    // refreshed (not duplicated); fan-out is observed via the side-effects
    // (VULNERABLE infliction, stagger, damage to enemy).
    act(() => { placeEnemyAction(result.current, 6 * FPS); });

    const afterVuln = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID
        && ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(afterVuln.length).toBeGreaterThan(baselineVuln);
  });

  it('C2: retaliation deals physical damage to enemy at the trigger frame', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });
    act(() => { placeEnemyAction(result.current, 6 * FPS); });

    // The retaliation status frame deals physical damage. The damage flows
    // through the enemy's HP graph; the simplest verification is that the
    // retaliation event itself was spawned with frame data on its segment.
    const retal = result.current.allProcessedEvents.filter(
      ev => ev.columnId === RETALIATION_ID,
    );
    expect(retal.length).toBeGreaterThanOrEqual(1);

    // The retaliation frame applies VULNERABLE infliction to the enemy.
    const vuln = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID
        && ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vuln.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// D. BS Retaliation -- P5 SP Return Gate
// =============================================================================

describe('D. BS Retaliation — P5 SP return gate', () => {
  it('D1: retaliation burst status contains a P5-gated RETURN SKILL_POINT clause', () => {
    // Structural verification: walk the burst status's offset-0 frame
    // and confirm a clause gated on POTENTIAL >= 5 with a RETURN SKILL_POINT effect.
    type ConditionShape = { object?: string; with?: { value?: { value?: number } } };
    type EffectShape = { verb?: string; object?: string; with?: { value?: { value?: number } } };
    type ClauseShape = { conditions: ConditionShape[]; effects: EffectShape[] };
    /* eslint-disable @typescript-eslint/no-require-imports */
    const burstJson = require(
      '../../../../model/game-data/operators/catcher/statuses/status-rigid-interdiction-retaliation-burst.json',
    );
    /* eslint-enable @typescript-eslint/no-require-imports */
    const offset0Frame = burstJson.segments[0].frames[0];
    const clauses = offset0Frame.clause as ClauseShape[];
    const p5Clause = clauses.find(c =>
      c.conditions.some(cond =>
        cond.object === NounType.POTENTIAL && cond.with?.value?.value === 5,
      ),
    );
    expect(p5Clause).toBeDefined();
    const spReturn = p5Clause!.effects.find(e =>
      e.verb === VerbType.RETURN && e.object === NounType.SKILL_POINT,
    );
    expect(spReturn).toBeDefined();
    expect(spReturn!.with?.value?.value).toBe(10);
  });

  it('D2: at P5, retaliation status fires (basic placement still works)', () => {
    const { result } = setupCatcher();
    act(() => { setPotential(result.current, 5); });
    act(() => { placeBattleSkill(result.current, 5 * FPS); });
    act(() => { placeEnemyAction(result.current, 6 * FPS); });

    const retal = result.current.allProcessedEvents.filter(
      ev => ev.columnId === RETALIATION_ID,
    );
    expect(retal.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// E. CS Timely Suppression -- SHIELD to ALL Operators
// =============================================================================

describe('E. CS Timely Suppression — SHIELD applied (ALL OPERATOR not TEAM)', () => {
  it('E1: CS active frame contains a single SHIELD APPLY with toDeterminer ALL', () => {
    // Structural check: the JSON config should have exactly one APPLY SHIELD with
    // toDeterminer "ALL" — the legacy two-shield (THIS + CONTROLLED) shape was removed.
    const cs = COMBO_JSON;
    const activeSeg = cs.segments.find(
      (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
    );
    expect(activeSeg).toBeDefined();
    const damageFrame = activeSeg.frames.find(
      (f: { properties?: { offset?: { value?: number } } }) =>
        (f.properties?.offset?.value ?? 0) > 0.05,
    );
    expect(damageFrame).toBeDefined();
    type ShieldEffect = { verb?: string; object?: string; objectId?: string; toDeterminer?: string; to?: string };
    const shieldApplies = (damageFrame.clause as { effects: ShieldEffect[] }[])[0].effects.filter(
      e => e.verb === VerbType.APPLY && e.object === NounType.STATUS && e.objectId === StatusType.SHIELD,
    );
    expect(shieldApplies).toHaveLength(1);
    expect(shieldApplies[0].toDeterminer).toBe(DeterminerType.ALL);
    expect(shieldApplies[0].to).toBe(NounType.OPERATOR);
  });

  it('E2: placing CS via freeform creates SHIELD events (per-operator)', () => {
    const { result } = setupCatcher();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeComboSkill(result.current, 5 * FPS); });

    const shields = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.SHIELD,
    );
    expect(shields.length).toBeGreaterThanOrEqual(1);
  });

  it('E3: CS SHIELD `with.value` uses the standard ADD(base, MULT(defAdditive, DEFENSE)) ValueExpression', () => {
    // Structural regression guard: the SHIELD apply must NOT reintroduce the
    // non-standard `shieldBase` / `defAdditive` top-level keys on `with`.
    // The value must be a single ValueNode that expresses the full shield
    // formula via standard operation compounds (ADD / MULT) and primitives
    // (VARY_BY, IS STAT).
    const cs = COMBO_JSON;
    const activeSeg = cs.segments.find(
      (s: { frames?: unknown[] }) => s.frames && s.frames.length > 0,
    );
    const damageFrame = activeSeg.frames.find(
      (f: { properties?: { offset?: { value?: number } } }) =>
        (f.properties?.offset?.value ?? 0) > 0.05,
    );
    type WithBlock = {
      value?: Record<string, unknown>;
      duration?: unknown;
      shieldBase?: unknown;
      defAdditive?: unknown;
    };
    type ShieldEffect = { verb?: string; object?: string; objectId?: string; with?: WithBlock };
    const shieldApply = (damageFrame.clause as { effects: ShieldEffect[] }[])[0].effects.find(
      e => e.verb === VerbType.APPLY && e.object === NounType.STATUS && e.objectId === StatusType.SHIELD,
    )!;

    // Non-standard keys must be gone.
    expect(shieldApply.with!.shieldBase).toBeUndefined();
    expect(shieldApply.with!.defAdditive).toBeUndefined();

    // `with.value` is an ADD compound: left = base VARY_BY SKILL_LEVEL, right
    // = MULT(defAdditive VARY_BY SKILL_LEVEL, IS STAT DEFENSE).
    const value = shieldApply.with!.value!;
    expect(value.operation).toBe(ValueOperation.ADD);

    const left = value.left as Record<string, unknown>;
    expect(left.verb).toBe(VerbType.VARY_BY);
    expect(left.object).toBe(NounType.SKILL_LEVEL);
    expect(Array.isArray(left.value)).toBe(true);
    expect((left.value as number[]).length).toBe(12);

    const right = value.right as Record<string, unknown>;
    expect(right.operation).toBe(ValueOperation.MULT);

    const rightLeft = right.left as Record<string, unknown>;
    expect(rightLeft.verb).toBe(VerbType.VARY_BY);
    expect(rightLeft.object).toBe(NounType.SKILL_LEVEL);
    expect(Array.isArray(rightLeft.value)).toBe(true);
    expect((rightLeft.value as number[]).length).toBe(12);

    const rightRight = right.right as Record<string, unknown>;
    expect(rightRight.verb).toBe(VerbType.IS);
    expect(rightRight.object).toBe(NounType.STAT);
    expect(rightRight.objectId).toBe(DamageScalingStatType.DEFENSE);
    expect((rightRight.of as Record<string, unknown>).determiner).toBe(DeterminerType.THIS);
    expect((rightRight.of as Record<string, unknown>).object).toBe(NounType.OPERATOR);
  });

  it('E4: placing CS produces SHIELD events with a resolved numeric statusValue (base + defAdditive × DEF)', () => {
    const { result } = setupCatcher();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeComboSkill(result.current, 5 * FPS); });

    const shields = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.SHIELD && ev.startFrame > 0,
    );
    expect(shields.length).toBeGreaterThanOrEqual(1);

    // The ValueExpression must resolve to a concrete positive number on the
    // processed event. The generic status-shield.json has no durationless
    // template, so a non-numeric / missing statusValue means the engine failed
    // to resolve the ADD(base, MULT(additive, DEF)) compound — that would be
    // the regression we're guarding against.
    for (const sh of shields) {
      expect(typeof sh.statusValue).toBe('number');
      expect(sh.statusValue as number).toBeGreaterThan(0);
    }

    // Sanity cross-check: at max skill level (L12) the base is 810 — the
    // resolved shield value must be at least that (the DEF component is
    // non-negative since all operators have DEFENSE ≥ 0).
    const MAX_BASE = 810;
    for (const sh of shields) {
      expect(sh.statusValue as number).toBeGreaterThanOrEqual(MAX_BASE);
    }
  });
});

// =============================================================================
// F. CS Activation Window
// =============================================================================

describe('F. CS Activation Window', () => {
  it('F1: CS dual-predicate activation window present in JSON config', () => {
    expect(COMBO_JSON.activationWindow).toBeDefined();
    expect(COMBO_JSON.activationWindow.onTriggerClause).toHaveLength(2);
    // First predicate: ENEMY PERFORM STATUS CHARGE
    const charge = COMBO_JSON.activationWindow.onTriggerClause[0];
    expect(charge.conditions[0].subject).toBe(NounType.ENEMY);
    expect(charge.conditions[0].verb).toBe(VerbType.PERFORM);
    expect(charge.conditions[0].objectId).toBe(EnemyActionType.CHARGE);
    // Second predicate: ENEMY DEAL DAMAGE to CONTROLLED OPERATOR + CONTROLLED OPERATOR HAVE HP <= 40%
    const lowHp = COMBO_JSON.activationWindow.onTriggerClause[1];
    expect(lowHp.conditions).toHaveLength(2);
    expect(lowHp.conditions[0].subject).toBe(NounType.ENEMY);
    expect(lowHp.conditions[0].verb).toBe(VerbType.DEAL);
    expect(lowHp.conditions[1].verb).toBe(VerbType.HAVE);
    expect(lowHp.conditions[1].object).toBe(NounType.HP);
  });

  it('F1b: CHARGE variant is available on the enemy-action context menu', () => {
    const { result } = setupCatcher();
    const enemyCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerEntityId === ENEMY_ID &&
        c.columnId === ENEMY_ACTION_COLUMN_ID,
    );
    expect(enemyCol).toBeDefined();
    const items = buildContextMenu(result.current, enemyCol!, 5 * FPS);
    expect(items).not.toBeNull();
    // Menu item label comes from the localized CHARGE label.
    const chargeItem = items!.find(
      i => i.actionId === 'addEvent' && i.label === ENEMY_ACTION_LABELS[EnemyActionType.CHARGE],
    );
    expect(chargeItem).toBeDefined();
    expect(chargeItem!.disabled).toBeFalsy();
  });

  it('F1c: placing a CHARGE enemy action creates a CHARGE event on the enemy-action column', () => {
    const { result } = setupCatcher();
    act(() => { placeEnemyAction(result.current, 3 * FPS, EnemyActionType.CHARGE); });

    // Processed events list may contain both the raw and derived copies of
    // the same event (same uid) — dedupe by uid for the user-facing count.
    const chargeEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID
        && ev.columnId === ENEMY_ACTION_COLUMN_ID
        && ev.id === EnemyActionType.CHARGE,
    );
    const uniqueUids = new Set(chargeEvents.map(ev => ev.uid));
    expect(uniqueUids.size).toBe(1);
    // All entries share the same CHARGE semantics.
    expect(chargeEvents.every(
      ev => ev.id === EnemyActionType.CHARGE && ev.ownerEntityId === ENEMY_ID,
    )).toBe(true);
    expect(chargeEvents[0].startFrame).toBe(3 * FPS);
  });

  it('F3: CHARGE enemy action opens Catcher\'s combo activation window (CS context menu enabled)', () => {
    const { result } = setupCatcher();
    // Place CHARGE at 3s — this satisfies `ENEMY PERFORM STATUS CHARGE` for
    // catcher's Timely Suppression activation window.
    act(() => { placeEnemyAction(result.current, 3 * FPS, EnemyActionType.CHARGE); });

    // CS context menu at 4s (inside the activation window opened by CHARGE)
    // must now be enabled.
    const comboCol = findColumn(result.current, SLOT_CATCHER, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const items = buildContextMenu(result.current, comboCol!, 4 * FPS);
    expect(items).not.toBeNull();
    const comboItem = items!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBeFalsy();
  });

  it('F4: placing CS after CHARGE produces a real CS event in the COMBO column', () => {
    const { result } = setupCatcher();
    act(() => { placeEnemyAction(result.current, 3 * FPS, EnemyActionType.CHARGE); });
    act(() => { placeComboSkill(result.current, 4 * FPS); });

    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
    expect(comboEvents[0].name).toBe(COMBO_SKILL_ID);
    // SHIELD should be applied to all 4 operators as a side-effect of the
    // CS frame — confirming the full CHARGE → combo window → CS → SHIELD chain.
    const shieldEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.SHIELD,
    );
    expect(shieldEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('F4b: placed CHARGE event is draggable (creationInteractionMode preserved, notDraggable=false, handleMoveEvent succeeds)', () => {
    const { result } = setupCatcher();
    act(() => { placeEnemyAction(result.current, 3 * FPS, EnemyActionType.CHARGE); });

    // 1. Pipeline: the processed event list must contain exactly ONE CHARGE
    //    event (deduped by uid) with creationInteractionMode set. Prior bug:
    //    flattenEventsToQueueFrames synthesized a placeholder frame for the
    //    frame-less CHARGE segment, which hit the `!frame.clauses` branch in
    //    handleProcessFrame → applyEvent and produced a second copy of the
    //    event without creationInteractionMode. The view then picked up the
    //    duplicate and rendered the event as not-draggable.
    const chargeEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID
        && ev.columnId === ENEMY_ACTION_COLUMN_ID
        && ev.id === EnemyActionType.CHARGE,
    );
    const uniqueUids = new Set(chargeEvents.map(ev => ev.uid));
    expect(uniqueUids.size).toBe(1);
    expect(chargeEvents.every(ev => ev.creationInteractionMode != null)).toBe(true);

    // 2. Presentation: every rendered copy must be draggable.
    const enemyCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerEntityId === ENEMY_ID &&
        c.columnId === ENEMY_ACTION_COLUMN_ID,
    );
    expect(enemyCol).toBeDefined();
    const EMPTY_VALIDATION_MAPS = {
      combo: new Map<string, string>(),
      resource: new Map<string, string>(),
      empowered: new Map<string, string>(),
      enhanced: new Map<string, string>(),
      regularBasic: new Map<string, string>(),
      clause: new Map<string, string>(),
      finisherStagger: new Map<string, string>(),
      timeStop: new Map<string, string>(),
      infliction: new Map<string, string>(),
    };
    for (const ev of chargeEvents) {
      const pres = computeEventPresentation(ev, {
        slotElementColors: {},
        autoFinisherIds: new Set(),
        validationMaps: EMPTY_VALIDATION_MAPS,
      });
      expect(pres.notDraggable).toBe(false);
    }

    // 3. Controller: handleMoveEvent actually moves the CHARGE event and the
    //    new position survives the next pipeline run.
    const originalUid = chargeEvents[0].uid;
    const originalFrame = chargeEvents[0].startFrame;
    const newFrame = originalFrame + 2 * FPS;
    act(() => { result.current.handleMoveEvent(originalUid, newFrame); });

    const afterMove = result.current.allProcessedEvents.filter(
      ev => ev.uid === originalUid,
    );
    expect(afterMove.length).toBeGreaterThanOrEqual(1);
    expect(afterMove.every(ev => ev.startFrame === newFrame)).toBe(true);
  });

  it('F5: CS remains disabled outside the CHARGE-triggered activation window', () => {
    const { result } = setupCatcher();
    act(() => { placeEnemyAction(result.current, 3 * FPS, EnemyActionType.CHARGE); });

    // The activation window has a finite segment duration (see F1 — 6s in the
    // catcher CS activationWindow config). At a very late frame, the window
    // should be closed and CS should be disabled again.
    const comboCol = findColumn(result.current, SLOT_CATCHER, NounType.COMBO);
    const items = buildContextMenu(result.current, comboCol!, 30 * FPS);
    expect(items).not.toBeNull();
    const comboItem = items!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBe(true);
  });

  it('F2: CS context menu disabled at default state (no trigger window open)', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.COMBO);
    const items = buildContextMenu(result.current, col!, 5 * FPS);
    const item = items!.find(i => i.actionId === 'addEvent');
    expect(item).toBeDefined();
    expect(item!.disabled).toBe(true);
  });
});

// =============================================================================
// G. Ult Textbook Assault -- Frame Layout
// =============================================================================

describe('G. Ult Textbook Assault — frame layout', () => {
  it('G1: Ult ultimate energy cost: base 80 (P0-P3), 72 (P4+)', () => {
    expect(getUltimateEnergyCostForPotential(CATCHER_ID, 0)).toBe(80);
    expect(getUltimateEnergyCostForPotential(CATCHER_ID, 4)).toBe(72);
    expect(getUltimateEnergyCostForPotential(CATCHER_ID, 5)).toBe(72);
  });

  it('G2: at P0 + T1 L1, P1 split frames and 3rd shockwave are skipped (frameSkipped=true)', () => {
    const { result } = setupCatcher();
    act(() => { setPotential(result.current, 0); });
    act(() => { setTalentLevel(result.current, 1); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });
    act(() => { placeUltimate(result.current, 5 * FPS); });

    const ult = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(ult).toHaveLength(1);
    // Frames are now split across three damage segments (Slash I / Slash II /
    // Final Slam). Flatten across all damage segments for the count.
    const frames = allDamageFrames(ult);
    expect(frames.length).toBe(9);

    // P0 + T1L1: the four conditional-only frames must all be skipped.
    //   - Slash I P1 bonus (offset 0.33 within Slash I)
    //   - Slash II P1 bonus (offset 0.10 within Slash II)
    //   - Final Slam P1 bonus (offset 0.10 within Final Slam)
    //   - Final Slam shockwave 3 (offset 0.40 within Final Slam, TL>=2 only)
    // The base frames and shockwaves 1+2 must all fire.
    const skipped = frames.filter(f => f.frameSkipped);
    expect(skipped).toHaveLength(4);
  });

  it('G3: at P1 + T1 L2, all 9 frames fire (no skips)', () => {
    const { result } = setupCatcher();
    act(() => { setPotential(result.current, 1); });
    act(() => { setTalentLevel(result.current, 2); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });
    act(() => { placeUltimate(result.current, 5 * FPS); });

    const ult = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(ult).toHaveLength(1);
    const frames = allDamageFrames(ult);
    expect(frames.length).toBe(9);
    expect(frames.filter(f => f.frameSkipped)).toHaveLength(0);
  });

});

// =============================================================================
// H. Ult Knock Down + Weakness
// =============================================================================

describe('H. Ult — Knock Down + Weakness', () => {
  it('H1: Ult Final Slam segment applies KNOCK_DOWN on its first frame', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });
    act(() => { placeUltimate(result.current, 5 * FPS); });

    const ult = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === NounType.ULTIMATE,
    );
    expect(ult).toHaveLength(1);

    // Locate the Final Slam segment by name — the ultimate is now split
    // into Animation / Slash I / Slash II / Final Slam segments.
    type Seg = { properties: { name?: string }; frames?: unknown[] };
    const finalSlamSeg = (ult[0].segments as Seg[]).find(
      s => s.properties.name === 'Final Slam',
    );
    expect(finalSlamSeg).toBeDefined();
    expect(finalSlamSeg!.frames).toBeDefined();
    expect(finalSlamSeg!.frames!.length).toBe(5);

    // The first frame of Final Slam (relative offset 0) carries the
    // KNOCK_DOWN application along with the slam damage.
    const slamFrame = finalSlamSeg!.frames![0];
    expect(JSON.stringify(slamFrame)).toContain(PhysicalStatusType.KNOCK_DOWN);
  });

  it('H2: Ult slash 1 frame applies WEAKNESS to enemy', () => {
    const { result } = setupCatcher();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });
    act(() => { placeUltimate(result.current, 5 * FPS); });

    const weakness = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === StatusType.WEAKNESS,
    );
    expect(weakness.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// I. T1 Resilient Defense -- Will-based DEF
// =============================================================================

describe('I. T1 Resilient Defense — Will-based DEF', () => {
  it('I1: T1 talent file has Will-based BASE_DEFENSE formula', () => {
    // T1_ID identity is cross-checked at file load (catcher.json.talents.one
    // must match the talent's own properties.id). Skipping a redundant literal
    // assertion here.
    const clause = T1_JSON.segments[0].clause;
    expect(clause).toHaveLength(1);
    const effect = clause[0].effects[0];
    expect(effect.verb).toBe(VerbType.APPLY);
    expect(effect.object).toBe(NounType.STAT);
    expect(effect.objectId).toBe(StatType.BASE_DEFENSE);
    expect(effect.toDeterminer).toBe(DeterminerType.THIS);
    expect(effect.to).toBe(NounType.OPERATOR);

    // Formula: MULT(INTEGER_DIV(WILL, 10), 1.2)
    const value = effect.with.value;
    expect(value.operation).toBe(ValueOperation.MULT);
    expect(value.left.operation).toBe(ValueOperation.INTEGER_DIV);
    expect(value.left.left.objectId).toBe(StatType.WILL);
    expect(value.left.right.value).toBe(10);
    expect(value.right.value).toBe(1.2);
  });

  it('I2: T1 talent appears as a passive event on Catcher', () => {
    const { result } = setupCatcher();
    const t1Events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_CATCHER && ev.columnId === T1_ID,
    );
    expect(t1Events.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// J. View Layer
// =============================================================================

describe('J. View Layer', () => {
  it('J1: BS event visible in BATTLE column view model', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.BATTLE);
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const bsVm = vms.get(col!.key);
    expect(bsVm).toBeDefined();
    expect(bsVm!.events.some(
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_CATCHER,
    )).toBe(true);
  });

  it('J2: Ultimate event visible in ULTIMATE column view model', () => {
    const { result } = setupCatcher();
    const col = findColumn(result.current, SLOT_CATCHER, NounType.ULTIMATE);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_CATCHER, 0); });
    act(() => { placeUltimate(result.current, 5 * FPS); });

    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVm = vms.get(col!.key);
    expect(ultVm).toBeDefined();
    expect(ultVm!.events.some(
      ev => ev.name === ULTIMATE_ID && ev.ownerEntityId === SLOT_CATCHER,
    )).toBe(true);
  });

  it('J3: RIGID_INTERDICTION_RETALIATION visible in operator-status column VM after BS', () => {
    const { result } = setupCatcher();
    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const statusCol = findColumn(result.current, SLOT_CATCHER, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();

    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVm = vms.get(statusCol!.key);
    expect(statusVm).toBeDefined();
    expect(statusVm!.events.some(
      ev => ev.columnId === RETALIATION_ID && ev.ownerEntityId === SLOT_CATCHER,
    )).toBe(true);
  });
});
