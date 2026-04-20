/**
 * @jest-environment jsdom
 */

/**
 * Corrosion merge — E2E.
 *
 * Pins the merge semantics for overlapping Corrosion reactions on the enemy:
 *
 *  1. The older Corrosion is clamped at the newer's start frame (REFRESHED).
 *  2. The newer Corrosion's first segment carries the **higher** of:
 *      - its own initial value, or
 *      - the older Corrosion's ramped value at the merge point.
 *     (Implemented as `reductionFloor` on the merged event — every segment's
 *     reduction is `max(floor, segment_natural_value)`.)
 *  3. The merged Corrosion's total duration = max(older's remaining duration,
 *     newer's full duration).
 *
 * Reduction values (decimal multipliers):
 *   L1: initial=0.036, max=0.12     L2: initial=0.048, max=0.16
 *   L3: initial=0.06,  max=0.20     L4: initial=0.072, max=0.24
 *
 *   getCorrosionBaseReduction(L, t) = initial + (max - initial) * (t / 10)
 *   for 0 ≤ t ≤ 10; clamps at endpoints.
 *
 * Verified scenarios:
 *   A. II ramped > IV initial → merged seg-0 = II's ramped value
 *   B. II ramped < IV initial → merged seg-0 = IV's initial value
 *   C. IV full duration > II remaining → merged duration = IV's
 *   D. II remaining > IV full duration → merged duration = II's remaining
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, CritMode, ElementType, EventStatusType, InteractionModeType } from '../../../consts/enums';
import { NounType } from '../../../dsl/semantics';
import { FPS, secondsToFrames } from '../../../utils/timeline';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS, REACTION_COLUMNS } from '../../../model/channels';
import { eventDuration, type TimelineEvent, type MiniTimeline, type EventSegmentData } from '../../../consts/viewTypes';
import { buildContextMenu, findColumn, getMenuPayload } from '../helpers';
import { injectStatusLevelIntoSegments } from '../../../controller/timeline/contextMenuController';
import { runCalculation } from '../../../controller/calculation/calculationController';
import type { AppResult, AddEventPayload } from '../helpers';

beforeEach(() => { localStorage.clear(); });

function findEnemyStatusColumn(app: AppResult): MiniTimeline | undefined {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === ENEMY_ID
      && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

/**
 * Place a freeform Corrosion at the given frame with explicit statusLevel and
 * duration. Uses the context-menu's APPLY-clause-bearing default segments so
 * the inner derived reaction picks up statusLevel via the wrapper APPLY's
 * `with.statusLevel` (same flow ContextMenu.tsx uses for the picker submenu).
 */
function placeFreeformCorrosion(
  app: AppResult,
  atFrame: number,
  level: 1 | 2 | 3 | 4,
  durationFrames: number,
) {
  const enemyCol = findEnemyStatusColumn(app);
  expect(enemyCol).toBeDefined();
  const items = buildContextMenu(app, enemyCol!, atFrame);
  expect(items).not.toBeNull();
  const item = items!.find(
    (i) =>
      i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload | undefined)?.columnId === REACTION_COLUMNS.CORROSION,
  );
  expect(item).toBeDefined();

  const payload = item!.actionPayload as AddEventPayload;
  const base = payload.defaultSkill as { segments?: EventSegmentData[] };
  // Override wrapper segment duration so injectWrapperDuration carries it
  // into the inner APPLY's `with.duration` → derived reaction's duration.
  const sized = base.segments
    ? base.segments.map((s, i) => i === 0
        ? { ...s, properties: { ...s.properties, duration: durationFrames } }
        : s)
    : undefined;
  const leveled = injectStatusLevelIntoSegments(sized, level);
  const defaultSkill = { ...payload.defaultSkill, segments: leveled ?? sized };

  app.handleAddEvent(payload.ownerEntityId, payload.columnId, atFrame, defaultSkill);
}

function corrosions(app: AppResult): TimelineEvent[] {
  return app.allProcessedEvents
    .filter(ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.CORROSION)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function segmentReduction(ev: TimelineEvent, segIndex: number): number {
  const seg = ev.segments[segIndex];
  const effect = (seg.clause as Array<{ effects: Array<{ with?: { value?: { value?: number } } }> }>)[0].effects[0];
  return effect.with!.value!.value!;
}

function firstSegmentReduction(ev: TimelineEvent): number {
  return segmentReduction(ev, 0);
}

describe('Corrosion merge — overlapping reactions on enemy', () => {
  it('A. II ramped > IV initial: merged seg-0 carries the OLDER\'s ramped value', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // II at frame 0; IV at frame 5s.
    // II.sample(t=5) = 0.048 + (0.16-0.048) * 0.5 = 0.104
    // IV.initial    = 0.072
    // max → 0.104 (II's ramped value).
    act(() => { placeFreeformCorrosion(result.current, 0, 2, 15 * FPS); });
    act(() => { placeFreeformCorrosion(result.current, 5 * FPS, 4, 15 * FPS); });

    const sorted = corrosions(result.current);
    expect(sorted).toHaveLength(2);
    const oldII = sorted[0];
    const newIV = sorted[1];

    // Old Corrosion II: clamped to end at IV's start; status REFRESHED.
    expect(oldII.statusLevel).toBe(2);
    expect(oldII.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(eventDuration(oldII)).toBe(5 * FPS);

    // New Corrosion IV: starts at 5s, statusLevel 4, reductionFloor stamped.
    expect(newIV.statusLevel).toBe(4);
    expect(newIV.startFrame).toBe(5 * FPS);
    expect(newIV.reductionFloor).toBeCloseTo(0.104, 5);

    // Per-segment scaling: the merged event resumes ramping from the floor's
    // equivalent position on IV's curve (no flat hold while the natural ramp
    // catches up). For floor=0.104 on IV (L4), the equivalent ramp time is
    // t_floor = (0.104 − 0.072) / (0.24 − 0.072) × 10 ≈ 1.9048s. Each segment N
    // samples at (N + t_floor):
    //   seg 0 (t=1.9048): 0.104   ← starts at the floor
    //   seg 1 (t=2.9048): 0.1208  ← already ramping (no flat segment)
    //   seg 2 (t=3.9048): 0.1376
    //   seg 3 (t=4.9048): 0.1544
    //   seg 4 (t=5.9048): 0.1712
    //   seg 5 (t=6.9048): 0.188
    //   seg 6 (t=7.9048): 0.2048
    //   seg 7 (t=8.9048): 0.2216
    //   seg 8 (t=9.9048): 0.2384
    //   seg 9 (final hold, sampled at t≥10): 0.24
    expect(newIV.segments).toHaveLength(10);
    expect(segmentReduction(newIV, 0)).toBeCloseTo(0.104, 4);
    expect(segmentReduction(newIV, 1)).toBeCloseTo(0.1208, 4);
    expect(segmentReduction(newIV, 2)).toBeCloseTo(0.1376, 4);
    expect(segmentReduction(newIV, 3)).toBeCloseTo(0.1544, 4);
    expect(segmentReduction(newIV, 4)).toBeCloseTo(0.1712, 4);
    expect(segmentReduction(newIV, 5)).toBeCloseTo(0.188, 4);
    expect(segmentReduction(newIV, 6)).toBeCloseTo(0.2048, 4);
    expect(segmentReduction(newIV, 7)).toBeCloseTo(0.2216, 4);
    expect(segmentReduction(newIV, 8)).toBeCloseTo(0.2384, 4);
    expect(segmentReduction(newIV, 9)).toBeCloseTo(0.24, 4);    // final hold at L4 max

    // Strictly increasing across ramp segments (segment 1 must exceed
    // segment 0 — no flat hold at the floor).
    expect(segmentReduction(newIV, 1)).toBeGreaterThan(segmentReduction(newIV, 0));
    for (let i = 1; i < newIV.segments.length; i++) {
      expect(segmentReduction(newIV, i)).toBeGreaterThanOrEqual(segmentReduction(newIV, i - 1) - 1e-9);
    }
  });

  it('B. II ramped < IV initial: merged seg-0 carries IV\'s OWN initial value', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // II at frame 0; IV at frame 1s.
    // II.sample(t=1) = 0.048 + (0.112) * 0.1 = 0.0592
    // IV.initial    = 0.072
    // max → 0.072 (IV's initial wins).
    act(() => { placeFreeformCorrosion(result.current, 0, 2, 15 * FPS); });
    act(() => { placeFreeformCorrosion(result.current, 1 * FPS, 4, 15 * FPS); });

    const [oldII, newIV] = corrosions(result.current);

    expect(oldII.statusLevel).toBe(2);
    expect(oldII.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(eventDuration(oldII)).toBe(1 * FPS);

    expect(newIV.statusLevel).toBe(4);
    expect(newIV.reductionFloor).toBeCloseTo(0.0592, 5);
    // IV's natural ramp (0.072) exceeds the floor → seg 0 takes 0.072.
    expect(firstSegmentReduction(newIV)).toBeCloseTo(0.072, 5);
  });

  it('C. IV full duration > II remaining: merged duration = IV full', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // II at frame 0 (15s) — at frame 10s, II remaining = 5s.
    // IV at frame 10s (15s) → max(5s, 15s) = 15s.
    act(() => { placeFreeformCorrosion(result.current, 0, 2, 15 * FPS); });
    act(() => { placeFreeformCorrosion(result.current, 10 * FPS, 4, 15 * FPS); });

    const [, newIV] = corrosions(result.current);
    expect(eventDuration(newIV)).toBe(15 * FPS);
  });

  it('D. II remaining > IV full duration: merged duration extends to II remaining', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // II at frame 0 (30s) — at frame 5s, II remaining = 25s.
    // IV at frame 5s (15s) → max(25s, 15s) = 25s.
    act(() => { placeFreeformCorrosion(result.current, 0, 2, 30 * FPS); });
    act(() => { placeFreeformCorrosion(result.current, 5 * FPS, 4, 15 * FPS); });

    const [oldII, newIV] = corrosions(result.current);
    expect(oldII.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(eventDuration(oldII)).toBe(5 * FPS);
    expect(eventDuration(newIV)).toBe(25 * FPS);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // E. No double-procced reduction during overlap window.
  //
  // When II is merged into IV at frame 5s, II's pending segment-clause
  // PROCESS_FRAME entries (queued for its OWN segment ends — frames 720,
  // 840, …) and the long-lived `_statReversals` they would push must NOT
  // continue contributing once II is REFRESHED. Otherwise damage frames in
  // the overlap window (frame 5s..15s) would see *both* II's stale value
  // AND IV's current value stacked on the resistance-reduction accumulator.
  //
  // Concretely: at IV-internal t=1 (absolute 6s..7s), IV's segment 1 carries
  // max(floor=0.104, IV.sample(1)=0.0888) = 0.104. The damage frame's
  // resistance multiplier should be 1.0 + 0.104 = 1.104. If II's stale
  // segments were still firing, we'd see 1.104 + (II.sample(6)≈0.0816), or
  // similar inflated values — the regression check.
  // ─────────────────────────────────────────────────────────────────────────
  it('E. damage frames inside the overlap window see only IV\'s reduction (no double-proc from II)', () => {
    const SLOT_AKEKURI = 'slot-1';
    const BS_DAMAGE_OFFSET = secondsToFrames(0.67);

    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // II at frame 0 (15s); IV at frame 5s (15s). Merge happens at frame 600.
    // II would have run until frame 1800 had it not been clamped.
    act(() => { placeFreeformCorrosion(result.current, 0, 2, 15 * FPS); });
    act(() => { placeFreeformCorrosion(result.current, 5 * FPS, 4, 15 * FPS); });

    // Akekuri (HEAT) BS damage frames at distinct frames inside the overlap
    // window (after merge at 5s, before II's natural end at 15s). The merged
    // IV has floor=0.104 → t_floor ≈ 1.9048 on IV's curve, so each segment N
    // samples at (N + t_floor):
    //   BS@6s   → tick @ 6.67s   (IV t≈1.67  → seg 1, sample(2.9048) = 0.1208)
    //   BS@9s   → tick @ 9.67s   (IV t≈4.67  → seg 4, sample(5.9048) = 0.1712)
    //   BS@13s  → tick @ 13.67s  (IV t≈8.67  → seg 8, sample(9.9048) = 0.2384)
    const placeBs = (atFrame: number) => {
      const bsCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
      const payload = getMenuPayload(result.current, bsCol!, atFrame);
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    };
    act(() => { placeBs(6 * FPS); });
    act(() => { placeBs(9 * FPS); });
    act(() => { placeBs(13 * FPS); });

    const calc = runCalculation(
      result.current.allProcessedEvents, result.current.columns, result.current.slots,
      result.current.enemy, result.current.loadoutProperties, result.current.loadouts,
      result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const bsRows = calc.rows
      .filter(r => r.damage != null && r.damage > 0
        && r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE)
      .sort((a, b) => a.absoluteFrame - b.absoluteFrame);

    const pickRow = (expected: number) => {
      let best = bsRows[0];
      let bestDist = Math.abs(bsRows[0].absoluteFrame - expected);
      for (const r of bsRows) {
        const d = Math.abs(r.absoluteFrame - expected);
        if (d < bestDist) { best = r; bestDist = d; }
      }
      return best;
    };

    const at6 = pickRow(6 * FPS + BS_DAMAGE_OFFSET);
    const at9 = pickRow(9 * FPS + BS_DAMAGE_OFFSET);
    const at13 = pickRow(13 * FPS + BS_DAMAGE_OFFSET);

    // Expected IV-only contribution at each tick (matches scenario A's
    // per-segment scaling). Default Rhodagn HEAT_RESISTANCE = 1.0 baseline.
    expect(at6.params!.resistanceMultiplier).toBeCloseTo(1.0 + 0.1208, 4);
    expect(at9.params!.resistanceMultiplier).toBeCloseTo(1.0 + 0.1712, 4);
    expect(at13.params!.resistanceMultiplier).toBeCloseTo(1.0 + 0.2384, 4);

    // Source attribution: exactly ONE "Corrosion" entry contributing — not two.
    // The breakdown panel's per-element Resistance row would show one stack
    // of "Corrosion" with the merged value, not the older + newer summed.
    for (const row of [at6, at9, at13]) {
      const arts = row.params!.sub?.allResistanceReductionSources?.['ARTS' as ElementType] ?? [];
      const corrosionEntries = arts.filter(s => /corrosion/i.test(s.label));
      expect(corrosionEntries).toHaveLength(1);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // F. Repro of the breakdown-panel symptom: two "Corrosion" entries summing
  // into a single damage frame's resistance reduction.
  //
  // Scenario reproduces the screenshot: an old L1 corrosion at max-hold
  // (value=0.12) overlapping with a new L1 corrosion mid-ramp (value=0.1171
  // at ~t=9.65s). If the merge fully reverses the older one, only the newer
  // contributes (one source). If it doesn't, both stack on the accumulator
  // (two sources, sum=0.2371 — matches the screenshot exactly).
  // ─────────────────────────────────────────────────────────────────────────
  it('F. two L1 corrosions placed with overlap — only ONE contributes per damage frame', () => {
    const SLOT_AKEKURI = 'slot-1';
    const BS_DAMAGE_OFFSET = secondsToFrames(0.67);

    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // First L1 corrosion at frame 0, extended to 30s — runs long enough to
    // hit max-hold and still be alive when the second one starts.
    // Second L1 corrosion at frame 10s, default 15s — overlaps first.
    act(() => { placeFreeformCorrosion(result.current, 0, 1, 30 * FPS); });
    act(() => { placeFreeformCorrosion(result.current, 10 * FPS, 1, 15 * FPS); });

    // BS damage frame at ~frame 1880 (= 19.67s):
    //   - first would naturally be at t=19.65 (max)            = 0.12
    //   - second at t=9.65 (just before max)                    = 0.1171
    // If both contribute → resMult = 1.0 + 0.12 + 0.1171 = 1.2371
    // (the exact value seen in the screenshot).
    const bsCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    const payload = getMenuPayload(result.current, bsCol!, 19 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const calc = runCalculation(
      result.current.allProcessedEvents, result.current.columns, result.current.slots,
      result.current.enemy, result.current.loadoutProperties, result.current.loadouts,
      result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const bsRow = calc.rows
      .filter(r => r.damage != null && r.damage > 0
        && r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE)
      .sort((a, b) => Math.abs(a.absoluteFrame - (19 * FPS + BS_DAMAGE_OFFSET))
        - Math.abs(b.absoluteFrame - (19 * FPS + BS_DAMAGE_OFFSET)))[0];

    expect(bsRow).toBeDefined();

    // Exactly one Corrosion source — not two.
    const arts = bsRow.params!.sub?.allResistanceReductionSources?.['ARTS' as ElementType] ?? [];
    const corrosionEntries = arts.filter(s => /corrosion/i.test(s.label));
    expect(corrosionEntries).toHaveLength(1);

    // Resistance multiplier reflects only the second (merged) corrosion's
    // current value — at second's t≈9.65 the reduction is ≈0.1171 (or higher
    // if the floor from first's max-hold was carried over).
    expect(bsRow.params!.resistanceMultiplier).toBeLessThanOrEqual(1.0 + 0.12 + 1e-6);
    expect(bsRow.params!.resistanceMultiplier).toBeGreaterThan(1.0);
  });
});
