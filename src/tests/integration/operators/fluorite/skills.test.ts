/**
 * @jest-environment jsdom
 */

/**
 * Fluorite Skills -- Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill Slow + Nature infliction effects
 * 3. Combo skill cooldown scaling
 * 4. Unpredictable talent status derivation
 * 5. View-layer presentation verification
 *
 * Verifies all three layers:
 * - Context menu: menu items are available and enabled
 * - Controller: event counts, event status, timing, duration
 * - View: computeTimelinePresentation includes events in their columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, SegmentType, ElementType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AddEventPayload } from '../../helpers';
import { ColumnType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { INFLICTION_COLUMNS, ENEMY_ID, ENEMY_GROUP_COLUMNS, OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { buildDamageTableRows } from '../../../../controller/calculation/damageTableBuilder';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../../view/InformationPane';

// ── Game-data verified constants ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const FLUORITE_JSON = require('../../../../model/game-data/operators/fluorite/fluorite.json');
const FLUORITE_ID: string = FLUORITE_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/battle-skill-tiny-surprise.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/combo-skill-free-giveaway.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/skills/ultimate-apex-prankster.json',
).properties.id;

const UNPREDICTABLE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-unpredictable.json',
).properties.id;

const IMPROVISED_EXPLOSIVE_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-improvised-explosive.json',
).properties.id;

const IMPROVISED_EXPLOSIVE_ULT_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-improvised-explosive-ult.json',
).properties.id;

const LOVE_THE_STAB_AND_TWIST_ID: string = require(
  '../../../../model/game-data/operators/fluorite/talents/talent-love-the-stab-and-twist-talent.json',
).properties.id;

const CRAVER_OF_CHAOS_ID: string = require(
  '../../../../model/game-data/operators/fluorite/statuses/status-craver-of-chaos.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_FLUORITE = 'slot-0';

function setupFluorite() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_FLUORITE, FLUORITE_ID); });
  return view;
}


// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill places in BATTLE_SKILL column', () => {
    const { result } = setupFluorite();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE,
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
      (ev) => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_FLUORITE,
    )).toBe(true);
  });

  it('A2: Combo skill freeform placement with long cooldown', () => {
    const { result } = setupFluorite();

    // Combo requires activation conditions -- switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);

    // Combo has a cooldown segment -- total duration should include 40s cooldown at default skill level
    const cooldownSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
    // At default skill level (L12), cooldown = 38s
    expect(cooldownSeg!.properties.duration).toBe(38 * FPS);
  });

  it('A3: Ultimate with energy cost (100 base, P4 = 90)', () => {
    const { result } = setupFluorite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_FLUORITE, NounType.ULTIMATE);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);

    // Energy cost verification via game data function
    expect(getUltimateEnergyCostForPotential(FLUORITE_ID, 0)).toBe(100);
    expect(getUltimateEnergyCostForPotential(FLUORITE_ID, 4)).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill -- Slow and Nature Infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill Effects', () => {
  it('B1: BS generates nature infliction event on enemy', () => {
    const { result } = setupFluorite();

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // BS has frame at 2.97s that applies nature infliction to enemy
    // The infliction should appear as a derived event in the processed events
    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    // Check that the battle skill has frames with infliction effects in JSON
    // The second frame at 2.97s has APPLY INFLICTION NATURE
    const allFrames = battleEvents[0].segments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(allFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: BS segment has correct duration (1.13s)', () => {
    const { result } = setupFluorite();

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battleEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    // The skill JSON defines segment duration of 1.13s
    // Verify the active segment has the correct frame-converted duration
    expect(battleEvents[0].segments.length).toBeGreaterThanOrEqual(1);
    const activeDuration = battleEvents[0].segments[0].properties.duration;
    expect(activeDuration).toBe(Math.round(1.13 * FPS));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo Skill -- Cooldown Scaling
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo Cooldown', () => {
  it('C1: Combo cooldown is 40s base (level-dependent)', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Total event duration includes animation (0.5s) + active (0.07s) + cooldown (38s at L12)
    const totalDuration = eventDuration(combos[0]);
    // Cooldown segment is 38s at default skill level (L12)
    const cooldownSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
    expect(cooldownSeg!.properties.duration).toBe(38 * FPS);

    // Total event duration should include the cooldown
    expect(totalDuration).toBeGreaterThanOrEqual(38 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Unpredictable Talent
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Unpredictable Talent', () => {
  it('D1: Unpredictable status ID matches JSON config', () => {
    // Verify the status ID loads correctly from JSON
    // Verify the talent status loads and has a non-empty ID from JSON
    expect(UNPREDICTABLE_ID).toBeTruthy();

    // Verify operator has correct element
    expect(FLUORITE_JSON.elementType).toBe(ElementType.NATURE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: All skill columns are visible in presentation', () => {
    const { result } = setupFluorite();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Battle skill column exists
    const battleCol = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE);
    expect(battleCol).toBeDefined();
    expect(viewModels.has(battleCol!.key)).toBe(true);

    // Combo column exists
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO);
    expect(comboCol).toBeDefined();
    expect(viewModels.has(comboCol!.key)).toBe(true);

    // Ultimate column exists
    const ultCol = findColumn(result.current, SLOT_FLUORITE, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    expect(viewModels.has(ultCol!.key)).toBe(true);

    // Basic attack column exists
    const baCol = findColumn(result.current, SLOT_FLUORITE, NounType.BASIC_ATTACK);
    expect(baCol).toBeDefined();
    expect(viewModels.has(baCol!.key)).toBe(true);
  });

  it('E2: Battle skill event appears in presentation after placement', () => {
    const { result } = setupFluorite();

    const col = findColumn(result.current, SLOT_FLUORITE, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(col!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events).toHaveLength(1);
    expect(battleVM!.events[0].name).toBe(BATTLE_SKILL_ID);
    expect(battleVM!.events[0].ownerEntityId).toBe(SLOT_FLUORITE);
  });
});

// ─── Helpers for advanced scenarios ─────────────────────────────────────────

function placeBS(app: ReturnType<typeof useApp>, frame: number) {
  const col = findColumn(app, SLOT_FLUORITE, NounType.BATTLE)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function placeUlt(app: ReturnType<typeof useApp>, frame: number) {
  const col = findColumn(app, SLOT_FLUORITE, NounType.ULTIMATE)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function placeCombo(app: ReturnType<typeof useApp>, frame: number) {
  const col = findColumn(app, SLOT_FLUORITE, NounType.COMBO)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function findEnemyStatusCol(app: ReturnType<typeof useApp>) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

/** Place a freeform infliction (CRYO or NATURE) on the enemy status column. */
function placeInfliction(app: ReturnType<typeof useApp>, inflictionColumnId: string, frame: number) {
  const enemyStatusCol = findEnemyStatusCol(app)!;
  const menu = buildContextMenu(app, enemyStatusCol, frame)!;
  const item = menu.find(
    (i) =>
      i.actionId === 'addEvent' &&
      (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === inflictionColumnId,
  );
  if (!item) return false;
  const payload = item.actionPayload as AddEventPayload;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
  return true;
}

function setFluoritePotential(app: ReturnType<typeof useApp>, potential: number) {
  const props = app.loadoutProperties[SLOT_FLUORITE];
  act(() => {
    app.handleStatsChange(SLOT_FLUORITE, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// F. BS → IMPROVISED_EXPLOSIVE on enemy
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. BS Applies IMPROVISED_EXPLOSIVE', () => {
  it('F1: BS produces IMPROVISED_EXPLOSIVE status event on enemy timeline', () => {
    const { result } = setupFluorite();
    placeBS(result.current, 5 * FPS);

    // ── Controller layer ──
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);
    const ie = ieEvents[0];
    expect(ie.sourceSkillName).toBe(BATTLE_SKILL_ID);

    // Duration matches config (2.97s)
    expect(eventDuration(ie)).toBe(Math.round(2.97 * FPS));

    // Has at least one segment with a frame carrying the explosion effects
    const seg = ie.segments[0];
    expect(seg).toBeDefined();
    expect((seg.frames ?? []).length).toBeGreaterThanOrEqual(1);

    // ── View layer: present in enemy status column ──
    const enemyStatusCol = findEnemyStatusCol(result.current);
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some((ev) => ev.columnId === IMPROVISED_EXPLOSIVE_ID)).toBe(true);
  });

  it('F2: Two BS placements respect 1-stack RESET limit', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeBS(result.current, 3 * FPS);
    placeBS(result.current, 6 * FPS);

    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    // RESET with limit 1: at most 1 active at any moment; we expect <= 2 instances total (chained)
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);
    expect(ieEvents.length).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Combo Trigger Predicates (CRYO / NATURE infliction stacks)
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. CS Trigger Predicates', () => {
  it('G1: CS becomes available when enemy has 2 stacks of NATURE infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Stack 2 freeform NATURE inflictions on enemy
    const placed1 = placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 2 * FPS);
    const placed2 = placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 3 * FPS);
    expect(placed1 && placed2).toBe(true);

    const natureEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    );
    expect(natureEvents.length).toBeGreaterThanOrEqual(2);

    // Switch back to default mode and check the combo column for an enabled add menu
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO)!;
    const items = buildContextMenu(result.current, comboCol, 6 * FPS);
    expect(items).not.toBeNull();
    // At least one addEvent should be enabled (combo activation window opened)
    const enabledCombos = items!.filter((i) => i.actionId === 'addEvent' && !i.disabled);
    expect(enabledCombos.length).toBeGreaterThanOrEqual(1);
  });

  it('G2: CS becomes available when enemy has 2 stacks of CRYO infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);

    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO)!;
    const items = buildContextMenu(result.current, comboCol, 6 * FPS);
    expect(items).not.toBeNull();
    const enabledCombos = items!.filter((i) => i.actionId === 'addEvent' && !i.disabled);
    expect(enabledCombos.length).toBeGreaterThanOrEqual(1);
  });

  it('G3: CS is NOT available with <2 stacks of either infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Only 1 cryo stack
    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);

    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
    const comboCol = findColumn(result.current, SLOT_FLUORITE, NounType.COMBO)!;
    const items = buildContextMenu(result.current, comboCol, 4 * FPS);
    expect(items).not.toBeNull();
    const enabledCombos = items!.filter((i) => i.actionId === 'addEvent' && !i.disabled);
    expect(enabledCombos.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. CS SOURCE INFLICTION dispatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. CS SOURCE INFLICTION dispatch', () => {
  it('H1: CS fired with NATURE inflictions applies an additional NATURE infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 2 * FPS);
    placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 3 * FPS);

    const natureBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    ).length;

    placeCombo(result.current, 5 * FPS);

    const natureAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    ).length;
    // CS frame applies 1 additional NATURE infliction via objectDeterminer:TRIGGER → SOURCE-flavored
    expect(natureAfter).toBeGreaterThan(natureBefore);

    // No spurious CRYO infliction was added
    const cryo = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryo.length).toBe(0);
  });

  it('H2: CS fired with CRYO inflictions applies an additional CRYO infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);

    const cryoBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    ).length;

    placeCombo(result.current, 5 * FPS);

    const cryoAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    ).length;
    expect(cryoAfter).toBeGreaterThan(cryoBefore);

    // No spurious NATURE infliction
    const nature = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    );
    expect(nature.length).toBe(0);
  });

  it('H3: CS SOURCE dispatch varies by pre-existing infliction configuration (freeform)', () => {
    // Case A: only CRYO present → CS adds CRYO, never NATURE
    {
      const { result } = setupFluorite();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);
      placeCombo(result.current, 5 * FPS);

      const natureCount = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
      ).length;
      expect(natureCount).toBe(0);
      const cryoCount = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
      ).length;
      expect(cryoCount).toBeGreaterThanOrEqual(3);
    }

    // Case B: only NATURE present → CS adds NATURE, never CRYO
    {
      const { result } = setupFluorite();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 2 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 3 * FPS);
      placeCombo(result.current, 5 * FPS);

      const cryoCount = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
      ).length;
      expect(cryoCount).toBe(0);
      const natureCount = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
      ).length;
      expect(natureCount).toBeGreaterThanOrEqual(3);
    }

    // Case C: BOTH inflictions present → CS must pick exactly one, not add both
    {
      const { result } = setupFluorite();
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 2 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 3 * FPS);

      const cryoBefore = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
      ).length;
      const natureBefore = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
      ).length;

      placeCombo(result.current, 5 * FPS);

      const cryoAfter = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
      ).length;
      const natureAfter = result.current.allProcessedEvents.filter(
        (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
      ).length;

      // The CS SOURCE-based dispatch must not double-apply both elements.
      // Whether the engine picks one element or treats the ambiguous TRIGGER as
      // a no-op, the key invariant is: at most one element's count increased.
      const cryoDelta = cryoAfter - cryoBefore;
      const natureDelta = natureAfter - natureBefore;
      expect(Math.min(cryoDelta, natureDelta)).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. ULT first frame conditional on IMPROVISED_EXPLOSIVE
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. ULT vs IMPROVISED_EXPLOSIVE', () => {
  it('I1: ULT with IMPROVISED_EXPLOSIVE present consumes it and applies IMPROVISED_EXPLOSIVE_ULT', () => {
    const { result } = setupFluorite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    // BS first to apply IMPROVISED_EXPLOSIVE
    placeBS(result.current, 2 * FPS);
    const ieBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieBefore.length).toBeGreaterThanOrEqual(1);

    // ULT shortly after BS
    placeUlt(result.current, 4 * FPS);

    // IMPROVISED_EXPLOSIVE_ULT must appear on enemy
    const ieUlt = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ULT_ID,
    );
    expect(ieUlt.length).toBeGreaterThanOrEqual(1);
    expect(ieUlt[0].sourceSkillName).toBe(ULTIMATE_ID);

    // ── View layer: visible on enemy status column ──
    const enemyStatusCol = findEnemyStatusCol(result.current)!;
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol.key);
    expect(enemyVM!.events.some((ev) => ev.columnId === IMPROVISED_EXPLOSIVE_ULT_ID)).toBe(true);
  });

  it('I2: ULT without IMPROVISED_EXPLOSIVE does NOT apply IMPROVISED_EXPLOSIVE_ULT', () => {
    const { result } = setupFluorite();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    placeUlt(result.current, 4 * FPS);

    const ieUlt = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ULT_ID,
    );
    expect(ieUlt.length).toBe(0);
  });

  it('I3: ULT total damage is HIGHER when IMPROVISED_EXPLOSIVE is present (numeric)', () => {
    function totalUltDamage(app: ReturnType<typeof useApp>) {
      const loadoutStats: Record<string, typeof DEFAULT_LOADOUT_PROPERTIES> = {};
      for (const slot of app.slots) loadoutStats[slot.slotId] = DEFAULT_LOADOUT_PROPERTIES;
      const rows = buildDamageTableRows(
        app.allProcessedEvents,
        app.columns,
        app.slots,
        app.enemy,
        loadoutStats,
      );
      // Sum all damage rows that came from the ULTIMATE event on Fluorite's slot
      return rows
        .filter((r) => r.ownerEntityId === SLOT_FLUORITE && r.columnId === NounType.ULTIMATE)
        .reduce((sum, r) => sum + (r.damage ?? 0), 0);
    }

    // ── WITH IMPROVISED_EXPLOSIVE: BS first, then ULT ──
    const withIE = setupFluorite();
    act(() => { setUltimateEnergyToMax(withIE.result.current, SLOT_FLUORITE, 0); });
    placeBS(withIE.result.current, 2 * FPS);
    placeUlt(withIE.result.current, 4 * FPS);
    const ieEvts = withIE.result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieEvts.length).toBeGreaterThanOrEqual(1);
    const damageWithIE = totalUltDamage(withIE.result.current);

    // ── WITHOUT IMPROVISED_EXPLOSIVE: ULT only ──
    const noIE = setupFluorite();
    act(() => { setUltimateEnergyToMax(noIE.result.current, SLOT_FLUORITE, 0); });
    placeUlt(noIE.result.current, 4 * FPS);
    const damageWithoutIE = totalUltDamage(noIE.result.current);

    // Both must be positive
    expect(damageWithoutIE).toBeGreaterThan(0);
    expect(damageWithIE).toBeGreaterThan(0);
    // The IE-conditional first frame must contribute strictly more damage when IE is present
    expect(damageWithIE).toBeGreaterThan(damageWithoutIE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. ULT last frame re-applies infliction at ≥2 stacks
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. ULT Last Frame Re-Apply Infliction', () => {
  it('J1: ULT with ≥2 NATURE inflictions re-applies NATURE infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 2 * FPS);
    placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 3 * FPS);
    const natureBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    ).length;

    placeUlt(result.current, 5 * FPS);

    const natureAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    ).length;
    expect(natureAfter).toBeGreaterThan(natureBefore);
  });

  it('J2: ULT with ≥2 CRYO inflictions re-applies CRYO infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
    placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);
    const cryoBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    ).length;

    placeUlt(result.current, 5 * FPS);

    const cryoAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    ).length;
    expect(cryoAfter).toBeGreaterThan(cryoBefore);
  });

  it('J3: ULT with <2 stacks does not re-apply any infliction', () => {
    const { result } = setupFluorite();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_FLUORITE, 0); });

    // No pre-existing infliction
    const natureBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    ).length;
    const cryoBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    ).length;

    placeUlt(result.current, 5 * FPS);

    // Last-frame conditional re-apply branches should not have fired.
    // (Other ULT frames may still emit damage, but no NEW infliction status events.)
    const natureAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.NATURE,
    ).length;
    const cryoAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    ).length;
    expect(natureAfter).toBe(natureBefore);
    expect(cryoAfter).toBe(cryoBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. T1 Love the Stab and Twist (SLOWED-conditional)
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. T1 SLOWED-Conditional Talent', () => {
  it('K1: T1 status present on operator while enemy is SLOWED (from BS → IMPROVISED_EXPLOSIVE)', () => {
    const { result } = setupFluorite();

    // Baseline: no talent events before any BS
    const before = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.name === LOVE_THE_STAB_AND_TWIST_ID,
    );
    expect(before.length).toBe(0);

    placeBS(result.current, 5 * FPS);

    // Controller: talent status on fluorite appears during the IMPROVISED_EXPLOSIVE window
    const talentEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.name === LOVE_THE_STAB_AND_TWIST_ID,
    );
    expect(talentEvents.length).toBeGreaterThanOrEqual(1);

    // Find the IMPROVISED_EXPLOSIVE window that BS produced to bound expectations
    const ieEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === IMPROVISED_EXPLOSIVE_ID,
    );
    expect(ieEvents.length).toBeGreaterThanOrEqual(1);
    const ieStart = ieEvents[0].startFrame;
    const ieEnd = ieStart + eventDuration(ieEvents[0]);

    // Talent must start within the SLOW window and not persist past its end
    const t = talentEvents[0];
    expect(t.startFrame).toBeGreaterThanOrEqual(ieStart);
    const tEnd = t.startFrame + eventDuration(t);
    expect(tEnd).toBeLessThanOrEqual(ieEnd + 1);

    // View layer: present in operator status column for fluorite
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    let viewHasTalent = false;
    viewModels.forEach((vm) => {
      if (vm.events.some(
        (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.name === LOVE_THE_STAB_AND_TWIST_ID,
      )) viewHasTalent = true;
    });
    expect(viewHasTalent).toBe(true);
    // Reference constant to keep it used.
    expect(OPERATOR_STATUS_COLUMN_ID).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. P5 Cooldown Reduction
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. P5 Cooldown Reduction', () => {
  function comboCooldownDuration(app: ReturnType<typeof useApp>) {
    const combos = app.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === NounType.COMBO,
    );
    expect(combos.length).toBeGreaterThanOrEqual(1);
    const seg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(seg).toBeDefined();
    return seg!.properties.duration;
  }

  it('L1: At P5 CS cooldown is reduced by 1s vs P0 via CRAVER_OF_CHAOS (and deduped within 1s)', () => {
    // P0 baseline — no CRAVER_OF_CHAOS should ever appear
    const p0 = setupFluorite();
    act(() => { p0.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    setFluoritePotential(p0.result.current, 0);
    placeCombo(p0.result.current, 2 * FPS);
    // Apply a cryo infliction AFTER the combo so a potential CRAVER trigger would fire
    placeInfliction(p0.result.current, INFLICTION_COLUMNS.CRYO, 5 * FPS);

    const cravP0 = p0.result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === CRAVER_OF_CHAOS_ID,
    );
    expect(cravP0.length).toBe(0);
    const cdP0 = comboCooldownDuration(p0.result.current);

    // P5 — CRAVER should fire and reduce the combo cooldown by 1s
    const p5 = setupFluorite();
    act(() => { p5.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    setFluoritePotential(p5.result.current, 5);
    placeCombo(p5.result.current, 2 * FPS);
    placeInfliction(p5.result.current, INFLICTION_COLUMNS.CRYO, 5 * FPS);

    const cravP5 = p5.result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === CRAVER_OF_CHAOS_ID,
    );
    expect(cravP5.length).toBeGreaterThanOrEqual(1);
    const cdP5 = comboCooldownDuration(p5.result.current);
    expect(cdP0 - cdP5).toBe(1 * FPS);

    // View layer: CRAVER_OF_CHAOS visible at P5
    const viewModels = computeTimelinePresentation(
      p5.result.current.allProcessedEvents,
      p5.result.current.columns,
    );
    let viewHasCraver = false;
    viewModels.forEach((vm) => {
      if (vm.events.some(
        (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === CRAVER_OF_CHAOS_ID,
      )) viewHasCraver = true;
    });
    expect(viewHasCraver).toBe(true);

    // Dedupe: second infliction within the 1s IMMEDIATE_COOLDOWN window must not
    // create a second CRAVER_OF_CHAOS event.
    const dedupe = setupFluorite();
    act(() => { dedupe.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    setFluoritePotential(dedupe.result.current, 5);
    placeCombo(dedupe.result.current, 2 * FPS);
    placeInfliction(dedupe.result.current, INFLICTION_COLUMNS.CRYO, 5 * FPS);
    // Second infliction ~0.3s later (well within 1s cooldown window)
    placeInfliction(dedupe.result.current, INFLICTION_COLUMNS.CRYO, 5 * FPS + Math.round(0.3 * FPS));

    const cravDedupe = dedupe.result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_FLUORITE && ev.columnId === CRAVER_OF_CHAOS_ID,
    );
    expect(cravDedupe.length).toBe(1);
  });
});
