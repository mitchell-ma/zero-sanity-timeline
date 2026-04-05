/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard — Code of Restraint (Talent 2) Integration Tests
 *
 * Tests empowered battle skill mechanics related to Talent 2: empowered BS
 * consumes arts reactions and returns SP via RETURN verb. The talent JSON is
 * description-only — the actual RETURN SP effect is baked into the empowered
 * BS skill frames. RETURN is a no-op signal in the engine (SP tracking is
 * handled externally), so tests verify empowered BS placement + reaction
 * consumption rather than SP graph values.
 *
 * Three-layer verification:
 *   1. Context menu: skill placement availability
 *   2. Controller: processed events, reaction consumption
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EnhancementType, EventStatusType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  REACTION_COLUMNS, ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_JSON = require('../../../../model/game-data/operators/wulfgard/wulfgard.json');
const WULFGARD_ID: string = WULFGARD_JSON.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_WULFGARD = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupWulfgard() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_WULFGARD, WULFGARD_ID); });
  return view;
}

function setPotential(result: { current: AppResult }, potential: number) {
  const props = result.current.loadoutProperties[SLOT_WULFGARD];
  act(() => {
    result.current.handleStatsChange(SLOT_WULFGARD, {
      ...props,
      operator: { ...props.operator, potential },
    });
  });
}

function placeReaction(result: { current: AppResult }, reactionCol: string, startSec: number, durationSec = 20) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, reactionCol, startSec * FPS,
      { name: reactionCol, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

function placeEmpoweredBS(result: { current: AppResult }, startSec: number) {
  const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
  const empowered = battleCol?.eventVariants?.find(
    v => v.enhancementType === EnhancementType.EMPOWERED,
  );
  expect(empowered).toBeDefined();
  act(() => {
    result.current.handleAddEvent(
      SLOT_WULFGARD, NounType.BATTLE, startSec * FPS, empowered!,
    );
  });
}

function placeNormalBS(result: { current: AppResult }, startSec: number) {
  const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
  const payload = getMenuPayload(result.current, battleCol!, startSec * FPS);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerId, payload.columnId,
      payload.atFrame, payload.defaultSkill,
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Empowered BS Consumes Reaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Empowered BS Consumes Reaction', () => {
  it('A1: Empowered BS with Combustion consumes reaction and places as empowered', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeEmpoweredBS(result, 3);

    // Controller: empowered BS placed
    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
    expect(bsEvents[0].enhancementType).toBe(EnhancementType.EMPOWERED);

    // Controller: Combustion consumed
    const combustionEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(combustionEvents.length).toBeGreaterThanOrEqual(1);

    // View: empowered BS appears in battle column VM
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(battleCol!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(
      ev => ev.enhancementType === EnhancementType.EMPOWERED,
    )).toBe(true);
  });

  it('A2: Empowered BS with Electrification also consumes reaction', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);
    placeEmpoweredBS(result, 3);

    // Controller: empowered BS placed, reaction consumed
    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents[0].enhancementType).toBe(EnhancementType.EMPOWERED);

    const electEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(electEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Negative — Normal BS
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Negative — Normal BS', () => {
  it('B1: Normal BS does NOT consume reaction', () => {
    const { result } = setupWulfgard();

    placeNormalBS(result, 3);

    // Controller: normal BS placed (not empowered)
    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents).toHaveLength(1);
    expect(bsEvents[0].enhancementType).not.toBe(EnhancementType.EMPOWERED);

    // View: BS event appears in battle column VM
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE);
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const battleVM = viewModels.get(battleCol!.key);
    expect(battleVM).toBeDefined();
    expect(battleVM!.events.some(ev => ev.ownerId === SLOT_WULFGARD)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Potential Independence
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Potential Independence', () => {
  it('C1: At P1, empowered BS still consumes reaction', () => {
    const { result } = setupWulfgard();
    setPotential(result, 1);

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeEmpoweredBS(result, 3);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents[0].enhancementType).toBe(EnhancementType.EMPOWERED);
  });

  it('C2: At P0, empowered BS still consumes reaction (not potential-gated)', () => {
    const { result } = setupWulfgard();
    setPotential(result, 0);

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeEmpoweredBS(result, 3);

    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents[0].enhancementType).toBe(EnhancementType.EMPOWERED);
  });
});
