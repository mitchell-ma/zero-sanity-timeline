/**
 * @jest-environment jsdom
 */

/**
 * Last Rite — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (BS, combo, ultimate)
 * 2. Battle skill applies Hypothermic Perfusion status
 * 3. Combo skill trigger (cryo infliction stacks >= 3) and cooldown
 * 4. Ultimate energy cost (240 P0, 204 P4 — highest in game)
 * 5. View-layer visibility
 * 6. JSON structure verification for talents and statuses
 *
 * Three-layer verification:
 * - Context menu: menu items are available and enabled
 * - Controller: events appear in allProcessedEvents with correct properties
 * - View: computeTimelinePresentation includes events in the correct columns
 */

import { renderHook, act } from '@testing-library/react';
import {
  NounType, VerbType, DeterminerType, AdjectiveType,
  CardinalityConstraintType, ValueOperation,
} from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType, SegmentType, StatType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { getLastStatAccumulator } from '../../../../controller/timeline/eventQueueController';
import { ENEMY_OWNER_ID } from '../../../../model/channels';
import {
  findColumn, buildContextMenu, getMenuPayload,
  setUltimateEnergyToMax,
} from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAST_RITE_ID: string = require('../../../../model/game-data/operators/last-rite/last-rite.json').id;
const BATTLE_SKILL_JSON = require('../../../../model/game-data/operators/last-rite/skills/battle-skill-esoteric-legacy.json');
const COMBO_SKILL_JSON = require('../../../../model/game-data/operators/last-rite/skills/combo-skill-winters-devourer.json');
const ULTIMATE_JSON = require('../../../../model/game-data/operators/last-rite/skills/ultimate-vigil-services.json');
const HYPOTHERMIA_JSON = require('../../../../model/game-data/operators/last-rite/talents/talent-hypothermia-talent.json');
const CRYOGENIC_JSON = require('../../../../model/game-data/operators/last-rite/talents/talent-cryogenic-embrittlement-talent.json');
const PERFUSION_JSON = require('../../../../model/game-data/operators/last-rite/statuses/status-hypothermic-perfusion.json');

const BATTLE_SKILL_ID: string = BATTLE_SKILL_JSON.properties.id;
const COMBO_SKILL_ID: string = COMBO_SKILL_JSON.properties.id;
const ULTIMATE_ID: string = ULTIMATE_JSON.properties.id;
const PERFUSION_ID: string = PERFUSION_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LAST_RITE = 'slot-0';

// ── Game-data verified constants ──────────────────────────────────────────────
const COMBO_COOLDOWN_L12_SEC = 8;
const ULTIMATE_ENERGY_P0 = 240;
const ULTIMATE_ENERGY_P4 = 204;

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupLastRite() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_LAST_RITE, LAST_RITE_ID); });
  return view;
}



// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Core Placement', () => {
  it('A0: basic attack placed without crash', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const basics = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basics.length).toBeGreaterThanOrEqual(1);
  });

  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill placed in freeform mode', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // In freeform mode, combo can be placed without trigger
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 3 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);
  });

  it('A3: ultimate placed with 240 energy', () => {
    const { result } = setupLastRite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAST_RITE, 0); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Hypothermic Perfusion
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Battle Skill Hypothermic Perfusion', () => {
  it('B1: battle skill has active segment and processes without crash', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);

    const totalDuration = eventDuration(battles[0]);
    expect(totalDuration).toBeGreaterThan(0);
    expect(battles[0].segments.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Combo Skill', () => {
  it('C1: combo has 8s cooldown at L12', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    const segments = combos[0].segments;
    const cooldownSeg = segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN)
        || s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();

    const cooldownFrames = cooldownSeg!.properties.duration;
    expect(cooldownFrames).toBe(COMBO_COOLDOWN_L12_SEC * FPS);
  });

  it('C2: combo processes correctly in freeform', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].eventStatus).not.toBe(EventStatusType.CONSUMED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate — 240 Energy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — Ultimate Energy', () => {
  it('D1: P0 costs 240 energy, P4 costs 204 energy', () => {
    const p0Cost = getUltimateEnergyCostForPotential(LAST_RITE_ID, 0);
    expect(p0Cost).toBe(ULTIMATE_ENERGY_P0);

    const p4Cost = getUltimateEnergyCostForPotential(LAST_RITE_ID, 4);
    expect(p4Cost).toBe(ULTIMATE_ENERGY_P4);
  });

  it('D2: ultimate processes with animation and damage frames', () => {
    const { result } = setupLastRite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAST_RITE, 0); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);

    const animSeg = ultimates[0].segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();

    const totalDuration = eventDuration(ultimates[0]);
    expect(totalDuration).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite Skills — View Layer', () => {
  it('E1: battle skill visible in presentation', () => {
    const { result } = setupLastRite();
    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(col!.key);
    expect(vm).toBeDefined();
    const bsEvents = vm!.events.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
  });

  it('E2: combo skill visible in presentation', () => {
    const { result } = setupLastRite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(col!.key);
    expect(vm).toBeDefined();
    const comboEvents = vm!.events.filter(
      (ev) => ev.ownerId === SLOT_LAST_RITE && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Hypothermic Perfusion Status — JSON Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite — Hypothermic Perfusion Status', () => {
  it('F1: properties — id, duration 15s, stacks limit 1, RESET, to CONTROLLED OPERATOR', () => {
    const props = PERFUSION_JSON.properties;
    expect(props.id).toBe(PERFUSION_ID);
    expect(props.duration.value.verb).toBe(VerbType.IS);
    expect(props.duration.value.value).toBe(15);
    expect(props.stacks.limit.value).toBe(1);
    expect(props.stacks.interactionType).toBe(VerbType.RESET);
    expect(props.to).toBe(NounType.OPERATOR);
    expect(props.toDeterminer).toBe(DeterminerType.CONTROLLED);
    expect(props.eventIdType).toBe(NounType.SKILL_STATUS);
  });

  it('F2: onTriggerClause — CONTROLLED OPERATOR PERFORM SKILL FINAL_STRIKE', () => {
    const cond = PERFUSION_JSON.onTriggerClause[0].conditions[0];
    expect(cond.subjectDeterminer).toBe(DeterminerType.CONTROLLED);
    expect(cond.subject).toBe(NounType.OPERATOR);
    expect(cond.verb).toBe(VerbType.PERFORM);
    expect(cond.object).toBe(NounType.SKILL);
    expect(cond.objectId).toBe(NounType.FINAL_STRIKE);
  });

  it('F3: trigger effects — DEAL CRYO DAMAGE, APPLY INFLICTION, DEAL STAGGER, CONSUME EVENT', () => {
    const effects = PERFUSION_JSON.onTriggerClause[0].effects;
    expect(effects).toHaveLength(4);

    // DEAL CRYO DAMAGE with MULT(VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL)
    expect(effects[0].verb).toBe(VerbType.DEAL);
    expect(effects[0].object).toBe(NounType.DAMAGE);
    expect(effects[0].objectQualifier).toBe(AdjectiveType.CRYO);
    expect(effects[0].with.value.operation).toBe(ValueOperation.MULT);
    expect(effects[0].with.value.left.object).toBe(NounType.SKILL_LEVEL);
    expect(effects[0].with.value.left.value).toHaveLength(12);
    expect(effects[0].with.value.right.object).toBe(NounType.POTENTIAL);
    expect(effects[0].with.value.right.value).toEqual([1, 1, 1, 1, 1, 1.2]);

    // APPLY CRYO INFLICTION
    expect(effects[1].verb).toBe(VerbType.APPLY);
    expect(effects[1].object).toBe(NounType.STATUS);
    expect(effects[1].objectId).toBe(NounType.INFLICTION);
    expect(effects[1].objectQualifier).toBe(AdjectiveType.CRYO);

    // DEAL STAGGER (P1+ gated via VARY_BY POTENTIAL)
    expect(effects[2].verb).toBe(VerbType.DEAL);
    expect(effects[2].object).toBe(NounType.STAGGER);
    expect(effects[2].with.value.object).toBe(NounType.POTENTIAL);
    expect(effects[2].with.value.value).toEqual([0, 5, 5, 5, 5, 5]);

    // CONSUME THIS EVENT
    expect(effects[3].verb).toBe(VerbType.CONSUME);
    expect(effects[3].object).toBe(NounType.EVENT);
  });

  it('F4: P1 passive clause — APPLY STAT DAMAGE_BONUS FINAL_STRIKE', () => {
    const clause = PERFUSION_JSON.clause[0];
    // Gated by HAVE POTENTIAL >= 1
    const cond = clause.conditions[0];
    expect(cond.verb).toBe(VerbType.HAVE);
    expect(cond.object).toBe(NounType.POTENTIAL);
    expect(cond.cardinalityConstraint).toBe(CardinalityConstraintType.GREATER_THAN_EQUAL);
    expect(cond.value.value).toBe(1);

    // APPLY STAT DAMAGE_BONUS with objectQualifier FINAL_STRIKE
    const effect = clause.effects[0];
    expect(effect.verb).toBe(VerbType.APPLY);
    expect(effect.object).toBe(NounType.STAT);
    expect(effect.objectId).toBe(NounType.DAMAGE_BONUS);
    expect(effect.objectQualifier).toBe(NounType.FINAL_STRIKE);
    expect(effect.with.value.value).toBe(0.2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Battle Skill — APPLY Status (updated DSL)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite — Battle Skill DSL Structure', () => {
  const frameEffects = BATTLE_SKILL_JSON.segments[0].frames[0].clause[0].effects;

  it('G1: frame effects include APPLY STATUS HYPOTHERMIC_PERFUSION', () => {
    const applyEffect = frameEffects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.objectId === PERFUSION_ID,
    );
    expect(applyEffect).toBeDefined();
    expect(applyEffect.object).toBe(NounType.STATUS);
    expect(applyEffect.toDeterminer).toBe(DeterminerType.CONTROLLED);
    expect(applyEffect.to).toBe(NounType.OPERATOR);
    expect(applyEffect.with.duration.value.value).toBe(15);
  });

  it('G2: frame effects include RETURN SKILL_POINT with P5 +5', () => {
    const returnEffect = frameEffects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.RETURN && e.object === NounType.SKILL_POINT,
    );
    expect(returnEffect).toBeDefined();
    expect(returnEffect.with.value.operation).toBe(ValueOperation.ADD);
    expect(returnEffect.with.value.left.value).toBe(30);
    expect(returnEffect.with.value.right.object).toBe(NounType.POTENTIAL);
    expect(returnEffect.with.value.right.value).toEqual([0, 0, 0, 0, 0, 5]);
  });

  it('G3: no DEAL DAMAGE on BS frame (moved to Hypothermic Perfusion trigger)', () => {
    const dealDamage = frameEffects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dealDamage).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Combo Skill — Trigger + CONSUME (updated DSL)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite — Combo Skill DSL Structure', () => {
  it('H1: activation window — STACKS of CRYO INFLICTION STATUS of ENEMY >= 3', () => {
    const cond = COMBO_SKILL_JSON.activationWindow.onTriggerClause[0].conditions[0];
    expect(cond.subject).toBe(NounType.STACKS);
    expect(cond.verb).toBe(VerbType.IS);
    expect(cond.cardinalityConstraint).toBe(CardinalityConstraintType.GREATER_THAN_EQUAL);
    expect(cond.value.value).toBe(3);

    // of chain: STATUS INFLICTION CRYO of ENEMY
    expect(cond.of.object).toBe(NounType.STATUS);
    expect(cond.of.objectId).toBe(NounType.INFLICTION);
    expect(cond.of.objectQualifier).toBe(AdjectiveType.CRYO);
    expect(cond.of.of.object).toBe(NounType.ENEMY);
  });

  it('H2: first frame includes CONSUME STATUS INFLICTION CRYO', () => {
    const firstFrameEffects = COMBO_SKILL_JSON.segments[1].frames[0].clause[0].effects;
    const consumeEffect = firstFrameEffects.find(
      (e: Record<string, unknown>) => e.verb === VerbType.CONSUME && e.objectId === NounType.INFLICTION,
    );
    expect(consumeEffect).toBeDefined();
    expect(consumeEffect.object).toBe(NounType.STATUS);
    expect(consumeEffect.objectQualifier).toBe(AdjectiveType.CRYO);
    expect(consumeEffect.fromObject).toBe(NounType.ENEMY);
  });

  it('H3: UE recovery — base 40 + 15 × STACKS of CRYO INFLICTION', () => {
    const ueEffect = COMBO_SKILL_JSON.clause[0].effects[0];
    expect(ueEffect.verb).toBe(VerbType.RECOVER);
    expect(ueEffect.object).toBe(NounType.ULTIMATE_ENERGY);
    expect(ueEffect.with.value.operation).toBe(ValueOperation.ADD);
    expect(ueEffect.with.value.left.value).toBe(40);

    // 15 × STACKS
    const mult = ueEffect.with.value.right;
    expect(mult.operation).toBe(ValueOperation.MULT);
    expect(mult.left.value).toBe(15);
    expect(mult.right.object).toBe(NounType.STACKS);
    expect(mult.right.of.objectId).toBe(NounType.INFLICTION);
    expect(mult.right.of.objectQualifier).toBe(AdjectiveType.CRYO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. T1 Hypothermia — Fixed DSL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite — T1 Hypothermia DSL', () => {
  it('I1: trigger condition — THIS OPERATOR CONSUME STATUS INFLICTION ARTS', () => {
    const cond = HYPOTHERMIA_JSON.onTriggerClause[0].conditions[0];
    expect(cond.subjectDeterminer).toBe(DeterminerType.THIS);
    expect(cond.subject).toBe(NounType.OPERATOR);
    expect(cond.verb).toBe(VerbType.CONSUME);
    expect(cond.object).toBe(NounType.STATUS);
    expect(cond.objectId).toBe(NounType.INFLICTION);
    expect(cond.objectQualifier).toBe(AdjectiveType.ARTS);
  });

  it('I2: effect — APPLY SUSCEPTIBILITY CRYO with MULT(STACKS of CRYO INFLICTION, VARY_BY TALENT_LEVEL)', () => {
    const effect = HYPOTHERMIA_JSON.onTriggerClause[0].effects[0];
    expect(effect.verb).toBe(VerbType.APPLY);
    expect(effect.object).toBe(NounType.STATUS);
    expect(effect.objectId).toBe(NounType.SUSCEPTIBILITY);
    expect(effect.objectQualifier).toBe(AdjectiveType.CRYO);
    expect(effect.to).toBe(NounType.ENEMY);

    // value = MULT(IS STACKS of CRYO INFLICTION STATUS of ENEMY, VARY_BY TALENT_LEVEL [0.02, 0.04])
    const val = effect.with.value;
    expect(val.operation).toBe(ValueOperation.MULT);

    // Left: IS STACKS of CRYO INFLICTION STATUS of ENEMY
    expect(val.left.verb).toBe(VerbType.IS);
    expect(val.left.object).toBe(NounType.STACKS);
    expect(val.left.of.objectId).toBe(NounType.INFLICTION);
    expect(val.left.of.objectQualifier).toBe(AdjectiveType.CRYO);
    expect(val.left.of.of.object).toBe(NounType.ENEMY);

    // Right: VARY_BY TALENT_LEVEL [0.02, 0.04]
    expect(val.right.verb).toBe(VerbType.VARY_BY);
    expect(val.right.object).toBe(NounType.TALENT_LEVEL);
    expect(val.right.value).toEqual([0.02, 0.04]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. T2 Cryogenic Embrittlement — frame-level APPLY STAT on ultimate
// ═══════════════════════════════════════════════════════════════════════════════

describe('Last Rite — T2 Cryogenic Embrittlement DSL', () => {
  it('J1: ult frames have APPLY STAT SUSCEPTIBILITY CRYO with multiplier VARY_BY TALENT_LEVEL', () => {
    // T2 is a frame-level stat, not a status — it multiplies existing cryo susceptibility
    const activeSegment = ULTIMATE_JSON.segments[1];
    for (const frame of activeSegment.frames) {
      const effects = frame.clause[0].effects;
      const applyStat = effects.find(
        (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.object === NounType.STAT,
      );
      expect(applyStat).toBeDefined();
      expect(applyStat.objectId).toBe(NounType.SUSCEPTIBILITY);
      expect(applyStat.objectQualifier).toBe(AdjectiveType.CRYO);
      expect(applyStat.to).toBe(NounType.ENEMY);
      // multiplier key — this multiplies existing cryo susceptibility, not a flat value
      expect(applyStat.with.multiplier.verb).toBe(VerbType.VARY_BY);
      expect(applyStat.with.multiplier.object).toBe(NounType.TALENT_LEVEL);
      expect(applyStat.with.multiplier.value).toEqual([1.2, 1.5]);
    }
  });

  it('J2: talent is description-only (no onTriggerClause)', () => {
    expect(CRYOGENIC_JSON.onTriggerClause).toBeUndefined();
    expect(CRYOGENIC_JSON.properties.eventIdType).toBe(NounType.TALENT);
  });

  it('J3: frame-level APPLY STAT does not persist in stat accumulator after frame ends', () => {
    const { result } = setupLastRite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LAST_RITE, 0); });

    const col = findColumn(result.current, SLOT_LAST_RITE, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // After the pipeline processes the ult (including its frame-level APPLY STAT),
    // the stat accumulator should NOT retain any susceptibility stat on the enemy.
    // Frame-level stats are reversed after each frame's snapshot.
    const accumulator = getLastStatAccumulator();
    expect(accumulator).not.toBeNull();
    const susceptibility = accumulator!.getStat(ENEMY_OWNER_ID, StatType.SUSCEPTIBILITY);
    expect(susceptibility).toBe(0);
  });
});
