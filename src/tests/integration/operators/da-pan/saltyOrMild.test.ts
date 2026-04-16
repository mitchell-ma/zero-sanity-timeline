/**
 * @jest-environment jsdom
 */

/**
 * Da Pan — Salty or Mild (T2) self-apply RESET behavior.
 *
 * Salty or Mild is a visual-only talent marker: 2s duration, limit 1, RESET.
 * Each ULTIMATE creates a new instance. Since interactionType=RESET, a second
 * ult within 2s should clamp the first instance and start a new one
 * (newest-clamps-oldest semantic), NOT be silently dropped.
 *
 * Regression guard for the `stackLimit <= 1` gate in handleEngineTrigger that
 * used to block ALL repeat self-applies at limit=1, ignoring RESET semantics.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType, StackInteractionType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const DA_PAN_JSON = require('../../../../model/game-data/operators/da-pan/da-pan.json');
const DA_PAN_ID: string = DA_PAN_JSON.id;
const SOM_JSON = require('../../../../model/game-data/operators/da-pan/talents/talent-salty-or-mild-talent.json');
const SOM_ID: string = SOM_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_DA_PAN = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setupDaPan() {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });
  return view;
}

function placeUlt(result: { current: AppResult }, atSecond: number) {
  act(() => { setUltimateEnergyToMax(result.current, SLOT_DA_PAN, atSecond * FPS); });
  const col = findColumn(result.current, SLOT_DA_PAN, NounType.ULTIMATE);
  const p = getMenuPayload(result.current, col!, atSecond * FPS);
  act(() => {
    result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
  });
}

function getSomEvents(app: AppResult) {
  return app.allProcessedEvents
    .filter((ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.name === SOM_ID)
    .sort((a, b) => a.startFrame - b.startFrame);
}

describe('Da Pan — Salty or Mild (T2) RESET self-apply', () => {
  it('A1: JSON shape — 2s duration, limit 1, RESET', () => {
    const p = SOM_JSON.properties;
    expect(p.duration.value.value).toBe(2);
    expect(p.stacks.limit.value).toBe(1);
    expect(p.stacks.interactionType).toBe(StackInteractionType.RESET);
  });

  it('A2: single ultimate creates exactly one 2s marker', () => {
    const { result } = setupDaPan();
    placeUlt(result, 2);
    const markers = getSomEvents(result.current);
    expect(markers.length).toBe(1);
    // 2s base duration, may be extended by the ult's own TIME_STOP animation.
    expect(eventDuration(markers[0])).toBeGreaterThanOrEqual(2 * FPS);
  });

  it('A3: two ults within 2s — newest clamps oldest (RESET), both events exist', () => {
    const { result } = setupDaPan();
    placeUlt(result, 2);
    placeUlt(result, 3);

    const markers = getSomEvents(result.current);
    // Two distinct marker events — the first RESET by the second, not dropped.
    expect(markers.length).toBe(2);

    const first = markers[0];
    const second = markers[1];
    expect(first.startFrame).toBeLessThan(second.startFrame);

    // The first was clamped by the RESET: its end should not extend past the
    // second's start frame (modulo a tiny tolerance from time-stop overlap).
    const firstEnd = first.startFrame + eventDuration(first);
    expect(firstEnd).toBeLessThanOrEqual(second.startFrame + 1);

    // First is marked CONSUMED/REFRESHED by the reset, second is alive.
    expect([EventStatusType.CONSUMED, EventStatusType.REFRESHED]).toContain(first.eventStatus);
    expect(second.eventStatus).not.toBe(EventStatusType.CONSUMED);
    expect(second.eventStatus).not.toBe(EventStatusType.REFRESHED);
  });

  it('A4: two ults far apart (> 2s) — first expires naturally, second is a fresh instance', () => {
    const { result } = setupDaPan();
    placeUlt(result, 2);
    placeUlt(result, 10);

    const markers = getSomEvents(result.current);
    expect(markers.length).toBe(2);

    // First should not be marked REFRESHED by RESET — it expired naturally
    // before the second was applied.
    const first = markers[0];
    const firstEnd = first.startFrame + eventDuration(first);
    expect(firstEnd).toBeLessThanOrEqual(markers[1].startFrame);
  });
});
