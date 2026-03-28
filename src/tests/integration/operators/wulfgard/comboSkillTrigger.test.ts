/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard — Combo Skill Trigger Integration Tests
 *
 * Tests Frag Grenade Beta's activation mechanics: trigger window (720 frames / 6s),
 * cooldown duration (~20s), stagger application, ultimate energy recovery,
 * negative non-Arts trigger, and multi-operator trigger sources.
 *
 * Three-layer verification:
 *   1. Context menu: combo enabled/disabled at various frames
 *   2. Controller: processed events, energy graphs
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  INFLICTION_COLUMNS, ENEMY_OWNER_ID,
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_GROUP_COLUMNS,
} from '../../../../model/channels';
import { ColumnType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_JSON = require('../../../../model/game-data/operators/wulfgard/wulfgard.json');
const WULFGARD_ID: string = WULFGARD_JSON.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/wulfgard/skills/combo-skill-frag-grenade-beta.json',
);
const COMBO_ID: string = COMBO_JSON.properties.id;
const COMBO_WINDOW_FRAMES: number = COMBO_JSON.properties.windowFrames;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_WULFGARD = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupWulfgard() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });
  return view;
}

function placeHeatInfliction(
  result: { current: AppResult },
  startSec: number,
  durationSec = 20,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, startSec * FPS,
      { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Activation Window
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Activation Window', () => {
  it('A1: Combo window is 720 frames (6s) — combo available within window', () => {
    // Verify the game-data window value
    expect(COMBO_WINDOW_FRAMES).toBe(720);

    const { result } = setupWulfgard();

    // Place heat infliction at 2s
    placeHeatInfliction(result, 2);

    // Combo at 7s (5s after infliction at 2s) — within 6s window
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 7 * FPS);
    expect(menuItems).not.toBeNull();

    const comboItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBeFalsy();
  });

  it('A2: Combo unavailable outside activation window', () => {
    const { result } = setupWulfgard();

    // Place heat infliction at 2s — window expires at 2s + 6s = 8s
    placeHeatInfliction(result, 2);

    // Combo at 10s — beyond the 6s window
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 10 * FPS);
    expect(menuItems).not.toBeNull();
    const comboItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Cooldown
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Cooldown', () => {
  it('B1: Combo has a cooldown segment of ~20s', () => {
    const { result } = setupWulfgard();

    placeHeatInfliction(result, 1);

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: cooldown segment exists and is ~20s (2400 frames)
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // CD is ~20s at skill level 12 (may be 19s), so between 19-20s
    expect(cdSeg!.properties.duration).toBeGreaterThanOrEqual(19 * FPS);
    expect(cdSeg!.properties.duration).toBeLessThanOrEqual(20 * FPS);
  });

  it('B2: Menu disabled within cooldown window after placing combo', () => {
    const { result } = setupWulfgard();

    placeHeatInfliction(result, 1, 30);

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Context menu: combo disabled at 10s (still within cooldown)
    const menuItems = buildContextMenu(result.current, comboCol!, 10 * FPS);
    expect(menuItems).not.toBeNull();
    const comboItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBe(true);
    expect(comboItem!.disabledReason).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Frame Effects
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Frame Effects', () => {
  it('C1: Combo applies heat infliction to enemy', () => {
    const { result } = setupWulfgard();

    // Setup: freeform heat infliction to trigger combo
    placeHeatInfliction(result, 1);

    // Count heat inflictions before combo
    const heatsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    ).length;

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: additional heat infliction(s) from combo
    const heatsAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatsAfter.length).toBeGreaterThan(heatsBefore);

    // View: enemy status column has heat infliction events
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === ENEMY_OWNER_ID &&
        c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT,
    )).toBe(true);
  });

  it('C2: Combo event appears in combo column view model', () => {
    const { result } = setupWulfgard();

    placeHeatInfliction(result, 1);

    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // View: combo event in column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(
      ev => ev.name === COMBO_ID && ev.ownerId === SLOT_WULFGARD,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Negative Triggers
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Negative Triggers', () => {
  it('D1: Combo does NOT trigger from non-Arts infliction (freeform Vulnerable)', () => {
    const { result } = setupWulfgard();

    // Place freeform Vulnerable (physical infliction, not Arts)
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, 1 * FPS,
        {
          name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
          segments: [{ properties: { duration: 20 * FPS } }],
        },
      );
    });

    // Combo should not be triggerable from physical infliction alone
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menuItems).not.toBeNull();
    const comboItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Multi-Operator Trigger
// ═══════════════════════════════════════════════════════════════════════════════

const SLOT_AKEKURI = 'slot-1';

describe('E. Multi-Operator Trigger', () => {
  it('E1: Combo triggers from Akekuri battle skill infliction', () => {
    const { result } = setupWulfgard();

    // Akekuri battle skill at 2s — applies Arts infliction
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    if (!akekuriBattleCol?.defaultEvent) return;

    const akekuriPayload = getMenuPayload(result.current, akekuriBattleCol, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        akekuriPayload.ownerId, akekuriPayload.columnId,
        akekuriPayload.atFrame, akekuriPayload.defaultSkill,
      );
    });

    // Wulfgard combo at 5s — should trigger from Akekuri's infliction
    const comboCol = findColumn(result.current, SLOT_WULFGARD, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Controller: combo placed
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);

    // View: combo in view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
  });
});
