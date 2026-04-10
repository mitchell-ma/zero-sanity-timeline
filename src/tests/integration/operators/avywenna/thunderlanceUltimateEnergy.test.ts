/**
 * @jest-environment jsdom
 */

/**
 * Avywenna — Ultimate Energy Recovery from Thunderlance Throws
 *
 * Each thrown lance recovers UE via the Expedited Delivery talent:
 *   (TALENT_LEVEL[talentLv] + POTENTIAL[pot]) × applied count
 *
 * At default loadout (talentOneLevel=3→clamped index 2→4, potential=5→index 5→2):
 *   Per-lance UE = 4 + 2 = 6
 *
 * Combo throws 3 thunderlances → 6 × 3 = 18 UE
 * ULT throws 1 thunderlance EX → 6 × 1 = 6 UE
 * BS consumes thunderlances → 6 per consume (conditional, same talent formula)
 * BS consumes thunderlance EX → 6 per consume (conditional, same talent formula)
 *
 * Verification layers:
 *   Controller: resourceGraphs UE values at key frames
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { InteractionModeType } from '../../../../consts/enums';
import { ultimateGraphKey } from '../../../../model/channels';
import { FPS } from '../../../../utils/timeline';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AVYWENNA_ID: string = require(
  '../../../../model/game-data/operators/avywenna/avywenna.json',
).id;
const THUNDERLANCE_PIERCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-pierce.json',
).properties.id;
const THUNDERLANCE_EX_PIERCE_STATUS_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-ex-pierce.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const SLOT_INDEX = 0;

// At default loadout: talentOneLevel=3 (clamped → index 2 → 4), potential=5 (index 5 → 2)
const UE_PER_LANCE = 4 + 2; // 6

beforeEach(() => {
  localStorage.clear();
});

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, AVYWENNA_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

/** Get the max UE value in a frame range. */
function getMaxUeInRange(app: AppResult, startFrame: number, endFrame: number) {
  const graph = app.resourceGraphs.get(ultimateGraphKey(SLOT));
  if (!graph) return 0;
  let max = 0;
  for (const p of graph.points) {
    if (p.frame >= startFrame && p.frame <= endFrame) {
      max = Math.max(max, p.value);
    }
  }
  return max;
}

/** Get UE value at a specific frame (last point at or before frame). */
function getUeAtFrame(app: AppResult, frame: number) {
  const graph = app.resourceGraphs.get(ultimateGraphKey(SLOT));
  if (!graph) return 0;
  let value = 0;
  for (const p of graph.points) {
    if (p.frame <= frame) value = p.value;
    else break;
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Combo — throws 3 thunderlances → 18 UE
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Combo thunderlance UE recovery', () => {
  it('A1: combo recovers (talent + potential) × 3 UE', () => {
    const { result } = setup();

    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    expect(comboCol).toBeDefined();

    const ueBefore = getUeAtFrame(result.current, 5 * FPS);

    const payload = getMenuPayload(result.current, comboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const combos = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.COMBO,
    );
    expect(combos).toHaveLength(1);

    const comboStart = combos[0].startFrame;
    const comboDuration = combos[0].segments.reduce((s, seg) => s + seg.properties.duration, 0);
    const ueAfter = getMaxUeInRange(result.current, comboStart, comboStart + comboDuration);

    expect(ueAfter - ueBefore).toBe(UE_PER_LANCE * 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Ultimate — throws 1 thunderlance EX → 6 UE
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Ultimate thunderlance EX UE recovery', () => {
  it('B1: ultimate recovers (talent + potential) × 1 UE after consuming energy', () => {
    const { result } = setup();

    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    const payload = getMenuPayload(result.current, ultCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);

    // UE consumed to 0 at ult start, hit frame RECOVER adds back 6
    const ultEnd = ults[0].startFrame + ults[0].segments.reduce((s, seg) => s + seg.properties.duration, 0);
    const ueAtEnd = getUeAtFrame(result.current, ultEnd);

    expect(ueAtEnd).toBe(UE_PER_LANCE * 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. BS consumes Thunderlances → PIERCE status recovers UE per lance
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. PIERCE status UE recovery', () => {
  it('C1: BS after combo recovers (talent + potential) × (# PIERCE stacks) UE via pierces', () => {
    const { result } = setup();

    const comboCol = findColumn(result.current, SLOT, NounType.COMBO);
    act(() => {
      const p = getMenuPayload(result.current, comboCol!, 1 * FPS);
      result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
    });
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    act(() => {
      const p = getMenuPayload(result.current, bsCol!, 4 * FPS);
      result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
    });

    const pierceEvents = result.current.allProcessedEvents.filter(
      ev => ev.id === THUNDERLANCE_PIERCE_STATUS_ID,
    );
    expect(pierceEvents).toHaveLength(3);

    // Count raw UE gain jumps exactly equal to UE_PER_LANCE at a pierce start frame.
    const graph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
    const pierceFrames = new Set(pierceEvents.map(p => p.startFrame));
    let lanceJumps = 0;
    for (let i = 1; i < (graph?.points.length ?? 0); i++) {
      const prev = graph!.points[i - 1];
      const cur = graph!.points[i];
      if (!pierceFrames.has(cur.frame)) continue;
      if (Math.abs((cur.value - prev.value) - UE_PER_LANCE) < 1e-6) lanceJumps++;
    }
    expect(lanceJumps).toBe(pierceEvents.length);
  });

  it('C2: BS after ult recovers (talent + potential) × 1 UE via the EX_PIERCE event', () => {
    const { result } = setup();

    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    act(() => {
      const p = getMenuPayload(result.current, ultCol!, 1 * FPS);
      result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
    });
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE);
    act(() => {
      const p = getMenuPayload(result.current, bsCol!, 5 * FPS);
      result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
    });

    const pierceEvents = result.current.allProcessedEvents.filter(
      ev => ev.id === THUNDERLANCE_EX_PIERCE_STATUS_ID,
    );
    expect(pierceEvents).toHaveLength(1);

    const graph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
    const pierceFrames = new Set(pierceEvents.map(p => p.startFrame));
    let lanceJumps = 0;
    for (let i = 1; i < (graph?.points.length ?? 0); i++) {
      const prev = graph!.points[i - 1];
      const cur = graph!.points[i];
      if (!pierceFrames.has(cur.frame)) continue;
      if (Math.abs((cur.value - prev.value) - UE_PER_LANCE) < 1e-6) lanceJumps++;
    }
    expect(lanceJumps).toBe(pierceEvents.length);
  });
});
