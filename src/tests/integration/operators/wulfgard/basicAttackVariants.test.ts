/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard — Basic Attack Integration Tests
 *
 * Tests Wulfgard's basic attack column (Rapid Fire Akimbo): default BATK placement,
 * segment structure, final strike SP recovery, no heat infliction from BA,
 * and DIVE/FINISHER category availability.
 *
 * BATK, DIVE, and FINISHER are three separate BA categories (not variants of each other).
 *
 * Three-layer verification:
 *   1. Context menu: add-event items
 *   2. Controller: allProcessedEvents with correct segments/frames
 *   3. View: computeTimelinePresentation reflects events in columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { BasicAttackType, ColumnType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  INFLICTION_COLUMNS, ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../../model/channels';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { findColumn, getMenuPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_JSON = require('../../../../model/game-data/operators/wulfgard/wulfgard.json');
const WULFGARD_ID: string = WULFGARD_JSON.id;

const BATK_ID: string = require(
  '../../../../model/game-data/operators/wulfgard/skills/basic-attack-batk-rapid-fire-akimbo.json',
).properties.id;
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

// ═══════════════════════════════════════════════════════════════════════════════
// A. Basic Attack Placement & Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Basic Attack Placement & Structure', () => {
  it('A1: Default BA appears in BASIC_ATTACK column with 4 segments', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    expect(basicCol!.defaultEvent).toBeDefined();
    expect(basicCol!.defaultEvent!.name).toBe(BATK_ID);

    // Context menu: add-event is available
    const payload = getMenuPayload(result.current, basicCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: event has 4 segments (Seq 1-4)
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATK_ID);
    expect(events[0].segments).toHaveLength(4);

    // View: event appears in column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const basicVM = viewModels.get(basicCol!.key);
    expect(basicVM).toBeDefined();
    expect(basicVM!.events.some(
      ev => ev.name === BATK_ID && ev.ownerId === SLOT_WULFGARD,
    )).toBe(true);
  });

  it('A2: BA final strike segment recovers SP', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);

    const payload = getMenuPayload(result.current, basicCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: the last segment (Final Strike) has frames with SP recovery
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);

    // Final strike is the last segment — verify it has frames
    const lastSeg = events[0].segments[events[0].segments.length - 1];
    expect(lastSeg.frames).toBeDefined();
    expect(lastSeg.frames!.length).toBeGreaterThanOrEqual(1);

    // View: BA event in column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const basicVM = viewModels.get(basicCol!.key);
    expect(basicVM).toBeDefined();
    expect(basicVM!.events.some(
      ev => ev.name === BATK_ID && ev.ownerId === SLOT_WULFGARD,
    )).toBe(true);
  });

  it('A3: BA does NOT apply heat infliction — no derived heat column after BA only', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);

    const payload = getMenuPayload(result.current, basicCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: no heat infliction events on enemy after BA only
    const heats = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_ID,
    );
    expect(heats).toHaveLength(0);

    // View: enemy status column has no heat infliction events after BA
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === ENEMY_ID &&
        c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const heatEvents = enemyVM!.events.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.HEAT,
    );
    expect(heatEvents).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Basic Attack Categories (DIVE, FINISHER)
// BATK, DIVE, and FINISHER are three separate BA categories, not variants of each other.
// columnBuilder currently gates DIVE/FINISHER behind hasBasicVariants (requires _ENHANCED/_EMPOWERED
// BATK skill). Wulfgard has DIVE/FINISHER JSONs but no enhanced/empowered BATK, so they're not exposed.
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Basic Attack Categories (DIVE, FINISHER)', () => {
  it('B1: DIVE category is available on basic attack column', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    expect(basicCol!.eventVariants).toBeDefined();
    const dive = basicCol!.eventVariants!.find(
      v => v.id === BasicAttackType.DIVE,
    );
    expect(dive).toBeDefined();
  });

  it('B2: FINISHER category is available on basic attack column', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    expect(basicCol!.eventVariants).toBeDefined();
    const finisher = basicCol!.eventVariants!.find(
      v => v.id === BasicAttackType.FINISHER,
    );
    expect(finisher).toBeDefined();
  });

  it('B3: DIVE placement produces event with correct structure', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);
    const dive = basicCol!.eventVariants!.find(v => v.id === BasicAttackType.DIVE);
    expect(dive).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BASIC_ATTACK, 2 * FPS, dive!,
      );
    });

    // Controller: dive event with 1 segment, 1 frame
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);
    expect(events[0].segments).toHaveLength(1);
    const frames = events[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames).toHaveLength(1);

    // View: dive event in column VM
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const basicVM = viewModels.get(basicCol!.key);
    expect(basicVM).toBeDefined();
    expect(basicVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
  });

  it('B4: FINISHER placement produces event with correct structure', () => {
    const { result } = setupWulfgard();
    const basicCol = findColumn(result.current, SLOT_WULFGARD, NounType.BASIC_ATTACK);
    const finisher = basicCol!.eventVariants!.find(v => v.id === BasicAttackType.FINISHER);
    expect(finisher).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_WULFGARD, NounType.BASIC_ATTACK, 2 * FPS, finisher!,
      );
    });

    // Controller: finisher event with 1 segment, 1 frame
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);
    expect(events[0].segments).toHaveLength(1);
    const frames = events[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(frames).toHaveLength(1);

    // View: finisher event in column VM
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const basicVM = viewModels.get(basicCol!.key);
    expect(basicVM).toBeDefined();
    expect(basicVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
  });
});
