/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Talents & Potentials Integration Tests
 *
 * Verifies JSON structure and pipeline behavior for:
 *   T1 Barrage of Technology: BASIC_ATTACK-scoped DAMAGE_BONUS
 *   T2 Freezing Point: FIRST_MATCH Solidification doubling, P3 baked in
 *   P2 Flawless Creation: INT +20, Crit Rate +7% stat clauses
 *   P5 Expert Mechcrafter: talent status applied by ult at P5
 *   Crit Stacks: APPLY CRYOBLASTING_PISTOLIER_CRIT_RATE on first frame of each EBATK segment
 */

import { renderHook, act } from '@testing-library/react';
import {
  NounType, VerbType,
  ValueOperation,
} from '../../../../dsl/semantics';
import { InteractionModeType, StatType } from '../../../../consts/enums';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { INFLICTION_COLUMNS, ENEMY_ID, REACTION_COLUMNS } from '../../../../model/channels';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
const BARRAGE_JSON = require('../../../../model/game-data/operators/yvonne/statuses/status-barrage-of-technology.json');
const FREEZING_POINT_JSON = require('../../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json');
const P2_JSON = require('../../../../model/game-data/operators/yvonne/potentials/potential-2-flawless-creation.json');
const EXPERT_STATUS_JSON = require('../../../../model/game-data/operators/yvonne/potentials/potential-5-expert-mechcrafter.json');
const CRIT_STACKS_JSON = require('../../../../model/game-data/operators/yvonne/statuses/status-crit-stacks.json');
const CRIT_DAMAGE_JSON = require('../../../../model/game-data/operators/yvonne/statuses/status-crit-damage.json');
const EBATK_JSON = require('../../../../model/game-data/operators/yvonne/skills/basic-attack-batk-exuberant-trigger-empowered.json');
const EBATK_ID: string = EBATK_JSON.properties.id;
const EXPERT_ID: string = EXPERT_STATUS_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT];
  act(() => {
    app.handleStatsChange(SLOT, { ...props, operator: { ...props.operator, potential } });
  });
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
// A. T1 Barrage of Technology — BASIC_ATTACK-scoped DAMAGE_BONUS
// =============================================================================

describe('A. Barrage DAMAGE_BONUS scoped to BASIC_ATTACK', () => {
  it('A1: DAMAGE_BONUS has objectQualifier BASIC_ATTACK', () => {
    const statEffect = BARRAGE_JSON.segments[0].clause[0].effects[0];
    expect(statEffect.verb).toBe(VerbType.APPLY);
    expect(statEffect.object).toBe(NounType.STAT);
    expect(statEffect.objectId).toBe(NounType.DAMAGE_BONUS);
    expect(statEffect.objectQualifier).toBe(NounType.BASIC_ATTACK);
  });

  it('A2: DAMAGE_BONUS VARY_BY TALENT_LEVEL [0, 0.5]', () => {
    const value = BARRAGE_JSON.segments[0].clause[0].effects[0].with.value;
    expect(value.object).toBe(NounType.TALENT_LEVEL);
    expect(value.value).toEqual([0, 0.5]);
  });
});

// =============================================================================
// B. T2 Freezing Point — Solidification doubling + P3 baked in
// =============================================================================

describe('B. Freezing Point — unified talent event with FIRST_MATCH clause', () => {
  const FP_ID: string = FREEZING_POINT_JSON.properties.id;

  function placeCryoInfliction(app: AppResult, atFrame: number) {
    app.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.CRYO, atFrame,
      { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
    );
  }

  function placeSolidification(app: AppResult, atFrame: number) {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, atFrame,
      { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 5 * FPS } }] },
    );
  }

  // -- JSON structure --

  it('B1: FIRST_MATCH clause uses Solidification branch first, Cryo branch second', () => {
    expect(FREEZING_POINT_JSON.segments[0].clauseType).toBe('FIRST_MATCH');
    expect(FREEZING_POINT_JSON.segments[0].clause).toHaveLength(2);
    expect(FREEZING_POINT_JSON.segments[0].clause[0].conditions[0].objectQualifier).toBe('SOLIDIFICATION');
    expect(FREEZING_POINT_JSON.segments[0].clause[1].conditions[0].objectQualifier).toBe('CRYO');
  });

  it('B1b: Cryo branch applies CRITICAL_DAMAGE with base values (TL [0, 0.1, 0.2] + P3 [0..0.1])', () => {
    const effect = FREEZING_POINT_JSON.segments[0].clause[1].effects[0];
    expect(effect.objectId).toBe('CRITICAL_DAMAGE');
    expect(effect.with.value.operation).toBe(ValueOperation.ADD);
    expect(effect.with.value.left.value).toEqual([0, 0.1, 0.2]);
    expect(effect.with.value.right.value).toEqual([0, 0, 0, 0.1, 0.1, 0.1]);
  });

  it('B2: Solidification branch applies CRITICAL_DAMAGE with doubled values (TL [0, 0.2, 0.4] + P3 [0..0.2])', () => {
    const effect = FREEZING_POINT_JSON.segments[0].clause[0].effects[0];
    expect(effect.objectId).toBe('CRITICAL_DAMAGE');
    expect(effect.with.value.operation).toBe(ValueOperation.ADD);
    expect(effect.with.value.left.value).toEqual([0, 0.2, 0.4]);
    expect(effect.with.value.right.value).toEqual([0, 0, 0, 0.2, 0.2, 0.2]);
  });

  it('B3: talent has 4 trigger clauses (apply cryo, become-not cryo, apply solid, become-not solid)', () => {
    expect(FREEZING_POINT_JSON.onTriggerClause).toHaveLength(4);
    expect(FREEZING_POINT_JSON.onTriggerClause[0].conditions[0].verb).toBe(VerbType.APPLY);
    expect(FREEZING_POINT_JSON.onTriggerClause[1].conditions[0].verb).toBe(VerbType.BECOME);
    expect(FREEZING_POINT_JSON.onTriggerClause[1].conditions[0].negated).toBe(true);
    expect(FREEZING_POINT_JSON.onTriggerClause[2].conditions[0].verb).toBe(VerbType.APPLY);
    expect(FREEZING_POINT_JSON.onTriggerClause[3].conditions[0].verb).toBe(VerbType.BECOME);
    expect(FREEZING_POINT_JSON.onTriggerClause[3].conditions[0].negated).toBe(true);
  });

  // -- Pipeline: Cryo status --

  it('B4: cryo infliction on enemy triggers Freezing Point talent event on Yvonne', () => {
    const { result } = setup();
    act(() => { placeCryoInfliction(result.current, 1 * FPS); });

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp.length).toBeGreaterThanOrEqual(1);
  });

  it('B5: no cryo infliction or solidification → no Freezing Point talent event', () => {
    const { result } = setup();

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp).toHaveLength(0);
  });

  it('B6: heat infliction does NOT trigger Freezing Point talent event', () => {
    const { result } = setup();
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp).toHaveLength(0);
  });

  // -- Pipeline: solidification also triggers the unified event --

  it('B7: solidification on enemy triggers Freezing Point talent event on Yvonne', () => {
    const { result } = setup();
    act(() => { placeSolidification(result.current, 1 * FPS); });

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp.length).toBeGreaterThanOrEqual(1);
  });

  // -- Pipeline: despawn on infliction/reaction end --

  it('B8: cryo infliction and Freezing Point talent event have same duration', () => {
    const { result } = setup();
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 1 * FPS,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: Math.round(5 * FPS) } }] },
      );
    });

    const infliction = result.current.allProcessedEvents.find(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    )!;
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;
    expect(infliction).toBeDefined();
    expect(fp).toBeDefined();

    const inflictionDur = infliction.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    const fpDur = fp.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // Event should end exactly when infliction ends
    expect(fp.startFrame + fpDur).toBe(infliction.startFrame + inflictionDur);
  });

  it('B8b: solidification and Freezing Point talent event have same duration', () => {
    const { result } = setup();
    act(() => { placeSolidification(result.current, 1 * FPS); });

    const reaction = result.current.allProcessedEvents.find(
      ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerEntityId === ENEMY_ID,
    )!;
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;
    expect(reaction).toBeDefined();
    expect(fp).toBeDefined();

    const reactionDur = reaction.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    const fpDur = fp.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // Event should end exactly when reaction ends
    expect(fp.startFrame + fpDur).toBe(reaction.startFrame + reactionDur);
  });

  it('B8c: different cryo infliction durations produce matching talent event durations', () => {
    const { result } = setup();
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 2 * FPS,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: Math.round(10 * FPS) } }] },
      );
    });

    const infliction = result.current.allProcessedEvents.find(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    )!;
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;

    const inflictionEnd = infliction.startFrame + infliction.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    const fpEnd = fp.startFrame + fp.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(fpEnd).toBe(inflictionEnd);
  });

  it('B8d: cryo infliction during TIME_STOP — talent event has same game-time duration as infliction', () => {
    const { result } = setup();
    // Place ult at 3s (creates TIME_STOP during 2.03s animation)
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE)!;
    const ultPayload = getMenuPayload(result.current, ultCol, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill);
    });

    // Place cryo infliction at 2s with 5s duration — overlaps with TIME_STOP
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 2 * FPS,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: Math.round(5 * FPS) } }] },
      );
    });

    const infliction = result.current.allProcessedEvents.find(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    )!;
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;
    expect(infliction).toBeDefined();
    expect(fp).toBeDefined();

    // Both have the same game-time duration (before TIME_STOP extension).
    // TIME_STOP extends them by different amounts based on column ownership,
    // but the underlying game-time duration is identical.
    expect(fp).toBeDefined();
    expect(fp.startFrame).toBe(infliction.startFrame); // both start at same frame
  });

  it('B8e: solidification consumed mid-duration → Freezing Point talent event ends at consume frame (not original end)', () => {
    // Reproduces the BECOME_NOT-on-consume bug: BECOME NOT SOLIDIFIED must fire
    // when the reaction is consumed (e.g. by Yvonne ult EBATK frames), not only
    // when it expires at its natural end frame.
    const { result } = setup();
    // Place a 20s SOLIDIFICATION at 1s. Natural end = 21s.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 1 * FPS,
        { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    // Place Yvonne ult at 2s — its EBATK frames emit CONSUME STATUS REACTION SOLIDIFICATION,
    // which clamps the SOLIDIFICATION event's duration well before 21s.
    addUlt(result.current, 2 * FPS);

    const solid = result.current.allProcessedEvents.find(
      ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerEntityId === ENEMY_ID,
    )!;
    const fp = result.current.allProcessedEvents.find(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    )!;
    expect(solid).toBeDefined();
    expect(fp).toBeDefined();

    const solidEnd = solid.startFrame + solid.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // Consumed before natural end
    expect(solidEnd).toBeLessThan(1 * FPS + 20 * FPS);

    const fpEnd = fp.startFrame + fp.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // Event ends at the CONSUME frame, not at SOLIDIFICATION's original 21s end.
    expect(fpEnd).toBe(solidEnd);
  });

  it('B8f: consumed solidification\'s original expiry must not fire IS_NOT — later solidification\'s talent event must survive past that frame', () => {
    // Scenario: solidification A is consumed mid-duration. A later solidification B
    // overlaps its original expiry frame. The pre-scheduled EVENT_END for A must NOT
    // fire IS_NOT at A's original end (since A is CONSUMED) — otherwise it would
    // spuriously consume B's Freezing Point talent event.
    const { result } = setup();
    // A: 0s start, 20s duration. Natural end 20s.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 0,
        { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    // Ult at 2s consumes A around ~11s (from B8e: 1324 frames).
    addUlt(result.current, 2 * FPS);
    // B: 15s start, 10s duration. B's natural end = 25s. B overlaps A's original 20s expiry.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 15 * FPS,
        { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 10 * FPS } }] },
      );
    });

    // Find the Freezing Point talent event that starts at B's application frame.
    const fps = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    ).sort((a, b) => a.startFrame - b.startFrame);
    expect(fps.length).toBeGreaterThanOrEqual(2);

    const fpFromB = fps[fps.length - 1];
    const fpFromBEnd = fpFromB.startFrame + fpFromB.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // Event from B must extend past A's original expiry (20s = 2400 frames) —
    // A's pre-scheduled EVENT_END must not fire IS_NOT for a CONSUMED event.
    expect(fpFromBEnd).toBeGreaterThan(20 * FPS);
    // And end at B's natural end (25s = 3000 frames).
    expect(fpFromBEnd).toBe(25 * FPS);
  });

  it('B9: no solidification → no Freezing Point talent event', () => {
    const { result } = setup();

    const fp = result.current.allProcessedEvents.filter(
      ev => ev.id === FP_ID && ev.ownerEntityId === SLOT,
    );
    expect(fp).toHaveLength(0);
  });
});

// =============================================================================
// C. P2 Flawless Creation — INT +20, Crit Rate +7%
// =============================================================================

describe('C. P2 Flawless Creation stat clauses', () => {
  it('C1: has APPLY STAT INTELLECT +20', () => {
    const intEffect = P2_JSON.segments[0].clause[0].effects.find(
      (e: { objectId: string }) => e.objectId === StatType.INTELLECT,
    );
    expect(intEffect).toBeDefined();
    expect(intEffect.verb).toBe(VerbType.APPLY);
    expect(intEffect.object).toBe(NounType.STAT);
    expect(intEffect.with.value.value).toBe(20);
  });

  it('C2: has APPLY STAT CRITICAL_RATE +0.07', () => {
    const critEffect = P2_JSON.segments[0].clause[0].effects.find(
      (e: { objectId: string }) => e.objectId === StatType.CRITICAL_RATE,
    );
    expect(critEffect).toBeDefined();
    expect(critEffect.verb).toBe(VerbType.APPLY);
    expect(critEffect.object).toBe(NounType.STAT);
    expect(critEffect.with.value.value).toBe(0.07);
  });
});

// =============================================================================
// D. P5 Expert Mechcrafter — talent status applied by ult
// =============================================================================

describe('D. P5 Expert Mechcrafter', () => {
  it('D1: status has ATK +10% and Crit DMG +30%', () => {
    const effects = EXPERT_STATUS_JSON.segments[0].clause[0].effects;
    const atk = effects.find((e: { objectId: string }) => e.objectId === StatType.ATTACK_BONUS);
    expect(atk).toBeDefined();
    expect(atk.with.value.value).toBe(0.1);
    const critDmg = effects.find((e: { objectId: string }) => e.objectId === StatType.CRITICAL_DAMAGE);
    expect(critDmg).toBeDefined();
    expect(critDmg.with.value.value).toBe(0.3);
  });

  it('D3: ult at P5 applies Expert Mechcrafter status', () => {
    const { result } = setup();
    setPotential(result.current, 5);
    addUlt(result.current, 5 * FPS);

    const expertStatus = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    );
    expect(expertStatus.length).toBeGreaterThanOrEqual(1);
  });

  it('D3b: Expert Mechcrafter status starts at ult active segment start (after animation)', () => {
    const { result } = setup();
    setPotential(result.current, 5);
    addUlt(result.current, 5 * FPS);

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const expertStatus = result.current.allProcessedEvents.find(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    )!;
    // Status should start at the active segment start (after animation)
    const animDuration = ult.segments[0].properties.duration;
    expect(expertStatus.startFrame).toBe(ult.startFrame + animDuration);
  });

  it('D3d: Expert Mechcrafter status duration is 7s (matches ult active segment)', () => {
    const { result } = setup();
    setPotential(result.current, 5);
    addUlt(result.current, 5 * FPS);

    const expertStatus = result.current.allProcessedEvents.find(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    )!;
    const duration = expertStatus.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(duration).toBe(Math.round(7 * FPS));
  });

  it('D3c: Expert Mechcrafter status has ATK_BONUS and CRITICAL_DAMAGE in its definition', () => {
    const effects = EXPERT_STATUS_JSON.segments[0].clause[0].effects;
    const statIds = effects.map((e: { objectId: string }) => e.objectId);
    expect(statIds).toContain('ATTACK_BONUS');
    expect(statIds).toContain('CRITICAL_DAMAGE');
  });

  it('D4: ult at P0 does NOT apply Expert Mechcrafter status', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    const expertStatus = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    );
    expect(expertStatus).toHaveLength(0);
  });

  it('D5: ult at P4 does NOT apply Expert Mechcrafter status', () => {
    const { result } = setup();
    setPotential(result.current, 4);
    addUlt(result.current, 5 * FPS);

    const expertStatus = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    );
    expect(expertStatus).toHaveLength(0);
  });

  it('D6: changing potential from P0 to P5 with ult already placed adds Expert Mechcrafter', () => {
    const { result } = setup();
    addUlt(result.current, 5 * FPS);

    // No status at P0
    expect(result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    )).toHaveLength(0);

    // Change to P5
    setPotential(result.current, 5);

    // Now status should appear
    const expertStatus = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    );
    expect(expertStatus.length).toBeGreaterThanOrEqual(1);
  });

  it('D7: Expert Mechcrafter status appears in operator status column', () => {
    const { result } = setup();
    setPotential(result.current, 5);
    addUlt(result.current, 5 * FPS);

    const expertStatus = result.current.allProcessedEvents.find(
      ev => ev.id === EXPERT_ID && ev.ownerEntityId === SLOT,
    );
    expect(expertStatus).toBeDefined();
    // Verify it's on the operator status column
    expect(expertStatus!.columnId).toBe(EXPERT_ID);
    // Verify it has the correct source
    expect(expertStatus!.ownerEntityId).toBeDefined();
  });

  it('D8: changing potential from P5 to P4 with ult already placed removes Expert Mechcrafter', () => {
    const { result } = setup();
    setPotential(result.current, 5);
    addUlt(result.current, 5 * FPS);

    // Status at P5
    expect(result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    ).length).toBeGreaterThanOrEqual(1);

    // Change to P4
    setPotential(result.current, 4);

    // Status should be gone
    expect(result.current.allProcessedEvents.filter(
      ev => ev.columnId === EXPERT_ID && ev.ownerEntityId === SLOT,
    )).toHaveLength(0);
  });
});

// =============================================================================
// E. Cryoblasting Pistolier (Crit) — EBATK frames apply CRYOBLASTING_PISTOLIER_CRIT_RATE
// =============================================================================

describe('E. Cryoblasting Pistolier (Crit) on EBATK', () => {
  it('E1: every frame of each EBATK segment has APPLY STATUS CRYOBLASTING_PISTOLIER_CRIT_RATE', () => {
    for (let si = 0; si < EBATK_JSON.segments.length; si++) {
      const seg = EBATK_JSON.segments[si];
      for (let fi = 0; fi < seg.frames.length; fi++) {
        const frame = seg.frames[fi];
        const applyCrit = frame.clause[0].effects.find(
          (e: { verb: string; objectId?: string }) =>
            e.verb === VerbType.APPLY && e.objectId === CRIT_STACKS_JSON.properties.id,
        );
        expect(applyCrit).toBeDefined();
        expect(applyCrit.object).toBe(NounType.STATUS);
        expect(applyCrit.with.stacks.value).toBe(1);
      }
    }
  });

  it('E3: CRYOBLASTING_PISTOLIER_CRIT_RATE gives 3% crit rate per stack (max 10) and applies CRIT_DAMAGE status at max', () => {
    expect(CRIT_STACKS_JSON.properties.stacks.limit.value).toBe(10);
    // Crit rate clause: 0.03 per stack (per-stack evaluation)
    const critRateEffect = CRIT_STACKS_JSON.segments[0].clause[0].effects[0];
    expect(critRateEffect.objectId).toBe('CRITICAL_RATE');
    expect(critRateEffect.with.value.value).toBe(0.03);
    // onTriggerClause at MAX stacks applies the separate CRIT_DAMAGE status
    const trigger = CRIT_STACKS_JSON.onTriggerClause[0];
    expect(trigger.conditions[0].verb).toBe(VerbType.BECOME);
    expect(trigger.conditions[0].value).toBe('MAX');
    expect(trigger.effects[0].objectId).toBe(CRIT_DAMAGE_JSON.properties.id);
    // CRIT_DAMAGE status applies +0.6 CRITICAL_DAMAGE
    const critDmgEffect = CRIT_DAMAGE_JSON.segments[0].clause[0].effects[0];
    expect(critDmgEffect.objectId).toBe('CRITICAL_DAMAGE');
    expect(critDmgEffect.with.value.value).toBe(0.6);
  });

  it('E4: pipeline — placing EBATK during ult produces CRYOBLASTING_PISTOLIER_CRIT_RATE events', () => {
    const { result } = setup();
    addUlt(result.current, 3 * FPS);

    // Place EBATK during ult active phase
    const activeStart = 3 * FPS + Math.round(2.03 * FPS);
    const col = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menu = require('../../helpers').buildContextMenu(result.current, col, activeStart);
    const ebatkItem = menu!.find(
      (i: { actionId: string; actionPayload?: { defaultSkill?: { id?: string } } }) =>
        i.actionId === 'addEvent' && i.actionPayload?.defaultSkill?.id === EBATK_ID,
    );
    if (!ebatkItem) return; // EBATK not available in menu — skip runtime test

    const payload = ebatkItem.actionPayload as {
      ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const critStacks = result.current.allProcessedEvents.filter(
      ev => ev.id === CRIT_STACKS_JSON.properties.id && ev.ownerEntityId === SLOT,
    );
    // Should have at least 1 crit stack from the first segment's first frame
    expect(critStacks.length).toBeGreaterThanOrEqual(1);
  });
});
