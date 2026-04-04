/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Cryoblasting Pistolier (Ultimate) Integration Tests
 *
 * Verifies:
 *   1. JSON structure: UE cost, segments, ENABLE/DISABLE on active segment
 *   2. Single frame at offset 7s with two clauses (unconditional + Solidified)
 *   3. CONSUME EBATK + PERFORM FINAL_STRIKE on unconditional clause
 *   4. CONSUME SOLIDIFICATION on conditional clause
 *   5. ENABLE/DISABLE gating: EBATK enabled, normal BATK + Finisher disabled during active
 *   6. Pipeline: ult placement, segment count, energy cost
 *   7. Enhanced BATK available during ult, unavailable outside
 */

import { renderHook, act } from '@testing-library/react';
import {
  NounType, VerbType, AdjectiveType,
} from '../../../../dsl/semantics';
import { CombatSkillType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { getUltimateEnergyCost } from '../../../../controller/operators/operatorRegistry';
import { findColumn, getMenuPayload, buildContextMenu, setUltimateEnergyToMax } from '../../helpers';
import { checkVariantAvailability } from '../../../../controller/timeline/eventValidator';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
const ULT_JSON = require('../../../../model/game-data/operators/yvonne/skills/ultimate-cryoblasting-pistolier.json');
const ULT_ID: string = ULT_JSON.properties.id;
const EBATK_ID: string = require('../../../../model/game-data/operators/yvonne/skills/basic-attack-batk-exuberant-trigger-empowered.json').properties.id;
const BATK_ID: string = require('../../../../model/game-data/operators/yvonne/skills/basic-attack-batk-exuberant-trigger.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function addUlt(app: AppResult, atFrame: number) {
  act(() => { setUltimateEnergyToMax(app, SLOT, 0); });
  const col = findColumn(app, SLOT, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

// =============================================================================
// A. JSON Structure
// =============================================================================

describe('A. Ultimate JSON structure', () => {
  it('A1: UE cost is 220', () => {
    expect(getUltimateEnergyCost(YVONNE_ID)).toBe(220);
  });

  it('A2: has 2 segments (animation + active)', () => {
    expect(ULT_JSON.segments).toHaveLength(2);
  });

  it('A3: animation segment is 2.03s TIME_STOP', () => {
    const anim = ULT_JSON.segments[0];
    expect(anim.properties.duration.value.value).toBe(2.03);
    expect(anim.properties.timeInteractionType).toBe('TIME_STOP');
  });

  it('A4: active segment is 7s', () => {
    const active = ULT_JSON.segments[1];
    expect(active.properties.duration.value.value).toBe(7);
  });

  it('A5: animation segment has no clause (ENABLE/DISABLE moved to active)', () => {
    expect(ULT_JSON.segments[0].clause).toBeUndefined();
  });
});

// =============================================================================
// B. ENABLE/DISABLE on Active Segment
// =============================================================================

describe('B. ENABLE/DISABLE on active segment', () => {
  const activeClause = ULT_JSON.segments[1].clause[0];

  it('B1: active segment has clause with ENABLE/DISABLE effects', () => {
    expect(activeClause).toBeDefined();
    expect(activeClause.conditions).toEqual([]);
  });

  it('B2: ENABLE EBATK', () => {
    const enable = activeClause.effects.find((e: { verb: string; objectId: string }) =>
      e.verb === VerbType.ENABLE && e.objectId === EBATK_ID,
    );
    expect(enable).toBeDefined();
    expect(enable.object).toBe(NounType.BATK);
  });

  it('B3: DISABLE normal BATK', () => {
    const disable = activeClause.effects.find((e: { verb: string; objectId: string }) =>
      e.verb === VerbType.DISABLE && e.objectId === BATK_ID,
    );
    expect(disable).toBeDefined();
    expect(disable.object).toBe(NounType.BATK);
  });

  it('B4: DISABLE Finisher', () => {
    const disable = activeClause.effects.find((e: { verb: string; objectId: string }) =>
      e.verb === VerbType.DISABLE && e.objectId === CombatSkillType.FINISHER,
    );
    expect(disable).toBeDefined();
  });
});

// =============================================================================
// C. Frame Structure — Single Frame at 7s
// =============================================================================

describe('C. Frame at offset 7s', () => {
  const frame = ULT_JSON.segments[1].frames[0];

  it('C1: active segment has exactly 1 frame', () => {
    expect(ULT_JSON.segments[1].frames).toHaveLength(1);
  });

  it('C2: frame offset is 7s', () => {
    expect(frame.properties.offset.value).toBe(7);
  });

  it('C3: frame has 2 clauses (unconditional + Solidified)', () => {
    expect(frame.clause).toHaveLength(2);
  });

  it('C4: clause 1 is unconditional with CONSUME EBATK, DEAL DAMAGE, STAGGER, FINAL_STRIKE', () => {
    const clause = frame.clause[0];
    expect(clause.conditions).toEqual([]);
    const verbs = clause.effects.map((e: { verb: string }) => e.verb);
    expect(verbs).toContain(VerbType.CONSUME);
    expect(verbs).toContain(VerbType.DEAL);
    expect(verbs).toContain(VerbType.PERFORM);
  });

  it('C5: CONSUME targets BASIC_ATTACK BATK EXUBERANT_TRIGGER_EMPOWERED', () => {
    const consume = frame.clause[0].effects.find((e: { verb: string }) => e.verb === VerbType.CONSUME);
    expect(consume.object).toBe(NounType.BASIC_ATTACK);
    expect(consume.objectId).toBe(NounType.BATK);
    expect(consume.objectQualifier).toBe(EBATK_ID);
  });

  it('C6: Enhanced Final Strike damage at L1=1.33, L12=3.0', () => {
    const dmg = frame.clause[0].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dmg.with.value.value[0]).toBe(1.33);
    expect(dmg.with.value.value[11]).toBe(3);
  });

  it('C7: Enhanced Final Strike stagger is 20', () => {
    const stagger = frame.clause[0].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
    );
    expect(stagger.with.value.value).toBe(20);
  });

  it('C8: PERFORM FINAL_STRIKE present', () => {
    const perform = frame.clause[0].effects.find((e: { verb: string }) => e.verb === VerbType.PERFORM);
    expect(perform.object).toBe(NounType.FINAL_STRIKE);
  });

  it('C9: clause 2 conditions on ENEMY HAVE STATUS REACTION SOLIDIFICATION', () => {
    const cond = frame.clause[1].conditions[0];
    expect(cond.subject).toBe(NounType.ENEMY);
    expect(cond.verb).toBe(VerbType.HAVE);
    expect(cond.object).toBe(NounType.STATUS);
    expect(cond.objectId).toBe(NounType.REACTION);
    expect(cond.objectQualifier).toBe(AdjectiveType.SOLIDIFICATION);
  });

  it('C10: Solidified additional attack damage at L1=2.67, L12=6.0', () => {
    const dmg = frame.clause[1].effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dmg.with.value.value[0]).toBe(2.67);
    expect(dmg.with.value.value[11]).toBe(6);
  });

  it('C11: Solidified clause CONSUME SOLIDIFICATION from ENEMY', () => {
    const consume = frame.clause[1].effects.find((e: { verb: string }) => e.verb === VerbType.CONSUME);
    expect(consume.object).toBe(NounType.REACTION);
    expect(consume.objectId).toBe(AdjectiveType.SOLIDIFICATION);
  });
});

// =============================================================================
// D. Pipeline — Ult Placement and EBATK Gating
// =============================================================================

describe('D. Pipeline placement and EBATK gating', () => {
  it('D1: ult places in pipeline with correct ID', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);
    expect(ults[0].name).toBe(ULT_ID);
  });

  it('D2: ult has 2 segments', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    expect(ult.segments).toHaveLength(2);
  });

  it('D3: during ult active phase, EBATK is available (ENABLE)', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    // Ult animation = 2.03s TIME_STOP, active starts at 5s + animation
    // Check mid-active phase
    const activeStart = 5 * FPS + Math.round(2.03 * FPS);
    const midActive = activeStart + 2 * FPS;

    const availability = checkVariantAvailability(
      EBATK_ID, SLOT, result.current.allProcessedEvents, midActive,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(availability.disabled).toBe(false);
  });

  it('D4: during ult active phase, normal BATK is disabled (variant check)', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const activeStart = 5 * FPS + Math.round(2.03 * FPS);
    const midActive = activeStart + 2 * FPS;

    const availability = checkVariantAvailability(
      BATK_ID, SLOT, result.current.allProcessedEvents, midActive,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(availability.disabled).toBe(true);
  });

  it('D5: outside ult, EBATK is not available', () => {
    const { result } = setup();

    const availability = checkVariantAvailability(
      EBATK_ID, SLOT, result.current.allProcessedEvents, 2 * FPS,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(availability.disabled).toBe(true);
  });

  it('D6: ult frame data includes CONSUME BASIC_ATTACK BATK EXUBERANT_TRIGGER_EMPOWERED', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const activeFrames = ult.segments[1].frames ?? [];
    expect(activeFrames.length).toBe(1);
    const frame = activeFrames[0];
    expect(frame.clauses).toBeDefined();
    const allEffects = frame.clauses!.flatMap(c => c.effects);
    const consumeEffect = allEffects.find(
      e => e.dslEffect?.verb === VerbType.CONSUME
        && e.dslEffect?.object === NounType.BASIC_ATTACK
        && e.dslEffect?.objectQualifier === EBATK_ID,
    );
    expect(consumeEffect).toBeDefined();
  });

  it('D6b: ult last frame runtime-consumes the placed EBATK event', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    // Place EBATK during ult active phase
    const activeStart = 5 * FPS + Math.round(2.03 * FPS);
    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menu = buildContextMenu(result.current, col, activeStart);
    const ebatkItem = menu!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === EBATK_ID,
    )!;
    const payload = ebatkItem.actionPayload as {
      ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const ebatk = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK && ev.id === EBATK_ID,
    );
    expect(ebatk).toBeDefined();
    expect(ebatk!.eventStatus).toBe(EventStatusType.CONSUMED);
    // Duration should be clamped to the ult frame time (7s from active start)
    const ebatkDuration = ebatk!.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(ebatkDuration).toBeLessThanOrEqual(Math.round(7 * FPS));
  });

  it('D7: EBATK total duration matches ult active segment (7s)', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    // Place EBATK during ult active phase
    const activeStart = 5 * FPS + Math.round(2.03 * FPS);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menu = buildContextMenu(result.current, col, activeStart);
    const ebatkItem = menu!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === EBATK_ID,
    );
    expect(ebatkItem).toBeDefined();

    const payload = ebatkItem!.actionPayload as {
      ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const ebatk = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK && ev.id === EBATK_ID,
    );
    expect(ebatk).toBeDefined();
    const totalDuration = ebatk!.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(Math.round(7 * FPS));
  });
});
