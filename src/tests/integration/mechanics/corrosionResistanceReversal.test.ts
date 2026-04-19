/**
 * @jest-environment jsdom
 */

/**
 * Corrosion resistance reversal — E2E.
 *
 * Pins that ARTS_RESISTANCE_REDUCTION applied via Corrosion's per-segment
 * APPLY clauses is correctly:
 *   - APPLIED during corrosion segments (resistance multiplier ramps up
 *     across the 9 ramp ticks, then holds at max)
 *   - REVERSED when corrosion ends (resistance multiplier returns to base)
 *
 * Method: place a freeform Corrosion at frame=5s for 15s, place Akekuri
 * (HEAT BS) battle skills at distinct frames whose damage ticks land:
 *   - before corrosion start
 *   - during early/mid/max-hold corrosion segments
 *   - after corrosion ends
 * Then read each damage row's `params.resistanceMultiplier` and assert.
 *
 * Akekuri BS damage frame is at offset 0.67s (= 80 frames) within the skill.
 * Default enemy (Rhodagn) has no per-element resistance overrides → base
 * HEAT_RESISTANCE = 1.0, so resMultiplier = 1.0 + ARTS_RESISTANCE_REDUCTION.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType } from '../../../consts/enums';
import { FPS, secondsToFrames } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

const SLOT_AKEKURI = 'slot-1';
const CORROSION_START = 5 * FPS;
const CORROSION_DURATION = 15 * FPS;
const CORROSION_END = CORROSION_START + CORROSION_DURATION;
const BS_DAMAGE_OFFSET = secondsToFrames(0.67);

beforeEach(() => { localStorage.clear(); });

function placeBs(app: AppResult, atFrame: number) {
  const bsCol = findColumn(app, SLOT_AKEKURI, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  const payload = getMenuPayload(app, bsCol!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeCorrosion(app: AppResult, atFrame: number) {
  app.handleAddEvent(
    ENEMY_ID,
    REACTION_COLUMNS.CORROSION,
    atFrame,
    {
      name: REACTION_COLUMNS.CORROSION,
      id: REACTION_COLUMNS.CORROSION,
      segments: [{ properties: { duration: CORROSION_DURATION } }],
    },
  );
}

function bsDamageRows(app: AppResult) {
  const calc = runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
  );
  return calc.rows.filter(
    r => r.damage != null && r.damage > 0
      && r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE,
  ).sort((a, b) => a.absoluteFrame - b.absoluteFrame);
}

/** Find the damage row with absoluteFrame closest to `expected`. */
function pickRow(rows: ReturnType<typeof bsDamageRows>, expected: number) {
  let best = rows[0];
  let bestDist = Math.abs(rows[0].absoluteFrame - expected);
  for (const r of rows) {
    const d = Math.abs(r.absoluteFrame - expected);
    if (d < bestDist) { best = r; bestDist = d; }
  }
  return best;
}

describe('Corrosion ARTS_RESISTANCE_REDUCTION — apply + reversal across segments', () => {
  it('damage frames outside corrosion (before AND after) have base resistance multiplier of 1.0', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Corrosion at frame 600, 15s long → ends at frame 2400.
    act(() => { placeCorrosion(result.current, CORROSION_START); });

    // BS at frame 0 → damage tick @ 80 (well before corrosion start).
    act(() => { placeBs(result.current, 0); });
    // BS at frame 23s → damage tick @ 23*FPS+80 = 2840 (well after corrosion ends at 2400).
    act(() => { placeBs(result.current, 23 * FPS); });

    const rows = bsDamageRows(result.current);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const before = pickRow(rows, BS_DAMAGE_OFFSET);
    const after = pickRow(rows, 23 * FPS + BS_DAMAGE_OFFSET);

    // Sanity: picked rows match expected tick frames (within 2 frames).
    expect(Math.abs(before.absoluteFrame - BS_DAMAGE_OFFSET)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.absoluteFrame - (23 * FPS + BS_DAMAGE_OFFSET))).toBeLessThanOrEqual(2);
    // Sanity: those frames really are outside the corrosion window.
    expect(before.absoluteFrame).toBeLessThan(CORROSION_START);
    expect(after.absoluteFrame).toBeGreaterThanOrEqual(CORROSION_END);

    // No corrosion contribution → resistance multiplier is the enemy's base = 1.0
    // for default Rhodagn (no HEAT_RESISTANCE override).
    expect(before.params!.resistanceMultiplier).toBeCloseTo(1.0, 4);
    // Reversal check: after corrosion ends, multiplier must return to base.
    expect(after.params!.resistanceMultiplier).toBeCloseTo(1.0, 4);
  });

  it('damage frames during corrosion ramp show monotonically increasing resistance multiplier, peaking at base + 0.12', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Corrosion at frame 600, 15s long → 9 ramp ticks (1s each) then 6s max-hold.
    act(() => { placeCorrosion(result.current, CORROSION_START); });

    // Place BS at distinct corrosion-internal frames so each damage tick lands
    // in a different ramp segment. With damage at start + 80:
    //   BS@7s   → tick @ 920    — corrosion second ~2.7  (segment 2, low ramp)
    //   BS@13s  → tick @ 1640   — corrosion second ~8.7  (segment 8, high ramp)
    //   BS@17s  → tick @ 2120   — corrosion second ~12.7 (max-hold segment)
    act(() => { placeBs(result.current, 7 * FPS); });
    act(() => { placeBs(result.current, 13 * FPS); });
    act(() => { placeBs(result.current, 17 * FPS); });

    const rows = bsDamageRows(result.current);
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const earlyRamp = pickRow(rows, 7 * FPS + BS_DAMAGE_OFFSET);
    const lateRamp = pickRow(rows, 13 * FPS + BS_DAMAGE_OFFSET);
    const maxHold = pickRow(rows, 17 * FPS + BS_DAMAGE_OFFSET);

    // Sanity: each picked tick really is inside the corrosion window.
    for (const r of [earlyRamp, lateRamp, maxHold]) {
      expect(r.absoluteFrame).toBeGreaterThanOrEqual(CORROSION_START);
      expect(r.absoluteFrame).toBeLessThan(CORROSION_END);
    }

    const baseRes = 1.0; // default Rhodagn HEAT_RESISTANCE has no override.

    // During corrosion: every multiplier strictly above base.
    expect(earlyRamp.params!.resistanceMultiplier).toBeGreaterThan(baseRes + 0.001);
    expect(lateRamp.params!.resistanceMultiplier).toBeGreaterThan(earlyRamp.params!.resistanceMultiplier);
    expect(maxHold.params!.resistanceMultiplier).toBeGreaterThanOrEqual(lateRamp.params!.resistanceMultiplier);

    // Max-hold segment carries the level-1 max reduction = 0.12.
    expect(maxHold.params!.resistanceMultiplier).toBeCloseTo(baseRes + 0.12, 4);
  });
});
