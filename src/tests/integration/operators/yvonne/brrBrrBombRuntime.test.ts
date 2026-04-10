/**
 * @jest-environment jsdom
 */

/**
 * Yvonne — Brr-Brr-Bomb β Runtime Behavior Tests
 *
 * Tests the engine's runtime behavior when processing the battle skill
 * against different enemy infliction states:
 *
 *   1. With cryo infliction: Solidification is derived, infliction consumed
 *   2. With nature infliction: same behavior as cryo (Nature branch)
 *   3. With heat infliction (non-relevant): no Solidification, infliction untouched
 *   4. With no infliction: no Solidification
 *   5. Multiple cryo infliction stacks: at least one consumed
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID } from '../../../../model/channels';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const YVONNE_ID: string = require('../../../../model/game-data/operators/yvonne/yvonne.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const BS_START = 5 * FPS;

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, YVONNE_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function addBS(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeInfliction(app: AppResult, columnId: string, atFrame: number, durationSec = 20) {
  app.handleAddEvent(
    ENEMY_ID, columnId, atFrame,
    { name: columnId, segments: [{ properties: { duration: durationSec * FPS } }] },
  );
}

function getSolidifications(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === REACTION_COLUMNS.SOLIDIFICATION && ev.ownerId === ENEMY_ID,
  );
}

function getInflictions(app: AppResult, columnId: string) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === columnId && ev.ownerId === ENEMY_ID,
  );
}

// =============================================================================
// A. Cryo infliction → Solidification + consume
// =============================================================================

describe('A. Cryo infliction triggers Solidification', () => {
  it('A1: with cryo infliction present, BS derives Solidification', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const solidifications = getSolidifications(result.current);
    expect(solidifications.length).toBeGreaterThanOrEqual(1);
  });

  it('A2: cryo infliction is consumed after BS', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const cryos = getInflictions(result.current, INFLICTION_COLUMNS.CRYO);
    expect(cryos.length).toBeGreaterThanOrEqual(1);
    const consumed = cryos.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// B. Nature infliction → Solidification + consume
// =============================================================================

describe('B. Nature infliction triggers Solidification', () => {
  it('B1: with nature infliction present, BS derives Solidification', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const solidifications = getSolidifications(result.current);
    expect(solidifications.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: nature infliction is consumed after BS', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const natures = getInflictions(result.current, INFLICTION_COLUMNS.NATURE);
    expect(natures.length).toBeGreaterThanOrEqual(1);
    const consumed = natures.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// C. Non-relevant infliction (heat) has no effect
// =============================================================================

describe('C. Heat infliction (non-relevant) does not trigger Solidification', () => {
  it('C1: with only heat infliction, BS does NOT derive Solidification', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.HEAT, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const solidifications = getSolidifications(result.current);
    expect(solidifications).toHaveLength(0);
  });

  it('C2: heat infliction is NOT consumed by BS', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.HEAT, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const heats = getInflictions(result.current, INFLICTION_COLUMNS.HEAT);
    expect(heats.length).toBeGreaterThanOrEqual(1);
    const consumed = heats.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(0);
  });
});

// =============================================================================
// D. No infliction → no Solidification
// =============================================================================

describe('D. No infliction does not trigger Solidification', () => {
  it('D1: without any infliction, BS does NOT derive Solidification', () => {
    const { result } = setup();
    act(() => { addBS(result.current, BS_START); });

    const solidifications = getSolidifications(result.current);
    expect(solidifications).toHaveLength(0);
  });
});

// =============================================================================
// D2. Electric infliction (non-relevant) has no effect
// =============================================================================

describe('D2. Electric infliction (non-relevant) does not trigger Solidification', () => {
  it('D2a: with only electric infliction, BS does NOT derive Solidification', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.ELECTRIC, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const solidifications = getSolidifications(result.current);
    expect(solidifications).toHaveLength(0);
  });

  it('D2b: electric infliction is NOT consumed by BS', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.ELECTRIC, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    const electrics = getInflictions(result.current, INFLICTION_COLUMNS.ELECTRIC);
    expect(electrics.length).toBeGreaterThanOrEqual(1);
    const consumed = electrics.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(0);
  });
});

// =============================================================================
// E. Multiple cryo stacks — at least one consumed
// =============================================================================

describe('E. Multiple cryo infliction stacks', () => {
  it('E1: with 3 cryo infliction stacks, at least one is consumed', () => {
    const { result } = setup();
    act(() => {
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 1 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);
    });
    act(() => { addBS(result.current, BS_START); });

    const cryos = getInflictions(result.current, INFLICTION_COLUMNS.CRYO);
    const consumed = cryos.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('E2: with 3 cryo infliction stacks, Solidification is derived', () => {
    const { result } = setup();
    act(() => {
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 1 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 2 * FPS);
      placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 3 * FPS);
    });
    act(() => { addBS(result.current, BS_START); });

    const solidifications = getSolidifications(result.current);
    expect(solidifications.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// F. Barrage of Technology — only applied when BS triggers Solidification
// =============================================================================

describe('F. Barrage of Technology only from BS Solidification', () => {
  function getBarrages(app: AppResult) {
    return app.allProcessedEvents.filter(
      ev => ev.id === 'BARRAGE_OF_TECHNOLOGY' && ev.ownerId === SLOT,
    );
  }

  it('F1: BS + cryo infliction applies Barrage and consumes infliction', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.CRYO, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    expect(getBarrages(result.current).length).toBeGreaterThanOrEqual(1);
    const consumed = getInflictions(result.current, INFLICTION_COLUMNS.CRYO)
      .filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('F2: BS + nature infliction applies Barrage and consumes infliction', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.NATURE, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    expect(getBarrages(result.current).length).toBeGreaterThanOrEqual(1);
    const consumed = getInflictions(result.current, INFLICTION_COLUMNS.NATURE)
      .filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('F3: BS + heat infliction does NOT apply Barrage and does NOT consume infliction', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.HEAT, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    expect(getBarrages(result.current)).toHaveLength(0);
    const consumed = getInflictions(result.current, INFLICTION_COLUMNS.HEAT)
      .filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(0);
  });

  it('F4: BS + electric infliction does NOT apply Barrage and does NOT consume infliction', () => {
    const { result } = setup();
    act(() => { placeInfliction(result.current, INFLICTION_COLUMNS.ELECTRIC, 1 * FPS); });
    act(() => { addBS(result.current, BS_START); });

    expect(getBarrages(result.current)).toHaveLength(0);
    const consumed = getInflictions(result.current, INFLICTION_COLUMNS.ELECTRIC)
      .filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(0);
  });

  it('F5: BS without any infliction does NOT apply Barrage', () => {
    const { result } = setup();
    act(() => { addBS(result.current, BS_START); });

    expect(getBarrages(result.current)).toHaveLength(0);
  });
});
