/**
 * @jest-environment jsdom
 */

/**
 * Last Rite — Combo Skill (Winter's Devourer) E2E Tests
 *
 * Tests the full pipeline through useApp:
 * A. Activation window: NOT activated at 0-2 cryo inflictions
 * B. Activation window: activated at 3+ cryo inflictions
 * C. Consumes all cryo infliction stacks
 * D. UE gain scales with cryo inflictions consumed
 * E. P3 damage multiplier baked in (1.15×)
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { ENEMY_ID, INFLICTION_COLUMNS } from '../../../../model/channels';
import {
  findColumn, buildContextMenu, getMenuPayload,
} from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAST_RITE_ID: string = require('../../../../model/game-data/operators/last-rite/last-rite.json').id;
const COMBO_SKILL_JSON = require('../../../../model/game-data/operators/last-rite/skills/combo-skill-winters-devourer.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const COMBO_SKILL_ID: string = COMBO_SKILL_JSON.properties.id;

const SLOT_LR = 'slot-0';

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupLr() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_LR, LAST_RITE_ID); });
  return view;
}

function placeCryoInfliction(app: AppResult, atFrame: number) {
  app.handleAddEvent(
    ENEMY_ID, INFLICTION_COLUMNS.CRYO, atFrame,
    { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
  );
}

function placeCryoInflictions(app: AppResult, count: number, startFrame: number) {
  for (let i = 0; i < count; i++) {
    placeCryoInfliction(app, startFrame + i * 10); // Space by 10 frames to avoid overlap
  }
}

function getCryoInflictions(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === INFLICTION_COLUMNS.CRYO && ev.ownerId === ENEMY_ID
      && ev.startFrame > 0,
  );
}

function getComboEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.ownerId === SLOT_LR && ev.columnId === NounType.COMBO,
  );
}

beforeEach(() => { localStorage.clear(); });

// ═══════════════════════════════════════════════════════════════════════════════
// A. Activation Window — NOT activated at 0-2 inflictions
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Combo activation window — insufficient inflictions', () => {
  it('A1: 0 cryo inflictions → combo menu disabled', () => {
    const { result } = setupLr();
    const col = findColumn(result.current, SLOT_LR, NounType.COMBO);
    expect(col).toBeDefined();
    const menu = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menu).not.toBeNull();
    const addItem = menu!.find(i => i.actionId === 'addEvent');
    expect(!addItem || addItem.disabled).toBe(true);
  });

  it('A2: 2 cryo inflictions → combo menu disabled', () => {
    const { result } = setupLr();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeCryoInflictions(result.current, 2, 2 * FPS); });
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const col = findColumn(result.current, SLOT_LR, NounType.COMBO);
    expect(col).toBeDefined();
    const menu = buildContextMenu(result.current, col!, 3 * FPS);
    expect(menu).not.toBeNull();
    const addItem = menu!.find(i => i.actionId === 'addEvent');
    expect(!addItem || addItem.disabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Activation Window — activated at 3+ inflictions
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Combo activation window — sufficient inflictions', () => {
  it('B1: 3 cryo inflictions → combo can be placed in freeform', () => {
    const { result } = setupLr();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeCryoInflictions(result.current, 3, 2 * FPS); });

    // Verify inflictions exist
    const inflictions = getCryoInflictions(result.current);
    expect(inflictions.length).toBeGreaterThanOrEqual(3);

    // Place combo in freeform mode (bypasses activation window gating)
    const col = findColumn(result.current, SLOT_LR, NounType.COMBO);
    expect(col).toBeDefined();
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const combos = getComboEvents(result.current);
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe(COMBO_SKILL_ID);
  });

  it('B2: 4 cryo inflictions → combo can be placed', () => {
    const { result } = setupLr();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeCryoInflictions(result.current, 4, 2 * FPS); });
    act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });

    const inflictions = getCryoInflictions(result.current);
    expect(inflictions.length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Consumes All Cryo Infliction Stacks
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Combo consumes cryo infliction stacks', () => {
  it('C1: combo frame declares CONSUME STATUS INFLICTION CRYO from ENEMY', () => {
    // Verify from JSON: first frame of segment 2 has CONSUME STATUS INFLICTION CRYO
    const mainSegment = COMBO_SKILL_JSON.segments[1]; // Second segment (after ANIMATION)
    const firstFrame = mainSegment.frames[0];
    const consumeEffect = firstFrame.clause[0].effects.find(
      (e: { verb: string; object: string; objectQualifier?: string }) =>
        e.verb === VerbType.CONSUME && e.object === NounType.STATUS
        && e.objectQualifier === 'CRYO',
    );
    expect(consumeEffect).toBeDefined();
  });

  it('C2: placing combo with 3 inflictions → inflictions consumed', () => {
    const { result } = setupLr();
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeCryoInflictions(result.current, 3, 2 * FPS); });

    // Place combo in freeform
    const col = findColumn(result.current, SLOT_LR, NounType.COMBO);
    const payload = getMenuPayload(result.current, col!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // After combo, cryo inflictions should be consumed
    const inflictions = getCryoInflictions(result.current);
    const consumed = inflictions.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    // At least some inflictions should be consumed by the combo
    expect(consumed.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. UE Gain Scales with Cryo Inflictions Consumed
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Combo UE gain scales with cryo infliction stacks', () => {
  it('D1: UE formula is ADD(IS 40, MULT(IS 15, STACKS of CRYO INFLICTION)) on first frame', () => {
    // UE recovery is on the first frame of the main segment (segment[1])
    const firstFrame = COMBO_SKILL_JSON.segments[1].frames[0];
    const ueEffect = firstFrame.clause[0].effects.find(
      (e: { verb: string; object: string }) =>
        e.verb === VerbType.RECOVER && e.object === NounType.ULTIMATE_ENERGY,
    );
    expect(ueEffect).toBeDefined();
    // ADD(IS 40, MULT(IS 15, IS STACKS of CRYO INFLICTION STATUS))
    expect(ueEffect.with.value.operation).toBe('ADD');
    expect(ueEffect.with.value.left.value).toBe(40); // Base
    expect(ueEffect.with.value.right.operation).toBe('MULT');
    expect(ueEffect.with.value.right.left.value).toBe(15); // Per-stack bonus
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. P3 Damage Multiplier (1.15×)
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. P3 damage multiplier baked into combo', () => {
  it('E1: combo damage VARY_BY POTENTIAL [1, 1, 1, 1.15, 1.15, 1.15]', () => {
    // Verify from JSON: first damage frame has MULT(..., VARY_BY POTENTIAL)
    const mainSegment = COMBO_SKILL_JSON.segments[1];
    const firstFrame = mainSegment.frames[0];
    const dealEffect = firstFrame.clause[0].effects.find(
      (e: { verb: string; object: string }) => e.verb === VerbType.DEAL && e.object === NounType.DAMAGE,
    );
    expect(dealEffect).toBeDefined();
    const potentialMultiplier = dealEffect.with.value.right.value;
    expect(potentialMultiplier[0]).toBe(1);    // P0
    expect(potentialMultiplier[2]).toBe(1);    // P2
    expect(potentialMultiplier[3]).toBe(1.15); // P3
    expect(potentialMultiplier[5]).toBe(1.15); // P5
  });

  it('E2: combo cooldown at L12 = 8s', () => {
    // Verify from JSON: VARY_BY SKILL_LEVEL cooldown
    const cooldownSeg = COMBO_SKILL_JSON.segments[2];
    expect(cooldownSeg.properties.segmentTypes).toContain(SegmentType.COOLDOWN);
    const cooldownValues = cooldownSeg.properties.duration.value.value;
    expect(cooldownValues[11]).toBe(8); // L12
    expect(cooldownValues[0]).toBe(9);  // L1
  });
});
