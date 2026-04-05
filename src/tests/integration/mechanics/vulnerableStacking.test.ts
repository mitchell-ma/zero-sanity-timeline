/**
 * @jest-environment jsdom
 */

/**
 * Vulnerable Stacking — Integration Tests
 *
 * Tests that Vulnerable infliction stacks are labeled I–IV and cap at 4,
 * regardless of whether events come from strict mode (operator battle skills)
 * or freeform mode (user-placed inflictions on the enemy).
 *
 * A. Strict mode: Chen Qianyu battle skills → engine-derived Vulnerable
 * B. Freeform mode: user-placed Vulnerable inflictions directly on enemy
 * C. Mixed: freeform Vulnerable stacks + strict battle skill stacks interact
 *
 * Verification layers:
 * - Context menu: column menu items available and enabled
 * - Controller: allProcessedEvents counts, stacks, eventStatus
 * - View: computeTimelinePresentation column view models
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import {
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_OWNER_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../model/channels';
import { EventStatusType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

/** Ref container from renderHook — always read .current for latest state. */
type AppRef = { current: AppResult };

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the context menu for the enemy status column and find the addEvent
 * item whose payload targets the Vulnerable micro-column.
 */
function getVulnerableMenuPayload(app: AppResult, atFrame: number): AddEventPayload {
  const enemyStatusCol = findColumn(app, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();

  const menuItems = buildContextMenu(app, enemyStatusCol!, atFrame);
  expect(menuItems).not.toBeNull();

  const vulnItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
  );
  expect(vulnItem).toBeDefined();
  expect(vulnItem!.disabled).toBeFalsy();

  return vulnItem!.actionPayload as AddEventPayload;
}

/**
 * Add freeform Vulnerable inflictions via context menu at 2-second intervals.
 * Caller must set FREEFORM interaction mode before calling.
 * Takes `result` ref so each iteration reads the latest hook state.
 */
function addFreeformVulnerables(ref: AppRef, count: number, startSecond: number) {
  for (let i = 0; i < count; i++) {
    const atFrame = (startSecond + i * 2) * FPS;
    const payload = getVulnerableMenuPayload(ref.current, atFrame);
    act(() => {
      ref.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }
}

/**
 * Add Chen Qianyu battle skills via context menu at 2-second intervals.
 * Takes `result` ref so each iteration reads the latest hook state.
 */
function addBattleSkills(ref: AppRef, count: number, startSecond: number) {
  for (let i = 0; i < count; i++) {
    const atFrame = (startSecond + i * 2) * FPS;
    const col = findColumn(ref.current, SLOT_CHEN, NounType.BATTLE);
    expect(col).toBeDefined();
    const payload = getMenuPayload(ref.current, col!, atFrame);
    act(() => {
      ref.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }
}

function getVulnerableEvents(app: AppResult) {
  return app.allProcessedEvents
    .filter((ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID)
    .sort((a, b) => a.startFrame - b.startFrame);
}

// ── A. Strict mode ──────────────────────────────────────────────────────────

describe('Vulnerable stacking — strict mode (Chen Qianyu battle skills)', () => {
  it('five battle skills produce stacks I, II, III, IV, IV', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Context menu layer: verify battle skill menu item is available
    const battleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    const battleMenu = buildContextMenu(result.current, battleCol!, 2 * FPS);
    expect(battleMenu).not.toBeNull();
    expect(battleMenu!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    addBattleSkills(result, 5, 2);

    const sorted = getVulnerableEvents(result.current);
    expect(sorted).toHaveLength(5);

    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
    for (let i = 1; i < 5; i++) {
      expect(sorted[i].eventStatus).not.toBe(EventStatusType.CONSUMED);
    }

    // View layer: verify Vulnerable events appear in the enemy status column presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vulnVm = viewModels.get(ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(vulnVm).toBeDefined();
    const vulnViewEvents = vulnVm!.events.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnViewEvents.length).toBe(5);
  });
});

// ── B. Freeform mode ────────────────────────────────────────────────────────

describe('Vulnerable stacking — freeform mode (user-placed inflictions)', () => {
  it('five freeform vulnerables produce stacks I, II, III, IV, IV', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Context menu layer: verify Vulnerable menu item is available on enemy status
    const enemyStatusCol = findColumn(result.current, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
    expect(enemyStatusCol).toBeDefined();
    const statusMenu = buildContextMenu(result.current, enemyStatusCol!, 2 * FPS);
    expect(statusMenu).not.toBeNull();
    const vulnMenuItem = statusMenu!.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as AddEventPayload)?.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnMenuItem).toBeDefined();
    expect(vulnMenuItem!.disabled).toBeFalsy();

    addFreeformVulnerables(result, 5, 2);

    const sorted = getVulnerableEvents(result.current);
    expect(sorted).toHaveLength(5);

    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
    for (let i = 1; i < 5; i++) {
      expect(sorted[i].eventStatus).not.toBe(EventStatusType.CONSUMED);
    }
  });
});

// ── C. Mixed mode ───────────────────────────────────────────────────────────

describe('Vulnerable stacking — mixed freeform + strict', () => {
  it('freeform vulnerable stacks combine with strict battle skill stacks', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 2 freeform vulnerables first
    addFreeformVulnerables(result, 2, 1);

    // Then add 3 strict battle skills
    addBattleSkills(result, 3, 6);

    const sorted = getVulnerableEvents(result.current);
    // 2 freeform + 3 from battle skills = 5 total
    expect(sorted).toHaveLength(5);

    // Stacks accumulate across sources: I, II, III, IV, IV
    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    // First event consumed when 5th arrived
    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });

  it('strict battle skill before freeform vulnerable produces correct stack sequence', () => {
    const { result } = renderHook(() => useApp());

    act(() => { result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // 1 strict battle skill first
    addBattleSkills(result, 1, 2);

    // Then 4 freeform vulnerables
    addFreeformVulnerables(result, 4, 5);

    const sorted = getVulnerableEvents(result.current);
    expect(sorted).toHaveLength(5);

    expect(sorted[0].stacks).toBe(1);
    expect(sorted[1].stacks).toBe(2);
    expect(sorted[2].stacks).toBe(3);
    expect(sorted[3].stacks).toBe(4);
    expect(sorted[4].stacks).toBe(4);

    expect(sorted[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });
});
