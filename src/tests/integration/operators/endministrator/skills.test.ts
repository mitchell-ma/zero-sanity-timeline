/**
 * @jest-environment jsdom
 */

/**
 * Endministrator — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (basic attack, battle skill, combo skill, ultimate)
 * 2. Originium Crystal cycle: combo applies crystals, BS/ult consumes them
 * 3. Ultimate energy cost (80)
 * 4. Talent-derived statuses (Essence Disintegration from crystal consume)
 * 5. View layer: skills visible in presentation
 *
 * Verification layers:
 *   Context menu: menu items available and enabled
 *   Controller: allProcessedEvents, event counts, status derivation
 *   View: computeTimelinePresentation column state
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 * Endministrator must be swapped in via handleSwapOperator.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  ENEMY_OWNER_ID,
  ENEMY_GROUP_COLUMNS,
  OPERATOR_STATUS_COLUMN_ID,
} from '../../../../model/channels';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../../view/InformationPane';
import type { LoadoutProperties } from '../../../../view/InformationPane';
import {
  findColumn,
  buildContextMenu,
  getMenuPayload,
  getAddEventPayload,
  setUltimateEnergyToMax,
} from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ENDMINISTRATOR_JSON = require(
  '../../../../model/game-data/operators/endministrator/endministrator.json',
);
const ENDMINISTRATOR_ID: string = ENDMINISTRATOR_JSON.id;

const BATTLE_SKILL_JSON = require(
  '../../../../model/game-data/operators/endministrator/skills/battle-skill-constructive-sequence.json',
);
const BATTLE_SKILL_ID: string = BATTLE_SKILL_JSON.properties.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/endministrator/skills/combo-skill-sealing-sequence.json',
);
const COMBO_ID: string = COMBO_JSON.properties.id;
const ULTIMATE_JSON = require(
  '../../../../model/game-data/operators/endministrator/skills/ultimate-bombardment-sequence.json',
);
const ULTIMATE_ID: string = ULTIMATE_JSON.properties.id;
const ULTIMATE_ENERGY_COST: number = ULTIMATE_JSON.clause[0].effects[0].with.value.value;

const ORIGINIUM_CRYSTAL_ID: string = require(
  '../../../../model/game-data/operators/endministrator/statuses/status-originium-crystal.json',
).properties.id;

const ESSENCE_DISINTEGRATION_ID: string = require(
  '../../../../model/game-data/operators/endministrator/statuses/status-essence-disintegration.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ENDMINISTRATOR = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupEndministrator() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID); });
  return view;
}

function setupEndministratorFreeform() {
  const view = setupEndministrator();
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function setupEndministratorWithPotential(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID); });

  const stats: LoadoutProperties = {
    ...DEFAULT_LOADOUT_PROPERTIES,
    operator: {
      ...DEFAULT_LOADOUT_PROPERTIES.operator,
      potential,
    },
  };
  act(() => { view.result.current.handleStatsChange(SLOT_ENDMINISTRATOR, stats); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: battle skill added without crash', () => {
    const { result } = setupEndministrator();
    const col = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE_SKILL);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill added in freeform without crash', () => {
    const { result } = setupEndministratorFreeform();

    const col = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO_SKILL);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);
  });

  it('A3: ultimate added without crash', () => {
    const { result } = setupEndministrator();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ENDMINISTRATOR, 0); });

    const col = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Originium Crystal Cycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Originium Crystal Cycle', () => {
  it('B1: combo skill applies Originium Crystal status on enemy', () => {
    const { result } = setupEndministratorFreeform();

    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: Originium Crystal status generated on enemy
    const crystals = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(crystals.length).toBeGreaterThanOrEqual(1);

    // View: crystal appears in enemy status column
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === ENEMY_OWNER_ID
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
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID,
    )).toBe(true);
  });

  it('B2: battle skill consumes Originium Crystal when present', () => {
    const { result } = setupEndministratorFreeform();

    // Place combo first to create Originium Crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify crystal exists before battle skill
    const crystalsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(crystalsBefore.length).toBeGreaterThanOrEqual(1);

    // Place battle skill after combo (BS frame checks for crystal and consumes)
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE_SKILL);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Controller: Originium Crystal consumed
    const crystalsConsumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(crystalsConsumed.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Ultimate
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Ultimate', () => {
  it('C1: ultimate energy cost is 80', () => {
    expect(ULTIMATE_ENERGY_COST).toBe(80);
  });

  it('C2: ultimate consumes Originium Crystal when present', () => {
    const { result } = setupEndministratorFreeform();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ENDMINISTRATOR, 0); });

    // Place combo to create crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify crystal exists
    const crystalsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(crystalsBefore.length).toBeGreaterThanOrEqual(1);

    // Place ultimate after combo
    const ultCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Controller: Originium Crystal consumed by ultimate
    const crystalsConsumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTAL_ID
        && ev.ownerId === ENEMY_OWNER_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(crystalsConsumed.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Talent-Derived Statuses
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Talent-Derived Statuses', () => {
  it('D1: crystal consume via BS triggers Essence Disintegration on operator (P1)', () => {
    // Essence Disintegration talent requires P1+ to activate
    const { result } = setupEndministratorWithPotential(1);

    // Place combo to create crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place BS to consume crystal (triggers Essence Disintegration talent)
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE_SKILL);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Controller: Essence Disintegration status on operator
    const essenceEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerId === SLOT_ENDMINISTRATOR,
    );
    expect(essenceEvents.length).toBeGreaterThanOrEqual(1);

    // Essence Disintegration has 15s duration
    for (const ev of essenceEvents) {
      expect(eventDuration(ev)).toBe(15 * FPS);
    }

    // View: Essence Disintegration in operator status column
    const statusCol = findColumn(result.current, SLOT_ENDMINISTRATOR, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: battle skill appears in presentation view model', () => {
    const { result } = setupEndministrator();

    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();

    const payload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(battleCol!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });

  it('E2: combo skill with cooldown appears in presentation view model', () => {
    const { result } = setupEndministratorFreeform();

    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: combo has cooldown segment
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(combos).toHaveLength(1);
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
    // Cooldown is 15-16s depending on skill level
    expect(cdSeg!.properties.duration).toBeGreaterThanOrEqual(15 * FPS);
    expect(cdSeg!.properties.duration).toBeLessThanOrEqual(16 * FPS);

    // View: combo in column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(
      ev => ev.name === COMBO_ID && ev.ownerId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });

  it('E3: ultimate appears in presentation view model', () => {
    const { result } = setupEndministrator();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ENDMINISTRATOR, 0); });

    const ultCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(ultCol!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(
      ev => ev.name === ULTIMATE_ID && ev.ownerId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });
});
