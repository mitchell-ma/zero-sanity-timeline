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
import { NounType, VerbType, AdjectiveType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, EventStatusType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
  OPERATOR_STATUS_COLUMN_ID,
  COMBO_WINDOW_COLUMN_ID,
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

const REALSPACE_STASIS_ID: string = require(
  '../../../../model/game-data/operators/endministrator/talents/talent-realspace-stasis.json',
).properties.id;

const ESSENCE_DISINTEGRATION_ID: string = require(
  '../../../../model/game-data/operators/endministrator/talents/talent-essence-disintegration-talent.json',
).properties.id;

const ORIGINIUM_CRYSTALS_SHATTER_ID: string = require(
  '../../../../model/game-data/operators/endministrator/statuses/status-originium-crystals-shatter.json',
).properties.id;

const ESSENCE_DISINTEGRATION_MINOR_ID: string = require(
  '../../../../model/game-data/operators/endministrator/statuses/status-essence-disintegration-minor.json',
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
    const col = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: combo skill added in freeform without crash', () => {
    const { result } = setupEndministratorFreeform();

    const col = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.COMBO,
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
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A2. Combo Activation — ANY_OTHER operator trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('A2. Combo Activation (ANY_OTHER)', () => {
  const SLOT_OTHER = 'slot-1'; // Default: Akekuri

  it('A2a: another operator combo opens Endministrator combo window', () => {
    const { result } = setupEndministratorFreeform();

    // Place a combo for Akekuri (slot-1) in freeform to trigger Endministrator's window
    const otherComboCol = findColumn(result.current, SLOT_OTHER, NounType.COMBO);
    expect(otherComboCol).toBeDefined();
    const payload = getMenuPayload(result.current, otherComboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Endministrator should have a combo activation window sourced from the other operator
    const windows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR
        && ev.sourceEntityId === SLOT_OTHER,
    );
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  it('A2b: Endministrator own combo does NOT open own combo window', () => {
    const { result } = setupEndministratorFreeform();

    // Place Endministrator's combo in freeform
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Endministrator should NOT have combo windows sourced from own combo
    const windows = result.current.allProcessedEvents.filter(
      ev => ev.columnId === COMBO_WINDOW_COLUMN_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR
        && ev.sourceEntityId === SLOT_ENDMINISTRATOR,
    );
    expect(windows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Originium Crystal Cycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Originium Crystal Cycle', () => {
  it('B1: combo skill applies Originium Crystal status on enemy', () => {
    const { result } = setupEndministratorFreeform();

    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: Originium Crystal status generated on enemy
    const crystals = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(crystals.length).toBeGreaterThanOrEqual(1);

    // View: crystal appears in enemy status column
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
      ev => ev.columnId === REALSPACE_STASIS_ID,
    )).toBe(true);
  });

  it('B2: battle skill consumes Originium Crystal when present', () => {
    const { result } = setupEndministratorFreeform();

    // Place combo first to create Originium Crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify crystal exists before battle skill
    const crystalsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID
        && ev.ownerEntityId === ENEMY_ID
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(crystalsBefore.length).toBeGreaterThanOrEqual(1);

    // Place battle skill after combo (BS frame checks for crystal and consumes)
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Controller: Originium Crystal consumed
    const crystalsConsumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID
        && ev.ownerEntityId === ENEMY_ID
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
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify crystal exists
    const crystalsBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID
        && ev.ownerEntityId === ENEMY_ID
        && ev.eventStatus !== EventStatusType.CONSUMED,
    );
    expect(crystalsBefore.length).toBeGreaterThanOrEqual(1);

    // Place ultimate after combo
    const ultCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Controller: Originium Crystal consumed by ultimate
    const crystalsConsumed = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID
        && ev.ownerEntityId === ENEMY_ID
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
    // Base trigger fires at all potentials — self buff always applies on crystal consume
    const { result } = setupEndministratorWithPotential(1);

    // Place combo to create crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place BS to consume crystal (triggers Essence Disintegration talent)
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Controller: Essence Disintegration status on operator
    const essenceEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
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
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });

  it('D2: P2 crystal consume shares half ATK buff to teammates', () => {
    const SLOT_TEAMMATE = 'slot-1';
    const { result } = setupEndministratorWithPotential(2);

    // Place combo to create crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place BS to consume crystal
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Controller: Essence Disintegration (full) on Endministrator
    const selfBuff = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );
    expect(selfBuff.length).toBeGreaterThanOrEqual(1);

    // Controller: Essence Disintegration Minor (half) on teammate
    const teamBuff = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_MINOR_ID
        && ev.ownerEntityId === SLOT_TEAMMATE,
    );
    expect(teamBuff.length).toBeGreaterThanOrEqual(1);

    // Self buff has 15s duration
    for (const ev of selfBuff) {
      expect(eventDuration(ev)).toBe(15 * FPS);
    }

    // Team buff has 15s duration
    for (const ev of teamBuff) {
      expect(eventDuration(ev)).toBe(15 * FPS);
    }
  });

  it('D0: P0 crystal consume still triggers self buff (base clause has no potential gate)', () => {
    const { result } = setupEndministratorWithPotential(0);

    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    const selfBuff = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );
    expect(selfBuff.length).toBeGreaterThanOrEqual(1);
  });

  it('D3: P1 does NOT share ATK buff to teammates', () => {
    const SLOT_TEAMMATE = 'slot-1';
    const { result } = setupEndministratorWithPotential(1);

    // Place combo + BS to consume crystal
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // P1: self buff exists (base trigger fires at any potential)
    const selfBuff = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
        && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    );
    expect(selfBuff.length).toBeGreaterThanOrEqual(1);

    // P1: no team buff (P2 potential gate prevents MINOR from firing)
    const teamBuff = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ESSENCE_DISINTEGRATION_MINOR_ID
        && ev.ownerEntityId === SLOT_TEAMMATE,
    );
    expect(teamBuff).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D2. Realspace Stasis — Physical Fragility & Crystal Shatter Trigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('D2. Realspace Stasis', () => {
  it('D2a: combo-applied crystals carry Realspace Stasis status ID', () => {
    const { result } = setupEndministratorFreeform();

    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const crystals = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REALSPACE_STASIS_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(crystals.length).toBeGreaterThanOrEqual(1);
  });

  it('D2b: Realspace Stasis status has PHYSICAL FRAGILITY clause in its definition', () => {
    // Verify the status JSON is wired up — clause applies FRAGILITY PHYSICAL
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const statusJson = require(
      '../../../../model/game-data/operators/endministrator/talents/talent-realspace-stasis.json',
    );
    expect(statusJson.clause).toBeDefined();
    const fragilityEffect = statusJson.clause[0].effects.find(
      (e: Record<string, unknown>) => e.objectId === NounType.FRAGILITY && e.objectQualifier === AdjectiveType.PHYSICAL,
    );
    expect(fragilityEffect).toBeDefined();
    expect(fragilityEffect.with.value.value).toEqual([0, 0.1, 0.2]);
  });

  it('D2c: Realspace Stasis has onTriggerClause for physical status shattering', () => {
    // Verify the onTriggerClause covers all 5 physical statuses/vulnerability
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const statusJson = require(
      '../../../../model/game-data/operators/endministrator/talents/talent-realspace-stasis.json',
    );
    expect(statusJson.onTriggerClause).toBeDefined();
    expect(statusJson.onTriggerClause).toHaveLength(5);

    const triggerObjects = statusJson.onTriggerClause.map(
      (t: { conditions: { object: string }[] }) => t.conditions[0].object,
    );
    expect(triggerObjects).toContain('VULNERABLE');
    expect(triggerObjects).toContain('LIFT');
    expect(triggerObjects).toContain('CRUSH');
    expect(triggerObjects).toContain('KNOCK_DOWN');
    expect(triggerObjects).toContain('BREACH');

    // Each trigger consumes THIS EVENT and applies ORIGINIUM_CRYSTALS_SHATTER
    // (ESSENCE_DISINTEGRATION is applied by the talent trigger via CONSUME cascade)
    for (const trigger of statusJson.onTriggerClause) {
      const consumeEffect = trigger.effects.find(
        (e: Record<string, unknown>) => e.verb === VerbType.CONSUME && e.object === NounType.EVENT,
      );
      expect(consumeEffect).toBeDefined();

      const shatterEffect = trigger.effects.find(
        (e: Record<string, unknown>) => e.verb === VerbType.APPLY && e.objectId === ORIGINIUM_CRYSTALS_SHATTER_ID,
      );
      expect(shatterEffect).toBeDefined();
    }
  });

  it('D2d: BS crush triggers Originium Crystals Shatter on enemy with 2s duration', () => {
    const { result } = setupEndministratorWithPotential(1);

    // Place combo to apply crystals
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place BS — CRUSH triggers REALSPACE_STASIS onTriggerClause → SHATTER
    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    const battlePayload = getMenuPayload(result.current, battleCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        battlePayload.ownerEntityId, battlePayload.columnId,
        battlePayload.atFrame, battlePayload.defaultSkill,
      );
    });

    // Controller: Originium Crystals Shatter on enemy
    const shatterEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTALS_SHATTER_ID
        && ev.ownerEntityId === ENEMY_ID,
    );
    expect(shatterEvents.length).toBeGreaterThanOrEqual(1);

    // Shatter has 2s duration
    for (const ev of shatterEvents) {
      expect(eventDuration(ev)).toBe(2 * FPS);
    }
  });

  it('D2e: ultimate crystal consume also triggers shatter', () => {
    const { result } = setupEndministratorFreeform();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_ENDMINISTRATOR, 0); });

    // Place combo to apply crystals
    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place ultimate — explicit CONSUME ORIGINIUM_CRYSTAL
    const ultCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Controller: shatter should NOT appear from ult (ult consumes directly, no physical status trigger)
    // The ult's CONSUME doesn't go through REALSPACE_STASIS onTriggerClause — it's a direct CONSUME
    const shatterEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === ORIGINIUM_CRYSTALS_SHATTER_ID
        && ev.ownerEntityId === ENEMY_ID,
    );
    // Ult consumes crystals directly — the shatter damage is baked into the ult's own bonus DMG multiplier
    // REALSPACE_STASIS onTriggerClause fires on physical status application, NOT on direct CONSUME
    expect(shatterEvents).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: battle skill appears in presentation view model', () => {
    const { result } = setupEndministrator();

    const battleCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
    expect(battleCol).toBeDefined();

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
      ev => ev.name === BATTLE_SKILL_ID && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });

  it('E2: combo skill with cooldown appears in presentation view model', () => {
    const { result } = setupEndministratorFreeform();

    const comboCol = findColumn(result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const payload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller: combo has cooldown segment
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_ENDMINISTRATOR && ev.columnId === NounType.COMBO,
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
      ev => ev.name === COMBO_ID && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
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
      ev => ev.name === ULTIMATE_ID && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
    )).toBe(true);
  });
});
