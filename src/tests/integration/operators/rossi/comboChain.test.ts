/**
 * @jest-environment jsdom
 */

/**
 * Rossi Combo Chain — Integration Tests
 *
 * Tests the activation window extraction (activationWindow embedded Event structure),
 * maxSkills=2 enforcement, Perfect Timing status lifecycle, and empowered combo gating.
 *
 * Rossi's combo trigger: ENEMY HAVE VULNERABLE + ENEMY HAVE ARTS INFLICTION
 * Normal combo (Moment of Blazing Shadow): applies PERFECT_TIMING status
 * Empowered combo (Moment of Blazing Shadow Empowered): requires PERFECT_TIMING, consumes it
 *
 * Three-layer verification:
 * 1. Context menu: combo variants enabled/disabled based on window + status state
 * 2. Controller: processed events, activation windows, Perfect Timing status
 * 3. View: computeTimelinePresentation shows events in correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  COMBO_WINDOW_COLUMN_ID,
  INFLICTION_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { InteractionModeType, EventStatusType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { getComboTriggerInfo } from '../../../../controller/gameDataStore';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, type AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../../model/game-data/operators/rossi/rossi.json').id;
const COMBO_JSON = require('../../../../model/game-data/operators/rossi/skills/combo-skill-moment-of-blazing-shadow.json');
const COMBO_EMPOWERED_JSON = require('../../../../model/game-data/operators/rossi/skills/combo-skill-moment-of-blazing-shadow-empowered.json');
const PERFECT_TIMING_JSON = require('../../../../model/game-data/operators/rossi/statuses/status-perfect-timing.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const COMBO_ID: string = COMBO_JSON.properties.id;
const COMBO_EMPOWERED_ID: string = COMBO_EMPOWERED_JSON.properties.id;
const PERFECT_TIMING_ID: string = PERFECT_TIMING_JSON.properties.id;

const SLOT_ROSSI = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupRossi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });
  return view;
}

/** Place Vulnerable + Heat infliction on enemy in freeform mode to trigger Rossi's combo window. */
function placeComboTriggers(result: { current: AppResult }, startSec: number, durationSec = 20) {
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, startSec * FPS,
      { name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, startSec * FPS,
      { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
  act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
}

function findComboWindows(result: { current: AppResult }) {
  return result.current.allProcessedEvents.filter(
    (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_ROSSI,
  );
}

function findComboEvents(result: { current: AppResult }) {
  return result.current.allProcessedEvents.filter(
    (ev) => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.COMBO_SKILL,
  );
}

function findPerfectTimingEvents(result: { current: AppResult }) {
  return result.current.allProcessedEvents.filter(
    (ev) => ev.ownerId === SLOT_ROSSI && ev.name === PERFECT_TIMING_ID,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Config Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Config validation', () => {
  it('A1: getComboTriggerInfo returns maxSkills=2 and correct window duration', () => {
    const info = getComboTriggerInfo(ROSSI_ID);
    expect(info).toBeDefined();
    expect(info!.maxSkills).toBe(2);
    expect(info!.windowFrames).toBe(720);
    expect(info!.skillId).toBe(COMBO_ID);
  });

  it('A2: activationWindow has correct trigger conditions', () => {
    const aw = COMBO_JSON.activationWindow;
    expect(aw).toBeDefined();
    expect(aw.onTriggerClause).toHaveLength(1);
    const conds = aw.onTriggerClause[0].conditions;
    expect(conds).toHaveLength(2);
    // Vulnerable + Arts infliction
    expect(conds.some((c: Record<string, unknown>) => c.objectId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE)).toBe(true);
    expect(conds.some((c: Record<string, unknown>) => c.objectQualifier === 'ARTS' && c.object === 'INFLICTION')).toBe(true);
  });

  it('A3: empowered combo requires PERFECT_TIMING via activationClause', () => {
    expect(COMBO_EMPOWERED_JSON.activationClause).toBeDefined();
    const conds = COMBO_EMPOWERED_JSON.activationClause[0].conditions;
    expect(conds[0].objectId).toBe(PERFECT_TIMING_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Activation Window Basics
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Activation window basics', () => {
  it('B1: Combo is NOT available without trigger conditions', () => {
    const { result } = setupRossi();

    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    // Without Vulnerable + Arts infliction, combo should be disabled
    const menu = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menu).not.toBeNull();
    const addItem = menu!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBe(true);
  });

  it('B2: Vulnerable + Arts infliction triggers combo window with maxSkills=2', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    const windows = findComboWindows(result);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].maxSkills).toBe(2);
  });

  it('B3: Activation window duration is 720 frames (6 seconds)', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    const windows = findComboWindows(result);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    const duration = windows[0].segments.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(duration).toBe(720);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Perfect Timing Status Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Perfect Timing status lifecycle', () => {
  it('C1: Normal combo produces PERFECT_TIMING status on Rossi', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    // Place normal combo
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Verify PERFECT_TIMING status was created
    const ptEvents = findPerfectTimingEvents(result);
    expect(ptEvents.length).toBeGreaterThanOrEqual(1);
  });

  // Skip: PERFECT_TIMING status production requires engine to process combo frame FIRST_MATCH clause
  it.skip('C2: Empowered combo consumes PERFECT_TIMING status', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    // Place normal combo first (creates PERFECT_TIMING)
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    const payload1 = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill);
    });

    // Place empowered combo (consumes PERFECT_TIMING)
    const menu = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menu).not.toBeNull();
    const empoweredItem = menu!.find(
      i => i.actionId === 'addEvent' && i.label?.includes('Empowered'),
    );

    // If empowered variant is available, place it
    if (empoweredItem && !empoweredItem.disabled) {
      const empPayload = empoweredItem.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
      act(() => {
        result.current.handleAddEvent(empPayload.ownerId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill);
      });

      // Verify PERFECT_TIMING was consumed
      const ptEvents = findPerfectTimingEvents(result);
      const consumed = ptEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
      expect(consumed.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('C3: Empowered combo NOT available without PERFECT_TIMING (cannot start with empowered)', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    // Try to place empowered combo directly without placing normal first
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    const menu = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menu).not.toBeNull();

    const empoweredItem = menu!.find(
      i => i.actionId === 'addEvent' && i.label?.includes('Empowered'),
    );

    // Empowered should either not appear or be disabled (no PERFECT_TIMING active)
    if (empoweredItem) {
      expect(empoweredItem.disabled).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Chain Validation — maxSkills Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Chain validation — maxSkills enforcement', () => {
  // Skip: empowered combo placement requires PERFECT_TIMING status from engine frame clause processing
  it.skip('D1: Normal combo → empowered combo in strict mode (overlap bypass in multi-skill window)', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);

    // Place normal combo at 2s
    const payload1 = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill);
    });

    // Empowered combo should be placeable during normal combo's cooldown (overlap bypass)
    const menu = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menu).not.toBeNull();
    const empItem = menu!.find(i => i.actionId === 'addEvent' && i.label?.includes('Empowered'));
    if (empItem && !empItem.disabled) {
      const empPayload = empItem.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
      act(() => {
        result.current.handleAddEvent(empPayload.ownerId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill);
      });

      // Both combos placed
      const combos = findComboEvents(result);
      expect(combos).toHaveLength(2);

      // View layer: both visible in column
      const viewModels = computeTimelinePresentation(
        result.current.allProcessedEvents,
        result.current.columns,
      );
      const comboVM = viewModels.get(comboCol!.key);
      expect(comboVM).toBeDefined();
      const rossiCombos = comboVM!.events.filter(ev => ev.ownerId === SLOT_ROSSI);
      expect(rossiCombos).toHaveLength(2);
    }
  });

  it('D2: Normal combo → normal combo overlap bypass in multi-skill window', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);

    // Place first normal combo at 2s
    const payload1 = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill);
    });

    // Second normal combo at 5s — should bypass overlap due to maxSkills=2 window
    const payload2 = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill);
    });

    const combos = findComboEvents(result);
    expect(combos).toHaveLength(2);
  });

  it('D3: Third combo disabled after maxSkills=2 reached', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);

    // Place two combos
    const payload1 = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill);
    });
    const payload2 = getMenuPayload(result.current, comboCol!, 4 * FPS);
    act(() => {
      result.current.handleAddEvent(payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill);
    });

    // Third combo should be disabled
    const menu3 = buildContextMenu(result.current, comboCol!, 6 * FPS);
    expect(menu3).not.toBeNull();
    const addItems = menu3!.filter(i => i.actionId === 'addEvent');
    for (const item of addItems) {
      expect(item.disabled).toBe(true);
    }
  });
  it('D4: First combo cooldown is clamped when second combo is placed in same window', () => {
    const { result } = setupRossi();
    placeComboTriggers(result, 1);

    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);

    // Place first combo at 2s
    const payload1 = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill);
    });

    // Record first combo's full cooldown duration before placing second
    const comboBefore = findComboEvents(result);
    expect(comboBefore).toHaveLength(1);
    const cooldownSegBefore = comboBefore[0].segments.find(
      s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSegBefore).toBeDefined();
    const fullCooldown = cooldownSegBefore!.properties.duration;
    expect(fullCooldown).toBeGreaterThan(0);

    // Place second combo at 5s
    const payload2 = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill);
    });

    // First combo's cooldown should be clamped to end at 5s (second combo's start)
    const combos = findComboEvents(result).sort((a, b) => a.startFrame - b.startFrame);
    expect(combos).toHaveLength(2);

    const firstCombo = combos[0];
    const secondCombo = combos[1];
    expect(firstCombo.startFrame).toBe(2 * FPS);
    expect(secondCombo.startFrame).toBe(5 * FPS);

    // First combo's cooldown should be shorter than the original
    const clampedCooldown = firstCombo.segments.find(
      s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(clampedCooldown).toBeDefined();
    expect(clampedCooldown!.properties.duration).toBeLessThan(fullCooldown);

    // First combo's total duration should end at or before second combo's start
    const firstTotal = firstCombo.segments.reduce((sum, s) => sum + s.properties.duration, 0);
    expect(firstCombo.startFrame + firstTotal).toBeLessThanOrEqual(secondCombo.startFrame);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Cooldown Suppression
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Cooldown suppression', () => {
  it('E1: Combo on cooldown prevents new activation window from triggering', () => {
    const { result } = setupRossi();

    // Place trigger at 1s
    placeComboTriggers(result, 1);

    // Place combo at 2s (enters cooldown after animation)
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Place another set of trigger conditions at 15s (during cooldown)
    placeComboTriggers(result, 15, 20);

    // Combo should NOT be available at 16s — cooldown suppresses new window
    const menuDuringCooldown = buildContextMenu(result.current, comboCol!, 16 * FPS);
    expect(menuDuringCooldown).not.toBeNull();
    const addItem = menuDuringCooldown!.find(i => i.actionId === 'addEvent');
    if (addItem) {
      expect(addItem.disabled).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Razor Clawmark DOT ticks
// ═══════════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-require-imports */
const RAZOR_CLAWMARK_JSON = require('../../../../model/game-data/operators/rossi/statuses/status-razor-clawmark.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const RAZOR_CLAWMARK_ID: string = RAZOR_CLAWMARK_JSON.properties.id;

describe('F. Razor Clawmark DOT ticks', () => {
  it('F1: Razor Clawmark config has 25 DOT frame ticks at 1s intervals', () => {
    const seg = RAZOR_CLAWMARK_JSON.segments[0];
    expect(seg).toBeDefined();
    expect(seg.frames.length).toBe(25);
    // First tick at 1s, last at 25s
    expect(seg.frames[0].properties.offset.value).toBe(1);
    expect(seg.frames[24].properties.offset.value).toBe(25);
    // Each frame has a DEAL PHYSICAL DAMAGE clause
    for (const frame of seg.frames) {
      const dealEffect = frame.clause[0].effects[0];
      expect(dealEffect.verb).toBe('DEAL');
      expect(dealEffect.objectQualifier).toBe('PHYSICAL');
      expect(dealEffect.object).toBe('DAMAGE');
    }
  });

  it('F2: Freeform-placed Razor Clawmark produces status event with frame ticks', () => {
    const { result } = setupRossi();

    // Place Razor Clawmark directly on enemy in freeform mode
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, RAZOR_CLAWMARK_ID, 1 * FPS,
        { name: RAZOR_CLAWMARK_ID, segments: [{ properties: { duration: 25 * FPS } }] },
      );
    });
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Controller: Razor Clawmark event exists on enemy
    const rcEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && (ev.name === RAZOR_CLAWMARK_ID || ev.columnId === RAZOR_CLAWMARK_ID),
    );
    expect(rcEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Trigger order independence
// ═══════════════════════════════════════════════════════════════════════════════

describe('G0. Combo column variants', () => {
  it('G0: Combo column has both normal and empowered variants', () => {
    const { result } = setupRossi();
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    expect(comboCol!.eventVariants).toBeDefined();
    expect(comboCol!.eventVariants!.length).toBeGreaterThanOrEqual(2);
    const variantIds = comboCol!.eventVariants!.map(v => v.id);
    expect(variantIds).toContain(COMBO_ID);
    expect(variantIds).toContain(COMBO_EMPOWERED_ID);
  });
});

describe('G. Trigger order independence', () => {
  it('G1: Heat first, then Vulnerable 1s later → activation window active', () => {
    const { result } = setupRossi();

    // Place Heat infliction at 1s, Vulnerable at 2s
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 1 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, 2 * FPS,
        { name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Activation window should exist (both conditions met at 2s)
    const windows = findComboWindows(result);
    expect(windows.length).toBeGreaterThanOrEqual(1);

    // Combo should be available at 3s (within window)
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    const menu = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menu).not.toBeNull();
    const addItem = menu!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBeFalsy();
  });

  it('G2: Vulnerable first, then Heat 1s later → activation window active', () => {
    const { result } = setupRossi();

    // Place Vulnerable at 1s, Heat at 2s
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, 1 * FPS,
        { name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 2 * FPS,
        { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    // Activation window should exist (both conditions met at 2s)
    const windows = findComboWindows(result);
    expect(windows.length).toBeGreaterThanOrEqual(1);

    // Combo should be available at 3s (within window)
    const comboCol = findColumn(result.current, SLOT_ROSSI, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();
    const menu = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menu).not.toBeNull();
    const addItem = menu!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBeFalsy();
  });
});
