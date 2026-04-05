/**
 * @jest-environment jsdom
 */

/**
 * Lupine Scarlet — Fracture: Gnashing Wolves Integration Tests
 *
 * Tests the Wolven Blood weapon status stacking from Lupine Scarlet's named skill.
 * Setup: Rossi with Lupine Scarlet, CritMode.ALWAYS (100% crit rate).
 *
 * Mechanics:
 * - Trigger: THIS OPERATOR DEAL CRITICAL DAMAGE → APPLY WOLVEN_BLOOD (1 stack)
 * - Wolven Blood: max 16 stacks, interactionType NONE (accumulates)
 * - At 16 stacks: BECOME STACKS EXACTLY 16 → APPLY WOLVEN_BLOOD_MAX (20s duration)
 * - On WOLVEN_BLOOD_MAX exit: CONSUME all WOLVEN_BLOOD stacks
 *
 * Three-layer verification:
 * 1. Context menu: battle skill available for repeated placement
 * 2. Controller: processed events contain correct Wolven Blood stacks
 * 3. View: status events visible in operator status column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { CritMode, EventStatusType, InteractionModeType, ColumnType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../model/channels';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, type AppResult } from '../helpers';
import type { MiniTimeline } from '../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../model/game-data/operators/rossi/rossi.json').id;
const WEAPON_ID: string = require('../../../model/game-data/weapons/lupine-scarlet/lupine-scarlet.json').properties.id;
const WOLVEN_BLOOD_ID: string = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood.json').properties.id;
const WOLVEN_BLOOD_MAX_ID: string = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood-max.json').properties.id;
const BATTLE_SKILL_JSON = require('../../../model/game-data/operators/rossi/skills/battle-skill-crimson-shadow.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ROSSI = 'slot-0';

// Count damage frames in the battle skill (frames that have DEAL DAMAGE effects)
const DAMAGE_FRAMES_PER_BS = BATTLE_SKILL_JSON.segments.reduce((total: number, seg: Record<string, unknown>) => {
  const frames = (seg as { frames?: { clause?: { effects?: { verb?: string; object?: string }[] }[] }[] }).frames ?? [];
  return total + frames.filter(f =>
    f.clause?.some(c => c.effects?.some(e => e.verb === 'DEAL' && e.object === 'DAMAGE')),
  ).length;
}, 0);

beforeEach(() => {
  localStorage.clear();
});

function setupRossiWithLupineScarlet() {
  const view = renderHook(() => useApp());
  // Swap to Rossi
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });
  // Equip Lupine Scarlet
  act(() => {
    view.result.current.handleLoadoutChange(SLOT_ROSSI, {
      weaponId: WEAPON_ID,
      armorId: null,
      glovesId: null,
      kit1Id: null,
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });
  // Set crit mode to ALWAYS (100% crit rate)
  act(() => { view.result.current.setCritMode(CritMode.ALWAYS); });
  return view;
}

function placeBattleSkill(app: AppResult, atSecond: number) {
  const col = findColumn(app, SLOT_ROSSI, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atSecond * FPS);
  act(() => {
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function findWolvenBloodStacks(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerId === SLOT_ROSSI && ev.name === WOLVEN_BLOOD_ID &&
      ev.eventStatus !== EventStatusType.CONSUMED,
  );
}

function findWolvenBloodMaxEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerId === SLOT_ROSSI && ev.name === WOLVEN_BLOOD_MAX_ID,
  );
}

function findStatusColumn(app: AppResult, slotId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      (c.columnId === OPERATOR_STATUS_COLUMN_ID || (c.matchColumnIds?.includes(WOLVEN_BLOOD_ID) ?? false)),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Config Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Config validation', () => {
  it('A1: Battle skill has expected number of damage frames', () => {
    expect(DAMAGE_FRAMES_PER_BS).toBeGreaterThanOrEqual(3);
  });

  it('A2: Wolven Blood has max 16 stacks with NONE interaction', () => {
    const wb = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood.json');
    expect(wb.properties.stacks.limit.value).toBe(16);
    expect(wb.properties.stacks.interactionType).toBe('NONE');
  });

  it('A3: Wolven Blood has onTriggerClause for max stacks → APPLY WOLVEN_BLOOD_MAX', () => {
    const wb = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood.json');
    expect(wb.onTriggerClause).toBeDefined();
    expect(wb.onTriggerClause[0].conditions[0].verb).toBe('BECOME');
    expect(wb.onTriggerClause[0].conditions[0].value.value).toBe(16);
    expect(wb.onTriggerClause[0].effects[0].objectId).toBe(WOLVEN_BLOOD_MAX_ID);
  });

  it('A4: Wolven Blood Max has 20s duration and onExitClause consuming all stacks', () => {
    const wbm = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood-max.json');
    expect(wbm.properties.duration.value.value).toBe(20);
    expect(wbm.onExitClause).toBeDefined();
    expect(wbm.onExitClause[0].effects[0].verb).toBe('CONSUME');
    expect(wbm.onExitClause[0].effects[0].objectId).toBe(WOLVEN_BLOOD_ID);
    expect(wbm.onExitClause[0].effects[0].with.stacks).toBe('MAX');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Wolven Blood Stack Generation
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Wolven Blood stack generation', () => {
  it('B1: Single battle skill with ALWAYS crit generates Wolven Blood stacks equal to damage frame count', () => {
    const { result } = setupRossiWithLupineScarlet();

    placeBattleSkill(result.current, 2);

    // Controller: correct stack count
    const stacks = findWolvenBloodStacks(result.current);
    expect(stacks.length).toBe(DAMAGE_FRAMES_PER_BS);

    // Controller: each stack has long duration (effectively permanent — clamped to timeline length)
    for (const s of stacks) {
      const dur = s.segments.reduce((sum, seg) => sum + seg.properties.duration, 0);
      expect(dur).toBeGreaterThan(100 * FPS);
    }

    // View: Wolven Blood stacks visible in operator status column
    const statusCol = findStatusColumn(result.current, SLOT_ROSSI);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();
    const wbEvents = vm!.events.filter(ev => ev.name === WOLVEN_BLOOD_ID);
    expect(wbEvents.length).toBe(DAMAGE_FRAMES_PER_BS);
  });

  it('B2: Multiple battle skills accumulate Wolven Blood stacks', () => {
    const { result } = setupRossiWithLupineScarlet();

    // Place two battle skills back-to-back
    placeBattleSkill(result.current, 2);
    placeBattleSkill(result.current, 5);

    // Controller: stacks accumulate across skills
    const stacks = findWolvenBloodStacks(result.current);
    expect(stacks.length).toBe(DAMAGE_FRAMES_PER_BS * 2);

    // View: all stacks visible
    const statusCol2 = findStatusColumn(result.current, SLOT_ROSSI);
    expect(statusCol2).toBeDefined();
    const viewModels2 = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm2 = viewModels2.get(statusCol2!.key);
    expect(vm2).toBeDefined();
    const wbEvents2 = vm2!.events.filter(ev => ev.name === WOLVEN_BLOOD_ID);
    expect(wbEvents2.length).toBe(DAMAGE_FRAMES_PER_BS * 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Max Stacks → Wolven Blood Max
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Max stacks triggers Wolven Blood Max', () => {
  it('C1: Reaching 16 stacks produces Wolven Blood (Max Stacks) with 20s duration', () => {
    const { result } = setupRossiWithLupineScarlet();

    // Place first BS normally to get the payload template
    placeBattleSkill(result.current, 2);
    const bsEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvent).toBeDefined();

    // Place remaining BSes using handleAddEvent directly (bypass SP check via freeform)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const bsNeeded = Math.ceil(16 / DAMAGE_FRAMES_PER_BS);
    for (let i = 1; i < bsNeeded; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_ROSSI, NounType.BATTLE, (2 + i * 3) * FPS,
          { name: bsEvent!.name, segments: bsEvent!.segments },
        );
      });
    }
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Controller: exactly 16 wolven blood events (stack limit enforced, no uncapped leaks)
    const allWbEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ROSSI && ev.name === WOLVEN_BLOOD_ID,
    );
    expect(allWbEvents.length).toBe(16);

    // Controller: ALL stacks consumed by MAX onExitClause — no unconsumed stacks
    const unconsumed = allWbEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(unconsumed).toEqual([]);

    // Controller: Wolven Blood Max should exist
    const maxEvents = findWolvenBloodMaxEvents(result.current);
    expect(maxEvents.length).toBeGreaterThanOrEqual(1);

    // Controller: Max event duration should be 20s = 2400 frames
    const maxDur = maxEvents[0].segments.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(maxDur).toBe(20 * FPS);

    // Controller: all stacks end exactly at the MAX event's end frame
    const maxEndFrame = maxEvents[0].startFrame + maxDur;
    for (const ev of allWbEvents) {
      const evDur = ev.segments.reduce((sum, s) => sum + s.properties.duration, 0);
      expect(ev.startFrame + evDur).toBe(maxEndFrame);
    }
  });

  it('C2: Wolven Blood Max onExitClause consumes all Wolven Blood stacks (config check)', () => {
    const wbm = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood-max.json');
    const exitEffects = wbm.onExitClause[0].effects;
    expect(exitEffects).toHaveLength(1);
    expect(exitEffects[0].verb).toBe('CONSUME');
    expect(exitEffects[0].object).toBe('STATUS');
    expect(exitEffects[0].objectId).toBe(WOLVEN_BLOOD_ID);
    expect(exitEffects[0].with.stacks).toBe('MAX');
    expect(exitEffects[0].fromDeterminer).toBe('THIS');
    expect(exitEffects[0].from).toBe('OPERATOR');
  });

  it('C3: Wolven Blood Max has no stack label (single-instance RESET status)', () => {
    const { result } = setupRossiWithLupineScarlet();

    // Place enough BSes to reach 16 stacks
    placeBattleSkill(result.current, 2);
    const bsEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvent).toBeDefined();

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const bsNeeded = Math.ceil(16 / DAMAGE_FRAMES_PER_BS);
    for (let i = 1; i < bsNeeded; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_ROSSI, NounType.BATTLE, (2 + i * 3) * FPS,
          { name: bsEvent!.name, segments: bsEvent!.segments },
        );
      });
    }
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Verify Wolven Blood Max exists
    const maxEvents = findWolvenBloodMaxEvents(result.current);
    expect(maxEvents.length).toBeGreaterThanOrEqual(1);

    // View: Wolven Blood Max should NOT have a roman numeral stack label
    const statusCol = findStatusColumn(result.current, SLOT_ROSSI);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    const vm = viewModels.get(statusCol!.key);
    expect(vm).toBeDefined();

    const maxInView = vm!.events.filter(ev => ev.name === WOLVEN_BLOOD_MAX_ID);
    expect(maxInView.length).toBeGreaterThanOrEqual(1);

    // Status override label should be just the base name — no "I", "II", etc.
    for (const ev of maxInView) {
      const override = vm!.statusOverrides.get(ev.uid);
      if (!override) continue;
      // Label should not end with a roman numeral (I, II, III, IV, etc.)
      expect(override.label).not.toMatch(/\s[IVX]+$/);
    }
  });

  it('C4: No Wolven Blood stacks active after MAX expires (E2E duration check)', () => {
    const { result } = setupRossiWithLupineScarlet();

    // Place first BS normally
    placeBattleSkill(result.current, 2);
    const bsEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvent).toBeDefined();

    // Place enough BSes to trigger 16 stacks → MAX
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const bsNeeded = Math.ceil(16 / DAMAGE_FRAMES_PER_BS);
    for (let i = 1; i < bsNeeded; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_ROSSI, NounType.BATTLE, (2 + i * 3) * FPS,
          { name: bsEvent!.name, segments: bsEvent!.segments },
        );
      });
    }
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Find the MAX event and compute its end frame
    const maxEvents = findWolvenBloodMaxEvents(result.current);
    expect(maxEvents.length).toBeGreaterThanOrEqual(1);
    const maxEv = maxEvents[0];
    const maxEndFrame = maxEv.startFrame + maxEv.segments.reduce((s, seg) => s + seg.properties.duration, 0);

    // Check every Wolven Blood event in allProcessedEvents:
    // None should be active at maxEndFrame + 1
    const allWb = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ROSSI && ev.name === WOLVEN_BLOOD_ID,
    );
    expect(allWb.length).toBeGreaterThanOrEqual(16);

    const checkFrame = maxEndFrame + 1;
    const activeAtCheckFrame = allWb.filter(ev => {
      const evEnd = ev.startFrame + ev.segments.reduce((s, seg) => s + seg.properties.duration, 0);
      return ev.startFrame <= checkFrame && checkFrame < evEnd;
    });

    // No wolven blood stacks should be active after MAX expires
    expect(activeAtCheckFrame).toEqual([]);
  });
});
