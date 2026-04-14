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
  NounType, VerbType,
} from '../../../../dsl/semantics';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
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
const CRIT_RATE_ID: string = require('../../../../model/game-data/operators/yvonne/statuses/status-crit-stacks.json').properties.id;
const CRIT_DAMAGE_ID: string = require('../../../../model/game-data/operators/yvonne/statuses/status-crit-damage.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

import { REACTION_COLUMNS, ENEMY_ID } from '../../../../model/channels';

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
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
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

  // B2-B4 (ENABLE/DISABLE JSON structure) removed — behavior tested by D3-D5
});

// =============================================================================
// C. Frame Structure — Single Frame at 7s
// =============================================================================

describe('C. Frame at offset 7s', () => {
  const frame = ULT_JSON.segments[1].frames[0];

  // C1, C3, C5, C8, C9 (JSON structure) removed — behavior tested by D pipeline tests

  it('C2: frame offset is 7s', () => {
    expect(frame.properties.offset.value).toBe(7);
  });

  it('C6: Enhanced Final Strike damage at L1=1.33, L12=3.0', () => {
    const clause = frame.clause.find((c: { conditions: unknown[] }) => !c.conditions?.length);
    const dmg = clause.effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dmg.with.value.value[0]).toBe(1.33);
    expect(dmg.with.value.value[11]).toBe(3);
  });

  it('C7: Enhanced Final Strike stagger is 20', () => {
    const clause = frame.clause.find((c: { conditions: unknown[] }) => !c.conditions?.length);
    const stagger = clause.effects.find((e: { verb: string; object: string }) =>
      e.verb === VerbType.DEAL && e.object === NounType.STAGGER,
    );
    expect(stagger.with.value.value).toBe(20);
  });

  // C10 (Solidified clause structure) removed — value correctness tested by pipeline behavior
});

// =============================================================================
// D. Pipeline — Ult Placement and EBATK Gating
// =============================================================================

describe('D. Pipeline placement and EBATK gating', () => {
  it('D1: ult places in pipeline with correct ID', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);
    expect(ults[0].name).toBe(ULT_ID);
  });

  it('D2: ult has 2 segments', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
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

  // D6 (JSON frame structure) removed — behavior tested by D6b

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
      ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const ebatk = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BASIC_ATTACK && ev.id === EBATK_ID,
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
      ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const ebatk = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.BASIC_ATTACK && ev.id === EBATK_ID,
    );
    expect(ebatk).toBeDefined();
    const totalDuration = ebatk!.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(Math.round(7 * FPS));
  });
});

// =============================================================================
// E. Conditional Frame — Solidification clause skipping
// =============================================================================

describe('E. Conditional frame (Solidification) skipping', () => {
  it('E1: without Solidification, the conditional frame is skipped', () => {
    const { result } = setup();
    addUlt(result.current, 0);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    // Active segment (index 1) should have 2 frames
    const activeSeg = ult.segments[1];
    expect(activeSeg.frames).toBeDefined();
    expect(activeSeg.frames!.length).toBe(2);

    // Frame I (unconditional: DEAL DAMAGE + PERFORM FINAL_STRIKE) should NOT be skipped
    expect(activeSeg.frames![0].frameSkipped).toBeFalsy();

    // Frame II (conditional: requires Solidification) SHOULD be skipped
    expect(activeSeg.frames![1].frameSkipped).toBe(true);
  });

  it('E2: skipped conditional frame has narrowed clauses (empty after filtering)', () => {
    const { result } = setup();
    addUlt(result.current, 0);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const conditionalFrame = ult.segments[1].frames![1];

    // Clauses should be narrowed to empty (conditions not met → all filtered out)
    expect(conditionalFrame.clauses).toBeDefined();
    expect(conditionalFrame.clauses!.length).toBe(0);
  });
});

// =============================================================================
// F. CRIT_RATE / CRIT_DAMAGE consumption at ult end
// =============================================================================

function placeSolidification(app: AppResult) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 0,
      { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
    );
  });
}

function placeEbatkDuringUlt(app: AppResult, ultFrame: number) {
  const activeStart = ultFrame + Math.round(2.03 * FPS);
  const col = findColumn(app, SLOT, NounType.BASIC_ATTACK)!;
  const menu = buildContextMenu(app, col, activeStart);
  const ebatkItem = menu!.find(
    i => i.actionId === 'addEvent'
      && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === EBATK_ID,
  )!;
  const payload = ebatkItem.actionPayload as {
    ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
  };
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('F. CRIT_RATE / CRIT_DAMAGE consumption at ult end', () => {
  const ULT_FRAME = 5 * FPS;
  // Active starts after the 2.03s TIME_STOP animation; last ult frame fires at offset 7s.
  const ULT_CONSUME_FRAME = ULT_FRAME + Math.round(2.03 * FPS) + 7 * FPS;

  function eventEnd(ev: { startFrame: number; segments: { properties: { duration: number } }[] }) {
    return ev.startFrame + ev.segments.reduce((s, x) => s + x.properties.duration, 0);
  }

  it('F1: without Solidification, ult end consumes CRIT_RATE and CRIT_DAMAGE', () => {
    const { result } = setup();
    addUlt(result.current, ULT_FRAME);
    placeEbatkDuringUlt(result.current, ULT_FRAME);

    const critRate = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_RATE_ID && ev.ownerEntityId === SLOT,
    );
    const critDamage = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_DAMAGE_ID && ev.ownerEntityId === SLOT,
    );
    expect(critRate.length).toBeGreaterThan(0);
    expect(critDamage.length).toBeGreaterThan(0);
    // Every CRIT buff must end at or before the ult consume frame — duration
    // truncation is the observable signal of CONSUME.
    expect(critRate.every(ev => eventEnd(ev) <= ULT_CONSUME_FRAME)).toBe(true);
    expect(critDamage.every(ev => eventEnd(ev) <= ULT_CONSUME_FRAME)).toBe(true);
  });

  it('F2: with Solidification, ult end still consumes CRIT_RATE and CRIT_DAMAGE (via frame 2)', () => {
    const { result } = setup();
    placeSolidification(result.current);
    addUlt(result.current, ULT_FRAME);
    placeEbatkDuringUlt(result.current, ULT_FRAME);

    const critRate = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_RATE_ID && ev.ownerEntityId === SLOT,
    );
    const critDamage = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_DAMAGE_ID && ev.ownerEntityId === SLOT,
    );
    expect(critRate.length).toBeGreaterThan(0);
    expect(critDamage.length).toBeGreaterThan(0);
    expect(critRate.every(ev => eventEnd(ev) <= ULT_CONSUME_FRAME)).toBe(true);
    expect(critDamage.every(ev => eventEnd(ev) <= ULT_CONSUME_FRAME)).toBe(true);
  });

  it('F3: with no crit buffs built up (no EBATK placed), ult completes without error', () => {
    const { result } = setup();
    addUlt(result.current, ULT_FRAME);

    const critRate = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_RATE_ID && ev.ownerEntityId === SLOT,
    );
    const critDamage = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_DAMAGE_ID && ev.ownerEntityId === SLOT,
    );
    expect(critRate).toHaveLength(0);
    expect(critDamage).toHaveLength(0);

    // Ult still placed and ran to completion
    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ult).toBeDefined();
    expect(ult!.segments).toHaveLength(2);
  });
});
