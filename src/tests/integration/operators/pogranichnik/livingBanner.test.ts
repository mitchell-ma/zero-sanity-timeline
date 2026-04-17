/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik — The Living Banner (Talent 1) Integration Tests
 *
 * Tests the SP accumulator talent: RECOVER SP → adds stacks to THE_LIVING_BANNER_TALENT.
 * Each APPLY stacks=N dispatches N underlying events (one per stack).
 * When the total active stack count reaches 80 (60 at P3+), consumes 80
 * stacks and applies FERVENT_MORALE.
 *
 * Verification layers:
 *   1. Controller: no event at start, correct stack counts after skills
 *   2. View: clamped-to-last-event label carries the running total
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
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

function getBannerEvents(result: { current: ReturnType<typeof useApp> }) {
  return result.current.allProcessedEvents
    .filter(ev => ev.columnId === LIVING_BANNER_ID && ev.ownerEntityId === SLOT_POG)
    .sort((a, b) => a.startFrame - b.startFrame);
}

/** Count active (non-consumed) Living Banner events — each event = 1 stack. */
function getBannerStatusTotal(result: { current: ReturnType<typeof useApp> }, frame: number) {
  return result.current.allProcessedEvents
    .filter(ev =>
      ev.columnId === LIVING_BANNER_ID
      && ev.ownerEntityId === SLOT_POG
      && ev.startFrame <= frame
      && frame < ev.startFrame + ev.segments.reduce((s, seg) => s + seg.properties.duration, 0)
      && ev.eventStatus !== EventStatusType.CONSUMED,
    ).length;
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
      ev => ev.columnId === LIVING_BANNER_ID && ev.ownerEntityId === SLOT_POG,
    );
    expect(bannerInView).toHaveLength(0);
  });

  it('A2: basic attack finisher creates 20 Living Banner events (one per stack)', () => {
    const { result } = setupPog();

    placeBasicAttack(result, 2 * FPS);

    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(20);
    // One BA → one batch, all events at the same start frame.
    const startFrames = new Set(bannerEvents.map(ev => ev.startFrame));
    expect(startFrames.size).toBe(1);
  });

  it('A3: two basic attacks produce two 20-stack batches (status total 40)', () => {
    const { result } = setupPog();

    placeBasicAttack(result, 2 * FPS);
    placeBasicAttack(result, 5 * FPS);

    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(40);
    // Two batches at two distinct start frames, 20 events each.
    const countsByFrame = new Map<number, number>();
    for (const ev of bannerEvents) {
      countsByFrame.set(ev.startFrame, (countsByFrame.get(ev.startFrame) ?? 0) + 1);
    }
    expect(Array.from(countsByFrame.values()).sort()).toEqual([20, 20]);
    // Status total = active events — sample after both batches have started.
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

    // 4 batches × 20 = 80 events → all marked CONSUMED, status total drops to 0
    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(80);
    const consumedCount = bannerEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED).length;
    expect(consumedCount).toBe(80);
    const lastFrame = Math.max(...bannerEvents.map(e => e.startFrame)) + 10;
    expect(getBannerStatusTotal(result, lastFrame)).toBe(0);

    // Fervent Morale should be applied
    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
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

    // 3 batches × 20 = 60 events → all marked CONSUMED, status total drops to 0
    const bannerEvents = getBannerEvents(result);
    expect(bannerEvents).toHaveLength(60);
    const consumedCount = bannerEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED).length;
    expect(consumedCount).toBe(60);
    const lastFrame = Math.max(...bannerEvents.map(e => e.startFrame)) + 10;
    expect(getBannerStatusTotal(result, lastFrame)).toBe(0);

    // Fervent Morale should be applied
    const moraleEvents = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FERVENT_MORALE_ID && ev.ownerEntityId === SLOT_POG,
    );
    expect(moraleEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('A6: Living Banner last-event label reflects the position count after basic attack', () => {
    const { result } = setupPog();

    placeBasicAttack(result, 2 * FPS);

    const vm = getPresentationVM(result);
    const bannerInView = vm.events.filter(
      ev => ev.columnId === LIVING_BANNER_ID && ev.ownerEntityId === SLOT_POG,
    ).sort((a, b) => a.startFrame - b.startFrame || a.uid.localeCompare(b.uid));
    expect(bannerInView).toHaveLength(20);

    // The last event (position 20) carries the running-total label.
    const lastEv = bannerInView[bannerInView.length - 1];
    const override = vm.statusOverrides.get(lastEv.uid);
    expect(override).toBeDefined();
    expect(override!.label).toBe('The Living Banner (T1) 20');
  });

  it('A7: post-consume batch labels restart from 1 (consumed events drop out of the running total)', () => {
    const { result } = setupPog();

    // 5 BAs — the 4th hits 80 stacks → consumes 80, applies Fervent Morale.
    // The 5th BA adds 20 more events that should label 1..20, NOT 81..100.
    placeBasicAttack(result, 2 * FPS);
    placeBasicAttack(result, 5 * FPS);
    placeBasicAttack(result, 8 * FPS);
    placeBasicAttack(result, 11 * FPS);
    placeBasicAttack(result, 14 * FPS);

    const bannerEvents = getBannerEvents(result);
    const consumed = bannerEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    const active = bannerEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(80);
    expect(active).toHaveLength(20);

    const vm = getPresentationVM(result);
    const activeInView = vm.events
      .filter(ev => ev.columnId === LIVING_BANNER_ID
        && ev.ownerEntityId === SLOT_POG
        && ev.eventStatus !== EventStatusType.CONSUMED)
      .sort((a, b) => a.startFrame - b.startFrame || a.uid.localeCompare(b.uid));
    expect(activeInView).toHaveLength(20);

    // Last surviving event is the 20th of the post-consume batch.
    const lastActive = activeInView[activeInView.length - 1];
    const override = vm.statusOverrides.get(lastActive.uid);
    expect(override).toBeDefined();
    expect(override!.label).toBe('The Living Banner (T1) 20');
  });

  it('A8: mixed-skill rotation that overshoots threshold labels by position, not pool-at-consume count', () => {
    // Repro for the reported bug: a mixed BA+combo rotation hits 81 stacks at
    // consume time. `consumeWithRestack` stamps `ev.stacks = 81` on every
    // consumed event, so the old view labeled all 80 consumed bars "81".
    // Correct behavior: ignore the pool-count stamp for NONE accumulators and
    // label by running-total position (20, 40, 60, etc.).
    const { result } = setupPog();
    placeBasicAttack(result, 2 * FPS);
    placeBasicAttack(result, 5 * FPS);
    function placeCombo(atFrame: number) {
      const col = findColumn(result.current, SLOT_POG, NounType.COMBO);
      expect(col).toBeDefined();
      const payload = getMenuPayload(result.current, col!, atFrame);
      act(() => {
        result.current.handleAddEvent(
          payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
        );
      });
    }
    placeCombo(8 * FPS);
    placeCombo(15 * FPS);

    const banner = getBannerEvents(result);
    const consumed = banner.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    // Consume fired — there were more than 80 active stacks at that moment.
    expect(consumed.length).toBeGreaterThanOrEqual(80);

    const vm = getPresentationVM(result);
    const labels = banner.map(ev => vm.statusOverrides.get(ev.uid)?.label).filter((l): l is string => !!l);
    // Labels should be unique running-total positions, not many duplicates
    // echoing the pool-at-consume count. Pre-fix: 80 consumed events all
    // labeled the same "81". Post-fix: labels form a monotonic 1..N sequence,
    // so no single number repeats more than a handful of times.
    const counts = new Map<string, number>();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    const mostCommon = Math.max(...Array.from(counts.values()));
    expect(mostCommon).toBeLessThan(10);
  });
});
