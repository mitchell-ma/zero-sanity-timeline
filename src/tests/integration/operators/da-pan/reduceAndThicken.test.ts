/**
 * @jest-environment jsdom
 */

/**
 * Da Pan — Reduce and Thicken (T1) Integration Tests
 *
 * Reduce and Thicken is a self-applying talent: the talent file itself holds the
 * clause (APPLY STAT PHYSICAL DAMAGE_BONUS by talent level) and is triggered by
 * consuming a Vulnerable infliction. No separate status file.
 *
 * Mechanics:
 *   - Trigger:  THIS OPERATOR CONSUME STATUS INFLICTION VULNERABLE (>= 1 stack)
 *   - Effect:   APPLY THIS EVENT to THIS OPERATOR with stacks = STACKS CONSUMED
 *   - Duration: 10s per stack
 *   - Stacks:   limit 4, RESET interaction
 *   - Stat:     PHYSICAL DAMAGE_BONUS VARY_BY TALENT_LEVEL [0, 0.04, 0.06]
 *
 * Trigger path in Da Pan's kit:
 *   CS (MORE SPICE!) → applies CRUSH to enemy → internally consumes ALL active
 *   Vulnerable stacks → CONSUME VULNERABLE trigger fires with consumedStacks=N
 *   → APPLY THIS EVENT with stacks=N creates N Reduce and Thicken events
 *   (one per stack per engine convention "clause APPLY values are per-stack").
 *
 * Each BS applies 1 Vulnerable (no consume). Stacking Vulnerable before CS
 * controls how many stacks the CS consumes in one shot.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType, AdjectiveType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  EventStatusType,
  InteractionModeType,
  StackInteractionType,
  PhysicalInflictionType,
} from '../../../../consts/enums';
import { StatType } from '../../../../model/enums/stats';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const DA_PAN_JSON = require('../../../../model/game-data/operators/da-pan/da-pan.json');
const DA_PAN_ID: string = DA_PAN_JSON.id;
const TALENT_JSON = require('../../../../model/game-data/operators/da-pan/talents/talent-reduce-and-thicken-talent.json');
const TALENT_ID: string = TALENT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_DA_PAN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupDaPan() {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT_DA_PAN, DA_PAN_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });
  return view;
}

function setTalentLevel(result: { current: AppResult }, level: number) {
  const props = result.current.loadoutProperties[SLOT_DA_PAN];
  act(() => {
    result.current.handleStatsChange(SLOT_DA_PAN, {
      ...props,
      operator: { ...props.operator, talentOneLevel: level },
    });
  });
}

function placeBS(result: { current: AppResult }, atSecond: number) {
  const col = findColumn(result.current, SLOT_DA_PAN, NounType.BATTLE);
  const p = getMenuPayload(result.current, col!, atSecond * FPS);
  act(() => {
    result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
  });
}

function placeCS(result: { current: AppResult }, atSecond: number) {
  const col = findColumn(result.current, SLOT_DA_PAN, NounType.COMBO);
  const p = getMenuPayload(result.current, col!, atSecond * FPS);
  act(() => {
    result.current.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill);
  });
}

function getRTEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerEntityId === SLOT_DA_PAN && ev.name === TALENT_ID,
  );
}

function getActiveAt(events: ReturnType<typeof getRTEvents>, frame: number) {
  return events.filter((ev) => {
    if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) return false;
    const end = ev.startFrame + eventDuration(ev);
    return ev.startFrame <= frame && frame < end;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Talent JSON shape — self-applying pattern
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Reduce and Thicken JSON', () => {
  it('A1: onTriggerClause effect is APPLY THIS EVENT to THIS OPERATOR with stacks=CONSUMED', () => {
    const ef = TALENT_JSON.onTriggerClause[0].effects[0];
    expect(ef.verb).toBe(VerbType.APPLY);
    expect(ef.object).toBe(NounType.EVENT);
    expect(ef.objectDeterminer).toBe('THIS');
    expect(ef.to).toBe(NounType.OPERATOR);
    expect(ef.toDeterminer).toBe('THIS');
    expect(ef.with.stacks).toEqual({
      verb: VerbType.IS,
      object: NounType.STACKS,
      objectQualifier: AdjectiveType.CONSUMED,
    });
  });

  it('A2: trigger condition is CONSUME VULNERABLE INFLICTION with stacks >= 1', () => {
    const cond = TALENT_JSON.onTriggerClause[0].conditions[0];
    expect(cond.verb).toBe(VerbType.CONSUME);
    expect(cond.objectId).toBe(NounType.INFLICTION);
    expect(cond.objectQualifier).toBe(PhysicalInflictionType.VULNERABLE);
    expect(cond.with.stacks.value).toBe(1);
  });

  it('A3: clause applies PHYSICAL DAMAGE_BONUS by talent level [0, 0.04, 0.06]', () => {
    const ef = TALENT_JSON.segments[0].clause[0].effects[0];
    expect(ef.verb).toBe(VerbType.APPLY);
    expect(ef.object).toBe(NounType.STAT);
    expect(ef.objectId).toBe(StatType.DAMAGE_BONUS);
    expect(ef.objectQualifier).toBe(AdjectiveType.PHYSICAL);
    expect(ef.with.value.object).toBe(NounType.TALENT_LEVEL);
    expect(ef.with.value.value).toEqual([0, 0.04, 0.06]);
  });

  it('A4: 10s duration, limit 4, RESET interaction', () => {
    const p = TALENT_JSON.properties;
    expect(p.duration.value.value).toBe(10);
    expect(p.stacks.limit.value).toBe(4);
    expect(p.stacks.interactionType).toBe(StackInteractionType.RESET);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Trigger path via CS → CRUSH → CONSUME VULNERABLE
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Reduce and Thicken trigger', () => {
  it('B1: no Vulnerable to consume (no BS) → CS does not trigger RT', () => {
    const { result } = setupDaPan();
    placeCS(result, 2);
    expect(getRTEvents(result.current)).toHaveLength(0);
  });

  it('B2: BS+CS (consume 1) → 1 RT stack at 10s duration', () => {
    const { result } = setupDaPan();
    placeBS(result, 2);
    placeCS(result, 6);

    const rts = getRTEvents(result.current);
    expect(rts.length).toBe(1);
    expect(eventDuration(rts[0])).toBe(10 * FPS);
    expect(rts[0].consumedStacks).toBe(1);
  });

  it('B3: CS consumes N Vulnerable → applies N RT stacks (one event per stack)', () => {
    const { result } = setupDaPan();
    placeBS(result, 2);
    placeBS(result, 4);
    placeBS(result, 6);
    placeCS(result, 10);

    const rts = getRTEvents(result.current);
    // 3 consumed → 3 events (engine applies per-stack)
    expect(rts.length).toBe(3);
    for (const ev of rts) {
      expect(ev.consumedStacks).toBe(3);
      expect(eventDuration(ev)).toBe(10 * FPS);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Stacking limit (4) + RESET behavior
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Reduce and Thicken stacking + RESET', () => {
  it('C1: single CS consuming 4 Vulnerable → caps at 4 active stacks', () => {
    const { result } = setupDaPan();
    for (let i = 0; i < 4; i++) placeBS(result, 2 + i * 2);
    placeCS(result, 12);

    const rts = getRTEvents(result.current);
    expect(rts.length).toBe(4);

    // Find a frame shortly after CS Crush frame (CS placed at t=12s, Crush at +1.26s)
    const checkFrame = 14 * FPS;
    const active = getActiveAt(rts, checkFrame);
    expect(active.length).toBe(4);
  });

  it('C2: single CS consuming 5 Vulnerable → caps at 4 events applied (limit honored)', () => {
    const { result } = setupDaPan();
    for (let i = 0; i < 5; i++) placeBS(result, 2 + i * 2);
    placeCS(result, 14);

    const rts = getRTEvents(result.current);
    // 5 consumed at the same frame, but stacks.limit=4 caps the per-frame
    // APPLY count — the 5th per-stack APPLY is rejected since there's no
    // earlier stack to RESET against (all arrive simultaneously).
    expect(rts.length).toBe(4);

    const active = getActiveAt(rts, 16 * FPS);
    expect(active.length).toBe(4);
  });

  it('C3: two CS waves → later CS resets oldest stacks from first wave', () => {
    const { result } = setupDaPan();
    // Wave 1: BS×2, CS at t=5 → 2 RT stacks alive from ~t=6 to t=16
    placeBS(result, 2);
    placeBS(result, 3);
    placeCS(result, 5);

    // Wave 2: within the RT duration window, more BS then CS
    // At t=9 we do BS×4 to get 4 Vulnerable, then CS at t=12 → 4 more RT stacks.
    // Total attempted active: 2 (wave 1) + 4 (wave 2) = 6, cap=4 → RESET drops oldest.
    placeBS(result, 9);
    placeBS(result, 10);
    placeBS(result, 11);
    placeBS(result, 12);
    placeCS(result, 14);

    const rts = getRTEvents(result.current);
    // Total events applied: 2 + 4 = 6
    expect(rts.length).toBe(6);

    // Shortly after wave-2 Crush, active count is capped at 4
    const checkFrame = 16 * FPS;
    const active = getActiveAt(rts, checkFrame);
    expect(active.length).toBe(4);

    // At least the 2 oldest (wave 1, started before t=9s) must be marked
    // CONSUMED/REFRESHED or have been clamped (ended) because RESET replaced them.
    const waveOneStacks = rts.filter((ev) => ev.startFrame < 9 * FPS);
    expect(waveOneStacks.length).toBe(2);
    for (const old of waveOneStacks) {
      const end = old.startFrame + (old.segments[0]?.properties.duration ?? 0);
      const cleared = old.eventStatus === EventStatusType.CONSUMED
        || old.eventStatus === EventStatusType.REFRESHED
        || end <= checkFrame;
      expect(cleared).toBe(true);
    }
  });

  it('C4: after all RT stacks expire (10s duration), next wave is fresh', () => {
    const { result } = setupDaPan();

    // Wave 1 at t=2–6 → CS at 8 applies 3 RT stacks ending ~t=19
    placeBS(result, 2);
    placeBS(result, 4);
    placeBS(result, 6);
    placeCS(result, 8);

    // Wave 2 at t=30 → new RT stack starts fresh
    placeBS(result, 28);
    placeCS(result, 31);

    const rts = getRTEvents(result.current);
    const activeAt33 = getActiveAt(rts, 33 * FPS);
    // Only wave-2 stacks survive at t=33s (wave-1 ended by t=19)
    expect(activeAt33.length).toBe(1);
    expect(activeAt33[0].startFrame).toBeGreaterThanOrEqual(28 * FPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Talent level scaling — statusValue responds to talentOneLevel
// ═══════════════════════════════════════════════════════════════════════════

describe('Da Pan — Reduce and Thicken talent level', () => {
  it('D1: statusValue monotonically scales with talent level', () => {
    const runWithLevel = (level: number): number => {
      const { result } = setupDaPan();
      setTalentLevel(result, level);
      placeBS(result, 2);
      placeCS(result, 6);
      const rts = getRTEvents(result.current);
      return rts[0]?.statusValue ?? NaN;
    };

    const v1 = runWithLevel(1);
    const v2 = runWithLevel(2);
    // Whatever the engine's 0- vs 1-indexing convention, level 2 must yield
    // a strictly larger Physical DMG Bonus than level 1, and both must come
    // from the VARY_BY array [0, 0.04, 0.06].
    expect(v2).toBeGreaterThan(v1);
    expect([0, 0.04, 0.06]).toContain(v1);
    expect([0, 0.04, 0.06]).toContain(v2);
  });
});
