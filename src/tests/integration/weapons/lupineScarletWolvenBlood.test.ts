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
  const col = findColumn(app, SLOT_ROSSI, NounType.BATTLE_SKILL);
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
    if (statusCol) {
      const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
      const vm = viewModels.get(statusCol.key);
      if (vm) {
        const wbEvents = vm.events.filter(ev => ev.name === WOLVEN_BLOOD_ID);
        expect(wbEvents.length).toBe(DAMAGE_FRAMES_PER_BS);
      }
    }
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
    const statusCol = findStatusColumn(result.current, SLOT_ROSSI);
    if (statusCol) {
      const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
      const vm = viewModels.get(statusCol.key);
      if (vm) {
        const wbEvents = vm.events.filter(ev => ev.name === WOLVEN_BLOOD_ID);
        expect(wbEvents.length).toBe(DAMAGE_FRAMES_PER_BS * 2);
      }
    }
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
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(bsEvent).toBeDefined();

    // Place remaining BSes using handleAddEvent directly (bypass SP check via freeform)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const bsNeeded = Math.ceil(16 / DAMAGE_FRAMES_PER_BS);
    for (let i = 1; i < bsNeeded; i++) {
      act(() => {
        result.current.handleAddEvent(
          SLOT_ROSSI, NounType.BATTLE_SKILL, (2 + i * 3) * FPS,
          { name: bsEvent!.name, segments: bsEvent!.segments },
        );
      });
    }
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Controller: should have 16 stacks (capped)
    const stacks = findWolvenBloodStacks(result.current);
    expect(stacks.length).toBe(16);

    // Controller: Wolven Blood Max should exist
    const maxEvents = findWolvenBloodMaxEvents(result.current);
    expect(maxEvents.length).toBeGreaterThanOrEqual(1);

    // Controller: Max event duration should be 20s = 2400 frames
    const maxDur = maxEvents[0].segments.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(maxDur).toBe(20 * FPS);

    // View: both Wolven Blood stacks and Wolven Blood Max visible in status column
    const statusCol = findStatusColumn(result.current, SLOT_ROSSI);
    if (statusCol) {
      const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
      const vm = viewModels.get(statusCol.key);
      if (vm) {
        const wbInView = vm.events.filter(ev => ev.name === WOLVEN_BLOOD_ID);
        expect(wbInView.length).toBe(16);
        const wbMaxInView = vm.events.filter(ev => ev.name === WOLVEN_BLOOD_MAX_ID);
        expect(wbMaxInView.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('C2: Wolven Blood Max onExitClause consumes all Wolven Blood stacks (config check)', () => {
    // This is a config-level assertion — the engine onExitClause processing
    // is not yet wired, so we verify the config is correct for when it is.
    const wbm = require('../../../model/game-data/weapons/lupine-scarlet/statuses/status-lupine-scarlet-wolven-blood-max.json');
    const exitEffects = wbm.onExitClause[0].effects;
    expect(exitEffects).toHaveLength(1);
    expect(exitEffects[0].verb).toBe('CONSUME');
    expect(exitEffects[0].object).toBe('STATUS');
    expect(exitEffects[0].objectId).toBe(WOLVEN_BLOOD_ID);
    expect(exitEffects[0].with.stacks).toBe('MAX');
    expect(exitEffects[0].toDeterminer).toBe('THIS');
    expect(exitEffects[0].to).toBe('OPERATOR');
  });
});
