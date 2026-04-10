/**
 * @jest-environment jsdom
 */

/**
 * Perlica — Obliteration Protocol Talent (STAGGER_FRAILTY stat-based trigger)
 *
 * Tests that Perlica's T1 talent triggers via HAVE STAGGER_FRAILTY when enemy
 * stagger events are placed, matching the Fluorite SLOW detection pattern:
 * 1. No talent without stagger events
 * 2. Freeform node stagger → talent appears at stagger start, consumed at stagger end
 * 3. Freeform full stagger → same behavior
 * 4. Multiple overlapping staggers → talent persists until all end
 * 5. STAGGER_DAMAGE_BONUS stat applied during talent active window
 *
 * Three-layer verification:
 *   1. Controller: processed events, timing, duration
 *   2. Stat accumulator: STAGGER_FRAILTY and STAGGER_DAMAGE_BONUS values
 *   3. View: computeTimelinePresentation column state
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { CritMode, InteractionModeType } from '../../../../consts/enums';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import {
  ENEMY_ID,
  NODE_STAGGER_COLUMN_ID,
  FULL_STAGGER_COLUMN_ID,
} from '../../../../model/channels';
import {
  findColumn,
} from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const PERLICA_JSON = require('../../../../model/game-data/operators/perlica/perlica.json');
const PERLICA_ID: string = PERLICA_JSON.id;
const TALENT_ID: string = PERLICA_JSON.talents.one;
const CYCLE_PROTOCOL_ID: string = require(
  '../../../../model/game-data/operators/perlica/talents/talent-cycle-protocol-talent.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_PERLICA = 'slot-0';

type AppResult = ReturnType<typeof useApp>;

beforeEach(() => {
  localStorage.clear();
});

function setupPerlica() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => { view.result.current.handleSwapOperator(SLOT_PERLICA, PERLICA_ID); });
  return view;
}

function placeStagger(app: AppResult, columnId: string, atFrame: number, durationFrames: number) {
  app.handleAddEvent(
    ENEMY_ID, columnId, atFrame,
    { name: columnId, segments: [{ properties: { duration: durationFrames } }] },
  );
}

function getTalentEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.ownerId === SLOT_PERLICA && ev.name === TALENT_ID,
  );
}

// =============================================================================
// A. No talent without stagger
// =============================================================================

// =============================================================================
// Z. Diagnostic: check actual durations
// =============================================================================

describe('A0. Multi-operator team — talent still matches stagger', () => {
  it('A0a: With Fluorite in team, talent matches full stagger exactly', () => {
    const { result } = setupPerlica();
    act(() => { result.current.handleSwapOperator('slot-1', 'FLUORITE'); });

    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 6 * FPS); });

    const allTalents = result.current.allProcessedEvents.filter(
      ev => ev.name === TALENT_ID || ev.id === TALENT_ID,
    );
    expect(allTalents).toHaveLength(1);
    expect(allTalents[0].startFrame).toBe(5 * FPS);
    expect(eventDuration(allTalents[0])).toBe(6 * FPS);

    // View layer must agree
    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].duration).toBe(6 * FPS);
  });
});

describe('A. No stagger = no talent', () => {
  it('A1: No talent events exist when no stagger is placed', () => {
    const { result } = setupPerlica();
    expect(getTalentEvents(result.current)).toHaveLength(0);
  });

  it('A2: Cycle Protocol (T2) is description-only and never appears on timeline', () => {
    const { result } = setupPerlica();

    // No Cycle Protocol events at any point — not even as a presence event
    const cycleEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === CYCLE_PROTOCOL_ID,
    );
    expect(cycleEvents).toHaveLength(0);
  });
});

// =============================================================================
// B. Node stagger triggers talent
// =============================================================================

describe('B. Node stagger triggers talent via STAGGER_FRAILTY', () => {
  it('B1: Talent appears at stagger start and is consumed at stagger end', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 4 * FPS); });

    const talents = getTalentEvents(result.current);
    expect(talents.length).toBeGreaterThanOrEqual(1);

    // Talent starts at stagger start
    expect(talents[0].startFrame).toBe(4 * FPS);

    // Talent ends at stagger end (consumed by HAVE NOT STAGGER_FRAILTY)
    const talentEnd = talents[0].startFrame + eventDuration(talents[0]);
    expect(talentEnd).toBe(8 * FPS);
  });

  it('B2: Talent not active before or after stagger window', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 4 * FPS); });

    const talents = getTalentEvents(result.current);
    const outsideTalents = talents.filter(
      ev => ev.startFrame < 4 * FPS || ev.startFrame + eventDuration(ev) > 8 * FPS,
    );
    expect(outsideTalents).toHaveLength(0);
  });

  it('B3: View layer shows talent during stagger only', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 4 * FPS); });

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );

    const viewTalents: { startFrame: number; endFrame: number }[] = [];
    viewModels.forEach(vm => {
      for (const ev of vm.events) {
        if (ev.name === TALENT_ID && ev.ownerId === SLOT_PERLICA) {
          viewTalents.push({ startFrame: ev.startFrame, endFrame: ev.startFrame + eventDuration(ev) });
        }
      }
    });
    expect(viewTalents.length).toBeGreaterThanOrEqual(1);
    expect(viewTalents[0].startFrame).toBe(4 * FPS);
    expect(viewTalents[0].endFrame).toBe(8 * FPS);
  });
});

// =============================================================================
// C. Full stagger triggers talent
// =============================================================================

describe('C. Full stagger triggers talent via STAGGER_FRAILTY', () => {
  it('C1: Full stagger also triggers talent with matching duration', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 10 * FPS, 5 * FPS); });

    const talents = getTalentEvents(result.current);
    expect(talents.length).toBeGreaterThanOrEqual(1);

    expect(talents[0].startFrame).toBe(10 * FPS);
    const talentEnd = talents[0].startFrame + eventDuration(talents[0]);
    expect(talentEnd).toBe(15 * FPS);
  });

  it('C2: Full stagger at default enemy duration (6s) matches talent exactly', () => {
    const { result } = setupPerlica();

    // Default full stagger duration = enemy STAGGER_RECOVERY (6s)
    const defaultDur = 6 * FPS;
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, defaultDur); });

    const staggerEvs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID && ev.ownerId === ENEMY_ID,
    );
    expect(staggerEvs).toHaveLength(1);
    const staggerDur = eventDuration(staggerEvs[0]);
    expect(staggerDur).toBe(defaultDur);

    // Talent must match stagger exactly
    const talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(staggerEvs[0].startFrame);
    expect(eventDuration(talents[0])).toBe(staggerDur);
  });

  it('C3: Full stagger with full 4-op team — talent matches stagger', () => {
    const { result } = setupPerlica();

    // Mirror the embed: Perlica + Akekuri + Antal + Ardelia
    act(() => { result.current.handleSwapOperator('slot-1', 'AKEKURI'); });
    act(() => { result.current.handleSwapOperator('slot-2', 'ANTAL'); });
    act(() => { result.current.handleSwapOperator('slot-3', 'ARDELIA'); });

    // Place default full stagger (6s) at 5s
    const defaultDur = 6 * FPS;
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, defaultDur); });

    const staggerEvs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID && ev.ownerId === ENEMY_ID,
    );
    expect(staggerEvs).toHaveLength(1);

    const talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(staggerEvs[0].startFrame);
    expect(eventDuration(talents[0])).toBe(eventDuration(staggerEvs[0]));
  });
});

// =============================================================================
// D. Talent duration exactly matches stagger
// =============================================================================

describe('D. Talent duration/offset mirrors stagger', () => {
  it('D1: Talent has identical start, end, and duration as node stagger', () => {
    const { result } = setupPerlica();

    const staggerStart = 4 * FPS;
    const staggerDur = 5 * FPS;

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, staggerStart, staggerDur); });

    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    const talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);

    // Same start frame
    expect(talents[0].startFrame).toBe(staggerEv.startFrame);
    // Same duration
    expect(eventDuration(talents[0])).toBe(eventDuration(staggerEv));
    // Same end frame
    expect(talents[0].startFrame + eventDuration(talents[0]))
      .toBe(staggerEv.startFrame + eventDuration(staggerEv));
  });

  it('D2: Extending stagger from 4s → 6s extends talent to 6s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 4 * FPS); });

    // Verify initial alignment
    let talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(eventDuration(talents[0])).toBe(4 * FPS);

    // Extend stagger to 6s
    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 6 * FPS }]);
    });

    // Talent must follow
    talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(6 * FPS);
  });

  it('D3: Extending stagger from 4s → 8s extends talent to 8s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 4 * FPS); });

    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 8 * FPS }]);
    });

    const talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(8 * FPS);
  });

  it('D4: Shortening stagger from 5s → 2s shortens talent to 2s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 5 * FPS); });

    let talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(eventDuration(talents[0])).toBe(5 * FPS);

    // Shorten stagger to 2s
    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 2 * FPS }]);
    });

    talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(2 * FPS);
  });

  it('D5: Shortening stagger from 5s → 3s shortens talent to 3s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 5 * FPS); });

    let talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(eventDuration(talents[0])).toBe(5 * FPS);

    // Shorten stagger to 3s
    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 3 * FPS }]);
    });

    talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(3 * FPS);
  });

  it('D6a: Resizing full stagger from 6s → 3s shortens talent to 3s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 4 * FPS, 6 * FPS); });

    let talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(eventDuration(talents[0])).toBe(6 * FPS);

    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 3 * FPS }]);
    });

    talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(3 * FPS);
  });

  it('D6b: Resizing full stagger from 6s → 10s extends talent to 10s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 4 * FPS, 6 * FPS); });

    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 10 * FPS }]);
    });

    const talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(10 * FPS);
  });

  it('D6: Shortening stagger from 5s → 1s shortens talent to 1s', () => {
    const { result } = setupPerlica();

    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 5 * FPS); });

    let talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(eventDuration(talents[0])).toBe(5 * FPS);

    // Shorten stagger to 1s
    const staggerEv = result.current.allProcessedEvents.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!;
    act(() => {
      result.current.handleResizeSegment(staggerEv.uid, [{ segmentIndex: 0, newDuration: 1 * FPS }]);
    });

    talents = getTalentEvents(result.current);
    expect(talents).toHaveLength(1);
    expect(talents[0].startFrame).toBe(4 * FPS);
    expect(eventDuration(talents[0])).toBe(1 * FPS);
  });
});

// =============================================================================
// F. View-layer offset/duration verification after resize
// =============================================================================

/** Find talent events in the view presentation layer. */
function findViewTalent(app: AppResult) {
  const viewModels = computeTimelinePresentation(app.allProcessedEvents, app.columns);
  const found: { startFrame: number; duration: number; endFrame: number }[] = [];
  viewModels.forEach(vm => {
    for (const ev of vm.events) {
      if (ev.name === TALENT_ID && ev.ownerId === SLOT_PERLICA) {
        const dur = eventDuration(ev);
        found.push({ startFrame: ev.startFrame, duration: dur, endFrame: ev.startFrame + dur });
      }
    }
  });
  return found;
}


describe('F. View-layer: talent offset/duration matches stagger after resize', () => {
  it('F1: Initial full stagger — view talent matches view stagger', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 6 * FPS); });

    // Controller layer: raw stagger event
    const rawStagger = result.current.events.find(ev => ev.columnId === FULL_STAGGER_COLUMN_ID);
    expect(rawStagger).toBeDefined();
    const staggerStart = rawStagger!.startFrame;
    const staggerDur = eventDuration(rawStagger!);
    const staggerEnd = staggerStart + staggerDur;

    // View layer: talent must match the raw stagger's timing
    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(staggerStart);
    expect(viewTalent[0].duration).toBe(staggerDur);
    expect(viewTalent[0].endFrame).toBe(staggerEnd);
  });

  it('F2: Extend full stagger 6s → 10s — view talent extends', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 6 * FPS); });

    // Use the processed event's UID for resize (processed events include the stagger)
    const staggerUid = result.current.events.find(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleResizeSegment(staggerUid, [{ segmentIndex: 0, newDuration: 10 * FPS }]);
    });

    // Controller layer: talent should be 10s
    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(eventDuration(ctrlTalent[0])).toBe(10 * FPS);

    // View talent must match
    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].duration).toBe(10 * FPS);
  });

  it('F3: Shorten full stagger 6s → 2s — view talent shortens', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 6 * FPS); });

    const staggerUid = result.current.events.find(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleResizeSegment(staggerUid, [{ segmentIndex: 0, newDuration: 2 * FPS }]);
    });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(eventDuration(ctrlTalent[0])).toBe(2 * FPS);

    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].duration).toBe(2 * FPS);
  });

  it('F4: Extend node stagger 4s → 7s — view talent extends', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 3 * FPS, 4 * FPS); });

    const staggerUid = result.current.events.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleResizeSegment(staggerUid, [{ segmentIndex: 0, newDuration: 7 * FPS }]);
    });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(eventDuration(ctrlTalent[0])).toBe(7 * FPS);

    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].duration).toBe(7 * FPS);
  });

  it('F5: Shorten node stagger 5s → 1s — view talent shortens', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 3 * FPS, 5 * FPS); });

    const staggerUid = result.current.events.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleResizeSegment(staggerUid, [{ segmentIndex: 0, newDuration: 1 * FPS }]);
    });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(eventDuration(ctrlTalent[0])).toBe(1 * FPS);

    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].duration).toBe(1 * FPS);
  });
});

// =============================================================================
// G. Drag-editing (moving) stagger — talent follows
// =============================================================================

describe('G. Drag-edit (move) stagger — talent start/end/duration follow', () => {
  it('G1: Move full stagger from 5s to 10s — talent moves with same duration', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 6 * FPS); });

    // Before move
    let ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(5 * FPS);
    expect(eventDuration(ctrlTalent[0])).toBe(6 * FPS);

    const staggerUid = result.current.events.find(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleMoveEvent(staggerUid, 10 * FPS);
    });

    // Controller layer
    ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(10 * FPS);
    expect(eventDuration(ctrlTalent[0])).toBe(6 * FPS);

    // View layer
    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(10 * FPS);
    expect(viewTalent[0].duration).toBe(6 * FPS);
    expect(viewTalent[0].endFrame).toBe(16 * FPS);
  });

  it('G2: Move node stagger from 4s to 8s — talent moves with same duration', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 4 * FPS); });

    const staggerUid = result.current.events.find(
      ev => ev.columnId === NODE_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleMoveEvent(staggerUid, 8 * FPS);
    });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(8 * FPS);
    expect(eventDuration(ctrlTalent[0])).toBe(4 * FPS);

    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(8 * FPS);
    expect(viewTalent[0].duration).toBe(4 * FPS);
    expect(viewTalent[0].endFrame).toBe(12 * FPS);
  });

  it('G3: Move full stagger earlier from 10s to 2s — talent follows', () => {
    const { result } = setupPerlica();
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 10 * FPS, 5 * FPS); });

    const staggerUid = result.current.events.find(
      ev => ev.columnId === FULL_STAGGER_COLUMN_ID,
    )!.uid;
    act(() => {
      result.current.handleMoveEvent(staggerUid, 2 * FPS);
    });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(2 * FPS);
    expect(eventDuration(ctrlTalent[0])).toBe(5 * FPS);

    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(2 * FPS);
    expect(viewTalent[0].duration).toBe(5 * FPS);
    expect(viewTalent[0].endFrame).toBe(7 * FPS);
  });
});

// =============================================================================
// H. Embed-equivalent: full team + freeform full stagger
// =============================================================================

describe('H. Embed-equivalent scenario', () => {
  it('H1: Perlica+Akekuri+Antal+Ardelia, freeform full stagger — talent matches', () => {
    const { result } = setupPerlica();
    act(() => { result.current.handleSwapOperator('slot-1', 'AKEKURI'); });
    act(() => { result.current.handleSwapOperator('slot-2', 'ANTAL'); });
    act(() => { result.current.handleSwapOperator('slot-3', 'ARDELIA'); });

    // Place freeform full stagger at 5s with default 6s duration
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 6 * FPS); });

    // Verify the stagger raw event exists
    const rawStagger = result.current.events.find(ev => ev.columnId === FULL_STAGGER_COLUMN_ID);
    expect(rawStagger).toBeDefined();

    // Controller layer
    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(5 * FPS);
    expect(eventDuration(ctrlTalent[0])).toBe(6 * FPS);

    // View layer
    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(5 * FPS);
    expect(viewTalent[0].duration).toBe(6 * FPS);
    expect(viewTalent[0].endFrame).toBe(11 * FPS);

    // Drag stagger to 8s
    act(() => {
      result.current.handleMoveEvent(rawStagger!.uid, 8 * FPS);
    });

    // After drag: controller
    const movedTalent = getTalentEvents(result.current);
    expect(movedTalent).toHaveLength(1);
    expect(movedTalent[0].startFrame).toBe(8 * FPS);
    expect(eventDuration(movedTalent[0])).toBe(6 * FPS);

    // After drag: view
    const movedView = findViewTalent(result.current);
    expect(movedView).toHaveLength(1);
    expect(movedView[0].startFrame).toBe(8 * FPS);
    expect(movedView[0].duration).toBe(6 * FPS);
    expect(movedView[0].endFrame).toBe(14 * FPS);

    // Resize stagger to 3s
    const staggerUid2 = result.current.events.find(ev => ev.columnId === FULL_STAGGER_COLUMN_ID)!.uid;
    act(() => {
      result.current.handleResizeSegment(staggerUid2, [{ segmentIndex: 0, newDuration: 3 * FPS }]);
    });

    // After resize: controller
    const resizedTalent = getTalentEvents(result.current);
    expect(resizedTalent).toHaveLength(1);
    expect(resizedTalent[0].startFrame).toBe(8 * FPS);
    expect(eventDuration(resizedTalent[0])).toBe(3 * FPS);

    // After resize: view
    const resizedView = findViewTalent(result.current);
    expect(resizedView).toHaveLength(1);
    expect(resizedView[0].startFrame).toBe(8 * FPS);
    expect(resizedView[0].duration).toBe(3 * FPS);
    expect(resizedView[0].endFrame).toBe(11 * FPS);
  });
});

// =============================================================================
// I. Overlapping staggers — STAGGER_FRAILTY is a counter, talent fires once
// =============================================================================

describe('I. Overlapping staggers — single talent instance', () => {
  it('I1: Two overlapping staggers at 0s and 1s — only one talent, spans full window', () => {
    const { result } = setupPerlica();

    // Stagger A: 0s–4s (4s duration)
    // Stagger B: 1s–5s (4s duration)
    // STAGGER_FRAILTY: 0→1 at 0s, 1→2 at 1s, 2→1 at 4s, 1→0 at 5s
    // Talent should: APPLY at 0s (0→1), CONSUME at 5s (1→0) — one instance, 5s duration
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 0, 4 * FPS); });
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 1 * FPS, 4 * FPS); });

    // Controller: exactly one talent
    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(0);
    expect(eventDuration(ctrlTalent[0])).toBe(5 * FPS);

    // View: exactly one talent spanning 0s–5s
    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(0);
    expect(viewTalent[0].duration).toBe(5 * FPS);
    expect(viewTalent[0].endFrame).toBe(5 * FPS);
  });

  it('I2: Two non-overlapping staggers — two separate talent instances', () => {
    const { result } = setupPerlica();

    // Stagger A: 0s–3s
    // Stagger B: 5s–8s
    // Gap at 3s–5s where STAGGER_FRAILTY = 0
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 0, 3 * FPS); });
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 5 * FPS, 3 * FPS); });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(2);

    // First talent: 0s–3s
    expect(ctrlTalent[0].startFrame).toBe(0);
    expect(eventDuration(ctrlTalent[0])).toBe(3 * FPS);

    // Second talent: 5s–8s
    expect(ctrlTalent[1].startFrame).toBe(5 * FPS);
    expect(eventDuration(ctrlTalent[1])).toBe(3 * FPS);
  });

  it('I3: Three overlapping staggers — talent spans entire window', () => {
    const { result } = setupPerlica();

    // A: 0s–4s, B: 1s–5s, C: 2s–6s
    // STAGGER_FRAILTY counter: 1 at 0s, 2 at 1s, 3 at 2s, 2 at 4s, 1 at 5s, 0 at 6s
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 0, 4 * FPS); });
    act(() => { placeStagger(result.current, FULL_STAGGER_COLUMN_ID, 1 * FPS, 4 * FPS); });
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 2 * FPS, 4 * FPS); });

    const ctrlTalent = getTalentEvents(result.current);
    expect(ctrlTalent).toHaveLength(1);
    expect(ctrlTalent[0].startFrame).toBe(0);
    expect(eventDuration(ctrlTalent[0])).toBe(6 * FPS);

    const viewTalent = findViewTalent(result.current);
    expect(viewTalent).toHaveLength(1);
    expect(viewTalent[0].startFrame).toBe(0);
    expect(viewTalent[0].duration).toBe(6 * FPS);
    expect(viewTalent[0].endFrame).toBe(6 * FPS);
  });
});

// =============================================================================
// E. STAGGER_DAMAGE_BONUS in damage calc
// =============================================================================

describe('E. STAGGER_DAMAGE_BONUS stat accumulation', () => {
  it('E1: Battle skill during stagger has STAGGER_DAMAGE_BONUS >= 0.2', () => {
    const { result } = setupPerlica();

    // Place stagger on enemy
    act(() => { placeStagger(result.current, NODE_STAGGER_COLUMN_ID, 4 * FPS, 6 * FPS); });

    // Place battle skill during stagger
    const bsCol = findColumn(result.current, SLOT_PERLICA, NounType.BATTLE);
    act(() => {
      result.current.handleAddEvent(
        SLOT_PERLICA, NounType.BATTLE, 5 * FPS, bsCol!.defaultEvent!,
      );
    });

    const calcResult = runCalculation(
      result.current.allProcessedEvents,
      result.current.columns,
      result.current.slots,
      result.current.enemy,
      result.current.loadoutProperties,
      result.current.loadouts,
      result.current.staggerBreaks,
      CritMode.NEVER,
      result.current.overrides,
    );

    const bsRows = calcResult.rows.filter(
      r => r.ownerId === SLOT_PERLICA && r.columnId === NounType.BATTLE && r.damage != null,
    );
    expect(bsRows.length).toBeGreaterThan(0);
    const row = bsRows.find(r => r.params?.sub);
    expect(row).toBeDefined();
    expect(row!.params?.sub?.staggerDmgBonus ?? 0).toBeGreaterThanOrEqual(0.2);
  });
});
