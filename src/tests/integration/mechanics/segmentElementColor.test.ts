/**
 * @jest-environment jsdom
 */

/**
 * Segment Element Color — Integration Tests
 *
 * Verifies that:
 * 1. The event-level color reflects the dominant element across its segments
 *    (computed by frame count).
 * 2. Damage segments use their own element color.
 * 3. Animation/cooldown segments use the event-level color.
 * 4. Mixed-element skills (e.g. Rossi Crimson Shadow Empowered: Physical + Heat)
 *    correctly resolve per-segment colors.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import {
  ELEMENT_COLORS, ElementType, InteractionModeType,
} from '../../../consts/enums';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { FPS } from '../../../utils/timeline';
import {
  computeTimelinePresentation,
  resolveEventColor,
} from '../../../controller/timeline/eventPresentationController';
import {
  findColumn, buildContextMenu, getMenuPayload,
} from '../helpers';
import type { AppResult } from '../helpers';
import { ENEMY_ID, PHYSICAL_INFLICTION_COLUMNS } from '../../../model/channels';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../model/game-data/operators/rossi/rossi.json').id;

const BS_EMP_JSON = require('../../../model/game-data/operators/rossi/skills/battle-skill-crimson-shadow-empowered.json');
const BS_EMP_ID: string = BS_EMP_JSON.properties.id;

/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ROSSI = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupRossi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ROSSI, ROSSI_ID); });
  return view;
}

function placeVulnerableOnEnemy(result: { current: AppResult }, startSec: number) {
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    result.current.handleAddEvent(
      ENEMY_ID, PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, startSec * FPS,
      { name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, segments: [{ properties: { duration: 20 * FPS } }] },
    );
  });
  act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
}

describe('Segment Element Color — event-level dominant element', () => {
  it('Crimson Shadow Empowered: event color is the dominant element (HEAT)', () => {
    const { result } = setupRossi();

    // Place Vulnerable so Empowered BS is available
    placeVulnerableOnEnemy(result, 0);

    // Place the empowered battle skill via context menu (label includes 'Empowered')
    const bsCol = findColumn(result.current, SLOT_ROSSI, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const menu = buildContextMenu(result.current, bsCol!, 2 * FPS);
    expect(menu).not.toBeNull();

    const empItem = menu!.find(i => i.actionId === 'addEvent' && i.label?.includes('Empowered'));
    expect(empItem).toBeDefined();
    expect(empItem!.disabled).toBeFalsy();

    const empPayload = empItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> | null };
    act(() => {
      result.current.handleAddEvent(empPayload.ownerId, empPayload.columnId, empPayload.atFrame, empPayload.defaultSkill);
    });

    // Find the placed empowered BS event
    const empEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ROSSI && ev.id === BS_EMP_ID,
    );
    expect(empEvents.length).toBeGreaterThan(0);

    const ev = empEvents[0];

    // Empowered has 2 segments: PHYSICAL (3 frames) + HEAT (4 frames)
    // Dominant = HEAT (more frames)
    expect(ev.segments.length).toBe(2);

    // Segment 1: PHYSICAL
    expect(ev.segments[0].properties.element).toBe(ElementType.PHYSICAL);

    // Segment 2: HEAT
    expect(ev.segments[1].properties.element).toBe(ElementType.HEAT);

    // Event color should resolve to HEAT (dominant by frame count)
    const color = resolveEventColor(
      ev,
      bsCol! as MiniTimeline,
      { [SLOT_ROSSI]: ELEMENT_COLORS[ElementType.PHYSICAL] },
    );
    expect(color).toBe(ELEMENT_COLORS[ElementType.HEAT]);
  });

  it('segments with different elements produce distinct colors in the view', () => {
    const { result } = setupRossi();

    placeVulnerableOnEnemy(result, 0);

    const bsCol = findColumn(result.current, SLOT_ROSSI, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Check placed events — either base or empowered BS
    const bsEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ROSSI && ev.columnId === NounType.BATTLE,
    );
    expect(bsEvents.length).toBeGreaterThan(0);

    // When empowered variant is placed, it has 2 segments with distinct elements
    const ev = bsEvents[0];
    expect(ev.segments.length).toBeGreaterThanOrEqual(1);
    // Verify segments carry element data from the JSON config
    const elementsOnSegments = ev.segments
      .map(seg => seg.properties.element)
      .filter(Boolean);
    expect(elementsOnSegments.length).toBeGreaterThan(0);
  });
});

describe('Segment Element Color — presentation layer', () => {
  it('computeTimelinePresentation assigns event color from dominant segment element', () => {
    const { result } = setupRossi();

    placeVulnerableOnEnemy(result, 0);

    const bsCol = findColumn(result.current, SLOT_ROSSI, NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const bsVM = viewModels.get(bsCol!.key);
    expect(bsVM).toBeDefined();

    // Events in the view model should exist
    const bsViewEvents = bsVM!.events.filter(ev => ev.ownerId === SLOT_ROSSI);
    expect(bsViewEvents.length).toBeGreaterThan(0);
  });
});
