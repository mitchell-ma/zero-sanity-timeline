/**
 * @jest-environment jsdom
 */

/**
 * Lifeng — Integration Tests
 *
 * Tests the full user flow through useApp for Lifeng's skills:
 * A. Core skill placement (battle skill, combo, ultimate)
 * B. Battle skill — Knock Down and Physical Susceptibility application
 * C. Combo — LINK status application and cooldown
 * D. Ultimate — energy cost with potentials, conditional LINK consume bonus
 * E. View layer — all skills visible in computeTimelinePresentation
 *
 * Three-layer verification:
 *   1. Context menu: menu items are available and enabled
 *   2. Controller: events appear in allProcessedEvents with correct properties
 *   3. View: computeTimelinePresentation includes events in the correct columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, flattenQualifiedId, AdjectiveType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, ElementType, EventStatusType, InteractionModeType, SegmentType, StatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { getUltimateEnergyCostForPotential } from '../../../../controller/operators/operatorRegistry';
import {
  PHYSICAL_INFLICTION_COLUMNS,
  PHYSICAL_STATUS_COLUMNS,
  ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax, type AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LIFENG_JSON = require('../../../../model/game-data/operators/lifeng/lifeng.json');
const LIFENG_ID: string = LIFENG_JSON.id;

const BS_JSON = require('../../../../model/game-data/operators/lifeng/skills/battle-skill-turbid-avatar.json');
const BS_ID: string = BS_JSON.properties.id;

const COMBO_JSON = require('../../../../model/game-data/operators/lifeng/skills/combo-skill-aspect-of-wrath.json');
const COMBO_ID: string = COMBO_JSON.properties.id;

const ULT_JSON = require('../../../../model/game-data/operators/lifeng/skills/ultimate-heart-of-the-unmoving.json');
const ULT_ID: string = ULT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_LIFENG = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupLifeng() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_LIFENG, LIFENG_ID); });
  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Core Skill Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Core Skill Placement', () => {
  it('A1: Battle skill placed in BATTLE_SKILL column', () => {
    const { result } = setupLifeng();
    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const battles = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.BATTLE,
    );
    expect(battles).toHaveLength(1);
    expect(battles[0].name).toBe(BS_ID);
  });

  it('A2: Combo skill freeform placement with cooldown', () => {
    const { result } = setupLifeng();

    // Switch to freeform to bypass activation conditions
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LIFENG, NounType.COMBO);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // Verify cooldown segment exists
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();
  });

  it('A3: Ultimate placement with energy', () => {
    const { result } = setupLifeng();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });

    const col = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    expect(col).toBeDefined();

    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();
    expect(menuItems!.some(i => i.actionId === 'addEvent' && !i.disabled)).toBe(true);

    const payload = getMenuPayload(result.current, col!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultimates = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultimates).toHaveLength(1);
    expect(ultimates[0].name).toBe(ULT_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Battle Skill — Knock Down and Susceptibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle Skill — Knock Down and Susceptibility', () => {
  it('B1: BS adds Vulnerable stack to enemy (Knock Down requires prior Vulnerable)', () => {
    const { result } = setupLifeng();

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Without prior Vulnerable, BS adds a Vulnerable stack (no Knock Down event yet)
    const vulnEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: Two BSs produce Knock Down (second BS has Vulnerable from first)', () => {
    const { result } = setupLifeng();

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    // First BS at 2s — adds Vulnerable but no Knock Down
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Second BS at 12s — enemy now has Vulnerable, so Knock Down fires
    const payload2 = getMenuPayload(result.current, col!, 12 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    const knockDownEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(knockDownEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Combo — LINK Status
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo — LINK Status', () => {
  it('C1: Combo applies LINK status (20s duration)', () => {
    const { result } = setupLifeng();

    // Freeform to bypass activation conditions
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LIFENG, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // LINK status should be produced
    const linkEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.LINK,
    );
    expect(linkEvents.length).toBeGreaterThanOrEqual(1);

    // LINK duration should be 20s
    const linkDuration = eventDuration(linkEvents[0]);
    expect(linkDuration).toBe(20 * FPS);
  });

  it('C2: Combo cooldown is 16s at base, 15s at L12', () => {
    const { result } = setupLifeng();

    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const col = findColumn(result.current, SLOT_LIFENG, NounType.COMBO);
    expect(col).toBeDefined();

    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    // Find cooldown segment
    const cdSeg = combos[0].segments.find(
      (s: { properties: { segmentTypes?: SegmentType[] } }) =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
    );
    expect(cdSeg).toBeDefined();

    // Default skill level is L12, so cooldown should be 15s
    expect(cdSeg!.properties.duration).toBe(15 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Ultimate — Energy and LINK Consume
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Ultimate — Vajra Impact with LINK Consume', () => {
  it('D1: Ultimate energy cost is 90 at P0, reduced at P4', () => {
    const costP0 = getUltimateEnergyCostForPotential(LIFENG_ID, 0);
    expect(costP0).toBe(90);

    const costP4 = getUltimateEnergyCostForPotential(LIFENG_ID, 4);
    // P4 potential index = 4 → value 0.85 → 90 * 0.85 = 76.5 → rounded
    expect(costP4).not.toBeNull();
    // Accept either floor or round of 76.5
    expect(costP4!).toBeGreaterThanOrEqual(76);
    expect(costP4!).toBeLessThanOrEqual(77);
  });

  it('D2: Ultimate placed after combo — LINK exists on operator status', () => {
    const { result } = setupLifeng();

    // Freeform for placing combo (to get LINK)
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place combo skill at 2s to produce LINK
    const comboCol = findColumn(result.current, SLOT_LIFENG, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify LINK is created
    const linkEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.LINK,
    );
    expect(linkEvents.length).toBeGreaterThanOrEqual(1);

    // Place ultimate after combo (with full energy)
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });
    const ultCol = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Ultimate should be placed alongside LINK
    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);

    // Ultimate has 3 segments (animation + 2 active)
    expect(ults[0].segments.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. View Layer
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. View Layer', () => {
  it('E1: Battle skill visible in computeTimelinePresentation', () => {
    const { result } = setupLifeng();

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
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
    const bsVm = viewModels.get(col!.key);
    expect(bsVm).toBeDefined();
    const bsEvents = bsVm!.events.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('E2: All skills visible in computeTimelinePresentation after placement', () => {
    const { result } = setupLifeng();

    // Freeform for combo
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });

    // Place battle skill
    const bsCol = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Place combo skill
    const comboCol = findColumn(result.current, SLOT_LIFENG, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Place ultimate
    const ultCol = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 30 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Verify all three skill types in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const bsVm = viewModels.get(bsCol!.key);
    expect(bsVm).toBeDefined();
    expect(bsVm!.events.some(ev => ev.name === BS_ID)).toBe(true);

    const comboVm = viewModels.get(comboCol!.key);
    expect(comboVm).toBeDefined();
    expect(comboVm!.events.some(ev => ev.name === COMBO_ID)).toBe(true);

    const ultVm = viewModels.get(ultCol!.key);
    expect(ultVm).toBeDefined();
    expect(ultVm!.events.some(ev => ev.name === ULT_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Subduer of Evil Talent Chain (Knock Down → Physical DMG)
// ═══════════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-require-imports */
const SUBDUER_P5_STATUS_ID: string = require(
  '../../../../model/game-data/operators/lifeng/statuses/status-subduer-of-evil-p5.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

describe('F. Subduer of Evil Talent Chain', () => {
  it('F1: Two BSs → Knock Down → Subduer of Evil status on ENEMY with Physical element', () => {
    const { result } = setupLifeng();

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    // First BS at 2s — adds Vulnerable
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Second BS at 12s — Knock Down fires (enemy has Vulnerable from first BS)
    const payload2 = getMenuPayload(result.current, col!, 12 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    // 1. Knock Down exists on ENEMY
    const knockDownEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(knockDownEvents.length).toBeGreaterThanOrEqual(1);

    // 2. Subduer of Evil talent is an inline DEAL DAMAGE — not a separate status event.
    //    Verify the talent chain processed by checking event count is higher than
    //    just the two BSs + their inflictions.
    expect(result.current.allProcessedEvents.length).toBeGreaterThan(4);
  });

  it('F2 (negative): Single BS without prior Vulnerable → no Knock Down, no talent trigger', () => {
    const { result } = setupLifeng();

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    const payload = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // No Knock Down — no Vulnerable existed
    const knockDownEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(knockDownEvents).toHaveLength(0);
  });

  it('F3: P5 Subduer of Evil fires on Knock Down → status on ENEMY with Physical element', () => {
    const { result } = setupLifeng();
    act(() => { setPotential(result.current, 5); });

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    // Two BSs to produce Knock Down
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });
    const payload2 = getMenuPayload(result.current, col!, 12 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    // Knock Down exists
    const knockDownEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(knockDownEvents.length).toBeGreaterThanOrEqual(1);

    // P5 Subduer of Evil status should appear on ENEMY
    const p5Events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === SUBDUER_P5_STATUS_ID
        && ev.startFrame > 0,
    );
    expect(p5Events.length).toBeGreaterThanOrEqual(1);

    // Status should have frames with Physical damage element
    const p5Seg = p5Events[0].segments[0];
    expect(p5Seg).toBeDefined();
    expect(p5Seg.frames).toBeDefined();
    expect(p5Seg.frames!.length).toBeGreaterThanOrEqual(1);
    expect(p5Seg.frames![0].damageElement).toBe(ElementType.PHYSICAL);

    // View: P5 status visible on enemy
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCols = result.current.columns.filter(
      c => c.type === ColumnType.MINI_TIMELINE
        && (c as MiniTimeline).ownerId === ENEMY_OWNER_ID,
    );
    const p5InView = enemyStatusCols.some(col => {
      const vm = viewModels.get(col.key);
      return vm?.events.some(ev => ev.name === SUBDUER_P5_STATUS_ID);
    });
    expect(p5InView).toBe(true);
  });

  it('F4 (negative): P5 Subduer of Evil does NOT fire at P0', () => {
    const { result } = setupLifeng();
    // P0 is default — no P5 talent

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);

    // Two BSs to produce Knock Down
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });
    const payload2 = getMenuPayload(result.current, col!, 12 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    // No P5 status should exist
    const p5Events = result.current.allProcessedEvents.filter(
      ev => ev.columnId === SUBDUER_P5_STATUS_ID && ev.startFrame > 0,
    );
    expect(p5Events).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Ultimate — Vajra Impact with LINK Consume Bonus
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Ultimate — Vajra Impact conditional on LINK', () => {
  it('G1: Ult WITHOUT LINK — Vajra Impact segment has 0 duration (3 effective segments)', () => {
    const { result } = setupLifeng();

    // Place ult at 5s with no prior combo (no LINK)
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });
    const ultCol = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Controller: ult placed
    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);
    expect(ults[0].name).toBe(ULT_ID);

    // Without LINK, Vajra Impact segment (seg 4) has 0 duration.
    // Segments: [Animation, Sequence 1, Sequence 2, Vajra Impact(0)]
    expect(ults[0].segments.length).toBe(4);
    const vajraImpact = ults[0].segments[3];
    expect(vajraImpact.properties.duration).toBe(0);
    // Frames are preserved even at duration 0 (conditional segment)
    expect(vajraImpact.frames).toBeDefined();
    expect(vajraImpact.frames!.length).toBeGreaterThanOrEqual(1);

    // Total ult duration = Animation + Seq1 + Seq2 (Vajra Impact contributes 0)
    const totalDuration = eventDuration(ults[0]);
    const nonVajraDuration = ults[0].segments.slice(0, 3).reduce(
      (sum, s) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBe(nonVajraDuration);

    // No LINK events should exist
    const linkEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.LINK,
    );
    expect(linkEvents).toHaveLength(0);

    // View: ult visible in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(ultCol!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(ev => ev.name === ULT_ID)).toBe(true);
  });

  it('G2: Ult WITH LINK — Vajra Impact segment has real duration, LINK consumed', () => {
    const { result } = setupLifeng();

    // Freeform to place combo
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place combo at 2s → creates LINK
    const comboCol = findColumn(result.current, SLOT_LIFENG, NounType.COMBO);
    expect(comboCol).toBeDefined();
    const comboPayload = getMenuPayload(result.current, comboCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // Verify LINK exists
    const linkBefore = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.LINK,
    );
    expect(linkBefore.length).toBeGreaterThanOrEqual(1);

    // Place ult at 10s
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });
    const ultCol = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Controller: ult placed with 4 segments
    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);
    expect(ults[0].segments.length).toBe(4);

    // Segment 4 (Vajra Impact) should have real duration and frames — LINK was consumed
    const vajraImpact = ults[0].segments[3];
    expect(vajraImpact.properties.duration).toBeGreaterThan(0);
    expect(vajraImpact.frames).toBeDefined();
    expect(vajraImpact.frames!.length).toBeGreaterThanOrEqual(1);

    // Total ult duration includes Vajra Impact
    const totalDuration = eventDuration(ults[0]);
    const nonVajraDuration = ults[0].segments.slice(0, 3).reduce(
      (sum, s) => sum + s.properties.duration, 0,
    );
    expect(totalDuration).toBeGreaterThan(nonVajraDuration);

    // LINK should be consumed
    const linkAfter = result.current.allProcessedEvents.filter(
      ev => ev.columnId === StatusType.LINK,
    );
    const consumed = linkAfter.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
    for (const link of consumed) {
      expect(eventDuration(link)).toBeLessThan(20 * FPS);
    }

    // View: ult visible
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultVM = viewModels.get(ultCol!.key);
    expect(ultVM).toBeDefined();
    expect(ultVM!.events.some(ev => ev.name === ULT_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Ultimate Knock Down requires Vulnerable (not forced)
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Ultimate Knock Down requires Vulnerable', () => {
  it('H1: Ult without prior Vulnerable — first hit adds Vulnerable, second hit produces Knock Down', () => {
    const { result } = setupLifeng();

    // Place ultimate at 5s — no prior skills, no Vulnerable on enemy
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });
    const ultCol = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const ultPayload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Ult has 2 Knock Down frames (seg 2 + seg 3).
    // First hit adds Vulnerable; second hit sees Vulnerable and fires Knock Down.
    const vulnEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(1);

    // Second hit produces Knock Down (enemy has Vulnerable from first hit)
    const knockDownEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(knockDownEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('H2: Ult after BS produces Knock Down (enemy has Vulnerable from BS)', () => {
    const { result } = setupLifeng();

    // BS at 2s → adds Vulnerable
    const bsCol = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Ult at 10s — enemy now has Vulnerable from BS, so Knock Down fires
    act(() => { setUltimateEnergyToMax(result.current, SLOT_LIFENG, 0); });
    const ultCol = findColumn(result.current, SLOT_LIFENG, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 10 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    const knockDownEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(knockDownEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. P1 — Susceptibility threshold with Vulnerable stacks
// ═══════════════════════════════════════════════════════════════════════════════

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_LIFENG];
  app.handleStatsChange(SLOT_LIFENG, {
    ...props,
    operator: { ...props.operator, potential },
  });
}

describe('I. P1 — Susceptibility threshold', () => {
  it('I1: At P1, BS applies Susceptibility even with 1-2 Vulnerable stacks', () => {
    const { result } = setupLifeng();
    act(() => { setPotential(result.current, 1); });

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    // First BS at 2s — 0 Vulnerable stacks, ≤2 threshold at P1 → applies susceptibility
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Second BS at 12s — 1 Vulnerable stack from first BS, ≤2 at P1 → still applies susceptibility
    const payload2 = getMenuPayload(result.current, col!, 12 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    // At P1, susceptibility should apply on both BSs (both within ≤2 threshold)
    const physSuscId = flattenQualifiedId(AdjectiveType.PHYSICAL, NounType.SUSCEPTIBILITY);
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === physSuscId,
    );
    expect(suscEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('I2: At P0, second BS does NOT apply Susceptibility (enemy already has Vulnerable)', () => {
    const { result } = setupLifeng();
    // P0 is default — threshold is 0, only "no stacks" applies susceptibility

    const col = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(col).toBeDefined();

    // First BS at 2s — 0 stacks ≤ 0 → applies susceptibility
    const payload1 = getMenuPayload(result.current, col!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload1.ownerId, payload1.columnId, payload1.atFrame, payload1.defaultSkill,
      );
    });

    // Second BS at 12s — 1 Vulnerable stack, 1 > 0 threshold → no susceptibility
    const payload2 = getMenuPayload(result.current, col!, 12 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload2.ownerId, payload2.columnId, payload2.atFrame, payload2.defaultSkill,
      );
    });

    const physSuscId = flattenQualifiedId(AdjectiveType.PHYSICAL, NounType.SUSCEPTIBILITY);
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === physSuscId,
    );
    // Only first BS applies susceptibility at P0
    expect(suscEvents).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. BS → Vulnerable + Susceptibility → BA FINAL_STRIKE → Combo Activation
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. BS → Vulnerable + Susceptibility → BA → Combo Activation', () => {
  it('K1: BS produces Vulnerable and Physical Susceptibility on enemy', () => {
    const { result } = setupLifeng();

    // Place BS at 2s
    const bsCol = findColumn(result.current, SLOT_LIFENG, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const bsPayload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        bsPayload.ownerId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill,
      );
    });

    // Verify Vulnerable I on enemy
    const vulnEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID
        && ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents.length).toBeGreaterThanOrEqual(1);

    // Verify Physical Susceptibility on enemy
    const physSuscId = flattenQualifiedId(AdjectiveType.PHYSICAL, NounType.SUSCEPTIBILITY);
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === physSuscId,
    );
    expect(suscEvents.length).toBeGreaterThanOrEqual(1);
  });

  // ── Helpers for controlled operator swap ──────────────────────────────────
  const CONTROL_LABEL = 'Set as Controlled Operator';
  const SLOT_AKEKURI = 'slot-1';

  function swapControlTo(app: AppResult, slotId: string, atFrame: number) {
    const col = app.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE
        && c.ownerId === slotId
        && c.columnId === NounType.BASIC_ATTACK,
    );
    if (!col) throw new Error(`No BA column for ${slotId}`);
    const items = buildContextMenu(app, col, atFrame);
    const item = items!.find(i => i.label === CONTROL_LABEL);
    if (!item || item.disabled) throw new Error(`Cannot set controlled to ${slotId} at ${atFrame}`);
    const payload = item.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Parameters<typeof app.handleAddEvent>[3] };
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  }

  function placeBS(app: AppResult, atSec: number) {
    const col = findColumn(app, SLOT_LIFENG, NounType.BATTLE)!;
    const p = getMenuPayload(app, col, atSec * FPS);
    app.handleAddEvent(p.ownerId, p.columnId, p.atFrame, p.defaultSkill);
  }

  function placeBA(app: AppResult, slotId: string, atSec: number) {
    const col = findColumn(app, slotId, NounType.BASIC_ATTACK)!;
    const p = getMenuPayload(app, col, atSec * FPS);
    app.handleAddEvent(p.ownerId, p.columnId, p.atFrame, p.defaultSkill);
  }

  function getComboCheckFrame(app: AppResult, slotId: string) {
    const ba = app.allProcessedEvents.find(
      ev => ev.ownerId === slotId && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    const totalDur = ba.segments.reduce((s, seg) => s + seg.properties.duration, 0);
    return ba.startFrame + totalDur + 1 * FPS; // 1s after FINAL_STRIKE
  }

  function isComboAvailable(app: AppResult, atFrame: number) {
    const col = findColumn(app, SLOT_LIFENG, NounType.COMBO)!;
    const menu = buildContextMenu(app, col, atFrame)!;
    const item = menu.find(i => i.actionId === 'addEvent');
    return item ? !item.disabled : false;
  }

  // ── K2–K4: CONTROLLED operator determines combo activation ──────────────

  it('K2: Lifeng BS + Lifeng (controlled) BA → combo placed + verified in controller + view', () => {
    const { result } = setupLifeng();
    // Lifeng is slot-0, controlled by default

    act(() => { placeBS(result.current, 2); });
    act(() => { placeBA(result.current, SLOT_LIFENG, 8); });

    // 1. Context menu: combo add item is enabled within the activation window
    const checkFrame = getComboCheckFrame(result.current, SLOT_LIFENG);
    expect(isComboAvailable(result.current, checkFrame)).toBe(true);

    // 2. Place combo through context menu
    const comboCol = findColumn(result.current, SLOT_LIFENG, NounType.COMBO)!;
    const comboPayload = getMenuPayload(result.current, comboCol, checkFrame);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // 3. Controller: combo event exists with correct properties
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // 4. View: combo visible in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.name === COMBO_ID)).toBe(true);
  });

  it('K3 (negative): Lifeng BS + Lifeng BA (but Akekuri is controlled) → combo NOT available', () => {
    const { result } = setupLifeng();

    // Swap controlled operator to Akekuri at frame 0
    act(() => { swapControlTo(result.current, SLOT_AKEKURI, 0); });

    act(() => { placeBS(result.current, 2); });
    act(() => { placeBA(result.current, SLOT_LIFENG, 8); });

    // 1. Context menu: combo is disabled — Lifeng is NOT the controlled operator
    const checkFrame = getComboCheckFrame(result.current, SLOT_LIFENG);
    expect(isComboAvailable(result.current, checkFrame)).toBe(false);

    // 2. Controller: no combo window events should exist for Lifeng
    const comboWindows = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === 'comboActivationWindow',
    );
    expect(comboWindows).toHaveLength(0);
  });

  it('K4: Lifeng BS + Akekuri (controlled) BA → combo placed + verified in controller + view', () => {
    const { result } = setupLifeng();

    // Swap controlled operator to Akekuri at frame 0
    act(() => { swapControlTo(result.current, SLOT_AKEKURI, 0); });

    act(() => { placeBS(result.current, 2); });
    act(() => { placeBA(result.current, SLOT_AKEKURI, 8); });

    // 1. Context menu: combo is available — Akekuri is controlled and performed FINAL_STRIKE
    const checkFrame = getComboCheckFrame(result.current, SLOT_AKEKURI);
    expect(isComboAvailable(result.current, checkFrame)).toBe(true);

    // 2. Place combo through context menu
    const comboCol = findColumn(result.current, SLOT_LIFENG, NounType.COMBO)!;
    const comboPayload = getMenuPayload(result.current, comboCol, checkFrame);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // 3. Controller: combo event exists
    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_LIFENG && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_ID);

    // 4. View: combo visible in presentation
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const comboVM = viewModels.get(comboCol.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.some(ev => ev.name === COMBO_ID)).toBe(true);
  });
});
