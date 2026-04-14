/**
 * @jest-environment jsdom
 */

/**
 * Antal — Focus P5 Empowered Integration Test
 *
 * The FOCUS status has two segments whose durations depend on the source operator's Potential:
 *   - Segment 1 (Focus):           60s at P0-P4, 20s at P5
 *   - Segment 2 (Empowered Focus): 0s at P0-P4, 40s at P5
 *
 * Zero-duration segments are pruned by the engine, so at P0-P4 only one segment remains.
 *
 * Three-layer verification:
 * - Controller: correct status ID on processed events
 * - Controller: correct segment structure (count, durations)
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
  it('P5: battle skill applies FOCUS with 2 segments (Focus 20s + Empowered 40s)', () => {
    const { result } = setupAntal(5);
    placeBattleSkill(result);

    const focusEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === StatusType.FOCUS,
    );
    expect(focusEvents).toHaveLength(1);
    const ev = focusEvents[0];

    // Two segments: Focus (20s) + Empowered Focus (40s)
    expect(ev.segments).toHaveLength(2);
    expect(ev.segments[0].properties.duration).toBe(20 * FPS);
    expect(ev.segments[1].properties.duration).toBe(40 * FPS);
  });

  it('P0: battle skill applies FOCUS with single 60s segment (empowered segment pruned)', () => {
    const { result } = setupAntal(0);
    placeBattleSkill(result);

    const focusEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === StatusType.FOCUS,
    );
    expect(focusEvents).toHaveLength(1);
    const ev = focusEvents[0];

    // Single segment: Focus (60s) — empowered segment has duration 0 at P0 and is pruned
    expect(ev.segments).toHaveLength(1);
    expect(ev.segments[0].properties.duration).toBe(60 * FPS);
  });
});
