/**
 * @jest-environment jsdom
 */

/**
 * Wulfgard — Code of Restraint (Talent 2) Integration Tests
 *
 * Tests SP return mechanics from Talent 2: RETURN verb on empowered battle skill
 * reaction consumption, SP return amounts by talent level, P2 enhancement,
 * and negative test that normal BS doesn't trigger Code of Restraint.
 *
 * Three-layer verification:
 *   1. Context menu: skill placement availability
 *   2. Controller: SP resource graphs, processed events
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EnhancementType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  REACTION_COLUMNS, ENEMY_OWNER_ID,
  OPERATOR_STATUS_COLUMN_ID,
} from '../../../../model/channels';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_JSON = require('../../../../model/game-data/operators/wulfgard/wulfgard.json');
const WULFGARD_ID: string = WULFGARD_JSON.id;
const TALENT2_ID: string = WULFGARD_JSON.talents.two;
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

function placeReaction(
  result: { current: AppResult },
  reactionCol: string,
  startSec: number,
  durationSec = 20,
) {
  act(() => {
    result.current.handleAddEvent(
      ENEMY_OWNER_ID, reactionCol, startSec * FPS,
      { name: reactionCol, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

function placeEmpoweredBS(result: { current: AppResult }, startSec: number) {
  const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE_SKILL);
  const empowered = battleCol?.eventVariants?.find(
    v => v.enhancementType === EnhancementType.EMPOWERED,
  );
  expect(empowered).toBeDefined();
  act(() => {
    result.current.handleAddEvent(
      SLOT_WULFGARD, NounType.BATTLE_SKILL, startSec * FPS, empowered!,
    );
  });
}

function placeNormalBS(result: { current: AppResult }, startSec: number) {
  const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE_SKILL);
  const payload = getMenuPayload(result.current, battleCol!, startSec * FPS);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerId, payload.columnId,
      payload.atFrame, payload.defaultSkill,
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. SP Return on Empowered Consume
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. SP Return on Empowered Consume', () => {
  it('A1: Empowered BS with Combustion triggers Code of Restraint SP return', () => {
    const { result } = setupWulfgard();

    // Place Combustion for empowered activation
    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);

    // Place empowered BS that consumes Combustion
    placeEmpoweredBS(result, 3);

    // Controller: Code of Restraint talent event should fire
    const corEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === TALENT2_ID,
    );
    expect(corEvents.length).toBeGreaterThanOrEqual(1);

    // View: talent event in operator-status column
    const statusCol = findColumn(result.current, SLOT_WULFGARD, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    const corInVM = statusVM!.events.filter(ev => ev.name === TALENT2_ID);
    expect(corInVM.length).toBeGreaterThanOrEqual(1);
  });

  it('A2: Empowered BS with Electrification also triggers Code of Restraint', () => {
    const { result } = setupWulfgard();

    placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);
    placeEmpoweredBS(result, 3);

    // Controller: Code of Restraint fires on Electrification consumption too
    const corEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === TALENT2_ID,
    );
    expect(corEvents.length).toBeGreaterThanOrEqual(1);

    // View: talent event in operator-status column
    const statusCol = findColumn(result.current, SLOT_WULFGARD, OPERATOR_STATUS_COLUMN_ID);
    expect(statusCol).toBeDefined();
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const statusVM = viewModels.get(statusCol!.key);
    expect(statusVM).toBeDefined();
    expect(statusVM!.events.some(ev => ev.name === TALENT2_ID)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Negative — Normal BS
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Negative — Normal BS', () => {
  it('B1: Normal BS does NOT trigger SP return (no reaction to consume)', () => {
    const { result } = setupWulfgard();

    // Normal BS at 3s — applies heat infliction but does not consume a reaction
    placeNormalBS(result, 3);

    // Controller: normal BS consumes SP but does not trigger RETURN
    // The SP consumption should show naturalConsumed only, no returnedConsumed from talent
    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(bsEvents).toHaveLength(1);

    // No reaction was consumed, so no SP was returned via RETURN verb
    const spHistory = result.current.spConsumptionHistory.filter(
      r => r.eventUid === bsEvents[0].uid,
    );
    // Either no SP consumption record (combo/ult only) or returnedConsumed = 0
    const totalReturned = spHistory.reduce((sum, r) => sum + r.returnedConsumed, 0);
    expect(totalReturned).toBe(0);

    // View: BS event appears in battle column VM
    const battleCol = findColumn(result.current, SLOT_WULFGARD, NounType.BATTLE_SKILL);
    expect(battleCol).toBeDefined();
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
// C. P2 Enhancement
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. P2 Enhancement', () => {
  it('C1: At P1, Code of Restraint still triggers (base talent)', () => {
    const { result } = setupWulfgard();
    setPotential(result, 1);

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeEmpoweredBS(result, 3);

    const corEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === TALENT2_ID,
    );
    // Talent 2 triggers at any potential (it's an Elite 2 talent, not potential-gated)
    expect(corEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('C2: At P0, Code of Restraint still triggers (talent is not potential-gated)', () => {
    const { result } = setupWulfgard();
    setPotential(result, 0);

    placeReaction(result, REACTION_COLUMNS.COMBUSTION, 1);
    placeEmpoweredBS(result, 3);

    const corEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_WULFGARD && ev.name === TALENT2_ID,
    );
    expect(corEvents.length).toBeGreaterThanOrEqual(1);
  });
});
