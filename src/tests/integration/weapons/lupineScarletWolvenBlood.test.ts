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
import { CritMode, EventStatusType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload, type AppResult } from '../helpers';

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

    // Verify weapon skill presence event exists (confirms weapon loaded)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WEAPON_SKILL_ID: string = require('../../../model/game-data/weapons/lupine-scarlet/skills/skill-fracture-gnashing-wolves.json').properties.id;
    const presence = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ROSSI && ev.name === WEAPON_SKILL_ID && ev.startFrame === 0,
    );
    expect(presence).toHaveLength(1);

    placeBattleSkill(result.current, 2);

    // Debug: check all Wolven Blood events (including consumed)
    const allWB = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ROSSI && (ev.name === WOLVEN_BLOOD_ID || ev.columnId === WOLVEN_BLOOD_ID),
    );
    // eslint-disable-next-line no-console
    console.log(`Wolven Blood events: ${allWB.length}, statuses: ${allWB.map(e => `${e.name}@${e.startFrame} status=${e.eventStatus}`).join(', ')}`);

    const stacks = findWolvenBloodStacks(result.current);
    // Each crit damage frame should produce one Wolven Blood stack
    expect(stacks.length).toBe(DAMAGE_FRAMES_PER_BS);
  });

  it('B2: Multiple battle skills accumulate Wolven Blood stacks', () => {
    const { result } = setupRossiWithLupineScarlet();

    // Place two battle skills back-to-back
    placeBattleSkill(result.current, 2);
    placeBattleSkill(result.current, 5);

    const stacks = findWolvenBloodStacks(result.current);
    expect(stacks.length).toBe(DAMAGE_FRAMES_PER_BS * 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Max Stacks → Wolven Blood Max
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Max stacks triggers Wolven Blood Max', () => {
  it('C1: Reaching 16 stacks produces Wolven Blood (Max Stacks) with 20s duration', () => {
    const { result } = setupRossiWithLupineScarlet();

    // Place enough battle skills to reach 16 stacks
    // Each BS has DAMAGE_FRAMES_PER_BS crit frames → need ceil(16 / DAMAGE_FRAMES_PER_BS) BSes
    const bsNeeded = Math.ceil(16 / DAMAGE_FRAMES_PER_BS);
    for (let i = 0; i < bsNeeded; i++) {
      placeBattleSkill(result.current, 2 + i * 3);
    }

    // Should have 16 stacks (capped)
    const stacks = findWolvenBloodStacks(result.current);
    expect(stacks.length).toBe(16);

    // Wolven Blood Max should exist
    const maxEvents = findWolvenBloodMaxEvents(result.current);
    expect(maxEvents.length).toBeGreaterThanOrEqual(1);

    // Max event duration should be 20s = 2400 frames
    const maxDur = maxEvents[0].segments.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(maxDur).toBe(20 * FPS);
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
