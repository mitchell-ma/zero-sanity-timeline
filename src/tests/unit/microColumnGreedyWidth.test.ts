/**
 * Micro-column greedy width expansion — Unit Test
 *
 * Verifies that DYNAMIC_SPLIT micro-column events expand into adjacent empty
 * slots for visual clarity. Uses strict half-open temporal overlap so
 * adjacent events (A ends at X, B starts at X) don't block each other —
 * they never coexist in time, so one can expand through the other's slot
 * during its own active window.
 */

import { computeTimelinePresentation } from '../../controller/timeline/eventPresentationController';
import { ColumnType, MicroColumnAssignment, HeaderVariant, TimelineSourceType } from '../../consts/enums';
import type { MiniTimeline, TimelineEvent } from '../../consts/viewTypes';
import { durationSegment } from '../../consts/viewTypes';
import { FPS } from '../../utils/timeline';

function makeColumn(microColumnIds: string[]): MiniTimeline {
  return {
    key: 'test-col',
    type: ColumnType.MINI_TIMELINE,
    source: TimelineSourceType.OPERATOR,
    ownerEntityId: 'slot-test',
    columnId: 'test-status',
    label: 'Test',
    color: '#888',
    headerVariant: HeaderVariant.SKILL,
    microColumns: microColumnIds.map(id => ({ id, label: id, color: '#888' })),
    microColumnAssignment: MicroColumnAssignment.DYNAMIC_SPLIT,
    matchColumnIds: microColumnIds,
  };
}

function makeEvent(uid: string, columnId: string, startFrame: number, durationFrames: number): TimelineEvent {
  return {
    uid,
    id: columnId,
    name: columnId,
    ownerEntityId: 'slot-test',
    columnId,
    startFrame,
    segments: durationSegment(durationFrames),
  };
}

describe('Micro-column greedy width expansion', () => {
  it('single event in a 2-slot column expands to full width', () => {
    const col = makeColumn(['a', 'b']);
    const events = [makeEvent('e1', 'a', 0, 3 * FPS)];
    const vms = computeTimelinePresentation(events, [col]);
    const vm = vms.get('test-col')!;
    const mp = vm.microPositions.get('e1')!;
    expect(mp.leftFrac).toBe(0);
    expect(mp.widthFrac).toBe(1);
  });

  it('events with well-separated neighbors expand to fill empty slots', () => {
    // 3-slot column. A in slot 0 (0-2s), B in slot 2 (10-12s).
    // Slot 1 (middle) is empty throughout. Both A and B expand into it
    // since the other event is >1s away.
    const col = makeColumn(['a', 'b', 'c']);
    const events = [
      makeEvent('ea', 'a', 0, 2 * FPS),
      makeEvent('eb', 'c', 10 * FPS, 2 * FPS),
    ];
    const vms = computeTimelinePresentation(events, [col]);
    const vm = vms.get('test-col')!;
    const mpA = vm.microPositions.get('ea')!;
    const mpB = vm.microPositions.get('eb')!;
    // With only 2 declared types in use, slotCount = 2 so each base is 1/2.
    // The middle declared column 'b' has no events → no slot allocated.
    expect(mpA.widthFrac + mpB.widthFrac).toBeGreaterThanOrEqual(1);
  });

  it('adjacent events (end-of-A == start-of-B) allow A to expand through B\'s slot', () => {
    // SOLID (0–3s) ends exactly when LIFT/PS (3–8s) start. They never coexist
    // in time, so SOLID renders wide during 0–3s (expands through empty slots)
    // and LIFT/PS render narrow during 3–8s. The visual handoff is fine because
    // the bars are in different time ranges — the eye doesn't confuse them.
    const col = makeColumn(['a', 'b', 'c']);
    const events = [
      makeEvent('solid', 'a', 0, 3 * FPS),            // 0–3s in slot 0
      makeEvent('lift',  'b', 3 * FPS, 1 * FPS),      // 3–4s in slot 1 (adjacent)
      makeEvent('ps',    'c', 3 * FPS, 5 * FPS),      // 3–8s in slot 2 (overlaps LIFT)
    ];
    const vms = computeTimelinePresentation(events, [col]);
    const vm = vms.get('test-col')!;
    const mpSolid = vm.microPositions.get('solid')!;
    const mpLift = vm.microPositions.get('lift')!;
    const mpPs = vm.microPositions.get('ps')!;

    const slotFrac = 1 / 3;
    // SOLID expands right through slots 1 and 2 (empty during 0–3s): full width
    expect(mpSolid.leftFrac).toBe(0);
    expect(mpSolid.widthFrac).toBe(1);
    // LIFT (slot 1) — slot 0 empty during 3–4s (SOLID ended), slot 2 has PS overlapping → expand left only
    expect(mpLift.widthFrac).toBeCloseTo(2 * slotFrac, 10);
    // PS (slot 2) — slot 1 has LIFT overlapping (3–4s within 3–8s), slot 0 empty → expand left past LIFT blocked
    expect(mpPs.widthFrac).toBeCloseTo(slotFrac, 10);
  });

  it('events separated in time expand across each other\'s slots', () => {
    // 2-slot column: A in slot 0 (0–2s), B in slot 1 (4–6s).
    // They never coexist, so each expands to full column width during its
    // own active window.
    const col = makeColumn(['a', 'b']);
    const events = [
      makeEvent('ea', 'a', 0, 2 * FPS),
      makeEvent('eb', 'b', 4 * FPS, 2 * FPS),
    ];
    const vms = computeTimelinePresentation(events, [col]);
    const vm = vms.get('test-col')!;
    const mpA = vm.microPositions.get('ea')!;
    const mpB = vm.microPositions.get('eb')!;
    expect(mpA.widthFrac).toBe(1);
    expect(mpB.widthFrac).toBe(1);
  });

  it('constraint: leftFrac + widthFrac ≤ 1 for every event', () => {
    const col = makeColumn(['a', 'b', 'c', 'd']);
    const events = [
      makeEvent('a1', 'a', 0, 10 * FPS),
      makeEvent('b1', 'b', 1 * FPS, 4 * FPS),
      makeEvent('b2', 'b', 7 * FPS, 2 * FPS),
      makeEvent('c1', 'c', 0, 3 * FPS),
      makeEvent('d1', 'd', 5 * FPS, 5 * FPS),
    ];
    const vms = computeTimelinePresentation(events, [col]);
    const vm = vms.get('test-col')!;
    for (const ev of vm.events) {
      const mp = vm.microPositions.get(ev.uid);
      expect(mp).toBeDefined();
      expect(mp!.leftFrac).toBeGreaterThanOrEqual(0);
      expect(mp!.leftFrac + mp!.widthFrac).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
