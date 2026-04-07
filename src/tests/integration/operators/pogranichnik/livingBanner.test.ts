/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik — The Living Banner (Talent 1) Integration Tests
 *
 * Tests the SP accumulator talent: RECOVER SP → adds stacks to THE_LIVING_BANNER_TALENT.
 * Each APPLY creates a distinct clamped segment carrying the running total.
 * When stacks reach 80 (60 at P3+), consumes stacks and applies FERVENT_MORALE.
 *
 * Verification layers:
 *   1. Controller: no event at start, correct stacks after skills
 *   2. View: correct labels, no block at start
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const POGRANICHNIK_ID: string = require('../../../../model/game-data/operators/pogranichnik/pogranichnik.json').id;
const LIVING_BANNER_ID: string = require('../../../../model/game-data/operators/pogranichnik/talents/talent-the-living-banner-talent.json').properties.id;
const FERVENT_MORALE_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-fervent-morale.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_POG = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupPog() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeBasicAttack(result: { current: ReturnType<typeof useApp> }, atFrame: number) {
  const baCol = findColumn(result.current, SLOT_POG, NounType.BASIC_ATTACK);
  expect(baCol).toBeDefined();
  const payload = getMenuPayload(result.current, baCol!, atFrame);
  act(() => {
    result.current.handleAddEvent(
      payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function getBannerEvents(result: { current: ReturnType<typeof useApp> }) {
  return result.current.allProcessedEvents
    .filter(ev => ev.columnId === LIVING_BANNER_ID && ev.ownerId === SLOT_POG)
    .sort((a, b) => a.startFrame - b.startFrame);
}

/** Sum stacks across all active (non-consumed) Living Banner events — the status total. */
function getBannerStatusTotal(result: { current: ReturnType<typeof useApp> }, frame: number) {
  return result.current.allProcessedEvents
    .filter(ev =>
      ev.columnId === LIVING_BANNER_ID
      && ev.ownerId === SLOT_POG
      && ev.startFrame <= frame
      && frame < ev.startFrame + ev.segments.reduce((s, seg) => s + seg.properties.duration, 0)
      && ev.eventStatus !== EventStatusType.CONSUMED,
    )
    .reduce((sum, ev) => sum + (ev.stacks ?? 0), 0);
}

function getPresentationVM(result: { current: ReturnType<typeof useApp> }) {
  const statusCol = findColumn(result.current, SLOT_POG, OPERATOR_STATUS_COLUMN_ID);
  expect(statusCol).toBeDefined();
  const viewModels = computeTimelinePresentation(
    result.current.allProcessedEvents,
    result.current.columns,
  );
  return viewModels.get(statusCol!.key)!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Living Banner Accumulator
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Living Banner Counter', () => {
  it('A1: no Living Banner event block at the beginning', () => {
    const { result } = setupPog();

    // No Living Banner in processed events (counter talents start at 0)
    expect(getBannerEvents(result)).toHaveLength(0);

    // No Living Banner in presentation view
    const vm = getPresentationVM(result);
    const bannerInView = vm.events.filter(
      ev => ev.columnId === LIVING_BANNER_ID && ev.ownerId === SLOT_POG,
    );
    expect(bannerInView).toHaveLength(0);
  });

  it('A2: basic attack finisher creates Living Banner with 20 stacks', () => {
    const { result } = setupPog();

    placeBasicAttack(result, 2 * FPS);

    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(1);
    expect(bannerEvents[0].stacks).toBe(20);
  });

  it('A3: two basic attacks produce two independent 20-stack events (status total 40)', () => {
    const { result } = setupPog();

    placeBasicAttack(result, 2 * FPS);
    placeBasicAttack(result, 5 * FPS);

    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(2);
    expect(bannerEvents[0].stacks).toBe(20);
    expect(bannerEvents[1].stacks).toBe(20);
    // Status total = sum across active events — sample after both events have started.
    const lastStart = Math.max(...bannerEvents.map(e => e.startFrame));
    expect(getBannerStatusTotal(result, lastStart + 1)).toBe(40);
  });

  it('A4: four basic attacks reach 80 stacks → consume 80, apply Fervent Morale (P0)', () => {
    const { result } = setupPog();

    // 4 basic attacks × 20 SP = 80 stacks → threshold at P0
    placeBasicAttack(result, 2 * FPS);
    placeBasicAttack(result, 5 * FPS);
    placeBasicAttack(result, 8 * FPS);
    placeBasicAttack(result, 11 * FPS);

    // 4 events × 20 stacks = 80 total → all 4 marked CONSUMED, status total drops to 0
    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(4);
    const consumedCount = bannerEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED).length;
    expect(consumedCount).toBe(4);
    // After all consumed, status total should be 0
    const lastFrame = Math.max(...bannerEvents.map(e => e.startFrame)) + 10;
    expect(getBannerStatusTotal(result, lastFrame)).toBe(0);

    // Fervent Morale should be applied
    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerId === SLOT_POG,
    );
    expect(moraleEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('A5: three basic attacks reach 60 stacks → consume 60, apply Fervent Morale (P3)', () => {
    const { result } = setupPog();

    // Set potential to P3 (threshold drops to 60)
    const props = result.current.loadoutProperties[SLOT_POG];
    act(() => { result.current.handleStatsChange(SLOT_POG, { ...props, operator: { ...props.operator, potential: 3 } }); });

    // 3 basic attacks × 20 SP = 60 stacks → threshold at P3
    placeBasicAttack(result, 2 * FPS);
    placeBasicAttack(result, 5 * FPS);
    placeBasicAttack(result, 8 * FPS);

    // 3 events × 20 stacks = 60 total → all 3 marked CONSUMED, status total drops to 0
    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(3);
    const consumedCount = bannerEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED).length;
    expect(consumedCount).toBe(3);
    const lastFrame = Math.max(...bannerEvents.map(e => e.startFrame)) + 10;
    expect(getBannerStatusTotal(result, lastFrame)).toBe(0);

    // Fervent Morale should be applied
    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerId === SLOT_POG,
    );
    expect(moraleEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('A6: Living Banner label is "The Living Banner (Talent) 20" after basic attack', () => {
    const { result } = setupPog();

    placeBasicAttack(result, 2 * FPS);

    const vm = getPresentationVM(result);
    const bannerInView = vm.events.filter(
      ev => ev.columnId === LIVING_BANNER_ID && ev.ownerId === SLOT_POG,
    );
    expect(bannerInView).toHaveLength(1);

    const override = vm.statusOverrides.get(bannerInView[0].uid);
    expect(override).toBeDefined();
    expect(override!.label).toBe('The Living Banner (T1) 20');
  });
});
