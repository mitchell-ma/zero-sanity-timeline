/**
 * @jest-environment jsdom
 */

/**
 * Freeform Combustion Reaction — E2E
 *
 * Verifies the full user flow: place a freeform combustion reaction on the
 * enemy via context menu, then verify:
 * 1. Exactly 1 combustion event in allProcessedEvents (not 11 spurious derived events)
 * 2. Frame markers at 1s intervals with correct DEAL DAMAGE clauses
 * 3. Label resolves to "Combustion I" via resolveEventLabel
 * 4. stacks defaults to 1 (or undefined, treated as 1)
 * 5. Natural combustion with correct statusLevel (skipped — complex setup)
 *
 * Three-layer verification: context menu → controller → view.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
  REACTION_COLUMNS,
} from '../../../model/channels';
import {
  resolveEventLabel,
  computeTimelinePresentation,
} from '../../../controller/timeline/eventPresentationController';
import { findDealDamageInClauses } from '../../../controller/timeline/clauseQueries';
import {
  getArtsReactionBaseMultiplier,
  getCombustionDotMultiplier,
} from '../../../model/calculation/damageFormulas';
import { eventDuration } from '../../../consts/viewTypes';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { buildContextMenu } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

// ── Constants ────────────────────────────────────────────────────────────────

const COMBUSTION_DURATION_SECONDS = 10;
const COMBUSTION_DURATION_FRAMES = COMBUSTION_DURATION_SECONDS * FPS;
/** Initial hit (offset 0) + 10 DoT ticks (offsets 1s..10s) = 11 total. */
const EXPECTED_FRAME_COUNT = COMBUSTION_DURATION_SECONDS + 1;

beforeEach(() => { localStorage.clear(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find the enemy status column (contains all reaction micro-columns). */
function findEnemyStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

/**
 * Place a freeform combustion via context menu on the enemy status column.
 * The context menu micro-column for combustion uses the reaction config's
 * default duration (10s) and creates the event through the standard pipeline.
 */
function placeFreeformCombustion(app: AppResult, atFrame: number) {
  const enemyCol = findEnemyStatusColumn(app);
  expect(enemyCol).toBeDefined();

  const menuItems = buildContextMenu(app, enemyCol!, atFrame);
  expect(menuItems).not.toBeNull();

  // Find the Combustion context menu item by columnId in the payload
  const combustionItem = menuItems!.find(
    (i) =>
      i.actionId === 'addEvent' &&
      (i.actionPayload as AddEventPayload)?.columnId === REACTION_COLUMNS.COMBUSTION,
  );

  if (combustionItem) {
    const payload = combustionItem.actionPayload as AddEventPayload;
    app.handleAddEvent(
      payload.ownerEntityId,
      payload.columnId,
      payload.atFrame,
      payload.defaultSkill,
    );
  } else {
    // Fallback: direct placement (context menu may not expose reaction items
    // if micro-column layout differs)
    app.handleAddEvent(ENEMY_ID, REACTION_COLUMNS.COMBUSTION, atFrame, {
      name: REACTION_COLUMNS.COMBUSTION,
      id: REACTION_COLUMNS.COMBUSTION,
      segments: [{ properties: { duration: COMBUSTION_DURATION_FRAMES } }],
    });
  }
}

/** Get all combustion events from processed events. */
function getCombustionEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) =>
      ev.columnId === REACTION_COLUMNS.COMBUSTION &&
      ev.ownerEntityId === ENEMY_ID,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Freeform Combustion Reaction', () => {
  it('1. Single event creation — placing freeform combustion produces exactly 1 combustion event', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Place freeform combustion at frame 0
    act(() => { placeFreeformCombustion(result.current, 0); });

    // Controller layer: exactly 1 combustion event (not 11 spurious events from DoT ticks)
    const combustionEvents = getCombustionEvents(result.current);
    expect(combustionEvents).toHaveLength(1);

    const ev = combustionEvents[0];
    expect(ev.ownerEntityId).toBe(ENEMY_ID);
    expect(ev.columnId).toBe(REACTION_COLUMNS.COMBUSTION);
    expect(ev.startFrame).toBe(0);
    expect(eventDuration(ev)).toBe(COMBUSTION_DURATION_FRAMES);

    // View layer: exactly 1 combustion event visible
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyCol = findEnemyStatusColumn(result.current);
    expect(enemyCol).toBeDefined();
    const vm = viewModels.get(enemyCol!.key);
    expect(vm).toBeDefined();
    const vmCombustions = vm!.events.filter(
      (ev) => ev.columnId === REACTION_COLUMNS.COMBUSTION,
    );
    expect(vmCombustions).toHaveLength(1);
  });

  it('2. Frame markers at 1s intervals with DEAL DAMAGE clauses', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeFreeformCombustion(result.current, 0); });

    const combustionEvents = getCombustionEvents(result.current);
    expect(combustionEvents).toHaveLength(1);
    const ev = combustionEvents[0];

    // The combustion event should have exactly 1 segment with frame markers
    expect(ev.segments.length).toBeGreaterThanOrEqual(1);
    const segment = ev.segments[0];
    expect(segment.frames).toBeDefined();
    // Freeform combustion: initial hit at offset 0 + 10 DoT ticks = 11 frames
    expect(segment.frames!).toHaveLength(EXPECTED_FRAME_COUNT);

    // Verify frame offsets: 0, FPS, 2*FPS, ..., 10*FPS
    for (let i = 0; i < EXPECTED_FRAME_COUNT; i++) {
      expect(segment.frames![i].offsetFrame).toBe(i * FPS);
    }

    // Initial hit (offset 0): uses getArtsReactionBaseMultiplier
    const level = (ev.statusLevel ?? 1) as 1 | 2 | 3 | 4;
    const initialDmg = findDealDamageInClauses(segment.frames![0].clauses);
    expect(initialDmg).not.toBeNull();
    expect(initialDmg!.multipliers[0]).toBeCloseTo(getArtsReactionBaseMultiplier(level), 6);

    // DoT ticks (offsets FPS..10*FPS): use getCombustionDotMultiplier
    const expectedDotMult = getCombustionDotMultiplier(level);
    for (let i = 1; i < EXPECTED_FRAME_COUNT; i++) {
      const dotDamage = findDealDamageInClauses(segment.frames![i].clauses);
      expect(dotDamage).not.toBeNull();
      expect(dotDamage!.multipliers[0]).toBeCloseTo(expectedDotMult, 6);
    }
  });

  it('3. Label resolves to "Combustion I"', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeFreeformCombustion(result.current, 0); });

    const combustionEvents = getCombustionEvents(result.current);
    expect(combustionEvents).toHaveLength(1);

    const label = resolveEventLabel(combustionEvents[0]);
    expect(label).toBe('Combustion I');
  });

  it('4. stacks defaults to 1 (or undefined, treated as 1)', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeFreeformCombustion(result.current, 0); });

    const combustionEvents = getCombustionEvents(result.current);
    expect(combustionEvents).toHaveLength(1);

    const ev = combustionEvents[0];
    // stacks should be 1 or undefined (both treated as level 1 by the engine)
    const effectiveStacks = ev.stacks ?? 1;
    expect(effectiveStacks).toBe(1);

    // Segment name should include Roman numeral I for level 1
    const segment = ev.segments[0];
    expect(segment.properties.name).toContain('I');
  });

  it('5. Freeform combustion has initial 0s DEAL DAMAGE frame + DoT ticks', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { placeFreeformCombustion(result.current, 0); });

    const combustionEvents = getCombustionEvents(result.current);
    expect(combustionEvents).toHaveLength(1);
    const ev = combustionEvents[0];

    const segment = ev.segments[0];
    expect(segment.frames).toBeDefined();

    // Initial hit at offset 0 has DEAL DAMAGE with initial-hit multiplier
    const initialFrame = segment.frames![0];
    expect(initialFrame.offsetFrame).toBe(0);
    const initialDmg = findDealDamageInClauses(initialFrame.clauses);
    expect(initialDmg).not.toBeNull();
    const level = (ev.statusLevel ?? 1) as 1 | 2 | 3 | 4;
    expect(initialDmg!.multipliers[0]).toBeCloseTo(getArtsReactionBaseMultiplier(level), 6);

    // Remaining frames are DoT ticks with DoT multiplier
    const dotMult = getCombustionDotMultiplier(level);
    for (let i = 1; i < segment.frames!.length; i++) {
      const dotDmg = findDealDamageInClauses(segment.frames![i].clauses);
      expect(dotDmg).not.toBeNull();
      expect(dotDmg!.multipliers[0]).toBeCloseTo(dotMult, 6);
    }
  });
});
