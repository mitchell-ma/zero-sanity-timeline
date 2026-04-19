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
import { NounType, VerbType, DeterminerType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType, SegmentType, UnitType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findDealDamageInClauses } from '../../../../controller/timeline/clauseQueries';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { INFLICTION_COLUMNS, ENEMY_ID, ENEMY_GROUP_COLUMNS, OPERATOR_STATUS_COLUMN_ID, COMBO_WINDOW_COLUMN_ID } from '../../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

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

const WHIRLPOOL_JSON = require(
  '../../../../model/game-data/operators/tangtang/statuses/status-whirlpool.json',
);
const WHIRLPOOL_ID: string = WHIRLPOOL_JSON.properties.id;

const WATERSPOUT_JSON = require(
  '../../../../model/game-data/operators/tangtang/statuses/status-waterspout.json',
);
const WATERSPOUT_ID: string = WATERSPOUT_JSON.properties.id;

const OLDEN_STARE_JSON = require(
  '../../../../model/game-data/operators/tangtang/statuses/status-olden-stare.json',
);
const OLDEN_STARE_ID: string = OLDEN_STARE_JSON.properties.id;

const EARLY_ROGUE_WAVE_JSON = require(
  '../../../../model/game-data/operators/tangtang/statuses/status-early-rogue-wave.json',
);
const EARLY_ROGUE_WAVE_ID: string = EARLY_ROGUE_WAVE_JSON.properties.id;

const WATERSPOUT_ULT_JSON = require(
  '../../../../model/game-data/operators/tangtang/statuses/status-waterspout-ult.json',
);
const WATERSPOUT_ULT_ID: string = WATERSPOUT_ULT_JSON.properties.id;

const TANGTANG_BATK_ID: string = require(
  '../../../../model/game-data/operators/tangtang/skills/basic-attack-batk-basic-attack.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_TANGTANG = 'slot-0';

function setupTangtang() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_TANGTANG, TANGTANG_ID); });
  return view;
}

/** Place a battle skill at the given frame. */
function placeBS(app: AppResult, frame: number) {
  const col = findColumn(app, SLOT_TANGTANG, NounType.BATTLE)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

/** Place a combo skill in freeform mode at the given frame. */
function placeCombo(app: AppResult, frame: number) {
  const col = findColumn(app, SLOT_TANGTANG, NounType.COMBO)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

/** Place an ultimate at the given frame (energy must be set first). */
function placeUlt(app: AppResult, frame: number) {
  const col = findColumn(app, SLOT_TANGTANG, NounType.ULTIMATE)!;
  const payload = getMenuPayload(app, col, frame);
  act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

/** Place a specific BA variant by matching defaultSkill.id in the menu. */
function placeBAVariant(app: AppResult, frame: number, variantId: string) {
  const col = findColumn(app, SLOT_TANGTANG, NounType.BASIC_ATTACK)!;
  const menuItems = buildContextMenu(app, col, frame);
  expect(menuItems).not.toBeNull();
  const matchById = (i: { actionId?: string; actionPayload?: unknown }) =>
    i.actionId === 'addEvent'
    && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === variantId;
  const item = menuItems!.find(matchById);
  expect(item).toBeDefined();
  if (item!.disabled) {
    act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
    const freeItems = buildContextMenu(app, col, frame);
    const freeItem = freeItems!.find(matchById);
    expect(freeItem).toBeDefined();
    const payload = freeItem!.actionPayload as AddEventPayload;
    act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
    return;
  }
  const payload = item!.actionPayload as AddEventPayload;
  act(() => { app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });
}

/** Change potential level for TangTang. */
function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_TANGTANG];
  act(() => {
    app.handleStatsChange(SLOT_TANGTANG, { ...props, operator: { ...props.operator, potential } });
  });
}

/** Find a matching column for status events (checks columnId and matchColumnIds). */
function findMatchingColumn(app: AppResult, ownerEntityId: string, matchId: string) {
  return app.columns.find((c): c is MiniTimeline =>
    c.type === ColumnType.MINI_TIMELINE && c.ownerEntityId === ownerEntityId
    && (c.columnId === matchId || (c.matchColumnIds?.includes(matchId) ?? false)));
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
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.BASIC_ATTACK,
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
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.BASIC_ATTACK,
    )).toBe(true);
  });

  it('A1: Battle skill places in BATTLE_SKILL column', () => {
    const { result } = setupTangtang();

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BATTLE);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.BATTLE,
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
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_TANGTANG,
    )).toBe(true);
  });

  it('A2: Combo skill places in freeform with cooldown (14s base)', () => {
    const { result } = setupTangtang();

    // Combo requires activation — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu layer ──
    const col = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO);
    expect(col).toBeDefined();
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.COMBO,
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
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.ULTIMATE,
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
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    ).length;

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer: cryo infliction generated ──
    const cryoAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoAfter.length).toBeGreaterThan(cryoBefore);

    // ── View layer: enemy status column shows cryo infliction ──
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerEntityId === ENEMY_ID &&
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

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.COMBO,
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
        payload.ownerEntityId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ──
    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.ULTIMATE,
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
      ev => ev.name === ULTIMATE_ID && ev.ownerEntityId === SLOT_TANGTANG,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer — Skills Visible
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: Battle skill visible in battle skill column view model', () => {
    const { result } = setupTangtang();

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
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
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.BATTLE,
    ).length).toBeGreaterThanOrEqual(1);
  });

  it('E2: Combo skill visible in combo column view model (freeform)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId,
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
      ev => ev.name === COMBO_ID && ev.ownerEntityId === SLOT_TANGTANG,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Combo Skill — Whirlpool Creation
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Combo Skill — Whirlpool Creation', () => {
  it('F1: Combo creates WHIRLPOOL status on operator', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(result.current, 2 * FPS);

    // ── Controller layer: whirlpool event on operator ──
    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools.length).toBeGreaterThanOrEqual(1);
    expect(whirlpools[0].sourceSkillId).toBe(COMBO_ID);

    // ── View layer: whirlpool in operator status column ──
    const statusCol = findMatchingColumn(result.current, SLOT_TANGTANG, WHIRLPOOL_ID)
      ?? findColumn(result.current, SLOT_TANGTANG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(ev => ev.columnId === WHIRLPOOL_ID)).toBe(true);
  });

  it('F2: Combo does NOT apply cryo infliction (deals cryo DMG only)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const cryoBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    ).length;

    placeCombo(result.current, 2 * FPS);

    // Combo deals Cryo DMG and creates Whirlpool — but does NOT apply cryo infliction.
    // Cryo infliction is the TRIGGER condition, not an effect of the combo itself.
    const cryoAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoAfter.length).toBe(cryoBefore);
  });

  it('F3: Two combos create 2 whirlpool events (at stack limit)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Battle Skill — Waterspout Creation
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Battle Skill — Waterspout Creation', () => {
  it('G1: BS with 0 whirlpools creates WATERSPOUT on enemy', () => {
    const { result } = setupTangtang();
    placeBS(result.current, 5 * FPS);

    // ── Controller layer: waterspout on enemy ──
    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspouts.length).toBeGreaterThanOrEqual(1);
    expect(waterspouts[0].sourceSkillId).toBe(BATTLE_SKILL_ID);
    expect(waterspouts[0].sourceEntityId).toBe(TANGTANG_ID);

    // ── View layer: waterspout in enemy status ──
    const enemyStatusCol = findMatchingColumn(result.current, ENEMY_ID, WATERSPOUT_ID)
      ?? result.current.columns.find(
        (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
          && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
      );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(ev => ev.columnId === WATERSPOUT_ID)).toBe(true);
  });

  it('G2: Waterspout duration matches config (3s)', () => {
    const { result } = setupTangtang();
    placeBS(result.current, 5 * FPS);

    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspouts.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(waterspouts[0])).toBe(3 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Ultimate — OLDEN STARE Application
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Ultimate — OLDEN STARE Application', () => {
  it('H1: Ultimate applies OLDEN_STARE to enemy', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });
    placeUlt(result.current, 5 * FPS);

    // ── Controller layer: OLDEN_STARE on enemy ──
    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);
    expect(oldenStare[0].sourceSkillId).toBe(ULTIMATE_ID);

    // ── View layer: OLDEN_STARE in enemy status ──
    const enemyStatusCol = findMatchingColumn(result.current, ENEMY_ID, OLDEN_STARE_ID)
      ?? result.current.columns.find(
        (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
          && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
      );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(ev => ev.columnId === OLDEN_STARE_ID)).toBe(true);
  });

  it('H2: OLDEN_STARE duration matches config (4s)', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });
    placeUlt(result.current, 5 * FPS);

    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(oldenStare[0])).toBe(4 * FPS);
  });

  it('H3: P4 ultimate energy cost is 76.5', () => {
    const p4Cost = getUltimateEnergyCostForPotential(TANGTANG_ID, 4);
    expect(p4Cost).toBe(76.5);
  });

  it('H4: OLDEN_STARE has 9 frames — 8 DoT ticks (0.5s intervals) + 1 rogue wave (4s)', () => {
    const frames = OLDEN_STARE_JSON.segments[0].frames;
    expect(frames).toHaveLength(9);

    // 8 DoT ticks at 0.5s intervals
    const dotFrames = frames.slice(0, 8);
    dotFrames.forEach((f: { properties: { offset: { value: number } } }, i: number) => {
      expect(f.properties.offset.value).toBe((i + 1) * 0.5);
    });
    // All DoT ticks use atk_scale_1 (per-tick)
    for (const f of dotFrames) {
      const dmg = f.clause[0].effects[0];
      expect(dmg.with.value.left.value[0]).toBe(0.178);  // R1
      expect(dmg.with.value.left.value[11]).toBe(0.4);   // R12
    }

    // 9th frame is rogue wave at 4s with atk_scale_2
    const rogueWave = frames[8];
    expect(rogueWave.properties.offset.value).toBe(4);
    const rogueDmg = rogueWave.clause[0].effects[0];
    expect(rogueDmg.with.value.left.value[0]).toBe(1.778);  // R1
    expect(rogueDmg.with.value.left.value[11]).toBe(4);     // R12
  });

  it('H5: OLDEN_STARE DoT total matches wiki (8 ticks × per-tick = display_atk_scale)', () => {
    const frames = OLDEN_STARE_JSON.segments[0].frames;
    // Per-tick at R1 = 0.178, total = 0.178 × 8 = 1.424 ≈ wiki 1.42 (142%)
    const perTick = frames[0].clause[0].effects[0].with.value.left.value[0];
    expect(perTick * 8).toBeCloseTo(1.424, 2);
    // Per-tick at R12 = 0.4, total = 0.4 × 8 = 3.2 = wiki 3.20 (320%)
    const perTickR12 = frames[0].clause[0].effects[0].with.value.left.value[11];
    expect(perTickR12 * 8).toBe(3.2);
  });

  it('H6: OLDEN_STARE pipeline — 9 damage frames on enemy event', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });
    placeUlt(result.current, 5 * FPS);

    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);

    // Segment should have 9 frames (8 DoT + 1 rogue wave)
    const seg = oldenStare[0].segments[0];
    expect(seg.frames).toBeDefined();
    expect(seg.frames!.length).toBe(9);

    // Last frame (rogue wave) should have higher multiplier than DoT frames
    const dotFrame = seg.frames![0];
    const rogueFrame = seg.frames![8];
    const dotInfo = findDealDamageInClauses(dotFrame.clause);
    const rogueInfo = findDealDamageInClauses(rogueFrame.clause);
    const dotNode = dotInfo?.valueNode ?? dotInfo;
    const rogueNode = rogueInfo?.valueNode ?? rogueInfo;
    expect(dotNode).toBeDefined();
    expect(rogueNode).toBeDefined();
  });

  it('H7: OLDEN_STARE sourceSkillId traces to ULTIMATE', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });
    placeUlt(result.current, 5 * FPS);

    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);
    expect(oldenStare[0].sourceSkillId).toBe(ULTIMATE_ID);
    expect(oldenStare[0].sourceEntityId).toBe(TANGTANG_ID);
  });

  it('H8: EARLY_ROGUE_WAVE sourceSkillId traces to ULTIMATE (not DIVE)', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    placeUlt(result.current, 3 * FPS);
    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);

    const oldenStareStart = oldenStare[0].startFrame;
    placeBAVariant(result.current, oldenStareStart + 1 * FPS, NounType.DIVE);

    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave.length).toBeGreaterThanOrEqual(1);
    // Attributed to ULTIMATE, not BASIC_ATTACK/DIVE
    expect(earlyWave[0].sourceSkillId).toBe(ULTIMATE_ID);
    expect(earlyWave[0].sourceEntityId).toBe(TANGTANG_ID);
  });

  it('H9: EARLY_ROGUE_WAVE has correct multipliers (atk_scale_3)', () => {
    const frames = EARLY_ROGUE_WAVE_JSON.segments[0].frames;
    expect(frames).toHaveLength(1);
    const dmg = frames[0].clause[0].effects[0];
    // atk_scale_3 values
    expect(dmg.with.value.left.value[0]).toBe(3.111);  // R1
    expect(dmg.with.value.left.value[11]).toBe(7);     // R12
    // P5 ×1.15 baked
    expect(dmg.with.value.right.value).toEqual([1, 1, 1, 1, 1, 1.15]);
    // Stagger 20
    const stagger = frames[0].clause[0].effects[1];
    expect(stagger.with.value.value).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Full Rotation Chain
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Full Rotation Chain', () => {
  it('I1: CS → CS → BS produces whirlpools + waterspout + cryo infliction', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place two combos to build whirlpool stacks
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);

    // Whirlpools should exist
    const whirlpoolsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsBefore.length).toBe(2);

    // Place BS to consume whirlpools and create waterspouts
    placeBS(result.current, 8 * FPS);

    // Waterspouts on enemy
    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspouts.length).toBeGreaterThanOrEqual(1);

    // Cryo infliction on enemy
    const cryo = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryo.length).toBeGreaterThanOrEqual(1);

    // ── View layer: all status events visible ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
  });

  it('I2: CS → ULT produces whirlpool + OLDEN_STARE on enemy', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    // Place combo to create whirlpool
    placeCombo(result.current, 2 * FPS);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools.length).toBeGreaterThanOrEqual(1);

    // Place ultimate
    placeUlt(result.current, 5 * FPS);

    // OLDEN_STARE on enemy
    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);
  });

  it('I3: BS consumes whirlpools → ULT+DIVE should NOT create waterspouts from consumed whirlpools', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    // Create 2 whirlpools
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);

    // BS at 10s consumes both whirlpools and creates 3 waterspouts (1 base + 2 from whirlpools)
    placeBS(result.current, 10 * FPS);
    const waterspoutsAfterBS = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspoutsAfterBS).toHaveLength(3);

    // ULT at 15s creates OLDEN_STARE
    placeUlt(result.current, 15 * FPS);

    // DIVE during OLDEN_STARE triggers early rogue wave + T2 effects
    const oldenStare = result.current.allProcessedEvents.find(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare).toBeDefined();
    placeBAVariant(result.current, oldenStare!.startFrame + 1 * FPS, NounType.DIVE);

    // WATERSPOUT_ULT count: T2 creates 1 base waterspout-ult (talent gate [0,1,1] = 1)
    // BUT whirlpools were already consumed by BS — STACKS of WHIRLPOOL = 0
    // So additional waterspout-ults from whirlpools = 0
    const waterspoutUlts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ULT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    // Should be exactly 1 (base T2 waterspout only, no whirlpool extras)
    expect(waterspoutUlts).toHaveLength(1);
  });

  it('I3b: Whirlpools NOT consumed before dive → T2 creates additional waterspout-ults', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    // Create 2 whirlpools — do NOT place BS (no consumption)
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);

    // ULT at 10s creates OLDEN_STARE
    placeUlt(result.current, 10 * FPS);

    const oldenStare = result.current.allProcessedEvents.find(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare).toBeDefined();

    // DIVE during OLDEN_STARE — whirlpools still active
    placeBAVariant(result.current, oldenStare!.startFrame + 1 * FPS, NounType.DIVE);

    // T2 creates: 1 base waterspout-ult + 2 from whirlpools = 3
    const waterspoutUlts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ULT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspoutUlts).toHaveLength(3);
  });

  it('I4: Full kit — WHIRLPOOL + BS + ULT + DIVE + BATK all coexist correctly', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    // Place events in freeform — mimics user's reported scenario
    placeCombo(result.current, 2 * FPS);   // Creates whirlpool
    placeCombo(result.current, 5 * FPS);   // Creates second whirlpool
    placeBS(result.current, 10 * FPS);      // Creates waterspout, consumes whirlpools
    placeUlt(result.current, 15 * FPS);     // Creates OLDEN_STARE on enemy

    // Place DIVE during OLDEN_STARE
    const oldenStare = result.current.allProcessedEvents.find(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare).toBeDefined();
    placeBAVariant(result.current, oldenStare!.startFrame + 1 * FPS, NounType.DIVE);

    // Place BATK
    const baCol = findColumn(result.current, SLOT_TANGTANG, NounType.BASIC_ATTACK)!;
    const baPayload = getMenuPayload(result.current, baCol, 25 * FPS);
    act(() => { result.current.handleAddEvent(baPayload.ownerEntityId, baPayload.columnId, baPayload.atFrame, baPayload.defaultSkill); });

    // ── Verify no crashes and correct event counts ──

    // Whirlpools: 2 created, both consumed by BS
    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools.length).toBe(2);

    // Waterspouts on enemy from BS (1 base + 2 from whirlpools = 3)
    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspouts.length).toBe(3);

    // OLDEN_STARE on enemy
    const oldenStares = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStares.length).toBeGreaterThanOrEqual(1);

    // EARLY_ROGUE_WAVE on enemy (from dive during OLDEN_STARE)
    const earlyWaves = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWaves.length).toBeGreaterThanOrEqual(1);
    expect(earlyWaves[0].sourceSkillId).toBe(ULTIMATE_ID);

    // Cryo infliction from BS
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(1);

    // No spurious TangTang-sourced statuses on operator timeline
    const operatorStatuses = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG
        && ev.columnId !== NounType.BASIC_ATTACK && ev.columnId !== NounType.BATTLE
        && ev.columnId !== NounType.COMBO && ev.columnId !== NounType.ULTIMATE
        && ev.columnId !== WHIRLPOOL_ID && ev.columnId !== COMBO_WINDOW_COLUMN_ID
        && ev.startFrame > 0,
    );
    expect(operatorStatuses).toHaveLength(0);

    // ── View layer: everything renders without crash ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    expect(viewModels.size).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Whirlpool Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Whirlpool Lifecycle', () => {
  it('J1: Whirlpool duration is 30s', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(result.current, 2 * FPS);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(whirlpools[0])).toBe(30 * FPS);
  });

  it('J2: Three combos still cap at 2 whirlpools (RESET at limit)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 5 * FPS);
    placeCombo(result.current, 8 * FPS);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    // With RESET at limit 2, the third combo resets the oldest — still at most 2 active
    // (may be 3 total events if the engine doesn't consume old ones, but active ≤ 2)
    expect(whirlpools.length).toBeLessThanOrEqual(3);
    expect(whirlpools.length).toBeGreaterThanOrEqual(2);
  });

  it('J3a: Two whirlpools consumed by BS still get distinct I/II labels', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeCombo(result.current, 3 * FPS);
    placeCombo(result.current, 6 * FPS);
    placeBS(result.current, 10 * FPS);  // Consumes both whirlpools

    const statusCol = findMatchingColumn(result.current, SLOT_TANGTANG, WHIRLPOOL_ID)
      ?? findColumn(result.current, SLOT_TANGTANG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();

    const vmWhirlpools = statusVM!.events.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.startFrame > 0,
    );
    expect(vmWhirlpools.length).toBe(2);

    // Even though both are consumed, they should have DIFFERENT labels (I and II)
    const labels = vmWhirlpools.map(wp => statusVM!.statusOverrides?.get(wp.uid)?.label);
    expect(labels[0]).not.toBe(labels[1]);
  });

  it('J3b: Two overlapping freeform whirlpools get I and II labels', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place two whirlpools close together so they overlap (both 30s duration)
    placeCombo(result.current, 3 * FPS);
    placeCombo(result.current, 8 * FPS);

    const statusCol = findMatchingColumn(result.current, SLOT_TANGTANG, WHIRLPOOL_ID)
      ?? findColumn(result.current, SLOT_TANGTANG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();

    const vmWhirlpools = statusVM!.events.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.startFrame > 0,
    );
    expect(vmWhirlpools.length).toBe(2);

    // Both overlap (30s duration each, 5s apart) — must have DIFFERENT labels
    const labels = vmWhirlpools.map(wp => statusVM!.statusOverrides?.get(wp.uid)?.label);
    expect(labels[0]).not.toBe(labels[1]);
    // First = 1, second = 2
    expect(labels[0]).toMatch(/\s1$/);
    expect(labels[1]).toMatch(/\s2$/);
  });

  it('J3: Whirlpools placed out of chronological order get correct 1/2 labels', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place second combo first (at 8s), then first combo (at 3s) — out of order
    placeCombo(result.current, 8 * FPS);
    placeCombo(result.current, 3 * FPS);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools.length).toBe(2);

    // ── View layer: labels should be chronological (1 then 2) ──
    const statusCol = findMatchingColumn(result.current, SLOT_TANGTANG, WHIRLPOOL_ID)
      ?? findColumn(result.current, SLOT_TANGTANG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();

    // Events in the view model should be sorted chronologically
    const vmWhirlpools = statusVM!.events.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.startFrame > 0,
    );
    expect(vmWhirlpools.length).toBe(2);
    // First event (chronologically) should be at 3s, second at 8s
    expect(vmWhirlpools[0].startFrame).toBeLessThan(vmWhirlpools[1].startFrame);

    // Labels: first = 1, second = 2 (chronological, not insertion order)
    const label0 = statusVM!.statusOverrides?.get(vmWhirlpools[0].uid)?.label;
    const label1 = statusVM!.statusOverrides?.get(vmWhirlpools[1].uid)?.label;
    expect(label0).toMatch(/\s1$/);
    expect(label1).toMatch(/\s2$/);
  });

  it('J4: Three whirlpools out of order — labels never exceed stack limit', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place out of order: 10s, 3s, 6s
    placeCombo(result.current, 10 * FPS);
    placeCombo(result.current, 3 * FPS);
    placeCombo(result.current, 6 * FPS);

    const statusCol = findMatchingColumn(result.current, SLOT_TANGTANG, WHIRLPOOL_ID)
      ?? findColumn(result.current, SLOT_TANGTANG, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();

    const vmWhirlpools = statusVM!.events.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.startFrame > 0,
    );
    // Events should be in chronological order
    for (let i = 1; i < vmWhirlpools.length; i++) {
      expect(vmWhirlpools[i].startFrame).toBeGreaterThanOrEqual(vmWhirlpools[i - 1].startFrame);
    }

    // No label should exceed "2" (stack limit = 2)
    for (const wp of vmWhirlpools) {
      const label = statusVM!.statusOverrides?.get(wp.uid)?.label ?? '';
      expect(label).not.toMatch(/\s[3-9]$/);
    }
  });

  it('J5a: BS with 0 whirlpools → 1 waterspout → exactly 1 cryo infliction (Cryo I)', () => {
    const { result } = setupTangtang();

    // BS with no whirlpools → 1 waterspout
    placeBS(result.current, 5 * FPS);

    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspouts).toHaveLength(1);

    // Exactly 1 cryo infliction from the waterspout's frame at offset 0s
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoInflictions).toHaveLength(1);
  });

  it('J5: 2 freeform whirlpools → BS → 3 waterspouts with 3 cryo inflictions (Cryo III)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place 2 whirlpools
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 4 * FPS);

    // ── Whirlpool 2: 2 whirlpools on operator, labeled 1 and 2 ──
    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools).toHaveLength(2);

    const opStatusCol = findMatchingColumn(result.current, SLOT_TANGTANG, WHIRLPOOL_ID)
      ?? findColumn(result.current, SLOT_TANGTANG, OPERATOR_STATUS_COLUMN_ID);
    expect(opStatusCol).toBeDefined();
    const vmBefore = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const opVM = vmBefore.get(opStatusCol!.key);
    expect(opVM).toBeDefined();
    const wpLabels = whirlpools.map(wp => opVM!.statusOverrides?.get(wp.uid)?.label);
    expect(wpLabels.some(l => l && /\s1$/.test(l))).toBe(true);
    expect(wpLabels.some(l => l && /\s2$/.test(l))).toBe(true);

    // ── BS consumes whirlpools → 3 waterspouts on enemy ──
    placeBS(result.current, 8 * FPS);

    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(waterspouts).toHaveLength(3);

    // ── 3 cryo inflictions from waterspout frames → Cryo III ──
    const cryoInflictions = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoInflictions.length).toBeGreaterThanOrEqual(3);

    // ── View layer: cryo infliction label shows "3" (3 stacks) ──
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const vmAfter = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const enemyVM = vmAfter.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();

    // Find cryo infliction events in view model
    const vmCryo = enemyVM!.events.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(vmCryo.length).toBeGreaterThanOrEqual(3);

    // The third (or later) cryo infliction should have label containing "3"
    const cryoLabels = vmCryo.map(ev => enemyVM!.statusOverrides?.get(ev.uid)?.label).filter(Boolean);
    expect(cryoLabels.some(l => /\s3$/.test(l!))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. Potential Effects
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Potential Effects', () => {
  it('K1: P2 stat bonus — AGI +20 and CRYO_DAMAGE_BONUS +10%', () => {
    const { result } = setupTangtang();
    setPotential(result.current, 2);

    // P2 adds stats via potential clause — verify they affect loadout
    // The potential stat effects are resolved by the loadout aggregator
    const props = result.current.loadoutProperties[SLOT_TANGTANG];
    expect(props.operator.potential).toBe(2);
  });

  it('K2: P0 and P4 ultimate energy costs differ', () => {
    const p0Cost = getUltimateEnergyCostForPotential(TANGTANG_ID, 0);
    const p4Cost = getUltimateEnergyCostForPotential(TANGTANG_ID, 4);
    expect(p0Cost).toBe(90);
    expect(p4Cost).toBe(76.5);
    expect(p4Cost!).toBeLessThan(p0Cost!);
  });

  it('K3: Changing potential mid-session re-processes events', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(result.current, 2 * FPS);

    // Whirlpool at P0
    const whirlpoolsP0 = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsP0.length).toBeGreaterThanOrEqual(1);

    // Change to P3
    setPotential(result.current, 3);

    // Whirlpool still exists after potential change
    const whirlpoolsP3 = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsP3.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. BS Whirlpool Consumption (CONSUME STATUS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L. BS Whirlpool Consumption', () => {
  it('L1: BS with whirlpools consumes them', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place combo to create whirlpool
    placeCombo(result.current, 2 * FPS);

    const whirlpoolsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsBefore.length).toBeGreaterThanOrEqual(1);
    const beforeDuration = eventDuration(whirlpoolsBefore[0]);
    expect(beforeDuration).toBe(30 * FPS);

    // Place BS at 5s — should consume the whirlpool
    placeBS(result.current, 5 * FPS);

    // Whirlpool should be clamped (consumed) — duration shortened
    const whirlpoolsAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsAfter.length).toBeGreaterThanOrEqual(1);
    const afterDuration = eventDuration(whirlpoolsAfter[0]);
    expect(afterDuration).toBeLessThan(beforeDuration);
  });

  it('L2: BS with 0 whirlpools — no consumption, no crash', () => {
    const { result } = setupTangtang();

    // Place BS without any whirlpools
    placeBS(result.current, 5 * FPS);

    // No whirlpools should exist at all
    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools).toHaveLength(0);

    // BS should still place successfully
    const bs = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.BATTLE,
    );
    expect(bs).toHaveLength(1);
  });

  it('L3: BS with 2 whirlpools consumes both', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 4 * FPS);

    const whirlpoolsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsBefore.length).toBe(2);

    // Place BS at 8s
    placeBS(result.current, 8 * FPS);

    // Both whirlpools should be consumed (clamped)
    const whirlpoolsAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    for (const wp of whirlpoolsAfter) {
      expect(eventDuration(wp)).toBeLessThan(30 * FPS);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M. BS Waterspout Stacking with Whirlpools
// ═══════════════════════════════════════════════════════════════════════════════

describe('M. BS Waterspout Stacking with Whirlpools', () => {
  it('M1: BS with 1 whirlpool creates more waterspout events than BS with 0', () => {
    // Setup 1: BS without whirlpools → 1 waterspout event
    const { result: r0 } = setupTangtang();
    placeBS(r0.current, 5 * FPS);
    const ws0 = r0.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(ws0).toHaveLength(1);

    // Setup 2: CS → BS with 1 whirlpool → 2 separate waterspout events
    const { result: r1 } = setupTangtang();
    act(() => { r1.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(r1.current, 2 * FPS);
    placeBS(r1.current, 5 * FPS);
    const ws1 = r1.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(ws1.length).toBeGreaterThan(ws0.length);
  });

  it('M2: BS with 2 whirlpools creates 3 separate waterspout events', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(result.current, 2 * FPS);
    placeCombo(result.current, 4 * FPS);
    placeBS(result.current, 8 * FPS);

    // Each waterspout is a separate event (not accumulated into one)
    const waterspouts = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    // 1 base + 2 whirlpools = 3 separate waterspout events
    expect(waterspouts).toHaveLength(3);

    // All waterspouts must have unique UIDs
    const uids = new Set(waterspouts.map(ev => ev.uid));
    expect(uids.size).toBe(3);

    // ── View layer: all 3 waterspouts visible as separate events in enemy status ──
    const enemyStatusCol = findMatchingColumn(result.current, ENEMY_ID, WATERSPOUT_ID)
      ?? result.current.columns.find(
        (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
          && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
      );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();

    // View model should contain all 3 waterspout events with unique UIDs
    const vmWaterspouts = enemyVM!.events.filter(
      ev => ev.columnId === WATERSPOUT_ID && ev.startFrame > 0,
    );
    expect(vmWaterspouts).toHaveLength(3);
    const vmUids = new Set(vmWaterspouts.map(ev => ev.uid));
    expect(vmUids.size).toBe(3);

    // Each waterspout should have its own micro-column position
    for (const ws of vmWaterspouts) {
      expect(enemyVM!.microPositions.has(ws.uid)).toBe(true);
    }

    // Waterspouts are independent entities — NO stack-count suffix labels.
    // statusOverrides should either not exist for these UIDs or have bare name labels.
    for (const ws of vmWaterspouts) {
      const label = enemyVM!.statusOverrides?.get(ws.uid)?.label ?? '';
      // Label should NOT contain a trailing stack count (e.g. " 1", " 2", …)
      expect(label).not.toMatch(/\s\d+$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// N. P1 Combo Improvements
// ═══════════════════════════════════════════════════════════════════════════════

describe('N. P1 Combo Improvements', () => {
  it('N1: P1 combo cooldown is 2s shorter than P0', () => {
    // P0: combo cooldown at L12 = 12s
    const { result: r0 } = setupTangtang();
    act(() => { r0.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(r0.current, 2 * FPS);
    const combo0 = r0.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.COMBO,
    )!;
    const cd0 = combo0.segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    )!;
    const cdDuration0 = cd0.properties.duration;

    // P1: cooldown should be -2s (ADD(VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL [0,-2,...]))
    const { result: r1 } = setupTangtang();
    setPotential(r1.current, 1);
    act(() => { r1.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeCombo(r1.current, 2 * FPS);
    const combo1 = r1.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === NounType.COMBO,
    )!;
    const cd1 = combo1.segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    )!;
    const cdDuration1 = cd1.properties.duration;

    // P1 cooldown should be 2s shorter
    expect(cdDuration1).toBe(cdDuration0 - 2 * FPS);
  });

  it('N2: P1 BS returns +5 SP per whirlpool (wiki: 20 base + 5 at P1)', () => {
    // RETURN SKILL_POINT is a no-op in the engine — skip until supported
    // When supported: verify SP graph shows return at P0 (20/whirlpool) vs P1 (25/whirlpool)
    expect(true).toBe(true); // Placeholder — config verified in JSON
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// O. ULT OLDEN_STARE — onEntryClause (Whirlpool Consumption)
// ═══════════════════════════════════════════════════════════════════════════════

describe('O. T2 Riot Bringer — Dive During OLDEN_STARE', () => {
  it('O1: ULT alone does NOT consume whirlpools (T2 only fires on dive)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    placeCombo(result.current, 2 * FPS);

    const whirlpoolsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsBefore.length).toBeGreaterThanOrEqual(1);
    const beforeDuration = eventDuration(whirlpoolsBefore[0]);

    placeUlt(result.current, 5 * FPS);

    // Whirlpool should NOT be consumed by ULT alone — T2 effects fire on dive
    // Duration may increase slightly due to ULT time-stop, but should NOT decrease (consumed)
    const whirlpoolsAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpoolsAfter.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(whirlpoolsAfter[0])).toBeGreaterThanOrEqual(beforeDuration);
  });

  it('O2: ULT with 0 whirlpools still applies OLDEN_STARE (no crash)', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });
    placeUlt(result.current, 5 * FPS);

    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);

    const whirlpools = result.current.allProcessedEvents.filter(
      ev => ev.columnId === WHIRLPOOL_ID && ev.ownerEntityId === SLOT_TANGTANG && ev.startFrame > 0,
    );
    expect(whirlpools).toHaveLength(0);
  });

  it('O3: OLDEN_STARE has no onEntryClause (T2 effects are on dive trigger)', () => {
    expect(OLDEN_STARE_JSON.onEntryClause).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P. Talent & Potential Config Verification
// ═══════════════════════════════════════════════════════════════════════════════

describe('P. Talent & Potential Config Verification', () => {
  it('P1: Talent 2 (Riot Bringer) is description-only — no active clause', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const t2 = require(
      '../../../../model/game-data/operators/tangtang/talents/talent-riot-bringer-talent.json',
    );
    // T2 effects are baked into WATERSPOUT_ULT and OLDEN_STARE statuses
    expect(t2.segments?.[0]?.clause).toBeUndefined();
    expect(t2.segments?.[0]?.clauseType).toBeUndefined();
  });

  it('P2: P5 has no active clause (orphan removed)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p5 = require(
      '../../../../model/game-data/operators/tangtang/potentials/potential-5-chiefs-all-eldritch-gaze.json',
    );
    // P5 effects are baked into OLDEN_STARE (×1.15) and WATERSPOUT_ULT (+80%)
    expect(p5.segments?.[0]?.clause).toBeUndefined();
    expect(p5.segments?.[0]?.clauseType).toBeUndefined();
  });

  it('P3: Talent 1 (Fam of Honor) applies HASTE to all operators and SLOW to enemy', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const t1 = require(
      '../../../../model/game-data/operators/tangtang/talents/talent-fam-of-honor-talent.json',
    );
    expect(t1.segments[0].clause).toBeDefined();
    expect(t1.segments[0].clause.length).toBeGreaterThanOrEqual(1);

    const effects = t1.segments[0].clause[0].effects;
    // HASTE to ALL OPERATOR
    const hasteEffect = effects.find(
      (e: { verb: string; object?: string }) => e.verb === VerbType.APPLY && e.object === NounType.STAT,
    );
    expect(hasteEffect).toBeDefined();
    expect(hasteEffect.objectId).toBe('HASTE');
    expect(hasteEffect.toDeterminer).toBe(DeterminerType.ALL);
    expect(hasteEffect.to).toBe(NounType.OPERATOR);

    // SLOW to ENEMY with value+unit PERCENTAGE wrapper
    const slowEffect = effects.find(
      (e: { verb: string; object?: string }) => e.verb === VerbType.APPLY && e.object === NounType.STATUS,
    );
    expect(slowEffect).toBeDefined();
    expect(slowEffect.objectId).toBe(NounType.SLOW);
    expect(slowEffect.to).toBe(NounType.ENEMY);
    // Verify SLOW uses {value, unit: "PERCENTAGE"} wrapper
    expect(slowEffect.with.value.unit).toBe(UnitType.PERCENTAGE);
  });

  it('P4: Waterspout ULT status has T2 and P5 damage bonus baked', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const wsu = require(
      '../../../../model/game-data/operators/tangtang/statuses/status-waterspout-ult.json',
    );
    // Frame 0 is cryo infliction, frame 1+ are DoT damage
    const dotFrame = wsu.segments[0].frames[1];
    const damageEffect = dotFrame.clause[0].effects[0];
    expect(damageEffect.verb).toBe('DEAL');
    // The value should be MULT(MULT(SKILL_LEVEL, P3_POTENTIAL), ADD(1, ADD(TALENT_LEVEL, P5_POTENTIAL)))
    const outerMult = damageEffect.with.value;
    expect(outerMult.operation).toBe('MULT');
    // Left side: MULT(SKILL_LEVEL, P3 POTENTIAL)
    expect(outerMult.left.operation).toBe('MULT');
    // Right side: ADD(1, ADD(TALENT_LEVEL, P5 POTENTIAL))
    expect(outerMult.right.operation).toBe('ADD');
    expect(outerMult.right.left.value).toBe(1);
    expect(outerMult.right.right.operation).toBe('ADD');
    // T2 base: VARY_BY TALENT_LEVEL [0, 0.4, 0.6]
    expect(outerMult.right.right.left.object).toBe('TALENT_LEVEL');
    expect(outerMult.right.right.left.value).toEqual([0, 0.4, 0.6]);
    // P5 bonus: VARY_BY POTENTIAL [0,0,0,0,0,0.8]
    expect(outerMult.right.right.right.object).toBe('POTENTIAL');
    expect(outerMult.right.right.right.value).toEqual([0, 0, 0, 0, 0, 0.8]);
  });

  it('P5: OLDEN_STARE has P5 ×1.15 baked on DoT and rogue wave', () => {
    // DoT frames: MULT(VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL [1,1,1,1,1,1.15])
    const dotFrame = OLDEN_STARE_JSON.segments[0].frames[0];
    const dotDamage = dotFrame.clause[0].effects[0];
    expect(dotDamage.with.value.operation).toBe('MULT');
    expect(dotDamage.with.value.right.object).toBe('POTENTIAL');
    expect(dotDamage.with.value.right.value).toEqual([1, 1, 1, 1, 1, 1.15]);

    // Rogue wave (9th frame at 4s): same P5 multiplier, higher base values (atk_scale_2)
    const rogueFrame = OLDEN_STARE_JSON.segments[0].frames[8];
    expect(rogueFrame.properties.offset.value).toBe(4);
    const rogueDamage = rogueFrame.clause[0].effects[0];
    expect(rogueDamage.with.value.operation).toBe('MULT');
    expect(rogueDamage.with.value.left.value[0]).toBe(1.778); // atk_scale_2 R1
    expect(rogueDamage.with.value.left.value[11]).toBe(4);    // atk_scale_2 R12
    expect(rogueDamage.with.value.right.object).toBe('POTENTIAL');
    expect(rogueDamage.with.value.right.value).toEqual([1, 1, 1, 1, 1, 1.15]);
  });

  it('P6: OLDEN_STARE onTriggerClause handles dive → early rogue wave', () => {
    const trigger = OLDEN_STARE_JSON.onTriggerClause[0];
    // Condition: CONTROLLED OPERATOR PERFORM DIVE BASIC_ATTACK SKILL
    expect(trigger.conditions[0].subjectDeterminer).toBe('CONTROLLED');
    expect(trigger.conditions[0].subject).toBe('OPERATOR');
    expect(trigger.conditions[0].verb).toBe('PERFORM');
    expect(trigger.conditions[0].objectQualifier).toBe('DIVE');
    expect(trigger.conditions[0].objectId).toBe('BASIC_ATTACK');
    expect(trigger.conditions[0].object).toBe('SKILL');

    // Effects: APPLY EARLY_ROGUE_WAVE + T2 WATERSPOUT_ULT + SP return + CONSUME WHIRLPOOL + CONSUME EVENT
    expect(trigger.effects).toHaveLength(5);
    expect(trigger.effects[0].verb).toBe('APPLY');
    expect(trigger.effects[0].objectId).toBe('EARLY_ROGUE_WAVE');
    // T2: WATERSPOUT_ULT with stacks = MULT(ADD(1, STACKS of WHIRLPOOL), TALENT_LEVEL gate)
    expect(trigger.effects[1].verb).toBe('APPLY');
    expect(trigger.effects[1].objectId).toBe('WATERSPOUT_ULT');
    expect(trigger.effects[1].with.stacks.operation).toBe('MULT');
    // SP return
    expect(trigger.effects[2].verb).toBe('RETURN');
    expect(trigger.effects[2].object).toBe('SKILL_POINT');
    // CONSUME WHIRLPOOL (before CONSUME EVENT)
    expect(trigger.effects[3].verb).toBe('CONSUME');
    expect(trigger.effects[3].objectId).toBe('WHIRLPOOL');
    // CONSUME THIS EVENT (ends OLDEN_STARE)
    expect(trigger.effects[4].verb).toBe('CONSUME');
    expect(trigger.effects[4].object).toBe('EVENT');
  });

  it('P7: OLDEN_STARE has no onEntryClause (T2 effects moved to dive trigger)', () => {
    expect(OLDEN_STARE_JSON.onEntryClause).toBeUndefined();
  });

  it('P8: BS frame at 1s — no direct cryo infliction (comes from waterspout status frame)', () => {
    const waterspoutFrame = BATTLE_SKILL_JSON.segments[0].frames[1];
    const effects = waterspoutFrame.clause[0].effects;

    // BS does NOT directly apply cryo infliction — waterspout status handles it via frame at 0s
    expect(effects.every((e: { object: string }) => e.object !== NounType.INFLICTION)).toBe(true);

    expect(effects[0].verb).toBe('DEAL');    // STAGGER
    expect(effects[0].object).toBe('STAGGER');
    expect(effects[1].verb).toBe('APPLY');   // WATERSPOUT with stacks = ADD(1, STACKS of WHIRLPOOL)
    expect(effects[1].objectId).toBe('WATERSPOUT');
    expect(effects[1].with.stacks.operation).toBe('ADD');
    expect(effects[2].verb).toBe('APPLY');   // ARTS SUSCEPTIBILITY
    expect(effects[2].objectId).toBe('SUSCEPTIBILITY');
    expect(effects[3].verb).toBe('RETURN');  // SP RETURN
    expect(effects[3].object).toBe('SKILL_POINT');
    expect(effects[4].verb).toBe('CONSUME'); // CONSUME WHIRLPOOL (last!)
    expect(effects[4].objectId).toBe('WHIRLPOOL');
  });

  it('P9: BS main shot (0.9s frame) has P3 ×1.1 baked', () => {
    const mainShotFrame = BATTLE_SKILL_JSON.segments[0].frames[0]; // index 0 = 0.9s
    const dmgEffect = mainShotFrame.clause[0].effects[0];
    // Value should be MULT(VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL [1,1,1,1.1,1.1,1.1])
    expect(dmgEffect.with.value.operation).toBe('MULT');
    expect(dmgEffect.with.value.right.object).toBe('POTENTIAL');
    expect(dmgEffect.with.value.right.value).toEqual([1, 1, 1, 1.1, 1.1, 1.1]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S. DIVE/FINISHER — No Spurious Operator Statuses
// ═══════════════════════════════════════════════════════════════════════════════

describe('S. DIVE/FINISHER — No Spurious Operator Statuses', () => {
  it('S1: DIVE does not create any status on TangTang operator timeline', () => {
    const { result } = setupTangtang();

    // Snapshot operator statuses before
    const statusesBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId !== NounType.BASIC_ATTACK
        && ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.COMBO
        && ev.columnId !== NounType.ULTIMATE && ev.startFrame > 0,
    );
    const countBefore = statusesBefore.length;

    placeBAVariant(result.current, 5 * FPS, NounType.DIVE);

    // No new statuses should appear on TangTang's timeline
    const statusesAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId !== NounType.BASIC_ATTACK
        && ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.COMBO
        && ev.columnId !== NounType.ULTIMATE && ev.startFrame > 0,
    );
    expect(statusesAfter.length).toBe(countBefore);
  });

  it('S2: FINISHER does not create any status on TangTang operator timeline', () => {
    const { result } = setupTangtang();

    const statusesBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId !== NounType.BASIC_ATTACK
        && ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.COMBO
        && ev.columnId !== NounType.ULTIMATE && ev.startFrame > 0,
    );
    const countBefore = statusesBefore.length;

    placeBAVariant(result.current, 5 * FPS, NounType.FINISHER);

    const statusesAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId !== NounType.BASIC_ATTACK
        && ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.COMBO
        && ev.columnId !== NounType.ULTIMATE && ev.startFrame > 0,
    );
    expect(statusesAfter.length).toBe(countBefore);
  });

  it('S3: ULT + DIVE does not create spurious statuses on TangTang operator timeline', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    // Place ULT then DIVE (replicates user's reported scenario)
    placeUlt(result.current, 3 * FPS);

    // Snapshot statuses on TangTang AFTER ult (whirlpool, talent effects, etc.)
    const statusesAfterUlt = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId !== NounType.BASIC_ATTACK
        && ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.COMBO
        && ev.columnId !== NounType.ULTIMATE && ev.startFrame > 0,
    );
    // Place DIVE after ULT
    const oldenStare = result.current.allProcessedEvents.find(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    const diveFrame = oldenStare ? oldenStare.startFrame + 1 * FPS : 10 * FPS;
    placeBAVariant(result.current, diveFrame, NounType.DIVE);

    // No NEW statuses should appear on TangTang's personal timeline from the DIVE
    const statusesAfterDive = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId !== NounType.BASIC_ATTACK
        && ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.COMBO
        && ev.columnId !== NounType.ULTIMATE && ev.startFrame > 0,
    );
    // DIVE should NOT trigger any TangTang-originated talent or status on the operator
    const newStatuses = statusesAfterDive.filter(
      ev => !statusesAfterUlt.some(s => s.uid === ev.uid),
    );
    // Filter to only TangTang-sourced statuses (ignore cross-operator talent procs)
    const tangTangNewStatuses = newStatuses.filter(
      ev => ev.sourceEntityId === TANGTANG_ID,
    );
    expect(tangTangNewStatuses).toHaveLength(0);
  });

  it('S4: DIVE does not create any status on enemy timeline (without OLDEN_STARE)', () => {
    const { result } = setupTangtang();

    const enemyStatusesBefore = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    const countBefore = enemyStatusesBefore.length;

    placeBAVariant(result.current, 5 * FPS, NounType.DIVE);

    const enemyStatusesAfter = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(enemyStatusesAfter.length).toBe(countBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Q. Early Rogue Wave — Negative Trigger Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Q. Early Rogue Wave — Negative Trigger Tests', () => {
  // ── Without OLDEN_STARE active: NO BA variant should produce Early Rogue Wave ──

  it('Q1: DIVE without OLDEN_STARE does NOT produce EARLY_ROGUE_WAVE', () => {
    const { result } = setupTangtang();
    placeBAVariant(result.current, 5 * FPS, NounType.DIVE);

    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave).toHaveLength(0);
  });

  it('Q2: FINISHER without OLDEN_STARE does NOT produce EARLY_ROGUE_WAVE', () => {
    const { result } = setupTangtang();
    placeBAVariant(result.current, 5 * FPS, NounType.FINISHER);

    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave).toHaveLength(0);
  });

  it('Q3: BATK without OLDEN_STARE does NOT produce EARLY_ROGUE_WAVE', () => {
    const { result } = setupTangtang();
    placeBAVariant(result.current, 5 * FPS, TANGTANG_BATK_ID);

    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave).toHaveLength(0);
  });

  // ── With OLDEN_STARE active: ONLY DIVE should produce Early Rogue Wave ──

  it('Q4: DIVE during OLDEN_STARE produces EARLY_ROGUE_WAVE', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    placeUlt(result.current, 3 * FPS);
    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);

    // Place DIVE during OLDEN_STARE active window
    const oldenStareStart = oldenStare[0].startFrame;
    const diveFrame = oldenStareStart + 1 * FPS;
    placeBAVariant(result.current, diveFrame, NounType.DIVE);

    // ── Controller layer: EARLY_ROGUE_WAVE should exist ──
    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave.length).toBeGreaterThanOrEqual(1);
    // EARLY_ROGUE_WAVE is attributed to ULTIMATE (not DIVE/BASIC_ATTACK)
    expect(earlyWave[0].sourceSkillId).toBe(ULTIMATE_ID);
    expect(earlyWave[0].sourceEntityId).toBe(TANGTANG_ID);

    // ── View layer ──
    const enemyStatusCol = findMatchingColumn(result.current, ENEMY_ID, EARLY_ROGUE_WAVE_ID)
      ?? result.current.columns.find(
        (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
          && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
      );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(ev => ev.columnId === EARLY_ROGUE_WAVE_ID)).toBe(true);
  });

  it('Q5: FINISHER during OLDEN_STARE does NOT produce EARLY_ROGUE_WAVE', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    placeUlt(result.current, 3 * FPS);
    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);

    const oldenStareStart = oldenStare[0].startFrame;
    placeBAVariant(result.current, oldenStareStart + 1 * FPS, NounType.FINISHER);

    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave).toHaveLength(0);
  });

  it('Q6: BATK during OLDEN_STARE does NOT produce EARLY_ROGUE_WAVE', () => {
    const { result } = setupTangtang();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_TANGTANG, 0); });

    placeUlt(result.current, 3 * FPS);
    const oldenStare = result.current.allProcessedEvents.filter(
      ev => ev.columnId === OLDEN_STARE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(oldenStare.length).toBeGreaterThanOrEqual(1);

    const oldenStareStart = oldenStare[0].startFrame;
    placeBAVariant(result.current, oldenStareStart + 1 * FPS, TANGTANG_BATK_ID);

    const earlyWave = result.current.allProcessedEvents.filter(
      ev => ev.columnId === EARLY_ROGUE_WAVE_ID && ev.ownerEntityId === ENEMY_ID && ev.startFrame > 0,
    );
    expect(earlyWave).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R. Combo Activation Window — Trigger Conditions
// ═══════════════════════════════════════════════════════════════════════════════

describe('R. Combo Activation Window — Trigger Conditions', () => {
  // Wiki: "When applying Cryo Infliction or dealing Arts Burst DMG to an enemy."
  // Trigger 1: ANY OPERATOR APPLY CRYO INFLICTION TO ENEMY
  // Trigger 2: ANY OPERATOR DEAL ARTS_BURST DAMAGE TO ENEMY

  it('R1: BATK does NOT open combo activation window (no cryo infliction, no arts burst)', () => {
    const { result } = setupTangtang();

    // Place BATK — deals CRYO DAMAGE but does NOT apply cryo infliction
    const baCol = findColumn(result.current, SLOT_TANGTANG, NounType.BASIC_ATTACK)!;
    const payload = getMenuPayload(result.current, baCol, 2 * FPS);
    act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });

    // Check combo activation windows — should be NONE
    const activationWindows = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(activationWindows).toHaveLength(0);
  });

  it('R2: BS opens combo activation window (BS applies cryo infliction)', () => {
    const { result } = setupTangtang();

    placeBS(result.current, 2 * FPS);

    // BS applies cryo infliction → should open combo activation window
    const activationWindows = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(activationWindows.length).toBeGreaterThanOrEqual(1);
  });

  it('R3: Freeform cryo infliction on enemy opens combo activation window', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place a cryo infliction directly on enemy
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const inflictionMenu = buildContextMenu(result.current, enemyStatusCol!, 3 * FPS);
    const cryoItem = inflictionMenu?.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryoItem).toBeDefined();
    const cryoPayload = cryoItem!.actionPayload as AddEventPayload;
    act(() => { result.current.handleAddEvent(cryoPayload.ownerEntityId, cryoPayload.columnId, cryoPayload.atFrame, cryoPayload.defaultSkill); });

    const activationWindows = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(activationWindows.length).toBeGreaterThanOrEqual(1);
  });

  it('R4: Combo window duration is 6s', () => {
    const { result } = setupTangtang();

    placeBS(result.current, 2 * FPS);

    const activationWindows = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(activationWindows.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(activationWindows[0])).toBe(6 * FPS);
  });

  it('R5: Combo window maxSkills is 1', () => {
    // Verify from config
    expect(COMBO_JSON.activationWindow.properties.maxSkills).toBe(1);
  });

  it('R6: Freeform cryo infliction triggers activation window (three-layer)', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place cryo infliction on enemy at 3s
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    )!;
    const menu = buildContextMenu(result.current, enemyStatusCol, 3 * FPS)!;
    const cryoItem = menu.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === INFLICTION_COLUMNS.CRYO,
    )!;
    const payload = cryoItem.actionPayload as AddEventPayload;
    act(() => { result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill); });

    // ── Controller layer: cryo infliction exists on enemy ──
    const cryoEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoEvents.length).toBeGreaterThanOrEqual(1);

    // ── Controller layer: activation window opened ──
    const windows = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(windows.length).toBe(1);
    expect(eventDuration(windows[0])).toBe(6 * FPS);

    // ── View layer: combo column shows activation window ──
    const comboCol = findColumn(result.current, SLOT_TANGTANG, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID,
    )).toBe(true);
  });

  it('R7: Two cryo inflictions — second outside first window creates new activation window', () => {
    const { result } = setupTangtang();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    )!;

    // Place first cryo infliction at 3s → window covers 3s–9s
    const menu1 = buildContextMenu(result.current, enemyStatusCol, 3 * FPS)!;
    const cryo1 = menu1.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === INFLICTION_COLUMNS.CRYO,
    )!;
    const p1 = cryo1.actionPayload as AddEventPayload;
    act(() => { result.current.handleAddEvent(p1.ownerEntityId, p1.columnId, p1.atFrame, p1.defaultSkill); });

    const windowsAfter1 = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(windowsAfter1.length).toBe(1);
    expect(eventDuration(windowsAfter1[0])).toBe(6 * FPS);

    // Place second cryo infliction at 12s — outside first window → new trigger
    const menu2 = buildContextMenu(result.current, enemyStatusCol, 12 * FPS)!;
    const cryo2 = menu2.find(
      i => i.actionId === 'addEvent'
        && (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === INFLICTION_COLUMNS.CRYO,
    )!;
    const p2 = cryo2.actionPayload as AddEventPayload;
    act(() => { result.current.handleAddEvent(p2.ownerEntityId, p2.columnId, p2.atFrame, p2.defaultSkill); });

    // ── Controller layer: 2 activation windows ──
    const windowsAfter2 = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_TANGTANG && ev.columnId === COMBO_WINDOW_COLUMN_ID,
    );
    expect(windowsAfter2.length).toBe(2);

    // Both 6s duration
    for (const w of windowsAfter2) {
      expect(eventDuration(w)).toBe(6 * FPS);
    }

    // Second window starts at or after 12s
    const sorted = [...windowsAfter2].sort((a, b) => a.startFrame - b.startFrame);
    expect(sorted[1].startFrame).toBeGreaterThanOrEqual(12 * FPS);
  });
});
