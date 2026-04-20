/**
 * @jest-environment jsdom
 */

/**
 * Reaction drag-resize parity — verifies all REACTION columns can be
 * ctrl-drag resized (both shrink below default AND extend above default).
 *
 * Regression for the TODO "Reactions should be drag-resizable below default
 * duration": Combustion previously capped shrink at the default duration
 * because its DoT tick frames pinned the minimum. Corrosion previously
 * ignored drag-resize entirely because its rendered segments are regenerated
 * from a single raw segment 0 — any per-rendered-segment override was
 * silently discarded.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { eventDuration } from '../../../consts/viewTypes';
import { buildDamageTableRows } from '../../../controller/calculation/damageTableBuilder';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../view/InformationPane';

type AppRef = ReturnType<typeof useApp>;

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeFreeformReaction(app: AppRef, reactionColumn: string, atFrame: number, durationFrames: number) {
  act(() => {
    app.handleAddEvent(ENEMY_ID, reactionColumn, atFrame, {
      name: reactionColumn,
      segments: [{ properties: { duration: Math.round(durationFrames) } }],
    });
  });
}

function getReactionEvent(app: AppRef, reactionColumn: string) {
  return app.allProcessedEvents.find(
    (ev) => ev.columnId === reactionColumn && ev.ownerEntityId === ENEMY_ID,
  );
}

describe('Reaction drag-resize parity — single-segment reactions', () => {
  const SINGLE_SEGMENT_REACTIONS = [
    REACTION_COLUMNS.COMBUSTION,
    REACTION_COLUMNS.SOLIDIFICATION,
    REACTION_COLUMNS.ELECTRIFICATION,
    REACTION_COLUMNS.SHATTER,
  ];

  for (const reactionColumn of SINGLE_SEGMENT_REACTIONS) {
    describe(`${reactionColumn}`, () => {
      it(`can be shrunk below default duration`, () => {
        const { result } = setup();
        const defaultDuration = 10 * FPS;
        placeFreeformReaction(result.current, reactionColumn, 1 * FPS, defaultDuration);

        const ev = getReactionEvent(result.current, reactionColumn);
        expect(ev).toBeDefined();
        const initialTotal = eventDuration(ev!);
        expect(initialTotal).toBeGreaterThanOrEqual(defaultDuration);

        // Shrink to 2s — well below any DoT-tick frame-offset floor
        const shorterTotal = 2 * FPS;
        act(() => {
          result.current.handleResizeSegment(ev!.uid, [{ segmentIndex: 0, newDuration: shorterTotal }]);
        });

        const after = getReactionEvent(result.current, reactionColumn);
        expect(after).toBeDefined();
        expect(eventDuration(after!)).toBe(shorterTotal);
      });

      it(`can be extended above default duration`, () => {
        const { result } = setup();
        const defaultDuration = 10 * FPS;
        placeFreeformReaction(result.current, reactionColumn, 1 * FPS, defaultDuration);

        const ev = getReactionEvent(result.current, reactionColumn);
        expect(ev).toBeDefined();
        const initialTotal = eventDuration(ev!);

        const longerTotal = initialTotal + 5 * FPS;
        act(() => {
          result.current.handleResizeSegment(ev!.uid, [{ segmentIndex: 0, newDuration: longerTotal }]);
        });

        const after = getReactionEvent(result.current, reactionColumn);
        expect(after).toBeDefined();
        expect(eventDuration(after!)).toBe(longerTotal);
      });
    });
  }
});

describe('Freeform reaction combat-sheet attribution', () => {
  it('freeform Combustion DoT tick frames produce damage rows attributed to an operator', () => {
    const { result } = setup();
    placeFreeformReaction(result.current, REACTION_COLUMNS.COMBUSTION, 1 * FPS, 10 * FPS);

    const app = result.current;
    const combustionEv = app.allProcessedEvents.find(
      (e) => e.columnId === REACTION_COLUMNS.COMBUSTION && e.ownerEntityId === ENEMY_ID,
    );
    expect(combustionEv).toBeDefined();
    // Without the fallback, sourceEntityId would stay 'enemy' — not a slot operator ID.
    expect(combustionEv!.sourceEntityId).not.toBe(ENEMY_ID);

    const loadoutStats: Record<string, typeof DEFAULT_LOADOUT_PROPERTIES> = {};
    for (const slot of app.slots) {
      loadoutStats[slot.slotId] = DEFAULT_LOADOUT_PROPERTIES;
    }

    const rows = buildDamageTableRows(
      app.allProcessedEvents,
      app.columns,
      app.slots,
      app.enemy,
      loadoutStats,
    );

    const combustionRows = rows.filter((r) => r.eventUid === combustionEv!.uid);
    // Initial hit + 10 DoT ticks = 11 damage rows
    expect(combustionRows.length).toBeGreaterThan(1);
    for (const row of combustionRows) {
      expect(row.damage).not.toBeNull();
      expect(row.damage!).toBeGreaterThan(0);
    }
  });
});

describe('Reaction drag-resize parity — Corrosion (multi-segment)', () => {
  it('Corrosion can be shrunk via segment 0 resize despite multi-segment rebuild', () => {
    const { result } = setup();
    // Corrosion default: 15s (ramps over first 10s, final hold segment)
    const defaultDuration = 15 * FPS;
    placeFreeformReaction(result.current, REACTION_COLUMNS.CORROSION, 1 * FPS, defaultDuration);

    const ev = getReactionEvent(result.current, REACTION_COLUMNS.CORROSION);
    expect(ev).toBeDefined();
    // Corrosion rebuilds to >1 segments (ramp ticks + final)
    expect(ev!.segments.length).toBeGreaterThan(1);
    const initialTotal = eventDuration(ev!);
    expect(initialTotal).toBe(defaultDuration);

    // Shrink total to 5s
    const shorterTotal = 5 * FPS;
    act(() => {
      result.current.handleResizeSegment(ev!.uid, [{ segmentIndex: 0, newDuration: shorterTotal }]);
    });

    const after = getReactionEvent(result.current, REACTION_COLUMNS.CORROSION);
    expect(after).toBeDefined();
    expect(eventDuration(after!)).toBe(shorterTotal);
  });

  it('Corrosion can be extended via segment 0 resize', () => {
    const { result } = setup();
    const defaultDuration = 15 * FPS;
    placeFreeformReaction(result.current, REACTION_COLUMNS.CORROSION, 1 * FPS, defaultDuration);

    const ev = getReactionEvent(result.current, REACTION_COLUMNS.CORROSION);
    expect(ev).toBeDefined();

    const longerTotal = 25 * FPS;
    act(() => {
      result.current.handleResizeSegment(ev!.uid, [{ segmentIndex: 0, newDuration: longerTotal }]);
    });

    const after = getReactionEvent(result.current, REACTION_COLUMNS.CORROSION);
    expect(after).toBeDefined();
    expect(eventDuration(after!)).toBe(longerTotal);
  });
});
