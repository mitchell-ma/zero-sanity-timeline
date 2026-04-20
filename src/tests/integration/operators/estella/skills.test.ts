/**
 * @jest-environment jsdom
 */

/**
 * Estella — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (basic attack, battle skill, combo, ultimate)
 * 2. Battle skill applies cryo infliction to enemy
 * 3. Combo requires Solidification trigger (via cryo infliction reaction)
 * 4. Combo has cooldown segment
 * 5. Ultimate energy cost scales with potential (base 70, P2+ x0.9 = 63)
 * 6. Talent: Commiseration from Shatter
 * 7. View layer: skills visible in timeline presentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items available and enabled
 *   2. Controller: processed events, energy graphs, status events
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { SegmentType, InteractionModeType, ColumnType, PhysicalStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
} from '../../../../model/channels';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { findColumn, buildContextMenu, getMenuPayload, getAddEventPayload, setUltimateEnergyToMax } from '../../helpers';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { preConsumptionValue } from '../../../../controller/timeline/eventValidator';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ESTELLA_JSON = require('../../../../model/game-data/operators/estella/estella.json');
const ESTELLA_ID: string = ESTELLA_JSON.id;

const BATTLE_SKILL_JSON = require(
  '../../../../model/game-data/operators/estella/skills/battle-skill-onomatopoeia.json',
);
const BATTLE_SKILL_ID: string = BATTLE_SKILL_JSON.properties.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/estella/skills/combo-skill-distortion.json',
);
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULTIMATE_JSON = require(
  '../../../../model/game-data/operators/estella/skills/ultimate-tremolo.json',
);
const ULTIMATE_ID: string = ULTIMATE_JSON.properties.id;

const COMMISERATION_ID: string = require(
  '../../../../model/game-data/operators/estella/talents/talent-commiseration-talent.json',
).properties.id;
const SURVIVAL_P5_ID: string = require(
  '../../../../model/game-data/operators/estella/potentials/potential-5-survival-is-a-win.json',
).properties.id;
const AUDIO_NOISE_BATK_ID: string = require(
  '../../../../model/game-data/operators/estella/skills/basic-attack-batk-audio-noise.json',
).properties.id;
const AUDIO_NOISE_DIVE_ID: string = require(
  '../../../../model/game-data/operators/estella/skills/basic-attack-dive-audio-noise.json',
).properties.id;
const AUDIO_NOISE_FINISHER_ID: string = require(
  '../../../../model/game-data/operators/estella/skills/basic-attack-finisher-audio-noise.json',
).properties.id;
const WULFGARD_ID: string = require(
  '../../../../model/game-data/operators/wulfgard/wulfgard.json',
).id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_OTHER = 'slot-1';

function setPotential(result: { current: AppResult }, slotId: string, potential: number) {
  const props = result.current.loadoutProperties[slotId];
  act(() => {
    result.current.handleStatsChange(slotId, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

const SLOT_ESTELLA = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupEstella() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ESTELLA, ESTELLA_ID); });
  return view;
}

/** Place a cryo infliction on the enemy via freeform handleAddEvent. */
function placeCryoInfliction(
  result: { current: AppResult },
  startSec: number,
  durationSec = 20,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.CRYO, startSec * FPS,
      { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

/** Place a Solidification reaction on the enemy via freeform handleAddEvent. */
function placeSolidification(
  result: { current: AppResult },
  startSec: number,
  durationSec = 5,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, startSec * FPS,
      { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupEstella();
    const col = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ESTELLA && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill placement with Solidification setup', () => {
    const { result } = setupEstella();

    // Place Solidification to satisfy combo trigger
    placeCryoInfliction(result, 1);
    placeSolidification(result, 2);

    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 3 * FPS);
    expect(menuItems).not.toBeNull();
    const comboItem = menuItems!.find((i) => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBeFalsy();

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ESTELLA && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);
  });

  it('A3: ultimate placed in ULTIMATE column', () => {
    const { result } = setupEstella();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ESTELLA, 0); });

    const col = findColumn(result.current, SLOT_ESTELLA, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ESTELLA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });

  it('A4: basic attack placed without crash', () => {
    const { result } = setupEstella();
    const col = findColumn(result.current, SLOT_ESTELLA, NounType.BASIC_ATTACK);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const basics = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ESTELLA && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basics.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// B. Battle Skill — Cryo Infliction
// =============================================================================

describe('B. Battle Skill Cryo Infliction', () => {
  it('B1: battle skill applies cryo infliction to enemy', () => {
    const { result } = setupEstella();

    // Count cryo inflictions before battle skill
    const cryoBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    ).length;

    const battleCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    const payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: additional cryo infliction from battle skill
    const cryoAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerEntityId === ENEMY_ID,
    );
    expect(cryoAfter.length).toBeGreaterThan(cryoBefore);

    // View: cryo infliction appears in enemy status column
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID
        && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    expect(enemyVM!.events.some(
      (ev) => ev.columnId === INFLICTION_COLUMNS.CRYO,
    )).toBe(true);
  });
});

// =============================================================================
// C. Combo — Solidification Trigger
// =============================================================================

describe('C. Combo Solidification Trigger', () => {
  it('C1: combo available in freeform without Solidification', () => {
    const { result } = setupEstella();

    // Switch to freeform to bypass activation window
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);
  });

  it('C2: combo disabled without Solidification in strict mode', () => {
    const { result } = setupEstella();

    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, comboCol!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    const comboItem = menuItems!.find((i) => i.actionId === 'addEvent');
    expect(comboItem).toBeDefined();
    expect(comboItem!.disabled).toBe(true);
  });

  it('C3: combo has cooldown segment after placement', () => {
    const { result } = setupEstella();

    placeCryoInfliction(result, 1);
    placeSolidification(result, 2);

    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ESTELLA && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // Cooldown is 17-18s depending on skill level
    expect(cdSeg!.properties.duration).toBeGreaterThanOrEqual(17 * FPS);
    expect(cdSeg!.properties.duration).toBeLessThanOrEqual(18 * FPS);
  });
});

// =============================================================================
// D. Ultimate Mechanics
// =============================================================================

describe('D. Ultimate Mechanics', () => {
  it('D1: ultimate energy cost is 70 at P0', () => {
    const cost = getUltimateEnergyCostForPotential(ESTELLA_ID, 0);
    expect(cost).toBe(70);
  });

  it('D2: ultimate energy cost is 63 at P2', () => {
    const cost = getUltimateEnergyCostForPotential(ESTELLA_ID, 2);
    expect(cost).toBe(63);
  });

  it('D3: ultimate energy cost stays 63 at P5', () => {
    const cost = getUltimateEnergyCostForPotential(ESTELLA_ID, 5);
    expect(cost).toBe(63);
  });
});

// =============================================================================
// E. Talent-Derived Statuses
// =============================================================================

describe('E. Talent-Derived Statuses', () => {
  /**
   * Helper: place a freeform Solidification on the enemy then fire the given
   * Estella skill. The engine's Shatter auto-derivation should consume the
   * Solidification and create a Shatter event with Estella as the source,
   * which triggers COMMISERATION_T1 → COMMISERATION status.
   */
  function runCommiserationScenario(
    place: (result: { current: AppResult }) => void,
  ) {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Pre-place Solidification on enemy so Estella's physical skill shatters it
    placeSolidification(result, 1, 60);

    place(result);

    return result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA,
    );
  }

  /** Find a BA variant menu item by its NounType or skill ID inside the basic-attack column. */
  function addBaVariant(result: { current: AppResult }, nounType: string, skillId: string, atSec: number) {
    const col = findColumn(result.current, SLOT_ESTELLA, NounType.BASIC_ATTACK);
    const items = buildContextMenu(result.current, col!, atSec * FPS);
    expect(items).not.toBeNull();
    const item = items!.find(
      (i) => i.actionId === 'addEvent'
        && ((i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === nounType
          || (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === skillId),
    );
    expect(item).toBeDefined();
    const payload = item!.actionPayload as AppResult extends never ? never : {
      ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown>;
    };
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }

  /**
   * Game rule: Shatter consumes Solidification ONLY when a physical status
   * (LIFT / KNOCK_DOWN / CRUSH / BREACH) or VULNERABLE infliction is applied
   * to the solidified enemy. Raw physical damage does NOT consume
   * Solidification — confirmed against in-game behavior. The engine's
   * physical-status derivation matches this rule.
   *
   * Estella's BA variants (BATK / DIVE / FINISHER) deal pure physical damage
   * and apply no statuses, so they CANNOT shatter a solidified enemy and
   * therefore CANNOT trigger Commiseration. E1–E3 are negative assertions:
   * the Commiseration pipeline must produce zero status events for these BAs.
   *
   * E4 (combo, forced LIFT) is the only natural positive: Distortion's
   * forced Lift applies a physical status, which triggers Shatter →
   * Commiseration.
   *
   * E5 (ultimate fired in isolation) is also a negative: Tremolo's Lift is
   * conditional on the enemy already having PHYSICAL_SUSCEPTIBILITY, which
   * the ULT alone doesn't stage. Without a prior CS the conditional Lift
   * never fires and there's no Shatter. (The CS → ULT chain is exercised
   * implicitly via E4 + cooldowns.)
   */
  it('E1: Estella BATK on solidified enemy does NOT trigger Commiseration (raw physical damage rule)', () => {
    const events = runCommiserationScenario((res) => {
      addBaVariant(res, NounType.BATK, AUDIO_NOISE_BATK_ID, 3);
    });
    expect(events).toHaveLength(0);
  });

  it('E2: Estella DIVE on solidified enemy does NOT trigger Commiseration (raw physical damage rule)', () => {
    const events = runCommiserationScenario((res) => {
      addBaVariant(res, NounType.DIVE, AUDIO_NOISE_DIVE_ID, 3);
    });
    expect(events).toHaveLength(0);
  });

  it('E3: Estella FINISHER on solidified enemy does NOT trigger Commiseration (raw physical damage rule)', () => {
    const events = runCommiserationScenario((res) => {
      addBaVariant(res, NounType.FINISHER, AUDIO_NOISE_FINISHER_ID, 3);
    });
    expect(events).toHaveLength(0);
  });

  it('E4: Commiseration applied when Estella combo skill shatters solidified enemy (E2E via context menu)', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Place Solidification via context menu (not hand-built) ──
    const enemyCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID
        && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyCol).toBeDefined();
    const solidMenu = buildContextMenu(result.current, enemyCol!, 1 * FPS);
    expect(solidMenu).not.toBeNull();
    const solidItem = solidMenu!.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as { columnId?: string })?.columnId === REACTION_COLUMNS.SOLIDIFICATION,
    );
    expect(solidItem).toBeDefined();
    const solidPayload = solidItem!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
    act(() => {
      result.current.handleAddEvent(
        solidPayload.ownerEntityId, solidPayload.columnId,
        solidPayload.atFrame, solidPayload.defaultSkill,
      );
    });

    // ── Place Estella combo via context menu ──
    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // ── Controller: Commiseration event exists ──
    const events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA
        && ev.startFrame > 0,
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Duration must be non-zero — zero-duration events are invisible
    expect(eventDuration(events[0])).toBeGreaterThan(0);

    // ── View: status column has COMMISERATION micro-column ──
    const statusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === SLOT_ESTELLA
        && c.columnId === 'operator-status',
    );
    expect(statusCol).toBeDefined();
    expect(statusCol!.microColumns?.some(mc => mc.id === COMMISERATION_ID)).toBe(true);

    // ── View: Commiseration visible in computed view model ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(ev => ev.columnId === COMMISERATION_ID)).toBe(true);
  });

  it('E5: Estella ultimate fired in isolation does NOT trigger Commiseration (Lift is conditional on Physical Susceptibility)', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    placeSolidification(result, 1, 60);
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ESTELLA, 0); });

    const ultCol = findColumn(result.current, SLOT_ESTELLA, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA,
    );
    expect(events).toHaveLength(0);
  });

  it('E6: Estella ultimate applies forced LIFT when enemy has PHYSICAL_SUSCEPTIBILITY (Tremolo conditional clause)', () => {
    // Tremolo's conditional clause:
    //   IF ENEMY HAVE STATUS SUSCEPTIBILITY PHYSICAL → APPLY LIFT (forced).
    // The susceptibility event lives on the `PHYSICAL_SUSCEPTIBILITY` column
    // (flattened by doApply), so the condition must resolve there too —
    // tracked by the columnResolution flatten fix.
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Freeform-place a long-duration PHYSICAL_SUSCEPTIBILITY directly on the
    // enemy so the ULT's HAVE check finds it.
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, 'PHYSICAL_SUSCEPTIBILITY', 1 * FPS,
        {
          name: 'PHYSICAL_SUSCEPTIBILITY',
          segments: [{ properties: { duration: 60 * FPS } }],
        },
      );
    });

    // Cast the ULT at 3s — the conditional clause should fire APPLY LIFT.
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ESTELLA, 0); });
    const ultCol = findColumn(result.current, SLOT_ESTELLA, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // LIFT events on the enemy should include at least one spawned by the ULT
    // after frame 3 (the ULT's active-segment frame fires after its animation).
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PhysicalStatusType.LIFT
        && ev.ownerEntityId === ENEMY_ID
        && ev.startFrame >= 3 * FPS,
    );
    expect(liftEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// G. COMMISERATION — SP Return Only From Estella's Battle Skill
// =============================================================================

describe('G. Commiseration SP return (Estella BS only)', () => {
  /** Trigger COMMISERATION on Estella by placing Solidification + Estella's CS. */
  function triggerCommiseration(result: { current: AppResult }) {
    placeSolidification(result, 1, 60);
    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
  }

  it('G1: non-Estella operator battle skill does NOT consume Commiseration', () => {
    const { result } = setupEstella();
    // Put another operator in slot-1
    act(() => { result.current.handleSwapOperator(SLOT_OTHER, WULFGARD_ID); });
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Trigger Commiseration on Estella: solidification + Estella CS → LIFT → shatter → status
    triggerCommiseration(result);

    const commiserationBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA,
    );
    expect(commiserationBefore.length).toBeGreaterThanOrEqual(1);

    // Now place the OTHER operator's battle skill — should NOT consume Commiseration
    const otherBsCol = findColumn(result.current, SLOT_OTHER, NounType.BATTLE);
    expect(otherBsCol).toBeDefined();
    const otherPayload = getMenuPayload(result.current, otherBsCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        otherPayload.ownerEntityId, otherPayload.columnId, otherPayload.atFrame, otherPayload.defaultSkill,
      );
    });

    // Commiseration should still be present on Estella (other op's BS doesn't match
    // the trigger condition "THIS OPERATOR PERFORM SKILL BATTLE" since THIS resolves
    // to the operator holding the status — Estella)
    const commiserationAfterOtherBs = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA,
    );
    // Not yet consumed
    expect(commiserationAfterOtherBs.length).toBeGreaterThanOrEqual(1);
  });

  it('G2: Estella battle skill consumes Commiseration', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Trigger Commiseration on Estella: solidification + Estella CS → LIFT → shatter → status
    triggerCommiseration(result);

    // Now place Estella's own battle skill — should consume Commiseration
    const bsCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    const bsPayload = getMenuPayload(result.current, bsCol!, 8 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Battle skill fired — the status should have been consumed during the BS animation
    // (frame clause runs at offset 0.7s). Verify nothing is active well past BS end.
    const checkFrame = 12 * FPS;
    const active = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID
        && ev.ownerEntityId === SLOT_ESTELLA
        && ev.startFrame <= checkFrame
        && ev.startFrame + eventDuration(ev) > checkFrame,
    );
    expect(active.length).toBe(0);
  });

  it('G3: shatter applies Commiseration and Estella BS consumes it', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // APPLY path: shatter on Estella self-applies COMMISERATION_T1.
    triggerCommiseration(result);

    const applied = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA,
    );
    expect(applied.length).toBeGreaterThanOrEqual(1);

    // CONSUME path: Estella's own battle skill consumes THIS event.
    const bsCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    const bsFrame = 8 * FPS;
    const bsPayload = getMenuPayload(result.current, bsCol!, bsFrame);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // After BS animation, no Commiseration event should remain active —
    // CONSUME truncates the event so its end ≤ frame at which the consume runs.
    const checkFrame = bsFrame + 4 * FPS;
    const stillActive = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID
        && ev.ownerEntityId === SLOT_ESTELLA
        && ev.startFrame <= checkFrame
        && ev.startFrame + eventDuration(ev) > checkFrame,
    );
    expect(stillActive.length).toBe(0);
  });

  it('G4: Commiseration RETURN routes through DEC and adds SP to the graph at the BS frame', () => {
    const SP_KEY = `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const bsFrame = 8 * FPS;
    // BS frame's RETURN clause runs at offset 0.7s after the BS placement frame.
    const returnFrame = bsFrame + Math.round(0.7 * FPS);

    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    triggerCommiseration(result);
    const bsCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    const bsPayload = getMenuPayload(result.current, bsCol!, bsFrame);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    const graph = result.current.resourceGraphs.get(SP_KEY);
    const spJustBefore = preConsumptionValue(graph, returnFrame - 1)!;
    const spJustAfter = preConsumptionValue(graph, returnFrame + 1)!;
    // Default Estella loadout has talentOneLevel = maxTalentOneLevel = 2 → T2 → 15 SP.
    // The instantaneous step at the RETURN frame should equal +15 (single-frame
    // natural regen is < 0.1, well within tolerance).
    // Tolerance accommodates ~0.13 SP of natural regen between the two sample frames.
    expect(spJustAfter - spJustBefore).toBeGreaterThan(14.9);
    expect(spJustAfter - spJustBefore).toBeLessThan(15.5);
  });
});

// =============================================================================
// H. Survival Is A Win (P5) — 1s Cooldown
// =============================================================================

describe('H. Survival Is A Win P5 — E2E via BS-triggered Solidification', () => {
  /**
   * Helper: place Electric Infliction via enemy context menu, then place
   * Estella BS at the same frame. BS applies Cryo Infliction → Cryo +
   * Electric → Solidification reaction with source = Estella. P5 fires
   * because THIS OPERATOR APPLY SOLIDIFICATION matches.
   */
  function triggerSolidificationViaBS(
    result: { current: AppResult },
    atSec: number,
  ) {
    // Freeform Electric Infliction on enemy at atSec
    const enemyCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === ENEMY_ID
        && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    )!;
    const elecMenu = buildContextMenu(result.current, enemyCol, atSec * FPS);
    const elecItem = elecMenu!.find(
      (i) => i.actionId === 'addEvent'
        && (i.actionPayload as { columnId?: string })?.columnId === INFLICTION_COLUMNS.ELECTRIC,
    );
    expect(elecItem).toBeDefined();
    const elecPayload = elecItem!.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
    act(() => {
      result.current.handleAddEvent(
        elecPayload.ownerEntityId, elecPayload.columnId,
        elecPayload.atFrame, elecPayload.defaultSkill,
      );
    });

    // Estella BS at same frame — Cryo Infliction at +0.7s offset hits
    // while Electric is active → cross-element → Solidification
    const bsCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    const bsPayload = getMenuPayload(result.current, bsCol!, atSec * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerEntityId, bsPayload.columnId,
        bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });
  }

  it('H1: Estella BS + freeform Electric → Solidification applied on enemy (E2E)', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    triggerSolidificationViaBS(result, 0);

    // Solidification should exist on the enemy
    const solidEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION
        && ev.ownerEntityId === ENEMY_ID
        && ev.startFrame > 0,
    );
    expect(solidEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('H2: P5 fires when Estella triggers Solidification — gains 5 UE, T1 does NOT fire (E2E)', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    setPotential(result, SLOT_ESTELLA, 5);

    triggerSolidificationViaBS(result, 2);

    // P5 status event should exist on Estella
    const p5Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SURVIVAL_P5_ID && ev.ownerEntityId === SLOT_ESTELLA
        && ev.startFrame > 0,
    );
    expect(p5Events.length).toBeGreaterThanOrEqual(1);
    expect(eventDuration(p5Events[0])).toBeGreaterThan(0);

    // T1 Commiseration must NOT fire — this setup produces Solidification
    // (Cryo + Electric reaction), not Shatter (physical status on solidified
    // enemy). No LIFT/KNOCK_DOWN/CRUSH/BREACH is applied, so no Shatter,
    // so Commiseration's `THIS OPERATOR APPLY SHATTER` trigger never matches.
    const commEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMMISERATION_ID && ev.ownerEntityId === SLOT_ESTELLA
        && ev.startFrame > 0,
    );
    expect(commEvents).toHaveLength(0);

    // P5 should be visible in Estella's status column view model
    const statusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerEntityId === SLOT_ESTELLA
        && c.columnId === 'operator-status',
    );
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(ev => ev.columnId === SURVIVAL_P5_ID)).toBe(true);
  });

  it('H3: P5 does NOT fire at potential < 5', () => {
    const { result } = setupEstella();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    setPotential(result, SLOT_ESTELLA, 4);

    triggerSolidificationViaBS(result, 2);

    // P5 status should NOT exist — potential too low
    const p5Events = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SURVIVAL_P5_ID && ev.ownerEntityId === SLOT_ESTELLA
        && ev.startFrame > 0,
    );
    expect(p5Events).toHaveLength(0);
  });
});

// =============================================================================
// F. View Layer
// =============================================================================

describe('F. View Layer', () => {
  it('F1: battle skill visible in timeline presentation', () => {
    const { result } = setupEstella();

    const battleCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
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
    const battleVM = viewModels.get(battleCol!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      (ev) => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_ESTELLA,
    )).toBe(true);
  });

  it('F2: combo skill visible in timeline presentation', () => {
    const { result } = setupEstella();

    placeCryoInfliction(result, 1);
    placeSolidification(result, 2);

    const comboCol = findColumn(result.current, SLOT_ESTELLA, NounType.COMBO);
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
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(
      (ev) => ev.name === COMBO_ID && ev.ownerEntityId === SLOT_ESTELLA,
    )).toBe(true);
  });

  it('F3: ultimate visible in timeline presentation', () => {
    const { result } = setupEstella();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ESTELLA, 0); });

    const ultCol = findColumn(result.current, SLOT_ESTELLA, NounType.ULTIMATE);
    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(ultCol!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(
      (ev) => ev.name === ULTIMATE_ID && ev.ownerEntityId === SLOT_ESTELLA,
    )).toBe(true);
  });

  it('F4: battle skill event has nonzero duration', () => {
    const { result } = setupEstella();

    const battleCol = findColumn(result.current, SLOT_ESTELLA, NounType.BATTLE);
    const payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_ESTELLA && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(eventDuration(battles[0])).toBeGreaterThan(0);
  });
});
