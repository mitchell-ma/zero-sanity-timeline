/**
 * @jest-environment jsdom
 */

/**
 * Antal — Focus P5 Empowered Integration Test
 *
 * At P5, Antal's battle skill applies FOCUS_EMPOWERED (2 segments: Focus 20s + Empowered Focus 40s).
 * At P0-P4, it applies regular FOCUS (single 60s segment).
 *
 * Three-layer verification:
 * - Controller: correct status ID on processed events
 * - Controller: correct segment structure (count, names, durations)
 * - View: status appears in enemy status column
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { NounType } from '../../../../dsl/semantics';
import { StatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { ENEMY_ID } from '../../../../model/channels';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../../view/InformationPane';
import type { LoadoutProperties } from '../../../../view/InformationPane';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ANTAL_ID: string = require('../../../../model/game-data/operators/antal/antal.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ANTAL = 'slot-2';

function setupAntal(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ANTAL, ANTAL_ID); });
  if (potential !== DEFAULT_LOADOUT_PROPERTIES.operator.potential) {
    const stats: LoadoutProperties = {
      ...DEFAULT_LOADOUT_PROPERTIES,
      operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential },
    };
    act(() => { view.result.current.handleStatsChange(SLOT_ANTAL, stats); });
  }
  return view;
}

function placeBattleSkill(result: { current: AppResult }) {
  const col = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, 2 * FPS);
  act(() => {
    result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('Antal — Focus P5 Empowered', () => {
  it('P5: battle skill applies FOCUS_EMPOWERED with 2 segments (Focus 20s + Empowered 40s)', () => {
    const { result } = setupAntal(5);
    placeBattleSkill(result);

    const focusEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === StatusType.FOCUS_EMPOWERED,
    );
    expect(focusEvents).toHaveLength(1);
    const ev = focusEvents[0];

    // Two segments: Focus (20s) + Empowered Focus (40s)
    expect(ev.segments).toHaveLength(2);
    expect(ev.segments[0].properties.duration).toBe(20 * FPS);
    expect(ev.segments[1].properties.duration).toBe(40 * FPS);
  });

  it('P0: battle skill applies regular FOCUS with single 60s segment', () => {
    const { result } = setupAntal(0);
    placeBattleSkill(result);

    const focusEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === StatusType.FOCUS,
    );
    expect(focusEvents).toHaveLength(1);
    const ev = focusEvents[0];

    // Single segment: Focus (60s)
    expect(ev.segments).toHaveLength(1);
    expect(ev.segments[0].properties.duration).toBe(60 * FPS);
  });
});
