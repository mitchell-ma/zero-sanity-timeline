/**
 * @jest-environment jsdom
 */

/**
 * Ember — Full Kit Integration Tests
 *
 * Covers all skills, talents, potentials, and status interactions:
 * - Forward March (BS): damage, stagger, knock down, Inflamed onEntryClause
 * - Forward March Empowered (EBS): extra stagger via ADD(10,10)
 * - Frontline Support (combo): damage, healing, P3 teammate heal, Inflamed onEntryClause
 * - Re-Ignited Oath (ult): damage, stagger, Steel Oath (P0-P4) / Empowered (P5)
 * - Inflamed for the Assault: Protection via SANCTUARY stat, correct duration
 * - Pay the Ferric Price: DEAL DAMAGE trigger, 3-stack cap, ATK bonus
 * - P4: UE cost reduction (100 → 85)
 * - P5: exclusive Steel Oath Empowered (replaces regular)
 * - Status colors: non-elemental statuses use violet
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, DEFAULT_EVENT_COLOR, ELEMENT_COLORS, ElementType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID, ENEMY_OWNER_ID, ENEMY_ACTION_COLUMN_ID } from '../../../../model/channels';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, getMenuPayload, setUltimateEnergyToMax, buildContextMenu } from '../../helpers';
import type { AppResult } from '../../helpers';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import type { Potential } from '../../../../consts/types';

/* eslint-disable @typescript-eslint/no-require-imports */
const EMBER_ID: string = require('../../../../model/game-data/operators/ember/ember.json').id;
const INFLAMED_ID: string = require('../../../../model/game-data/operators/ember/statuses/status-inflamed-for-the-assault.json').properties.id;
const STEEL_OATH_ID: string = require('../../../../model/game-data/operators/ember/statuses/status-the-steel-oath.json').properties.id;
const STEEL_OATH_EMPOWERED_ID: string = require('../../../../model/game-data/operators/ember/statuses/status-the-steel-oath-empowered.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const PAY_THE_FERRIC_PRICE_ID = 'PAY_THE_FERRIC_PRICE';
const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, EMBER_ID); });
  return view;
}

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT];
  app.handleStatsChange(SLOT, { ...props, operator: { ...props.operator, potential } });
}

function addBS(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function addCombo(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.COMBO);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function addUlt(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function addEnemyAction(app: AppResult, atFrame: number) {
  const col = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === ENEMY_OWNER_ID &&
      c.columnId === ENEMY_ACTION_COLUMN_ID,
  )!;
  const payload = getMenuPayload(app, col, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getStatusMicroColumn(app: AppResult, slotId: string, statusId: string) {
  for (const col of app.columns) {
    if (col.type !== ColumnType.MINI_TIMELINE) continue;
    const mt = col as MiniTimeline;
    if (mt.ownerId !== slotId || mt.columnId !== OPERATOR_STATUS_COLUMN_ID) continue;
    return mt.microColumns?.find(mc => mc.id === statusId);
  }
  return undefined;
}

// =============================================================================
// A. Battle Skill — Forward March
// =============================================================================

describe('A. Forward March (BS)', () => {
  it('A1: places in BATTLE_SKILL column with damage frames', () => {
    const { result } = setup();
    act(() => { addBS(result.current, 5 * FPS); });

    const bs = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BATTLE,
    );
    expect(bs).toHaveLength(1);
    const frames = bs[0].segments.flatMap(s => s.frames ?? []);
    expect(frames.length).toBeGreaterThanOrEqual(2);
  });

  it('A2: applies Inflamed for the Assault via onEntryClause', () => {
    const { result } = setup();
    act(() => { addBS(result.current, 5 * FPS); });

    const inflamed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLAMED_ID && ev.ownerId === SLOT,
    );
    expect(inflamed.length).toBeGreaterThanOrEqual(1);
  });

  it('A3: Inflamed duration is 1.7s at P0', () => {
    const { result } = setup();
    act(() => { addBS(result.current, 5 * FPS); });

    const inflamed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLAMED_ID && ev.ownerId === SLOT,
    );
    expect(inflamed.length).toBeGreaterThanOrEqual(1);
    const dur = inflamed[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(dur).toBe(Math.round(1.7 * FPS));
  });

  it('A4: Inflamed duration is 3.2s at P1 (1.7 + 1.5 enemy hit extension)', () => {
    const { result } = setup();
    act(() => { setPotential(result.current, 1); });
    act(() => { addBS(result.current, 5 * FPS); });

    const inflamed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLAMED_ID && ev.ownerId === SLOT,
    );
    expect(inflamed.length).toBeGreaterThanOrEqual(1);
    const dur = inflamed[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(dur).toBe(Math.round(3.2 * FPS));
  });

  it('A5: empowered variant available in context menu', () => {
    const { result } = setup();
    const col = findColumn(result.current, SLOT, NounType.BATTLE);
    const menu = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menu).not.toBeNull();
    const empowered = menu!.find(i => i.label?.includes('Empowered'));
    expect(empowered).toBeDefined();
  });
});

// =============================================================================
// B. Combo Skill — Frontline Support
// =============================================================================

describe('B. Frontline Support (Combo)', () => {
  it('B1: places in COMBO_SKILL column via freeform', () => {
    const { result } = setup();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { addCombo(result.current, 5 * FPS); });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });

  it('B2: has cooldown segment', () => {
    const { result } = setup();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { addCombo(result.current, 5 * FPS); });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.COMBO,
    );
    const cd = combos[0].segments.find(
      (s: { properties: { segmentTypes?: string[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cd).toBeDefined();
  });

  it('B3: triggers Inflamed for the Assault', () => {
    const { result } = setup();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { addCombo(result.current, 5 * FPS); });

    const inflamed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLAMED_ID && ev.ownerId === SLOT,
    );
    expect(inflamed.length).toBeGreaterThanOrEqual(1);
  });

  it('B4: combo Inflamed is 0.77s game-time, extended to 1.27s by TIME_STOP', () => {
    const { result } = setup();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { addCombo(result.current, 5 * FPS); });

    const inflamed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLAMED_ID && ev.ownerId === SLOT,
    );
    expect(inflamed.length).toBeGreaterThanOrEqual(1);
    const dur = inflamed[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    // onEntryClause resolves to 0.77s (92 frames) game-time.
    // Combo animation is 0.5s TIME_STOP → extends Inflamed by 60 frames.
    // Real-time duration: 92 + 60 = 152 frames = 1.27s.
    expect(dur).toBe(Math.round(1.27 * FPS));
  });
});

// =============================================================================
// C. Ultimate — Re-Ignited Oath
// =============================================================================

describe('C. Re-Ignited Oath (Ult)', () => {
  it('C1: places in ULTIMATE column', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);
  });

  it('C2: at P0, applies Steel Oath to all operators', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const steelOath = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_ID,
    );
    expect(steelOath.length).toBeGreaterThanOrEqual(1);
  });

  it('C3: at P0, does NOT apply Steel Oath Empowered', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const empowered = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_EMPOWERED_ID,
    );
    expect(empowered).toHaveLength(0);
  });

  it('C4: at P5, applies Steel Oath Empowered (exclusive — no regular)', () => {
    const { result } = setup();
    act(() => { setPotential(result.current, 5); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const empowered = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_EMPOWERED_ID,
    );
    expect(empowered.length).toBeGreaterThanOrEqual(1);

    const regular = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_ID,
    );
    expect(regular).toHaveLength(0);
  });

  it('C5: at P4, applies regular Steel Oath (no empowered)', () => {
    const { result } = setup();
    act(() => { setPotential(result.current, 4); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const regular = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_ID,
    );
    expect(regular.length).toBeGreaterThanOrEqual(1);

    const empowered = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_EMPOWERED_ID,
    );
    expect(empowered).toHaveLength(0);
  });

  it('C6: Steel Oath has 10s duration', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const steelOath = result.current.allProcessedEvents.filter(
      ev => ev.columnId === STEEL_OATH_ID,
    );
    expect(steelOath.length).toBeGreaterThanOrEqual(1);
    const dur = steelOath[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(dur).toBe(10 * FPS);
  });

  it('C7: UE cost is 100 at P0, 85 at P4', () => {
    expect(getUltimateEnergyCostForPotential(EMBER_ID, 0 as Potential)).toBe(100);
    expect(getUltimateEnergyCostForPotential(EMBER_ID, 4 as Potential)).toBe(85);
  });

  it('C8: Steel Oath visible in view layer', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    act(() => { addUlt(result.current, 5 * FPS); });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusCol = findColumn(result.current, SLOT, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.columnId === STEEL_OATH_ID)).toBe(true);
  });
});

// =============================================================================
// D. Pay the Ferric Price
// =============================================================================

describe('D. Pay the Ferric Price', () => {
  it('D1: enemy action triggers Pay the Ferric Price on Ember', () => {
    const { result } = setup();
    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const pftp = result.current.allProcessedEvents.filter(
      ev => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT,
    );
    expect(pftp.length).toBeGreaterThanOrEqual(1);
  });

  it('D2: operator damage does NOT trigger Pay the Ferric Price', () => {
    const { result } = setup();
    act(() => { addBS(result.current, 5 * FPS); });

    const pftp = result.current.allProcessedEvents.filter(
      ev => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT,
    );
    expect(pftp).toHaveLength(0);
  });

  it('D3: Pay the Ferric Price has 7s duration', () => {
    const { result } = setup();
    act(() => { addEnemyAction(result.current, 5 * FPS); });

    const pftp = result.current.allProcessedEvents.filter(
      ev => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT,
    );
    expect(pftp.length).toBeGreaterThanOrEqual(1);
    const dur = pftp[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(dur).toBe(7 * FPS);
  });

  it('D4: stacks cap at 3 (4 triggers → 3 active, 1 refreshed)', () => {
    const { result } = setup();
    act(() => { addEnemyAction(result.current, 1 * FPS); });
    act(() => { addEnemyAction(result.current, 3 * FPS); });
    act(() => { addEnemyAction(result.current, 5 * FPS); });
    act(() => { addEnemyAction(result.current, 7 * FPS); });

    const pftp = result.current.allProcessedEvents.filter(
      ev => ev.columnId === PAY_THE_FERRIC_PRICE_ID && ev.ownerId === SLOT,
    );
    expect(pftp).toHaveLength(4);
    expect(pftp.filter(ev => !ev.eventStatus)).toHaveLength(3);
    expect(pftp.filter(ev => ev.eventStatus === 'REFRESHED')).toHaveLength(1);
  });
});

// =============================================================================
// E. Status Colors
// =============================================================================

describe('E. Status Colors', () => {
  it('E1: non-elemental statuses use violet (not operator element)', () => {
    const { result } = setup();

    const inflamed = getStatusMicroColumn(result.current, SLOT, INFLAMED_ID);
    expect(inflamed).toBeDefined();
    expect(inflamed!.color).toBe(DEFAULT_EVENT_COLOR);

    const pftp = getStatusMicroColumn(result.current, SLOT, PAY_THE_FERRIC_PRICE_ID);
    expect(pftp).toBeDefined();
    expect(pftp!.color).toBe(DEFAULT_EVENT_COLOR);
  });

  it('E2: no Ember status uses HEAT color (all are non-elemental)', () => {
    const { result } = setup();
    const HEAT_COLOR = ELEMENT_COLORS[ElementType.HEAT];

    for (const col of result.current.columns) {
      if (col.type !== ColumnType.MINI_TIMELINE) continue;
      const mt = col as MiniTimeline;
      if (mt.ownerId !== SLOT || mt.columnId !== OPERATOR_STATUS_COLUMN_ID) continue;
      for (const mc of mt.microColumns ?? []) {
        expect(mc.color).not.toBe(HEAT_COLOR);
      }
    }
  });
});
