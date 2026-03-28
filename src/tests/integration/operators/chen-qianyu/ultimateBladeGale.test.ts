/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Blade Gale Ultimate Integration Tests
 *
 * Tests the full pipeline for Chen Qianyu's ultimate skill (Blade Gale):
 * - Column availability and context menu
 * - TIME_STOP animation segment
 * - 7 damage frames in the active segment
 * - Energy cost derived from game data (CONSUME ULTIMATE_ENERGY with VARY_BY POTENTIAL)
 *
 * Verification layers:
 *   Context menu: getMenuPayload succeeds (ultimate is available and enabled)
 *   Controller: allProcessedEvents contains the ultimate event with correct segments/frames
 *   View: computeTimelinePresentation column view models
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType, SegmentType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { getAnimationDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { computeTimeStopRegions } from '../../../../controller/timeline/eventValidator';
import { buildMergedOperatorJson, getUltimateEnergyCost } from '../../../../controller/gameDataStore';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

/** Swap Chen Qianyu into slot-0 and switch to freeform mode. */
function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

/** Place an ultimate event at the given frame and return the app state. */
function placeUltimate(app: AppResult, atFrame: number) {
  const ultCol = findColumn(app, SLOT_CHEN, NounType.ULTIMATE);
  if (!ultCol) throw new Error('Ultimate column not found for Chen Qianyu');
  const payload = getMenuPayload(app, ultCol, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

describe('Chen Qianyu — Blade Gale ultimate', () => {
  it('ultimate is available on the ultimate column', () => {
    const { result } = setupChen();

    // Column exists and has a defaultEvent
    const ultCol = findColumn(result.current, SLOT_CHEN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    expect(ultCol!.defaultEvent).toBeDefined();

    // Context menu has an enabled addEvent item
    const menuItems = buildContextMenu(result.current, ultCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();
    const addItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBeFalsy();
  });

  it('ultimate has TIME_STOP animation segment', () => {
    const { result } = setupChen();

    placeUltimate(result.current, 2 * FPS);

    // Find the ultimate event in processed events
    const ultEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvent).toBeDefined();

    // Check that the event has an ANIMATION segment
    const animSeg = ultEvent!.segments.find(
      s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();

    // Verify animation duration is approximately 1.63s in frames
    const expectedAnimFrames = Math.round(1.63 * FPS);
    expect(animSeg!.properties.duration).toBeCloseTo(expectedAnimFrames, 0);

    // Verify the animation duration helper agrees
    const animDuration = getAnimationDuration(ultEvent!);
    expect(animDuration).toBe(animSeg!.properties.duration);

    // Verify the ultimate creates a time-stop region (ultimates with animation are TIME_STOP)
    const timeStopRegions = computeTimeStopRegions(result.current.allProcessedEvents);
    const ultStop = timeStopRegions.find(
      r => r.ownerId === SLOT_CHEN && r.sourceColumnId === NounType.ULTIMATE,
    );
    expect(ultStop).toBeDefined();
    expect(ultStop!.startFrame).toBe(ultEvent!.startFrame);
    expect(ultStop!.durationFrames).toBe(animDuration);
  });

  it('ultimate produces 7 damage frames in the active segment', () => {
    const { result } = setupChen();

    placeUltimate(result.current, 2 * FPS);

    const ultEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvent).toBeDefined();

    // The active (non-animation) segment should contain 7 frames
    const activeSegments = ultEvent!.segments.filter(
      s => !s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(activeSegments.length).toBeGreaterThanOrEqual(1);

    const allFrames = activeSegments.flatMap(
      (s: { frames?: unknown[] }) => s.frames ?? [],
    );
    expect(allFrames).toHaveLength(7);

    // Verify active segment duration is approximately 2.1s in frames
    const activeSeg = activeSegments[0];
    const expectedActiveFrames = Math.round(2.1 * FPS);
    expect(activeSeg.properties.duration).toBeCloseTo(expectedActiveFrames, 0);

    // View layer: event appears in the ultimate column view model
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const ultCol = findColumn(result.current, SLOT_CHEN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const vm = viewModels.get(ultCol!.key);
    expect(vm).toBeDefined();
    expect(vm!.events.some(ev => ev.uid === ultEvent!.uid)).toBe(true);
  });

  it('ultimate energy cost derives from game data', () => {
    const { result } = setupChen();

    // Derive expected cost from game data (base cost without potential context)
    const mergedJson = buildMergedOperatorJson(CHEN_QIANYU_ID);
    expect(mergedJson).toBeDefined();
    const baseCost = getUltimateEnergyCost(mergedJson!);
    expect(baseCost).toBeGreaterThan(0);

    // Verify the column exists and has a defaultEvent
    const ultCol = findColumn(result.current, SLOT_CHEN, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    expect(ultCol!.defaultEvent).toBeDefined();

    // Place the ultimate and verify it was added successfully
    placeUltimate(result.current, 2 * FPS);

    const ultEvent = result.current.allProcessedEvents.find(
      ev => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvent).toBeDefined();

    // The base cost from JSON (without potential context) should be 70
    // With P5 default for 5-star operators, the VARY_BY POTENTIAL multiplier is 0.85
    // giving an effective cost of 59.5 — but the base extraction without context returns 70
    expect(baseCost).toBe(70);
  });
});
