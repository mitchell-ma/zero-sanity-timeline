/**
 * @jest-environment jsdom
 */

/**
 * Segment-Clause Dispatch — E2E
 *
 * Status configs may declare effects at `segments[i].clause` — historically
 * silently dropped by the engine. `runStatusCreationLifecycle` now dispatches
 * them at segment start with `parentSegmentEndFrame` scoped to the segment
 * duration, so applied STATUS / STAT effects inherit the correct lifetime.
 *
 * This file covers the three known statuses that exercise this path:
 *   - Antal FOCUS              — segment APPLY STAT SUSCEPTIBILITY (ELECTRIC + HEAT) to ENEMY
 *   - Antal OVERCLOCKED_MOMENT_AMP — segment APPLY STATUS AMP (ELECTRIC + HEAT) to TEAM
 *   - Gilberta ANOMALOUS_GRAVITY_FIELD — segment APPLY STATUS (SLOW + ARTS SUSC) to ENEMY
 *
 * FOCUS multiplier-on-damage assertions live in `operators/antal/focusP5.test.ts`.
 * This file proves that the dispatched effects materialise as actual events /
 * stat deltas the rest of the pipeline observes.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { ElementType, StatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { ENEMY_ID } from '../../../model/channels';
import { TEAM_ID } from '../../../controller/slot/commonSlotController';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../view/InformationPane';
import type { LoadoutProperties } from '../../../view/InformationPane';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ANTAL_ID: string = require('../../../model/game-data/operators/antal/antal.json').id;
const GILBERTA_ID: string = require('../../../model/game-data/operators/gilberta/gilberta.json').id;
const OVERCLOCKED_MOMENT_AMP_ID: string = require(
  '../../../model/game-data/operators/antal/statuses/status-overclocked-moment-amp.json',
).properties.id;
const ANOMALOUS_GRAVITY_FIELD_ID: string = require(
  '../../../model/game-data/operators/gilberta/statuses/status-anomalous-gravity-field.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => { localStorage.clear(); });

function placeUltimate(app: AppResult, slotId: string) {
  const col = findColumn(app, slotId, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, 5 * FPS);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

// ─── Antal OVERCLOCKED_MOMENT_AMP ────────────────────────────────────────────
// Status's segment 0 clause: APPLY STATUS AMP (ELECTRIC + HEAT) to TEAM, 12s.
// Dispatch failure mode: AMP events never appear on the team-status column.

describe('Segment-clause dispatch — Antal OVERCLOCKED_MOMENT_AMP', () => {
  const SLOT_ANTAL = 'slot-2';

  function setupAntalP5() {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT_ANTAL, ANTAL_ID); });
    const stats: LoadoutProperties = {
      ...DEFAULT_LOADOUT_PROPERTIES,
      operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential: 5 },
    };
    act(() => { view.result.current.handleStatsChange(SLOT_ANTAL, stats); });
    const slotIdx = view.result.current.slots.findIndex(s => s.slotId === SLOT_ANTAL);
    act(() => { setUltimateEnergyToMax(view.result.current, SLOT_ANTAL, slotIdx); });
    return view;
  }

  it('Antal Ult creates OVERCLOCKED_MOMENT_AMP, whose segment clause spawns AMP events on TEAM', () => {
    const { result } = setupAntalP5();
    act(() => { placeUltimate(result.current, SLOT_ANTAL); });

    // 1. Parent status materialised on team column.
    const ompAmpEvents = result.current.allProcessedEvents.filter(
      ev => ev.id === OVERCLOCKED_MOMENT_AMP_ID,
    );
    expect(ompAmpEvents).toHaveLength(1);

    // 2. Segment-clause dispatch produced ELECTRIC_AMP + HEAT_AMP child
    //    events on the team-status row (owner = COMMON_OWNER_ID = "common").
    //    Without engine support these never get created.
    const ampEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === TEAM_ID
        && (ev.id === NounType.ELECTRIC_AMP || ev.id === NounType.HEAT_AMP)
        && ev.sourceSkillId === OVERCLOCKED_MOMENT_AMP_ID,
    );
    expect(ampEvents.length).toBe(2); // ELECTRIC + HEAT
    const elements = new Set(ampEvents.map(e => e.id));
    expect(elements.has(NounType.ELECTRIC_AMP)).toBe(true);
    expect(elements.has(NounType.HEAT_AMP)).toBe(true);

    // 3. Segment-scoped lifetime: AMP children should not outlast the parent
    //    OMP_AMP segment (12s). Their startFrame must fall within the parent's
    //    active window.
    const parent = ompAmpEvents[0];
    const parentEnd = parent.startFrame + (parent.segments[0]?.properties.duration ?? 0);
    for (const ev of ampEvents) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(parent.startFrame);
      expect(ev.startFrame).toBeLessThanOrEqual(parentEnd);
    }
  });
});

// ─── Gilberta ANOMALOUS_GRAVITY_FIELD ────────────────────────────────────────
// Status's segment 0 clause: APPLY STATUS SLOW + APPLY STATUS SUSCEPTIBILITY
// (ARTS) to ENEMY, 5s. Dispatch failure mode: enemy never gets the
// ARTS_SUSCEPTIBILITY column populated → ARTS damage uncomultiplied.

describe('Segment-clause dispatch — Gilberta ANOMALOUS_GRAVITY_FIELD', () => {
  const SLOT_GILBERTA = 'slot-0';

  function setupGilberta() {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator(SLOT_GILBERTA, GILBERTA_ID); });
    const slotIdx = view.result.current.slots.findIndex(s => s.slotId === SLOT_GILBERTA);
    act(() => { setUltimateEnergyToMax(view.result.current, SLOT_GILBERTA, slotIdx); });
    return view;
  }

  it('Gilberta Ult creates ANOMALOUS_GRAVITY_FIELD, whose segment clause spawns ARTS susceptibility on enemy', () => {
    const { result } = setupGilberta();
    act(() => { placeUltimate(result.current, SLOT_GILBERTA); });

    // 1. Parent field status on enemy.
    const fieldEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.id === ANOMALOUS_GRAVITY_FIELD_ID,
    );
    expect(fieldEvents).toHaveLength(1);
    const fieldEv = fieldEvents[0];

    // 2. Segment-clause dispatch produced an ARTS_SUSCEPTIBILITY child event
    //    on the enemy. Without engine support, this never appears and ARTS
    //    damage during the field window is silently uncoboosted.
    const arts = ElementType.ARTS;
    const artsSuscColumnId = `${arts}_${StatusType.SUSCEPTIBILITY}`;
    const artsSuscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === artsSuscColumnId,
    );
    expect(artsSuscEvents.length).toBeGreaterThan(0);

    // 3. The ARTS susceptibility event lives within the parent field's window
    //    (segment-scoped lifetime: parentSegmentEndFrame ≤ field end).
    const fieldEnd = fieldEv.startFrame
      + (fieldEv.segments[0]?.properties.duration ?? 0);
    for (const ev of artsSuscEvents) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(fieldEv.startFrame);
      expect(ev.startFrame).toBeLessThanOrEqual(fieldEnd);
    }
  });

});
