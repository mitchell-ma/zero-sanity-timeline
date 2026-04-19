/**
 * @jest-environment jsdom
 */

/**
 * Regression test for stack-label invariance under CONSUME.
 *
 * Bug: when CS consumed a Prep Ingredients stack, the OTHER surviving stacks'
 * labels shifted (e.g. an earlier "I" → "II"). Position should be the
 * apply-time concurrent-stack count and remain stable once the event exists.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeStatusViewOverrides } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const DA_PAN_JSON = require('../../../../model/game-data/operators/da-pan/da-pan.json');
const DA_PAN_ID: string = DA_PAN_JSON.id;
const PREP_ID: string = require('../../../../model/game-data/operators/da-pan/statuses/status-prep-ingredients.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_DA_PAN = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });
  return view;
}

function setTalent2(result: { current: AppResult }, level: number) {
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

function getOverrides(app: AppResult) {
  return computeStatusViewOverrides(app.allProcessedEvents, app.columns);
}

function getPrepLabels(app: AppResult): { startFrame: number; consumed: boolean; label: string | undefined; stacks: number | undefined; status: string | undefined }[] {
  const overrides = getOverrides(app);
  const preps = app.allProcessedEvents
    .filter((ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.name === PREP_ID)
    .sort((a, b) => a.startFrame - b.startFrame);
  return preps.map((ev) => ({
    startFrame: ev.startFrame,
    consumed: ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED,
    label: overrides.get(ev.uid)?.label,
    stacks: ev.stacks,
    status: ev.eventStatus,
  }));
}

describe('Da Pan — Prep Ingredients label invariance', () => {
  it('two ults → 1, 2 (no consume yet)', () => {
    const { result } = setup();
    setTalent2(result, 2);
    placeUlt(result, 2);
    placeUlt(result, 8);

    const labels = getPrepLabels(result.current).map((p) => p.label);
    expect(labels[0]).toMatch(/\s1$/);
    expect(labels[1]).toMatch(/\s2$/);
  });

  it('two ults + CS consume → historical stacks keep their apply-time labels; leftover labelled by current pool', () => {
    const { result } = setup();
    setTalent2(result, 2);

    placeUlt(result, 2);
    placeUlt(result, 8);
    const beforeConsume = getPrepLabels(result.current);
    expect(beforeConsume[0].label).toMatch(/\s1$/);
    expect(beforeConsume[1].label).toMatch(/\s2$/);

    placeCS(result, 14);

    // Engine "absorb-and-reapply" CONSUME pattern marks both prior stacks
    // CONSUMED and emits a fresh leftover event. Verify labels by start
    // frame so the historical "1"/"2" stay stable while the leftover
    // re-labels by current pool.
    const after = getPrepLabels(result.current);
    const a = after.find((p) => p.startFrame === beforeConsume[0].startFrame);
    const b = after.find((p) => p.startFrame === beforeConsume[1].startFrame);
    expect(a?.label).toMatch(/\s1$/);
    expect(b?.label).toMatch(/\s2$/);
    // Leftover (alive) event should be labelled by the new pool size (1).
    const leftover = after.find((p) => !p.consumed);
    expect(leftover?.label).toMatch(/\s1$/);
  });

  it('three ults across multiple consumes → labels stay stable', () => {
    const { result } = setup();
    setTalent2(result, 2);

    placeUlt(result, 2);
    placeUlt(result, 8);
    placeCS(result, 14);
    placeUlt(result, 22);

    const all = getPrepLabels(result.current);
    // Earliest two events were CONSUMED (their historical apply-time
    // positions = 1 and 2): "1", "2".
    const consumed = all.filter((p) => p.consumed).sort((a, b) => a.startFrame - b.startFrame);
    expect(consumed[0]?.label).toMatch(/\s1$/);
    expect(consumed[1]?.label).toMatch(/\s2$/);
  });
});
