/**
 * @jest-environment jsdom
 */

/**
 * Da Pan — Prep Ingredients (T2 Salty or Mild) Integration Tests
 *
 * Prep Ingredients is a talent-derived status: 20s duration, limit 2 RESET.
 * Applied by the Salty or Mild talent when Da Pan performs the Ultimate.
 *
 * Interaction: while Prep Ingredients is active, performing Combo Skill
 * triggers a CONSUME of 1 Prep Ingredients stack + REDUCE CD of COMBO SKILL
 * by VARY_BY TALENT_LEVEL [0, 0.40, 0.40] PERCENTAGE.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType, AdjectiveType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  EventStatusType,
  InteractionModeType,
  StackInteractionType,
  SegmentType,
  UnitType,
} from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const DA_PAN_JSON = require('../../../../model/game-data/operators/da-pan/da-pan.json');
const DA_PAN_ID: string = DA_PAN_JSON.id;
const PREP_JSON = require('../../../../model/game-data/operators/da-pan/statuses/status-prep-ingredients.json');
const PREP_ID: string = PREP_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_DA_PAN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupDaPan() {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });
  return view;
}

function setTalentLevels(result: { current: AppResult }, level: number) {
  // Set BOTH talent slots — the engine's buildValueContext defaults to
  // talentOneLevel when resolving VARY_BY TALENT_LEVEL inside status trigger
  // effects, even for talent-2 statuses like Salty or Mild.
  const props = result.current.loadoutProperties[SLOT_DA_PAN];
  act(() => {
    result.current.handleStatsChange(SLOT_DA_PAN, {
      ...props,
      operator: { ...props.operator, talentOneLevel: level, talentTwoLevel: level },
    });
  });
}

function placeUlt(result: { current: AppResult }, atSecond: number) {
  act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, atSecond * FPS); });
  const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
  const p = getMenuPayload(result.current, col!, atSecond * FPS);
  act(() => {
    result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
  });
}

function placeCS(result: { current: AppResult }, atSecond: number) {
  const col = findColumn(result.current, SLOT_DA_PAN, NounType.COMBO);
  const p = getMenuPayload(result.current, col!, atSecond * FPS);
  act(() => {
    result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
  });
}

function getPrepEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.name === PREP_ID,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A. JSON shape
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Prep Ingredients JSON', () => {
  it('A1: 20s duration, limit 2, RESET interaction', () => {
    const p = PREP_JSON.properties;
    expect(p.duration.value.value).toBe(20);
    expect(p.stacks.limit.value).toBe(2);
    expect(p.stacks.interactionType).toBe(StackInteractionType.RESET);
  });

  it('A2: onTriggerClause fires on THIS OPERATOR PERFORM COMBO SKILL', () => {
    const cond = PREP_JSON.onTriggerClause[0].conditions[0];
    expect(cond.subjectDeterminer).toBe('THIS');
    expect(cond.subject).toBe(NounType.OPERATOR);
    expect(cond.verb).toBe(VerbType.PERFORM);
    expect(cond.object).toBe(NounType.SKILL);
    expect(cond.objectId).toBe(NounType.COMBO);
  });

  it('A3: trigger effects are CONSUME THIS EVENT (1 stack) + REDUCE CD of COMBO SKILL', () => {
    const effects = PREP_JSON.onTriggerClause[0].effects;
    expect(effects).toHaveLength(2);

    const consume = effects[0];
    expect(consume.verb).toBe(VerbType.CONSUME);
    expect(consume.object).toBe(NounType.EVENT);
    expect(consume.objectDeterminer).toBe('THIS');
    expect(consume.with.stacks.value).toBe(1);

    const reduce = effects[1];
    expect(reduce.verb).toBe(VerbType.REDUCE);
    expect(reduce.object).toBe(NounType.COOLDOWN);
    expect(reduce.of.object).toBe(NounType.SKILL);
    expect(reduce.of.objectId).toBe(NounType.COMBO);
    expect(reduce.of.of.object).toBe(NounType.OPERATOR);
    expect(reduce.of.of.determiner).toBe('THIS');
    expect(reduce.with.unit).toBe(UnitType.PERCENTAGE);
    expect(reduce.with.value.object).toBe(NounType.TALENT_LEVEL);
    expect(reduce.with.value.value).toEqual([0, 0.40, 0.40]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Trigger: Ultimate applies Prep Ingredients
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Ultimate applies Prep Ingredients', () => {
  it('B1: ultimate → 1 Prep Ingredients stack on Da Pan at 20s duration', () => {
    const { result } = setupDaPan();
    placeUlt(result, 2);

    const preps = getPrepEvents(result.current);
    expect(preps.length).toBe(1);
    // 20s base; extended by the ult's 1.4s TIME_STOP animation segment.
    expect(eventDuration(preps[0])).toBeGreaterThanOrEqual(20 * FPS);
    expect(eventDuration(preps[0])).toBeLessThan(22 * FPS);
  });

  it('B2: two ultimates → 2 Prep Ingredients stacks (at cap)', () => {
    const { result } = setupDaPan();
    placeUlt(result, 2);
    placeUlt(result, 8);

    const preps = getPrepEvents(result.current);
    expect(preps.length).toBeGreaterThanOrEqual(2);
    const active = preps.filter(
      (ev) => ev.eventStatus !== EventStatusType.CONSUMED && ev.eventStatus !== EventStatusType.REFRESHED,
    );
    expect(active.length).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. CS interaction: consume stack + reduce CD
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Prep Ingredients × Combo Skill', () => {
  it('C1: CS after ult consumes 1 Prep Ingredients stack', () => {
    const { result } = setupDaPan();
    setTalentLevels(result, 2);
    placeUlt(result, 2);
    placeCS(result, 8);

    const preps = getPrepEvents(result.current);
    const consumed = preps.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('C2: at talent level 2, CS cooldown is shortened by ~40%', () => {
    const { result } = setupDaPan();
    setTalentLevels(result, 2);

    // Baseline CS cooldown without Prep Ingredients
    const { result: baselineResult } = renderHook(() => useApp());
    act(() => {
      baselineResult.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID);
      baselineResult.current.setInteractionMode(InteractionModeType.FREEFORM);
    });
    placeCS(baselineResult, 8);
    const baselineCs = baselineResult.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    const baselineCdSeg = baselineCs!.segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    const baselineCd = baselineCdSeg!.properties.duration;

    // Run with ult → prep ingredients active → CS consumes stack & reduces CD
    placeUlt(result, 2);
    placeCS(result, 8);
    const cs = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    const cdSeg = cs!.segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    const reducedCd = cdSeg!.properties.duration;

    expect(reducedCd).toBeLessThan(baselineCd);
    // 40% reduction: reducedCd should be about 60% of baseline
    const ratio = reducedCd / baselineCd;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  });

  it('C3: at talent level 0, CS cooldown is not reduced (0% scaling)', () => {
    const { result } = setupDaPan();
    setTalentLevels(result, 0);
    placeUlt(result, 2);

    const { result: baselineResult } = renderHook(() => useApp());
    act(() => {
      baselineResult.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID);
      baselineResult.current.setInteractionMode(InteractionModeType.FREEFORM);
    });
    placeCS(baselineResult, 8);
    const baselineCs = baselineResult.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    const baselineCd = baselineCs!.segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    )!.properties.duration;

    placeCS(result, 8);
    const cs = result.current.allProcessedEvents.find(
      (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.columnId === NounType.COMBO,
    );
    const cd = cs!.segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    )!.properties.duration;

    expect(cd).toBe(baselineCd);
  });
});

// Silence unused import lint
void AdjectiveType;
