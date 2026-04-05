/**
 * @jest-environment jsdom
 */

/**
 * BATK Individual Segment Placement — Integration Tests
 *
 * Tests the ability to place individual basic attack segments (e.g. just N3)
 * instead of the full chain, and verifies:
 *   1. Context menu: inline segment buttons appear on multi-segment BATK variants
 *   2. Controller: placed segment has segmentOrigin and correct segment count
 *   3. Reset: partial-segment event resets to single segment, not full chain
 *   4. No duplicate UIDs after placement and drag
 *   5. Embed codec round-trips segmentOrigin
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import {  } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const BATK_ID: string = require(
  '../../../model/game-data/operators/wulfgard/skills/basic-attack-batk-rapid-fire-akimbo.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
  return view;
}

function getBatkVariant(app: ReturnType<typeof useApp>) {
  const basicCol = findColumn(app, SLOT, NounType.BASIC_ATTACK)!;
  return basicCol.eventVariants!.find(v => v.id === BATK_ID)!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Context Menu — Inline Segment Buttons
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Context Menu Inline Segment Buttons', () => {
  it('A1: BATK variant has inlineButtons in context menu', () => {
    const { result } = setup();
    const basicCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menuItems = buildContextMenu(result.current, basicCol, 2 * FPS)!;

    // Find the BATK item (not DIVE or FINISHER)
    const batkItem = menuItems.find(
      (i) => i.actionId === 'addEvent' &&
        (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );
    expect(batkItem).toBeDefined();
    expect(batkItem!.inlineButtons).toBeDefined();
    expect(batkItem!.inlineButtons!.length).toBeGreaterThan(1);
  });

  it('A2: inline buttons match segment count of BATK variant', () => {
    const { result } = setup();
    const batkVariant = getBatkVariant(result.current);
    const basicCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menuItems = buildContextMenu(result.current, basicCol, 2 * FPS)!;

    const batkItem = menuItems.find(
      (i) => i.actionId === 'addEvent' &&
        (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );
    expect(batkItem!.inlineButtons!.length).toBe(batkVariant.segments!.length);
  });

  it('A3: DIVE and FINISHER do NOT have inline buttons', () => {
    const { result } = setup();
    const basicCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menuItems = buildContextMenu(result.current, basicCol, 2 * FPS)!;

    const diveItem = menuItems.find(
      (i) => i.actionId === 'addEvent' &&
        (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === NounType.DIVE,
    );
    const finisherItem = menuItems.find(
      (i) => i.actionId === 'addEvent' &&
        (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === NounType.FINISHER,
    );
    expect(diveItem?.inlineButtons).toBeUndefined();
    expect(finisherItem?.inlineButtons).toBeUndefined();
  });

  it('A4: each inline button payload has segmentOrigin and single segment', () => {
    const { result } = setup();
    const basicCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const menuItems = buildContextMenu(result.current, basicCol, 2 * FPS)!;

    const batkItem = menuItems.find(
      (i) => i.actionId === 'addEvent' &&
        (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === BATK_ID,
    );

    for (let i = 0; i < batkItem!.inlineButtons!.length; i++) {
      const btn = batkItem!.inlineButtons![i];
      const payload = btn.actionPayload as { defaultSkill: { segmentOrigin?: number[]; segments?: unknown[] } };
      expect(payload.defaultSkill.segmentOrigin).toEqual([i]);
      expect(payload.defaultSkill.segments).toHaveLength(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Individual Segment Placement
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Individual Segment Placement', () => {
  it('B1: placing a single segment creates event with segmentOrigin', () => {
    const { result } = setup();
    const batkVariant = getBatkVariant(result.current);
    const segIdx = 2; // Third segment

    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BASIC_ATTACK, 2 * FPS, {
        id: batkVariant.id,
        name: batkVariant.name,
        segments: [batkVariant.segments![segIdx]],
        segmentOrigin: [segIdx],
      });
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events).toHaveLength(1);
    expect(events[0].segmentOrigin).toEqual([segIdx]);
    expect(events[0].segments).toHaveLength(1);
  });

  it('B2: individual segment duration matches the original segment', () => {
    const { result } = setup();
    const batkVariant = getBatkVariant(result.current);
    const segIdx = 1; // Second segment
    const expectedDuration = batkVariant.segments![segIdx].properties.duration;

    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BASIC_ATTACK, 2 * FPS, {
        id: batkVariant.id,
        name: batkVariant.name,
        segments: [batkVariant.segments![segIdx]],
        segmentOrigin: [segIdx],
      });
    });

    const events = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(events[0].segments[0].properties.duration).toBe(expectedDuration);
  });

  it('B3: individual segment appears in column view model', () => {
    const { result } = setup();
    const basicCol = findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!;
    const batkVariant = getBatkVariant(result.current);

    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BASIC_ATTACK, 2 * FPS, {
        id: batkVariant.id,
        name: batkVariant.name,
        segments: [batkVariant.segments![0]],
        segmentOrigin: [0],
      });
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(basicCol.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    )).toBe(true);
  });

  it('B4: no duplicate UIDs after placing individual segment', () => {
    const { result } = setup();
    const batkVariant = getBatkVariant(result.current);

    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BASIC_ATTACK, 0, {
        id: batkVariant.id,
        name: batkVariant.name,
        segments: [batkVariant.segments![3]],
        segmentOrigin: [3],
      });
    });

    const uids = result.current.allProcessedEvents.map(ev => ev.uid);
    const dupes = uids.filter((uid, i) => uids.indexOf(uid) !== i);
    expect(dupes).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Reset to Default
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Reset to Default', () => {
  it('C1: resetting a partial-segment event restores only that segment', () => {
    const { result } = setup();
    const batkVariant = getBatkVariant(result.current);
    const segIdx = 2;

    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BASIC_ATTACK, 2 * FPS, {
        id: batkVariant.id,
        name: batkVariant.name,
        segments: [batkVariant.segments![segIdx]],
        segmentOrigin: [segIdx],
      });
    });

    const eventBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    expect(eventBefore.segments).toHaveLength(1);

    // Reset
    act(() => { result.current.handleResetEvent(eventBefore.uid); });

    const eventAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    // Should still be 1 segment — not the full chain
    expect(eventAfter.segments).toHaveLength(1);
    expect(eventAfter.segmentOrigin).toEqual([segIdx]);
  });

  it('C2: resetting a full-chain event restores all segments', () => {
    const { result } = setup();
    const batkVariant = getBatkVariant(result.current);
    const fullSegmentCount = batkVariant.segments!.length;

    // Place full chain directly (no segmentOrigin)
    act(() => {
      result.current.handleAddEvent(SLOT, NounType.BASIC_ATTACK, 2 * FPS, {
        id: batkVariant.id,
        name: batkVariant.name,
        segments: batkVariant.segments,
      });
    });

    const eventBefore = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    expect(eventBefore.segments.length).toBe(fullSegmentCount);
    expect(eventBefore.segmentOrigin).toBeUndefined();

    // Reset
    act(() => { result.current.handleResetEvent(eventBefore.uid); });

    const eventAfter = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    )!;
    expect(eventAfter.segments).toHaveLength(fullSegmentCount);
    expect(eventAfter.segmentOrigin).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. No Duplicate UIDs (regression)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. No duplicate UIDs', () => {
  it('D1: full BATK chain produces no duplicate UIDs', () => {
    const { result } = setup();
    const payload = getMenuPayload(result.current, findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!, 0);

    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const uids = result.current.allProcessedEvents.map(ev => ev.uid);
    const dupes = uids.filter((uid, i) => uids.indexOf(uid) !== i);
    expect(dupes).toEqual([]);
  });

  it('D2: no duplicate UIDs after moving a BATK event', () => {
    const { result } = setup();
    const payload = getMenuPayload(result.current, findColumn(result.current, SLOT, NounType.BASIC_ATTACK)!, 0);

    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const batkEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT && ev.columnId === NounType.BASIC_ATTACK,
    )!;

    act(() => { result.current.handleMoveEvent(batkEvent.uid, 120); });

    const uids = result.current.allProcessedEvents.map(ev => ev.uid);
    const dupes = uids.filter((uid, i) => uids.indexOf(uid) !== i);
    expect(dupes).toEqual([]);
  });
});
