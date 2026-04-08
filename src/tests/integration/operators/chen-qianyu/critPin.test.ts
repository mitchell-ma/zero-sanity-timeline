/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Crit Pin on Derived Events
 *
 * Tests that setting crit via the context menu handler on a derived Lift event
 * persists through the override store and survives pipeline re-runs.
 *
 * Setup: 2 battle skills → Vulnerable → Lift knock-down with a damage frame.
 * Then set crit on the Lift frame and verify it propagates.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  PHYSICAL_STATUS_COLUMNS,
  ENEMY_OWNER_ID,
} from '../../../../model/channels';
import { DamageType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { buildOverrideKey } from '../../../../controller/overrideController';
import { hasDealDamageClause } from '../../../../controller/timeline/clauseQueries';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  return view;
}

function addViaContextMenu(app: AppResult, slotId: string, columnId: string, atFrame: number) {
  const col = findColumn(app, slotId, columnId);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function getLiftEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerId === ENEMY_OWNER_ID,
  );
}

describe('Chen Qianyu — Crit pin on derived Lift event', () => {
  it('setting crit on Lift frame persists via override store and survives pipeline re-run', () => {
    const { result } = setupChen();

    // ── Add 2 battle skills to create Vulnerable → Lift ──
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    // ── Verify Lift event exists with a damage frame ──
    const liftEvents = getLiftEvents(result.current);
    expect(liftEvents).toHaveLength(1);
    const liftEv = liftEvents[0];
    expect(liftEv.segments[0].frames).toBeDefined();
    expect(liftEv.segments[0].frames!.length).toBeGreaterThan(0);
    expect(liftEv.segments[0].frames![0].isCrit).toBeFalsy();

    // ── Set crit via handleSetCritPins (simulates context menu "Set Crit") ──
    act(() => {
      result.current.handleSetCritPins(
        [{ eventUid: liftEv.uid, segmentIndex: 0, frameIndex: 0 }],
        true,
      );
    });

    // ── Verify crit is set on the Lift frame ──
    const liftAfterCrit = getLiftEvents(result.current);
    expect(liftAfterCrit).toHaveLength(1);
    expect(liftAfterCrit[0].segments[0].frames![0].isCrit).toBe(true);

    // ── Verify override is stored ──
    const overrideKey = buildOverrideKey(liftAfterCrit[0]);
    expect(result.current.overrides[overrideKey]).toBeDefined();
    expect(result.current.overrides[overrideKey].segments?.[0]?.frames?.[0]?.isCritical).toBe(true);

    // ── Pipeline re-run: move the first battle skill — triggers pipeline re-run, crit should persist ──
    const firstBS = result.current.allProcessedEvents.find(
      (ev) => ev.columnId === NounType.BATTLE && ev.ownerId === SLOT_CHEN && ev.startFrame === 2 * FPS,
    );
    expect(firstBS).toBeDefined();
    act(() => { result.current.handleMoveEvent(firstBS!.uid, 1 * FPS); });

    const liftAfterRerun = getLiftEvents(result.current);
    expect(liftAfterRerun).toHaveLength(1);
    expect(liftAfterRerun[0].segments[0].frames![0].isCrit).toBe(true);
  });

  it('toggling crit off removes the pin', () => {
    const { result } = setupChen();

    // Setup: 2 BS → Lift
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    const liftEv = getLiftEvents(result.current)[0];

    // Set crit
    act(() => {
      result.current.handleSetCritPins(
        [{ eventUid: liftEv.uid, segmentIndex: 0, frameIndex: 0 }],
        true,
      );
    });
    expect(getLiftEvents(result.current)[0].segments[0].frames![0].isCrit).toBe(true);

    // Toggle off
    act(() => {
      result.current.handleSetCritPins(
        [{ eventUid: getLiftEvents(result.current)[0].uid, segmentIndex: 0, frameIndex: 0 }],
        false,
      );
    });
    expect(getLiftEvents(result.current)[0].segments[0].frames![0].isCrit).toBe(false);
  });

  it('handleRandomizeCrit rolls crit for all damage frames and persists to override store', () => {
    const { result } = setupChen();

    // Add 2 BS → creates Vulnerable + Lift with damage frames
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    // Collect all crittable damage frames before rolling
    const crittableFrames: { uid: string; si: number; fi: number }[] = [];
    for (const ev of result.current.allProcessedEvents) {
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        if (!seg.frames) continue;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const f = seg.frames[fi];
          if (!hasDealDamageClause(f.clauses)) continue;
          if (f.damageType === DamageType.DAMAGE_OVER_TIME) continue;
          crittableFrames.push({ uid: ev.uid, si, fi });
        }
      }
    }
    expect(crittableFrames.length).toBeGreaterThan(0);

    // Roll crits
    act(() => { result.current.handleRandomizeCrit(); });

    // Override store should have crit pins for rolled frames
    const overrideKeys = Object.keys(result.current.overrides);
    expect(overrideKeys.length).toBeGreaterThan(0);

    // Every crittable frame should have a crit pin in the override store
    for (const { uid, si, fi } of crittableFrames) {
      const ev = result.current.allProcessedEvents.find(e => e.uid === uid)!;
      const key = buildOverrideKey(ev);
      const pin = result.current.overrides[key]?.segments?.[si]?.frames?.[fi]?.isCritical;
      expect(typeof pin).toBe('boolean');
    }

    // Derived events (Lift) should also have isCrit set on the frame
    // (runEventQueue applies crit pins to derived event frames during pipeline)
    const liftEv = getLiftEvents(result.current)[0];
    expect(typeof liftEv.segments[0].frames![0].isCrit).toBe('boolean');
  });

  it('handleRandomizeCrit clears previous pins including manual ones', () => {
    const { result } = setupChen();

    // Add 2 BS → Lift
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    // Manually pin crit on Lift frame
    const liftEv = getLiftEvents(result.current)[0];
    act(() => {
      result.current.handleSetCritPins(
        [{ eventUid: liftEv.uid, segmentIndex: 0, frameIndex: 0 }],
        true,
      );
    });
    expect(getLiftEvents(result.current)[0].segments[0].frames![0].isCrit).toBe(true);

    // Roll crits — should clear the manual pin and assign a fresh random value
    act(() => { result.current.handleRandomizeCrit(); });

    // The Lift frame should have a boolean isCrit (could be true or false — it's random)
    const liftAfterRoll = getLiftEvents(result.current)[0];
    expect(typeof liftAfterRoll.segments[0].frames![0].isCrit).toBe('boolean');

    // The old manual pin key should be replaced by the fresh roll
    const overrideKey = buildOverrideKey(liftAfterRoll);
    const pin = result.current.overrides[overrideKey]?.segments?.[0]?.frames?.[0]?.isCritical;
    expect(typeof pin).toBe('boolean');
  });

  it('removing the source event purges orphaned crit override', () => {
    const { result } = setupChen();

    // Setup: 2 BS → Lift, set crit
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 2 * FPS); });
    act(() => { addViaContextMenu(result.current, SLOT_CHEN, NounType.BATTLE, 4 * FPS); });

    const liftEv = getLiftEvents(result.current)[0];
    const overrideKey = buildOverrideKey(liftEv);

    act(() => {
      result.current.handleSetCritPins(
        [{ eventUid: liftEv.uid, segmentIndex: 0, frameIndex: 0 }],
        true,
      );
    });
    expect(result.current.overrides[overrideKey]).toBeDefined();

    // Remove the 2nd battle skill — Lift disappears (only 1 Vulnerable, no trigger)
    const secondBS = result.current.allProcessedEvents.find(
      (ev) => ev.columnId === NounType.BATTLE && ev.ownerId === SLOT_CHEN && ev.startFrame === 4 * FPS,
    );
    expect(secondBS).toBeDefined();

    act(() => { result.current.handleRemoveEvent(secondBS!.uid); });

    // Lift should be gone
    expect(getLiftEvents(result.current)).toHaveLength(0);

    // Override should be purged
    expect(result.current.overrides[overrideKey]).toBeUndefined();
  });
});
