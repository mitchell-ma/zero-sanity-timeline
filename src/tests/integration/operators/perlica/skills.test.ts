/**
 * @jest-environment jsdom
 */

/**
 * Perlica — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Core skill placement (battle skill, combo, ultimate)
 * 2. Battle skill electric infliction on enemy
 * 3. Combo cooldown at L12
 * 4. Ultimate energy cost at different potentials
 * 5. View layer presentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items available and enabled
 *   2. Controller: processed events, timing, duration
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { AdjectiveType, NounType, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, CritMode, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID } from '../../../../model/channels';
import {
  findColumn,
  buildContextMenu,
  getMenuPayload,
  getAddEventPayload,
  setUltimateEnergyToMax,
} from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const PERLICA_JSON = require('../../../../model/game-data/operators/perlica/perlica.json');
const PERLICA_ID: string = PERLICA_JSON.id;

const BATTLE_SKILL_JSON = require(
  '../../../../model/game-data/operators/perlica/skills/battle-skill-protocol-omega-strike.json',
);
const BATTLE_SKILL_ID: string = BATTLE_SKILL_JSON.properties.id;

const COMBO_JSON = require(
  '../../../../model/game-data/operators/perlica/skills/combo-skill-instant-protocol-chain.json',
);
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULTIMATE_JSON = require(
  '../../../../model/game-data/operators/perlica/skills/ultimate-protocol-epsilon.json',
);
const ULTIMATE_ID: string = ULTIMATE_JSON.properties.id;

/* eslint-enable @typescript-eslint/no-require-imports */

const ARTS_SUSCEPTIBILITY_ID = `ARTS_${NounType.SUSCEPTIBILITY}` as const;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const P3_STATUS_JSON = require(
  '../../../../model/game-data/operators/perlica/statuses/status-supervisory-duties.json',
);
const P3_STATUS_ID: string = P3_STATUS_JSON.properties.id;

const SLOT_PERLICA = 'slot-0';

type AppResult = ReturnType<typeof useApp>;

function setPotential(result: { current: AppResult }, potential: number) {
  const props = result.current.loadoutProperties[SLOT_PERLICA];
  act(() => {
    result.current.handleStatsChange(SLOT_PERLICA, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

beforeEach(() => {
  localStorage.clear();
});

function setupPerlica() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_PERLICA, PERLICA_ID); });
  return view;
}

// =============================================================================
// A. Core Skill Placement
// =============================================================================

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupPerlica();
    const col = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BATTLE_SKILL_ID);
  });

  it('A2: Combo skill placed in freeform with cooldown', () => {
    const { result } = setupPerlica();

    // Combo requires activation trigger — switch to freeform to bypass
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // Verify cooldown segment exists
    const cooldownSeg = combos[0].segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSeg).toBeDefined();
  });

  it('A3: Ultimate placed with energy requirement', () => {
    const { result } = setupPerlica();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_PERLICA, 0); });

    const col = findColumn(result.current, SLOT_PERLICA, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some((i) => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getAddEventPayload(menuItems!);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULTIMATE_ID);
  });
});

// =============================================================================
// B. Battle Skill — Electric Infliction
// =============================================================================

describe('B. Battle Skill — Electric Infliction', () => {
  it('B1: Battle skill applies electric infliction to enemy', () => {
    const { result } = setupPerlica();
    const col = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Battle skill should generate electric infliction on enemy
    const electricInflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.ELECTRIC && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(electricInflictions.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. Combo Cooldown
// =============================================================================

describe('C. Combo Cooldown', () => {
  it('C1: Combo cooldown is 19s at L12', () => {
    // Verify from JSON: cooldown array last entry (L12, index 11) = 19
    const cooldownSegment = COMBO_JSON.segments.find(
      (s: { properties: { segmentTypes?: string[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cooldownSegment).toBeDefined();

    // The cooldown VARY_BY array: index 11 (L12) = 19
    const cooldownValues = cooldownSegment.properties.duration.value.value;
    expect(cooldownValues[11]).toBe(19);

    // Base cooldown (L1) = 20
    expect(cooldownValues[0]).toBe(20);
  });
});

// =============================================================================
// D. Ultimate — Energy Cost
// =============================================================================

describe('D. Ultimate — Energy Cost', () => {
  it('D1: Ultimate energy cost is 80 at P0, 68 at P2', () => {
    const costP0 = getUltimateEnergyCostForPotential(PERLICA_ID, 0);
    expect(costP0).toBe(80);

    const costP2 = getUltimateEnergyCostForPotential(PERLICA_ID, 2);
    expect(costP2).toBe(68);
  });

  it('D2: Ultimate processes correctly', () => {
    const { result } = setupPerlica();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_PERLICA, 0); });

    const col = findColumn(result.current, SLOT_PERLICA, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_PERLICA && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);

    // Ultimate should have animation + active segments with nonzero duration
    const totalDuration = eventDuration(ultimates[0]);
    expect(totalDuration).toBeGreaterThan(0);

    // Verify animation segment exists (time-stop)
    const animSeg = ultimates[0].segments.find(
      (s) => s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();
  });
});

// =============================================================================
// E. View Layer
// =============================================================================

describe('E. View Layer', () => {
  it('E1: Skills visible in presentation for battle skill', () => {
    const { result } = setupPerlica();
    const col = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Find the battle skill column in view models
    const battleCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === SLOT_PERLICA
        && c.columnId === NounType.BATTLE,
    );
    expect(battleCol).toBeDefined();

    const vm = viewModels.get(battleCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.length).toBeGreaterThanOrEqual(1);

    const bsEvent = vm!.events.find((ev) => ev.name === BATTLE_SKILL_ID);
    expect(bsEvent).toBeDefined();
  });

  it('E2: Skills visible in presentation for combo and ultimate', () => {
    const { result } = setupPerlica();

    // Place combo in freeform
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place ultimate
    act(() => { setUltimateEnergyToMax(result.current, SLOT_PERLICA, 0); });
    const ultCol = findColumn(result.current, SLOT_PERLICA, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 30 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    // Combo visible
    const comboVmCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === SLOT_PERLICA
        && c.columnId === NounType.COMBO,
    );
    expect(comboVmCol).toBeDefined();
    const comboVm = viewModels.get(comboVmCol!.key);
    expect(comboVm).toBeDefined();
    expect(comboVm!.events.some((ev) => ev.name === COMBO_ID)).toBe(true);

    // Ultimate visible
    const ultVmCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === SLOT_PERLICA
        && c.columnId === NounType.ULTIMATE,
    );
    expect(ultVmCol).toBeDefined();
    const ultVm = viewModels.get(ultVmCol!.key);
    expect(ultVm).toBeDefined();
    expect(ultVm!.events.some((ev) => ev.name === ULTIMATE_ID)).toBe(true);
  });
});

// =============================================================================
// F0. T1 — Obliteration Protocol (Stagger Damage Bonus)
// =============================================================================

describe('F0. T1 — Obliteration Protocol', () => {
  it('F0a: No talent status without stagger events — including frame 0', () => {
    const { result } = setupPerlica();

    // No talent events at ALL — not even at frame 0
    const talentEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_PERLICA && ev.name === PERLICA_JSON.talents.one,
    );
    expect(talentEvents).toHaveLength(0);

    // View: no talent visible in presentation at any frame
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    viewModels.forEach(vm => {
      const talentVm = vm.events.filter(
        (ev: { name: string; ownerId: string }) =>
          ev.name === PERLICA_JSON.talents.one && ev.ownerId === SLOT_PERLICA,
      );
      expect(talentVm).toHaveLength(0);
    });
  });

  it('F0b: Talent active during enemy stagger, matches stagger duration', () => {
    const { result } = setupPerlica();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place stagger event on enemy (4s–8s = 4s duration)
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID, 4 * FPS,
        { name: NODE_STAGGER_COLUMN_ID, segments: [{ properties: { duration: 4 * FPS } }] },
      );
    });

    // Verify stagger event exists
    const staggerEvs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    );
    expect(staggerEvs.length).toBeGreaterThanOrEqual(1);

    // Talent should be triggered and active during stagger
    const talentEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_PERLICA && ev.name === PERLICA_JSON.talents.one,
    );
    expect(talentEvents.length).toBeGreaterThanOrEqual(1);
    // Duration should match the stagger event duration (4s = 480 frames)
    expect(eventDuration(talentEvents[0])).toBe(4 * FPS);
    expect(talentEvents[0].startFrame).toBe(4 * FPS);

    // Talent is NOT active outside the stagger window
    const talentEnd = talentEvents[0].startFrame + eventDuration(talentEvents[0]);
    const talentActiveOutside = talentEvents.some(
      ev => ev.startFrame < 4 * FPS || ev.startFrame + eventDuration(ev) > 8 * FPS,
    );
    expect(talentActiveOutside).toBe(false);
    // Talent ends exactly when stagger ends
    expect(talentEnd).toBe(8 * FPS);

    // View: talent appears in presentation during stagger window only
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    let viewTalentFound = false;
    viewModels.forEach(vm => {
      const talentVmEvents = vm.events.filter(
        (ev: { name: string; ownerId: string }) =>
          ev.name === PERLICA_JSON.talents.one && ev.ownerId === SLOT_PERLICA,
      );
      for (const ev of talentVmEvents) {
        viewTalentFound = true;
        // Must start at stagger start and not extend past stagger end
        expect(ev.startFrame).toBe(4 * FPS);
        expect(ev.startFrame + eventDuration(ev)).toBe(8 * FPS);
      }
    });
    expect(viewTalentFound).toBe(true);

    // View: talent does NOT appear outside the stagger window
    viewModels.forEach(vm => {
      const outsideEvents = vm.events.filter(
        (ev: { name: string; ownerId: string; startFrame: number }) =>
          ev.name === PERLICA_JSON.talents.one && ev.ownerId === SLOT_PERLICA
          && (ev.startFrame < 4 * FPS || ev.startFrame >= 8 * FPS),
      );
      expect(outsideEvents).toHaveLength(0);
    });
  });

  it('F0d: Freeform node stagger → talent present → resize stagger → talent resized', () => {
    const { result } = setupPerlica();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // 1. Add node stagger event at 4s, 4s duration
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID, 4 * FPS,
        { name: NODE_STAGGER_COLUMN_ID, segments: [{ properties: { duration: 4 * FPS } }] },
      );
    });

    // 2. Verify Obliteration Protocol talent is present and matches stagger
    const talentId = PERLICA_JSON.talents.one;
    let talent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_PERLICA && ev.name === talentId,
    );
    expect(talent).toBeDefined();
    expect(talent!.startFrame).toBe(4 * FPS);
    expect(eventDuration(talent!)).toBe(4 * FPS);

    // 3. Resize stagger from 4s to 6s
    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 6 * FPS }]);
    });

    // 4. Verify talent has been resized to match new 6s stagger
    talent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_PERLICA && ev.name === talentId,
    );
    expect(talent).toBeDefined();
    expect(talent!.startFrame).toBe(4 * FPS);
    expect(eventDuration(talent!)).toBe(6 * FPS);

    // 5. View layer confirms resized talent
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const viewTalents: { startFrame: number; endFrame: number }[] = [];
    viewModels.forEach(vm => {
      for (const ev of vm.events) {
        if (ev.name === talentId && ev.ownerId === SLOT_PERLICA) {
          viewTalents.push({ startFrame: ev.startFrame, endFrame: ev.startFrame + eventDuration(ev) });
        }
      }
    });
    expect(viewTalents.length).toBeGreaterThanOrEqual(1);
    expect(viewTalents[0].startFrame).toBe(4 * FPS);
    expect(viewTalents[0].endFrame).toBe(10 * FPS);
  });

  it('F0c: STAGGER_DAMAGE_BONUS in damage calc during stagger', () => {
    const { result } = setupPerlica();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place stagger event on enemy
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID, 4 * FPS,
        { name: NODE_STAGGER_COLUMN_ID, segments: [{ properties: { duration: 6 * FPS } }] },
      );
    });

    // Place BS at 5s — during stagger
    const bsCol = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.BATTLE, 5 * FPS, bsCol!.defaultEvent!,
      );
    });

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

    const bsRows = calcResult.rows.filter(
      r => r.ownerId === SLOT_PERLICA && r.columnId === NounType.BATTLE && r.damage != null,
    );
    expect(bsRows.length).toBeGreaterThan(0);
    const row = bsRows.find(r => r.params?.sub);
    expect(row).toBeDefined();
    expect(row!.params?.sub?.staggerDmgBonus ?? 0).toBeGreaterThanOrEqual(0.2);
  });
});

// =============================================================================
// F. Combo Skill — Forced Electrification
// =============================================================================

describe('F. Combo Skill — Forced Electrification', () => {
  it('F1: Combo applies forced Electrification reaction on enemy', () => {
    const { result } = setupPerlica();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    // Should produce forced Electrification reaction on enemy
    const electrification = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(electrification.length).toBeGreaterThanOrEqual(1);
    // Forced reaction should have duration (5s = 600 frames at P0)
    expect(eventDuration(electrification[0])).toBeGreaterThanOrEqual(5 * FPS - 1);
  });

  it('F2: P1 extends Electrification duration by 75%', () => {
    const { result } = setupPerlica();
    setPotential(result, 1);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    const electrification = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(electrification.length).toBeGreaterThanOrEqual(1);
    // P1: 5s × 1.75 = 8.75s = 1050 frames
    const dur = eventDuration(electrification[0]);
    expect(dur).toBeGreaterThanOrEqual(Math.round(8.75 * FPS) - 1);
    expect(dur).toBeLessThanOrEqual(Math.round(8.75 * FPS) + 1);
  });
});

// =============================================================================
// G. P3 — Supervisory Duties (ATK buff on Electrification)
// =============================================================================

describe('G. P3 — Supervisory Duties', () => {
  it('G1: P3 triggers Supervisory Duties status on Perlica after Electrification', () => {
    const { result } = setupPerlica();
    setPotential(result, 3);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place combo to trigger forced Electrification → should trigger P3 status
    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    // P3 status should appear on Perlica
    const p3Status = result.current.allProcessedEvents.filter(
      ev => ev.name === P3_STATUS_ID && ev.ownerId === SLOT_PERLICA && ev.startFrame > 0,
    );
    expect(p3Status.length).toBeGreaterThanOrEqual(1);
    // Duration should be 5s
    expect(eventDuration(p3Status[0])).toBeGreaterThanOrEqual(5 * FPS - 1);
    expect(eventDuration(p3Status[0])).toBeLessThanOrEqual(5 * FPS + 1);
  });

  it('G2: P3 stacks to 2 on multiple Electrification applications', () => {
    const { result } = setupPerlica();
    setPotential(result, 3);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    // First combo at 3s
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });
    // Second combo at 30s (after CD)
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 30 * FPS, comboCol!.defaultEvent!,
      );
    });

    // Should have 2 P3 status applications
    const p3Statuses = result.current.allProcessedEvents.filter(
      ev => ev.name === P3_STATUS_ID && ev.ownerId === SLOT_PERLICA && ev.startFrame > 0,
    );
    expect(p3Statuses.length).toBeGreaterThanOrEqual(2);
  });

  it('G3: Below P3, no Supervisory Duties status is triggered', () => {
    const { result } = setupPerlica();
    setPotential(result, 2);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    const p3Status = result.current.allProcessedEvents.filter(
      ev => ev.name === P3_STATUS_ID && ev.ownerId === SLOT_PERLICA && ev.startFrame > 0,
    );
    expect(p3Status).toHaveLength(0);
  });
});

// =============================================================================
// H. P4 — Constant Guidance (Electrification extra scaling)
// =============================================================================

describe('H. P4 — Constant Guidance', () => {
  it('H1: P4 combo applies additional Arts susceptibility (+0.33) in DSL', () => {
    const comboFrame = COMBO_JSON.segments[1]?.frames?.[0];
    expect(comboFrame).toBeDefined();
    const applySusc = comboFrame.clause[0].effects.find(
      (e: { verb: string; object: string; objectId?: string }) =>
        e.verb === VerbType.APPLY && e.object === NounType.STATUS && e.objectId === ARTS_SUSCEPTIBILITY_ID,
    );
    expect(applySusc).toBeDefined();
    // P0-P3: 0, P4 (index 4): 0.33
    expect(applySusc.with.value.value[0]).toBe(0);
    expect(applySusc.with.value.value[3]).toBe(0);
    expect(applySusc.with.value.value[4]).toBe(0.33);
  });

  it('H2: P4 combo applies Arts susceptibility status to enemy', () => {
    const { result } = setupPerlica();
    setPotential(result, 4);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    const susc = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.id === ARTS_SUSCEPTIBILITY_ID,
    );
    expect(susc.length).toBeGreaterThanOrEqual(1);
    // Susceptibility value should be 0.33
    expect(susc[0].susceptibility).toBeDefined();
  });

  it('H3: Below P4, Arts susceptibility has zero value', () => {
    const { result } = setupPerlica();
    setPotential(result, 3);
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const comboCol = findColumn(result.current, SLOT_PERLICA, NounType.COMBO);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.COMBO, 3 * FPS, comboCol!.defaultEvent!,
      );
    });

    const susc = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.id === ARTS_SUSCEPTIBILITY_ID,
    );
    // Event may exist but with 0 susceptibility value (no gameplay effect)
    for (const ev of susc) {
      const artsValue = (ev.susceptibility as Record<string, number> | undefined)?.[AdjectiveType.ARTS] ?? 0;
      expect(artsValue).toBe(0);
    }
  });
});
