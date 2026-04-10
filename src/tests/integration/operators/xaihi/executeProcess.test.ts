/**
 * @jest-environment jsdom
 */

/**
 * Xaihi Execute Process (Cryo Fragility) — Integration Tests
 *
 * Execute Process is baked into the combo skill frame: when Stress Testing hits,
 * it applies CRYO_FRAGILITY to the enemy (gated by VARY_BY TALENT_LEVEL).
 *
 * Three-layer verification: context menu → controller → view.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../../model/channels';
import { ColumnType, EventStatusType } from '../../../../consts/enums';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XAIHI_JSON = require('../../../../model/game-data/operators/xaihi/xaihi.json');
const XAIHI_ID: string = XAIHI_JSON.id;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CRYO_FRAGILITY_ID: string = require(
  '../../../../model/game-data/generic/statuses/status-cryo-fragility.json',
).properties.id;

const SLOT_XAIHI = 'slot-2';
const SLOT_CONTROLLED = 'slot-0';

function setupXaihiWithCombo() {
  // Xaihi in slot-2, place BS → 2 BAs to consume AC → combo window opens → place combo
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_XAIHI, XAIHI_ID); });

  // BS at 2s → AC on controlled (slot-0)
  const bsCol = findColumn(view.result.current, SLOT_XAIHI, NounType.BATTLE);
  const bsPayload = getMenuPayload(view.result.current, bsCol!, 2 * FPS);
  act(() => { view.result.current.handleAddEvent(bsPayload.ownerEntityId, bsPayload.columnId, bsPayload.atFrame, bsPayload.defaultSkill); });

  // 2 BAs on slot-0 to consume both AC stacks → combo window
  const baCol = findColumn(view.result.current, SLOT_CONTROLLED, NounType.BASIC_ATTACK);
  const ba1 = getMenuPayload(view.result.current, baCol!, 5 * FPS);
  act(() => { view.result.current.handleAddEvent(ba1.ownerEntityId, ba1.columnId, ba1.atFrame, ba1.defaultSkill); });
  const ba2 = getMenuPayload(view.result.current, baCol!, 10 * FPS);
  act(() => { view.result.current.handleAddEvent(ba2.ownerEntityId, ba2.columnId, ba2.atFrame, ba2.defaultSkill); });

  // Place combo in the window
  const comboCol = findColumn(view.result.current, SLOT_XAIHI, NounType.COMBO);
  const lastConsumed = Math.max(
    ...view.result.current.allProcessedEvents
      .filter(ev => ev.name === 'AUXILIARY_CRYSTAL' && ev.eventStatus === EventStatusType.CONSUMED)
      .map(ev => ev.startFrame + ev.segments.reduce((s: number, seg: { properties: { duration: number } }) => s + seg.properties.duration, 0)),
  );
  const comboPayload = getMenuPayload(view.result.current, comboCol!, lastConsumed + 1 * FPS);
  act(() => { view.result.current.handleAddEvent(comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill); });

  return view;
}

// ═══════════════════════════════════════════════════════════════════════════════
// F. Execute Process — Cryo Fragility from Combo Skill
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. Execute Process — Cryo Fragility', () => {
  it('F1: Combo skill applies CRYO_FRAGILITY to enemy (talent baked into frame)', () => {
    const { result } = setupXaihiWithCombo();

    // ── Controller layer: combo event exists ──
    const comboEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT_XAIHI && ev.columnId === NounType.COMBO,
    );
    expect(comboEvents).toHaveLength(1);

    // ── Controller layer: CRYO_FRAGILITY on enemy ──
    const fragilityEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === CRYO_FRAGILITY_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(fragilityEvents.length).toBeGreaterThanOrEqual(1);
    // Should have statusValue (fragility percentage)
    expect(fragilityEvents[0].statusValue).toBeDefined();
    expect(fragilityEvents[0].statusValue as number).toBeGreaterThan(0);
    // Duration 5s
    const fragDuration = fragilityEvents[0].segments.reduce(
      (sum: number, s: { properties: { duration: number } }) => sum + s.properties.duration, 0,
    );
    expect(fragDuration).toBe(5 * FPS);

    // ── View layer: fragility visible in enemy status column ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyStatusCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerEntityId === ENEMY_ID &&
        c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
    );
    expect(enemyStatusCol).toBeDefined();
    const enemyVM = viewModels.get(enemyStatusCol!.key);
    expect(enemyVM).toBeDefined();
    const fragInVM = enemyVM!.events.filter(ev => ev.name === CRYO_FRAGILITY_ID);
    expect(fragInVM.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Negative Case
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Negative Case', () => {
  it('H1: No CRYO_FRAGILITY without combo skill placed', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT_XAIHI, XAIHI_ID); });

    const fragEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === CRYO_FRAGILITY_ID && ev.startFrame > 0,
    );
    expect(fragEvents).toHaveLength(0);
  });
});
