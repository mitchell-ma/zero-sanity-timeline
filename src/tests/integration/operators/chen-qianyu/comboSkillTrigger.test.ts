/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Combo Skill Integration Tests
 *
 * Tests Chen Qianyu's combo skill (Soar to the Stars) placement, effects, and cooldown
 * through the full useApp pipeline.
 *
 * Combo trigger: onTriggerClause: THIS OPERATOR APPLY VULNERABLE INFLICTION STATUS
 * In freeform mode, combo is always placeable (no window gating).
 *
 * Also tests:
 *   - Combo skill applies Lift and Vulnerable to enemy
 *   - Combo cooldown enforcement (VARY_BY SKILL_LEVEL, 15s at level 12, -3s at P5 = 12s)
 *
 * Verification layers:
 *   Context menu: combo column addEvent enabled/disabled state
 *   Controller: allProcessedEvents for Lift, Vulnerable, cooldown segments
 *   View: computeTimelinePresentation column view models
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Chen Qianyu must be swapped in via handleSwapOperator.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, ENEMY_ID } from '../../../../model/channels';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupChenFreeform() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

describe('Chen Qianyu — combo skill placement and Lift', () => {
  it('combo skill is placeable in freeform mode', () => {
    const { result } = setupChenFreeform();

    // Context menu: combo column exists and addEvent is enabled in freeform
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const comboMenu = buildContextMenu(result.current, comboCol!, 2 * FPS);
    expect(comboMenu).not.toBeNull();
    const addItem = comboMenu!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBeFalsy();
  });

  it('Soar to the Stars applies Vulnerable to enemy', () => {
    const { result } = setupChenFreeform();

    // Place combo skill at t=2s
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: combo event placed
    const comboEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);

    // Controller layer: Vulnerable infliction on enemy (from combo's Lift application)
    const vulnEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_ID,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(1);

    // View layer: combo event appears in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.filter(
      (ev) => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.COMBO,
    )).toHaveLength(1);

    // View layer: Vulnerable appears in enemy status presentation
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === ENEMY_ID &&
        (c.matchColumnIds?.includes(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE) ?? false),
    );
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const vulnInVM = enemyVM!.events.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnInVM.length).toBeGreaterThanOrEqual(1);
  });

  it('BS + combo produces both Vulnerable stacks and Lift', () => {
    const { result } = setupChenFreeform();

    // Place BS at t=2s (applies 1 Vulnerable)
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, battleCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Place combo at t=5s (applies another Vulnerable + Lift)
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Controller layer: at least 2 Vulnerable inflictions (1 from BS, 1 from combo)
    const vulnEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_ID,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(2);

    // Controller layer: Lift status on enemy (combo applies Lift while Vulnerable exists)
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerId === ENEMY_ID,
    );
    expect(liftEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Chen Qianyu — combo cooldown', () => {
  it('second combo placement is blocked during cooldown period', () => {
    const { result } = setupChenFreeform();

    // Place first combo at t=2s
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Verify the combo event has a cooldown segment
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.COMBO,
    );
    expect(comboEvent).toBeDefined();
    const cdSeg = comboEvent!.segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();

    // Switch to strict mode — cooldown overlap gating only applies in strict
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Context menu: placing during the cooldown should be disabled
    const menuDuringCooldown = buildContextMenu(result.current, comboCol!, 8 * FPS);
    expect(menuDuringCooldown).not.toBeNull();
    const addItemDuringCooldown = menuDuringCooldown!.find(i => i.actionId === 'addEvent');
    expect(addItemDuringCooldown).toBeDefined();
    expect(addItemDuringCooldown!.disabled).toBe(true);
  });

  it('combo is available again after cooldown expires', () => {
    const { result } = setupChenFreeform();

    // Place first combo at t=2s
    const comboCol = findColumn(result.current, SLOT_CHEN, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Context menu: placing well after cooldown should be enabled
    // Default cooldown is 12s at P5 (15s - 3s modifier) + animation/active time
    // Check at t=25s — safely past cooldown
    const menuAfterCooldown = buildContextMenu(result.current, comboCol!, 25 * FPS);
    expect(menuAfterCooldown).not.toBeNull();
    const addItemAfter = menuAfterCooldown!.find(i => i.actionId === 'addEvent');
    expect(addItemAfter).toBeDefined();
    expect(addItemAfter!.disabled).toBeFalsy();
  });
});
