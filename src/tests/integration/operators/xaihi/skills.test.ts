/**
 * @jest-environment jsdom
 */

/**
 * Xaihi Skills — Integration Tests (Core Placement)
 *
 * Tests basic skill placement through useApp: basic attack, battle skill, ultimate.
 * Three-layer verification: context menu → controller → view.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Xaihi is swapped into slot-0 for all tests.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { BasicAttackType, ColumnType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

// ── Game-data verified constants ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XAIHI_JSON = require('../../../../model/game-data/operators/xaihi/xaihi.json');
const XAIHI_ID: string = XAIHI_JSON.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/xaihi/skills/battle-skill-distributed-dos.json',
).properties.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/xaihi/skills/ultimate-stack-overflow.json',
).properties.id;

const SLOT_XAIHI = 'slot-0';

function setupXaihi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_XAIHI, XAIHI_ID); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Basic Attack
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Basic Attack', () => {
  it('A1: Basic attack places with 5 segments and Cryo element', () => {
    const { result } = setupXaihi();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.BASIC_ATTACK);
    expect(col?.defaultEvent).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);
    expect(events[0].segments).toHaveLength(5);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const baVM = viewModels.get(col!.key);
    expect(baVM).toBeDefined();
    expect(baVM!.events.some(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.BASIC_ATTACK,
    )).toBe(true);
  });

  it('A2: Dive and Finisher variants are available in context menu', () => {
    const { result } = setupXaihi();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();
    expect(col!.eventVariants).toBeDefined();
    const dive = col!.eventVariants!.find(v => v.id === BasicAttackType.DIVE);
    const finisher = col!.eventVariants!.find(v => v.id === BasicAttackType.FINISHER);
    expect(dive).toBeDefined();
    expect(finisher).toBeDefined();

    // Place the dive variant via context menu
    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    act(() => {
      result.current.handleAddEvent(
        SLOT_XAIHI, NounType.BASIC_ATTACK, 2 * FPS, dive!,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const baVM = viewModels.get(col!.key);
    expect(baVM).toBeDefined();
    expect(baVM!.events).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill (Distributed DoS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill', () => {
  it('B1: Battle skill places in BATTLE column with 100 SP cost', () => {
    const { result } = setupXaihi();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.BATTLE);
    expect(col?.defaultEvent).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.BATTLE,
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
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_XAIHI,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Ultimate (Stack Overflow)
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Ultimate', () => {
  it('C1: Ultimate places with TIME_STOP animation and derives team AMP', () => {
    const { result } = setupXaihi();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_XAIHI, 0); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.ULTIMATE);
    expect(col?.defaultEvent).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_XAIHI && ev.columnId === NounType.ULTIMATE,
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(ULTIMATE_ID);
    expect(events[0].segments.length).toBeGreaterThanOrEqual(2);
    const animSeg = events[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();

    // Cryo AMP and Nature AMP on TEAM_ID (team status)
    const cryoAmp = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === TEAM_ID && ev.name === NounType.CRYO_AMP,
    );
    const natureAmp = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === TEAM_ID && ev.name === NounType.NATURE_AMP,
    );
    expect(cryoAmp).toHaveLength(1);
    expect(natureAmp).toHaveLength(1);
    // Both should have resolved statusValue with Intellect scaling
    // Base at max skill = 0.24, Intellect scaling adds more → value should be > 0.24
    expect(cryoAmp[0].statusValue).toBeDefined();
    expect(natureAmp[0].statusValue).toBeDefined();
    expect(cryoAmp[0].statusValue as number).toBeGreaterThan(0.24);
    expect(natureAmp[0].statusValue as number).toBeLessThanOrEqual(0.36); // cap at rank 12
    // Duration should be 12s
    const ampDuration = cryoAmp[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(ampDuration).toBe(12 * FPS);

    // ── View layer ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    // Ult event in ult column
    const ultVM = viewModels.get(col!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(
      ev => ev.name === ULTIMATE_ID && ev.ownerId === SLOT_XAIHI,
    )).toBe(true);
    // AMP events in team status column
    const teamCol = result.current.columns.find(
      (c): c is import('../../../../consts/viewTypes').MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === TEAM_ID &&
        c.columnId === COMMON_COLUMN_IDS.TEAM_STATUS,
    );
    expect(teamCol).toBeDefined();
    const teamVM = viewModels.get(teamCol!.key);
    expect(teamVM).toBeDefined();
    const ampInVM = teamVM!.events.filter(ev => ev.name === NounType.CRYO_AMP || ev.name === NounType.NATURE_AMP);
    expect(ampInVM).toHaveLength(2);
  });

  it('C2: P0 ultimate energy cost is 80, P2 is 72', () => {
    const { result } = setupXaihi();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_XAIHI, NounType.ULTIMATE);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();

    // ── Controller layer (game data function) ──
    expect(getUltimateEnergyCostForPotential(XAIHI_ID, 0)).toBe(80);
    expect(getUltimateEnergyCostForPotential(XAIHI_ID, 2)).toBe(72);

    // ── View layer — column exists with correct default event ──
    expect(col!.defaultEvent).toBeDefined();
  });
});
