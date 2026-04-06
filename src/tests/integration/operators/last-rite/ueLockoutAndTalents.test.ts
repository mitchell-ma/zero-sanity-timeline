/**
 * @jest-environment jsdom
 */

/**
 * Last Rite — UE Lockout, Talents & Potentials E2E Tests
 *
 * A. VIGIL_SERVICES_ULTIMATE_ENERGY_LOCKOUT — permanent status blocking external UE
 * B. T1 Hypothermia — APPLY CRYO SUSCEPTIBILITY on consume arts infliction
 * C. T2 Cryogenic Embrittlement — frame-level APPLY STAT SUSCEPTIBILITY on ult
 * D. P2 passive stats (STR +20, Cryo DMG +10%)
 * E. P3 baked into CS/ULT damage (1.15×)
 * F. P4 UE cost reduction (240 → 204)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, StatType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS } from '../../../../model/channels';
import { ultimateGraphKey } from '../../../../model/channels';
import { getLastStatAccumulator } from '../../../../controller/timeline/eventQueueController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  findColumn, getMenuPayload,
} from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAST_RITE_ID: string = require('../../../../model/game-data/operators/last-rite/last-rite.json').id;
const AKEKURI_ID: string = require('../../../../model/game-data/operators/akekuri/akekuri.json').id;
const UE_LOCKOUT_JSON = require('../../../../model/game-data/operators/last-rite/statuses/status-vigil-services-ue-lockout.json');
const HYPOTHERMIA_JSON = require('../../../../model/game-data/operators/last-rite/talents/talent-hypothermia-talent.json');
const ULTIMATE_JSON = require('../../../../model/game-data/operators/last-rite/skills/ultimate-vigil-services.json');
const POTENTIAL_2_JSON = require('../../../../model/game-data/operators/last-rite/potentials/potential-2-absolute-zero-armament.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const UE_LOCKOUT_ID: string = UE_LOCKOUT_JSON.properties.id;

const SLOT_LR = 'slot-0';
const SLOT_AKEKURI = 'slot-1';

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

function placeBattleSkill(app: AppResult, slotId: string, atFrame: number) {
  const col = findColumn(app, slotId, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function setPotential(app: AppResult, slotId: string, potential: number) {
  const props = app.loadoutProperties[slotId];
  app.handleStatsChange(slotId, { ...props, operator: { ...props.operator, potential } });
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
// A. VIGIL_SERVICES_ULTIMATE_ENERGY_LOCKOUT — permanent status
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Vigil Services UE Lockout — DSL structure', () => {
  it('A1: status has IGNORE ULTIMATE_ENERGY clause', () => {
    expect(UE_LOCKOUT_JSON.clause).toHaveLength(1);
    const effect = UE_LOCKOUT_JSON.clause[0].effects[0];
    expect(effect.verb).toBe(VerbType.IGNORE);
    expect(effect.object).toBe(NounType.ULTIMATE_ENERGY);
    expect(effect.toDeterminer).toBe('THIS');
    expect(effect.to).toBe(NounType.OPERATOR);
  });

  it('A2: status is permanent (99999s), 1 limit, RESET', () => {
    expect(UE_LOCKOUT_JSON.properties.duration.value.value).toBe(99999);
    expect(UE_LOCKOUT_JSON.properties.stacks.limit.value).toBe(1);
    expect(UE_LOCKOUT_JSON.properties.stacks.interactionType).toBe('RESET');
  });

  it('A3: status is talent-type, applied to THIS OPERATOR', () => {
    expect(UE_LOCKOUT_JSON.properties.eventIdType).toBe(NounType.TALENT);
    expect(UE_LOCKOUT_JSON.properties.to).toBe(NounType.OPERATOR);
    expect(UE_LOCKOUT_JSON.properties.toDeterminer).toBe('THIS');
  });
});

describe('A. Vigil Services UE Lockout — E2E pipeline', () => {
  it('A4: LR has UE lockout status at frame 0', () => {
    const { result } = setupLrOnly();
    const lockoutEvents = result.current.allProcessedEvents.filter(
      ev => ev.id === UE_LOCKOUT_ID && ev.ownerId === SLOT_LR,
    );
    expect(lockoutEvents.length).toBeGreaterThanOrEqual(1);
    expect(lockoutEvents[0].startFrame).toBe(0);
  });

  it('A5: Akekuri BS → LR does NOT gain UE', () => {
    const { result } = setupLrAndAkekuri();

    // LR UE before
    const ueBefore = getUeAtFrame(result.current, SLOT_LR, 2 * FPS);

    // Place Akekuri BS at 5s
    act(() => { placeBattleSkill(result.current, SLOT_AKEKURI, 5 * FPS); });

    // LR UE after Akekuri BS — should NOT gain from external source
    const ueAfter = getUeAtFrame(result.current, SLOT_LR, 10 * FPS);
    expect(ueAfter).toBe(ueBefore);
  });

  it('A6: LR BS → LR gains UE, Akekuri also gains UE', () => {
    const { result } = setupLrAndAkekuri();

    act(() => { placeBattleSkill(result.current, SLOT_LR, 5 * FPS); });

    // LR should gain UE from her own skill
    const ueLr = getUeAtFrame(result.current, SLOT_LR, 10 * FPS);
    expect(ueLr).toBeGreaterThan(0);

    // Akekuri should also gain UE from LR's team gain
    const ueAkekuri = getUeAtFrame(result.current, SLOT_AKEKURI, 10 * FPS);
    expect(ueAkekuri).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. T1 Hypothermia — APPLY CRYO SUSCEPTIBILITY on consume arts infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. T1 Hypothermia — DSL structure', () => {
  it('B1: trigger condition is THIS OPERATOR CONSUME STATUS INFLICTION ARTS', () => {
    const trigger = HYPOTHERMIA_JSON.onTriggerClause[0];
    expect(trigger.conditions[0].subjectDeterminer).toBe('THIS');
    expect(trigger.conditions[0].subject).toBe(NounType.OPERATOR);
    expect(trigger.conditions[0].verb).toBe(VerbType.CONSUME);
    expect(trigger.conditions[0].object).toBe(NounType.STATUS);
    expect(trigger.conditions[0].objectId).toBe('INFLICTION');
    expect(trigger.conditions[0].objectQualifier).toBe('ARTS');
  });

  it('B2: effect is APPLY CRYO SUSCEPTIBILITY STATUS to ENEMY with value scaled by consumed stacks', () => {
    const effect = HYPOTHERMIA_JSON.onTriggerClause[0].effects[0];
    expect(effect.verb).toBe(VerbType.APPLY);
    expect(effect.object).toBe(NounType.STATUS);
    expect(effect.objectId).toBe('SUSCEPTIBILITY');
    expect(effect.objectQualifier).toBe('CRYO');
    expect(effect.to).toBe(NounType.ENEMY);
  });

  it('B3: susceptibility value = MULT(consumed stacks, VARY_BY TALENT_LEVEL [0.02, 0.04])', () => {
    const effect = HYPOTHERMIA_JSON.onTriggerClause[0].effects[0];
    const valueNode = effect.with.value;
    expect(valueNode.operation).toBe('MULT');
    // Left: STACKS of CRYO INFLICTION STATUS
    expect(valueNode.left.object).toBe(NounType.STACKS);
    // Right: VARY_BY TALENT_LEVEL [0.02, 0.04]
    expect(valueNode.right.object).toBe('TALENT_LEVEL');
    expect(valueNode.right.value[0]).toBe(0.02); // Talent level 1
    expect(valueNode.right.value[1]).toBe(0.04); // Talent level 2
  });

  it('B4: duration = 15s', () => {
    const effect = HYPOTHERMIA_JSON.onTriggerClause[0].effects[0];
    expect(effect.with.duration.value.value).toBe(15);
    expect(effect.with.duration.unit).toBe('SECOND');
  });
});

describe('B. T1 Hypothermia — E2E interaction with combo', () => {
  it('B5: combo consumes cryo infliction → T1 triggers susceptibility on enemy', () => {
    const { result } = setupLrOnly();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 3 cryo inflictions
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.handleAddEvent(
          ENEMY_OWNER_ID, INFLICTION_COLUMNS.CRYO, (2 * FPS) + i * 10,
          { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
        );
      });
    }

    // Place combo (consumes cryo inflictions, which triggers T1)
    const col = findColumn(result.current, SLOT_LR, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // T1 should create a CRYO SUSCEPTIBILITY status on enemy
    const susceptibilityEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.id?.includes('SUSCEPTIBILITY')
        && ev.startFrame > 0,
    );
    // The combo's CONSUME INFLICTION triggers T1 → APPLY SUSCEPTIBILITY
    expect(susceptibilityEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. T2 Cryogenic Embrittlement — frame-level APPLY STAT on ult
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. T2 Cryogenic Embrittlement — DSL structure', () => {
  it('C1: ult frames have APPLY STAT SUSCEPTIBILITY CRYO to ENEMY', () => {
    const mainSegment = ULTIMATE_JSON.segments[1]; // After animation segment
    for (const frame of mainSegment.frames) {
      const applySusc = frame.clause[0].effects.find(
        (e: { verb: string; object: string; objectId?: string }) =>
          e.verb === VerbType.APPLY && e.object === NounType.STAT
          && e.objectId === 'SUSCEPTIBILITY',
      );
      expect(applySusc).toBeDefined();
      expect(applySusc.objectQualifier).toBe('CRYO');
      expect(applySusc.to).toBe(NounType.ENEMY);
    }
  });

  it('C2: multiplier VARY_BY TALENT_LEVEL [1.2, 1.5]', () => {
    const mainSegment = ULTIMATE_JSON.segments[1];
    const firstFrame = mainSegment.frames[0];
    const applySusc = firstFrame.clause[0].effects.find(
      (e: { verb: string; objectId?: string }) =>
        e.verb === VerbType.APPLY && e.objectId === 'SUSCEPTIBILITY',
    );
    expect(applySusc.with.multiplier.value[0]).toBe(1.2); // Talent level 1
    expect(applySusc.with.multiplier.value[1]).toBe(1.5); // Talent level 2
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. P2 Passive Stats
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. P2 passive stats (STR +20, Cryo DMG Dealt +10%)', () => {
  it('D1: P2 clause has APPLY STAT STRENGTH IS 20', () => {
    const strEffect = POTENTIAL_2_JSON.clause[0].effects.find(
      (e: { verb: string; objectId?: string }) =>
        e.verb === VerbType.APPLY && e.objectId === 'STRENGTH',
    );
    expect(strEffect).toBeDefined();
    expect(strEffect.with.value.value).toBe(20);
  });

  it('D2: P2 clause has APPLY STAT DAMAGE_BONUS CRYO IS 0.1', () => {
    const dmgEffect = POTENTIAL_2_JSON.clause[0].effects.find(
      (e: { verb: string; objectId?: string; objectQualifier?: string }) =>
        e.verb === VerbType.APPLY && e.objectId === 'DAMAGE_BONUS'
        && e.objectQualifier === 'CRYO',
    );
    expect(dmgEffect).toBeDefined();
    expect(dmgEffect.with.value.value).toBe(0.1);
  });

  it('D3: at P2, stat accumulator has STR +20', () => {
    const { result } = setupLrOnly();
    act(() => { setPotential(result.current, SLOT_LR, 2); });
    act(() => { placeBattleSkill(result.current, SLOT_LR, 5 * FPS); });

    const acc = getLastStatAccumulator();
    expect(acc).toBeDefined();
    const str = acc!.getStat(SLOT_LR, StatType.STRENGTH);
    // P2 adds +20 STR via passive clause
    expect(str).toBeGreaterThanOrEqual(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. P3 Baked into CS/ULT Damage
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. P3 damage multiplier baked into CS and ULT', () => {
  it('E1: ult damage VARY_BY POTENTIAL [1, 1, 1, 1.15, 1.15, 1.15]', () => {
    const mainSegment = ULTIMATE_JSON.segments[1];
    const firstFrame = mainSegment.frames[0];
    const dealEffect = firstFrame.clause[0].effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dealEffect).toBeDefined();
    const potMult = dealEffect.with.value.right.value;
    expect(potMult[0]).toBe(1);    // P0
    expect(potMult[2]).toBe(1);    // P2
    expect(potMult[3]).toBe(1.15); // P3
    expect(potMult[5]).toBe(1.15); // P5
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. P4 UE Cost Reduction
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. P4 UE cost reduction (240 → 204)', () => {
  it('F1: ult cost VARY_BY POTENTIAL [1, 1, 1, 1, 0.85, 0.85]', () => {
    const consumeEffect = ULTIMATE_JSON.clause[0].effects[0];
    expect(consumeEffect.verb).toBe(VerbType.CONSUME);
    expect(consumeEffect.object).toBe(NounType.ULTIMATE_ENERGY);
    const potMult = consumeEffect.with.value.right.value;
    expect(potMult[0]).toBe(1);    // P0: 240 × 1 = 240
    expect(potMult[3]).toBe(1);    // P3: 240 × 1 = 240
    expect(potMult[4]).toBe(0.85); // P4: 240 × 0.85 = 204
    expect(potMult[5]).toBe(0.85); // P5: 240 × 0.85 = 204
  });

  it('F2: registry returns 240 at P0, 204 at P4', () => {
    const costP0 = getUltimateEnergyCostForPotential(LAST_RITE_ID, 0);
    const costP4 = getUltimateEnergyCostForPotential(LAST_RITE_ID, 4);
    expect(costP0).toBe(240);
    expect(costP4).toBe(204);
  });
});
