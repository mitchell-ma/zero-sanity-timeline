/**
 * @jest-environment jsdom
 */

/**
 * Snowshine — Integration Tests
 *
 * Tests the full user flow through useApp for Snowshine's skills:
 * A. Core skill placement (battle skill, combo, ultimate)
 * B. Battle Skill — Protection + Saturated Defense Retaliation marker
 * C. BS Retaliation chain — enemy hits trigger SAR Burst (damage / cryo / UE / P5 SP)
 * D. Combo — SAR Assistance applied to all operators, T1 baked-in scaling
 * E. Ultimate — Snow Zone created with forced Solidification, P3 duration gate
 * F. View layer — all new statuses visible in computeTimelinePresentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items are available and enabled
 *   2. Controller: events appear in allProcessedEvents with correct properties
 *   3. View: computeTimelinePresentation includes events in the correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, SegmentType, StatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  INFLICTION_COLUMNS,
  REACTION_COLUMNS,
  ENEMY_ID,
  ENEMY_ACTION_COLUMN_ID,
  OPERATOR_STATUS_COLUMN_ID,
} from '../../../../model/channels';
import {
  findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax,
} from '../../helpers';
import type { AppResult } from '../../helpers';
import type { MiniTimeline } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const SNOWSHINE_JSON = require('../../../../model/game-data/operators/snowshine/snowshine.json');
const SNOWSHINE_ID: string = SNOWSHINE_JSON.id;

const BS_JSON = require('../../../../model/game-data/operators/snowshine/skills/battle-skill-saturated-defense.json');
const BS_ID: string = BS_JSON.properties.id;

const COMBO_JSON = require('../../../../model/game-data/operators/snowshine/skills/combo-skill-polar-rescue.json');
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULT_JSON = require('../../../../model/game-data/operators/snowshine/skills/ultimate-frigid-snowfield.json');
const ULT_ID: string = ULT_JSON.properties.id;

const RETALIATION_STATUS_ID: string = require(
  '../../../../model/game-data/operators/snowshine/statuses/status-saturated-defense-retaliation.json',
).properties.id;

const RETALIATION_BURST_STATUS_ID: string = require(
  '../../../../model/game-data/operators/snowshine/statuses/status-saturated-defense-retaliation-burst.json',
).properties.id;

const SAR_ASSISTANCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/snowshine/statuses/status-snowfield-sar-assistance.json',
).properties.id;

const SNOW_ZONE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/snowshine/statuses/status-snow-zone.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_SNOWSHINE = 'slot-0';
const SLOT_1 = 'slot-1';
const SLOT_2 = 'slot-2';
const SLOT_3 = 'slot-3';

beforeEach(() => {
  localStorage.clear();
});

function setupSnowshine() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_SNOWSHINE, SNOWSHINE_ID); });
  return view;
}

function setPotential(result: { current: AppResult }, potential: number) {
  const props = result.current.loadoutProperties[SLOT_SNOWSHINE];
  act(() => {
    result.current.handleStatsChange(SLOT_SNOWSHINE, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

function setTalentOneLevel(result: { current: AppResult }, level: number) {
  const props = result.current.loadoutProperties[SLOT_SNOWSHINE];
  act(() => {
    result.current.handleStatsChange(SLOT_SNOWSHINE, {
      ...props,
      operator: { ...props.operator, talentOneLevel: level, talentTwoLevel: level },
    });
  });
}

function findEnemyActionCol(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === ENEMY_ID
      && c.columnId === ENEMY_ACTION_COLUMN_ID,
  );
}

function placeEnemyAction(result: { current: AppResult }, atFrame: number) {
  const col = findEnemyActionCol(result.current);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atFrame);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function placeBS(result: { current: AppResult }, atFrame: number) {
  const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atFrame);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function placeUlt(result: { current: AppResult }, atFrame: number) {
  const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(result.current, col!, atFrame);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupSnowshine();
    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    placeBS(result, 5 * FPS);

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_SNOWSHINE && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BS_ID);
  });

  it('A2: Combo skill freeform placement with cooldown', () => {
    const { result } = setupSnowshine();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_SNOWSHINE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // Default skill level is L12 → cooldown 23s
    expect(cdSeg!.properties.duration).toBe(23 * FPS);
  });

  it('A3: Ultimate placement with energy', () => {
    const { result } = setupSnowshine();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });

    placeUlt(result, 5 * FPS);

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_SNOWSHINE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULT_ID);
  });
});

// =============================================================================
// B. Battle Skill — Protection + Saturated Defense Retaliation marker
// =============================================================================

describe('B. Battle Skill — Protection + Retaliation Marker', () => {
  it('B1: BS applies Protection status to operators, scoped to the 4.5s shield window', () => {
    const { result } = setupSnowshine();
    placeBS(result, 2 * FPS);

    const protectionEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.PROTECTION && ev.startFrame > 0,
    );
    expect(protectionEvents.length).toBeGreaterThanOrEqual(1);

    // Snowshine overrides the generic PROTECTION default (5s) with a 4.5s
    // duration so the Protection status disappears when the shield drops.
    for (const ev of protectionEvents) {
      const totalDuration = ev.segments.reduce(
        (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
      );
      expect(totalDuration).toBe(4.5 * FPS);
    }
  });

  it('B2: BS applies SATURATED_DEFENSE_RETALIATION on Snowshine for the shield window', () => {
    const { result } = setupSnowshine();
    placeBS(result, 5 * FPS);

    const retaliationEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_SNOWSHINE
        && ev.columnId === RETALIATION_STATUS_ID
        && ev.startFrame > 0,
    );
    expect(retaliationEvents.length).toBeGreaterThanOrEqual(1);

    // Marker starts at the BS frame (offset 0) and lives 4.5s.
    const marker = retaliationEvents[0];
    expect(marker.startFrame).toBe(5 * FPS);

    const totalDuration = marker.segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(4.5 * FPS);
  });

  it('B3: BS no longer fires the legacy 3.57s retaliation frame directly', () => {
    const { result } = setupSnowshine();
    placeBS(result, 5 * FPS);

    // Without an enemy attack inside the shield window, no Cryo Infliction must be
    // applied to the enemy by the BS itself.
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryoInflictions).toHaveLength(0);
  });
});

// =============================================================================
// C. BS Retaliation chain — enemy hits trigger SAR Burst
// =============================================================================

function getRetaliationBursts(result: { current: AppResult }) {
  return result.current.allProcessedEvents.filter(
    ev => ev.columnId === RETALIATION_BURST_STATUS_ID && ev.startFrame > 0,
  );
}

describe('C. BS Retaliation Chain', () => {
  it('C1: Single enemy hit inside shield window spawns exactly one retaliation burst', () => {
    const { result } = setupSnowshine();
    placeBS(result, 5 * FPS);
    placeEnemyAction(result, 6 * FPS); // 1s into the 4.5s window

    const bursts = getRetaliationBursts(result);
    expect(bursts).toHaveLength(1);

    // Burst sourceEntityId must be Snowshine (the operator running the trigger).
    expect(bursts[0].sourceEntityId === SLOT_SNOWSHINE
      || bursts[0].ownerEntityId === SLOT_SNOWSHINE).toBe(true);

    // Burst's frame should deal Cryo damage and apply Cryo Infliction on the enemy.
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);
  });

  it('C2: Enemy hit OUTSIDE the shield window does NOT spawn a retaliation burst', () => {
    const { result } = setupSnowshine();
    placeBS(result, 5 * FPS);
    // Window: [5s, 9.5s). Place enemy attack at 12s — outside.
    placeEnemyAction(result, 12 * FPS);

    const bursts = getRetaliationBursts(result);
    expect(bursts).toHaveLength(0);

    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryoInflictions).toHaveLength(0);
  });

  it('C3: Multiple non-overlapping enemy hits inside shield window each spawn a burst', () => {
    const { result } = setupSnowshine();
    placeBS(result, 5 * FPS);
    // Enemy action default duration is 2s — space hits at 5.0s and 7.5s so neither
    // overlaps the other and both fall inside the 4.5s shield window.
    placeEnemyAction(result, 5 * FPS);
    placeEnemyAction(result, 7.5 * FPS);

    const bursts = getRetaliationBursts(result);
    expect(bursts.length).toBeGreaterThanOrEqual(2);

    // Cumulative cryo infliction events on the enemy column from the bursts.
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(2);
  });

  it('C4: P0 retaliation produces bursts (sanity check at minimum potential)', () => {
    const { result } = setupSnowshine();
    setPotential(result, 0);
    placeBS(result, 5 * FPS);
    placeEnemyAction(result, 5 * FPS);
    placeEnemyAction(result, 7.5 * FPS);
    expect(getRetaliationBursts(result).length).toBeGreaterThanOrEqual(2);
  });

  it('C5: P5 retaliation produces bursts (P5 SP return rides on the same chain)', () => {
    const { result } = setupSnowshine();
    setPotential(result, 5);
    placeBS(result, 5 * FPS);
    placeEnemyAction(result, 5 * FPS);
    placeEnemyAction(result, 7.5 * FPS);
    expect(getRetaliationBursts(result).length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// D. Combo — SAR Assistance on all operators
// =============================================================================

describe('D. Combo — SAR Assistance', () => {
  it('D1: CS applied via freeform produces SNOWFIELD_SAR_ASSISTANCE on every operator slot', () => {
    const { result } = setupSnowshine();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // SAR Assistance should land on all 4 operator slots (toDeterminer ALL).
    const sarEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === SAR_ASSISTANCE_STATUS_ID && ev.startFrame > 0,
    );
    expect(sarEvents.length).toBeGreaterThanOrEqual(4);

    // Each event must be 3s long (single segment of 3s).
    for (const sar of sarEvents) {
      const totalDuration = sar.segments.reduce(
        (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
      );
      expect(totalDuration).toBe(3 * FPS);
    }

    // Owners should cover every slot (no shared TEAM event).
    const owners = new Set(sarEvents.map(e => e.ownerEntityId));
    expect(owners.has(SLOT_SNOWSHINE)).toBe(true);
    expect(owners.has(SLOT_1)).toBe(true);
    expect(owners.has(SLOT_2)).toBe(true);
    expect(owners.has(SLOT_3)).toBe(true);
  });

  it('D2: SAR Assistance segment has 4 frames (offset 0/1/2/3s)', () => {
    const { result } = setupSnowshine();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const snowshineSar = result.current.allProcessedEvents.find(
      ev => ev.columnId === SAR_ASSISTANCE_STATUS_ID
        && ev.ownerEntityId === SLOT_SNOWSHINE
        && ev.startFrame > 0,
    );
    expect(snowshineSar).toBeDefined();

    const seg = snowshineSar!.segments[0];
    expect(seg.frames).toBeDefined();
    expect(seg.frames!.length).toBe(4);
  });

  it('D3: T1 baked-in scaling — SAR Assistance frames placed at offsets 0/1/2/3s', () => {
    // T1 scaling is baked into the SAR Assistance heal frames as a MULT wrapping
    // VARY_BY SKILL_LEVEL with VARY_BY TALENT_LEVEL [0.15, 0.25] in the JSON config.
    // The current engine's frame parser does not (yet) emit APPLY STAT TREATMENT
    // effects from status segment frames into the runtime event graph; the
    // structural shape of the cloned status (frames at the right offsets, 4 of
    // them, with each frame's offsetFrame mapping to 0/1/2/3 seconds) is what we
    // can verify at this layer. Runtime treat-value verification will require
    // engine support for STAT effects in status segment frames — see
    // docs/todo.md.
    const { result } = setupSnowshine();
    setTalentOneLevel(result, 2);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const snowshineSar = result.current.allProcessedEvents.find(
      ev => ev.columnId === SAR_ASSISTANCE_STATUS_ID
        && ev.ownerEntityId === SLOT_SNOWSHINE
        && ev.startFrame > 0,
    );
    expect(snowshineSar).toBeDefined();

    const seg = snowshineSar!.segments[0];
    expect(seg.frames!.length).toBe(4);

    const offsets = seg.frames!.map(f => f.offsetFrame);
    expect(offsets).toEqual([0, 1 * FPS, 2 * FPS, 3 * FPS]);
  });
});

// =============================================================================
// E. Ultimate — Snow Zone + forced Solidification
// =============================================================================

describe('E. Ultimate — Snow Zone', () => {
  it('E1: Ult places Snow Zone on enemy column with base 5s duration at P0', () => {
    const { result } = setupSnowshine();
    setPotential(result, 0);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });
    placeUlt(result, 5 * FPS);

    const snowZones = result.current.allProcessedEvents.filter(
      ev => ev.columnId === SNOW_ZONE_STATUS_ID && ev.startFrame > 0,
    );
    expect(snowZones).toHaveLength(1);

    const totalDuration = snowZones[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(5 * FPS);
  });

  it('E2: Snow Zone applies forced Solidification on enemy reaction column', () => {
    const { result } = setupSnowshine();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });
    placeUlt(result, 5 * FPS);

    const solidificationEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.SOLIDIFICATION,
    );
    expect(solidificationEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('E3: P3 potential extends Snow Zone duration to 7s', () => {
    const { result } = setupSnowshine();
    setPotential(result, 3);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });
    placeUlt(result, 5 * FPS);

    const snowZones = result.current.allProcessedEvents.filter(
      ev => ev.columnId === SNOW_ZONE_STATUS_ID && ev.startFrame > 0,
    );
    expect(snowZones).toHaveLength(1);

    const totalDuration = snowZones[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(7 * FPS);
  });

  it('E4: Ultimate energy cost is 80 at all potential levels (no UE-cost reduction)', () => {
    expect(getUltimateEnergyCostForPotential(SNOWSHINE_ID, 0)).toBe(80);
    expect(getUltimateEnergyCostForPotential(SNOWSHINE_ID, 5)).toBe(80);
  });
});

// =============================================================================
// F. View Layer
// =============================================================================

describe('F. View Layer', () => {
  it('F1: BS retaliation marker visible in Snowshine status column VM', () => {
    const { result } = setupSnowshine();
    placeBS(result, 5 * FPS);

    const statusCol = findColumn(result.current, SLOT_SNOWSHINE, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();

    const retaliationInVM = statusVM!.events.filter(
      ev => ev.columnId === RETALIATION_STATUS_ID,
    );
    expect(retaliationInVM.length).toBeGreaterThanOrEqual(1);
  });

  it('F2: SAR Assistance visible in every operator status column VM', () => {
    const { result } = setupSnowshine();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    let foundSlots = 0;
    for (const slot of [SLOT_SNOWSHINE, SLOT_1, SLOT_2, SLOT_3]) {
      const statusCol = findColumn(result.current, slot, OPERATOR_STATUS_COLUMN_ID);
      if (!statusCol) continue;
      const vm = viewModels.get(statusCol.key);
      if (!vm) continue;
      if (vm.events.some(ev => ev.columnId === SAR_ASSISTANCE_STATUS_ID)) foundSlots += 1;
    }
    expect(foundSlots).toBeGreaterThanOrEqual(4);
  });

  it('F3: Snow Zone visible on enemy status column VM after Ult', () => {
    const { result } = setupSnowshine();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });
    placeUlt(result, 5 * FPS);

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Snow Zone is owned by the enemy — find any column on enemy that contains it.
    const enemyColumns = result.current.columns.filter(
      (c): c is MiniTimeline => c.ownerEntityId === ENEMY_ID,
    );
    let found = false;
    for (const col of enemyColumns) {
      const vm = viewModels.get(col.key);
      if (!vm) continue;
      if (vm.events.some(ev => ev.columnId === SNOW_ZONE_STATUS_ID)) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('F4: All three skills visible after combined placement', () => {
    const { result } = setupSnowshine();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_SNOWSHINE, 0); });

    placeBS(result, 2 * FPS);

    const comboCol = findColumn(result.current, SLOT_SNOWSHINE, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    placeUlt(result, 30 * FPS);

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const bsCol = findColumn(result.current, SLOT_SNOWSHINE, NounType.BATTLE);
    const bsVm = viewModels.get(bsCol!.key);
    expect(bsVm!.events.some(ev => ev.name === BS_ID)).toBe(true);

    const comboVm = viewModels.get(comboCol!.key);
    expect(comboVm!.events.some(ev => ev.name === COMBO_ID)).toBe(true);

    const ultCol = findColumn(result.current, SLOT_SNOWSHINE, NounType.ULTIMATE);
    const ultVm = viewModels.get(ultCol!.key);
    expect(ultVm!.events.some(ev => ev.name === ULT_ID)).toBe(true);
  });
});
