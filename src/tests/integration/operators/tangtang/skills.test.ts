/**
 * @jest-environment jsdom
 */

/**
 * Tangtang — Integration Tests (Core Skill Placement)
 *
 * Tests the full user flow through useApp for Tangtang's skills:
 *   - Battle skill (BS) placement and cryo infliction
 *   - Combo skill (freeform) with cooldown
 *   - Ultimate placement and energy cost by potential
 *   - View-layer verification
 *
 * Three-layer verification:
 *   1. Context menu: menu items available and enabled
 *   2. Controller: processed events, durations, energy costs
 *   3. View: computeTimelinePresentation includes events in columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const TANGTANG_JSON = require('../../../../model/game-data/operators/tangtang/tangtang.json');
const TANGTANG_ID: string = TANGTANG_JSON.id;

const BATTLE_SKILL_JSON = require(
  '../../../../model/game-data/operators/tangtang/skills/battle-skill-battle-skill.json',
);
const BATTLE_SKILL_ID: string = BATTLE_SKILL_JSON.properties.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/tangtang/skills/combo-skill-combo-skill.json',
);
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULTIMATE_JSON = require(
  '../../../../model/game-data/operators/tangtang/skills/ultimate-ultimate.json',
);
const ULTIMATE_ID: string = ULTIMATE_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_TANGTANG = 'slot-0';

function setupTangtang() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_TANGTANG, TANGTANG_ID); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A0: Basic attack places in BASIC_ATTACK column', () => {
    const { result } = setupTangtang();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const baVM = viewModels.get(col!.key);
    expect(baVM).toBeDefined();
    expect(baVM!.events.some(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.BASIC_ATTACK,
    )).toBe(true);
  });

  it('A1: Battle skill places in BATTLE_SKILL column', () => {
    const { result } = setupTangtang();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(BATTLE_SKILL_ID);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_TANGTANG,
    )).toBe(true);
  });

  it('A2: Combo skill places in freeform with cooldown (14s base)', () => {
    const { result } = setupTangtang();

    // Combo requires activation — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO_SKILL);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // Cooldown segment exists
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // Base cooldown at L1 is 14s, at L12 is 12s — range check
    expect(cdSeg!.properties.duration).toBeGreaterThanOrEqual(12 * FPS);
    expect(cdSeg!.properties.duration).toBeLessThanOrEqual(14 * FPS);
  });

  it('A3: Ultimate places with energy requirement', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_TANGTANG, NounType.ULTIMATE);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Cryo Infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill — Cryo Infliction', () => {
  it('B1: Battle skill applies cryo infliction to enemy', () => {
    const { result } = setupTangtang();

    // Count cryo inflictions before BS
    const cryoBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_OWNER_ID,
    ).length;

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BATTLE_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer: cryo infliction generated ──
    const cryoAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(cryoAfter.length).toBeGreaterThan(cryoBefore);

    // ── View layer: enemy status column shows cryo infliction ──
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
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Cooldown
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Cooldown', () => {
  it('C1: Combo cooldown is 12s at L12 (skill level index 11)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);

    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // L12 cooldown base = 12s, P0 potential offset = 0 → 12s total
    expect(cdSeg!.properties.duration).toBe(12 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate Energy Cost
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate Energy Cost', () => {
  it('D1: P0 ultimate cost is 90, P4 cost is 76.5', () => {
    // ── Game data layer ──
    const p0Cost = getUltimateEnergyCostForPotential(TANGTANG_ID, 0);
    const p4Cost = getUltimateEnergyCostForPotential(TANGTANG_ID, 4);

    expect(p0Cost).toBe(90);
    expect(p4Cost).toBe(76.5);
  });

  it('D2: Ultimate processes correctly with energy set', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);

    // Animation segment exists (TIME_STOP)
    const animSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();

    // Event has meaningful duration
    expect(eventDuration(events[0])).toBeGreaterThan(0);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(col!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(
      ev => ev.name === ULTIMATE_ID && ev.ownerId === SLOT_TANGTANG,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer — Skills Visible
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: Battle skill visible in battle skill column view model', () => {
    const { result } = setupTangtang();

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BATTLE_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.filter(
      ev => ev.ownerId === SLOT_TANGTANG && ev.columnId === NounType.BATTLE_SKILL,
    ).length).toBeGreaterThanOrEqual(1);
  });

  it('E2: Combo skill visible in combo column view model (freeform)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(col!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(
      ev => ev.name === COMBO_ID && ev.ownerId === SLOT_TANGTANG,
    )).toBe(true);
  });
});
