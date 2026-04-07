/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Brr-Brr-Bomb β (Battle Skill) Integration Tests
 *
 * Verifies the restructured battle skill data:
 *   1. Effect ordering: base damage → stagger → UE recovery → conditional Solidification
 *   2. FIRST_MATCH clause: unconditional clause always runs, then Cryo or Nature branch
 *   3. Forced Solidification (isForced: true)
 *   4. UE recovery: ADD(10, MULT(30, ENEMY ARTS INFLICTION STACKS))
 *   5. Conditional damage: ADD(base solidification, MULT(per-stack bonus, element INFLICTION STACKS))
 *   6. CONSUME INFLICTION with stacks MAX
 *   7. SP cost 100
 *   8. Multiplier values match wiki at L1 and L12
 */

import { renderHook, act } from '@testing-library/react';
import {
  NounType, VerbType, ClauseEvaluationType, AdjectiveType,
  ValueOperation, THRESHOLD_MAX,
} from '../../../../dsl/semantics';
import { DamageScalingStatType } from '../../../../consts/enums';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
const BS_JSON = require('../../../../model/game-data/operators/yvonne/skills/battle-skill-brr-brr-bomb.json');
const BS_ID: string = BS_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  return view;
}

// =============================================================================
// A. JSON Structure — Effect Ordering & Clause Types
// =============================================================================

describe('A. Brr-Brr-Bomb JSON structure', () => {
  const frame = BS_JSON.segments[0].frames[0];
  const clauses = frame.clause;

  it('A1: frame uses FIRST_MATCH clauseType', () => {
    expect(frame.clauseType).toBe(ClauseEvaluationType.FIRST_MATCH);
  });

  it('A2: first clause is unconditional (no conditions)', () => {
    expect(clauses[0].conditions).toEqual([]);
  });

  it('A3: unconditional clause has 3 effects in order: DEAL DAMAGE, DEAL STAGGER, RECOVER UE', () => {
    const effects = clauses[0].effects;
    expect(effects).toHaveLength(3);
    expect(effects[0].verb).toBe(VerbType.DEAL);
    expect(effects[0].object).toBe(NounType.DAMAGE);
    expect(effects[1].verb).toBe(VerbType.DEAL);
    expect(effects[1].object).toBe(NounType.STAGGER);
    expect(effects[2].verb).toBe(VerbType.RECOVER);
    expect(effects[2].object).toBe(NounType.ULTIMATE_ENERGY);
  });

  it('A4: second clause is unconditional P4 RETURN SP (MULT POTENTIAL × ENEMY_HIT)', () => {
    expect(clauses[1].conditions).toEqual([]);
    const effect = clauses[1].effects[0];
    expect(effect.verb).toBe(VerbType.RETURN);
    expect(effect.object).toBe(NounType.SKILL_POINT);
    expect(effect.with.value.operation).toBe(ValueOperation.MULT);
    expect(effect.with.value.left.value).toEqual([0, 0, 0, 0, 10, 10]);
    expect(effect.with.value.right.object).toBe('ENEMY_HIT');
    // index 0 (1 enemy) → 1 (return SP), index 1 (2 enemies) → 0 (no return)
    expect(effect.with.value.right.value).toEqual([1, 0]);
  });

  it('A5: third clause conditions on ENEMY HAVE CRYO INFLICTION', () => {
    const cond = clauses[2].conditions[0];
    expect(cond.subject).toBe(NounType.ENEMY);
    expect(cond.verb).toBe(VerbType.HAVE);
    expect(cond.objectId).toBe(NounType.INFLICTION);
    expect(cond.objectQualifier).toBe(AdjectiveType.CRYO);
  });

  it('A6: fourth clause conditions on ENEMY HAVE NATURE INFLICTION', () => {
    const cond = clauses[3].conditions[0];
    expect(cond.subject).toBe(NounType.ENEMY);
    expect(cond.verb).toBe(VerbType.HAVE);
    expect(cond.objectId).toBe(NounType.INFLICTION);
    expect(cond.objectQualifier).toBe(AdjectiveType.NATURE);
  });

  it('A7: Cryo branch has 4 effects: APPLY SOLIDIFICATION, DEAL DAMAGE, CONSUME INFLICTION, APPLY BARRAGE', () => {
    const effects = clauses[2].effects;
    expect(effects).toHaveLength(4);
    expect(effects[0].verb).toBe(VerbType.APPLY);
    expect(effects[0].objectId).toBe(NounType.REACTION);
    expect(effects[0].objectQualifier).toBe(AdjectiveType.SOLIDIFICATION);
    expect(effects[1].verb).toBe(VerbType.DEAL);
    expect(effects[1].object).toBe(NounType.DAMAGE);
    expect(effects[2].verb).toBe(VerbType.CONSUME);
    expect(effects[2].object).toBe(NounType.INFLICTION);
  });

  it('A8: Nature branch mirrors Cryo branch structure', () => {
    const effects = clauses[3].effects;
    expect(effects).toHaveLength(4);
    expect(effects[0].verb).toBe(VerbType.APPLY);
    expect(effects[0].objectId).toBe(NounType.REACTION);
    expect(effects[0].objectQualifier).toBe(AdjectiveType.SOLIDIFICATION);
    expect(effects[1].verb).toBe(VerbType.DEAL);
    expect(effects[1].object).toBe(NounType.DAMAGE);
    expect(effects[2].verb).toBe(VerbType.CONSUME);
    expect(effects[2].objectQualifier).toBe(AdjectiveType.NATURE);
  });
});

// =============================================================================
// B. Forced Solidification
// =============================================================================

describe('B. Forced Solidification', () => {
  const frame = BS_JSON.segments[0].frames[0];

  it('B1: Cryo branch applies Solidification with isForced=true', () => {
    const applyEffect = frame.clause[2].effects[0];
    expect(applyEffect.objectId).toBe(NounType.REACTION);
    expect(applyEffect.objectQualifier).toBe(AdjectiveType.SOLIDIFICATION);
    expect(applyEffect.with.isForced.value).toBe(1);
  });

  it('B2: Nature branch applies Solidification with isForced=true', () => {
    const applyEffect = frame.clause[3].effects[0];
    expect(applyEffect.objectId).toBe(NounType.REACTION);
    expect(applyEffect.objectQualifier).toBe(AdjectiveType.SOLIDIFICATION);
    expect(applyEffect.with.isForced.value).toBe(1);
  });
});

// =============================================================================
// C. UE Recovery — ADD(10, MULT(30, ENEMY ARTS INFLICTION STACKS))
// =============================================================================

describe('C. UE Recovery expression', () => {
  const ueEffect = BS_JSON.segments[0].frames[0].clause[0].effects[2];

  it('C1: top-level is ADD operation', () => {
    expect(ueEffect.with.value.operation).toBe(ValueOperation.ADD);
  });

  it('C2: left operand is flat 10 (base UE)', () => {
    expect(ueEffect.with.value.left.verb).toBe(VerbType.IS);
    expect(ueEffect.with.value.left.value).toBe(10);
  });

  it('C3: right operand is MULT(30, ENEMY ARTS INFLICTION STACKS)', () => {
    const mult = ueEffect.with.value.right;
    expect(mult.operation).toBe(ValueOperation.MULT);
    expect(mult.left.value).toBe(30);
    expect(mult.right.object).toBe(NounType.STACKS);
    expect(mult.right.of.object).toBe(NounType.STATUS);
    expect(mult.right.of.objectId).toBe(NounType.INFLICTION);
    expect(mult.right.of.objectQualifier).toBe(AdjectiveType.ARTS);
    expect(mult.right.of.of.object).toBe(NounType.ENEMY);
  });
});

// =============================================================================
// D. Conditional Damage — ADD(base, MULT(per-stack, element STACKS))
// =============================================================================

describe('D. Conditional damage expression', () => {
  const cryoDmg = BS_JSON.segments[0].frames[0].clause[2].effects[1];
  const natureDmg = BS_JSON.segments[0].frames[0].clause[3].effects[1];

  it('D1: Cryo branch damage is ADD expression', () => {
    expect(cryoDmg.with.value.operation).toBe(ValueOperation.ADD);
  });

  it('D2: Cryo branch base solidification at L1=0.67, L12=1.5', () => {
    const base = cryoDmg.with.value.left;
    expect(base.value[0]).toBe(0.67);
    expect(base.value[11]).toBe(1.5);
  });

  it('D3: Cryo branch per-stack bonus at L1=0.89, L12=2', () => {
    const perStack = cryoDmg.with.value.right.left;
    expect(perStack.value[0]).toBe(0.89);
    expect(perStack.value[11]).toBe(2);
  });

  it('D4: Cryo branch reads CRYO INFLICTION STACKS from ENEMY', () => {
    const stackRef = cryoDmg.with.value.right.right;
    expect(stackRef.object).toBe(NounType.STACKS);
    expect(stackRef.of.object).toBe(NounType.STATUS);
    expect(stackRef.of.objectId).toBe(NounType.INFLICTION);
    expect(stackRef.of.objectQualifier).toBe(AdjectiveType.CRYO);
    expect(stackRef.of.of.object).toBe(NounType.ENEMY);
  });

  it('D5: Nature branch reads NATURE INFLICTION STACKS from ENEMY', () => {
    const stackRef = natureDmg.with.value.right.right;
    expect(stackRef.object).toBe(NounType.STACKS);
    expect(stackRef.of.object).toBe(NounType.STATUS);
    expect(stackRef.of.objectId).toBe(NounType.INFLICTION);
    expect(stackRef.of.objectQualifier).toBe(AdjectiveType.NATURE);
    expect(stackRef.of.of.object).toBe(NounType.ENEMY);
  });

  it('D6: both branches scale off ATK mainStat', () => {
    expect(cryoDmg.with.mainStat.objectId).toBe(DamageScalingStatType.ATTACK);
    expect(natureDmg.with.mainStat.objectId).toBe(DamageScalingStatType.ATTACK);
  });
});

// =============================================================================
// E. Consume Infliction
// =============================================================================

describe('E. Consume Infliction', () => {
  const cryoConsume = BS_JSON.segments[0].frames[0].clause[2].effects[2];
  const natureConsume = BS_JSON.segments[0].frames[0].clause[3].effects[2];

  it('E1: Cryo branch consumes CRYO INFLICTION with stacks MAX', () => {
    expect(cryoConsume.verb).toBe(VerbType.CONSUME);
    expect(cryoConsume.object).toBe(NounType.INFLICTION);
    expect(cryoConsume.objectQualifier).toBe(AdjectiveType.CRYO);
    expect(cryoConsume.from).toBe(NounType.ENEMY);
    expect(cryoConsume.with.stacks).toBe(THRESHOLD_MAX);
  });

  it('E2: Nature branch consumes NATURE INFLICTION with stacks MAX', () => {
    expect(natureConsume.verb).toBe(VerbType.CONSUME);
    expect(natureConsume.object).toBe(NounType.INFLICTION);
    expect(natureConsume.objectQualifier).toBe(AdjectiveType.NATURE);
    expect(natureConsume.from).toBe(NounType.ENEMY);
    expect(natureConsume.with.stacks).toBe(THRESHOLD_MAX);
  });
});

// =============================================================================
// F. Base Damage & SP Cost
// =============================================================================

describe('F. Base damage multipliers & SP cost', () => {
  it('F1: SP cost is 100', () => {
    const spEffect = BS_JSON.clause[0].effects[0];
    expect(spEffect.verb).toBe(VerbType.CONSUME);
    expect(spEffect.object).toBe(NounType.SKILL_POINT);
    expect(spEffect.with.value.value).toBe(100);
  });

  it('F2: base damage at L1=1.11, L12=2.5', () => {
    const baseDmg = BS_JSON.segments[0].frames[0].clause[0].effects[0];
    expect(baseDmg.with.value.value[0]).toBe(1.11);
    expect(baseDmg.with.value.value[11]).toBe(2.5);
  });

  it('F3: stagger is 10', () => {
    const stagger = BS_JSON.segments[0].frames[0].clause[0].effects[1];
    expect(stagger.with.value.value).toBe(10);
  });

  it('F4: frame offset is 0.17s', () => {
    const frame = BS_JSON.segments[0].frames[0];
    expect(frame.properties.offset.value).toBe(0.17);
  });

  it('F5: segment duration is 1.13s', () => {
    expect(BS_JSON.segments[0].properties.duration.value.value).toBe(1.13);
  });
});

// =============================================================================
// G. Pipeline — Battle Skill Placement
// =============================================================================

describe('G. Pipeline placement', () => {
  it('G1: battle skill places in pipeline with correct ID', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const bs = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs).toHaveLength(1);
    expect(bs[0].name).toBe(BS_ID);
  });

  it('G2: battle skill has exactly 1 segment', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const bs = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs[0].segments).toHaveLength(1);
  });

  it('G3: segment duration is 1.13s in frames', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const bs = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs[0].segments[0].properties.duration).toBe(Math.round(1.13 * FPS));
  });
});

// =============================================================================
// H. P4 Supplied Parameter — SINGLE_TARGET
// =============================================================================

describe('H. P4 SINGLE_TARGET supplied parameter', () => {
  it('H1: BS JSON has ENEMY_HIT supplied parameter with range 1-2, default 1', () => {
    const params = BS_JSON.properties.suppliedParameters?.VARY_BY;
    expect(params).toBeDefined();
    const enemyHit = params.find((p: { id: string }) => p.id === 'ENEMY_HIT');
    expect(enemyHit).toBeDefined();
    expect(enemyHit.default).toBe(1);
    expect(enemyHit.lowerRange).toBe(1);
    expect(enemyHit.upperRange).toBe(2);
  });

  it('H2: BS context menu shows supplied parameter buttons', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.BATTLE);
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();

    const bsItem = menuItems!.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BS_ID,
    );
    expect(bsItem).toBeDefined();
    // Should have inline buttons for the supplied parameter (×0, ×1)
    expect(bsItem!.inlineButtons).toBeDefined();
    expect(bsItem!.inlineButtons!.length).toBeGreaterThanOrEqual(2);
  });

  it('H3: placed BS event has suppliedParameters with SINGLE_TARGET', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const bs = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs).toBeDefined();
    expect(bs!.suppliedParameters).toBeDefined();
  });
});
