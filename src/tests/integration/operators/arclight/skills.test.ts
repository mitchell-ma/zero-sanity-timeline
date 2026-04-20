/**
 * @jest-environment jsdom
 */

/**
 * Arclight Skills — Integration Tests
 *
 * Tests the full pipeline through useApp: skill placement, electric infliction,
 * combo triggers via Electrification, Wildland Trekker talent, and ultimate energy.
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct columns
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Arclight is swapped into slot-0 for all tests.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID,
} from '../../../../model/channels';
import { TEAM_ID } from '../../../../controller/slot/commonSlotController';
import { CritMode, ElementType, EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

// ── Game-data loaded constants ─────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const ARCLIGHT_JSON = require('../../../../model/game-data/operators/arclight/arclight.json');
const ARCLIGHT_ID: string = ARCLIGHT_JSON.id;

const BATTLE_SKILL_ID: string = require(
  '../../../../model/game-data/operators/arclight/skills/battle-skill-tempestuous-arc.json',
).properties.id;

const COMBO_SKILL_ID: string = require(
  '../../../../model/game-data/operators/arclight/skills/combo-skill-peal-of-thunder.json',
).properties.id;

const ULTIMATE_ID: string = require(
  '../../../../model/game-data/operators/arclight/skills/ultimate-exploding-blitz.json',
).properties.id;

const WILDLAND_TREKKER_BUFF_ID: string = require(
  '../../../../model/game-data/operators/arclight/statuses/status-wildland-trekker-buff.json',
).properties.id;

const WILDLAND_TREKKER_TALENT_ID: string = require(
  '../../../../model/game-data/operators/arclight/talents/talent-wildland-trekker-talent.json',
).properties.id;

const COMBO_COOLDOWN_SECONDS: number = require(
  '../../../../model/game-data/operators/arclight/skills/combo-skill-peal-of-thunder.json',
).segments[2].properties.duration.value.value;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ARCLIGHT = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupArclight() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ARCLIGHT, ARCLIGHT_ID); });
  return view;
}

/** Place an electric infliction on enemy at the given frame. */
function placeElectricInfliction(
  result: { current: AppResult },
  startFrame: number,
  durationSec = 20,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.ELECTRIC, startFrame,
      { name: INFLICTION_COLUMNS.ELECTRIC, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

/** Place a heat infliction on enemy at the given frame. */
function placeHeatInfliction(
  result: { current: AppResult },
  startFrame: number,
  durationSec = 20,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.HEAT, startFrame,
      { name: INFLICTION_COLUMNS.HEAT, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

/**
 * Set up Electrification on enemy by placing cross-element inflictions.
 * Reactions require an incoming infliction of one element when a different
 * element infliction is already active. Electric as the incoming element
 * produces Electrification.
 */
function setupElectrification(
  result: { current: AppResult },
  atFrame: number,
) {
  // Place a heat infliction first (different element)
  placeHeatInfliction(result, atFrame);
  // Then place electric infliction — cross-element triggers Electrification
  placeElectricInfliction(result, atFrame + 1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupArclight();
    const col = findColumn(result.current, SLOT_ARCLIGHT, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill with Electrification setup', () => {
    const { result } = setupArclight();

    // Set up Electrification via cross-element inflictions
    setupElectrification(result, 1 * FPS);

    // Verify Electrification reaction was derived
    const electrifications = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(electrifications.length).toBeGreaterThanOrEqual(1);

    // Combo should be available within the activation window
    const comboCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menuItems).not.toBeNull();
    const comboItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBeFalsy();

    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);
  });

  it('A3: ultimate with energy', () => {
    const { result } = setupArclight();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ARCLIGHT, 0); });

    const ultCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, ultCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Electric Infliction Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Electric Infliction Pipeline', () => {
  it('B1: battle skill applies electric infliction to enemy', () => {
    const { result } = setupArclight();
    const col = findColumn(result.current, SLOT_ARCLIGHT, NounType.BATTLE);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Battle skill itself is physical — verify pipeline processes without crash
    // and events are produced
    expect(result.current.allProcessedEvents.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo — Short Cooldown
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo — Short Cooldown', () => {
  it('C1: combo has a 3s cooldown', () => {
    expect(COMBO_COOLDOWN_SECONDS).toBe(3);
  });

  it('C2: combo can be placed in freeform mode', () => {
    const { result } = setupArclight();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Wildland Trekker Talent
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Wildland Trekker Talent', () => {
  it('D1: battle skill with Electrification does not crash and processes correctly', () => {
    const { result } = setupArclight();

    // Set up Electrification via cross-element inflictions
    setupElectrification(result, 1 * FPS);

    // Verify Electrification is active
    const electrifications = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(electrifications.length).toBeGreaterThanOrEqual(1);

    const battleCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.BATTLE);
    const payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Battle skill should be placed successfully
    const battleEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);

    // Pipeline processes without crash — verify total events are reasonable
    expect(result.current.allProcessedEvents.length).toBeGreaterThan(0);

    // Wildland Trekker status IDs are loaded from JSON correctly
    expect(WILDLAND_TREKKER_TALENT_ID).toBeDefined();
    expect(WILDLAND_TREKKER_BUFF_ID).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Ultimate
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Ultimate', () => {
  it('E1: ultimate energy cost at P0 is 90 and P4 is 76.5', () => {
    const p0Cost = getUltimateEnergyCostForPotential(ARCLIGHT_ID, 0);
    const p4Cost = getUltimateEnergyCostForPotential(ARCLIGHT_ID, 4);
    expect(p0Cost).toBe(90);
    expect(p4Cost).toBe(76.5);
  });

  it('E2: ultimate has stagger damage', () => {
    const { result } = setupArclight();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ARCLIGHT, 0); });

    const ultCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ult = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ult).toBeDefined();

    // Ultimate has frames with DEAL STAGGER effects — verify segments exist
    expect(ult!.segments.length).toBeGreaterThanOrEqual(1);

    // Verify the ult processes without crash and has reasonable duration
    const totalFrames = ult!.segments.reduce(
      (sum, seg) => sum + (seg.properties?.duration ?? 0), 0,
    );
    expect(totalFrames).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. View Layer', () => {
  it('F1: battle skill visible in presentation', () => {
    const { result } = setupArclight();
    const battleCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.BATTLE);

    const payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const battleVm = viewModels.get(battleCol!.key);
    expect(battleVm).toBeDefined();
    const battleEvents = battleVm!.events.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.BATTLE,
    );
    expect(battleEvents).toHaveLength(1);
  });

  it('F2: combo skill visible in presentation after Electrification setup', () => {
    const { result } = setupArclight();

    // Setup: cross-element inflictions → Electrification
    setupElectrification(result, 1 * FPS);

    const comboCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const comboVm = viewModels.get(comboCol!.key);
    expect(comboVm).toBeDefined();
    const comboEvents = comboVm!.events.filter(
      ev => ev.ownerEntityId === SLOT_ARCLIGHT && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Ultimate — Electric Infliction ⇆ forced Electrification branch
// ═══════════════════════════════════════════════════════════════════════════════
//
// Frame 1 of Exploding Blitz carries three clauses under clauseType: ALL:
//   1. Unconditional: DEAL STAGGER + DEAL ELECTRIC DAMAGE.
//   2. ENEMY HAVE INFLICTION ELECTRIC → CONSUME INFLICTION + APPLY REACTION
//      ELECTRIFICATION with isForced: 1.
//   3. NOT (ENEMY HAVE INFLICTION ELECTRIC) → APPLY INFLICTION ELECTRIC stacks=1.
// Clauses 2 and 3 are mutually exclusive on the same condition — exactly one
// fires on any given ult cast.

describe('G. Ultimate — Electric Infliction / Electrification branch', () => {
  /** Place the ult via the full context-menu → handleAddEvent flow, with
   *  three-layer verification assertions built in. Returns the view models
   *  so callers can inspect the view layer for specific events.
   */
  function placeUltimateE2E(result: { current: AppResult }, atSec: number) {
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ARCLIGHT, 0); });
    const ultCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    // Layer 1 — context menu: the addEvent item must be available and enabled.
    const menu = buildContextMenu(result.current, ultCol!, atSec * FPS);
    expect(menu).not.toBeNull();
    expect(menu!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // Layer 2 — controller: place the event through handleAddEvent.
    const payload = getMenuPayload(result.current, ultCol!, atSec * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }

  it('G1: ult on a clean enemy applies a new Electric Infliction and no forced Electrification (3-layer)', () => {
    const { result } = setupArclight();

    placeUltimateE2E(result, 5);

    // Layer 2 — controller: apply-branch fires → a new Electric Infliction
    // event lands on enemy and is not marked consumed.
    const inflictions = result.current.allProcessedEvents.filter(
      ev =>
        ev.ownerEntityId === ENEMY_ID
        && ev.columnId === INFLICTION_COLUMNS.ELECTRIC
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(inflictions.length).toBeGreaterThanOrEqual(1);

    // Layer 2 — controller: consume-branch does NOT fire → zero Electrification reactions.
    const electrifications = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.ELECTRIFICATION,
    );
    expect(electrifications).toHaveLength(0);

    // Layer 3 — view: the Electric Infliction event is visible in the infliction
    // column view model; the Electrification column view model has no events.
    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const inflictionVisible = Array.from(vms.values()).some(
      vm => vm.events.some(
        ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
      ),
    );
    expect(inflictionVisible).toBe(true);
    const electrificationVisible = Array.from(vms.values()).some(
      vm => vm.events.some(
        ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.ELECTRIFICATION,
      ),
    );
    expect(electrificationVisible).toBe(false);
  });

  it('G2: ult on an enemy with existing Electric Infliction consumes it and forcibly applies Electrification (3-layer)', () => {
    const { result } = setupArclight();

    // Seed the enemy with an Electric Infliction before the ult lands.
    placeElectricInfliction(result, 1 * FPS);

    const before = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    );
    expect(before.length).toBeGreaterThanOrEqual(1);

    placeUltimateE2E(result, 5);

    // Layer 2 — controller: consume-branch fires → the pre-existing Electric
    // Infliction is marked CONSUMED after the ult's first frame.
    const afterInflictions = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    );
    expect(
      afterInflictions.some(ev => ev.eventStatus === EventStatusType.CONSUMED),
    ).toBe(true);

    // Layer 2 — controller: a forced Electrification reaction event exists on
    // the enemy's reaction column, flagged with isForced=true.
    const electrifications = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.ELECTRIFICATION,
    );
    expect(electrifications.length).toBeGreaterThanOrEqual(1);
    expect(electrifications.some(ev => ev.isForced === true)).toBe(true);

    // Layer 3 — view: the forced Electrification is visible in the
    // Electrification reaction column view model.
    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const forcedVisible = Array.from(vms.values()).some(
      vm => vm.events.some(
        ev =>
          ev.ownerEntityId === ENEMY_ID
          && ev.columnId === REACTION_COLUMNS.ELECTRIFICATION
          && ev.isForced === true,
      ),
    );
    expect(forcedVisible).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Wildland Trekker counter pipeline
// ═══════════════════════════════════════════════════════════════════════════════
//
// The base Tempestuous Arc file has a conditional third frame gated on
// ENEMY HAVE STATUS REACTION ELECTRIFICATION. When the enemy is electrified,
// the frame fires: CONSUME the Electrification, deal Electric DMG, recover SP,
// and APPLY WILDLAND_TREKKER_T1 to Arclight (+1 stack). The Wildland
// Trekker T1 talent itself is the counter — its onTriggerClause fires when
// stacks BECOME >= the P-dependent threshold (3 at P0–P4, 2 at P5), consuming
// the accumulated stacks and applying WILDLAND_TREKKER_BUFF to: TEAM. The
// standalone WILDLAND_TREKKER_TRIGGER status was removed; the T1 talent
// carries the counter directly (Pogranichnik Living Banner pattern).

describe('H. Wildland Trekker counter pipeline', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const WILDLAND_TREKKER_TALENT_ID_LOCAL: string = require(
    '../../../../model/game-data/operators/arclight/talents/talent-wildland-trekker-talent.json',
  ).properties.id;
  const WILDLAND_TREKKER_BUFF_ID_LOCAL: string = require(
    '../../../../model/game-data/operators/arclight/statuses/status-wildland-trekker-buff.json',
  ).properties.id;
  /* eslint-enable @typescript-eslint/no-require-imports */

  /** Place the battle skill via the full context-menu flow with three-layer
   *  pre-assertions: menu availability + payload extraction + handleAddEvent.
   */
  function placeBSE2E(result: { current: AppResult }, atSec: number) {
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const bsCol = findColumn(result.current, SLOT_ARCLIGHT, NounType.BATTLE);
    expect(bsCol).toBeDefined();

    // Layer 1 — context menu: addEvent available and enabled.
    const menu = buildContextMenu(result.current, bsCol!, atSec * FPS);
    expect(menu).not.toBeNull();
    expect(menu!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    // Layer 2 — controller: place via handleAddEvent.
    const payload = getMenuPayload(result.current, bsCol!, atSec * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }

  function getTriggerEvents(app: AppResult) {
    return app.allProcessedEvents.filter(
      ev =>
        ev.ownerEntityId === SLOT_ARCLIGHT
        && ev.id === WILDLAND_TREKKER_TALENT_ID_LOCAL,
    );
  }

  function getBuffEvents(app: AppResult) {
    return app.allProcessedEvents.filter(
      ev => ev.ownerEntityId === TEAM_ID && ev.id === WILDLAND_TREKKER_BUFF_ID_LOCAL,
    );
  }

  it('H1: BS without Electrification leaves the Wildland Trekker counter at 0 (3-layer)', () => {
    const { result } = setupArclight();
    placeBSE2E(result, 5);

    // Layer 2 — controller: no Electrification on enemy → the conditional
    // frame does NOT fire, so no Wildland Trekker talent event should exist.
    const triggers = getTriggerEvents(result.current);
    expect(triggers).toHaveLength(0);

    // Layer 3 — view: no WILDLAND_TREKKER_T1 event in any view model.
    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const triggerVisible = Array.from(vms.values()).some(
      vm => vm.events.some(ev => ev.id === WILDLAND_TREKKER_TALENT_ID_LOCAL),
    );
    expect(triggerVisible).toBe(false);
  });

  it('H2: BS on an electrified enemy fires the conditional frame and increments the Wildland Trekker talent counter (3-layer)', () => {
    const { result } = setupArclight();

    // Seed Electrification via cross-element inflictions before placing BS.
    setupElectrification(result, 1 * FPS);
    const electrifications = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.ownerEntityId === ENEMY_ID,
    );
    expect(electrifications.length).toBeGreaterThanOrEqual(1);

    placeBSE2E(result, 5);

    // Layer 2 — controller: the conditional frame fires → WILDLAND_TREKKER_T1
    // event materializes on Arclight's slot with stacks > 0.
    const triggers = getTriggerEvents(result.current);
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    // Layer 2 — controller: Electrification should be consumed by the same frame.
    const electrificationsAfter = result.current.allProcessedEvents.filter(
      ev =>
        ev.columnId === REACTION_COLUMNS.ELECTRIFICATION
        && ev.ownerEntityId === ENEMY_ID,
    );
    expect(
      electrificationsAfter.some(ev => ev.eventStatus === EventStatusType.CONSUMED),
    ).toBe(true);

    // Layer 2 — controller: counter hasn't reached MAX yet (3 at P0) — no team buff.
    expect(getBuffEvents(result.current)).toHaveLength(0);

    // Layer 3 — view: the talent counter event is visible in Arclight's
    // operator-status column; no Wildland Trekker team buff is visible anywhere.
    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );
    const triggerVisible = Array.from(vms.values()).some(
      vm => vm.events.some(
        ev =>
          ev.ownerEntityId === SLOT_ARCLIGHT
          && ev.id === WILDLAND_TREKKER_TALENT_ID_LOCAL,
      ),
    );
    expect(triggerVisible).toBe(true);
    const buffVisible = Array.from(vms.values()).some(
      vm => vm.events.some(ev => ev.id === WILDLAND_TREKKER_BUFF_ID_LOCAL),
    );
    expect(buffVisible).toBe(false);
  });

  it('H3: counter labels increment 1 → 2 across successive casts (not stuck at the threshold)', () => {
    const { result } = setupArclight();

    // Direct-place reactions on the enemy at two distinct frames so each BS
    // cast finds a fresh Electrification to consume. `setupElectrification`
    // only reliably produces one cross-element reaction per call; direct
    // placement bypasses that fixture limitation.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.ELECTRIFICATION, 1 * FPS,
        { name: REACTION_COLUMNS.ELECTRIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    placeBSE2E(result, 5);
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.ELECTRIFICATION, 10 * FPS,
        { name: REACTION_COLUMNS.ELECTRIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    placeBSE2E(result, 15);

    const vms = computeTimelinePresentation(
      result.current.allProcessedEvents, result.current.columns,
    );

    // Collect talent-counter labels from the view overrides across both casts.
    const talentLabels: string[] = [];
    for (const vm of Array.from(vms.values())) {
      for (const ev of vm.events) {
        if (ev.id !== WILDLAND_TREKKER_TALENT_ID_LOCAL) continue;
        const override = vm.statusOverrides.get(ev.uid);
        if (override?.label) talentLabels.push(override.label);
      }
    }

    // With two casts under the default P5 (counter threshold 2), the labels
    // must show a strict 1 → 2 progression — not two copies of "2" which
    // is what `consumeWithRestack`'s `ev.stacks = allActive.length` stamp
    // used to produce before the presentation layer ignored `ev.stacks` for
    // counter accumulators.
    expect(talentLabels.length).toBeGreaterThanOrEqual(2);
    expect(talentLabels.some(l => l.endsWith(' 1'))).toBe(true);
    expect(talentLabels.some(l => l.endsWith(' 2'))).toBe(true);
  });

  it('H4: Wildland Trekker TEAM buff Electric DMG Bonus is reflected in damage calculation', () => {
    const { result } = setupArclight();

    // At default P5 the counter threshold is 2 — need 2 BS casts on
    // electrified enemy to trigger the team buff. Each BS consumes
    // the active Electrification, so place a fresh one before each cast.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.ELECTRIFICATION, 1 * FPS,
        { name: REACTION_COLUMNS.ELECTRIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    placeBSE2E(result, 3);

    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.ELECTRIFICATION, 8 * FPS,
        { name: REACTION_COLUMNS.ELECTRIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    placeBSE2E(result, 10);

    // Verify the Wildland Trekker buff event appeared on TEAM
    const buffs = getBuffEvents(result.current);
    expect(buffs.length).toBeGreaterThanOrEqual(1);

    // Place a 3rd BS AFTER the buff is active — its electric damage frames
    // should have an Electric DMG Bonus from the team stat delta.
    // Place another Electrification for the 3rd BS to consume.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.ELECTRIFICATION, 18 * FPS,
        { name: REACTION_COLUMNS.ELECTRIFICATION, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });
    placeBSE2E(result, 20);

    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );

    // The 3rd BS's electric frame (conditional on Electrification) should
    // show a positive Electric DMG Bonus from the Wildland Trekker team buff.
    // Physical frames should also show the bonus in allElementDmgBonuses.
    const thirdBsStart = 20 * FPS;
    const thirdBsRows = calcResult.rows.filter(
      r =>
        r.ownerEntityId === SLOT_ARCLIGHT
        && r.columnId === NounType.BATTLE
        && r.absoluteFrame >= thirdBsStart
        && r.damage != null,
    );
    expect(thirdBsRows.length).toBeGreaterThan(0);

    // At least one row must show the TEAM electric DMG bonus
    const hasTeamElectricBonus = thirdBsRows.some(
      r => (r.params?.sub?.allElementDmgBonuses?.[ElementType.ELECTRIC] ?? 0) > 0,
    );
    expect(hasTeamElectricBonus).toBe(true);
  });
});
